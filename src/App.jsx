import { useState, useEffect, useCallback, useRef, lazy, Suspense } from 'react'
import { T, uid } from './config/cellars.js'
import {
  loadWines, loadDrinkLog,
  upsertWine, upsertWines, deleteWine, deleteWines, insertDrink, deleteDrink,
  insertPriceHistory, uploadImage,
  signIn, getSession, onAuthChange
} from './lib/supabase.js'

import Header from './components/Header.jsx'
import Dashboard from './components/Dashboard.jsx'
import CellarView from './components/CellarView.jsx'
import { SearchView, ListView, DrinkLogView, StatisticsView, DrinkingWindowView } from './components/Views.jsx'
import AddWineModal from './components/modals/AddWineModal.jsx'
import { DetailModal } from './components/modals/DetailModal.jsx'
import { DrinkModal } from './components/modals/DrinkModal.jsx'
import { SettingsModal } from './components/modals/SettingsModal.jsx'
import { Toast } from './components/ui.jsx'
import './index.css'

// 코드 스플리팅 — 갤러리 방문자는 앱 본체를, 앱 사용자는 갤러리를 내려받지 않는다
const SharedGallery = lazy(() => import('./components/SharedGallery.jsx'))
const BulkImportModal = lazy(() => import('./components/modals/BulkImportModal.jsx').then(m => ({ default: m.BulkImportModal })))

const Loading = ({ msg = '🍷' }) => (
  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: T.bg, color: T.gold, fontFamily: 'Cormorant Garamond, serif', fontSize: '1.4rem', letterSpacing: '0.1em' }}>
    {msg}
  </div>
)

// ── 로그인 화면 ──────────────────────────────────────────────────
function LoginScreen({ onSignedIn }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    if (!email.trim() || !password) return
    setBusy(true); setErr('')
    try {
      await signIn(email.trim(), password)
      onSignedIn()
    } catch (e) {
      setErr('로그인 실패 — 이메일/비밀번호를 확인하세요')
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', background: T.bg, padding: 24 }}>
      <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '2.4rem', color: T.gold, letterSpacing: '0.15em', marginBottom: 4 }}>CAVE</div>
      <div style={{ color: T.muted, fontSize: '0.85rem', marginBottom: 32 }}>와인 셀러 관리</div>
      <div style={{ width: '100%', maxWidth: 340, background: T.card, border: `1px solid ${T.border}`, borderRadius: 14, padding: 24 }}>
        <label style={{ display: 'block', color: T.mutedMid, fontSize: '0.75rem', marginBottom: 6 }}>이메일</label>
        <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="username"
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', marginBottom: 14, padding: '10px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.cream, fontSize: '0.9rem' }} />
        <label style={{ display: 'block', color: T.mutedMid, fontSize: '0.75rem', marginBottom: 6 }}>비밀번호</label>
        <input value={password} onChange={e => setPassword(e.target.value)} type="password" autoComplete="current-password"
          onKeyDown={e => e.key === 'Enter' && submit()}
          style={{ width: '100%', marginBottom: 18, padding: '10px 12px', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.cream, fontSize: '0.9rem' }} />
        {err && <div style={{ color: T.wineLight, fontSize: '0.78rem', marginBottom: 14 }}>{err}</div>}
        <button onClick={submit} disabled={busy || !email.trim() || !password}
          style={{ width: '100%', padding: '11px', background: busy ? T.muted : T.gold, color: T.bg, border: 'none', borderRadius: 8, fontSize: '0.9rem', fontWeight: 600, cursor: busy ? 'not-allowed' : 'pointer', letterSpacing: '0.05em' }}>
          {busy ? '로그인 중…' : '로그인'}
        </button>
      </div>
    </div>
  )
}

// 가격 필드 — 변경 시 price_history에 자동 기록
const PRICE_FIELDS = ['wineSearcherPrice', 'vivinoPrice', 'vivinoRating']

export default function App() {
  // 공개 갤러리 모드 — 로그인 없이 읽기 전용 진입
  //   ?gallery=1            → 시장가 포함 갤러리
  //   ?gallery=1&price=0    → 시장가까지 숨긴 갤러리 (구매가는 어느 쪽이든 항상 숨김)
  const _params = new URLSearchParams(window.location.search)
  const isGallery = _params.get('gallery') === '1'
  if (isGallery) return (
    <Suspense fallback={<Loading />}>
      <SharedGallery hidePrice={_params.get('price') === '0'} />
    </Suspense>
  )

  const [session, setSession]   = useState(undefined) // undefined=확인중, null=로그아웃, obj=로그인
  const [wines, setWines]       = useState([])
  const [drinkLog, setDrinkLog] = useState([])
  const [loading, setLoading]   = useState(true)
  const [syncStatus, setSyncStatus] = useState('loading')

  const [tab, setTab]         = useState('dash')
  const [cellarId, setCellarId] = useState('vindis1')

  const [modal, setModal]     = useState(null) // {type, ...data}
  const [toast, setToast]     = useState(null)

  // wines의 단일 진실 소스 — 연속 호출(moveWine 등)에서 stale closure를 막는다.
  // 모든 wines 변경은 applyWines를 통해서만 한다.
  const winesRef = useRef([])
  const applyWines = useCallback((updater) => {
    winesRef.current = typeof updater === 'function' ? updater(winesRef.current) : updater
    setWines(winesRef.current)
  }, [])

  const showToast = useCallback((msg, type = 'info', duration = 3000) => {
    setToast({ msg, type })
    setTimeout(() => setToast(null), duration)
  }, [])

  // ── 시장가 일괄 업데이트 이벤트 리스너 (1회 등록 — winesRef로 최신 상태 참조) ──
  useEffect(() => {
    const handler = async (e) => {
      const { id, wineSearcherPrice, vivinoPrice, vivinoRating } = e.detail
      if (!winesRef.current.find(w => w.id === id)) return
      const updates = {}
      if (wineSearcherPrice) updates.wineSearcherPrice = wineSearcherPrice
      if (vivinoPrice) updates.vivinoPrice = vivinoPrice
      if (vivinoRating) updates.vivinoRating = vivinoRating
      if (Object.keys(updates).length > 0) await updateWine(id, updates)
    }
    window.addEventListener('cave:priceUpdate', handler)
    return () => window.removeEventListener('cave:priceUpdate', handler)
  }, [])

  // ── 세션 확인 + 로그인 상태 구독 ───────────────────────────────
  useEffect(() => {
    getSession().then(s => setSession(s ?? null))
    const unsub = onAuthChange(s => setSession(s ?? null))
    return unsub
  }, [])

  // ── Load data (로그인 후에만) ─────────────────────────────────
  useEffect(() => {
    if (!session) return
    async function init() {
      setLoading(true)
      try {
        const [w, l] = await Promise.all([loadWines(), loadDrinkLog()])
        applyWines(w); setDrinkLog(l)
        setSyncStatus('synced')
      } catch (e) {
        console.error('Load error:', e)
        setSyncStatus('local')
        showToast('⚠ 데이터 로드 실패 — 네트워크 확인', 'error', 4000)
      }
      setLoading(false)
    }
    init()
  }, [session])

  // ── Helpers ──────────────────────────────────────────────────
  const winesIn  = (cid, slot) => wines.filter(w => w.cellarId === cid && w.slot === slot)
  const bottlesIn = (cid, slot) => winesIn(cid, slot).reduce((s, w) => s + (w.qty || 1), 0)

  // base64 dataURL 이미지는 Storage에 올리고 URL로 치환 (DB 비대화 방지).
  // 업로드 실패 시 원본 유지 — 기능은 항상 동작한다.
  async function resolveImage(w, prefix = 'wine') {
    if (w.imageUrl && w.imageUrl.startsWith('data:')) {
      try { return { ...w, imageUrl: await uploadImage(w.imageUrl, prefix) } }
      catch (e) { console.warn('[Image] Storage 업로드 실패 — 원본 유지:', e); return w }
    }
    return w
  }

  // 가격 필드가 실제로 바뀌었으면 히스토리 기록 (실패해도 본 작업에 영향 없음)
  function recordPriceHistory(base, updated, updates) {
    const changed = PRICE_FIELDS.some(k => k in updates && (updates[k] || null) !== (base[k] || null))
    if (!changed) return
    insertPriceHistory([{
      wine_id: updated.id,
      wine_searcher_price: updated.wineSearcherPrice || null,
      vivino_price: updated.vivinoPrice || null,
      vivino_rating: updated.vivinoRating || null,
      source: 'app',
    }]).catch(() => {})
  }

  // ── Wine CRUD (낙관적 업데이트 + 실패 시 롤백) ────────────────
  async function addWine(wine) {
    const w0 = { ...wine, id: wine.id || uid() }
    applyWines(p => [...p, w0])
    const w = await resolveImage(w0)
    if (w !== w0) applyWines(p => p.map(x => x.id === w.id ? w : x))
    try { await upsertWine(w); setSyncStatus('synced') }
    catch {
      applyWines(p => p.filter(x => x.id !== w0.id))
      showToast('⚠ 저장 실패 — 추가를 되돌렸습니다', 'error')
    }
  }

  async function updateWine(id, updates) {
    const base = winesRef.current.find(w => w.id === id)
    if (!base) return
    let updated = { ...base, ...updates }
    applyWines(p => p.map(w => w.id === id ? updated : w))
    updated = await resolveImage(updated)
    applyWines(p => p.map(w => w.id === id ? updated : w))
    try {
      await upsertWine(updated)
      setSyncStatus('synced')
      recordPriceHistory(base, updated, updates)
    } catch {
      applyWines(p => p.map(w => w.id === id ? base : w))
      showToast('⚠ 수정 실패 — 변경을 되돌렸습니다', 'error')
    }
  }

  async function removeWine(id) {
    const base = winesRef.current.find(w => w.id === id)
    applyWines(p => p.filter(w => w.id !== id))
    try { await deleteWine(id); setSyncStatus('synced') }
    catch {
      if (base) applyWines(p => [...p, base])
      showToast('⚠ 삭제 실패 — 되돌렸습니다', 'error')
    }
  }

  // 위치 이동 — moveQty가 전체보다 적으면 분할.
  // 목적지 칸에 같은 와인(이름+빈티지 일치)이 이미 있으면 새 레코드 대신 병 수를 합친다.
  async function moveWine(wine, toCellarId, toSlot, moveQty) {
    const total = wine.qty || 1
    const qty = Math.max(1, Math.min(parseInt(moveQty) || total, total))

    // 목적지에 동일 와인이 이미 있는지 찾기 (자기 자신 제외)
    const isSame = (a, b) =>
      (a.name || '').trim() === (b.name || '').trim() &&
      (a.vintage || null) === (b.vintage || null)
    const target = winesRef.current.find(w =>
      w.id !== wine.id &&
      w.cellarId === toCellarId &&
      String(w.slot) === String(toSlot) &&
      isSame(w, wine)
    )

    if (qty >= total) {
      // 전체 이동
      if (target) {
        // 목적지 레코드에 합치고 원본 삭제
        await updateWine(target.id, { qty: (target.qty || 1) + total })
        await removeWine(wine.id)
      } else {
        // 위치만 변경
        await updateWine(wine.id, { cellarId: toCellarId, slot: toSlot })
      }
    } else {
      // 분할 이동 — 원본 병 수 차감
      await updateWine(wine.id, { qty: total - qty })
      if (target) {
        // 목적지 레코드에 합치기
        await updateWine(target.id, { qty: (target.qty || 1) + qty })
      } else {
        // 새 위치에 별도 레코드 생성
        await addWine({ ...wine, id: uid(), qty, cellarId: toCellarId, slot: toSlot, shareToken: null })
      }
    }
    showToast(`🚚 ${qty}병 이동 완료`, 'success')
  }

  async function drinkWine(wine, record) {
    // Decrement qty (실패 시 롤백하고 기록도 중단)
    const base = winesRef.current.find(w => w.id === wine.id) || wine
    const newQty = (base.qty || 1) - 1
    if (newQty <= 0) {
      applyWines(p => p.filter(w => w.id !== wine.id))
      try { await deleteWine(wine.id); setSyncStatus('synced') }
      catch {
        applyWines(p => [...p, base])
        showToast('⚠ 차감 실패 — 되돌렸습니다', 'error')
        return
      }
    } else {
      const updated = { ...base, qty: newQty }
      applyWines(p => p.map(w => w.id === wine.id ? updated : w))
      try { await upsertWine(updated); setSyncStatus('synced') }
      catch {
        applyWines(p => p.map(w => w.id === wine.id ? base : w))
        showToast('⚠ 차감 실패 — 되돌렸습니다', 'error')
        return
      }
    }
    // Add drink record (사진은 Storage에 업로드)
    let r = { ...record, id: record.id || uid() }
    if (r.imageUrl && r.imageUrl.startsWith('data:')) {
      try { r.imageUrl = await uploadImage(r.imageUrl, 'drink') } catch { /* 원본 유지 */ }
    }
    setDrinkLog(p => [r, ...p])
    try { await insertDrink(r); showToast('🍷 음주 기록 저장됨', 'success') }
    catch { showToast('⚠ 기록 저장 실패', 'error') }
  }

  async function removeManyWines(ids) {
    const prev = winesRef.current
    applyWines(p => p.filter(w => !ids.includes(w.id)))
    try {
      await deleteWines(ids)  // 1번의 왕복으로 일괄 삭제
      setSyncStatus('synced')
      showToast(`🗑 ${ids.length}개 삭제 완료`, 'success')
    } catch {
      applyWines(() => prev)
      showToast('⚠ 삭제 실패 — 되돌렸습니다', 'error')
    }
  }

  // 비슷한 이름 묶기 — 선택된 와인들의 이름을 하나로 통일 (배열 upsert 1회)
  async function renameWines(ids, newName) {
    if (!ids.length || !newName) return
    const targets = winesRef.current.filter(w => ids.includes(w.id) && w.name !== newName)
    if (!targets.length) return
    const prev = winesRef.current
    const renamed = targets.map(w => ({ ...w, name: newName }))
    const renamedIds = new Set(targets.map(w => w.id))
    applyWines(p => p.map(w => renamedIds.has(w.id) ? { ...w, name: newName } : w))
    try {
      await upsertWines(renamed)
      setSyncStatus('synced')
      showToast(`✓ ${targets.length}개 이름 통일 완료`, 'success')
    } catch {
      applyWines(() => prev)
      showToast('⚠ 이름 통일 실패 — 되돌렸습니다', 'error')
    }
  }

  // 수준 3: 진짜 중복 병합 — 이름·빈티지·셀러·칸이 모두 같은 레코드들을 한 레코드로 합치고 병 수 합산
  async function mergeWines(ids) {
    if (!ids || ids.length < 2) return
    const group = ids.map(id => winesRef.current.find(w => w.id === id)).filter(Boolean)
    if (group.length < 2) return
    const keep = group[0]
    const totalQty = group.reduce((s, w) => s + (w.qty || 1), 0)
    const restIds = group.slice(1).map(w => w.id)
    const prev = winesRef.current
    applyWines(p => p.filter(w => !restIds.includes(w.id)).map(w => w.id === keep.id ? { ...w, qty: totalQty } : w))
    try {
      await upsertWine({ ...keep, qty: totalQty })
      await deleteWines(restIds)
      setSyncStatus('synced')
      showToast(`🔗 ${group.length}개 레코드를 ${totalQty}병으로 병합`, 'success')
    } catch {
      applyWines(() => prev)
      showToast('⚠ 병합 실패 — 되돌렸습니다', 'error')
    }
  }

  async function removeDrink(id) {
    const prev = drinkLog
    setDrinkLog(p => p.filter(r => r.id !== id))
    try { await deleteDrink(id) }
    catch { setDrinkLog(prev); showToast('⚠ 삭제 실패 — 되돌렸습니다', 'error') }
  }

  // Bulk add — 이미지 업로드 후 배열 upsert 1회
  async function addManyWines(list) {
    let ws = list.map(w => ({ ...w, id: w.id || uid() }))
    applyWines(p => [...p, ...ws])
    setModal(null)
    ws = await Promise.all(ws.map(w => resolveImage(w)))
    const byId = new Map(ws.map(w => [w.id, w]))
    applyWines(p => p.map(w => byId.get(w.id) || w))
    try {
      await upsertWines(ws)
      setSyncStatus('synced')
      showToast(`✓ ${list.length}종 추가 완료`, 'success')
    } catch {
      applyWines(p => p.filter(w => !byId.has(w.id)))
      showToast('⚠ 저장 실패 — 추가를 되돌렸습니다', 'error')
    }
  }

  // ── Modal helpers ────────────────────────────────────────────
  const openAdd    = (pre = {}) => setModal({ type: 'add', pre })
  const openDetail = (id)       => setModal({ type: 'detail', id })
  const openDrink  = (wine)     => setModal({ type: 'drink', wine })
  const goSlot     = (cid, slot) => { setCellarId(cid); setTab('cellar') }

  const detailWine = modal?.type === 'detail' ? wines.find(w => w.id === modal.id) : null

  // 세션 확인 중
  if (session === undefined) return <Loading />

  // 로그아웃 상태 → 로그인 화면
  if (session === null) return <LoginScreen onSignedIn={() => {}} />

  if (loading) return <Loading msg="🍷 셀러를 열고 있습니다..." />

  const shared = { wines, drinkLog, winesIn, bottlesIn, cellarId, setCellarId, openAdd, openDetail, openDrink, goSlot }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: T.bg }}>
      <Header
        tab={tab} setTab={setTab}
        onAdd={() => openAdd()}
        onBulk={() => setModal({ type: 'bulk' })}
        onSettings={() => setModal({ type: 'settings' })}
        syncStatus={syncStatus}
      />

      <main style={{ flex: 1, padding: '24px 28px', maxWidth: 1060, margin: '0 auto', width: '100%', paddingBottom: 100 }}>
        {tab === 'dash'   && <Dashboard {...shared} setTab={setTab} openDetail={openDetail} />}
        {tab === 'cellar' && <CellarView {...shared} onDrink={openDrink} />}
        {tab === 'drinking' && <DrinkingWindowView wines={wines} openDetail={openDetail} onUpdate={updateWine} />}
        {tab === 'log'    && <DrinkLogView drinkLog={drinkLog} onDelete={removeDrink} />}
        {tab === 'search' && <SearchView wines={wines} openDetail={openDetail} openDrink={openDrink} goSlot={goSlot} />}
        {tab === 'list'   && <ListView wines={wines} openDetail={openDetail} openDrink={openDrink} goSlot={goSlot} onDeleteMany={removeManyWines} onRename={renameWines} onMerge={mergeWines} />}
        {tab === 'stats'  && <StatisticsView wines={wines} drinkLog={drinkLog} />}
      </main>

      {/* Modals */}
      {modal?.type === 'add' && (
        <AddWineModal pre={modal.pre || {}} onAdd={async w => { await addWine(w); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'bulk' && (
        <Suspense fallback={null}>
          <BulkImportModal onAddMany={addManyWines} onClose={() => setModal(null)} />
        </Suspense>
      )}
      {modal?.type === 'settings' && (
        <SettingsModal wines={wines} drinkLog={drinkLog} onClose={() => setModal(null)} />
      )}
      {modal?.type === 'drink' && (
        <DrinkModal wine={modal.wine} onConfirm={record => { drinkWine(modal.wine, record); setModal(null) }} onClose={() => setModal(null)} />
      )}
      {detailWine && (
        <DetailModal
          wine={detailWine}
          onClose={() => setModal(null)}
          onDrink={w => { setModal({ type: 'drink', wine: w }) }}
          onRemove={async () => { await removeWine(detailWine.id); setModal(null) }}
          onUpdate={async updates => { await updateWine(detailWine.id, updates) }}
          onMove={moveWine}
          goSlot={goSlot}
        />
      )}

      {toast && <Toast message={toast.msg} type={toast.type} />}
    </div>
  )
}

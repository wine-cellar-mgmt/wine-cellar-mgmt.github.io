import { useState } from 'react'
import { cellarById, T, bottleLabel, CELLARS, DEFAULT_CELLARS } from '../../config/cellars.js'
import { signOut, saveProfile, changePassword } from '../../lib/supabase.js'
import { Btn } from '../ui.jsx'

// ── CSV 내보내기 (엑셀 호환: UTF-8 BOM + CRLF) ───────────────────
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map(r => r.map(csvEscape).join(','))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const today = () => new Date().toISOString().split('T')[0]

function exportWinesCsv(wines) {
  downloadCsv(`CAVE_와인목록_${today()}.csv`,
    ['이름', '빈티지', '수량', '용량', '타입', '셀러', '칸', '구매일', '구매가(₩)', '시장가(₩)', 'Vivino($)', 'Vivino평점', '생산자', '지역', '국가', '품종', '음용적기 시작', '음용적기 끝', '메모'],
    wines.map(w => [
      w.name, w.vintage || '', w.qty || 1, bottleLabel(w.bottleSize || 750), w.wineType || '',
      cellarById(w.cellarId)?.name || w.cellarId, w.slot, w.purchaseDate || '',
      w.price || '', w.wineSearcherPrice || '', w.vivinoPrice || '', w.vivinoRating || '',
      w.producer || '', w.region || '', w.country || '', w.grape || '',
      w.drinkingFrom || '', w.drinkingTo || '', w.notes || '',
    ]))
}

function exportDrinkLogCsv(drinkLog) {
  downloadCsv(`CAVE_음주기록_${today()}.csv`,
    ['날짜', '와인', '빈티지', '셀러', '칸', '함께한 사람', '자리', '평점', '한마디'],
    drinkLog.map(r => [
      r.date || '', r.wineName || '', r.wineVintage || '', r.cellarName || '', r.slot || '',
      r.companions || '', r.occasion || '', r.rating || '', r.review || '',
    ]))
}

// ── Settings Modal ──────────────────────────────────────────────
export function SettingsModal({ wines = [], drinkLog = [], profile = null, onProfileChange, onClose }) {
  const [loggingOut, setLoggingOut] = useState(false)
  const [rows, setRows] = useState(() => (profile?.cellars?.length ? profile.cellars : CELLARS).map(c => ({ ...c })))
  const [showWhisky, setShowWhisky] = useState(profile?.show_whisky !== false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // 셀러별 보유 병 수 — 와인이 든 셀러는 삭제를 막는다(갈 곳 잃은 와인 방지)
  const bottlesOf = id => wines.filter(w => w.cellarId === id).reduce((s, w) => s + (w.qty || 1), 0)
  const maxSlotUsed = id => wines.filter(w => w.cellarId === id)
    .reduce((m, w) => Math.max(m, parseInt(w.slot) || 0), 0)

  const setRow = (i, k, v) => setRows(p => p.map((r, j) => j === i ? { ...r, [k]: v } : r))

  function addRow() {
    setRows(p => [...p, { id: `cellar_${Date.now()}`, name: '새 셀러', slots: 6, maxPerSlot: 20 }])
  }

  function removeRow(i) {
    const r = rows[i]
    const n = bottlesOf(r.id)
    if (n > 0) { alert(`'${r.name}'에 와인 ${n}병이 있습니다. 먼저 비우거나 다른 셀러로 옮기세요.`); return }
    setRows(p => p.filter((_, j) => j !== i))
  }

  async function saveCellars() {
    const clean = rows
      .filter(r => r.name.trim())
      .map(r => ({ id: r.id, name: r.name.trim(), slots: Math.max(1, parseInt(r.slots) || 1), maxPerSlot: Math.max(1, parseInt(r.maxPerSlot) || 1) }))
    if (!clean.length) { alert('셀러를 최소 1개는 남겨두세요.'); return }
    // 칸 수를 줄일 때 사라지는 칸에 와인이 있으면 막는다
    for (const c of clean) {
      const used = maxSlotUsed(c.id)
      if (used > c.slots) { alert(`'${c.name}'의 ${used}번 칸에 와인이 있습니다. 칸 수를 ${used} 이상으로 두세요.`); return }
    }
    setSaving(true); setSaveMsg('')
    try {
      const p = await saveProfile({ cellars: clean })
      onProfileChange?.(p)
      setRows(clean.map(c => ({ ...c })))
      setSaveMsg('✓ 저장됨')
    } catch (e) {
      console.error('[Profile] 셀러 저장 실패:', e)
      setSaveMsg(`⚠ 저장 실패 — ${e.message || '알 수 없는 오류'}`)
    }
    setSaving(false)
  }

  // ── 비밀번호 변경 (로그인 상태에서 바로 변경 — 메일 발송 없음) ──
  const [pw1, setPw1] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwMsg, setPwMsg] = useState('')

  async function submitPassword() {
    if (pw1.length < 6) { setPwMsg('⚠ 6자 이상 입력하세요'); return }
    if (pw1 !== pw2)    { setPwMsg('⚠ 두 입력이 일치하지 않습니다'); return }
    setPwBusy(true); setPwMsg('')
    try {
      await changePassword(pw1)
      setPw1(''); setPw2('')
      setPwMsg('✓ 비밀번호가 변경되었습니다')
    } catch (e) {
      console.error('[Auth] 비밀번호 변경 실패:', e)
      setPwMsg(`⚠ 변경 실패 — ${e.message || '알 수 없는 오류'}`)
    }
    setPwBusy(false)
  }

  async function toggleWhisky() {
    const next = !showWhisky
    setShowWhisky(next)
    try {
      const p = await saveProfile({ show_whisky: next })
      onProfileChange?.(p)
    } catch (e) {
      console.error('[Profile] 위스키 설정 저장 실패:', e)
      setShowWhisky(!next)
    }
  }

  async function handleLogout() {
    setLoggingOut(true)
    await signOut()
    // onAuthChange 리스너가 로그인 화면으로 전환
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.3rem', color: T.cream }}>⚙️ 설정</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '1.2rem' }}>✕</button>
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: '0.8rem', color: T.text, lineHeight: 1.6 }}>
          <strong style={{ color: T.gold }}>AI 기능</strong> (와인 정보 검색, 사진 일괄 입력)은<br />
          서버를 통해 안전하게 처리됩니다.<br />
          <span style={{ color: T.muted, fontSize: '0.75rem' }}>API 키는 더 이상 기기에 저장되지 않습니다.</span>
        </div>

        {/* CSV 내보내기 — 엑셀에서 바로 열 수 있음 (UTF-8 BOM) */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>📥 내보내기 (CSV · 엑셀 호환)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => exportWinesCsv(wines)} disabled={wines.length === 0}
              style={{ background: T.gold + '22', color: T.gold, border: `1px solid ${T.gold}44`, borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: wines.length ? 'pointer' : 'not-allowed', opacity: wines.length ? 1 : 0.5 }}>
              🍷 와인 목록 ({wines.length}종)
            </button>
            <button onClick={() => exportDrinkLogCsv(drinkLog)} disabled={drinkLog.length === 0}
              style={{ background: T.wine + '22', color: T.wineLight, border: `1px solid ${T.wine}66`, borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: drinkLog.length ? 'pointer' : 'not-allowed', opacity: drinkLog.length ? 1 : 0.5 }}>
              🥂 음주 기록 ({drinkLog.length}건)
            </button>
          </div>
          <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: 8 }}>엑셀에서 바로 열립니다. 보험·자산 기록용으로 활용하세요.</div>
        </div>

        {/* 셀러 구성 — 계정마다 다르다 (profiles.cellars) */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>🍾 내 셀러 관리</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px 58px 28px', gap: 6, fontSize: '0.66rem', color: T.muted, marginBottom: 6 }}>
            <span>이름</span><span>칸 수</span><span>칸당 병</span><span />
          </div>
          {rows.map((r, i) => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '1fr 58px 58px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
              <input value={r.name} onChange={e => setRow(i, 'name', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 8px' }} />
              <input type="number" min="1" value={r.slots} onChange={e => setRow(i, 'slots', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 6px' }} />
              <input type="number" min="1" value={r.maxPerSlot} onChange={e => setRow(i, 'maxPerSlot', e.target.value)} style={{ fontSize: '0.8rem', padding: '6px 6px' }} />
              <button onClick={() => removeRow(i)} title={bottlesOf(r.id) ? `와인 ${bottlesOf(r.id)}병 보유 — 삭제 불가` : '삭제'}
                style={{ background: 'none', border: 'none', color: bottlesOf(r.id) ? T.border : T.muted, fontSize: '0.9rem', cursor: bottlesOf(r.id) ? 'not-allowed' : 'pointer' }}>✕</button>
            </div>
          ))}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}>
            <button onClick={addRow} style={{ background: T.card, color: T.gold, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 12px', fontSize: '0.76rem', cursor: 'pointer' }}>+ 셀러 추가</button>
            <Btn variant="gold" size="sm" onClick={saveCellars} disabled={saving}>{saving ? '저장 중…' : '셀러 저장'}</Btn>
            {saveMsg && <span style={{ fontSize: '0.72rem', color: saveMsg.startsWith('✓') ? '#4a8a5e' : T.wineLight }}>{saveMsg}</span>}
          </div>
          <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: 8 }}>와인이 들어 있는 셀러·칸은 삭제하거나 줄일 수 없습니다.</div>
        </div>

        {/* 위스키 기능 표시 — 끄면 위스키 입력 UI가 숨겨진다 (기록은 그대로 보존) */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <div>
            <div style={{ fontSize: '0.82rem', color: T.cream, fontWeight: 600 }}>🥃 위스키 기능</div>
            <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: 3 }}>끄면 와인 추가·일괄 입력의 종류 선택이 숨겨집니다.</div>
          </div>
          <button onClick={toggleWhisky} style={{
            flexShrink: 0, width: 46, height: 26, borderRadius: 13, cursor: 'pointer',
            border: `1px solid ${showWhisky ? T.gold : T.border}`,
            background: showWhisky ? T.gold + '33' : T.card, position: 'relative', transition: 'background 0.15s',
          }}>
            <span style={{ position: 'absolute', top: 3, left: showWhisky ? 23 : 3, width: 18, height: 18, borderRadius: '50%', background: showWhisky ? T.gold : T.muted, transition: 'left 0.15s' }} />
          </button>
        </div>

        {/* 비밀번호 변경 — 로그인한 본인이 직접 바꾼다 */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>🔑 비밀번호 변경</div>
          <input type="password" value={pw1} onChange={e => { setPw1(e.target.value); setPwMsg('') }}
            placeholder="새 비밀번호 (6자 이상)" autoComplete="new-password"
            style={{ width: '100%', marginBottom: 8, fontSize: '0.82rem', padding: '8px 10px' }} />
          <input type="password" value={pw2} onChange={e => { setPw2(e.target.value); setPwMsg('') }}
            placeholder="새 비밀번호 확인" autoComplete="new-password"
            onKeyDown={e => e.key === 'Enter' && submitPassword()}
            style={{ width: '100%', marginBottom: 10, fontSize: '0.82rem', padding: '8px 10px' }} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Btn variant="gold" size="sm" onClick={submitPassword} disabled={pwBusy || !pw1 || !pw2}>
              {pwBusy ? '변경 중…' : '비밀번호 변경'}
            </Btn>
            {pwMsg && <span style={{ fontSize: '0.72rem', color: pwMsg.startsWith('✓') ? '#4a8a5e' : T.wineLight }}>{pwMsg}</span>}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? '로그아웃 중…' : '🚪 로그아웃'}</Btn>
          <Btn variant="gold" onClick={onClose}>닫기</Btn>
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useMemo } from 'react'
import { CELLARS, getSlots, cellarById, T, krw, kdate, BOTTLE_SIZES, bottleBadge, isWhisky, openedBadge, priceGuardText } from '../../config/cellars.js'
import { callProxy, loadPriceHistory } from '../../lib/supabase.js'
import { Btn, lbl, ImagePicker } from '../ui.jsx'

// ── 가격 추이 그래프 (price_history 기반) ────────────────────────
// 시장가(₩) 변동을 SVG 라인으로 표시. 기록이 2건 이상일 때만 노출.
// 구매가가 있으면 점선 기준선으로 함께 표시한다.
function PriceHistoryChart({ wine }) {
  const [history, setHistory] = useState(null)

  useEffect(() => {
    let alive = true
    loadPriceHistory(wine.id)
      .then(h => { if (alive) setHistory(h) })
      .catch(() => { if (alive) setHistory([]) })
    return () => { alive = false }
  }, [wine.id])

  const series = useMemo(() => {
    if (!history) return []
    const byDate = {}
    history.forEach(h => {
      const v = Number(h.wine_searcher_price)
      if (v > 0) byDate[h.recorded_at] = v // 같은 날짜는 마지막 기록 사용
    })
    return Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0]))
  }, [history])

  if (series.length < 2) return null

  const W = 400, H = 130, PAD = { l: 8, r: 8, t: 16, b: 22 }
  const values = series.map(([, v]) => v)
  const purchase = wine.price > 0 ? wine.price : null
  const domain = purchase ? [...values, purchase] : values
  let min = Math.min(...domain), max = Math.max(...domain)
  if (min === max) { min *= 0.95; max *= 1.05 }
  const span = max - min
  min -= span * 0.08; max += span * 0.08

  const x = i => PAD.l + (i / (series.length - 1)) * (W - PAD.l - PAD.r)
  const y = v => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b)
  const points = series.map(([, v], i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')

  const first = values[0], last = values[values.length - 1]
  const diff = last - first
  const diffRate = first > 0 ? (diff / first * 100) : 0
  const fmtDate = d => `${d.slice(2, 4)}.${d.slice(5, 7)}`
  const kshort = n => n >= 100000000 ? `${(n / 100000000).toFixed(1)}억` : n >= 10000 ? `${Math.round(n / 10000)}만` : String(n)

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <div style={{ fontSize: '0.66rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>📈 시장가 추이</div>
        <div style={{ fontSize: '0.72rem', fontWeight: 700, color: diff >= 0 ? '#4a8a5e' : '#c0392b' }}>
          {diff >= 0 ? '+' : ''}{krw(diff)} ({diffRate >= 0 ? '+' : ''}{diffRate.toFixed(1)}%)
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {/* 구매가 기준선 */}
        {purchase && purchase >= min && purchase <= max && (
          <>
            <line x1={PAD.l} y1={y(purchase)} x2={W - PAD.r} y2={y(purchase)} stroke={T.muted} strokeWidth="1" strokeDasharray="4 3" />
            <text x={W - PAD.r} y={y(purchase) - 4} textAnchor="end" fontSize="9" fill={T.muted}>구매가 ₩{kshort(purchase)}</text>
          </>
        )}
        {/* 시장가 라인 + 점 */}
        <polyline points={points} fill="none" stroke={T.gold} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {series.map(([, v], i) => (
          <circle key={i} cx={x(i)} cy={y(v)} r={i === series.length - 1 ? 3.5 : 2.5} fill={i === series.length - 1 ? T.gold : T.card} stroke={T.gold} strokeWidth="1.5" />
        ))}
        {/* 처음/마지막 값 라벨 */}
        <text x={x(0)} y={y(first) - 7} textAnchor="start" fontSize="9.5" fill={T.mutedMid}>₩{kshort(first)}</text>
        <text x={x(series.length - 1)} y={y(last) - 7} textAnchor="end" fontSize="9.5" fill={T.gold} fontWeight="700">₩{kshort(last)}</text>
        {/* 날짜 축 */}
        <text x={PAD.l} y={H - 6} textAnchor="start" fontSize="9" fill={T.muted}>{fmtDate(series[0][0])}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="9" fill={T.muted}>{fmtDate(series[series.length - 1][0])}</text>
      </svg>
      <div style={{ fontSize: '0.64rem', color: T.muted, marginTop: 4 }}>매달 6일 자동 갱신 + 앱에서 가격을 바꿀 때마다 기록됩니다 · {series.length}회 기록</div>
    </div>
  )
}

// ── Detail Modal ────────────────────────────────────────────────
export function DetailModal({ wine, drinkLog = [], onClose, onDrink, onRemove, onUpdate, onMove, goSlot }) {
  const whisky = isWhisky(wine)
  // 이 병의 시음 세션 기록 (위스키 — 최신순)
  const sessions = useMemo(
    () => whisky ? drinkLog.filter(r => r.wineId === wine.id) : [],
    [whisky, drinkLog, wine.id]
  )
  const [editing, setEditing] = useState(false)
  const [moving, setMoving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [imgZoom, setImgZoom] = useState(false) // 이미지 확대 보기 (라이트박스)
  const [form, setForm] = useState({ ...wine })
  const [aiLoad, setAiLoad] = useState(false)
  const [imgSearching, setImgSearching] = useState(false)  // 라벨 이미지 AI 재검색
  const [imgErr, setImgErr] = useState(false)
  // 위치 이동 전용 상태 (전체 수정 폼과 분리)
  const [moveCellar, setMoveCellar] = useState(wine.cellarId)
  const [moveSlot, setMoveSlot] = useState(wine.slot)
  const [moveQty, setMoveQty] = useState(wine.qty || 1)
  const setF = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const c = cellarById(wine.cellarId)
  const curCellar = cellarById(form.cellarId)
  const moveCellarObj = cellarById(moveCellar)

  function startMove() {
    // 항상 현재 위치·전체 병 수에서 시작
    setMoveCellar(wine.cellarId)
    setMoveSlot(wine.slot)
    setMoveQty(wine.qty || 1)
    setMoving(true)
  }

  function saveMove(qty) {
    if (onMove) {
      // 분할 이동 지원 (일부 병만 새 위치로)
      onMove(wine, moveCellar, moveSlot, qty)
    } else {
      // onMove 미전달 시 폴백: 전체 이동
      onUpdate({ ...wine, cellarId: moveCellar, slot: moveSlot })
    }
    setMoving(false)
  }

  async function runAI() {
    if (!form.name?.trim()) return
    setAiLoad(true)
    try {
      const q = form.vintage ? `${form.name} ${form.vintage}` : form.name
      const prompt = whisky
        ? `위스키 "${q}"의 정보를 웹에서 검색하여 JSON만 반환 (마크다운 없이):
{"producer":"증류소","region":"지역(예: Speyside)","country":"국가","description":"한국어 2문장","abv":null,"ageYears":null,"bottleSize":null,"vivinoPrice":null,"wineSearcherPrice":null}

bottleSize: 이 제품이 실제로 판매되는 병 용량을 ml 정수로 (예: 700, 750, 500, 300, 1000).
- 로얄살루트 32년처럼 500ml로만 나오는 제품, 고량주·백주 소용량(300/500ml) 등 제품별 실제 규격 확인
- 여러 규격이 있으면 가장 일반적인 것, 확실하지 않으면 null

가격 수집 (700ml 기준):
- whiskybase.com / thewhiskyexchange.com
- dailyshot.co.kr 등 한국 판매가 KRW
- USD/GBP → 현재 환율 KRW 환산

${priceGuardText(form.wineSearcherPrice)}
글로벌 USD → vivinoPrice
abv는 도수 숫자, ageYears는 숙성연수 숫자(NAS면 null)
숫자만, 모르면 null`
        : `와인 "${q}"의 정보를 웹에서 검색하여 JSON만 반환 (마크다운 없이):
{"producer":"생산자명","region":"지역명","country":"국가명","grape":"품종","description":"한국어 2문장","bottleSize":null,"vivinoPrice":null,"vivinoRating":null,"wineSearcherPrice":null}

bottleSize: 병 용량 ml 정수(일반 와인 750, 매그넘 1500, 하프 375). 확실하지 않으면 null

가격 수집 (750ml 기준):
- wine-searcher.com 한국 KRW
- dailyshot.co.kr KRW
- vivino.com USD → 현재 환율 KRW 환산

${priceGuardText(form.wineSearcherPrice)}
vivino USD 원본 → vivinoPrice
숫자만, 모르면 null`
      const data = await callProxy([{ role: 'user', content: prompt }],
        2000, [{ type: 'web_search_20250305', name: 'web_search' }])
      const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}'
      const cleaned = text.replace(/```json|```/g, '').trim()
      const match = cleaned.match(/\{[\s\S]*\}/)
      if (match) {
        const info = JSON.parse(match[0])
        // 병 용량은 100~5000ml 범위만 신뢰 — 그 밖이면 기존 값 유지
        const bs = parseInt(String(info.bottleSize))
        if (!(bs >= 100 && bs <= 5000)) delete info.bottleSize
        setForm(p => ({ ...p, ...info }))
      }
    } catch(e) {
      console.error('[EditAI]', e)
    }
    setAiLoad(false)
  }

  // 라벨 이미지만 다시 찾기 — 일괄 입력에서 크롭이 뒤바뀐 경우 등에 사용
  async function searchImage() {
    if (!form.name?.trim()) return
    setImgSearching(true)
    setImgErr(false)
    try {
      const q = form.vintage ? `${form.name} ${form.vintage}` : form.name
      const prompt = `${whisky ? '위스키' : '와인'} "${q}"의 공식 제품(라벨/보틀) 이미지 URL을 웹에서 찾아 JSON만 반환 (마크다운 없이):
{"imageUrl":"이미지URL또는빈문자열"}

- 반드시 해당 제품 본인의 이미지여야 한다(다른 빈티지·다른 제품 금지)
- .jpg / .jpeg / .png / .webp 로 끝나는 직접 접근 가능한 이미지 URL
- 판매처·생산자 공식 사이트 이미지 우선, 못 찾으면 빈 문자열
응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
      const data = await callProxy([{ role: 'user', content: prompt }],
        2000, [{ type: 'web_search_20250305', name: 'web_search' }])
      const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}'
      const cleaned = text.replace(/```json|```/g, '').trim()
      const candidates = cleaned.match(/\{[^{}]*\}/g) || []
      let info = null
      for (let k = candidates.length - 1; k >= 0; k--) {
        try { info = JSON.parse(candidates[k]); break } catch { /* 다음 후보 */ }
      }
      if (info?.imageUrl) setF('imageUrl', info.imageUrl)
      else setImgErr(true)
    } catch (e) {
      console.error('[EditImageAI]', e)
      setImgErr(true)
    }
    setImgSearching(false)
  }

  function saveEdit() {
    onUpdate({
      ...form,
      vintage: parseInt(String(form.vintage)) || null,
      qty: parseInt(String(form.qty)) || 1,
      price: parseInt(String(form.price || '0').replace(/,/g, '')) || 0,
      abv: whisky ? (parseFloat(String(form.abv)) || null) : null,
      ageYears: whisky ? (parseInt(String(form.ageYears)) || null) : null,
    })
    setEditing(false)
  }

  const G = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }

  if (editing) return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.3rem', color: T.cream, marginBottom: 20 }}>{whisky ? '위스키 수정' : '와인 수정'}</h2>
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{whisky ? '위스키 이름' : '와인 이름'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={form.name} onChange={e => setF('name', e.target.value)} style={{ flex: 1 }} />
            <button onClick={runAI} disabled={aiLoad || !form.name?.trim()} style={{
              background: aiLoad || !form.name?.trim() ? T.muted : T.gold,
              color: T.bg, border: 'none', borderRadius: 8, padding: '9px 14px',
              fontSize: '0.8rem', fontWeight: 600,
              cursor: aiLoad || !form.name?.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{aiLoad ? '검색 중...' : '🔍 AI 검색'}</button>
          </div>
        </div>
        {whisky ? (
          <>
            <div style={G}>
              <div><label style={lbl}>숙성연수 (년)</label><input value={form.ageYears || ''} onChange={e => setF('ageYears', e.target.value)} type="number" placeholder="NAS면 비움" /></div>
              <div><label style={lbl}>도수 (%)</label><input value={form.abv || ''} onChange={e => setF('abv', e.target.value)} type="number" step="0.1" /></div>
            </div>
            <div style={G}>
              <div><label style={lbl}>수량</label><input value={form.qty || 1} onChange={e => setF('qty', e.target.value)} type="number" min="1" /></div>
              <div></div>
            </div>
          </>
        ) : (
          <div style={G}>
            <div><label style={lbl}>빈티지</label><input value={form.vintage || ''} onChange={e => setF('vintage', e.target.value)} type="number" /></div>
            <div><label style={lbl}>수량</label><input value={form.qty || 1} onChange={e => setF('qty', e.target.value)} type="number" min="1" /></div>
          </div>
        )}
        <div style={G}>
          <div><label style={lbl}>용량</label>
            <select value={form.bottleSize || 750} onChange={e => setF('bottleSize', parseInt(e.target.value))}>
              {BOTTLE_SIZES.map(b => <option key={b.ml} value={b.ml}>{b.label}</option>)}
            </select>
          </div>
          <div></div>
        </div>
        <div style={G}>
          <div><label style={lbl}>구매일</label><input value={form.purchaseDate || ''} onChange={e => setF('purchaseDate', e.target.value)} type="date" /></div>
          <div><label style={lbl}>구매가격 (₩)</label><input value={form.price || ''} onChange={e => setF('price', e.target.value)} type="number" /></div>
        </div>
        <div style={G}>
          <div><label style={lbl}>시장가 (₩) <span style={{ color: T.gold, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>Wine-Searcher·데일리샷 기준</span></label><input value={form.wineSearcherPrice || ''} onChange={e => setF('wineSearcherPrice', parseInt(e.target.value) || null)} type="number" placeholder="예: 1500000" /></div>
          <div><label style={lbl}>Vivino 가격 ($) / 평점</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input value={form.vivinoPrice || ''} onChange={e => setF('vivinoPrice', parseFloat(e.target.value) || null)} type="number" placeholder="USD" style={{ flex: 1 }} />
              <input value={form.vivinoRating || ''} onChange={e => setF('vivinoRating', parseFloat(e.target.value) || null)} type="number" placeholder="평점" step="0.1" min="0" max="5" style={{ width: 70 }} />
            </div>
          </div>
        </div>
        <div style={G}>
          <div>
            <label style={lbl}>셀러</label>
            <select value={form.cellarId} onChange={e => { setF('cellarId', e.target.value); setF('slot', '1') }}>
              {CELLARS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>칸 번호</label>
            <select value={form.slot} onChange={e => setF('slot', e.target.value)}>
              {getSlots(curCellar).map(s => <option key={s} value={s}>{s}번 칸</option>)}
            </select>
          </div>
        </div>
        <ImagePicker
          imageUrl={form.imageUrl || ''} imgSrc="" imgSearching={imgSearching} imgErr={imgErr}
          onClear={() => setF('imageUrl', '')}
          onUpload={dataUrl => setF('imageUrl', dataUrl)}
          onRetry={searchImage}
        />
        {/* 이미지가 이미 있어도 다시 찾을 수 있게 — 일괄 입력 크롭이 뒤바뀐 경우 대비 */}
        {form.imageUrl && (
          <button onClick={searchImage} disabled={imgSearching}
            style={{ background: 'transparent', border: `1px solid ${T.border}`, color: imgSearching ? T.muted : T.gold, borderRadius: 8, padding: '6px 12px', fontSize: '0.76rem', cursor: imgSearching ? 'default' : 'pointer', marginBottom: 14 }}>
            {imgSearching ? '🔍 이미지 검색 중...' : '🔍 AI로 라벨 이미지 다시 찾기'}
          </button>
        )}
        {form.imageUrl && imgErr && <div style={{ fontSize: '0.76rem', color: '#e07070', marginBottom: 12 }}>✕ 이미지를 찾지 못했습니다 — 직접 촬영해 주세요</div>}
        <div style={{ marginBottom: 22 }}><label style={lbl}>메모</label><textarea value={form.notes || ''} onChange={e => setF('notes', e.target.value)} rows={2} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={() => setEditing(false)}>취소</Btn>
          <Btn variant="gold" onClick={saveEdit}>저장</Btn>
        </div>
      </div>
    </div>
  )

  if (moving) {
    const total = wine.qty || 1
    const qty = Math.max(1, Math.min(parseInt(moveQty) || total, total))
    const remaining = total - qty
    const unchanged = moveCellar === wine.cellarId && moveSlot === wine.slot
    return (
      <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="modal-box" style={{ maxWidth: 440 }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.3rem', color: T.cream, marginBottom: 6 }}>🚚 위치 이동</h2>
          <div style={{ fontSize: '0.85rem', color: T.muted, marginBottom: 20 }}>{wine.name}{wine.vintage ? ` · ${wine.vintage}` : ''}</div>

          {/* 현재 → 이동 후 위치 */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <div style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.64rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>현재</div>
              <div style={{ fontSize: '0.85rem', color: T.cream }}>{c?.name}</div>
              <div style={{ fontSize: '0.75rem', color: T.muted }}>{wine.slot}번 칸 · {total}병</div>
            </div>
            <div style={{ color: T.gold, fontSize: '1.2rem', flexShrink: 0 }}>→</div>
            <div style={{ flex: 1, background: T.surface, border: `1px solid ${unchanged ? T.border : T.gold}66`, borderRadius: 8, padding: '10px 12px' }}>
              <div style={{ fontSize: '0.64rem', color: unchanged ? T.muted : T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>이동 후</div>
              <div style={{ fontSize: '0.85rem', color: T.cream }}>{moveCellarObj?.name}</div>
              <div style={{ fontSize: '0.75rem', color: T.muted }}>{moveSlot}번 칸 · {qty}병</div>
            </div>
          </div>

          <div style={G}>
            <div>
              <label style={lbl}>셀러</label>
              <select value={moveCellar} onChange={e => { setMoveCellar(e.target.value); setMoveSlot('1') }}>
                {CELLARS.map(cl => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
              </select>
            </div>
            <div>
              <label style={lbl}>칸 번호</label>
              <select value={moveSlot} onChange={e => setMoveSlot(e.target.value)}>
                {getSlots(moveCellarObj).map(s => <option key={s} value={s}>{s}번 칸</option>)}
              </select>
            </div>
          </div>

          {/* 병 수 선택 — 2병 이상일 때만 노출 */}
          {total > 1 && (
            <div style={{ marginTop: 12 }}>
              <label style={lbl}>이동할 병 수 <span style={{ color: T.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(총 {total}병)</span></label>
              <select value={qty} onChange={e => setMoveQty(parseInt(e.target.value))}>
                {Array.from({ length: total }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}병{n === total ? ' (전체)' : ''}</option>)}
              </select>
              {remaining > 0 && (
                <div style={{ fontSize: '0.74rem', color: T.muted, marginTop: 8 }}>
                  {qty}병만 옮기고, <span style={{ color: T.cream }}>{c?.name} {wine.slot}번 칸</span>에 {remaining}병이 남습니다.
                </div>
              )}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
            <Btn variant="ghost" onClick={() => setMoving(false)}>취소</Btn>
            <Btn variant="gold" onClick={() => saveMove(qty)} disabled={unchanged}>이동</Btn>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 16, marginBottom: 18 }}>
          {wine.imageUrl
            ? <img src={wine.imageUrl} alt={wine.name} title="클릭하면 크게 보기" onClick={() => setImgZoom(true)}
                style={{ width: 80, height: 112, objectFit: 'contain', borderRadius: 8, flexShrink: 0, background: T.surface, border: `1px solid ${T.border}`, cursor: 'zoom-in' }}
                onError={e => e.target.style.display = 'none'} />
            : <div style={{ width: 80, height: 112, background: T.surface, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2.5rem', border: `1px solid ${T.border}` }}>{whisky ? '🥃' : '🍷'}</div>
          }
          <div style={{ flex: 1 }}>
            <button onClick={onClose} style={{ float: 'right', background: 'none', border: 'none', color: T.muted, fontSize: '1.1rem' }}>✕</button>
            <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.25rem', color: T.cream, lineHeight: 1.3, marginBottom: 6 }}>{wine.name}</h2>
            {wine.vintage && <div style={{ color: T.gold, fontWeight: 600, fontSize: '1rem', marginBottom: 6 }}>{wine.vintage}</div>}
            {whisky && (wine.ageYears || wine.abv) && <div style={{ color: T.gold, fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>{[wine.ageYears ? `${wine.ageYears}년 숙성` : null, wine.abv ? `${wine.abv}%` : null].filter(Boolean).join(' · ')}</div>}
            {openedBadge(wine) && <div style={{ display: 'inline-block', background: `${T.gold}22`, color: T.gold, border: `1px solid ${T.gold}66`, borderRadius: 6, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 600, marginBottom: 6, marginRight: 6 }}>{openedBadge(wine)}</div>}
            {bottleBadge(wine.bottleSize) && <div style={{ display: 'inline-block', background: `${T.wine}33`, color: T.wineLight, border: `1px solid ${T.wine}`, borderRadius: 6, padding: '2px 9px', fontSize: '0.72rem', fontWeight: 600, marginBottom: 6 }}>{bottleBadge(wine.bottleSize)}</div>}
            {wine.producer && <div style={{ fontSize: '0.78rem', color: T.muted }}>{wine.producer}</div>}
            {wine.region && <div style={{ fontSize: '0.78rem', color: T.muted }}>{wine.country ? `${wine.region}, ${wine.country}` : wine.region}</div>}
            {wine.grape && <div style={{ fontSize: '0.76rem', color: T.muted, marginTop: 2 }}>🍇 {wine.grape}</div>}
          </div>
        </div>
        {wine.description && <p style={{ fontSize: '0.84rem', color: T.text, fontStyle: 'italic', lineHeight: 1.6, borderLeft: `2px solid ${T.gold}`, paddingLeft: 12, marginBottom: 16 }}>{wine.description}</p>}

        {/* Market price */}
        {(wine.vivinoPrice || wine.wineSearcherPrice) && (() => {
          const vp = wine.vivinoPrice, wp = wine.wineSearcherPrice
          const krw = n => '₩' + Number(n).toLocaleString('ko-KR')
          return (
            <div style={{ background: T.surface, border: `1px solid ${T.gold}44`, borderRadius: 8, padding: '10px 14px', marginBottom: 16 }}>
              <div style={{ fontSize: '0.66rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8, fontWeight: 600 }}>💰 시장가 ({whisky ? '700ml' : '750ml'} 기준)</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {wp && <div><div style={{ fontSize: '0.68rem', color: T.muted }}>🇰🇷 한국 시장가</div><div style={{ fontWeight: 700, color: T.gold, fontSize: '1.05rem' }}>{krw(wp)}</div></div>}
                {vp && <div><div style={{ fontSize: '0.68rem', color: T.muted }}>🌐 글로벌 (Wine-Searcher)</div><div style={{ fontWeight: 600, color: T.cream }}>${vp}{wine.vivinoRating && <span style={{ fontSize: '0.72rem', color: T.muted, marginLeft: 6 }}>⭐{wine.vivinoRating}</span>}</div></div>}
              </div>
            </div>
          )
        })()}

        {/* 가격 추이 그래프 — 히스토리 2건 이상일 때만 표시됨 */}
        <PriceHistoryChart wine={wine} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[['수량', `${wine.qty || 1}병`], ['구매가격', krw(wine.price)], ['구매일', kdate(wine.purchaseDate)], ['위치', `${c?.name} · ${wine.slot}번 칸`],
            ...(whisky ? [['개봉 상태', wine.openedDate ? `${kdate(wine.openedDate)} 개봉 · 잔량 ${wine.remainingPct == null ? 100 : wine.remainingPct}%` : '미개봉'], ['시음 횟수', `${sessions.length}회`]] : [])
          ].map(([k, v]) => (
            <div key={k} style={{ background: T.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: '0.66rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>{k}</div>
              <div style={{ fontSize: '0.9rem', color: T.cream, fontWeight: 500 }}>{v}</div>
            </div>
          ))}
        </div>
        {wine.notes && <div style={{ background: T.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${T.border}`, marginBottom: 16 }}><div style={{ fontSize: '0.66rem', color: T.muted, marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.08em' }}>메모</div><div style={{ fontSize: '0.85rem', color: T.text }}>{wine.notes}</div></div>}

        {/* 위스키 시음 세션 히스토리 — 한 병에 여러 번 기록 */}
        {whisky && sessions.length > 0 && (
          <div style={{ background: T.surface, borderRadius: 8, padding: '10px 12px', border: `1px solid ${T.border}`, marginBottom: 16 }}>
            <div style={{ fontSize: '0.66rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4, fontWeight: 600 }}>🥃 시음 기록 · {sessions.length}회</div>
            {sessions.map((s, i) => (
              <div key={s.id} style={{ padding: '8px 0', borderTop: i > 0 ? `1px solid ${T.border}` : 'none' }}>
                <div style={{ fontSize: '0.8rem', color: T.cream, fontWeight: 500 }}>
                  {kdate(s.date)}
                  {s.remainingAfter != null && <span style={{ color: T.gold, marginLeft: 8 }}>잔량 {s.remainingAfter}%</span>}
                  {s.rating > 0 && <span style={{ color: T.muted, marginLeft: 8 }}>⭐ {s.rating}</span>}
                </div>
                {(s.occasion || s.companions) && <div style={{ fontSize: '0.74rem', color: T.muted, marginTop: 2 }}>{[s.occasion, s.companions].filter(Boolean).join(' · ')}</div>}
                {s.review && <div style={{ fontSize: '0.76rem', color: T.text, fontStyle: 'italic', marginTop: 3 }}>{s.review}</div>}
              </div>
            ))}
          </div>
        )}

        <hr style={{ border: 'none', borderTop: `1px solid ${T.border}`, margin: '16px 0' }} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" size="sm" onClick={() => { goSlot(wine.cellarId, wine.slot); onClose() }}>📍 위치</Btn>
            <Btn variant="ghost" size="sm" onClick={startMove}>🚚 이동</Btn>
            <Btn variant="ghost" size="sm" onClick={() => setEditing(true)}>✏️ 수정</Btn>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="wine" size="sm" onClick={() => onDrink(wine)}>{whisky ? '🥃 시음' : '🍷 마심'}</Btn>
            {confirmDelete
              ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#c0392b22', border: '1px solid #c0392b', borderRadius: 8, padding: '4px 10px' }}>
                  <span style={{ fontSize: '0.78rem', color: '#e07070' }}>삭제?</span>
                  <button onClick={onRemove} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>확인</button>
                  <button onClick={() => setConfirmDelete(false)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '3px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>취소</button>
                </div>
              : <Btn variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>삭제</Btn>
            }
          </div>
        </div>
      </div>

      {/* 이미지 확대 라이트박스 — 클릭하면 닫힘 */}
      {imgZoom && wine.imageUrl && (
        <div onClick={e => { e.stopPropagation(); setImgZoom(false) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out', padding: 24 }}>
          <img src={wine.imageUrl} alt={wine.name}
            style={{ maxWidth: '92vw', maxHeight: '86vh', objectFit: 'contain', borderRadius: 10 }} />
          <button onClick={e => { e.stopPropagation(); setImgZoom(false) }}
            style={{ position: 'fixed', top: 18, right: 22, background: 'none', border: 'none', color: '#fff', fontSize: '1.6rem', cursor: 'pointer' }}>✕</button>
        </div>
      )}
    </div>
  )
}

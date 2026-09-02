import { useState } from 'react'
import { cellarById, T, uid } from '../../config/cellars.js'
import { Btn, lbl, StarRating } from '../ui.jsx'

// ── Batch Drink Modal ───────────────────────────────────────────
// 하루에 여러 병을 마신 경우: 날짜/함께한 사람/자리는 한 번만 입력하고,
// 평점·한마디만 와인별로 개별 입력. 위스키는 시음 세션 로직이 달라 대상에서 제외(CellarView에서 필터링됨).
export function BatchDrinkModal({ wines, onConfirm, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const [shared, setShared] = useState({ date: today, companions: '', occasion: '' })
  const [perWine, setPerWine] = useState(() => Object.fromEntries(wines.map(w => [w.id, { rating: 0, review: '' }])))
  // 서로 다른 셀러의 병을 함께 마신 경우 헤더에 셀러 목록을 보여준다
  const cellarNames = [...new Set(wines.map(w => cellarById(w.cellarId)?.name).filter(Boolean))]
  const setS = (k, v) => setShared(p => ({ ...p, [k]: v }))
  const setP = (id, k, v) => setPerWine(p => ({ ...p, [id]: { ...p[id], [k]: v } }))

  function confirm() {
    const records = wines.map(w => ({
      id: uid(), wineId: w.id, wineName: w.name, wineVintage: w.vintage,
      cellarName: cellarById(w.cellarId)?.name, slot: w.slot, imageUrl: w.imageUrl || '',
      date: shared.date, companions: shared.companions, occasion: shared.occasion,
      rating: perWine[w.id]?.rating || 0, review: perWine[w.id]?.review || '',
    }))
    onConfirm(records)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560 }}>
        <div style={{ marginBottom: 20, paddingBottom: 16, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, fontWeight: 600 }}>🥂 일괄 마심</div>
          <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.2rem', fontWeight: 600, color: T.cream }}>{wines.length}병을 한 자리에서 마심</div>
          <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 2 }}>날짜·함께한 사람·자리는 한 번만 입력하면 전체 병에 적용됩니다</div>
          {cellarNames.length > 1 && (
            <div style={{ fontSize: '0.72rem', color: T.gold, marginTop: 4 }}>🗄 {cellarNames.join(' · ')} — 셀러 {cellarNames.length}곳의 와인이 함께 기록됩니다</div>
          )}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><label style={lbl}>마신 날짜</label><input value={shared.date} onChange={e => setS('date', e.target.value)} type="date" /></div>
          <div><label style={lbl}>자리 / 특별한 날</label><input value={shared.occasion} onChange={e => setS('occasion', e.target.value)} placeholder="생일, 기념일..." /></div>
        </div>
        <div style={{ marginBottom: 20 }}><label style={lbl}>함께한 사람</label><input value={shared.companions} onChange={e => setS('companions', e.target.value)} placeholder="아내, 친구들, 혼자..." /></div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 22, maxHeight: '40vh', overflowY: 'auto' }}>
          {wines.map(w => (
            <div key={w.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8 }}>
                {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 30, height: 42, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 30, height: 42, background: T.card, borderRadius: 4, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem' }}>🍷</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.88rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {w.vintage && <span style={{ fontSize: '0.75rem', color: T.gold }}>{w.vintage}</span>}
                    <span style={{ fontSize: '0.7rem', color: T.muted }}>{cellarById(w.cellarId)?.name}{w.slot ? ` 셀러 ${w.slot}번 칸` : ''}</span>
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}><StarRating value={perWine[w.id]?.rating || 0} onChange={v => setP(w.id, 'rating', v)} /></div>
              <input value={perWine[w.id]?.review || ''} onChange={e => setP(w.id, 'review', e.target.value)} placeholder="한마디 (선택)" style={{ fontSize: '0.82rem' }} />
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="gold" onClick={confirm}>🥂 {wines.length}병 기록하고 마심</Btn>
        </div>
      </div>
    </div>
  )
}

import { useState } from 'react'
import { cellarById, T, uid, isWhisky } from '../../config/cellars.js'
import { Btn, lbl, StarRating } from '../ui.jsx'

// ── Drink Modal ─────────────────────────────────────────────────
// 와인: 기록 1건 = 병 1개 차감.
// 위스키: 기록 = "시음 세션" — 병 차감 없이 잔량만 갱신, 여러 번 기록 가능.
//         '빈 병' 체크 시에만 병 1개 차감(와인과 동일 경로).
export function DrinkModal({ wine, onConfirm, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const whisky = isWhisky(wine)
  const curRemaining = wine.remainingPct == null ? 100 : wine.remainingPct
  const [form, setForm] = useState({ date: today, companions: '', occasion: '', rating: 0, review: '' })
  const [remainingAfter, setRemainingAfter] = useState(curRemaining)
  const [emptyBottle, setEmptyBottle] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const c = cellarById(wine.cellarId)

  function confirm() {
    const rec = {
      ...form, id: uid(), wineId: wine.id, wineName: wine.name, wineVintage: wine.vintage,
      cellarName: cellarById(wine.cellarId)?.name, slot: wine.slot, imageUrl: wine.imageUrl || '',
    }
    if (whisky) {
      rec.remainingAfter = emptyBottle ? 0 : remainingAfter
      rec.emptyBottle = emptyBottle
    }
    onConfirm(rec)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
          {wine.imageUrl ? <img src={wine.imageUrl} alt="" style={{ width: 52, height: 74, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 52, height: 74, background: T.surface, borderRadius: 7, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>{whisky ? '🥃' : '🍷'}</div>}
          <div>
            <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, fontWeight: 600 }}>{whisky ? '🥃 시음 기록' : '🥂 마심 기록'}</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.2rem', fontWeight: 600, color: T.cream }}>{wine.name}</div>
            {wine.vintage && <div style={{ fontSize: '0.85rem', color: T.gold, marginTop: 3 }}>{wine.vintage}</div>}
            <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 2 }}>
              {c?.name} · {wine.slot}번 칸 · {whisky
                ? (wine.openedDate ? `개봉 병 잔량 ${curRemaining}%` : '미개봉 (첫 기록 시 개봉 처리)')
                : `${wine.qty || 1}병 중 1병 차감`}
            </div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><label style={lbl}>마신 날짜</label><input value={form.date} onChange={e => set('date', e.target.value)} type="date" /></div>
          <div><label style={lbl}>자리 / 특별한 날</label><input value={form.occasion} onChange={e => set('occasion', e.target.value)} placeholder="생일, 기념일..." /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>함께한 사람</label><input value={form.companions} onChange={e => set('companions', e.target.value)} placeholder="아내, 친구들, 혼자..." /></div>

        {/* 위스키: 잔량 슬라이더 + 빈 병 처리 */}
        {whisky && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '12px 14px', marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <label style={{ ...lbl, marginBottom: 0 }}>마신 후 잔량</label>
              <span style={{ fontSize: '0.9rem', fontWeight: 700, color: emptyBottle ? T.muted : T.gold }}>{emptyBottle ? 0 : remainingAfter}%</span>
            </div>
            <input type="range" min="0" max={curRemaining} step="5" value={emptyBottle ? 0 : remainingAfter}
              disabled={emptyBottle}
              onChange={e => setRemainingAfter(parseInt(e.target.value))}
              style={{ width: '100%', accentColor: T.gold }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.68rem', color: T.muted, marginTop: 2 }}>
              <span>0% (빈 병)</span><span>현재 {curRemaining}%</span>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: '0.8rem', color: T.text, cursor: 'pointer' }}>
              <input type="checkbox" checked={emptyBottle} onChange={e => setEmptyBottle(e.target.checked)} style={{ accentColor: T.gold }} />
              🫙 이 병을 다 비웠어요 (병 1개 차감{(wine.qty || 1) > 1 ? ` · ${(wine.qty || 1) - 1}병 남음` : ' · 목록에서 제거'})
            </label>
          </div>
        )}

        <div style={{ marginBottom: 14 }}><label style={lbl}>평점</label><StarRating value={form.rating} onChange={v => set('rating', v)} /></div>
        <div style={{ marginBottom: 22 }}><label style={lbl}>한마디 <span style={{ color: T.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(선택)</span></label><textarea value={form.review} onChange={e => set('review', e.target.value)} rows={3} placeholder="맛, 향, 느낌... 다음에 다시 마시고 싶은지" style={{ resize: 'vertical' }} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="gold" onClick={confirm}>
            {whisky ? (emptyBottle ? '🫙 기록하고 병 비움' : '🥃 시음 기록') : '🍷 기록하고 마심'}
          </Btn>
        </div>
      </div>
    </div>
  )
}

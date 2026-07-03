import { useState } from 'react'
import { cellarById, T, uid } from '../../config/cellars.js'
import { Btn, lbl, StarRating } from '../ui.jsx'

// ── Drink Modal ─────────────────────────────────────────────────
export function DrinkModal({ wine, onConfirm, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const [form, setForm] = useState({ date: today, companions: '', occasion: '', rating: 0, review: '' })
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const c = cellarById(wine.cellarId)

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 480 }}>
        <div style={{ display: 'flex', gap: 14, marginBottom: 22, paddingBottom: 18, borderBottom: `1px solid ${T.border}` }}>
          {wine.imageUrl ? <img src={wine.imageUrl} alt="" style={{ width: 52, height: 74, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 52, height: 74, background: T.surface, borderRadius: 7, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.6rem' }}>🍷</div>}
          <div>
            <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5, fontWeight: 600 }}>🥂 마심 기록</div>
            <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.2rem', fontWeight: 600, color: T.cream }}>{wine.name}</div>
            {wine.vintage && <div style={{ fontSize: '0.85rem', color: T.gold, marginTop: 3 }}>{wine.vintage}</div>}
            <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 2 }}>{c?.name} · {wine.slot}번 칸 · {wine.qty || 1}병 중 1병 차감</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div><label style={lbl}>마신 날짜</label><input value={form.date} onChange={e => set('date', e.target.value)} type="date" /></div>
          <div><label style={lbl}>자리 / 특별한 날</label><input value={form.occasion} onChange={e => set('occasion', e.target.value)} placeholder="생일, 기념일..." /></div>
        </div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>함께한 사람</label><input value={form.companions} onChange={e => set('companions', e.target.value)} placeholder="아내, 친구들, 혼자..." /></div>
        <div style={{ marginBottom: 14 }}><label style={lbl}>평점</label><StarRating value={form.rating} onChange={v => set('rating', v)} /></div>
        <div style={{ marginBottom: 22 }}><label style={lbl}>한마디 <span style={{ color: T.muted, fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(선택)</span></label><textarea value={form.review} onChange={e => set('review', e.target.value)} rows={3} placeholder="맛, 향, 느낌... 다음에 다시 마시고 싶은지" style={{ resize: 'vertical' }} /></div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="gold" onClick={() => onConfirm({ ...form, id: uid(), wineId: wine.id, wineName: wine.name, wineVintage: wine.vintage, cellarName: cellarById(wine.cellarId)?.name, slot: wine.slot, imageUrl: wine.imageUrl || '' })}>
            🍷 기록하고 마심
          </Btn>
        </div>
      </div>
    </div>
  )
}

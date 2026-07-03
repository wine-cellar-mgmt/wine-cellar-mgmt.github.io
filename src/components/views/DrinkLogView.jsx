import { useState, useMemo } from 'react'
import { T, kdate } from '../../config/cellars.js'

// ── Drink Log View ───────────────────────────────────────────────
export function DrinkLogView({ drinkLog, onDelete }) {
  const [filter, setFilter] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const filtered = useMemo(() => {
    const sorted = [...drinkLog].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    return filter
      ? sorted.filter(r => (r.wineName || '').toLowerCase().includes(filter.toLowerCase()) || (r.companions || '').toLowerCase().includes(filter.toLowerCase()))
      : sorted
  }, [drinkLog, filter])

  return (
    <div className="fade-in">
      <h1 className="heading">🍷 음주 기록</h1>
      <p className="subheading">지금까지 {drinkLog.length}번의 와인을 즐겼습니다</p>
      {drinkLog.length > 0 && (
        <div style={{ maxWidth: 400, marginBottom: 20, position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="와인 이름, 함께한 사람 검색..." style={{ paddingLeft: 34 }} />
        </div>
      )}
      {drinkLog.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}><div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🍷</div><div>아직 음주 기록이 없습니다</div><div style={{ fontSize: '0.8rem', marginTop: 6 }}>와인을 마시면 여기에 기록됩니다</div></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filtered.map(r => (
              <div key={r.id} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, position: 'relative' }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                  {r.imageUrl ? <img src={r.imageUrl} alt="" style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 44, height: 62, background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🍷</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                      <div>
                        <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', fontWeight: 600, color: T.cream }}>{r.wineName}</div>
                        <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                          {r.wineVintage && <span style={{ fontSize: '0.78rem', color: T.gold }}>{r.wineVintage}</span>}
                          {r.cellarName && <span style={{ fontSize: '0.78rem', color: T.muted }}>{r.cellarName} 셀러 {r.slot}번 칸</span>}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 500, color: T.cream }}>{kdate(r.date)}</div>
                        {r.rating > 0 && (
                          <div style={{ marginTop: 3, color: T.gold }}>
                            {'⭐'.repeat(r.rating)}<span style={{ color: T.border }}>{'⭐'.repeat(5 - r.rating)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: r.review ? 10 : 0 }}>
                      {r.companions && <span style={{ fontSize: '0.82rem', color: T.text }}>👥 {r.companions}</span>}
                      {r.occasion && <span style={{ fontSize: '0.82rem', color: T.text }}>🎉 {r.occasion}</span>}
                    </div>
                    {r.review && <div style={{ background: T.surface, borderRadius: 8, padding: '10px 12px', borderLeft: `2px solid ${T.gold}` }}><p style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.6, fontStyle: 'italic' }}>{r.review}</p></div>}
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
                  {confirmId === r.id
                    ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#c0392b22', border: '1px solid #c0392b', borderRadius: 8, padding: '4px 10px' }}>
                        <span style={{ fontSize: '0.78rem', color: '#e07070' }}>이 기록을 삭제할까요?</span>
                        <button onClick={() => { onDelete(r.id); setConfirmId(null) }} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>확인</button>
                        <button onClick={() => setConfirmId(null)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>취소</button>
                      </div>
                    : <button onClick={() => setConfirmId(r.id)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
                        onMouseEnter={e => { e.currentTarget.style.color = '#e07070'; e.currentTarget.style.borderColor = '#c0392b' }}
                        onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border }}
                      >🗑 삭제</button>
                  }
                </div>
              </div>
            ))}
          </div>
      }
    </div>
  )
}

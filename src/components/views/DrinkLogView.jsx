import { useState, useMemo } from 'react'
import { T, kdate, textMatchesQuery } from '../../config/cellars.js'

// ── Drink Log View ───────────────────────────────────────────────
export function DrinkLogView({ drinkLog, onDelete, onAddExternal }) {
  const [filter, setFilter] = useState('')
  const [confirmId, setConfirmId] = useState(null)
  const filtered = useMemo(() => {
    const sorted = [...drinkLog].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))
    return filter
      ? sorted.filter(r => textMatchesQuery(r.wineName, filter) || (r.companions || '').toLowerCase().includes(filter.toLowerCase()))
      : sorted
  }, [drinkLog, filter])

  // 일괄 마심(자리)으로 기록된 항목은 같은 sessionId끼리 한 카드로 묶어 표시.
  // 세션 없는 기존/개별 기록은 그대로 낱개 카드 유지.
  const groups = useMemo(() => {
    const out = []
    const sessionMap = new Map()
    for (const r of filtered) {
      if (r.sessionId) {
        let g = sessionMap.get(r.sessionId)
        if (!g) {
          g = { type: 'session', sessionId: r.sessionId, date: r.date, companions: r.companions, occasion: r.occasion, items: [] }
          sessionMap.set(r.sessionId, g)
          out.push(g)
        }
        g.items.push(r)
      } else {
        out.push({ type: 'single', r })
      }
    }
    return out
  }, [filtered])

  // 삭제 확인 버튼 (단건/세션 내 개별 항목 공용)
  function DeleteConfirm({ id }) {
    return confirmId === id
      ? <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#c0392b22', border: '1px solid #c0392b', borderRadius: 8, padding: '4px 10px' }}>
          <span style={{ fontSize: '0.78rem', color: '#e07070' }}>이 기록을 삭제할까요?</span>
          <button onClick={() => { onDelete(id); setConfirmId(null) }} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>확인</button>
          <button onClick={() => setConfirmId(null)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>취소</button>
        </div>
      : <button onClick={() => setConfirmId(id)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 8, padding: '5px 12px', fontSize: '0.78rem', cursor: 'pointer' }}
          onMouseEnter={e => { e.currentTarget.style.color = '#e07070'; e.currentTarget.style.borderColor = '#c0392b' }}
          onMouseLeave={e => { e.currentTarget.style.color = T.muted; e.currentTarget.style.borderColor = T.border }}
        >🗑 삭제</button>
  }

  // 낱개 기록 카드 (세션 없는 기존/개별 기록)
  function SingleCard({ r }) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, position: 'relative' }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
          {r.imageUrl ? <img src={r.imageUrl} alt="" style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 44, height: 62, background: T.surface, borderRadius: 6, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>🍷</div>}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
              <div>
                <div style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', fontWeight: 600, color: T.cream }}>{r.wineName}</div>
                <div style={{ display: 'flex', gap: 10, marginTop: 3, flexWrap: 'wrap' }}>
                  {r.wineVintage && <span style={{ fontSize: '0.78rem', color: T.gold }}>{r.wineVintage}</span>}
                  {r.cellarName && <span style={{ fontSize: '0.78rem', color: T.muted }}>{r.cellarName}{r.slot ? ` 셀러 ${r.slot}번 칸` : ''}</span>}
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
          <DeleteConfirm id={r.id} />
        </div>
      </div>
    )
  }

  // 일괄 마심(자리) 세션 카드 — 날짜/함께한 사람/자리는 한 번, 병별로 이름/평점/한마디만 나열
  function SessionCard({ g }) {
    return (
      <div style={{ background: T.card, border: `1px solid ${T.gold}44`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6, flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.72rem', color: T.gold, background: T.gold + '22', borderRadius: 6, padding: '2px 8px', fontWeight: 600 }}>🥂 {g.items.length}병 함께</span>
            {g.companions && <span style={{ fontSize: '0.82rem', color: T.text }}>👥 {g.companions}</span>}
            {g.occasion && <span style={{ fontSize: '0.82rem', color: T.text }}>🎉 {g.occasion}</span>}
          </div>
          <div style={{ fontSize: '0.85rem', fontWeight: 500, color: T.cream, flexShrink: 0 }}>{kdate(g.date)}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {g.items.map(r => (
            <div key={r.id} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: `1px solid ${T.border}` }}>
              {r.imageUrl ? <img src={r.imageUrl} alt="" style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 36, height: 50, background: T.surface, borderRadius: 5, border: `1px solid ${T.border}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem' }}>🍷</div>}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ fontSize: '0.95rem', fontWeight: 500, color: T.cream }}>{r.wineName}</span>
                    {r.wineVintage && <span style={{ fontSize: '0.78rem', color: T.gold, marginLeft: 8 }}>{r.wineVintage}</span>}
                  </div>
                  {r.rating > 0 && (
                    <div style={{ color: T.gold }}>
                      {'⭐'.repeat(r.rating)}<span style={{ color: T.border }}>{'⭐'.repeat(5 - r.rating)}</span>
                    </div>
                  )}
                </div>
                {r.review && <p style={{ fontSize: '0.82rem', color: T.text, lineHeight: 1.5, fontStyle: 'italic', marginTop: 4 }}>{r.review}</p>}
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                  <DeleteConfirm id={r.id} />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="heading">🍷 음주 기록</h1>
          <p className="subheading">지금까지 {drinkLog.length}번의 와인을 즐겼습니다</p>
        </div>
        <button onClick={onAddExternal} style={{ background: T.gold + '22', border: `1px solid ${T.gold}44`, color: T.gold, borderRadius: 8, padding: '9px 16px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>
          📷 밖에서 마신 와인 기록
        </button>
      </div>
      {drinkLog.length > 0 && (
        <div style={{ maxWidth: 400, margin: '18px 0 20px', position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
          <input value={filter} onChange={e => setFilter(e.target.value)} placeholder="와인 이름, 함께한 사람 검색..." style={{ paddingLeft: 34 }} />
        </div>
      )}
      {drinkLog.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}><div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🍷</div><div>아직 음주 기록이 없습니다</div><div style={{ fontSize: '0.8rem', marginTop: 6 }}>와인을 마시면 여기에 기록됩니다</div></div>
        : <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {groups.map(g => g.type === 'session'
              ? <SessionCard key={g.sessionId} g={g} />
              : <SingleCard key={g.r.id} r={g.r} />
            )}
          </div>
      }
    </div>
  )
}

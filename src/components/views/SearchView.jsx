import { useState, useMemo } from 'react'
import { cellarById, T, krw, bottleBadge, bottleSizeAliases, openedBadge, textMatchesQuery } from '../../config/cellars.js'

// 동의어 사전(WINE_SYNONYMS)·매칭 로직은 cellars.js로 이동(음주기록 검색과 공용)
// 종류 키워드로 검색하면 category로도 매칭 — '위스키/데킬라/꼬냑…'은 모두 whisky 카테고리, '와인'은 wine
const CATEGORY_QUERY = {
  '와인': 'wine', 'wine': 'wine',
  '위스키': 'whisky', '위스끼': 'whisky', 'whisky': 'whisky', 'whiskey': 'whisky',
}
// 숙성연수/빈티지 검색: '30년', '３０년', '30년산', '30 years', '30yo' → 숫자 30으로 해석
// 전각 숫자도 허용하고, 숙성연수(ageYears)·빈티지 모두와 비교한다.
function ageQueryNumber(query) {
  const q = query.trim()
    .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
    .toLowerCase()
  const m = q.match(/^(\d{1,4})\s*(년산|년|years old|year old|years|year|yo|y)?$/)
  return m ? { num: parseInt(m[1]), hadUnit: !!m[2] } : null
}

function wineMatchesQuery(wine, query) {
  if (!query.trim()) return false
  const cat = CATEGORY_QUERY[query.trim().toLowerCase()]
  if (cat && (wine.category || 'wine') === cat) return true
  const age = ageQueryNumber(query)
  if (age) {
    if (Number(wine.ageYears) === age.num) return true
    if (Number(wine.vintage) === age.num) return true
  }
  const fields = [wine.name, wine.producer, wine.region, wine.country, wine.grape, wine.description, wine.notes,
    String(wine.vintage || ''), wine.ageYears ? `${wine.ageYears}년 ${wine.ageYears} years` : '',
    bottleSizeAliases(wine.bottleSize)]
  return fields.some(f => textMatchesQuery(f, query))
}

// ── Search View ──────────────────────────────────────────────────
export function SearchView({ wines, openDetail, openDrink, goSlot }) {
  const [q, setQ] = useState('')
  const results = useMemo(
    () => q.trim() ? wines.filter(w => wineMatchesQuery(w, q)) : [],
    [wines, q]
  )

  return (
    <div className="fade-in">
      <h1 className="heading">검색</h1>
      <p className="subheading">와인 이름, 빈티지, 메모로 검색하세요</p>
      <div style={{ maxWidth: 520, marginBottom: 28, position: 'relative' }}>
        <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }}>🔍</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="와인 이름, 빈티지, 메모 검색..." autoFocus style={{ paddingLeft: 40, height: 50, fontSize: '1rem' }} />
        {q && <button onClick={() => setQ('')} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: T.muted, fontSize: '1.1rem' }}>✕</button>}
      </div>
      {!q.trim() && <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted }}><div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🔍</div><div>검색어를 입력하세요</div></div>}
      {q.trim() && results.length === 0 && <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted }}>"{q}"와 일치하는 와인이 없습니다</div>}
      {results.length > 0 && (
        <>
          <div style={{ fontSize: '0.75rem', color: T.muted, marginBottom: 12 }}>{results.length}개 결과</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {results.map(w => {
              const c = cellarById(w.cellarId)
              return (
                <div key={w.id} onClick={() => openDetail(w.id)} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center', transition: 'border-color 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = T.gold}
                  onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                >
                  {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 40, height: 56, background: T.surface, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem', border: `1px solid ${T.border}` }}>🍷</div>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                    <div style={{ fontSize: '0.72rem', color: T.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {w.vintage && <span style={{ color: T.gold }}>{w.vintage}</span>}{bottleBadge(w.bottleSize) && <span style={{ color: T.wineLight, fontWeight: 600 }}>{bottleBadge(w.bottleSize)}</span>}
                      {openedBadge(w) && <span style={{ color: T.gold, fontWeight: 600 }}>{openedBadge(w)}</span>}
                      <span>{w.qty || 1}병</span>
                      {w.price > 0 && <span>구매가 {krw(w.price)}</span>}
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                    {w.wineSearcherPrice > 0
                      ? <div style={{ fontSize: '0.95rem', fontWeight: 700, color: T.gold, lineHeight: 1 }}>
                          <span style={{ fontSize: '0.62rem', fontWeight: 500, color: T.muted, textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 6 }}>시장가</span>
                          {krw(w.wineSearcherPrice)}
                        </div>
                      : <div style={{ fontSize: '0.7rem', color: T.muted }}>시장가 미등록</div>}
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => openDrink(w)} style={{ background: T.wine + '33', color: T.wineLight, border: `1px solid ${T.wine}`, padding: '6px 10px', borderRadius: 8, fontSize: '0.75rem', cursor: 'pointer' }}>마심</button>
                      <button onClick={() => goSlot(w.cellarId, w.slot)} style={{ background: T.gold + '33', color: T.gold, border: `1px solid ${T.gold}`, padding: '6px 12px', borderRadius: 8, fontSize: '0.78rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>📍 {c?.name} {w.slot}칸</button>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}

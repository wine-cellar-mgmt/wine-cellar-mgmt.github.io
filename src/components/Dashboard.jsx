import { useMemo } from 'react'
import { CELLARS, getSlots, T, krw, getDrinkingStatus, bottleBadge } from '../config/cellars.js'
import { useIsMobile } from './ui.jsx'

export default function Dashboard({ wines, drinkLog, bottlesIn, setTab, setCellarId, openDetail }) {
  const mobile = useIsMobile()
  const year = new Date().getFullYear()

  const totalBottles   = wines.reduce((s, w) => s + (w.qty || 1), 0)
  const purchaseValue  = wines.reduce((s, w) => s + (w.price || 0) * (w.qty || 1), 0)
  const marketValue    = wines.reduce((s, w) => s + (w.wineSearcherPrice || 0) * (w.qty || 1), 0)
  // 평가 차익은 구매가·시장가가 모두 있는 와인만 비교 (한쪽만 있으면 왜곡되므로 제외)
  const valued         = wines.filter(w => (w.price || 0) > 0 && (w.wineSearcherPrice || 0) > 0)
  const valuedPurchase = valued.reduce((s, w) => s + w.price * (w.qty || 1), 0)
  const valuedMarket   = valued.reduce((s, w) => s + w.wineSearcherPrice * (w.qty || 1), 0)
  const valuedGain     = valuedMarket - valuedPurchase
  const pricedCount    = wines.filter(w => (w.price || 0) > 0).length          // 구매가 입력된 와인 종 수
  const marketCount    = wines.filter(w => (w.wineSearcherPrice || 0) > 0).length // 시장가 입력된 와인 종 수
  const usedSlots      = new Set(wines.map(w => `${w.cellarId}:${w.slot}`)).size
  const totalSlots     = CELLARS.reduce((s, c) => s + c.slots, 0)

  // 음용 적기 분류
  const drinkNow  = wines.filter(w => { const s = getDrinkingStatus(w); return s?.status === 'peak' })
  const tooYoung  = wines.filter(w => { const s = getDrinkingStatus(w); return s?.status === 'young' })
  const lowStock  = wines.filter(w => (w.qty || 1) <= 1)

  // 음용 적기 요약 — 같은 와인(name+vintage)은 "이름 + N병"으로 묶어서 집계
  const dwGroupKey = w => `${(w.name || '').trim()}|||${w.vintage || ''}`
  const declineGroups = {}, peakGroups = {}
  wines.forEach(w => {
    const s = getDrinkingStatus(w)
    const k = dwGroupKey(w)
    if (s?.status === 'decline') (declineGroups[k] = declineGroups[k] || { name: w.name, vintage: w.vintage, qty: 0 }).qty += (w.qty || 1)
    else if (s?.status === 'peak') (peakGroups[k] = peakGroups[k] || { name: w.name, vintage: w.vintage, qty: 0 }).qty += (w.qty || 1)
  })
  const declineList = Object.values(declineGroups).sort((a, b) => (a.vintage || 9999) - (b.vintage || 9999))
  const peakList    = Object.values(peakGroups).sort((a, b) => (a.vintage || 9999) - (b.vintage || 9999))
  const declineBottles = declineList.reduce((s, g) => s + g.qty, 0)
  const peakBottles    = peakList.reduce((s, g) => s + g.qty, 0)

  // 추천 와인 (지금 마시기 좋은 것 중 빈티지 오래된 순)
  const recommended = [...drinkNow].sort((a, b) => (a.vintage || 0) - (b.vintage || 0)).slice(0, 3)

  // 음주 기록 — "회"는 자리(세션) 단위, "병"은 실제 마신 병 수(레코드 수)
  const drinkSessionIds = new Set(drinkLog.filter(r => r.sessionId).map(r => r.sessionId))
  const drinkSoloCount   = drinkLog.filter(r => !r.sessionId).length
  const drinkOccasions   = drinkSessionIds.size + drinkSoloCount

  const stats = [
    { label: '총 와인 기록', val: `${wines.length}건`,   sub: '구매 기록 수' },
    { label: '총 보관 병 수', val: `${totalBottles}병`,  sub: `${usedSlots}/${totalSlots} 칸 사용` },
    { label: '구매가 합계',   val: krw(purchaseValue),   sub: `구매가 입력 ${pricedCount}종만` },
    { label: '시장가 합계',   val: krw(marketValue),     sub: `시장가 입력 ${marketCount}종 기준`, onClick: () => setTab('stats') },
    { label: '음주 기록',     val: `${drinkOccasions}회`, sub: `${drinkLog.length}병`, onClick: () => setTab('log') },
  ]

  return (
    <div className="fade-in">
      <h1 className="heading">셀러 현황</h1>
      <p className="subheading">{new Date().toLocaleDateString('ko-KR', { year:'numeric', month:'long', day:'numeric' })}</p>

      {/* Stats */}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${mobile?2:5},1fr)`, gap:10, marginBottom:24 }}>
        {stats.map(({ label, val, sub, onClick }) => (
          <div key={label} onClick={onClick} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:16, cursor:onClick?'pointer':'default', transition:'border-color 0.2s' }}
            onMouseEnter={onClick?e=>e.currentTarget.style.borderColor=T.gold:undefined}
            onMouseLeave={onClick?e=>e.currentTarget.style.borderColor=T.border:undefined}
          >
            <div style={{ fontSize:'0.68rem', color:T.muted, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>{label}</div>
            <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.3rem', fontWeight:600, color:T.cream, marginBottom:4 }}>{val}</div>
            <div style={{ fontSize:'0.68rem', color:T.muted }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* 음용 적기 요약 — 클릭 시 음용 적기 탭으로 이동 */}
      {(declineList.length > 0 || peakList.length > 0) && (
        <div style={{ display:'grid', gridTemplateColumns: mobile?'1fr':'repeat(2,1fr)', gap:12, marginBottom:24 }}>
          {[
            { list: declineList, bottles: declineBottles, title:'빨리 마셔야', icon:'⚪', color:T.muted },
            { list: peakList,    bottles: peakBottles,    title:'지금 절정',   icon:'🟢', color:'#4a8a5e' },
          ].filter(c => c.list.length > 0).map(c => (
            <div key={c.title} onClick={() => setTab('drinking')} style={{ background:c.color+'18', border:`1px solid ${c.color}44`, borderRadius:12, padding:16, cursor:'pointer', transition:'border-color 0.2s' }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=c.color}
              onMouseLeave={e=>e.currentTarget.style.borderColor=c.color+'44'}
            >
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:'0.78rem', color:c.color, fontWeight:700 }}>{c.icon} {c.title}</span>
                <span style={{ fontSize:'0.72rem', color:T.muted }}>{c.list.length}종 {c.bottles}병 ›</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                {c.list.slice(0,4).map(g => (
                  <div key={`${g.name}-${g.vintage}`} style={{ fontSize:'0.8rem', color:T.cream, display:'flex', justifyContent:'space-between', gap:8 }}>
                    <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{g.name}{g.vintage ? ` ${g.vintage}` : ''}</span>
                    <span style={{ color:c.color, flexShrink:0 }}>{g.qty}병</span>
                  </div>
                ))}
                {c.list.length > 4 && <div style={{ fontSize:'0.72rem', color:T.muted, marginTop:2 }}>외 {c.list.length - 4}종…</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 가치 비교 */}
      {marketValue > 0 && (
        <div style={{ background:T.card, border:`1px solid ${T.gold}44`, borderRadius:12, padding:18, marginBottom:24 }}>
          <div style={{ fontSize:'0.75rem', color:T.gold, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12, fontWeight:600 }}>💰 셀러 가치 분석</div>
          <div style={{ display:'flex', gap:mobile?12:32, flexWrap:'wrap', alignItems:'center' }}>
            <div><div style={{ fontSize:'0.7rem', color:T.muted, marginBottom:4 }}>구매가 합계</div><div style={{ fontSize:'1.1rem', fontWeight:600, color:T.cream }}>{krw(purchaseValue)}</div></div>
            <div style={{ fontSize:'1.2rem', color:T.muted }}>→</div>
            <div><div style={{ fontSize:'0.7rem', color:T.muted, marginBottom:4 }}>현재 시장가 합계</div><div style={{ fontSize:'1.3rem', fontWeight:700, color:T.gold }}>{krw(marketValue)}</div></div>
            {valued.length > 0 && (
              <div style={{ background:(valuedGain>=0?'#4a8a5e':'#c0392b')+'22', border:`1px solid ${valuedGain>=0?'#4a8a5e':'#c0392b'}`, borderRadius:8, padding:'6px 12px' }}>
                <div style={{ fontSize:'0.7rem', color:valuedGain>=0?'#4a8a5e':'#c0392b' }}>평가 차익</div>
                <div style={{ fontSize:'1rem', fontWeight:700, color:valuedGain>=0?'#4a8a5e':'#c0392b' }}>{valuedGain>=0?'+':''}{krw(valuedGain)}</div>
              </div>
            )}
          </div>
          <div style={{ fontSize:'0.68rem', color:T.muted, marginTop:10, lineHeight:1.5 }}>
            ※ 평가 차익은 구매가·시장가가 모두 등록된 {valued.length}종 기준입니다. (구매가 합계·시장가 합계는 전체 와인 기준)
          </div>
        </div>
      )}

      {/* 알림 */}
      {(drinkNow.length > 0 || lowStock.length > 0) && (
        <div style={{ display:'grid', gridTemplateColumns:mobile?'1fr':`repeat(${[drinkNow.length>0, lowStock.length>0].filter(Boolean).length},1fr)`, gap:12, marginBottom:24 }}>
          {drinkNow.length > 0 && (
            <div style={{ background:'#4a8a5e18', border:'1px solid #4a8a5e44', borderRadius:12, padding:16 }}>
              <div style={{ fontSize:'0.72rem', color:'#4a8a5e', fontWeight:600, marginBottom:10 }}>🟢 지금 마시기 좋은 와인 ({drinkNow.length}종)</div>
              <div style={{ maxHeight:200, overflowY:'auto' }}>
                {drinkNow.map(w => (
                  <div key={w.id} onClick={() => openDetail && openDetail(w.id)} style={{ fontSize:'0.8rem', color:T.cream, display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${T.border}`, cursor:'pointer', transition:'color 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.color=T.gold}
                    onMouseLeave={e=>e.currentTarget.style.color=T.cream}
                  >
                    <span style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}</span>
                      {bottleBadge(w.bottleSize) && <span style={{ color:T.wineLight, fontWeight:600, fontSize:'0.72rem', flexShrink:0 }}>{bottleBadge(w.bottleSize)}</span>}
                    </span>
                    <span style={{ color:T.gold, flexShrink:0, marginLeft:8 }}>{w.vintage}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {lowStock.length > 0 && (
            <div style={{ background:T.wine+'18', border:`1px solid ${T.wine}44`, borderRadius:12, padding:16 }}>
              <div style={{ fontSize:'0.72rem', color:T.wineLight, fontWeight:600, marginBottom:10 }}>⚠️ 재고 1병 이하 ({lowStock.length}종)</div>
              <div style={{ maxHeight:200, overflowY:'auto' }}>
                {lowStock.map(w => (
                  <div key={w.id} onClick={() => openDetail && openDetail(w.id)} style={{ fontSize:'0.8rem', color:T.cream, display:'flex', justifyContent:'space-between', padding:'7px 0', borderBottom:`1px solid ${T.border}`, cursor:'pointer', transition:'color 0.15s' }}
                    onMouseEnter={e=>e.currentTarget.style.color=T.wineLight}
                    onMouseLeave={e=>e.currentTarget.style.color=T.cream}
                  >
                    <span style={{ display:'flex', alignItems:'center', gap:6, minWidth:0 }}>
                      <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}</span>
                      {bottleBadge(w.bottleSize) && <span style={{ color:T.wineLight, fontWeight:600, fontSize:'0.72rem', flexShrink:0 }}>{bottleBadge(w.bottleSize)}</span>}
                    </span>
                    <span style={{ color:T.wineLight, flexShrink:0, marginLeft:8 }}>{w.qty || 1}병 남음</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 추천 와인 */}
      {recommended.length > 0 && (
        <div style={{ marginBottom:24 }}>
          <h2 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem', color:T.cream, marginBottom:12 }}>⭐ 오늘의 추천 — 지금 마시기 좋은 와인</h2>
          <div style={{ display:'grid', gridTemplateColumns:mobile?'1fr':'repeat(3,1fr)', gap:12 }}>
            {recommended.map(w => {
              const s = getDrinkingStatus(w)
              return (
                <div key={w.id} onClick={() => openDetail && openDetail(w.id)} style={{ background:T.card, border:`1px solid ${T.gold}44`, borderRadius:12, padding:16, cursor:'pointer', transition:'border-color 0.2s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold}
                  onMouseLeave={e=>e.currentTarget.style.borderColor=T.gold+'44'}
                >
                  <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:4 }}>
                    <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1rem', fontWeight:600, color:T.cream, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}</div>
                    {bottleBadge(w.bottleSize) && <span style={{ fontSize:'0.7rem', color:T.wineLight, fontWeight:600, flexShrink:0 }}>{bottleBadge(w.bottleSize)}</span>}
                  </div>
                  <div style={{ color:T.gold, fontWeight:600, marginBottom:6 }}>{w.vintage}</div>
                  {s && <div style={{ fontSize:'0.72rem', color:s.color, background:s.color+'22', borderRadius:6, padding:'3px 8px', display:'inline-block', marginBottom:8 }}>{s.icon} {s.label}</div>}
                  {s?.from && <div style={{ fontSize:'0.7rem', color:T.muted }}>음용 적기: {s.from}~{s.to}년</div>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* 셀러별 현황 */}
      <h2 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.1rem', color:T.cream, marginBottom:14 }}>셀러별 현황</h2>
      <div style={{ display:'grid', gridTemplateColumns:mobile?'1fr':'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>
        {CELLARS.map(c => {
          const slots    = getSlots(c)
          const cWines   = wines.filter(w => w.cellarId === c.id)
          const totalB   = cWines.reduce((s,w) => s + (w.qty||1), 0)
          const usedN    = slots.filter(s => bottlesIn(c.id, s) > 0).length
          const pct      = Math.round(totalB / (c.slots * c.maxPerSlot) * 100) || 0
          const mval     = cWines.reduce((s,w) => s + (w.wineSearcherPrice||0)*(w.qty||1), 0)
          return (
            <div key={c.id} style={{ background:T.card, border:`1px solid ${T.border}`, borderRadius:12, padding:20, cursor:'pointer', transition:'border-color 0.2s' }}
              onClick={() => { setCellarId(c.id); setTab('cellar') }}
              onMouseEnter={e=>e.currentTarget.style.borderColor=T.gold}
              onMouseLeave={e=>e.currentTarget.style.borderColor=T.border}
            >
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                <div>
                  <div style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.05rem', fontWeight:600, color:T.cream }}>{c.name}</div>
                  <div style={{ fontSize:'0.7rem', color:T.muted, marginTop:2 }}>{c.slots}칸 · 칸당 max {c.maxPerSlot}병</div>
                </div>
                <span style={{ background:T.gold+'22', color:T.gold, border:`1px solid ${T.gold}44`, borderRadius:4, padding:'2px 8px', fontSize:'0.7rem', fontWeight:600 }}>{pct}%</span>
              </div>
              <div style={{ background:T.surface, borderRadius:4, height:5, marginBottom:10, overflow:'hidden' }}>
                <div style={{ height:'100%', borderRadius:4, background:`linear-gradient(90deg,${T.wine},${T.gold})`, width:`${pct}%` }} />
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:10 }}>
                <div style={{ fontSize:'0.75rem', color:T.muted }}>보관 중 <strong style={{ color:T.cream }}>{totalB}병</strong></div>
                <div style={{ fontSize:'0.75rem', color:T.muted }}>사용 칸 <strong style={{ color:T.cream }}>{usedN}/{c.slots}</strong></div>
              </div>
              {mval > 0 && <div style={{ fontSize:'0.72rem', color:T.gold }}>셀러 시장가 {krw(mval)}</div>}
              <div style={{ display:'flex', flexDirection:'column', gap:3, marginTop:8 }}>
                {slots.map(s => {
                  const b = bottlesIn(c.id, s)
                  const r = b / c.maxPerSlot
                  return (
                    <div key={s} style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <div style={{ fontSize:'0.55rem', color:T.muted, width:14, textAlign:'right', flexShrink:0 }}>{s}</div>
                      <div style={{ flex:1, height:5, background:T.surface, borderRadius:3, overflow:'hidden' }}>
                        <div style={{ height:'100%', borderRadius:3, background:r>=0.8?T.wineLight:T.gold, width:`${Math.min(r*100,100)}%`, opacity:r>0?1:0 }} />
                      </div>
                      <div style={{ fontSize:'0.55rem', color:T.muted, width:18, flexShrink:0 }}>{b||''}</div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

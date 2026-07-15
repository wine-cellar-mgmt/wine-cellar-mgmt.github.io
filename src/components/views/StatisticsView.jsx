import { useMemo } from 'react'
import { CELLARS, T } from '../../config/cellars.js'
import { useIsMobile } from '../ui.jsx'

// ── Statistics View ──────────────────────────────────────────────
export function StatisticsView({ wines, drinkLog }) {
  const mobile = useIsMobile()
  const krw = n => n ? '₩' + Number(n).toLocaleString('ko-KR') : '-'
  const year = new Date().getFullYear()

  // 무거운 집계는 wines/drinkLog가 바뀔 때만 재계산
  const S = useMemo(() => {
    // "회"는 자리(세션) 단위, "병"은 실제 마신 병 수(레코드 수) — Dashboard와 동일 기준
    const occKey = r => r.sessionId || `solo_${r.id}`
    const monthlyData = {}
    drinkLog.forEach(r => {
      if (!r.date) return
      const ym = r.date.substring(0, 7)
      if (!monthlyData[ym]) monthlyData[ym] = { occ: new Set(), bottles: 0 }
      monthlyData[ym].occ.add(occKey(r))
      monthlyData[ym].bottles++
    })
    const months = Object.entries(monthlyData)
      .map(([ym, d]) => [ym, d.occ.size, d.bottles])
      .sort((a,b) => b[0].localeCompare(a[0])).slice(0, 12)

    const totalOccasions = new Set(drinkLog.map(occKey)).size
    const yearLogs = drinkLog.filter(r => r.date?.startsWith(String(year)))
    const yearOccasions = new Set(yearLogs.map(occKey)).size
    const yearBottles = yearLogs.length

    const wineCount = {}
    drinkLog.forEach(r => { wineCount[r.wineName] = (wineCount[r.wineName] || 0) + 1 })
    const topWines = Object.entries(wineCount).sort((a,b) => b[1]-a[1]).slice(0, 5)

    // 함께 마신 사람은 같은 자리에서 여러 병을 마셔도 1회로 집계
    const companionCount = {}
    const seenCompanion = new Set()
    drinkLog.forEach(r => {
      if (!r.companions) return
      r.companions.split(/[,，、\s]+/).filter(Boolean).forEach(c => {
        const name = c.trim(), key = name + '|' + occKey(r)
        if (seenCompanion.has(key)) return
        seenCompanion.add(key)
        companionCount[name] = (companionCount[name] || 0) + 1
      })
    })
    const topCompanions = Object.entries(companionCount).sort((a,b) => b[1]-a[1]).slice(0, 5)

    const rated = drinkLog.filter(r => r.rating > 0)
    const avgRating = rated.length ? (rated.reduce((s,r) => s+r.rating, 0) / rated.length).toFixed(1) : '-'

    const totalPurchase = wines.reduce((s,w) => s + (w.price||0)*(w.qty||1), 0)
    const totalMarket   = wines.reduce((s,w) => s + (w.wineSearcherPrice||0)*(w.qty||1), 0)
    const totalBottles  = wines.reduce((s,w) => s + (w.qty||1), 0)

    // 평가 차익·수익률은 구매가·시장가가 모두 있는 와인만 비교 (한쪽만 있으면 왜곡되므로 제외)
    const valued         = wines.filter(w => (w.price||0) > 0 && (w.wineSearcherPrice||0) > 0)
    const valuedBottles  = valued.reduce((s,w) => s + (w.qty||1), 0)
    const valuedPurchase = valued.reduce((s,w) => s + w.price*(w.qty||1), 0)
    const valuedMarket   = valued.reduce((s,w) => s + w.wineSearcherPrice*(w.qty||1), 0)
    const valuedGain     = valuedMarket - valuedPurchase
    const profitRate     = valuedPurchase > 0 ? (valuedGain / valuedPurchase * 100) : 0

    // ── 컬렉션 가치 평가 ──────────────────────────────────────────
    const WINE_TYPE_LABEL = { red: '레드', white: '화이트', sparkling: '스파클링', rose: '로제', 'rosé': '로제', dessert: '디저트', fortified: '주정강화', orange: '오렌지' }

    // 1) 셀러별 가치 (수익률은 구매가·시장가 모두 있는 와인만)
    const cellarValues = CELLARS.map(c => {
      const cw = wines.filter(w => w.cellarId === c.id)
      const purchase = cw.reduce((s, w) => s + (w.price || 0) * (w.qty || 1), 0)
      const market   = cw.reduce((s, w) => s + (w.wineSearcherPrice || 0) * (w.qty || 1), 0)
      const bottles  = cw.reduce((s, w) => s + (w.qty || 1), 0)
      const cv  = cw.filter(w => (w.price || 0) > 0 && (w.wineSearcherPrice || 0) > 0)
      const cvP = cv.reduce((s, w) => s + w.price * (w.qty || 1), 0)
      const cvM = cv.reduce((s, w) => s + w.wineSearcherPrice * (w.qty || 1), 0)
      const rate = cvP > 0 ? (cvM - cvP) / cvP * 100 : null
      return { c, purchase, market, bottles, rate }
    })

    // 2) 보유 가치 TOP 와인 (시장가 병당 × 수량)
    const topValue = wines
      .filter(w => (w.wineSearcherPrice || 0) > 0)
      .map(w => ({ w, total: w.wineSearcherPrice * (w.qty || 1) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    // 3) 평가차익 상위/하위 (구매가·시장가 모두 있는 와인만, % 기준)
    const gainList = wines
      .filter(w => (w.price || 0) > 0 && (w.wineSearcherPrice || 0) > 0)
      .map(w => ({ w, gain: (w.wineSearcherPrice - w.price) * (w.qty || 1), rate: (w.wineSearcherPrice - w.price) / w.price * 100 }))
    const topGain = [...gainList].sort((a, b) => b.rate - a.rate).slice(0, 3)
    const topLoss = [...gainList].sort((a, b) => a.rate - b.rate).filter(x => x.rate < 0).slice(0, 3)

    // 4) 타입·국가별 시장가 분포
    const byType = {}, byCountry = {}
    wines.forEach(w => {
      const v = (w.wineSearcherPrice || 0) * (w.qty || 1)
      if (v <= 0) return
      const t  = WINE_TYPE_LABEL[w.wineType] || w.wineType || '미분류'
      const co = w.country || '미분류'
      byType[t]   = (byType[t] || 0) + v
      byCountry[co] = (byCountry[co] || 0) + v
    })
    const typeList    = Object.entries(byType).sort((a, b) => b[1] - a[1])
    const countryList = Object.entries(byCountry).sort((a, b) => b[1] - a[1])

    return {
      months, topWines, topCompanions, avgRating,
      totalOccasions, yearOccasions, yearBottles,
      totalPurchase, totalMarket, totalBottles,
      valued, valuedBottles, valuedGain, profitRate,
      cellarValues, topValue, gainList, topGain, topLoss,
      typeList, countryList,
    }
  }, [wines, drinkLog])

  const { months, topWines, topCompanions, avgRating, totalOccasions, yearOccasions, yearBottles,
    totalPurchase, totalMarket, totalBottles,
    valued, valuedBottles, valuedGain, profitRate, cellarValues, topValue, gainList, topGain, topLoss,
    typeList, countryList } = S
  const distTotal = totalMarket

  const Card = ({ title, children }) => (
    <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius:12, padding:20, marginBottom:16 }}>
      <div style={{ fontSize:'0.75rem', color:T.gold, textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:14, fontWeight:600 }}>{title}</div>
      {children}
    </div>
  )

  return (
    <div className="fade-in">
      <h1 className="heading">통계</h1>
      <p className="subheading">나의 와인 라이프 — 한눈에 보기</p>

      <Card title="셀러 현황">
        <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fit,minmax(140px,1fr))`, gap:12 }}>
          {[
            ['총 보관 병 수', `${totalBottles}병`],
            ['와인 기록 수', `${wines.length}종`],
            ['구매가 합계', krw(totalPurchase)],
            ['시장가 합계', krw(totalMarket)],
            ['평가 차익', valuedGain>=0 ? '+'+krw(valuedGain) : krw(valuedGain)],
            ['수익률', `${profitRate>=0?'+':''}${profitRate.toFixed(1)}%`],
          ].map(([k,v]) => (
            <div key={k} style={{ background:T.surface, borderRadius:8, padding:'10px 12px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:'0.66rem', color:T.muted, marginBottom:5 }}>{k}</div>
              <div style={{ fontSize:'0.95rem', fontWeight:600, color: (k==='평가 차익'||k==='수익률') ? (valuedGain>=0?'#4a8a5e':'#c0392b') : T.cream }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize:'0.68rem', color:T.muted, marginTop:12, lineHeight:1.5 }}>
          ※ 평가 차익·수익률은 구매가와 시장가가 모두 등록된 {valued.length}종({valuedBottles}병) 기준입니다.
          {valued.length < wines.length && ' 시장가나 구매가가 비어 있는 와인은 비교에서 제외됩니다.'}
        </div>
      </Card>

      <Card title="음주 기록 요약">
        <div style={{ display:'grid', gridTemplateColumns:`repeat(auto-fit,minmax(120px,1fr))`, gap:12 }}>
          {[
            ['총 음주 횟수', `${totalOccasions}회`],
            ['총 마신 병 수', `${drinkLog.length}병`],
            ['평균 평점', `${avgRating}점`],
            [`${year}년 음주`, `${yearOccasions}회 · ${yearBottles}병`],
          ].map(([k,v]) => (
            <div key={k} style={{ background:T.surface, borderRadius:8, padding:'10px 12px', border:`1px solid ${T.border}` }}>
              <div style={{ fontSize:'0.66rem', color:T.muted, marginBottom:5 }}>{k}</div>
              <div style={{ fontSize:'0.95rem', fontWeight:600, color:T.cream }}>{v}</div>
            </div>
          ))}
        </div>
      </Card>

      {months.length > 0 && (
        <Card title="월별 음주 (최근 12개월)">
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {months.map(([ym, occ, cnt]) => {
              const max = Math.max(...months.map(m=>m[2]))
              return (
                <div key={ym} style={{ display:'flex', gap:10, alignItems:'center' }}>
                  <div style={{ fontSize:'0.78rem', color:T.muted, width:60, flexShrink:0 }}>{ym}</div>
                  <div style={{ flex:1, height:'100%', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:20, borderRadius:4, background:`linear-gradient(90deg,${T.wine},${T.gold})`, width:`${cnt/max*100}%`, display:'flex', alignItems:'center', paddingLeft:8 }}>
                      <span style={{ fontSize:'0.7rem', color:T.cream, fontWeight:600, whiteSpace:'nowrap' }}>{occ}회 · {cnt}병</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>
      )}

      {topWines.length > 0 && (
        <Card title="제일 많이 마신 와인 TOP 5">
          {topWines.map(([name, cnt], i) => (
            <div key={name} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:i<topWines.length-1?`1px solid ${T.border}`:'none' }}>
              <div style={{ width:24, height:24, borderRadius:'50%', background:i===0?T.gold:T.surface, border:`1px solid ${i===0?T.gold:T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.72rem', color:i===0?T.bg:T.muted, fontWeight:700 }}>{i+1}</div>
              <div style={{ flex:1, fontSize:'0.88rem', color:T.cream }}>{name}</div>
              <div style={{ fontSize:'0.82rem', color:T.gold, fontWeight:600 }}>{cnt}병</div>
            </div>
          ))}
        </Card>
      )}

      {topCompanions.length > 0 && (
        <Card title="함께 마신 TOP 5">
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {topCompanions.map(([name, cnt]) => (
              <div key={name} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:20, padding:'6px 14px', display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ fontSize:'0.82rem', color:T.cream }}>{name}</span>
                <span style={{ fontSize:'0.72rem', color:T.gold, fontWeight:600 }}>{cnt}번</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ── 컬렉션 가치 평가 ── */}
      {totalMarket > 0 && (
        <>
          <h2 style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.15rem', color:T.gold, margin:'24px 0 12px' }}>💰 컬렉션 가치 평가</h2>

          <Card title="셀러별 가치">
            <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
              {cellarValues.map(({ c, purchase, market, bottles, rate }) => (
                <div key={c.id} style={{ display:'grid', gridTemplateColumns: mobile?'1fr 1fr':'1.3fr 1fr 1fr 0.7fr', gap:8, alignItems:'center', padding:'8px 0', borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ fontSize:'0.85rem', color:T.cream, fontWeight:600 }}>{c.name}<span style={{ color:T.muted, fontWeight:400, fontSize:'0.72rem', marginLeft:6 }}>{bottles}병</span></div>
                  <div style={{ fontSize:'0.76rem', color:T.muted }}>구매가 <span style={{ color:T.text }}>{krw(purchase)}</span></div>
                  <div style={{ fontSize:'0.76rem', color:T.muted }}>시장가 <span style={{ color:T.gold, fontWeight:600 }}>{krw(market)}</span></div>
                  <div style={{ fontSize:'0.82rem', fontWeight:700, textAlign: mobile?'left':'right', color: rate==null ? T.muted : rate>=0 ? '#4a8a5e' : '#c0392b' }}>{rate==null ? '-' : `${rate>=0?'+':''}${rate.toFixed(1)}%`}</div>
                </div>
              ))}
            </div>
          </Card>

          <Card title="보유 가치 TOP 5 (시장가 기준)">
            {topValue.length === 0 ? <div style={{ color:T.muted, fontSize:'0.82rem' }}>시장가가 등록된 와인이 없습니다</div> :
              topValue.map(({ w, total }, i) => (
                <div key={w.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 0', borderBottom:i<topValue.length-1?`1px solid ${T.border}`:'none' }}>
                  <div style={{ width:22, height:22, borderRadius:'50%', background:i===0?T.gold:T.surface, border:`1px solid ${i===0?T.gold:T.border}`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:'0.7rem', color:i===0?T.bg:T.muted, fontWeight:700, flexShrink:0 }}>{i+1}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:'0.85rem', color:T.cream, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}{w.vintage?` ${w.vintage}`:''}</div>
                    <div style={{ fontSize:'0.7rem', color:T.muted }}>병당 {krw(w.wineSearcherPrice)} × {w.qty||1}병</div>
                  </div>
                  <div style={{ fontSize:'0.88rem', color:T.gold, fontWeight:700, flexShrink:0 }}>{krw(total)}</div>
                </div>
              ))
            }
          </Card>

          {gainList.length > 0 && (
            <Card title="평가차익 상위 / 하위">
              <div style={{ display:'grid', gridTemplateColumns: mobile?'1fr':'1fr 1fr', gap:16 }}>
                <div>
                  <div style={{ fontSize:'0.72rem', color:'#4a8a5e', fontWeight:600, marginBottom:8 }}>📈 가장 많이 오른</div>
                  {topGain.map(({ w, rate }) => (
                    <div key={w.id} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'5px 0', fontSize:'0.8rem' }}>
                      <span style={{ color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}{w.vintage?` ${w.vintage}`:''}</span>
                      <span style={{ color:'#4a8a5e', fontWeight:700, flexShrink:0 }}>+{rate.toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ fontSize:'0.72rem', color:'#c0392b', fontWeight:600, marginBottom:8 }}>📉 가장 많이 내린</div>
                  {topLoss.length===0 ? <div style={{ fontSize:'0.78rem', color:T.muted }}>하락한 와인 없음</div> :
                    topLoss.map(({ w, rate }) => (
                      <div key={w.id} style={{ display:'flex', justifyContent:'space-between', gap:8, padding:'5px 0', fontSize:'0.8rem' }}>
                        <span style={{ color:T.text, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{w.name}{w.vintage?` ${w.vintage}`:''}</span>
                        <span style={{ color:'#c0392b', fontWeight:700, flexShrink:0 }}>{rate.toFixed(0)}%</span>
                      </div>
                    ))
                  }
                </div>
              </div>
              <div style={{ fontSize:'0.68rem', color:T.muted, marginTop:10 }}>※ 구매가·시장가가 모두 등록된 와인만 비교합니다.</div>
            </Card>
          )}

          <Card title="타입·국가별 가치 분포">
            <div style={{ display:'grid', gridTemplateColumns: mobile?'1fr':'1fr 1fr', gap:16 }}>
              <div>
                <div style={{ fontSize:'0.72rem', color:T.muted, marginBottom:8 }}>타입별</div>
                {typeList.length===0 ? <div style={{ fontSize:'0.78rem', color:T.muted }}>-</div> :
                  typeList.map(([k, v]) => (
                    <div key={k} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.76rem', marginBottom:3 }}><span style={{ color:T.cream }}>{k}</span><span style={{ color:T.gold }}>{krw(v)} ({distTotal>0?Math.round(v/distTotal*100):0}%)</span></div>
                      <div style={{ height:6, background:T.surface, borderRadius:3, overflow:'hidden' }}><div style={{ height:'100%', borderRadius:3, background:`linear-gradient(90deg,${T.wine},${T.gold})`, width:`${distTotal>0?v/distTotal*100:0}%` }} /></div>
                    </div>
                  ))
                }
              </div>
              <div>
                <div style={{ fontSize:'0.72rem', color:T.muted, marginBottom:8 }}>국가별</div>
                {countryList.length===0 ? <div style={{ fontSize:'0.78rem', color:T.muted }}>-</div> :
                  countryList.slice(0, 6).map(([k, v]) => (
                    <div key={k} style={{ marginBottom:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.76rem', marginBottom:3 }}><span style={{ color:T.cream }}>{k}</span><span style={{ color:T.gold }}>{krw(v)} ({distTotal>0?Math.round(v/distTotal*100):0}%)</span></div>
                      <div style={{ height:6, background:T.surface, borderRadius:3, overflow:'hidden' }}><div style={{ height:'100%', borderRadius:3, background:`linear-gradient(90deg,${T.goldDim},${T.gold})`, width:`${distTotal>0?v/distTotal*100:0}%` }} /></div>
                    </div>
                  ))
                }
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  )
}

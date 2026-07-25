import { useState, useMemo } from 'react'
import { cellarById, T, krw, bottleBadge, textMatchesQuery, callAI } from '../../config/cellars.js'

const UNCLASSIFIED = '미분류'

// ── 국가/지역 표기 정규화 (로컬, AI 불필요) ──────────────────────
// DB 값은 건드리지 않고 그룹핑 키로만 사용한다. "프랑스 (France)"·"France"·"프랑스"가
// 같은 노드로 묶이도록. 표기가 제각각인 기존 데이터를 안전하게 통합하는 목적.
function latinize(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const m = t.match(/\(([^)]*[A-Za-z][^)]*)\)/) // 괄호 안 로마자 우선
  return (m ? m[1] : t).trim()
}

const COUNTRY_MAP = [
  [/france|프랑스/i, 'France'],
  [/united states|\busa\b|\bus\b|america|미국/i, 'USA'],
  [/new zealand|뉴질랜드/i, 'New Zealand'],
  [/italy|이탈리아|이태리/i, 'Italy'],
  [/spain|스페인/i, 'Spain'],
  [/chile|칠레/i, 'Chile'],
  [/australia|호주|오스트레일리아/i, 'Australia'],
  [/germany|독일/i, 'Germany'],
  [/argentina|아르헨티나/i, 'Argentina'],
  [/portugal|포르투갈/i, 'Portugal'],
  [/south africa|남아공|남아프리카/i, 'South Africa'],
]

export function canonCountry(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  for (const [re, name] of COUNTRY_MAP) if (re.test(t)) return name
  return latinize(t)
}

// 지역은 가장 구체적인 아펠라시옹 우선. "Pauillac, Bordeaux" → "Pauillac"로 상위 꼬리표 제거.
export function canonRegion(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const s = latinize(t).split(',')[0].trim()
  return s || latinize(t)
}

const FLAG = {
  France: '🇫🇷', USA: '🇺🇸', 'New Zealand': '🇳🇿', Italy: '🇮🇹', Spain: '🇪🇸',
  Chile: '🇨🇱', Australia: '🇦🇺', Germany: '🇩🇪', Argentina: '🇦🇷',
  Portugal: '🇵🇹', 'South Africa': '🇿🇦',
}

// ── 와인 이름으로 생산자·지역 검색 (callAI=callProxy 경유, web_search 필수) ──
// searchOnePrice 패턴을 따름: pause_turn 이어가기는 callProxy 내부 처리,
// 마지막 완성 JSON 객체만 파싱. max_tokens는 잘림 방지 위해 3000.
async function searchOneWineInfo(name, vintage, category = 'wine') {
  const q = `${name}${vintage ? ' ' + vintage : ''}`
  const prompt = `${category === 'whisky' ? '위스키' : '와인'} "${q}"의 생산자와 원산지를 검색하여 JSON만 반환 (마크다운 없이):
{"producer":null,"region":null,"country":null,"grape":null}

- producer: 생산자/와이너리명 (영문 표준 표기, 예: "Moët & Chandon")
- region: 가장 구체적인 지역/아펠라시옹 (영문, 예: "Champagne", "Pauillac", "Chablis")
- country: 국가명 영문 단일 표기 (예: "France", "USA", "New Zealand"). 한글이나 괄호 병기 금지.
- grape: 주요 품종 영문 (모르면 null)
- 확실하지 않은 필드는 반드시 null
숫자·군더더기 없이 값만. 응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
  const data = await callAI(
    [{ role: 'user', content: prompt }],
    3000,
    [{ type: 'web_search_20250305', name: 'web_search' }]
  )
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const cleaned = text.replace(/```json|```/g, '').trim()
  const candidates = cleaned.match(/\{[^{}]*\}/g)
  if (candidates) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      try { return JSON.parse(candidates[i]) } catch { /* 다음 후보 */ }
    }
  }
  console.warn('[InfoFill] JSON 추출 실패:', text.slice(0, 300))
  return null
}

const bottles = arr => arr.reduce((s, w) => s + (w.qty || 1), 0)

// ── Producer View ────────────────────────────────────────────────
export function ProducerView({ wines, openDetail, openDrink, goSlot, onUpdate }) {
  const [expandedC, setExpandedC] = useState(() => new Set())
  const [expandedR, setExpandedR] = useState(() => new Set())
  const [regionFilter, setRegionFilter] = useState('')
  const [producerFilter, setProducerFilter] = useState('')
  const [q, setQ] = useState('')
  const [filling, setFilling] = useState(false)
  const [progress, setProgress] = useState({ current: 0, total: 0, name: '' })
  const [doneMsg, setDoneMsg] = useState('')

  const autoExpand = !!(regionFilter || producerFilter || q.trim())

  const missing = useMemo(
    () => wines.filter(w => !(w.producer || '').trim()),
    [wines]
  )

  const regionOptions = useMemo(() => {
    const s = new Set()
    wines.forEach(w => { const r = canonRegion(w.region); if (r) s.add(r) })
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [wines])

  const producerOptions = useMemo(() => {
    const s = new Set()
    wines.forEach(w => { const p = (w.producer || '').trim(); if (p) s.add(p) })
    return [...s].sort((a, b) => a.localeCompare(b))
  }, [wines])

  const filtered = useMemo(() => wines.filter(w => {
    if (regionFilter && canonRegion(w.region) !== regionFilter) return false
    if (producerFilter && (w.producer || '').trim() !== producerFilter) return false
    if (q.trim()) {
      const hay = [w.producer, w.region, w.country, w.name].filter(Boolean).join(' ')
      if (!textMatchesQuery(hay, q)) return false
    }
    return true
  }), [wines, regionFilter, producerFilter, q])

  // 국가 → 지역 → 생산자 3단 트리
  const tree = useMemo(() => {
    const map = new Map()
    for (const w of filtered) {
      const country = canonCountry(w.country) || UNCLASSIFIED
      const region = canonRegion(w.region) || UNCLASSIFIED
      const producer = (w.producer || '').trim() || UNCLASSIFIED
      if (!map.has(country)) map.set(country, new Map())
      const rm = map.get(country)
      if (!rm.has(region)) rm.set(region, new Map())
      const pm = rm.get(region)
      if (!pm.has(producer)) pm.set(producer, [])
      pm.get(producer).push(w)
    }
    return map
  }, [filtered])

  // 정렬: 미분류는 항상 마지막, 나머지는 병 수 내림차순
  const rank = (name, count) => name === UNCLASSIFIED ? [1, 0] : [0, -count]
  const sortEntries = (entries, countOf) => [...entries].sort((a, b) => {
    const ra = rank(a[0], countOf(a[1])), rb = rank(b[0], countOf(b[1]))
    return ra[0] - rb[0] || ra[1] - rb[1] || a[0].localeCompare(b[0])
  })
  const flatWines = rmOrPm => {
    const out = []
    for (const v of rmOrPm.values()) {
      if (v instanceof Map) for (const arr of v.values()) out.push(...arr)
      else out.push(...v)
    }
    return out
  }

  function toggle(setFn, key) {
    setFn(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }
  function collapseAll() { setExpandedC(new Set()); setExpandedR(new Set()) }

  async function fillMissing() {
    if (filling) return
    const targets = wines.filter(w => !(w.producer || '').trim())
    if (!targets.length) { setDoneMsg('채울 와인이 없습니다'); return }
    setFilling(true); setDoneMsg('')
    let ok = 0, fail = 0
    for (let i = 0; i < targets.length; i++) {
      const w = targets[i]
      setProgress({ current: i + 1, total: targets.length, name: w.name })
      try {
        const info = await searchOneWineInfo(w.name, w.vintage, w.category)
        const patch = {}
        if (info) {
          if (info.producer && !(w.producer || '').trim()) patch.producer = String(info.producer).trim()
          if (info.region && !(w.region || '').trim()) patch.region = String(info.region).trim()
          if (info.country && !(w.country || '').trim()) patch.country = String(info.country).trim()
          if (info.grape && !(w.grape || '').trim()) patch.grape = String(info.grape).trim()
        }
        if (Object.keys(patch).length) { await onUpdate(w.id, patch); ok++ }
        else fail++
      } catch { fail++ }
    }
    setFilling(false)
    setProgress({ current: 0, total: 0, name: '' })
    setDoneMsg(`완료 — 채움 ${ok}병 / 미확인 ${fail}병`)
  }

  function renderWine(w) {
    const c = cellarById(w.cellarId)
    return (
      <div key={w.id} onClick={() => openDetail(w.id)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', cursor: 'pointer', transition: 'background 0.12s' }}
        onMouseEnter={e => e.currentTarget.style.background = T.cardHover}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        {w.imageUrl
          ? <img src={w.imageUrl} alt="" style={{ width: 28, height: 40, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
          : <div style={{ width: 28, height: 40, background: T.surface, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem', border: `1px solid ${T.border}` }}>🍷</div>}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.85rem', color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
          <div style={{ fontSize: '0.7rem', color: T.muted, marginTop: 1, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {w.vintage && <span style={{ color: T.gold }}>{w.vintage}</span>}
            {bottleBadge(w.bottleSize) && <span style={{ color: T.wineLight, fontWeight: 600 }}>{bottleBadge(w.bottleSize)}</span>}
            <span>{w.qty || 1}병</span>
            {w.wineSearcherPrice > 0 && <span>시장가 {krw(w.wineSearcherPrice)}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => openDrink(w)} style={{ background: T.wine + '33', color: T.wineLight, border: `1px solid ${T.wine}`, padding: '5px 9px', borderRadius: 6, fontSize: '0.72rem', cursor: 'pointer' }}>마심</button>
          <button onClick={() => goSlot(w.cellarId, w.slot)} style={{ background: T.gold + '33', color: T.gold, border: `1px solid ${T.gold}`, padding: '5px 10px', borderRadius: 6, fontSize: '0.74rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>📍 {c?.name}</button>
        </div>
      </div>
    )
  }

  const countryEntries = sortEntries([...tree.entries()], flatWines)
  const missCount = bottles(missing)

  return (
    <div className="fade-in">
      <h1 className="heading">생산자</h1>
      <p className="subheading">국가 · 지역 · 생산자별로 컬렉션을 살펴보세요</p>

      {/* 정보 채우기 배너 */}
      {(missing.length > 0 || filling || doneMsg) && (
        <div style={{ background: T.card, border: `1px solid ${filling ? T.gold : T.goldDim}`, borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <span style={{ fontSize: '1.3rem' }}>{filling ? '⏳' : '✨'}</span>
          <div style={{ flex: 1, minWidth: 180 }}>
            {filling ? (
              <>
                <div style={{ fontSize: '0.82rem', color: T.cream, fontWeight: 500 }}>정보 채우는 중 — {progress.current}/{progress.total}</div>
                <div style={{ fontSize: '0.72rem', color: T.mutedMid, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{progress.name}</div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '0.82rem', color: T.cream, fontWeight: 500 }}>
                  {missing.length > 0 ? <>생산자 정보 없는 와인 <strong style={{ color: T.gold }}>{missing.length}종 ({missCount}병)</strong></> : '정보 채우기'}
                </div>
                <div style={{ fontSize: '0.72rem', color: T.mutedMid, marginTop: 2 }}>{doneMsg || '이름으로 생산자·지역을 검색해 채웁니다'}</div>
              </>
            )}
          </div>
          {missing.length > 0 && (
            <button onClick={fillMissing} disabled={filling} style={{ background: filling ? T.surface : T.gold, color: filling ? T.muted : T.bg, border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: '0.78rem', fontWeight: 600, cursor: filling ? 'default' : 'pointer', whiteSpace: 'nowrap' }}>
              {filling ? '진행 중…' : `✨ ${missing.length}종 정보 채우기`}
            </button>
          )}
        </div>
      )}

      {/* 필터 바 */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <select value={regionFilter} onChange={e => setRegionFilter(e.target.value)} style={{ background: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.75rem' }}>
          <option value="">지역 전체</option>
          {regionOptions.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={producerFilter} onChange={e => setProducerFilter(e.target.value)} style={{ background: T.card, color: T.text, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.75rem' }}>
          <option value="">생산자 전체</option>
          {producerOptions.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="지역·생산자 검색…" style={{ flex: 1, minWidth: 120, height: 'auto', padding: '6px 10px', fontSize: '0.75rem' }} />
        {(regionFilter || producerFilter || q) && (
          <button onClick={() => { setRegionFilter(''); setProducerFilter(''); setQ('') }} style={{ background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>필터 해제</button>
        )}
        <button onClick={collapseAll} style={{ background: 'transparent', color: T.muted, border: `1px solid ${T.border}`, borderRadius: 8, padding: '6px 10px', fontSize: '0.72rem', cursor: 'pointer' }}>전체 접기</button>
      </div>

      {countryEntries.length === 0 && (
        <div style={{ textAlign: 'center', padding: '48px 0', color: T.muted }}>표시할 와인이 없습니다</div>
      )}

      {/* 아코디언 트리 */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {countryEntries.map(([country, regionsMap]) => {
          const cWines = flatWines(regionsMap)
          const cOpen = autoExpand || expandedC.has(country)
          const isUn = country === UNCLASSIFIED
          const regionEntries = sortEntries([...regionsMap.entries()], flatWines)
          return (
            <div key={country} style={{ background: T.card, border: `1px solid ${cOpen ? T.borderBright : (isUn ? T.goldDim : T.border)}`, borderStyle: isUn ? 'dashed' : 'solid', borderRadius: 10, overflow: 'hidden' }}>
              <div onClick={() => toggle(setExpandedC, country)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: 'pointer', background: cOpen ? T.cardHover : 'transparent' }}>
                <span style={{ fontSize: '1.1rem' }}>{isUn ? '❓' : (FLAG[country] || '🌍')}</span>
                <span style={{ flex: 1, fontSize: '0.9rem', color: isUn ? T.mutedMid : T.cream, fontWeight: isUn ? 400 : 600 }}>{country}</span>
                <span style={{ fontSize: '0.72rem', color: isUn ? T.gold : T.muted }}>
                  {isUn ? `${bottles(cWines)}병 · 정보 채우기 필요` : `${regionsMap.size}개 지역 · ${bottles(cWines)}병`}
                </span>
                <span style={{ color: T.muted }}>{cOpen ? '▲' : '▼'}</span>
              </div>

              {cOpen && (
                <div className="slide-down" style={{ borderTop: `1px solid ${T.border}`, padding: '6px 0 6px 12px' }}>
                  {regionEntries.map(([region, producersMap]) => {
                    const rKey = country + '||' + region
                    const rWines = flatWines(producersMap)
                    const rOpen = autoExpand || expandedR.has(rKey)
                    const producerEntries = sortEntries([...producersMap.entries()], arr => arr)
                    return (
                      <div key={rKey} style={{ borderLeft: `2px solid ${rOpen ? T.wine : T.border}`, margin: '4px 8px' }}>
                        <div onClick={() => toggle(setExpandedR, rKey)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', cursor: 'pointer', background: rOpen ? T.cardHover : 'transparent', borderRadius: '0 8px 8px 0' }}>
                          <span style={{ flex: 1, fontSize: '0.82rem', color: T.cream }}>{region}</span>
                          <span style={{ fontSize: '0.68rem', color: T.muted }}>{producersMap.size}개 생산자 · {bottles(rWines)}병</span>
                          <span style={{ color: T.muted, fontSize: '0.8rem' }}>{rOpen ? '▲' : '▼'}</span>
                        </div>
                        {rOpen && (
                          <div style={{ padding: '2px 0 6px' }}>
                            {producerEntries.map(([producer, arr]) => (
                              <div key={producer}>
                                <div style={{ fontSize: '0.7rem', color: T.gold, fontWeight: 600, padding: '6px 16px 2px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                                  {producer} · {bottles(arr)}병
                                </div>
                                {arr.map(renderWine)}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

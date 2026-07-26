import { useState, useMemo } from 'react'
import { CELLARS, cellarById, T, krw, getDrinkingStatus, callAI, bottleBadge, openedBadge, nameFingerprint, priceGuardText } from '../../config/cellars.js'
import { useIsMobile } from '../ui.jsx'

// 음용 시기 상태 → 목록용 짧은 라벨 (칼럼이 좁으므로 축약; 전체 라벨은 title 툴팁으로)
function drinkShortLabel(s) {
  if (!s) return ''
  if (s.status === 'peak')    return '절정'
  if (s.status === 'ready')   return '좋음'
  if (s.status === 'decline') return '빨리'
  if (s.status === 'young')   return s.from ? `${s.from}년~` : '숙성중'
  return s.label
}

// 단일 와인 가격 검색 — callAI(=callProxy) 경유. API 키는 서버에만 존재.
// pause_turn 이어가기는 callProxy 내부에서 처리. 견고한 JSON 추출(마지막 완성 객체).
async function searchOnePrice(q, prevPrice = null, category = 'wine') {
  const whisky = category === 'whisky'
  const sources = whisky
    ? `가격 수집 방법 (700ml 기준):
- whiskybase.com / thewhiskyexchange.com 가격 조회
- dailyshot.co.kr 등 한국 주류 판매가 KRW 조회
- USD/GBP 가격은 현재 환율로 KRW 환산`
    : `가격 수집 방법 (750ml 기준):
- wine-searcher.com 한국(Korea) KRW 가격 조회
- dailyshot.co.kr KRW 가격 조회
- vivino.com USD 가격 조회 후 현재 환율로 KRW 환산`
  const prompt = `${whisky ? '위스키' : '와인'} "${q}"의 가격을 검색하여 JSON만 반환 (마크다운 없이):
{"wineSearcherPrice":null,"vivinoPrice":null,"vivinoRating":null}

${sources}

${priceGuardText(prevPrice)}
글로벌 USD 원본 → vivinoPrice${whisky ? ' (vivinoRating은 null)' : ''}
숫자만, 모르면 null
응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
  const data = await callAI(
    [{ role: 'user', content: prompt }],
    2000,
    [{ type: 'web_search_20250305', name: 'web_search' }]
  )
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const cleaned = text.replace(/\`\`\`json|\`\`\`/g, '').trim()
  // 완성된 JSON 객체들 중 마지막 것을 사용 (앞쪽 설명 텍스트 무시)
  const candidates = cleaned.match(/\{[^{}]*\}/g)
  if (candidates) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      try { return JSON.parse(candidates[i]) } catch { /* 다음 후보 */ }
    }
  }
  console.warn('[PriceUpdate] JSON 추출 실패:', text.slice(0, 300))
  return null
}

// ── List View ────────────────────────────────────────────────────
export function ListView({ wines, openDetail, openDrink, goSlot, onDeleteMany, onRename, onMerge }) {
  const mobile = useIsMobile()
  const [sort, setSort] = useState('name')
  const [filterCellar, setFilterCellar] = useState('')
  const [filterCategory, setFilterCategory] = useState('')  // '' 전체 | 'wine' 와인 | 'nonwine' 위스키·기타
  const [selected, setSelected] = useState(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)
  const [priceUpdating, setPriceUpdating] = useState(false)
  const [priceProgress, setPriceProgress] = useState({ current: 0, total: 0, name: '' })
  const [priceUpdateDone, setPriceUpdateDone] = useState(false)
  const [groupSimilar, setGroupSimilar] = useState(false)  // 비슷한 이름 묶기 모드
  const [chosenNames, setChosenNames] = useState({})        // 지문 → 통일할 이름

  const sorted = useMemo(() => [...wines]
    .filter(w => !filterCellar || w.cellarId === filterCellar)
    .filter(w => !filterCategory
      || (filterCategory === 'wine' ? (w.category || 'wine') === 'wine' : (w.category || 'wine') !== 'wine'))
    .sort((a, b) => {
      if (sort === 'name')    return (a.name || '').localeCompare(b.name || '', 'ko')
      if (sort === 'vintage') return (b.vintage || 0) - (a.vintage || 0)
      if (sort === 'price')   return (b.price || 0) - (a.price || 0)
      if (sort === 'market')  return (b.wineSearcherPrice || 0) - (a.wineSearcherPrice || 0)
      if (sort === 'date')    return new Date(b.purchaseDate || 0) - new Date(a.purchaseDate || 0)
      return 0
    }), [wines, filterCellar, filterCategory, sort])

  // 비슷한 이름 묶기 그룹 — 묶기 모드일 때만 계산
  const groupList = useMemo(() => {
    if (!groupSimilar) return []
    const groups = {}
    sorted.forEach(w => {
      const fp = nameFingerprint(w.name) || (w.name || '').trim()
      ;(groups[fp] = groups[fp] || []).push(w)
    })
    // 지문(핵심 이름) 기준 정렬 — 같은 생산자/와인의 형제(예: Dom Pérignon …)가 인접하게 모인다.
    // 지문이 같으면 표시 이름순으로 안정 정렬.
    return Object.entries(groups).sort((a, b) =>
      a[0].localeCompare(b[0], 'ko') || (a[1][0].name || '').localeCompare(b[1][0].name || '', 'ko'))
  }, [groupSimilar, sorted])

  const allSelected = sorted.length > 0 && sorted.every(w => selected.has(w.id))
  const toggleAll = () => {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(sorted.map(w => w.id)))
    }
  }
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  async function handleBulkDelete() {
    await onDeleteMany([...selected])
    setSelected(new Set())
    setConfirmBulkDelete(false)
  }

  async function handleBulkPriceUpdate(forceAll = false) {
    const targets = forceAll ? sorted : sorted.filter(w => !w.wineSearcherPrice)
    if (targets.length === 0) {
      alert('시장가가 없는 와인이 없습니다.')
      return
    }
    setPriceUpdating(true)
    setPriceUpdateDone(false)
    let ok = 0, fail = 0
    for (let i = 0; i < targets.length; i++) {
      const w = targets[i]
      setPriceProgress({ current: i + 1, total: targets.length, name: w.name })
      try {
        const q = w.vintage ? `${w.name} ${w.vintage}` : w.name
        const info = await searchOnePrice(q, w.wineSearcherPrice, w.category)
        if (info && (info.wineSearcherPrice || info.vivinoPrice || info.vivinoRating)) {
          // App.jsx의 updateWine은 커스텀 이벤트로 트리거 (리스너는 1회 등록, winesRef 참조)
          window.dispatchEvent(new CustomEvent('cave:priceUpdate', { detail: { id: w.id, ...info } }))
          ok++
        } else {
          fail++
          console.warn('[PriceUpdate] 가격 못 찾음:', w.name)
        }
      } catch(e) { fail++; console.error('[PriceUpdate]', w.name, e) }
      await new Promise(r => setTimeout(r, 2000))
    }
    setPriceUpdating(false)
    setPriceUpdateDone(true)
    if (fail > 0) alert(`시장가 업데이트: 성공 ${ok}건 / 실패 ${fail}건\n실패 목록은 브라우저 콘솔(F12)에서 확인할 수 있습니다.`)
    setTimeout(() => setPriceUpdateDone(false), 4000)
  }

  const COLS = '28px 48px 1.6fr 72px 56px 88px 140px 130px'

  return (
    <div className="fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        <div>
          <h1 className="heading">보관 목록</h1>
          <p style={{ color: T.muted, fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 4 }}>
            총 {sorted.length}종 {sorted.reduce((s, w) => s + (w.qty || 1), 0)}병
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 선택 삭제 버튼 */}
          {selected.size > 0 && (
            confirmBulkDelete ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#c0392b22', border: '1px solid #c0392b', borderRadius: 8, padding: '6px 12px' }}>
                <span style={{ fontSize: '0.78rem', color: '#e07070' }}>{selected.size}개 삭제?</span>
                <button onClick={handleBulkDelete} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer' }}>확인</button>
                <button onClick={() => setConfirmBulkDelete(false)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '3px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmBulkDelete(true)} style={{ background: '#c0392b22', color: '#e07070', border: '1px solid #c0392b44', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem', cursor: 'pointer' }}>
                🗑 선택 삭제 ({selected.size}개)
              </button>
            )
          )}
          {/* 시장가 일괄 업데이트 */}
          {priceUpdating ? (
            <div style={{ background: T.gold + '22', border: `1px solid ${T.gold}66`, borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem', color: T.gold, minWidth: 200 }}>
              💰 {priceProgress.current}/{priceProgress.total} — {priceProgress.name.slice(0, 15)}{priceProgress.name.length > 15 ? '...' : ''}
            </div>
          ) : priceUpdateDone ? (
            <div style={{ background: '#4a8a5e22', border: '1px solid #4a8a5e', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem', color: '#4a8a5e' }}>✓ 시장가 업데이트 완료</div>
          ) : (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={() => handleBulkPriceUpdate(false)} style={{ background: T.gold + '22', color: T.gold, border: `1px solid ${T.gold}44`, borderRadius: 8, padding: '7px 14px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                💰 시장가 업데이트
              </button>
              <button onClick={() => handleBulkPriceUpdate(true)} style={{ background: T.wine + '22', color: '#e07070', border: `1px solid ${T.wine}`, borderRadius: 8, padding: '7px 14px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                🔄 전체 재검색
              </button>
            </div>
          )}
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 10px' }}>
            <option value="">전체 종류</option>
            <option value="wine">🍷 와인</option>
            <option value="nonwine">🥃 위스키·기타</option>
          </select>
          <select value={filterCellar} onChange={e => setFilterCellar(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 10px' }}>
            <option value="">전체 셀러</option>
            {CELLARS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} style={{ width: 'auto', fontSize: '0.8rem', padding: '7px 10px' }}>
            <option value="name">이름순</option>
            <option value="vintage">빈티지순</option>
            <option value="price">구매가순</option>
            <option value="market">시장가순</option>
            <option value="date">구매일순</option>
          </select>
          <button onClick={() => setGroupSimilar(g => !g)} title="이름이 조금씩 다른 같은 와인을 묶어서 정리" style={{ background: groupSimilar ? T.gold : T.surface, color: groupSimilar ? T.bg : T.gold, border: `1px solid ${T.gold}66`, borderRadius: 8, padding: '7px 12px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
            🔗 비슷한 이름 묶기{groupSimilar ? ' ✓' : ''}
          </button>
        </div>
      </div>

      {sorted.length === 0
        ? <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}><div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🍷</div><div>와인이 없습니다 — 추가해볼까요?</div></div>
        : groupSimilar
          ? (() => {
              const mixedCount = groupList.filter(([, items]) => new Set(items.map(w => w.name)).size > 1).length
              return (
                <div className="fade-in">
                  <div style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 14, lineHeight: 1.5 }}>
                    이름이 조금씩 다른 같은 와인을 묶었습니다.
                    {mixedCount > 0
                      ? <> 표기가 갈린 <span style={{ color: T.gold }}>{mixedCount}개 그룹</span>은 이름을 하나로 통일할 수 있습니다.</>
                      : ' 표기가 갈린 그룹은 없습니다.'}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {groupList.map(([fp, items]) => {
                      const names = [...new Set(items.map(w => w.name))]
                      const bottles = items.reduce((s, w) => s + (w.qty || 1), 0)
                      const multiName = names.length > 1
                      const chosen = chosenNames[fp] ?? [...names].sort((a, b) => a.length - b.length)[0]
                      return (
                        <div key={fp} style={{ background: T.card, border: `1px solid ${multiName ? T.gold + '66' : T.border}`, borderRadius: 12, padding: 14 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: multiName ? 12 : 8 }}>
                            <div style={{ fontSize: '0.9rem', color: T.cream, fontWeight: 600, minWidth: 0 }}>
                              {chosen} <span style={{ color: T.muted, fontWeight: 400, fontSize: '0.76rem' }}>· {items.length}항목 {bottles}병</span>
                            </div>
                            {multiName && (
                              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                                <select value={chosen} onChange={e => setChosenNames(p => ({ ...p, [fp]: e.target.value }))} style={{ width: 'auto', fontSize: '0.76rem', padding: '5px 8px', maxWidth: 280 }}>
                                  {names.map(n => <option key={n} value={n}>{n}</option>)}
                                </select>
                                <button onClick={() => onRename && onRename(items.filter(w => w.name !== chosen).map(w => w.id), chosen)}
                                  style={{ background: T.gold, color: T.bg, border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  이 이름으로 통일
                                </button>
                              </div>
                            )}
                          </div>
                          {(() => {
                            // 수준 3: 빈티지·셀러·칸까지 같은 진짜 중복 레코드를 한 줄로 묶는다
                            const clusterMap = {}
                            items.forEach(w => {
                              const key = `${w.name}|${w.vintage || ''}|${w.cellarId}|${w.slot}`
                              ;(clusterMap[key] = clusterMap[key] || []).push(w)
                            })
                            const clusters = Object.values(clusterMap)
                            const dupCount = clusters.filter(cl => cl.length > 1).length
                            return (
                              <>
                                {dupCount > 0 && (
                                  <div style={{ fontSize: '0.72rem', color: T.gold, marginBottom: 6 }}>
                                    🔁 빈티지·위치까지 같은 중복 {dupCount}건 — 한 레코드로 병합할 수 있습니다
                                  </div>
                                )}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                  {clusters.map(cl => {
                                    const w = cl[0]
                                    const c = cellarById(w.cellarId)
                                    const willChange = multiName && w.name !== chosen
                                    const dup = cl.length > 1
                                    const clQty = cl.reduce((s, x) => s + (x.qty || 1), 0)
                                    return (
                                      <div key={w.id} onClick={() => openDetail(w.id)} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: '0.8rem', background: dup ? T.gold + '11' : 'transparent' }}
                                        onMouseEnter={e => e.currentTarget.style.background = dup ? T.gold + '22' : T.surface}
                                        onMouseLeave={e => e.currentTarget.style.background = dup ? T.gold + '11' : 'transparent'}
                                      >
                                        <span style={{ flex: 1, minWidth: 0, color: willChange ? T.wineLight : T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                          {willChange && <span title="통일 시 이 이름이 바뀝니다" style={{ marginRight: 4 }}>✏️</span>}
                                          {dup && <span title="빈티지·위치까지 같은 중복 레코드" style={{ marginRight: 4, color: T.gold }}>🔁</span>}
                                          {w.name}{bottleBadge(w.bottleSize) ? ` ${bottleBadge(w.bottleSize)}` : ''}{openedBadge(w) ? ` ${openedBadge(w)}` : ''}
                                          {dup && <span style={{ color: T.muted, fontSize: '0.72rem', marginLeft: 6 }}>({cl.length}개 레코드)</span>}
                                        </span>
                                        <span style={{ color: T.gold, width: 46, textAlign: 'right', flexShrink: 0 }}>{w.vintage || '??'}</span>
                                        {(() => { const s = getDrinkingStatus(w); return s
                                          ? <span title={s.label} style={{ fontSize: '0.66rem', color: s.color, background: s.color + '22', borderRadius: 5, padding: '1px 5px', whiteSpace: 'nowrap', flexShrink: 0 }}>{s.icon} {drinkShortLabel(s)}</span>
                                          : null })()}
                                        <span style={{ color: T.text, width: 38, textAlign: 'right', flexShrink: 0 }}>{clQty}병</span>
                                        <span style={{ color: T.muted, width: 130, textAlign: 'right', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c?.name} {w.slot}칸</span>
                                        {dup && (
                                          <button onClick={e => { e.stopPropagation(); onMerge && onMerge(cl.map(x => x.id)) }}
                                            title={`${cl.length}개 레코드를 1개(${clQty}병)로 병합`}
                                            style={{ background: T.gold, color: T.bg, border: 'none', borderRadius: 6, padding: '4px 8px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}>
                                            🔗 병합
                                          </button>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()
        : mobile
          ? <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sorted.map(w => {
                const c = cellarById(w.cellarId)
                const isSelected = selected.has(w.id)
                return (
                  <div key={w.id} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <input type="checkbox" checked={isSelected} onChange={() => toggleOne(w.id)}
                      style={{ width: 16, height: 16, accentColor: T.gold, flexShrink: 0, cursor: 'pointer' }} />
                    <div onClick={() => openDetail(w.id)} style={{ flex: 1, display: 'flex', gap: 12, alignItems: 'center', background: isSelected ? T.gold + '11' : T.card, border: `1px solid ${isSelected ? T.gold + '66' : T.border}`, borderRadius: 10, padding: '12px 14px', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 40, height: 56, objectFit: 'cover', borderRadius: 5, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 40, height: 56, background: T.surface, borderRadius: 5, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', border: `1px solid ${T.border}` }}>🍷</div>}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                        <div style={{ fontSize: '0.72rem', color: T.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {w.vintage && <span style={{ color: T.gold }}>{w.vintage}</span>}{bottleBadge(w.bottleSize) && <span style={{ color: T.wineLight, fontWeight: 600 }}>{bottleBadge(w.bottleSize)}</span>}
                          {openedBadge(w) && <span style={{ color: T.gold, fontWeight: 600 }}>{openedBadge(w)}</span>}
                          <span>{w.qty || 1}병</span>
                          {w.price > 0 && <span>{krw(w.price)}</span>}
                          {w.wineSearcherPrice > 0 && <span style={{ color: T.gold }}>시장가 {krw(w.wineSearcherPrice)}</span>}
                          {(() => { const s = getDrinkingStatus(w); return s ? <span style={{ color: s.color }}>{s.icon} {s.label}</span> : null })()}
                        </div>
                        <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: 2 }}>{c?.name} 셀러 {w.slot}번 칸</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          : <>
              {/* 테이블 헤더 */}
              <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, padding: '8px 14px', fontSize: '0.68rem', color: T.muted, textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    style={{ width: 15, height: 15, accentColor: T.gold, cursor: 'pointer' }} />
                </div>
                <span></span>
                <span>이름</span>
                <span style={{ textAlign: 'center' }}>빈티지</span>
                <span style={{ textAlign: 'right' }}>수량</span>
                <span style={{ textAlign: 'center' }}>음용시기</span>
                <span style={{ textAlign: 'right', color: '#C9A84C' }}>시장가(₩)</span>
                <span>셀러 · 위치</span>
              </div>
              {sorted.map(w => {
                const c = cellarById(w.cellarId)
                const isSelected = selected.has(w.id)
                return (
                  <div key={w.id} onClick={() => openDetail(w.id)} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 10, alignItems: 'center', padding: '10px 14px', borderRadius: 8, cursor: 'pointer', transition: 'background 0.1s', background: isSelected ? T.gold + '11' : 'transparent', border: `1px solid ${isSelected ? T.gold + '44' : 'transparent'}`, marginBottom: 2 }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.card }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <input type="checkbox" checked={isSelected}
                        onClick={e => e.stopPropagation()}
                        onChange={() => toggleOne(w.id)}
                        style={{ width: 15, height: 15, accentColor: T.gold, cursor: 'pointer' }} />
                    </div>
                    {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 4 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 36, height: 50, background: T.surface, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.9rem' }}>🍷</div>}
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                        {bottleBadge(w.bottleSize) && <span style={{ fontSize: '0.7rem', color: T.wineLight, fontWeight: 600, flexShrink: 0 }}>{bottleBadge(w.bottleSize)}</span>}
                        {openedBadge(w) && <span title="개봉 후 남은 양" style={{ fontSize: '0.7rem', color: T.gold, fontWeight: 600, flexShrink: 0 }}>{openedBadge(w)}</span>}
                      </div>
                      {w.notes && <div style={{ fontSize: '0.7rem', color: T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.notes}</div>}
                    </div>
                    <span style={{ fontSize: '0.875rem', color: T.gold, fontWeight: 500, textAlign: 'center' }}>{w.vintage || '??'}</span>
                    <span style={{ fontSize: '0.875rem', color: T.text, textAlign: 'right' }}>{w.qty || 1}병</span>
                    <div style={{ textAlign: 'center' }}>
                      {(() => { const s = getDrinkingStatus(w); return s
                        ? <span title={s.label} style={{ fontSize: '0.66rem', color: s.color, background: s.color + '22', borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' }}>{s.icon} {drinkShortLabel(s)}</span>
                        : <span style={{ color: T.muted }}>-</span> })()}
                    </div>
                    <span style={{ fontSize: '0.875rem', color: w.wineSearcherPrice ? T.gold : T.muted, fontWeight: w.wineSearcherPrice ? 600 : 400, textAlign: 'right' }}>{w.wineSearcherPrice ? krw(w.wineSearcherPrice) : '-'}</span>
                    <div onClick={e => { e.stopPropagation(); goSlot(w.cellarId, w.slot) }} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, background: T.surface, borderRadius: 8, padding: '5px 10px', border: `1px solid ${T.border}`, transition: 'border-color 0.15s' }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = T.gold}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                    >
                      <div style={{ fontSize: '0.9rem' }}>📍</div>
                      <div>
                        <div style={{ fontSize: '0.72rem', fontWeight: 600, color: T.cream, whiteSpace: 'nowrap' }}>{c?.name}</div>
                        <div style={{ fontSize: '0.65rem', color: T.gold }}>{w.slot}번 칸</div>
                      </div>
                    </div>
                  </div>
                )
              })}
            </>
      }
    </div>
  )
}

import { useState, useMemo } from 'react'
import { cellarById, T, getDrinkingStatus, callAI, bottleBadge } from '../../config/cellars.js'

// ── Drinking Window View (음용 적기) ──────────────────────────────
// 전체 와인을 음용 적기 status별로 그룹화해 우선순위대로 보여준다.
// 같은 와인(name+vintage)은 "이름 + N병"으로 한 줄에 합쳐 표시한다.

// AI 음용시기 추정 — callAI(=callProxy) 경유. JSON만 반환받아 마지막 완성 객체를 파싱.
async function estimateDrinkingWindow(wine) {
  const vintageNote = wine.vintage
    ? `빈티지 ${wine.vintage}년`
    : '빈티지 정보 없음 — 해당 타입/품종 와인의 일반적인 권장 음용 기간으로 추정'
  const prompt = `와인 "${wine.name}"${wine.vintage ? ` ${wine.vintage}` : ''}의 음용 적기(마시기 좋은 기간)를 추정하여 JSON만 반환 (마크다운/설명 없이):
{"drinkingFrom":null,"drinkingTo":null}

- drinkingFrom: 마시기 좋은 시작 연도 (4자리 숫자)
- drinkingTo: 마시기 좋은 마지막 연도 (4자리 숫자)
- ${vintageNote}
- 와인 타입/품종/생산지역과 일반적인 숙성 잠재력을 고려해 추정
- 정말 모르면 null
응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
  const data = await callAI(
    [{ role: 'user', content: prompt }],
    2000,
    [{ type: 'web_search_20250305', name: 'web_search' }]
  )
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('')
  const cleaned = text.replace(/\`\`\`json|\`\`\`/g, '').trim()
  // 완성된 JSON 객체들 중 마지막 것을 사용
  const candidates = cleaned.match(/\{[^{}]*\}/g)
  if (candidates) {
    for (let i = candidates.length - 1; i >= 0; i--) {
      try { return JSON.parse(candidates[i]) } catch { /* 다음 후보 */ }
    }
  }
  console.warn('[DrinkingWindow] JSON 추출 실패:', text.slice(0, 300))
  return null
}

// status → 표시 섹션 매핑 (위에서부터의 우선순위 순)
const DW_SECTIONS = [
  { key: 'decline', title: '빨리 마셔야',   icon: '⚪', color: T.muted,   desc: '음용 적기가 지났거나 우선 소비 권장' },
  { key: 'peak',    title: '지금 절정',     icon: '🟢', color: '#4a8a5e', desc: '지금 마시기 가장 좋은 상태' },
  { key: 'ready',   title: '마시기 좋음',   icon: '🟢', color: '#4a8a5e', desc: '충분히 즐길 수 있는 상태' },
  { key: 'soon',    title: '곧 절정 진입',  icon: '🔵', color: '#5b8dd9', desc: '음용 적기 진입을 앞둔 와인' },
  { key: 'aging',   title: '숙성 중',       icon: '🔵', color: '#5b8dd9', desc: '아직 숙성이 필요한 와인' },
]

function dwSectionKey(status) {
  if (!status) return 'aging'
  if (status.status === 'decline') return 'decline'
  if (status.status === 'peak')    return 'peak'
  if (status.status === 'ready')   return 'ready'
  // young — 명시적 음용시기(from)가 있으면 곧 절정 진입, 빈티지 추정이면 숙성 중
  if (status.status === 'young')   return status.from ? 'soon' : 'aging'
  return 'aging'
}

export function DrinkingWindowView({ wines, openDetail, onUpdate }) {
  const [estimating, setEstimating] = useState(null) // 추정 중인 그룹 key

  // 같은 와인(name+vintage) 묶기 + 섹션 분류 — wines가 바뀔 때만 재계산
  const { bySection, totalGroups } = useMemo(() => {
    const groupsMap = {}
    // 위스키는 음용 적기 개념이 없으므로 제외
    wines.filter(w => w.category !== 'whisky').forEach(w => {
      const key = `${(w.name || '').trim()}|||${w.vintage || ''}`
      if (!groupsMap[key]) groupsMap[key] = { key, rep: w, items: [], qty: 0 }
      groupsMap[key].items.push(w)
      groupsMap[key].qty += (w.qty || 1)
    })

    const bySection = {}
    DW_SECTIONS.forEach(s => { bySection[s.key] = [] })
    Object.values(groupsMap).forEach(g => {
      const status = getDrinkingStatus(g.rep)
      g.status = status
      bySection[dwSectionKey(status)].push(g)
    })
    return { bySection, totalGroups: Object.values(groupsMap).length }
  }, [wines])

  // 추정 가능 여부 — 빈티지·drinkingFrom·drinkingTo 모두 없음
  const canEstimate = (w) => !w.vintage && !w.drinkingFrom && !w.drinkingTo

  async function handleEstimate(group) {
    setEstimating(group.key)
    try {
      const info = await estimateDrinkingWindow(group.rep)
      if (info && (info.drinkingFrom || info.drinkingTo)) {
        for (const w of group.items) {
          await onUpdate(w.id, {
            drinkingFrom: info.drinkingFrom || null,
            drinkingTo:   info.drinkingTo || null,
          })
        }
      } else {
        alert('음용시기를 추정하지 못했습니다. 잠시 후 다시 시도해주세요.')
      }
    } catch (e) {
      console.error('[DrinkingWindow] 추정 실패:', e)
      alert('추정 실패: ' + (e.message || e))
    }
    setEstimating(null)
  }

  return (
    <div className="fade-in">
      <h1 className="heading">⏰ 음용 적기</h1>
      <p className="subheading">마셔야 할 순서대로 — 빨리 마셔야 할 와인이 맨 위입니다</p>

      {totalGroups === 0
        ? <div style={{ textAlign: 'center', padding: '60px 0', color: T.muted }}><div style={{ fontSize: '2.5rem', marginBottom: 12 }}>🍷</div><div>와인이 없습니다 — 추가해볼까요?</div></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {DW_SECTIONS.map(sec => {
              const groups = bySection[sec.key]
              if (!groups || groups.length === 0) return null
              // 그룹 내 정렬: 빈티지 오래된 순(빈티지 없으면 뒤로), 이름순
              const sortedGroups = [...groups].sort((a, b) =>
                (a.rep.vintage || 9999) - (b.rep.vintage || 9999) ||
                (a.rep.name || '').localeCompare(b.rep.name || '', 'ko'))
              const totalBottles = groups.reduce((s, g) => s + g.qty, 0)
              return (
                <div key={sec.key}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${sec.color}44` }}>
                    <span style={{ fontSize: '1.1rem' }}>{sec.icon}</span>
                    <span style={{ fontSize: '0.95rem', fontWeight: 700, color: sec.color }}>{sec.title}</span>
                    <span style={{ fontSize: '0.74rem', color: T.muted }}>· {groups.length}종 {totalBottles}병</span>
                    <span style={{ fontSize: '0.7rem', color: T.muted, marginLeft: 'auto', display: 'none' }} className="dw-desc">{sec.desc}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sortedGroups.map(g => {
                      const w = g.rep
                      const s = g.status
                      const c = cellarById(w.cellarId)
                      const showEstimate = canEstimate(w)
                      const isEstimating = estimating === g.key
                      return (
                        <div key={g.key} style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '13px 16px', display: 'flex', gap: 14, alignItems: 'center', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => e.currentTarget.style.borderColor = sec.color}
                          onMouseLeave={e => e.currentTarget.style.borderColor = T.border}
                        >
                          <div onClick={() => openDetail(w.id)} style={{ flex: 1, minWidth: 0, cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'center' }}>
                            {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 38, height: 54, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 38, height: 54, background: T.surface, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.2rem', border: `1px solid ${T.border}` }}>🍷</div>}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {w.name}{bottleBadge(w.bottleSize) ? <span style={{ color: T.wineLight, fontWeight: 600, marginLeft: 6 }}>{bottleBadge(w.bottleSize)}</span> : null}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: T.muted, marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                                {w.vintage ? <span style={{ color: T.gold }}>{w.vintage}</span> : <span>빈티지 미상</span>}
                                <span style={{ color: T.cream }}>{g.qty}병</span>
                                {c && <span>{c.name} {w.slot}칸{g.items.length > 1 ? ' 외' : ''}</span>}
                                {s?.from && <span>음용 적기 {s.from}~{s.to}년</span>}
                              </div>
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flexShrink: 0 }}>
                            {s && <span style={{ fontSize: '0.72rem', color: s.color, background: s.color + '22', borderRadius: 6, padding: '3px 8px', whiteSpace: 'nowrap' }}>{s.icon} {s.label}</span>}
                            {showEstimate && (
                              <button onClick={() => handleEstimate(g)} disabled={isEstimating}
                                style={{ background: isEstimating ? T.surface : T.gold + '22', color: T.gold, border: `1px solid ${T.gold}44`, borderRadius: 7, padding: '5px 10px', fontSize: '0.72rem', cursor: isEstimating ? 'default' : 'pointer', fontWeight: 600, whiteSpace: 'nowrap' }}>
                                {isEstimating ? '🔮 추정 중…' : '🔮 음용시기 추정'}
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      }
    </div>
  )
}

import { useState } from 'react'
import { CELLARS, getSlots, cellarById, T, krw, getDrinkingStatus, bottleBadge, openedBadge } from '../config/cellars.js'
import { Btn, useIsMobile } from './ui.jsx'

export default function CellarView({ wines, winesIn, bottlesIn, cellarId, setCellarId, openAdd, openDetail, onDrink, onDeleteMany, onDrinkMany }) {
  const [expanded, setExpanded] = useState(null)
  const [selected, setSelected] = useState(new Set())
  const [confirmDelete, setConfirmDelete] = useState(false)
  const mobile = useIsMobile()
  const c = cellarById(cellarId)
  const slots = getSlots(c)

  const cellarWines = wines.filter(w => w.cellarId === cellarId)
  const allIds = cellarWines.map(w => w.id)
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id))
  const someSelected = selected.size > 0

  // 선택은 셀러 탭을 옮겨도 유지된다 — 서로 다른 셀러의 병을 한 자리로 묶어 기록하기 위함.
  // 그래서 선택 목록은 현재 셀러(cellarWines)가 아니라 전체 wines에서 찾는다.
  const selectedWineObjs = wines.filter(w => selected.has(w.id))
  const selectedHere = cellarWines.filter(w => selected.has(w.id)).length
  const selectedElsewhere = selectedWineObjs.length - selectedHere
  // 일괄 마심 — 위스키는 시음 세션 로직이 달라 제외(개별 기록 이용)
  const drinkableSelected = selectedWineObjs.filter(w => w.category !== 'whisky')
  const whiskyExcluded = selectedWineObjs.length - drinkableSelected.length
  const selectedCellarCount = new Set(drinkableSelected.map(w => w.cellarId)).size

  function toggleSelect(id, e) {
    e.stopPropagation()
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // 이 셀러 전체 선택/해제 — 다른 셀러에서 고른 병은 건드리지 않는다
  function toggleAll() {
    setSelected(prev => {
      const next = new Set(prev)
      if (allSelected) allIds.forEach(id => next.delete(id))
      else allIds.forEach(id => next.add(id))
      return next
    })
  }

  function clearSelection() {
    setSelected(new Set())
    setConfirmDelete(false)
  }

  async function handleDeleteSelected() {
    await onDeleteMany([...selected])
    clearSelection()
  }

  function handleDrinkSelected() {
    if (!drinkableSelected.length) return
    onDrinkMany(drinkableSelected)
    clearSelection()
  }

  return (
    <div className="fade-in">
      <h1 className="heading">셀러 뷰</h1>

      {/* Cellar tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        {CELLARS.map(cc => (
          <button key={cc.id} onClick={() => { setCellarId(cc.id); setExpanded(null); setConfirmDelete(false) }} style={{
            background: cc.id === cellarId ? T.gold : 'transparent',
            color: cc.id === cellarId ? T.bg : T.muted,
            border: cc.id === cellarId ? 'none' : `1px solid ${T.border}`,
            padding: '8px 20px', borderRadius: 8, fontSize: '0.875rem',
            fontWeight: cc.id === cellarId ? 600 : 400, transition: 'all 0.2s',
          }}>{cc.name}</button>
        ))}
      </div>

      {/* Info bar */}
      <div style={{ background: T.card, border: `1px solid ${T.border}`, borderRadius: 10, padding: '12px 18px', marginBottom: 14, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.1rem', color: T.cream, fontWeight: 600 }}>{c.name}</span>
          <span style={{ fontSize: '0.75rem', color: T.muted, marginLeft: 12 }}>{c.slots}칸 · 칸당 최대 {c.maxPerSlot}병 · 총 {c.slots * c.maxPerSlot}병</span>
        </div>
        {(() => {
          const cellarWines = wines.filter(w => w.cellarId === cellarId)
          const totalB = cellarWines.reduce((s, w) => s + (w.qty || 1), 0)
          const pct = Math.round(totalB / (c.slots * c.maxPerSlot) * 100) || 0
          // 셀러 전체 시장가 합계 (병당 시장가 × 수량) — 입력된 것만 합산
          const totalValue = cellarWines.reduce((s, w) => s + (Number(w.wineSearcherPrice) || 0) * (w.qty || 1), 0)
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 120 }}>
              <div style={{ flex: 1, height: 6, background: T.surface, borderRadius: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', background: `linear-gradient(90deg,${T.wine},${T.gold})`, width: `${pct}%`, borderRadius: 3 }} />
              </div>
              {totalValue > 0 && <span title="이 셀러의 시장가 합계 (병당 시장가 × 수량)" style={{ fontSize: '0.8rem', color: T.gold, fontWeight: 600, flexShrink: 0 }}>💰 {krw(totalValue)}</span>}
              <span style={{ fontSize: '0.8rem', color: T.gold, fontWeight: 600, flexShrink: 0 }}>{totalB}/{c.slots * c.maxPerSlot}병 ({pct}%)</span>
            </div>
          )
        })()}
      </div>

      {/* 다중 선택 툴바 */}
      {someSelected && (
        <div style={{ background: T.card, border: `1px solid ${T.gold}66`, borderRadius: 10, padding: '10px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              style={{ width: 16, height: 16, accentColor: T.gold, cursor: 'pointer' }} />
            <span style={{ fontSize: '0.85rem', color: T.cream }}>
              <strong style={{ color: T.gold }}>{selectedWineObjs.length}개</strong> 선택됨
              {selectedElsewhere > 0 && <span style={{ fontSize: '0.75rem', color: T.muted, marginLeft: 6 }}>(이 셀러 {selectedHere} · 다른 셀러 {selectedElsewhere})</span>}
            </span>
            <button onClick={clearSelection} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '0.78rem', cursor: 'pointer', textDecoration: 'underline' }}>선택 해제</button>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {drinkableSelected.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                <button onClick={handleDrinkSelected} style={{ background: T.wine + '33', border: `1px solid ${T.wine}`, color: T.wineLight, borderRadius: 8, padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                  🥂 선택한 {drinkableSelected.length}병 함께 마심{selectedCellarCount > 1 ? ` (${selectedCellarCount}개 셀러)` : ''}
                </button>
                {whiskyExcluded > 0 && <span style={{ fontSize: '0.68rem', color: T.muted }}>위스키 {whiskyExcluded}종은 제외(개별 시음 기록 이용)</span>}
                <span style={{ fontSize: '0.68rem', color: T.muted }}>셀러 탭을 옮겨도 선택은 그대로 — 여러 셀러 병을 함께 고를 수 있습니다</span>
              </div>
            )}
            {confirmDelete ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', background: '#c0392b22', border: '1px solid #c0392b', borderRadius: 8, padding: '4px 10px' }}>
                <span style={{ fontSize: '0.78rem', color: '#e07070' }}>{selectedWineObjs.length}개 삭제?{selectedElsewhere > 0 ? ' (다른 셀러 포함)' : ''}</span>
                <button onClick={handleDeleteSelected} style={{ background: '#c0392b', color: 'white', border: 'none', borderRadius: 6, padding: '3px 10px', fontSize: '0.78rem', cursor: 'pointer', fontWeight: 600 }}>확인</button>
                <button onClick={() => setConfirmDelete(false)} style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, borderRadius: 6, padding: '3px 8px', fontSize: '0.78rem', cursor: 'pointer' }}>취소</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} style={{ background: '#c0392b22', border: '1px solid #c0392b88', color: '#e07070', borderRadius: 8, padding: '6px 14px', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 }}>
                🗑 선택 삭제
              </button>
            )}
          </div>
        </div>
      )}

      {/* Rack rows */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {slots.map(slot => {
          const b = bottlesIn(cellarId, slot)
          const ratio = b / c.maxPerSlot
          const isOpen = expanded === slot
          const slotWines = winesIn(cellarId, slot)
          const slotAllSelected = slotWines.length > 0 && slotWines.every(w => selected.has(w.id))
          const slotSomeSelected = slotWines.some(w => selected.has(w.id))
          // 칸 전체 시장가 합계 (병당 시장가 × 수량) — 입력된 것만 합산
          const slotValue = slotWines.reduce((s, w) => s + (Number(w.wineSearcherPrice) || 0) * (w.qty || 1), 0)

          return (
            <div key={slot} style={{ background: T.card, border: `1px solid ${isOpen ? T.gold + '88' : T.border}`, borderRadius: 10, overflow: 'hidden', transition: 'border-color 0.2s' }}>
              {/* Slot header */}
              <div onClick={() => setExpanded(isOpen ? null : slot)} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px', cursor: 'pointer', background: isOpen ? T.cardHover : 'transparent', transition: 'background 0.15s' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, flexShrink: 0, background: b > 0 ? T.gold + '22' : T.surface, border: `1px solid ${b > 0 ? T.gold + '66' : T.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Cormorant Garamond, serif', fontSize: '1rem', fontWeight: 600, color: b > 0 ? T.gold : T.muted }}>
                  {slot}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <div style={{ fontSize: '0.78rem', color: b > 0 ? T.cream : T.muted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '65%' }}>
                      {b > 0 ? slotWines.map(w => w.name).join(' · ').substring(0, 50) + (slotWines.map(w => w.name).join('·').length > 50 ? '...' : '') : '비어있음'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, marginLeft: 8 }}>
                      {slotSomeSelected && (
                        <span style={{ fontSize: '0.72rem', color: T.gold, background: T.gold + '22', borderRadius: 4, padding: '1px 6px' }}>
                          {slotWines.filter(w => selected.has(w.id)).length}선택
                        </span>
                      )}
                      {slotValue > 0 && <span title="이 칸의 시장가 합계 (병당 시장가 × 수량)" style={{ fontSize: '0.75rem', color: T.gold }}>💰 {krw(slotValue)}</span>}
                      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: ratio >= 0.85 ? T.wineLight : ratio > 0 ? T.gold : T.muted }}>{b}/{c.maxPerSlot}병</span>
                      <span style={{ color: T.muted, fontSize: '0.85rem' }}>{isOpen ? '▲' : '▼'}</span>
                    </div>
                  </div>
                  <div style={{ height: 6, background: T.surface, borderRadius: 3, overflow: 'hidden' }}>
                    <div style={{ height: '100%', borderRadius: 3, background: ratio >= 0.85 ? `linear-gradient(90deg,${T.wine},${T.wineLight})` : `linear-gradient(90deg,${T.goldDim},${T.gold})`, width: `${Math.min(ratio * 100, 100)}%` }} />
                  </div>
                </div>
                <button onClick={e => { e.stopPropagation(); openAdd({ cellarId, slot }) }}
                  style={{ background: 'transparent', border: `1px solid ${T.border}`, color: T.muted, cursor: 'pointer', borderRadius: 7, padding: '5px 10px', fontSize: '0.78rem', flexShrink: 0, transition: 'all 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.gold; e.currentTarget.style.color = T.gold }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.muted }}
                >+ 추가</button>
              </div>

              {/* Wine list */}
              {isOpen && (
                <div className="slide-down" style={{ borderTop: `1px solid ${T.border}`, padding: '8px 0' }}>
                  {/* 칸 전체 선택 */}
                  {slotWines.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 18px 8px', borderBottom: `1px solid ${T.border}` }}>
                      <input type="checkbox" checked={slotAllSelected} onChange={e => {
                        e.stopPropagation()
                        setSelected(prev => {
                          const next = new Set(prev)
                          if (slotAllSelected) slotWines.forEach(w => next.delete(w.id))
                          else slotWines.forEach(w => next.add(w.id))
                          return next
                        })
                      }} style={{ width: 14, height: 14, accentColor: T.gold, cursor: 'pointer' }} />
                      <span style={{ fontSize: '0.72rem', color: T.muted }}>{slot}번 칸 전체 선택</span>
                    </div>
                  )}
                  {slotWines.length === 0 ? (
                    <div style={{ padding: '16px 18px', color: T.muted, fontSize: '0.85rem', textAlign: 'center' }}>빈 칸 — 위의 + 추가 버튼으로 와인을 등록하세요</div>
                  ) : slotWines.map(w => {
                    const isSelected = selected.has(w.id)
                    return (
                      <div key={w.id}
                        style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '10px 18px', transition: 'background 0.12s', cursor: 'pointer', background: isSelected ? T.gold + '11' : 'transparent', borderLeft: isSelected ? `2px solid ${T.gold}` : '2px solid transparent' }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = T.cardHover }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent' }}
                        onClick={() => openDetail(w.id)}
                      >
                        {/* 체크박스 */}
                        <input type="checkbox" checked={isSelected} onChange={e => toggleSelect(w.id, e)}
                          onClick={e => e.stopPropagation()}
                          style={{ width: 15, height: 15, accentColor: T.gold, cursor: 'pointer', flexShrink: 0 }} />
                        {w.imageUrl
                          ? <img src={w.imageUrl} alt="" style={{ width: 32, height: 46, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />
                          : <div style={{ width: 32, height: 46, background: T.surface, borderRadius: 4, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1rem', border: `1px solid ${T.border}` }}>🍷</div>
                        }
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                            <div style={{ fontSize: '0.9rem', fontWeight: 500, color: T.cream, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</div>
                            {bottleBadge(w.bottleSize) && <span style={{ fontSize: '0.7rem', color: T.wineLight, fontWeight: 600, flexShrink: 0 }}>{bottleBadge(w.bottleSize)}</span>}
                            {openedBadge(w) && <span style={{ fontSize: '0.7rem', color: T.gold, fontWeight: 600, flexShrink: 0 }}>{openedBadge(w)}</span>}
                          </div>
                          <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 2 }}>
                            {w.vintage && <span style={{ color: T.gold, marginRight: 8 }}>{w.vintage}</span>}
                            <span style={{ marginRight: 8 }}>{w.qty || 1}병</span>
                            {w.price > 0 && <span style={{ marginRight: 8 }}>구매 {krw(w.price)}</span>}
                            {w.wineSearcherPrice > 0
                              ? <span style={{ color: T.gold, fontWeight: 600 }}>시장가 {krw(w.wineSearcherPrice)}</span>
                              : !(w.price > 0) && <span>-</span>}
                          </div>
                        </div>
                        <button onClick={e => { e.stopPropagation(); onDrink(w) }}
                          style={{ background: T.wine + '33', border: `1px solid ${T.wine}`, color: T.wineLight, cursor: 'pointer', borderRadius: 6, padding: '5px 10px', fontSize: '0.75rem', flexShrink: 0 }}>
                          {w.category === 'whisky' ? '시음' : '마심'}
                        </button>
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

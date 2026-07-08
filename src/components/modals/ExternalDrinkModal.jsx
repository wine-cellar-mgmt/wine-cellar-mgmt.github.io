import { useState } from 'react'
import { T, uid, compressImage, resizeForVision, cropToThumb, callAI } from '../../config/cellars.js'
import { Btn, lbl, StarRating } from '../ui.jsx'

// ── External Drink Modal ────────────────────────────────────────
// 밖(레스토랑 등)에서 마신 와인 기록 — 재고(wines)와 무관하게 drink_log에만 기록.
// 사진으로 라벨을 인식(이름/빈티지)하거나 직접 입력해 목록을 만들고,
// 날짜/함께한 사람/자리는 한 번만, 평점·한마디는 병별로 입력한다.
export function ExternalDrinkModal({ onConfirm, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const [items, setItems] = useState([]) // {_id, name, vintage, imageUrl}
  const [photos, setPhotos] = useState([]) // 인식 진행 상태 표시용
  const [shared, setShared] = useState({ date: today, companions: '', occasion: '' })
  const [perItem, setPerItem] = useState({}) // _id -> {rating, review}

  const setS = (k, v) => setShared(p => ({ ...p, [k]: v }))
  const setP = (id, k, v) => setPerItem(p => ({ ...p, [id]: { ...p[id], [k]: v } }))
  const setItemField = (id, k, v) => setItems(p => p.map(it => it._id === id ? { ...it, [k]: v } : it))
  const removeItem = id => setItems(p => p.filter(it => it._id !== id))
  const addManual = () => setItems(p => [...p, { _id: uid(), name: '', vintage: null, imageUrl: '' }])

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    const newPhotos = files.map(f => ({ id: uid(), file: f, dataUrl: null, status: 'pending' }))
    setPhotos(p => [...p, ...newPhotos])
    for (const ph of newPhotos) {
      const { dataUrl, base64 } = await resizeForVision(ph.file)
      let thumb = ''
      try { thumb = await compressImage(ph.file, 320) } catch { thumb = '' }
      setPhotos(p => p.map(x => x.id === ph.id ? { ...x, dataUrl, status: 'scanning' } : x))
      try {
        const visionPrompt = `당신은 와인·주류 라벨 전문가입니다. 이 사진에서 보이는 모든 와인/술 라벨을 분석해주세요.

분석 지침:
- 라벨이 측면/부분만 보여도 최대한 읽어주세요
- 이름은 라벨에 표기된 공식 명칭으로 정확히 기재하세요 (생산자·이름·등급 모두 포함, 위스키는 숙성연수까지 이름에 포함)
- 빈티지(연도)가 보이면 vintage에 숫자로, 없으면(위스키 등) null
- 사진에 병이 여러 개 있으면 각각 별도 항목으로 기재하세요
- 라벨을 전혀 읽을 수 없는 병만 "미확인"으로 처리하세요
- 병이 여러 개면 각 병이 차지하는 영역을 box로 표시하세요 (왼쪽 위 (0,0)~오른쪽 아래 (1,1) 비율 좌표, 병 전체가 들어가도록). 병이 1개면 box는 null.

반드시 아래 JSON 배열 형식만 반환하세요 (마크다운, 설명 텍스트 절대 없이):
[{"name":"전체 이름","vintage":연도또는null,"box":{"x":0.0,"y":0.0,"w":1.0,"h":1.0}또는null}]`
        const data = await callAI([{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: visionPrompt }
        ]}], 3000)

        const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '[]'
        const cleaned = text.replace(/```json|```/g, '').trim()
        const match = cleaned.match(/\[[\s\S]*\]/)
        if (!match) throw new Error(`인식 결과 없음`)
        const found = JSON.parse(match[0])
        if (!Array.isArray(found) || found.length === 0) throw new Error('빈 결과')

        const singleBox = found.length === 1
        const withMeta = []
        for (const w of found) {
          let img = thumb
          if (!singleBox && w.box) {
            try { const cropped = await cropToThumb(dataUrl, w.box); if (cropped) img = cropped } catch { /* 폴백 유지 */ }
          }
          withMeta.push({ _id: uid(), name: w.name || '', vintage: w.vintage || null, imageUrl: img })
        }
        setItems(p => [...p, ...withMeta])
        setPhotos(p => p.map(x => x.id === ph.id ? { ...x, status: 'done', count: found.length } : x))
      } catch (err) {
        setPhotos(p => p.map(x => x.id === ph.id ? { ...x, status: 'error', errMsg: `인식 실패: ${err.message}` } : x))
      }
    }
    e.target.value = ''
  }

  function confirm() {
    const records = items.filter(it => it.name.trim() && it.name !== '미확인').map(it => ({
      id: uid(), wineId: null, wineName: it.name.trim(), wineVintage: it.vintage || null,
      cellarName: '외부', slot: '', imageUrl: it.imageUrl || '',
      date: shared.date, companions: shared.companions, occasion: shared.occasion,
      rating: perItem[it._id]?.rating || 0, review: perItem[it._id]?.review || '',
    }))
    if (!records.length) return
    onConfirm(records)
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 560, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.3rem', color: T.cream }}>📷 밖에서 마신 와인 기록</h2>
            <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 4 }}>재고에는 영향 없이 음주 기록에만 남습니다</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* 사진 업로드 / 직접 입력 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <label style={{ flex: 1, textAlign: 'center', display: 'block', background: T.gold, color: T.bg, border: 'none', borderRadius: 8, padding: '10px 0', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer' }}>
            📷 라벨 사진으로 추가
            <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
          </label>
          <button onClick={addManual} style={{ flex: 1, background: T.surface, border: `1px solid ${T.border}`, color: T.text, borderRadius: 8, padding: '10px 0', fontSize: '0.85rem', cursor: 'pointer' }}>
            ✏️ 직접 입력
          </button>
        </div>

        {/* 인식 진행 상태 */}
        {photos.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14, maxHeight: 120, overflowY: 'auto' }}>
            {photos.map(ph => (
              <div key={ph.id} style={{ display: 'flex', gap: 8, alignItems: 'center', background: T.surface, borderRadius: 6, padding: '5px 10px', fontSize: '0.75rem' }}>
                {ph.dataUrl && <img src={ph.dataUrl} alt="" style={{ width: 28, height: 28, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                <span style={{ color: T.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ph.file?.name}</span>
                {ph.status === 'pending' && <span style={{ color: T.muted }}>대기 중...</span>}
                {ph.status === 'scanning' && <span style={{ color: T.gold }}>🔍 인식 중...</span>}
                {ph.status === 'done' && <span style={{ color: '#4a8a5e' }}>✓ {ph.count}종</span>}
                {ph.status === 'error' && <span style={{ color: '#c0392b' }}>{ph.errMsg}</span>}
              </div>
            ))}
          </div>
        )}

        {items.length === 0 && (
          <div style={{ textAlign: 'center', padding: '24px 0', color: T.muted, fontSize: '0.82rem' }}>
            사진을 올리거나 직접 입력해서 마신 와인을 추가하세요
          </div>
        )}

        {items.length > 0 && (
          <>
            {/* 공통 정보 — 한 번만 입력 */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>마신 날짜</label><input value={shared.date} onChange={e => setS('date', e.target.value)} type="date" /></div>
              <div><label style={lbl}>자리 / 특별한 날</label><input value={shared.occasion} onChange={e => setS('occasion', e.target.value)} placeholder="회식, 기념일..." /></div>
            </div>
            <div style={{ marginBottom: 18 }}><label style={lbl}>함께한 사람</label><input value={shared.companions} onChange={e => setS('companions', e.target.value)} placeholder="아내, 친구들, 혼자..." /></div>

            {/* 병별 목록 */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20, maxHeight: '38vh', overflowY: 'auto' }}>
              {items.map(it => (
                <div key={it._id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 8 }}>
                    <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative', display: 'block' }} title="눌러서 사진 교체">
                      {it.imageUrl ? <img src={it.imageUrl} alt="" style={{ width: 34, height: 48, objectFit: 'cover', borderRadius: 4, display: 'block' }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 34, height: 48, background: T.card, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `1px solid ${T.border}` }}>🍷</div>}
                      <span style={{ position: 'absolute', bottom: -2, right: -2, fontSize: '0.6rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '0 2px', color: T.muted }}>✎</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return
                        try { const t = await compressImage(f, 320); setItemField(it._id, 'imageUrl', t) } catch { /* 무시 */ }
                        e.target.value = ''
                      }} />
                    </label>
                    <div style={{ flex: 1 }}>
                      <input value={it.name} onChange={e => setItemField(it._id, 'name', e.target.value)} placeholder="와인/술 이름" style={{ marginBottom: 6, fontWeight: 500, fontSize: '0.875rem' }} />
                      <input value={it.vintage || ''} onChange={e => setItemField(it._id, 'vintage', e.target.value ? parseInt(e.target.value) : null)} type="number" placeholder="빈티지 (선택)" style={{ fontSize: '0.8rem' }} />
                    </div>
                    <button onClick={() => removeItem(it._id)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', flexShrink: 0 }}>✕</button>
                  </div>
                  <div style={{ marginBottom: 8 }}><StarRating value={perItem[it._id]?.rating || 0} onChange={v => setP(it._id, 'rating', v)} /></div>
                  <input value={perItem[it._id]?.review || ''} onChange={e => setP(it._id, 'review', e.target.value)} placeholder="한마디 (선택)" style={{ fontSize: '0.82rem' }} />
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="gold" onClick={confirm} style={{ opacity: items.length ? 1 : 0.4 }} disabled={!items.length}>
            🍾 {items.filter(it => it.name.trim() && it.name !== '미확인').length}건 기록하고 마심
          </Btn>
        </div>
      </div>
    </div>
  )
}

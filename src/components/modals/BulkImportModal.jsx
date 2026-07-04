import { useState } from 'react'
import { CELLARS, getSlots, cellarById, T, uid, compressImage, BOTTLE_SIZES, CATEGORIES } from '../../config/cellars.js'
import { callProxy } from '../../lib/supabase.js'
import { Btn, lbl } from '../ui.jsx'

// ── Bulk Import Modal ───────────────────────────────────────────
// 모바일 EXIF orientation 읽기
async function getExifOrientation(file) {
  return new Promise(resolve => {
    const reader = new FileReader()
    reader.onload = e => {
      const view = new DataView(e.target.result)
      if (view.getUint16(0, false) !== 0xFFD8) return resolve(1)
      let offset = 2
      while (offset < view.byteLength) {
        const marker = view.getUint16(offset, false)
        offset += 2
        if (marker === 0xFFE1) {
          if (view.getUint32(offset += 2, false) !== 0x45786966) return resolve(1)
          const little = view.getUint16(offset += 6, false) === 0x4949
          offset += view.getUint32(offset + 4, little)
          const tags = view.getUint16(offset, little)
          for (let i = 0; i < tags; i++) {
            if (view.getUint16(offset + 2 + i * 12, little) === 0x0112)
              return resolve(view.getUint16(offset + 2 + i * 12 + 8, little))
          }
        } else if ((marker & 0xFF00) !== 0xFF00) break
        else offset += view.getUint16(offset, false)
      }
      resolve(1)
    }
    reader.readAsArrayBuffer(file.slice(0, 64 * 1024))
  })
}

async function resizeForVision(file) {
  const MAX = 2400
  // compressImage와 동일하게 createImageBitmap으로 EXIF를 한 번만 보정 (이중 회전 방지)
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
    const w = Math.round(bitmap.width * scale)
    const h = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h)
    bitmap.close()
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
    return { dataUrl, base64: dataUrl.split(',')[1] }
  } catch {
    // 폴백: createImageBitmap 미지원(구형 브라우저) — 수동 EXIF transform
    const orientation = await getExifOrientation(file)
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = () => {
          const needsRotate = orientation >= 5 && orientation <= 8
          const srcW = img.width, srcH = img.height
          const scale = Math.min(1, MAX / Math.max(srcW, srcH))
          const w = Math.round(srcW * scale)
          const h = Math.round(srcH * scale)

          const canvas = document.createElement('canvas')
          // orientation 5~8은 가로세로 스왑
          canvas.width  = needsRotate ? h : w
          canvas.height = needsRotate ? w : h

          const ctx = canvas.getContext('2d')
          // EXIF orientation별 변환 적용
          switch (orientation) {
            case 2: ctx.transform(-1, 0, 0, 1, w, 0); break
            case 3: ctx.transform(-1, 0, 0, -1, w, h); break
            case 4: ctx.transform(1, 0, 0, -1, 0, h); break
            case 5: ctx.transform(0, 1, 1, 0, 0, 0); break
            case 6: ctx.transform(0, 1, -1, 0, h, 0); break
            case 7: ctx.transform(0, -1, -1, 0, h, w); break
            case 8: ctx.transform(0, -1, 1, 0, 0, w); break
            default: break
          }
          ctx.drawImage(img, 0, 0, w, h)

          const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
          resolve({ dataUrl, base64: dataUrl.split(',')[1] })
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }
}

// 이미지 분석·가격검색 모두 Edge Function 프록시(callProxy) 경유
// API 키는 서버에만 존재. 웹 검색 pause_turn 루프는 callProxy가 처리.
async function callVisionAPI(messages, maxTokens = 2000, tools = null, vision = false) {
  return callProxy(messages, maxTokens, tools)
}

// 정규화 박스(0~1)로 dataUrl 이미지를 잘라 와인별 썸네일 생성.
// box가 없거나 비정상이면 전체 이미지로 폴백(빈 문자열 반환 시 호출부에서 전체 썸네일 사용).
async function cropToThumb(dataUrl, box, maxW = 320) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const W = img.width, H = img.height
      const valid = box && ['x','y','w','h'].every(k => typeof box[k] === 'number')
      let x = 0, y = 0, w = W, h = H
      if (valid) {
        x = box.x * W; y = box.y * H; w = box.w * W; h = box.h * H
        // 라벨만 너무 빡빡하게 잘리지 않도록 약간의 여백
        const padX = w * 0.08, padY = h * 0.08
        x -= padX; y -= padY; w += padX * 2; h += padY * 2
        // 이미지 경계 안으로 보정
        x = Math.max(0, Math.min(x, W)); y = Math.max(0, Math.min(y, H))
        w = Math.max(1, Math.min(w, W - x)); h = Math.max(1, Math.min(h, H - y))
        // 영역이 비정상적으로 작으면 전체로 폴백
        if (w < W * 0.04 || h < H * 0.04) { x = 0; y = 0; w = W; h = H }
      }
      const scale = Math.min(1, maxW / w)
      const canvas = document.createElement('canvas')
      canvas.width  = Math.round(w * scale)
      canvas.height = Math.round(h * scale)
      canvas.getContext('2d').drawImage(img, x, y, w, h, 0, 0, canvas.width, canvas.height)
      resolve(canvas.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => resolve('')
    img.src = dataUrl
  })
}

export function BulkImportModal({ onAddMany, onClose }) {
  const [step, setStep] = useState(1)
  const [category, setCategory] = useState('wine')
  const [cellarId, setCellarId] = useState('vindis1')
  const [slot, setSlot] = useState('1')
  const [photos, setPhotos] = useState([])
  const [wineList, setWineList] = useState([])
  const [enriching, setEnriching] = useState(false)
  const [enrichProgress, setEnrichProgress] = useState(0)
  const curCellar = cellarById(cellarId)
  const whisky = category === 'whisky'
  // 카테고리에 맞는 셀러만 노출 (위스키 → 진열장, 와인 → 셀러)
  const cellarOptions = CELLARS.filter(c => whisky === c.id.startsWith('shelf_'))

  function switchCategory(cat) {
    setCategory(cat)
    const first = CELLARS.find(c => (cat === 'whisky') === c.id.startsWith('shelf_'))
    if (first) { setCellarId(first.id); setSlot('1') }
  }

  // enrich 로직 분리 — handleFiles에서도 호출 가능하도록
  async function enrichWines(wines) {
    if (!wines.length) return wines
    setEnriching(true); setEnrichProgress(0)
    const webSearchTool = [{ type: 'web_search_20250305', name: 'web_search' }]
    const result = [...wines]
    const toEnrich = result.filter(w => !w._enriched && w.name && w.name !== '미확인')
    for (let i = 0; i < toEnrich.length; i++) {
      const w = toEnrich[i]
      try {
        const q = w.vintage ? `${w.name} ${w.vintage}` : w.name
        const enrichPrompt = whisky
          ? `위스키 "${q}"의 정보를 웹에서 검색하여 아래 JSON 형식으로만 반환하세요 (마크다운 없이, 설명 없이):
{"producer":"증류소","region":"지역(예: Speyside)","country":"국가","description":"이 위스키를 한국어로 2문장 설명","abv":null,"ageYears":null,"vivinoPrice":null,"wineSearcherPrice":null}

가격 수집 방법 (700ml 1병 기준):
- whiskybase.com / thewhiskyexchange.com 가격 조회
- dailyshot.co.kr 등 한국 주류 판매가 KRW 조회
- USD/GBP 가격은 현재 환율로 KRW 환산

- wineSearcherPrice: 한국 시장 기준 KRW 숫자만 (예: 180000)
- vivinoPrice: 글로벌 USD 숫자만
- abv: 도수 숫자 (예: 46), ageYears: 숙성연수 숫자 (NAS면 null)
- 모르는 필드는 null로 두세요.`
          : `와인 "${q}"의 정보를 웹에서 검색하여 아래 JSON 형식으로만 반환하세요 (마크다운 없이, 설명 없이):
{"producer":"생산자명","region":"지역명","country":"국가명","grape":"품종","description":"이 와인을 한국어로 2문장 설명","vivinoPrice":null,"vivinoRating":null,"wineSearcherPrice":null}

가격 수집 방법 (750ml 1병 기준):
- wine-searcher.com 한국(Korea) KRW 가격 조회
- dailyshot.co.kr KRW 가격 조회
- vivino.com USD 가격 조회 후 현재 환율로 KRW 환산

위 세 가격 중 가장 높은 KRW 금액을 wineSearcherPrice에 입력하세요.
vivinoPrice는 vivino.com USD 원본 가격 그대로 입력하세요.

- wineSearcherPrice: KRW 숫자만, 가장 높은 가격 (예: 1100000)
- vivinoPrice: USD 숫자만, vivino 원본 (예: 634)
- vivinoRating: Vivino 평점 숫자만 (예: 4.5)
- 모르는 필드는 null로 두세요.`
        const data = await callVisionAPI([{ role: 'user', content: enrichPrompt }],
          2000, webSearchTool)
        const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}'
        console.log(`[Enrich] ${q}:`, text)
        const cleaned = text.replace(/```json|```/g, '').trim()
        // 완성된 JSON 객체들 중 마지막 것을 사용 (앞쪽 설명 텍스트 무시)
        const candidates = cleaned.match(/\{[^{}]*\}/g) || []
        let info = {}
        for (let k = candidates.length - 1; k >= 0; k--) {
          try { info = JSON.parse(candidates[k]); break } catch { /* 다음 후보 */ }
        }
        const idx = result.findIndex(x => x._id === w._id)
        // AI가 imageUrl을 비워서 반환해도 사용자가 찍은 사진을 덮어쓰지 않도록 제외
        if (!info.imageUrl) delete info.imageUrl
        if (idx !== -1) result[idx] = { ...result[idx], ...info, _enriched: true }
        setWineList([...result])
      } catch (err) {
        console.error(`[Enrich] ${w.name} 실패:`, err)
      }
      setEnrichProgress(Math.round((i + 1) / toEnrich.length * 100))
    }
    setEnriching(false)
    return result
  }

  async function handleFiles(e) {
    const files = Array.from(e.target.files || [])
    if (!files.length) return

    const newPhotos = files.map(f => ({ id: uid(), file: f, dataUrl: null, status: 'pending' }))
    setPhotos(p => [...p, ...newPhotos])
    let newlyFound = []
    for (const ph of newPhotos) {
      const { dataUrl, base64 } = await resizeForVision(ph.file)
      // 저장용 썸네일 — 사용자가 찍은 사진을 와인 이미지로 그대로 활용
      let thumb = ''
      try { thumb = await compressImage(ph.file, 320) } catch { thumb = '' }
      setPhotos(p => p.map(x => x.id === ph.id ? { ...x, dataUrl, status: 'scanning' } : x))
      try {
        const visionPrompt = whisky
          ? `당신은 위스키 라벨 전문가입니다. 이 진열장 사진에서 보이는 모든 위스키 병의 라벨을 분석해주세요.

분석 지침:
- 병이 눕혀 있거나 라벨이 측면/부분만 보여도 최대한 읽어주세요
- 같은 위스키가 여러 병 있으면 qty에 병 수를 기재하세요
- 숙성연수(예: 12 Years)가 라벨에 보이면 ageYears에 숫자로 기재하세요 (NAS면 null)
- 도수(ABV %)가 보이면 abv에 숫자로 기재하세요
- 위스키 이름은 라벨에 표기된 공식 명칭으로 (예: "Glenfiddich 15", "Hibiki Japanese Harmony")
- 라벨을 전혀 읽을 수 없는 병만 "미확인"으로 처리하세요
- 각 위스키마다 사진에서 그 병이 차지하는 영역을 box로 표시하세요. box는 병 전체(병목~바닥)가 들어가도록 하고, 사진 왼쪽 위를 (0,0), 오른쪽 아래를 (1,1)로 한 비율 좌표입니다. x,y는 영역의 좌상단, w,h는 너비·높이(모두 0~1). 같은 위스키가 여러 병이면 대표 한 병의 box. 위치를 알 수 없으면 box는 null.

반드시 아래 JSON 배열 형식만 반환하세요 (마크다운, 설명 텍스트 절대 없이):
[{"name":"위스키 전체 이름","ageYears":숫자또는null,"abv":숫자또는null,"qty":병수정수,"box":{"x":0.0,"y":0.0,"w":1.0,"h":1.0}}]`
          : `당신은 와인 라벨 전문가입니다. 이 셀러 사진에서 보이는 모든 와인 병의 라벨을 분석해주세요.

분석 지침:
- 병이 눕혀 있거나 라벨이 측면/부분만 보여도 최대한 읽어주세요
- 같은 와인이 여러 병 있으면 qty에 병 수를 기재하세요
- 빈티지(연도)가 라벨에 보이면 반드시 기재하세요
- 와인 이름은 라벨에 표기된 공식 명칭으로 (예: "Château Lafite Rothschild", "Opus One")
- 같은 와인이라도 빈티지가 다르면 각각 별도 항목으로 기재하세요
- 라벨을 전혀 읽을 수 없는 병만 "미확인"으로 처리하세요
- 각 와인마다 사진에서 그 병이 차지하는 영역을 box로 표시하세요. box는 병 전체(병목~바닥)가 들어가도록 하고, 사진 왼쪽 위를 (0,0), 오른쪽 아래를 (1,1)로 한 비율 좌표입니다. x,y는 영역의 좌상단, w,h는 너비·높이(모두 0~1). 같은 와인이 여러 병이면 대표 한 병의 box. 위치를 알 수 없으면 box는 null.

반드시 아래 JSON 배열 형식만 반환하세요 (마크다운, 설명 텍스트 절대 없이):
[{"name":"와인 전체 이름","vintage":연도숫자또는null,"qty":병수정수,"box":{"x":0.0,"y":0.0,"w":1.0,"h":1.0}}]`
        const data = await callVisionAPI([{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64 } },
          { type: 'text', text: visionPrompt }
        ]}], 3000, null, true)

        const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '[]'
        console.log('[Vision] Raw response:', text)

        const cleaned = text.replace(/```json|```/g, '').trim()
        const match = cleaned.match(/\[[\s\S]*\]/)
        if (!match) throw new Error(`JSON 배열 없음: ${text.slice(0, 100)}`)

        const found = JSON.parse(match[0])
        if (!Array.isArray(found) || found.length === 0) throw new Error('빈 배열 반환')

        // 와인별로 라벨 위치(box)에 맞춰 사진을 잘라 개별 썸네일 생성.
        // box가 1개뿐이거나 없으면 전체 사진(thumb)으로 폴백.
        const singleBox = found.length === 1
        const withMeta = []
        for (const w of found) {
          let img = thumb
          if (!singleBox && w.box) {
            try {
              const cropped = await cropToThumb(dataUrl, w.box)
              if (cropped) img = cropped
            } catch { /* 크롭 실패 시 전체 사진 사용 */ }
          }
          withMeta.push({
            _id: uid(), name: w.name || '', vintage: whisky ? null : (w.vintage || null),
            qty: w.qty || 1, cellarId, slot, price: '', purchaseDate: '',
            imageUrl: img, notes: '', bottleSize: whisky ? 700 : 750, _enriched: false,
            category,
            ageYears: whisky ? (w.ageYears || null) : null,
            abv: whisky ? (w.abv || null) : null,
          })
        }
        newlyFound = [...newlyFound, ...withMeta]
        setWineList(p => [...p, ...withMeta])
        setPhotos(p => p.map(x => x.id === ph.id ? { ...x, status: 'done', count: found.length } : x))
      } catch (err) {
        console.error('[Vision] Error:', err)
        const msg = err.message === 'API 키 없음'
          ? '⚙️ API 키를 설정에서 입력해주세요'
          : `인식 실패: ${err.message}`
        setPhotos(p => p.map(x => x.id === ph.id ? { ...x, status: 'error', errMsg: msg } : x))
      }
    }
    e.target.value = ''

    // 사진 인식 완료 → 검토 화면(③)으로만 이동.
    // 가격 검색은 자동 시작하지 않고, 사용자가 용량·수량을 확인/수정한 뒤 직접 시작한다.
    if (newlyFound.length > 0) {
      setStep(3)
    }
  }

  async function runEnrich() {
    const current = wineList.filter(w => !w._enriched && w.name && w.name !== '미확인')
    await enrichWines(current)
  }

  const setField = (id, k, v) => setWineList(p => p.map(w => w._id === id ? { ...w, [k]: v } : w))
  const removeWine = id => setWineList(p => p.filter(w => w._id !== id))
  function confirm() { onAddMany(wineList.filter(w => w.name.trim() && w.name !== '미확인').map(w => ({ ...w, id: uid() }))) }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 680, width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.4rem', color: T.cream }}>📷 사진으로 일괄 입력</h2>
            <div style={{ fontSize: '0.75rem', color: T.muted, marginTop: 4 }}>{['① 칸 선택', '② 사진 업로드', '③ 검토 및 추가'][step - 1]}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* Progress bar */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 24 }}>
          {[1, 2, 3].map(n => <div key={n} style={{ flex: 1, height: 3, borderRadius: 2, background: step >= n ? T.gold : T.border }} />)}
        </div>

        {/* Step 1 */}
        {step === 1 && (
          <div>
            <p style={{ fontSize: '0.85rem', color: T.text, lineHeight: 1.7, marginBottom: 16 }}>
              촬영한 <strong style={{ color: T.cream }}>셀러와 칸 번호</strong>를 선택하세요. 한 칸씩 진행합니다.
            </p>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => switchCategory(c.id)} style={{
                  flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${category === c.id ? T.gold : T.border}`,
                  background: category === c.id ? `${T.gold}22` : T.surface,
                  color: category === c.id ? T.gold : T.muted,
                  fontSize: '0.85rem', fontWeight: 600,
                }}>{c.icon} {c.label}</button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 28 }}>
              <div><label style={lbl}>셀러</label><select value={cellarId} onChange={e => { setCellarId(e.target.value); setSlot('1') }}>{cellarOptions.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
              <div><label style={lbl}>칸 번호</label><select value={slot} onChange={e => setSlot(e.target.value)}>{getSlots(curCellar).map(s => <option key={s} value={s}>{s}번 칸</option>)}</select></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}><Btn variant="gold" onClick={() => setStep(2)}>다음 →</Btn></div>
          </div>
        )}

        {/* Step 2 */}
        {step === 2 && (
          <div>
            <div style={{ background: T.surface, border: `2px dashed ${T.border}`, borderRadius: 12, padding: 24, textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: '2rem', marginBottom: 8 }}>📸</div>
              <div style={{ fontSize: '0.875rem', color: T.text, marginBottom: 4 }}><strong style={{ color: T.cream }}>{cellarById(cellarId)?.name} · {slot}번 칸</strong> {whisky ? '위스키' : '와인'} 사진</div>
              <div style={{ fontSize: '0.78rem', color: T.muted, marginBottom: 16 }}>여러 장 선택 가능 · 라벨이 잘 보일수록 정확합니다</div>
              <label style={{ display: 'inline-block', background: T.gold, color: T.bg, border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: '0.875rem', fontWeight: 600, cursor: 'pointer' }}>
                📷 사진 선택 / 촬영
                <input type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFiles} />
              </label>
            </div>
            {photos.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
                {photos.map(ph => (
                  <div key={ph.id} style={{ display: 'flex', gap: 10, alignItems: 'center', background: T.surface, borderRadius: 8, padding: '8px 12px', border: `1px solid ${T.border}` }}>
                    {ph.dataUrl && <img src={ph.dataUrl} alt="" style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: '0.8rem', color: T.cream }}>{ph.file?.name}</div>
                      <div style={{ fontSize: '0.72rem', marginTop: 3 }}>
                        {ph.status === 'pending' && <span style={{ color: T.muted }}>대기 중...</span>}
                        {ph.status === 'scanning' && <span style={{ color: T.gold }}>🔍 분석 중...</span>}
                        {ph.status === 'done' && <span style={{ color: '#4a8a5e' }}>✓ {ph.count}종 인식</span>}
                        {ph.status === 'error' && <span style={{ color: '#c0392b' }}>✕ {ph.errMsg || '인식 실패'}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <Btn variant="ghost" onClick={() => setStep(1)}>← 이전</Btn>
              <Btn variant="gold" onClick={() => setStep(3)} style={{ opacity: wineList.length > 0 ? 1 : 0.4 }} disabled={wineList.length === 0}>
                {wineList.length > 0 ? `검토하기 (${wineList.length}종) →` : '사진을 업로드하세요'}
              </Btn>
            </div>
          </div>
        )}

        {/* Step 3 */}
        {step === 3 && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={{ fontSize: '0.82rem', color: T.muted }}>
                <span style={{ color: T.cream, fontWeight: 600 }}>{wineList.length}종</span> 인식 →
                <span style={{ color: T.gold }}> {cellarById(cellarId)?.name} · {slot}번 칸</span>
              </div>
              <button onClick={runEnrich} disabled={enriching} style={{ background: enriching ? T.muted : T.surface, color: enriching ? T.bg : T.gold, border: `1px solid ${T.gold}44`, cursor: enriching ? 'not-allowed' : 'pointer', borderRadius: 8, padding: '6px 14px', fontSize: '0.78rem' }}>
                {enriching ? `🔍 가격 검색 중... ${enrichProgress}%` : (wineList.some(w => w._enriched) ? '🔄 가격·정보 다시 검색' : '🔍 가격·정보 검색')}
              </button>
            </div>
            {!enriching && !wineList.some(w => w._enriched) && (
              <div style={{ fontSize: '0.74rem', color: T.muted, marginBottom: 12, lineHeight: 1.5 }}>
                용량·수량을 확인한 뒤 <span style={{ color: T.gold }}>🔍 가격·정보 검색</span>을 눌러 시작하세요.
              </div>
            )}
            <div style={{ maxHeight: 380, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
              {wineList.map(w => (
                <div key={w._id} style={{ background: T.surface, border: `1px solid ${w._enriched ? T.gold + '44' : T.border}`, borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                    <label style={{ cursor: 'pointer', flexShrink: 0, position: 'relative', display: 'block' }} title="눌러서 사진 교체">
                      {w.imageUrl ? <img src={w.imageUrl} alt="" style={{ width: 36, height: 52, objectFit: 'cover', borderRadius: 4, display: 'block' }} onError={e => e.target.style.display = 'none'} /> : <div style={{ width: 36, height: 52, background: T.card, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.1rem', border: `1px solid ${T.border}` }}>{whisky ? '🥃' : '🍷'}</div>}
                      <span style={{ position: 'absolute', bottom: -2, right: -2, fontSize: '0.6rem', background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, padding: '0 2px', color: T.muted }}>✎</span>
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={async e => {
                        const f = e.target.files?.[0]; if (!f) return
                        try { const t = await compressImage(f, 320); setField(w._id, 'imageUrl', t) } catch { /* 무시 */ }
                        e.target.value = ''
                      }} />
                    </label>
                    <div style={{ flex: 1 }}>
                      <input value={w.name} onChange={e => setField(w._id, 'name', e.target.value)} style={{ marginBottom: 6, fontWeight: 500, fontSize: '0.875rem' }} placeholder={whisky ? '위스키 이름' : '와인 이름'} />
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                        {whisky
                          ? <input value={w.ageYears || ''} onChange={e => setField(w._id, 'ageYears', e.target.value ? parseInt(e.target.value) : null)} type="number" placeholder="숙성연수" style={{ fontSize: '0.8rem' }} />
                          : <input value={w.vintage || ''} onChange={e => setField(w._id, 'vintage', e.target.value ? parseInt(e.target.value) : null)} type="number" placeholder="빈티지" style={{ fontSize: '0.8rem' }} />}
                        <input value={w.qty} onChange={e => setField(w._id, 'qty', parseInt(e.target.value) || 1)} type="number" min="1" style={{ fontSize: '0.8rem' }} placeholder="수량" />
                        <input value={w.price || ''} onChange={e => setField(w._id, 'price', e.target.value)} type="number" placeholder="구매가 ₩" style={{ fontSize: '0.8rem' }} />
                      </div>
                      <div style={{ marginTop: 6 }}>
                        <select value={w.bottleSize || 750} onChange={e => setField(w._id, 'bottleSize', parseInt(e.target.value))} style={{ fontSize: '0.8rem' }}>
                          {BOTTLE_SIZES.map(b => <option key={b.ml} value={b.ml}>{b.label}</option>)}
                        </select>
                      </div>
                      {w._enriched && <div style={{ marginTop: 5, fontSize: '0.72rem', color: T.muted, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        {w.producer && <span>{w.producer}</span>}
                        {w.region && <span>{w.region}</span>}
                        {w.grape && <span>🍇 {w.grape}</span>}
                        {whisky && w.abv && <span>{w.abv}%</span>}
                        {(w.vivinoPrice || w.wineSearcherPrice) && <span style={{ color: T.gold }}>${w.vivinoPrice && w.wineSearcherPrice ? Math.round((w.vivinoPrice + w.wineSearcherPrice) / 2) : (w.vivinoPrice || w.wineSearcherPrice)}</span>}
                      </div>}
                    </div>
                    <button onClick={() => removeWine(w._id)} style={{ background: 'none', border: 'none', color: T.muted, cursor: 'pointer', fontSize: '1rem', padding: '2px 6px', flexShrink: 0 }}>✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Btn variant="ghost" onClick={() => setStep(2)}>← 뒤로</Btn>
              <Btn variant="gold" onClick={confirm}>{whisky ? '🥃' : '🍷'} {wineList.filter(w => w.name.trim() && w.name !== '미확인').length}건 전체 추가</Btn>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

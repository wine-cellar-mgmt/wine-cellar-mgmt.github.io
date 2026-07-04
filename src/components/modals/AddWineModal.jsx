import { useState } from 'react'
import { CELLARS, getSlots, cellarById, T, uid, krw, callAI, BOTTLE_SIZES, CATEGORIES } from '../../config/cellars.js'
import { Btn, lbl, ImagePicker } from '../ui.jsx'

export default function AddWineModal({ pre = {}, onAdd, onClose }) {
  const today = new Date().toISOString().split('T')[0]
  const initCellar = pre.cellarId || 'vindis1'
  const [form, setForm] = useState({
    name: '', vintage: '', qty: 1, price: '', purchaseDate: today,
    cellarId: initCellar, slot: pre.slot || '1',
    bottleSize: 750,
    imageUrl: '', notes: '',
    category: 'wine', ageYears: '', abv: '',
  })
  const [aiLoad, setAiLoad] = useState(false)
  const [aiInfo, setAiInfo] = useState(null)
  const [imgSrc, setImgSrc] = useState('')
  const [imgSearching, setImgSearching] = useState(false)
  const [imgErr, setImgErr] = useState(false)
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }))
  const curCellar = cellarById(form.cellarId)
  const whisky = form.category === 'whisky'

  // 카테고리 전환 시 기본 보관처·병 용량 전환 (사용자가 이미 고른 값은 슬롯만 초기화)
  function setCategory(cat) {
    setForm(p => {
      const next = { ...p, category: cat }
      if (cat === 'whisky' && !p.cellarId.startsWith('shelf_')) {
        next.cellarId = 'shelf_living'; next.slot = '1'
        if (Number(p.bottleSize) === 750) next.bottleSize = 700
      }
      if (cat === 'wine' && p.cellarId.startsWith('shelf_')) {
        next.cellarId = 'vindis1'; next.slot = '1'
        if (Number(p.bottleSize) === 700) next.bottleSize = 750
      }
      return next
    })
  }

  async function runAI() {
    if (!form.name.trim()) return
    setAiLoad(true); setAiInfo(null); setImgSearching(true); setImgErr(false)
    try {
      const q = form.vintage ? `${form.name} ${form.vintage}` : form.name
      const prompt = whisky
        ? `위스키 "${q}"의 정보를 웹에서 검색하여 JSON만 반환 (마크다운 없이):
{"producer":"증류소","region":"지역(예: Speyside)","country":"국가","description":"한국어 2문장","imageUrl":"이미지URL또는빈문자열","abv":null,"ageYears":null,"vivinoPrice":null,"wineSearcherPrice":null}

가격 수집 방법 (700ml 1병 기준):
- whiskybase.com / thewhiskyexchange.com 가격 조회
- dailyshot.co.kr 또는 한국 주류 판매가 KRW 조회
- USD/GBP 가격은 현재 환율로 KRW 환산

한국 시장 기준 KRW → wineSearcherPrice
글로벌 USD 가격 → vivinoPrice
abv는 도수 숫자(예: 46), ageYears는 숙성연수 숫자(NAS면 null)
숫자만, 모르면 null
응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
        : `와인 "${q}"의 정보를 웹에서 검색하여 JSON만 반환 (마크다운 없이):
{"producer":"생산자","region":"지역","country":"국가","grape":"품종","description":"한국어 2문장","imageUrl":"이미지URL또는빈문자열","vivinoPrice":null,"vivinoRating":null,"wineSearcherPrice":null}

가격 수집 방법 (750ml 1병 기준):
- wine-searcher.com 한국(Korea) KRW 가격 조회
- dailyshot.co.kr KRW 가격 조회
- vivino.com USD 가격 조회 후 현재 환율로 KRW 환산

세 가격 중 가장 높은 KRW → wineSearcherPrice
vivino USD 원본 → vivinoPrice
숫자만, 모르면 null
응답의 마지막은 반드시 완성된 JSON 객체 하나여야 한다.`
      const data = await callAI([{ role: 'user', content: prompt }], 2000, [{ type: 'web_search_20250305', name: 'web_search' }])
      const text = data.content?.filter(b => b.type === 'text').map(b => b.text).join('') || '{}'
      const cleaned = text.replace(/```json|```/g, '').trim()
      // 완성된 JSON 객체들 중 마지막 것을 사용 (앞쪽 설명 텍스트 무시)
      const candidates = cleaned.match(/\{[^{}]*\}/g) || []
      let info = null
      for (let k = candidates.length - 1; k >= 0; k--) {
        try { info = JSON.parse(candidates[k]); break } catch { /* 다음 후보 */ }
      }
      if (!info) throw new Error(`JSON 추출 실패: ${text.slice(0, 100)}`)
      setAiInfo(info)
      if (info.imageUrl) { set('imageUrl', info.imageUrl); setImgSrc('ai'); setImgErr(false) }
      else setImgErr(true)
    } catch (e) {
      console.error(e)
      if (e.message === 'API 키 없음') alert('⚙️ 설정에서 Claude API 키를 입력해주세요')
      setImgErr(true)
    }
    setAiLoad(false); setImgSearching(false)
  }

  function submit() {
    if (!form.name.trim()) { alert(whisky ? '위스키 이름을 입력하세요' : '와인 이름을 입력하세요'); return }
    onAdd({
      ...form, ...(aiInfo || {}),
      id: uid(),
      category: form.category,
      vintage: !whisky && form.vintage ? parseInt(form.vintage) : null,
      qty: parseInt(String(form.qty)) || 1,
      price: parseInt(String(form.price).replace(/,/g, '')) || 0,
      bottleSize: parseInt(String(form.bottleSize)) || 750,
      // 사용자 입력 우선, 없으면 AI 값
      abv: whisky ? (form.abv ? parseFloat(form.abv) : (aiInfo?.abv ?? null)) : null,
      ageYears: whisky ? (form.ageYears ? parseInt(form.ageYears) : (aiInfo?.ageYears ?? null)) : null,
    })
  }

  const G = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.4rem', color: T.cream }}>{whisky ? '위스키 추가' : '와인 추가'}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '1.2rem' }}>✕</button>
        </div>

        {/* 카테고리 선택 */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          {CATEGORIES.map(c => (
            <button key={c.id} onClick={() => setCategory(c.id)} style={{
              flex: 1, padding: '8px 0', borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${form.category === c.id ? T.gold : T.border}`,
              background: form.category === c.id ? `${T.gold}22` : T.surface,
              color: form.category === c.id ? T.gold : T.muted,
              fontSize: '0.85rem', fontWeight: 600,
            }}>{c.icon} {c.label}</button>
          ))}
        </div>

        {/* Name + AI */}
        <div style={{ marginBottom: 12 }}>
          <label style={lbl}>{whisky ? '위스키 이름 *' : '와인 이름 *'}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={form.name} onChange={e => set('name', e.target.value)}
              placeholder={whisky ? '예: Glenfiddich 15' : '예: Château Margaux'} style={{ flex: 1 }}
              onKeyDown={e => e.key === 'Enter' && runAI()} />
            <button onClick={runAI} disabled={aiLoad || !form.name.trim()} style={{
              background: aiLoad || !form.name.trim() ? T.muted : T.gold,
              color: T.bg, border: 'none', borderRadius: 8, padding: '9px 14px',
              fontSize: '0.8rem', fontWeight: 600,
              cursor: aiLoad || !form.name.trim() ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap', flexShrink: 0,
            }}>{aiLoad ? '검색 중...' : '🔍 AI 검색'}</button>
          </div>
        </div>

        {/* AI info */}
        {aiInfo && (
          <div style={{ background: T.surface, border: `1px solid ${T.gold}44`, borderRadius: 8, padding: '12px 14px', marginBottom: 12 }}>
            <div style={{ color: T.gold, fontWeight: 600, marginBottom: 8, fontSize: '0.8rem' }}>✓ AI 정보</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 16px', marginBottom: 8 }}>
              {[['생산자', aiInfo.producer], ['지역', aiInfo.region], ['국가', aiInfo.country], ['품종', aiInfo.grape]].map(([k, v]) =>
                v && <div key={k} style={{ fontSize: '0.78rem', color: T.text }}><span style={{ color: T.muted }}>{k}: </span>{v}</div>
              )}
            </div>
            {(aiInfo.vivinoPrice || aiInfo.wineSearcherPrice) && (
              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <span style={{ fontSize: '0.72rem', color: T.muted, textTransform: 'uppercase' }}>시장가</span>
                {aiInfo.wineSearcherPrice && <span style={{ fontSize: '0.78rem' }}>한국 시장가 <strong style={{ color: T.gold }}>{krw(aiInfo.wineSearcherPrice)}</strong></span>}
                {aiInfo.vivinoPrice && <span style={{ fontSize: '0.78rem' }}>Vivino <strong style={{ color: T.cream }}>${aiInfo.vivinoPrice}</strong></span>}
              </div>
            )}
            {aiInfo.description && <p style={{ color: T.text, fontStyle: 'italic', marginTop: 8, lineHeight: 1.5, fontSize: '0.78rem', borderLeft: `2px solid ${T.gold}`, paddingLeft: 8 }}>{aiInfo.description}</p>}
          </div>
        )}

        {whisky ? (
          <>
            <div style={G}>
              <div><label style={lbl}>숙성연수 (년)</label><input value={form.ageYears} onChange={e => set('ageYears', e.target.value)} type="number" placeholder="예: 15 (NAS면 비움)" /></div>
              <div><label style={lbl}>도수 (%)</label><input value={form.abv} onChange={e => set('abv', e.target.value)} type="number" step="0.1" placeholder="예: 46" /></div>
            </div>
            <div style={G}>
              <div><label style={lbl}>수량 (병)</label><input value={form.qty} onChange={e => set('qty', e.target.value)} type="number" min="1" /></div>
              <div></div>
            </div>
          </>
        ) : (
          <div style={G}>
            <div><label style={lbl}>빈티지</label><input value={form.vintage} onChange={e => set('vintage', e.target.value)} type="number" placeholder="예: 2018" /></div>
            <div><label style={lbl}>수량 (병)</label><input value={form.qty} onChange={e => set('qty', e.target.value)} type="number" min="1" /></div>
          </div>
        )}
        <div style={G}>
          <div><label style={lbl}>구매일</label><input value={form.purchaseDate} onChange={e => set('purchaseDate', e.target.value)} type="date" /></div>
          <div><label style={lbl}>구매가격 (₩)</label><input value={form.price} onChange={e => set('price', e.target.value)} type="number" placeholder="예: 150000" /></div>
        </div>
        <div style={G}>
          <div>
            <label style={lbl}>셀러</label>
            <select value={form.cellarId} onChange={e => { set('cellarId', e.target.value); set('slot', '1') }}>
              {CELLARS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>칸 번호</label>
            <select value={form.slot} onChange={e => set('slot', e.target.value)}>
              {getSlots(curCellar).map(s => <option key={s} value={s}>{s}번 칸</option>)}
            </select>
          </div>
        </div>
        <div style={G}>
          <div>
            <label style={lbl}>병 용량</label>
            <select value={form.bottleSize} onChange={e => set('bottleSize', e.target.value)}>
              {BOTTLE_SIZES.map(b => <option key={b.ml} value={b.ml}>{b.label}</option>)}
            </select>
          </div>
          <div></div>
        </div>

        <ImagePicker
          imageUrl={form.imageUrl} imgSrc={imgSrc} imgSearching={imgSearching} imgErr={imgErr}
          onClear={() => { set('imageUrl', ''); setImgSrc(''); setImgErr(false) }}
          onUpload={dataUrl => { set('imageUrl', dataUrl); setImgSrc('upload'); setImgErr(false) }}
          onRetry={runAI}
        />

        <div style={{ marginBottom: 22 }}>
          <label style={lbl}>메모</label>
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} placeholder="테이스팅 노트, 보관 메모 등..." style={{ resize: 'vertical' }} />
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Btn variant="ghost" onClick={onClose}>취소</Btn>
          <Btn variant="gold" onClick={submit}>저장</Btn>
        </div>
      </div>
    </div>
  )
}

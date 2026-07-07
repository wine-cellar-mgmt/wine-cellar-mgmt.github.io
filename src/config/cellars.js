export const CELLARS = [
  { id: 'vindis1',  name: 'VINDIS #1', slots: 10, maxPerSlot: 20 },
  { id: 'vindis2',  name: 'VINDIS #2', slots: 10, maxPerSlot: 20 },
  { id: 'eurocave', name: 'EUROCAVE',  slots: 15, maxPerSlot: 12 },
  { id: 'shelf_study',  name: '서재 진열장', slots: 2, maxPerSlot: 25 },
  { id: 'shelf_living', name: '거실 진열장', slots: 6, maxPerSlot: 20 },
]

// ── 카테고리 (와인/위스키) ───────────────────────────────────────
export const CATEGORIES = [
  { id: 'wine',   label: '와인',   icon: '🍷' },
  { id: 'whisky', label: '위스키', icon: '🥃' },
]
export const isWhisky = w => w?.category === 'whisky'
// 개봉 배지: 위스키가 개봉된 경우에만 표시 (예: 🥃 개봉 55%)
export function openedBadge(w) {
  if (!isWhisky(w) || !w.openedDate) return null
  const pct = w.remainingPct == null ? 100 : w.remainingPct
  return `🥃 개봉 ${pct}%`
}

export function cellarById(id) { return CELLARS.find(c => c.id === id) }
export function getSlots(cellar) { return Array.from({ length: cellar.slots }, (_, i) => String(i + 1)) }

export const T = {
  bg:'#0c0910', surface:'#15101c', card:'#1c1526', cardHover:'#231a2e',
  border:'#2c1e3c', borderBright:'#4a3060',
  gold:'#c9a84c', goldDim:'#8a6c2c',
  wine:'#7c1e2e', wineLight:'#a02840',
  cream:'#f0e6d3', text:'#ccc0d8', muted:'#6a5878', mutedMid:'#9080a0',
}

let _seq = 0
export const uid = () => `${Date.now()}_${++_seq}`
export const krw = n => n ? '₩' + Number(n).toLocaleString('ko-KR') : '-'
export const kdate = d => d ? new Date(d).toLocaleDateString('ko-KR') : '-'

// ── 병 용량 ──────────────────────────────────────────────────────
// 기본 750ml(일반병). 매그넘 등은 드롭다운으로 선택.
export const BOTTLE_SIZES = [
  { ml: 700,  label: '700ml (위스키)' },
  { ml: 750,  label: '일반 (750ml)' },
  { ml: 1000, label: '1L' },
  { ml: 1500, label: '매그넘 (1.5L)' },
]
export function bottleLabel(ml) {
  const m = BOTTLE_SIZES.find(b => b.ml === Number(ml))
  return m ? m.label : `${ml}ml`
}
// 일반병(750)·위스키 표준(700)·미설정이면 null → 배지 표시 안 함
export function bottleBadge(ml) {
  const n = Number(ml)
  if (!n || n === 750 || n === 700) return null
  if (n === 1500) return '🍾 매그넘'
  return `🍾 ${n >= 1000 ? (n / 1000) + 'L' : n + 'ml'}`
}

// ── 음용 적기 ────────────────────────────────────────────────────
export function getDrinkingStatus(wine) {
  if (wine?.category === 'whisky') return null // 위스키는 음용 적기 개념 없음
  const year = new Date().getFullYear()
  const from = wine.drinkingFrom
  const to   = wine.drinkingTo

  if (!from || !to) {
    // 빈티지 기반 추정
    if (!wine.vintage) {
      // 빈티지도 명시적 음용시기도 없을 때 — 구매일(purchaseDate) 기반 폴백
      if (wine.purchaseDate) {
        const pYear = new Date(wine.purchaseDate).getFullYear()
        if (year - pYear < 2) return { status: 'ready',   label: '마시기 좋음', color: '#4a8a5e', icon: '🟢' }
        return                       { status: 'decline', label: '빨리 마셔야', color: T.muted,   icon: '⚪' }
      }
      // 구매일조차 없으면 — 우선 마셔야 할 대상으로 분류
      return { status: 'decline', label: '빨리 마셔야', color: T.muted, icon: '⚪' }
    }
    const age = year - wine.vintage
    if (age < 5)  return { status: 'young',  label: '숙성 중',     color: '#5b8dd9', icon: '🔵' }
    if (age < 15) return { status: 'ready',  label: '마시기 좋음', color: '#4a8a5e', icon: '🟢' }
    if (age < 30) return { status: 'peak',   label: '절정',        color: T.gold,    icon: '⭐' }
    return            { status: 'decline', label: '빨리 마셔야',   color: T.muted,   icon: '⚪' }
  }

  if (year < from)  return { status: 'young',  label: `${from}년부터`,   color: '#5b8dd9', icon: '🔵', from, to }
  if (year <= to)   return { status: 'peak',   label: '지금 마시기 좋음', color: '#4a8a5e', icon: '🟢', from, to }
  return              { status: 'decline', label: '빨리 마셔야',          color: T.muted,   icon: '⚪', from, to }
}

// ── 이미지 압축 ──────────────────────────────────────────────────
// EXIF 회전 보정 포함 (모바일 사진이 옆으로 눕는 문제 방지)
// createImageBitmap + imageOrientation 지원 브라우저에서는 자동 보정,
// 미지원 브라우저는 기존 FileReader 방식으로 폴백
export async function compressImage(file, maxW = 320, quality = 0.75) {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale  = Math.min(1, maxW / bitmap.width)
    const canvas = document.createElement('canvas')
    canvas.width  = Math.round(bitmap.width  * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    return canvas.toDataURL('image/jpeg', quality)
  } catch {
    // 폴백: createImageBitmap 미지원 환경 (구형 브라우저)
    return new Promise(resolve => {
      const reader = new FileReader()
      reader.onload = e => {
        const img = new Image()
        img.onload = () => {
          const scale = Math.min(1, maxW / img.width)
          const canvas = document.createElement('canvas')
          canvas.width  = Math.round(img.width  * scale)
          canvas.height = Math.round(img.height * scale)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        }
        img.src = e.target.result
      }
      reader.readAsDataURL(file)
    })
  }
}

// ── 가격 선별 규칙 (합리적 최고가) — 모든 가격 검색 프롬프트 공용 ──
// 단순 최고가가 아니라 이상치를 걸러낸 뒤의 최고가를 기록한다.
// prevKrw(직전 기록가)가 있으면 급변 검증 조항을 추가한다.
export function priceGuardText(prevKrw) {
  const prev = prevKrw
    ? `\n- 참고 직전 기록가 ₩${Number(prevKrw).toLocaleString('ko-KR')}: 새 최고가가 이의 2.5배 초과 또는 40% 미만이면 서로 다른 출처 2곳 이상이 일치할 때만 채택, 아니면 그다음 후보 채택`
    : ''
  return `가격 선별 규칙 (합리적 최고가):
- 기준 용량이 아닌 가격 제외: 매그넘·하프·미니어처, 세트/기프트박스, 케이스(6·12병) 단위
- 경매 낙찰가, 품절 상품의 옛 표시가, 자릿수 오표기 제외
- 후보가 2개 이상이면 중앙값의 3배 초과 가격은 이상치로 제외
- 한국 소매가(데일리샷 등) 우선 — 글로벌 평균의 환율 환산값은 국내가를 못 찾았을 때의 폴백이며, 환산값이 낮다고 국내가를 끌어내리지 않는다
- 검증을 통과한 후보 중 가장 높은 KRW → wineSearcherPrice (통과 후보 없으면 null)${prev}`
}

// ── Anthropic API ────────────────────────────────────────────────
// API 키는 Supabase Edge Function(anthropic-proxy)에만 존재한다.
// 브라우저에는 키를 두지 않고, 로그인 세션 토큰으로 프록시를 호출한다.
// maxTokens 기본값 2000: 800 이하는 JSON 잘림으로 조용한 실패 발생 (2026-06 확인)
import { callProxy } from '../lib/supabase.js'

export async function callAI(messages, maxTokens = 2000, tools = null) {
  return callProxy(messages, maxTokens, tools)
}

// ── 공유 URL ─────────────────────────────────────────────────────
export function getShareUrl(wine) {
  const base = window.location.origin + window.location.pathname
  return `${base}?share=${wine.shareToken || wine.id}`
}

export function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {
    const el = document.createElement('textarea')
    el.value = text; document.body.appendChild(el)
    el.select(); document.execCommand('copy')
    document.body.removeChild(el)
  })
}

// ── 와인 이름 정규화 / 지문 (검색·비슷한 이름 묶기 공용) ──────────
// normalizeWineText: 소문자·악센트·기호 정리.
// nameFingerprint: 등급·수식어와 타입/지역 꼬리표를 걷어낸 "핵심 이름".
//   같은 와인의 다른 표기를 같은 값으로 모은다.
//   주의: Brut/Rosé/Classic/Sec 등 제품을 실제로 구분하는 단어는 일부러 남긴다.
export function normalizeWineText(text) {
  if (!text) return ''
  return text.toLowerCase()
    .replace(/château/gi, 'chateau')
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
    .replace(/à/g, 'a').replace(/â/g, 'a')
    .replace(/ô/g, 'o').replace(/î/g, 'i')
    .replace(/[·•\-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

export const NAME_STOPWORDS = [
  'grand vin de', 'grand vin', 'premier grand cru classe', 'premier grand cru',
  'grand cru classe', 'premier cru classe', 'deuxieme cru classe', 'troisieme cru classe',
  'grand cru', 'premier cru', '1er cru', '1er grand cru classe', '1er grand cru',
  'mis en bouteille au chateau', 'mis en bouteille', 'appellation controlee',
  'appellation contrôlée', 'appellation', 'product of france', 'red wine', 'white wine',
  // 타입/거품 종류/지역 꼬리표 — 같은 와인에 붙었다 안 붙었다 하는 단어들
  'sparkling wine', 'sparkling', 'champagne', 'cremant', 'crémant', 'cava', 'prosecco',
]
export function nameFingerprint(name) {
  let s = ` ${normalizeWineText(name)} `
  // 단어 단위로만 제거 (앞뒤 공백 기준) — 다른 단어 일부가 잘리지 않도록
  for (const w of NAME_STOPWORDS) s = s.split(` ${normalizeWineText(w)} `).join(' ')
  return s.replace(/\s+/g, ' ').trim()
}

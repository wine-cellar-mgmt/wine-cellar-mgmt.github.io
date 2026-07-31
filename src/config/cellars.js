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
// 개봉 여부: 개봉일이 있거나, 개봉일을 몰라도 잔량이 입력돼 있으면 개봉으로 본다
// (오래 전에 열어 개봉일을 기억하지 못하는 병 대응)
export const isOpened = w => isWhisky(w) && (!!w.openedDate || w.remainingPct != null)
// 개봉 배지: 위스키가 개봉된 경우에만 표시 (예: 🥃 개봉 55%)
export function openedBadge(w) {
  if (!isOpened(w)) return null
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

// 병 사이즈 검색용 별칭 텍스트 — bottleSize는 숫자로만 저장되므로
// '매그넘/magnum/1.5L/1500' 등으로 검색되도록 텍스트로 펼친다(표준 750/700ml은 제외).
export function bottleSizeAliases(ml) {
  const n = Number(ml)
  if (!n || n === 750 || n === 700) return ''
  const map = {
    375: '하프 half 375ml 0.375L',
    500: '500ml 0.5L',
    1000: '1L 1000ml 리터',
    1500: '매그넘 magnum 1.5L 1500ml',
    3000: '더블 매그넘 double magnum 제로보암 jeroboam 3L 3000ml',
    6000: '제로보암 jeroboam 6L 6000ml',
    9000: '살마나자르 salmanazar 9L 9000ml',
  }
  return map[n] || `${n}ml${n >= 1000 && n % 1000 === 0 ? ' ' + (n / 1000) + 'L' : ''}`
}

// 가격대별 숙성 임계값(연차) — 데일리 와인은 일찍, 고급 와인은 오래 버틴다고 가정.
// 시장가(원화) 우선, 없으면 비비노(달러) 참고, 둘 다 없으면 프리미엄 취급(보수적 — 오판으로 급하게 마시라 재촉하지 않도록).
function priceTierThresholds(wine) {
  const krw = wine.wineSearcherPrice || 0
  const usd = wine.vivinoPrice || 0
  const cheap = (krw > 0 && krw < 50000) || (krw === 0 && usd > 0 && usd < 35)
  const mid   = !cheap && ((krw > 0 && krw < 150000) || (krw === 0 && usd > 0 && usd < 100))
  if (cheap) return { young: 3, ready: 7,  peak: 12 } // 데일리 와인
  if (mid)   return { young: 4, ready: 10, peak: 20 } // 중가
  return       { young: 5, ready: 15, peak: 30 }      // 프리미엄 / 가격 정보 없음
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
    const t = priceTierThresholds(wine)
    if (age < t.young) return { status: 'young',  label: '숙성 중',     color: '#5b8dd9', icon: '🔵' }
    if (age < t.ready) return { status: 'ready',  label: '마시기 좋음', color: '#4a8a5e', icon: '🟢' }
    if (age < t.peak)  return { status: 'peak',   label: '절정',        color: T.gold,    icon: '⭐' }
    return                    { status: 'decline', label: '빨리 마셔야',   color: T.muted,   icon: '⚪' }
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

// ── 비전 인식용 이미지 처리 (사진 일괄 입력·외부 기록 공용) ────────
// 모바일 EXIF orientation 읽기 (createImageBitmap 미지원 폴백용)
export async function getExifOrientation(file) {
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

// AI 비전 분석용 리사이즈 (dataUrl + base64 함께 반환). compressImage와 동일하게
// createImageBitmap으로 EXIF를 한 번만 보정(이중 회전 방지), 미지원 시 수동 transform 폴백.
export async function resizeForVision(file) {
  const MAX = 2400
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
          canvas.width  = needsRotate ? h : w
          canvas.height = needsRotate ? w : h

          const ctx = canvas.getContext('2d')
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

// 정규화 박스(0~1)로 dataUrl 이미지를 잘라 항목별 썸네일 생성.
// box가 없거나 비정상이면 전체 이미지로 폴백.
export async function cropToThumb(dataUrl, box, maxW = 320) {
  return new Promise(resolve => {
    const img = new Image()
    img.onload = () => {
      const W = img.width, H = img.height
      const valid = box && ['x','y','w','h'].every(k => typeof box[k] === 'number')
      let x = 0, y = 0, w = W, h = H
      if (valid) {
        x = box.x * W; y = box.y * H; w = box.w * W; h = box.h * H
        const padX = w * 0.08, padY = h * 0.08
        x -= padX; y -= padY; w += padX * 2; h += padY * 2
        x = Math.max(0, Math.min(x, W)); y = Math.max(0, Math.min(y, H))
        w = Math.max(1, Math.min(w, W - x)); h = Math.max(1, Math.min(h, H - y))
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
// 전각(Fullwidth) 영숫자·기호를 반각으로 — 전각으로 입력해도 검색되게 한다 (예: '３０ Years' → '30 years')
const toHalfWidth = s => s
  .replace(/[！-～]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))
  .replace(/　/g, ' ')

export function normalizeWineText(text) {
  if (!text) return ''
  return toHalfWidth(text).toLowerCase()
    .replace(/château/gi, 'chateau')
    .replace(/é/g, 'e').replace(/è/g, 'e').replace(/ê/g, 'e')
    .replace(/à/g, 'a').replace(/â/g, 'a')
    .replace(/ô/g, 'o').replace(/î/g, 'i')
    .replace(/[·•\-]/g, ' ')
    .replace(/\s+/g, ' ').trim()
}

// ── 다국어 동의어 사전 (검색·음주기록 검색 공용) ───────────────────
export const WINE_SYNONYMS = [
  // 샤또 마고
  ['chateau margaux', 'château margaux', '샤또 마고', '샤토 마고', 'margaux'],
  // 라피트 로칠드
  ['chateau lafite rothschild', 'château lafite rothschild', '샤또 라피트 로칠드', '라피트 로칠드', 'lafite', 'lafite rothschild'],
  // 무통 로칠드
  ['chateau mouton rothschild', 'château mouton rothschild', '샤또 무통 로칠드', '무통 로칠드', 'mouton rothschild'],
  // 라투르
  ['chateau latour', 'château latour', '샤또 라투르', '라투르', 'grand vin de château latour', 'grand vin de chateau latour'],
  // 오브리옹
  ['chateau haut-brion', 'château haut-brion', '샤또 오브리옹', '오브리옹', 'haut brion'],
  // 오퍼스 원
  ['opus one', '오퍼스 원', '오퍼스원'],
  // 페트뤼스
  ['petrus', 'pétrus', '페트뤼스', '페트루스'],
  // 이켐
  ["chateau d'yquem", "château d'yquem", '샤또 디켐', '디켐', 'yquem'],
  // 시라/쉬라즈
  ['shiraz', 'syrah', '시라', '쉬라', '쉬라즈'],
  // 피노누아
  ['pinot noir', '피노 누아', '피노누아'],
  // 카베르네 소비뇽
  ['cabernet sauvignon', '카베르네 소비뇽', '카베르네소비뇽', 'cab sauv'],
  // 소비뇽 블랑
  ['sauvignon blanc', '소비뇽 블랑', '소비뇽블랑'],
  // 샤르도네
  ['chardonnay', '샤르도네', '샤도네이'],
  // 리슬링
  ['riesling', '리슬링'],
  // 말벡
  ['malbec', '말벡'],
  // 메를로
  ['merlot', '메를로', '메를롯'],
  // 그르나슈
  ['grenache', 'garnacha', '그르나슈', '가르나차'],
  // 로마네 콩티
  ['romanee-conti', 'romanée-conti', '로마네 콩티', '로마네콩티', 'drc'],
  // 부르고뉴
  ['bourgogne', 'burgundy', '부르고뉴', '버건디'],
  // 보르도
  ['bordeaux', '보르도'],
  // 캐이머스
  ['caymus', '케이머스', '카이머스'],
  // 모에/모엣 샹동
  ['moet chandon', 'moët & chandon', 'moet & chandon', '모에 샹동', '모에샹동', '모엣 샹동', '모엣샹동', '모엣'],
  // 뵈브 클리코
  ['veuve clicquot', 'veuve clicquot ponsardin', '뵈브 클리코', '뵈브클리코', '뵈브'],
  // 돔 페리뇽
  ['dom perignon', 'dom pérignon', '돔 페리뇽', '돔페리뇽', '돔'],

  // ── 위스키·증류주 한글 별칭 (종류 키워드는 이름에 영문 종류명이 있으면 매칭) ──
  ['whisky', 'whiskey', '위스키', '위스끼'],
  ['tequila', '데킬라', '테킬라', '떼낄라'],
  ['mezcal', '메즈칼', '메스칼', '메즈깔'],
  ['cognac', '꼬냑', '코냑'],
  ['sake', 'nihonshu', '사케', '니혼슈'],
  ['baijiu', 'kaoliang', '백주', '고량주', '바이주'],
  // 브랜드
  ['ballantine', "ballantine's", '발렌타인', '발렌타인스'],
  ['glenfiddich', '글렌피딕'],
  ['glenmorangie', '글렌모렌지'],
  ['signet', '시그넷'],
  ['balvenie', '발베니'],
  ['dalmore', '달모어'],
  ['kavalan', '카발란'],
  ['ardbeg', '아드벡', '아드백'],
  ['corryvreckan', '코리브레칸', '코리브라칸'],
  ['hibiki', '히비키'],
  ['hakushu', '하쿠슈'],
  ['yamazaki', '야마자키', '야마자끼'],
  ['royal salute', '로얄살루트', '로얄 살루트'],
  ['johnnie walker', '조니워커', '조니 워커'],
  ['blue label', '블루라벨', '블루 라벨'],
  ['hennessy', '헤네시'],
  ['camus', '까뮈', '카뮈'],
  ['clase azul', '클라세 아술', '클라세아술', '클라세 아줄'],
  ['1800 cristalino', '1800 tequila', '1800 크리스탈리노'],
  ['kinmen', 'kaoliang', '금문고량주', '금문 고량주'],
  ['gowoon dar', '고운 달', '고운달'],
  ['yamada nishiki', '야마다 니시키', '야마다니시키'],
]

// text 하나가 query와 매치되는지: 직접 포함 매칭 + 동의어 그룹 매칭
export function textMatchesQuery(text, query) {
  if (!query?.trim()) return false
  const q = normalizeWineText(query)
  const nf = normalizeWineText(text)
  if (nf.includes(q)) return true
  const qGroup = WINE_SYNONYMS.find(group => group.some(s => {
    const ns = normalizeWineText(s)
    return ns === q || q.includes(ns) || ns.includes(q)
  }))
  return qGroup ? qGroup.some(s => nf.includes(normalizeWineText(s))) : false
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

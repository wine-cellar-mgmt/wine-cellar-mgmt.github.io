import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL = 'https://nmjawxbbwlerugfyypft.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5tamF3eGJid2xlcnVnZnl5cGZ0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjgwNDQsImV4cCI6MjA5NTU0NDA0NH0.TIIjA4J2a2Fuf0HyEXeYobWHPpzYerItNoO7OtR-MaU'
export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// ── Auth (로그인/세션) ───────────────────────────────────────────
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function signOut() {
  await supabase.auth.signOut()
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(cb) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

// ── Anthropic 프록시 호출 (Edge Function) ────────────────────────
// API 키는 서버(Edge Function)에만 존재. 로그인된 사용자만 호출 가능.
// 웹 검색 사용 시 pause_turn이 오면 대화를 이어서 자동 재호출 (최대 4회)
const PROXY_URL = `${SUPABASE_URL}/functions/v1/anthropic-proxy`

export async function callProxy(messages, maxTokens = 2000, tools = null) {
  const session = await getSession()
  if (!session) throw new Error('로그인이 필요합니다')
  let msgs = messages
  for (let attempt = 0; attempt < 4; attempt++) {
    const body = { model: 'claude-sonnet-4-6', max_tokens: maxTokens, messages: msgs }
    if (tools) body.tools = tools
    const res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(body),
    })
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(err.error?.message || `HTTP ${res.status}`)
    }
    const data = await res.json()
    if (data.stop_reason === 'pause_turn') {
      msgs = [...msgs, { role: 'assistant', content: data.content }]
      continue
    }
    return data
  }
  throw new Error('웹 검색이 완료되지 않음 (pause_turn 반복)')
}

// ── 공개 갤러리 (읽기 전용 — 로그인 불필요) ───────────────────────
// get_public_wines RPC: 구매가 제외, 시장가/셀러/칸 등 열람용 컬럼만 반환
export async function loadPublicWines() {
  const { data, error } = await supabase.rpc('get_public_wines')
  if (error) throw error
  return (data || []).map(dbToWine)
}

// ── 공유 와인 조회 (RPC — 토큰 아는 사람만 1개 조회) ──────────────
export async function loadSharedWine(token) {
  const { data, error } = await supabase.rpc('get_shared_wine', { p_token: token })
  if (error) return null
  if (!data || (Array.isArray(data) && data.length === 0)) return null
  return dbToWine(Array.isArray(data) ? data[0] : data)
}

// ── profiles (계정별 설정 — 셀러 구성, 위스키 표시) ──────────────
// user_id는 DB 기본값 auth.uid()가 채우므로 wineToDb 등 매퍼는 손대지 않는다.
export async function loadProfile() {
  const { data, error } = await supabase.from('profiles').select('*').maybeSingle()
  if (error) throw error
  return data
}

// 최초 로그인 계정 — 기본 프로필 생성.
// 셀러는 중립적인 1칸짜리로 시작한다(다른 사람의 셀러 이름이 보이지 않도록).
// 이름·칸 수는 설정 > 내 셀러 관리에서 바꾼다. 위스키 기능은 기본 꺼짐.
export const STARTER_CELLARS = [{ id: 'cellar_1', name: '내 셀러', slots: 6, maxPerSlot: 20 }]

export async function createDefaultProfile() {
  const { data, error } = await supabase
    .from('profiles')
    .insert({ show_whisky: false, cellars: STARTER_CELLARS })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function saveProfile(updates) {
  const { data, error } = await supabase.from('profiles').update(updates).select().single()
  if (error) throw error
  return data
}

// ── wines ────────────────────────────────────────────────────────
export async function loadWines() {
  const { data, error } = await supabase.from('wines').select('*').order('created_at', { ascending: true })
  if (error) throw error
  return data.map(dbToWine)
}

export async function loadDrinkLog() {
  const { data, error } = await supabase.from('drink_log').select('*').order('created_at', { ascending: false })
  if (error) throw error
  return data.map(dbToDrink)
}

export async function loadPurchaseHistory(wineId) {
  const { data, error } = await supabase.from('purchase_history').select('*').eq('wine_id', wineId).order('purchase_date', { ascending: false })
  if (error) throw error
  return data
}

export async function upsertWine(wine) {
  const { error } = await supabase.from('wines').upsert(wineToDb(wine))
  if (error) throw error
}

export async function deleteWine(id) {
  const { error } = await supabase.from('wines').delete().eq('id', id)
  if (error) throw error
}

// ── 배치 작업 (N번 왕복 → 1번) ───────────────────────────────────
export async function deleteWines(ids) {
  if (!ids?.length) return
  const { error } = await supabase.from('wines').delete().in('id', ids)
  if (error) throw error
}

export async function upsertWines(wines) {
  if (!wines?.length) return
  const { error } = await supabase.from('wines').upsert(wines.map(wineToDb))
  if (error) throw error
}

// ── 가격 히스토리 ────────────────────────────────────────────────
// price_history: 시장가·Vivino 가격 변동 이력. 매달 자동 갱신 + 앱 내 가격 변경 시 기록.
export async function loadPriceHistory(wineId) {
  const { data, error } = await supabase.from('price_history')
    .select('recorded_at, wine_searcher_price, vivino_price, vivino_rating, source')
    .eq('wine_id', wineId)
    .order('recorded_at', { ascending: true })
  if (error) throw error
  return data || []
}

export async function insertPriceHistory(rows) {
  if (!rows?.length) return
  const { error } = await supabase.from('price_history').insert(rows)
  if (error) throw error
}

// ── 이미지 Storage 업로드 ────────────────────────────────────────
// base64 dataURL을 wine-images 버킷에 올리고 공개 URL을 반환.
// DB에 base64를 직접 저장하면 loadWines가 비대해지므로 반드시 URL만 저장한다.
export async function uploadImage(dataUrl, keyPrefix = 'wine') {
  const blob = await (await fetch(dataUrl)).blob()
  const path = `${keyPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error } = await supabase.storage.from('wine-images')
    .upload(path, blob, { contentType: 'image/jpeg', upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('wine-images').getPublicUrl(path)
  return data.publicUrl
}

export async function insertDrink(record) {
  const { error } = await supabase.from('drink_log').insert(drinkToDb(record))
  if (error) throw error
}

export async function deleteDrink(id) {
  const { error } = await supabase.from('drink_log').delete().eq('id', id)
  if (error) throw error
}

// ── 음주 세션 (여러 병을 한 자리에서 마셨을 때 날짜/함께한 사람/자리를 묶음) ──
export async function insertDrinkSession(session) {
  const { error } = await supabase.from('drink_sessions').insert(sessionToDb(session))
  if (error) throw error
}

export async function insertDrinksBatch(records) {
  if (!records?.length) return
  const { error } = await supabase.from('drink_log').insert(records.map(drinkToDb))
  if (error) throw error
}

export async function addPurchaseHistory(record) {
  const { error } = await supabase.from('purchase_history').insert(record)
  if (error) throw error
}

export async function loadWineByShareToken(token) {
  const { data, error } = await supabase.from('wines').select('*').eq('share_token', token).single()
  if (error) return null
  return dbToWine(data)
}

// ── camelCase ↔ snake_case ───────────────────────────────────────
function wineToDb(w) {
  return {
    id: w.id, name: w.name, vintage: w.vintage || null,
    qty: w.qty || 1, price: w.price || 0,
    purchase_date: w.purchaseDate || null,
    cellar_id: w.cellarId, slot: w.slot,
    image_url: w.imageUrl || '', notes: w.notes || '',
    producer: w.producer || '', region: w.region || '',
    country: w.country || '', grape: w.grape || '',
    description: w.description || '',
    vivino_price: w.vivinoPrice || null,
    vivino_rating: w.vivinoRating || null,
    wine_searcher_price: w.wineSearcherPrice || null,
    drinking_from: w.drinkingFrom || null,
    drinking_to: w.drinkingTo || null,
    wine_type: w.wineType || 'red',
    bottle_size: w.bottleSize || 750,
    share_token: w.shareToken || null,
    category: w.category || 'wine',
    abv: w.abv || null,
    age_years: w.ageYears || null,
    opened_date: w.openedDate || null,
    remaining_pct: w.remainingPct ?? null,
  }
}

function dbToWine(r) {
  return {
    id: r.id, name: r.name, vintage: r.vintage, qty: r.qty, price: r.price,
    purchaseDate: r.purchase_date, cellarId: r.cellar_id, slot: r.slot,
    imageUrl: r.image_url, notes: r.notes, producer: r.producer,
    region: r.region, country: r.country, grape: r.grape,
    description: r.description, vivinoPrice: r.vivino_price,
    vivinoRating: r.vivino_rating, wineSearcherPrice: r.wine_searcher_price,
    drinkingFrom: r.drinking_from, drinkingTo: r.drinking_to,
    wineType: r.wine_type, shareToken: r.share_token,
    bottleSize: r.bottle_size || 750,
    category: r.category || 'wine',
    abv: r.abv, ageYears: r.age_years,
    openedDate: r.opened_date, remainingPct: r.remaining_pct,
  }
}

function drinkToDb(r) {
  return {
    id: r.id, wine_id: r.wineId || null, wine_name: r.wineName,
    wine_vintage: r.wineVintage || null, cellar_name: r.cellarName || '',
    slot: r.slot || '', date: r.date, companions: r.companions || '',
    occasion: r.occasion || '', rating: r.rating || 0,
    review: r.review || '', image_url: r.imageUrl || '',
    remaining_after: r.remainingAfter ?? null,
    session_id: r.sessionId || null,
    wine_searcher_price: r.wineSearcherPrice ?? null,
    vivino_price: r.vivinoPrice ?? null,
  }
}

function dbToDrink(r) {
  return {
    id: r.id, wineId: r.wine_id, wineName: r.wine_name,
    wineVintage: r.wine_vintage, cellarName: r.cellar_name,
    slot: r.slot, date: r.date, companions: r.companions,
    occasion: r.occasion, rating: r.rating, review: r.review,
    imageUrl: r.image_url, createdAt: r.created_at,
    remainingAfter: r.remaining_after,
    sessionId: r.session_id,
    wineSearcherPrice: r.wine_searcher_price,
    vivinoPrice: r.vivino_price,
  }
}

function sessionToDb(s) {
  return { id: s.id, date: s.date, companions: s.companions || '', occasion: s.occasion || '' }
}

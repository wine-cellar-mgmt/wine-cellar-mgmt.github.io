// CAVE 서비스워커 — 오프라인/재방문 속도 개선
// 전략: 네트워크 우선 + 캐시 폴백 (배포 즉시 새 버전이 보이도록 stale 캐시를 쓰지 않는다)
// 주의: Supabase API 요청은 캐시하지 않는다 (항상 최신 데이터).
const CACHE = 'cave-v1'

self.addEventListener('install', (e) => {
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url)
  // GET + 정적 자원(같은 출처 또는 폰트 CDN)만 처리. API 호출은 그대로 통과.
  if (e.request.method !== 'GET') return
  const isStatic = url.origin === self.location.origin
    || url.hostname === 'fonts.googleapis.com'
    || url.hostname === 'fonts.gstatic.com'
  if (!isStatic) return

  e.respondWith(
    fetch(e.request)
      .then(res => {
        // 성공 응답은 캐시에 복사 (다음 오프라인 방문 대비)
        if (res.ok) {
          const copy = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, copy))
        }
        return res
      })
      .catch(() => caches.match(e.request)) // 오프라인 → 캐시 폴백
  )
})

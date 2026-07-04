# CAVE — 와인 셀러 관리 앱 레퍼런스

CAVE는 개인 와인 셀러 관리 PWA다. 이 문서는 작업 시 배경 맥락으로 참고한다.

## 기본 정보
- 앱 이름: CAVE
- 로컬 경로: `C:\Claude\wine-cellar-mgmt`
- GitHub: https://github.com/youjinwoong/wine-cellar-mgmt
- 배포 URL: https://youjinwoong.github.io/wine-cellar-mgmt/
- 공개 갤러리: https://youjinwoong.github.io/wine-cellar-mgmt/?gallery=1
- Supabase Project ID: `nmjawxbbwlerugfyypft`
- Supabase URL: https://nmjawxbbwlerugfyypft.supabase.co
- 로그인 계정: you.jinwoong@gmail.com

## 기술 스택
- React + Vite
- Supabase (PostgreSQL + Auth + Edge Functions)
- GitHub Pages / GitHub Actions (CI/CD)
- Anthropic API (anthropic-proxy Edge Function 경유)

## 셀러 구성
- VINDIS #1 (`vindis1`): 10칸, 칸당 최대 20병
- VINDIS #2 (`vindis2`): 10칸, 칸당 최대 20병
- EUROCAVE (`eurocave`): 15칸, 칸당 최대 12병
- 서재 진열장 (`shelf_study`): 2칸, 칸당 최대 25병 (위스키)
- 거실 진열장 (`shelf_living`): 6칸, 칸당 최대 20병 (위스키)

## DB 테이블
- **wines**: id, name, vintage, qty, price, purchase_date, cellar_id, slot, image_url, notes,
  producer, region, country, grape, description, vivino_price(USD), wine_searcher_price(KRW),
  vivino_rating, drinking_from, drinking_to, wine_type, share_token, bottle_size(정수, ml, 기본 750),
  category('wine'|'whisky', 기본 'wine'), abv(도수), age_years(숙성연수), opened_date(개봉일),
  remaining_pct(잔량 %)
- **drink_log**: id, wine_id, wine_name, wine_vintage, cellar_name, slot, date, companions,
  occasion, rating, review, image_url, remaining_after(위스키 세션 후 잔량 %)
- **purchase_history**: id, wine_id, purchase_date, price, qty, notes
- **price_history**: id, wine_id(→wines cascade), recorded_at(date), wine_searcher_price,
  vivino_price, vivino_rating, source('seed'|'app'|'auto'), created_at.
  앱에서 가격 변경 시('app') + 매달 6일 Cowork 스케줄('auto') 기록. 2026-07-03 현재가 시드 150건.

## 파일 구조
```
public/sw.js               ← 서비스워커 (네트워크 우선 + 캐시 폴백, API는 캐시 안 함)
src/
├── App.jsx                ← 라우팅, 세션, CRUD(낙관적 업데이트+실패 롤백, winesRef 단일 소스),
│                            moveWine(분할/병합), renameWines/mergeWines(배치), 이미지 Storage 업로드
│                            인터셉트(resolveImage), 가격 변경 시 price_history 기록,
│                            SharedGallery·BulkImportModal은 React.lazy 코드 스플리팅
├── index.css
├── main.jsx               ← 서비스워커 등록 포함
├── config/cellars.js      ← 테마 T, 헬퍼, BOTTLE_SIZES/bottleLabel/bottleBadge,
│                            getDrinkingStatus, compressImage(EXIF 보정), callAI
├── lib/supabase.js        ← Auth, callProxy, CRUD, 배치(deleteWines/upsertWines),
│                            price_history(load/insert), uploadImage(Storage), wineToDb/dbToWine
└── components/
    ├── Header.jsx
    ├── Dashboard.jsx
    ├── CellarView.jsx
    ├── Views.jsx          ← 배럴 (views/로 분리 재수출)
    ├── views/
    │   ├── SearchView.jsx        ← 동의어 검색 (useMemo)
    │   ├── ListView.jsx          ← 이름묶기/통일/병합, 시장가 일괄 업데이트(callAI 경유)
    │   ├── DrinkLogView.jsx
    │   ├── StatisticsView.jsx    ← 수익률%·컬렉션 가치 평가 (집계 useMemo)
    │   └── DrinkingWindowView.jsx← 음용 적기 + 🔮 추정
    ├── SharedGallery.jsx  ← 공개 읽기 전용 갤러리 (?gallery=1, lazy)
    ├── ui.jsx
    └── modals/
        ├── AddWineModal.jsx
        ├── Modals.jsx            ← 배럴 (개별 파일 재수출)
        ├── DetailModal.jsx       ← 이동/용량/배지 + 📈 가격 추이 그래프(price_history)
        ├── DrinkModal.jsx
        ├── SettingsModal.jsx     ← 로그아웃 + 📥 CSV 내보내기(와인 목록/음주 기록)
        └── BulkImportModal.jsx   ← 사진 일괄 입력 (lazy)
```

## 핵심 규칙 요약
- **AI 호출**: 전부 callProxy 경유, 모델 claude-sonnet-4-6, max_tokens 2000+(이미지 3000),
  web_search 도구 + pause_turn 재호출(최대 4회), JSON은 마지막 완성 객체 파싱.
- **가격 표시**: wine_searcher_price = 한국 시장가(₩), vivino_price = 글로벌($).
  두 통화를 섞어 평균 내지 않는다. 시장가는 750ml 1병 기준.
- **병 용량**: bottle_size ml 정수, 기본 750. bottleBadge는 750/미설정이면 null,
  매그넘(1500) 등만 배지 표시.
- **통계 수익률 / 대시보드 평가 차익**: (시장가합계 − 구매가합계) ÷ 구매가합계 × 100(또는 차액).
  반드시 구매가·시장가가 모두 있는 와인만 비교(한쪽만 있으면 제외). 양수 초록(#4a8a5e), 음수 빨강(#c0392b).
  대시보드 상단 '구매가/시장가 합계' 카드는 입력된 와인만 합산하며 라벨에 입력 종수를 표기한다.
- **인증/RLS**: 세 테이블 authenticated 전용. anon은 테이블 직접 접근 불가. 공개 갤러리는
  get_public_wines() RPC로만 조회.
- **EXIF 회전**: createImageBitmap(file, { imageOrientation: 'from-image' })로 한 번만 보정.
  수동 transform 추가 금지(이중 회전).

## 주요 기능 이력 (구현 완료)
- 위치 이동(분할 + 자동 병합), 마심 기록(버그 수정), 음주 기록 삭제(2단계 확인)
- 통계 수익률(%), 병 용량(bottle_size) + 배지
- 사진 일괄 입력: 가격 검색 수동 트리거, 라벨 영역별 크롭 썸네일, 검토 화면 사진 교체, EXIF 보정
- 비슷한 이름 묶기/이름 통일(nameFingerprint, 방안 B — Brut/Rosé 등 구분 단어는 남김)
- 공개 갤러리(?gallery=1, ?gallery=1&price=0)
- 음용 적기(커밋 b8a750a): 전용 "음용 적기" 탭(⏰, Header) + DrinkingWindowView.
  status 순서 빨리 마셔야→지금 절정→마시기 좋음→곧 절정→숙성 중, 동일 와인 "이름+N병" 묶음.
  getDrinkingStatus: decline 라벨 '빨리 마셔야'로 통일, 빈티지·drinkingFrom/to 모두 없으면
  구매일 폴백(구매 2년 미만 '마시기 좋음', 2년 이상·구매일 없음 '빨리 마셔야').
  🔮 음용시기 추정 버튼(callAI/callProxy 경유 → drinkingFrom/to 저장).
  대시보드에 '빨리 마셔야'·'지금 절정' 요약 카드(클릭 시 음용 적기 탭 이동).
- 병 용량 배지를 셀러 뷰·대시보드에도 적용 + 단일 등록(AddWineModal)에 병 용량 선택(커밋 712d9f8).
- 이름 묶기 "수준 3"(커밋 e2efd0f): 비슷한 이름 묶기 안에서 이름·빈티지·셀러·칸이 모두 같은
  진짜 중복 레코드를 한 줄로 묶어 🔗 병합(병 수 합산). App.jsx mergeWines + ListView onMerge.
- 컬렉션 가치 평가(커밋 a2e7251): 통계 탭(StatisticsView) 하단 "💰 컬렉션 가치 평가" 섹션.
  셀러별 가치(구매가·시장가·수익률), 보유 가치 TOP 5(시장가 병당×수량), 평가차익 상위/하위(%),
  타입·국가별 시장가 분포. DB 변경 없이 기존 필드 집계. totalMarket>0일 때만 노출.
- 대시보드 가치 카드 정정(커밋 539df37): 평가 차익을 구매가·시장가가 모두 있는 와인만으로 계산
  (한쪽만 있으면 제외, 음수 빨강 표시). 상단 합계 카드 라벨에 '구매가/시장가 입력 N종' 표기.
- 대규모 리팩터링 + 신기능 3종(2026-07-03):
  * 구조: Views/Modals 파일 분리(배럴 유지), CRUD 낙관적 업데이트 실패 롤백, winesRef 단일
    소스로 stale closure 제거, 배치 DB(deleteWines .in / upsertWines 배열), priceUpdate 리스너 1회 등록.
  * 성능: 무거운 집계 useMemo, SharedGallery·BulkImportModal lazy 스플리팅, 서비스워커(sw.js),
    이미지 base64 → Storage(wine-images 버킷) 자동 업로드(resolveImage, 실패 시 원본 유지).
  * ListView 시장가 일괄 업데이트를 직접 API 호출(localStorage 키) → callAI(프록시) 경유로 교정.
  * 신기능: price_history 테이블 + DetailModal 📈 시장가 추이 SVG 그래프(기록 2건 이상 시 표시),
    SettingsModal 📥 CSV 내보내기(UTF-8 BOM 엑셀 호환), Cowork 스케줄
    `cave-monthly-price-refresh`(매달 6일 09:00, 전체 152종 웹 검색 → wines 갱신 + price_history 'auto' 기록).
    ※ 스케줄은 Cowork 앱이 켜져 있어야 실행됨(꺼져 있으면 다음 실행 시점에 수행).

- 위스키 관리(2026-07-04):
  * wines.category('wine'|'whisky') + abv/age_years/opened_date/remaining_pct,
    drink_log.remaining_after 마이그레이션(add_whisky_fields).
  * 셀러 2개 추가: 서재 진열장(2칸×25), 거실 진열장(6칸×20). BOTTLE_SIZES에 700ml/1L 추가
    (700·750은 배지 없음).
  * AddWineModal 카테고리 토글(🍷/🥃) — 위스키는 빈티지 대신 숙성연수·도수, 
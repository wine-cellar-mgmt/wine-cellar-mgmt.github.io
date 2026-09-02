# CAVE — 와인 셀러 관리 앱 레퍼런스

CAVE는 개인 와인 셀러 관리 PWA다. 이 문서는 작업 시 배경 맥락으로 참고한다.

## 기본 정보
- 앱 이름: CAVE
- 로컬 경로: `C:\Claude\wine-cellar-mgmt`
- GitHub: https://github.com/wine-cellar-mgmt/wine-cellar-mgmt.github.io
- 배포 URL: https://wine-cellar-mgmt.github.io/
- 공개 갤러리: https://wine-cellar-mgmt.github.io/?gallery=1
- Supabase Project ID: `nmjawxbbwlerugfyypft`
- Supabase URL: https://nmjawxbbwlerugfyypft.supabase.co
- 로그인 계정: you.jinwoong@gmail.com (uuid `d84997d5-542a-49e3-af49-c0eaf5cf7340`)
- **멀티 계정 앱이다.** 계정마다 자기 와인만 보이고, 셀러 구성·위스키 표시도 계정별로 다르다.
  계정 추가는 Supabase 대시보드 Authentication > Users > Add user (앱에 회원가입 화면 없음 — 초대제).

## 기술 스택
- React + Vite
- Supabase (PostgreSQL + Auth + Edge Functions)
- GitHub Pages / GitHub Actions (CI/CD)
- Anthropic API (anthropic-proxy Edge Function 경유)

## 셀러 구성 (내 계정 — profiles.cellars에 저장됨)
계정마다 다르다. 코드의 DEFAULT_CELLARS는 폴백일 뿐이고, 실제 구성은 로그인 시 프로필에서 주입된다.
설정 > 🍾 내 셀러 관리에서 편집한다.
- VINDIS #1 (`vindis1`): 10칸, 칸당 최대 20병
- VINDIS #2 (`vindis2`): 10칸, 칸당 최대 20병
- EUROCAVE (`eurocave`): 15칸, 칸당 최대 12병
- 서재 진열장 (`shelf_study`): 2칸, 칸당 최대 25병 (위스키)
- 거실 진열장 (`shelf_living`): 6칸, 칸당 최대 20병 (위스키)

## DB 테이블
※ 아래 5개 테이블 전부 **`user_id`(uuid, not null, 기본값 `auth.uid()`)** 를 가진다.
  프론트에서 user_id를 보내지 않아도 DB 기본값이 채우므로 supabase.js의 매퍼는 user_id를 다루지 않는다.

- **wines**: id, name, vintage, qty, price, purchase_date, cellar_id, slot, image_url, notes,
  producer, region, country, grape, description, vivino_price(USD), wine_searcher_price(KRW),
  vivino_rating, drinking_from, drinking_to, wine_type, share_token, bottle_size(정수, ml, 기본 750),
  category('wine'|'whisky', 기본 'wine'), abv(도수), age_years(숙성연수), opened_date(개봉일),
  remaining_pct(잔량 %)
- **drink_log**: id, wine_id, wine_name, wine_vintage, cellar_name, slot, date, companions,
  occasion, rating, review, image_url, remaining_after(위스키 세션 후 잔량 %),
  session_id(→drink_sessions), wine_searcher_price/vivino_price(마신 시점 값어치 스냅샷)
- **drink_sessions**: id, date, companions, occasion.
  여러 병을 한 자리에서 마셨을 때 날짜·함께한 사람·자리를 묶는다(일괄 마심 / 외부 기록 2건 이상).
- **purchase_history**: id, wine_id, purchase_date, price, qty, notes
- **price_history**: id, wine_id(→wines cascade), recorded_at(date), wine_searcher_price,
  vivino_price, vivino_rating, source('seed'|'app'|'auto'), created_at.
  앱에서 가격 변경 시('app') + 매달 6일 Cowork 스케줄('auto') 기록. 2026-07-03 현재가 시드 150건.
- **profiles**: id(uuid, →auth.users, 기본값 auth.uid()), show_whisky(bool, 새 계정은 false),
  allow_bulk_price(bool, 새 계정은 false), cellars(jsonb — `[{id,name,slots,maxPerSlot}]`), created_at.
  계정별 셀러 구성·위스키 UI 표시·시장가 일괄 업데이트 허용 여부.
  앱이 최초 로그인 시 없으면 자동 생성한다.

## 파일 구조
```
public/sw.js               ← 서비스워커 (네트워크 우선 + 캐시 폴백, API는 캐시 안 함)
src/
├── App.jsx                ← 라우팅, 세션, 프로필 로드 → setCellars 주입 → 데이터 로드 순서,
│                            CRUD(낙관적 업데이트+실패 롤백, winesRef 단일 소스),
│                            moveWine(분할/병합), renameWines/mergeWines(배치), 이미지 Storage 업로드
│                            인터셉트(resolveImage), 가격 변경 시 price_history 기록,
│                            SharedGallery·BulkImportModal은 React.lazy 코드 스플리팅
├── index.css
├── main.jsx               ← 서비스워커 등록 포함
├── config/cellars.js      ← 테마 T, 헬퍼, BOTTLE_SIZES/bottleLabel/bottleBadge,
│                            getDrinkingStatus, compressImage(EXIF 보정), callAI,
│                            DEFAULT_CELLARS + `export let CELLARS` + setCellars(런타임 주입)
├── lib/supabase.js        ← Auth, callProxy, CRUD, 배치(deleteWines/upsertWines),
│                            price_history(load/insert), uploadImage(Storage), wineToDb/dbToWine,
│                            profiles(loadProfile/createDefaultProfile/saveProfile/STARTER_CELLARS)
└── components/
    ├── Header.jsx
    ├── Dashboard.jsx
    ├── CellarView.jsx
    ├── Views.jsx          ← 배럴 (views/로 분리 재수출)
    ├── views/
    │   ├── SearchView.jsx        ← 동의어 검색 (useMemo)
    │   ├── ListView.jsx          ← 이름묶기/통일/병합, 시장가 일괄 업데이트(callAI 경유)
    │   ├── DrinkLogView.jsx      ← 값어치 표시(총합계·회차별), 밖에서 마신 기록 진입
    │   ├── ProducerView.jsx      ← 국가 > 지역 > 생산자 3단 아코디언 + 이름으로 정보 채우기
    │   ├── StatisticsView.jsx    ← 수익률%·컬렉션 가치 평가 (집계 useMemo)
    │   └── DrinkingWindowView.jsx← 음용 적기 + 🔮 추정
    ├── SharedGallery.jsx  ← 공개 읽기 전용 갤러리 (?gallery=1, lazy)
    ├── ui.jsx
    └── modals/
        ├── AddWineModal.jsx
        ├── Modals.jsx            ← 배럴 (개별 파일 재수출)
        ├── DetailModal.jsx       ← 이동/용량/배지 + 📈 가격 추이 그래프(price_history)
        ├── DrinkModal.jsx
        ├── BatchDrinkModal.jsx   ← 일괄 마심(한 자리에서 여러 병 → drink_sessions로 묶음)
        ├── ExternalDrinkModal.jsx← 밖에서 마신 기록 (재고와 무관, drink_log만, lazy)
        ├── SettingsModal.jsx     ← 로그아웃 + 📥 CSV 내보내기 + 🍾 내 셀러 관리 + 🥃 위스키 토글
        │                            + 🔑 비밀번호 변경(supabase.auth.updateUser, 메일 발송 없음)
        └── BulkImportModal.jsx   ← 사진 일괄 입력 (lazy)
```

## 핵심 규칙 요약
- **AI 호출**: 전부 callProxy 경유, 모델 claude-sonnet-4-6, max_tokens 2000+(이미지 3000),
  web_search 도구 + pause_turn 재호출(최대 4회), JSON은 마지막 완성 객체 파싱.
  ※ 모든 계정이 소유자의 ANTHROPIC_API_KEY로 과금된다. ListView의 시장가 일괄 업데이트는
  와인 수만큼 web_search를 호출하는 최고 비용 기능이라 `profiles.allow_bulk_price`로 막혀 있다.
  비용이 큰 반복 호출 기능을 새로 만들면 같은 방식으로 계정별 플래그를 건다.
- **가격 표시**: wine_searcher_price = 한국 시장가(₩), vivino_price = 글로벌($).
  두 통화를 섞어 평균 내지 않는다. 시장가는 750ml 1병 기준.
- **병 용량**: bottle_size ml 정수, 기본 750. bottleBadge는 750/미설정이면 null,
  매그넘(1500) 등만 배지 표시.
- **통계 수익률 / 대시보드 평가 차익**: (시장가합계 − 구매가합계) ÷ 구매가합계 × 100(또는 차액).
  반드시 구매가·시장가가 모두 있는 와인만 비교(한쪽만 있으면 제외). 양수 초록(#4a8a5e), 음수 빨강(#c0392b).
  대시보드 상단 '구매가/시장가 합계' 카드는 입력된 와인만 합산하며 라벨에 입력 종수를 표기한다.
- **인증/RLS**: 5개 테이블 모두 정책 `own rows only` = `user_id = auth.uid()`
  (using + with check). 로그인해도 **남의 행은 조회·수정·삭제 전부 불가**.
  anon은 테이블 직접 접근 불가. 공개 갤러리는 get_public_wines() RPC로만 조회.
  ※ 새 테이블을 만들면 반드시 user_id(기본값 auth.uid()) + 같은 정책을 함께 건다.
- **셀러 구성은 하드코딩하지 않는다**: `'vindis1'` 같은 리터럴 대신 `CELLARS[0]?.id`를 쓴다.
  내 셀러 이름은 다른 계정에 존재하지 않는다.
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
  * AddWineModal 카테고리 토글(🍷/🥃) — 위스키는 빈티지 대신 숙성연수·도수, AI 검색 프롬프트도
    위스키용(whiskybase/TWE, 700ml 기준) 분기. 카테고리 전환 시 기본 보관처·용량 자동 전환.
  * 마심 기록 분기: 위스키는 "시음 세션" — 병 차감 없이 잔량 슬라이더(remaining_pct) 갱신 +
    drink_log에 remaining_after 기록, 첫 기록 시 opened_date 자동 세팅. 한 병에 여러 세션 누적.
    '빈 병' 체크 시에만 qty−1(남은 병 있으면 개봉 상태 초기화). App.jsx drinkWine 분기.
  * DetailModal: 숙성연수·도수 표시, 개봉 배지(openedBadge), 개봉 상태·시음 횟수 타일,
    시음 세션 히스토리 목록(drinkLog prop). 수정 폼도 위스키 필드 분기.
  * getDrinkingStatus는 위스키에 null 반환(음용 적기 제외), DrinkingWindowView도 위스키 필터.
  * cave-monthly-price-refresh 스케줄 프롬프트에 위스키 규칙(700ml, whiskybase/TWE) 반영.
  * 사진 일괄 입력(BulkImportModal)도 위스키 지원: 1단계 카테고리 토글(선택 시 셀러 목록 필터
    — 위스키는 진열장만), 위스키 비전 프롬프트(이름·숙성연수·도수 인식), 가격 검색 위스키 분기,
    검토 화면 빈티지→숙성연수 입력, 기본 용량 700ml.

## Supabase 서버 측 구성 (코드 저장소 밖)
- Edge Function: `anthropic-proxy` (verify_jwt=true)
- Secret: `ANTHROPIC_API_KEY`
- Storage 버킷: `wine-images` (public read, authenticated write). 이미지 URL만 DB에 저장.
- RPC: `get_public_wines()`(공개 갤러리, bottle_size 포함) — **소유자(위 uuid)의 와인만 반환**.
  기존 `?gallery=1` 링크 유지를 위해 인자 없는 시그니처 그대로 두고 본문에서 필터한다.
  친구용 갤러리가 필요해지면 그때 인자를 추가한다. `get_shared_wine(p_token)`은 토큰 기반이라 그대로.
- RLS: 5개 테이블 "own rows only" (user_id = auth.uid()), profiles "own profile only"
- Storage 버킷 `wine-images`는 아직 계정 격리가 없다(authenticated 전체 쓰기/삭제, public read).
  이미지 URL을 알아야 접근 가능하므로 실질 위험은 낮지만, 필요해지면 경로 기반 정책을 건다.
- ⚠ Cowork 스케줄 `cave-monthly-price-refresh`가 service_role 키를 쓴다면 RLS를 우회해
  다른 계정 와인까지 갱신한다. 내 로그인 세션 기반이면 자동으로 내 것만 갱신된다. (확인 필요)
- 마이그레이션: RETURNS TABLE 변경 시 drop function 후 create function,
  이어서 revoke all from public + grant execute to anon, authenticated
  (security definer + set search_path = public)

- 최근 기능(2026-07~09, 커밋 순):
  * 밖에서 마신 와인 기록(3e01a0f) — ExternalDrinkModal, 재고와 무관하게 drink_log만 기록.
    2건 이상이면 drink_sessions로 묶음. 사진 인식 지원.
  * 일괄 마심 — BatchDrinkModal, 한 자리에서 여러 병(공통 날짜·사람·자리 + 병별 평점/한마디).
  * 음용 적기에 가격대 반영(dee58e1) — 데일리 와인은 더 일찍 '빨리 마셔야'.
  * 통계·음주기록에서 음주 횟수(회)와 마신 병 수(병) 분리 표시(ebfe4b9).
  * 상세 모달 이미지 contain + 클릭 확대 라이트박스(14673c8).
  * 생산자 뷰(81006a0) — 국가>지역>생산자 3단 아코디언, 이름으로 정보 채우기.
  * 음주 기록 값어치 표시(17e458a) — drink_log에 마신 시점 가격 스냅샷 저장.
  * 전체목록 종류 필터(b67d281), 검색 한글 별칭·전각 정규화·숙성연수·병 사이즈 매칭
    (48699f0, 9154a06, 189a48c), 위스키 개봉 잔량 배지(89faa7d).
  * 일괄 입력을 주류 전반(진·럼·포트 등)으로 확장 + 병 용량 자동 인식(e39fafa).
  * AI 검색에 병 용량 인식 + 수정 화면 라벨 이미지 다시 찾기(af56b05).
  * 셀러 뷰 시장가 표시(66ce78e) — 병별 + 칸별·셀러별 합계.
  * 위스키 region 규칙 통일(378d1dc) — 블렌디드는 Blended Scotch/Japanese, 산지는 영문 실산지.

- **멀티 계정화(2026-09-02, 커밋 3b43f95·e333d49)** — 친구에게 앱을 공유하기 위한 작업:
  * 마이그레이션 `add_multi_user_ownership`: 5개 테이블에 user_id 추가(기존 1,107행은 내 계정에
    귀속), RLS를 `authenticated full access` → `own rows only`로 교체, profiles 테이블 신설,
    get_public_wines()에 소유자 필터 추가.
  * cellars.js: `export let CELLARS` + setCellars()로 런타임 주입. CELLARS를 import하는 나머지
    8개 파일은 수정 없음(ESM live binding). 하드코딩 `'vindis1'` 4곳을 CELLARS[0]?.id로 교체.
  * SettingsModal: 🍾 내 셀러 관리(추가/삭제/칸 수 편집, 와인 든 셀러는 삭제·축소 차단),
    🥃 위스키 표시 토글.
  * 위스키 UI 숨김은 진입점 3곳만(AddWineModal·BulkImportModal의 카테고리 토글, ListView의
    종류 필터). 나머지는 wine.category 기반이라 데이터가 없으면 자동으로 안 보인다.
    **위스키 코드는 삭제하지 않았다** — show_whisky를 켜면 그대로 살아난다.
  * uid()에 랜덤 접미사 추가 — 여러 계정이 같은 밀리초에 추가할 때 PK 충돌 방지.
  * 새 계정은 STARTER_CELLARS(`내 셀러` 1개) + show_whisky=false로 시작한다.
  * 후속(2026-09-03): profiles.allow_bulk_price 추가 — 시장가 일괄 업데이트를 소유자 전용으로.
    saveProfile의 UPDATE에 `.eq('id', ...)` 누락으로 설정 저장이 실패하던 버그 수정
    (PostgREST는 WHERE 없는 UPDATE를 21000 `UPDATE requires a WHERE clause`로 거부한다 —
    RLS가 있어도 필터를 반드시 명시할 것).
  * 설정에 🔑 비밀번호 변경 추가 — 로그인 상태에서 supabase.auth.updateUser({password}).
    메일 발송이 없어 Supabase 기본 SMTP 제한과 무관하다. 앱에는 여전히 회원가입·비밀번호
    찾기(메일) 화면이 없다(초대제 유지).

## 아직 미적용 (다음 작업 후보)
- 취향 프로필 (음주 기록 기반 선호 품종·지역·평점 분석)
- AI 추천("오늘 뭐 마실까")
- 위시리스트
- 친구 계정용 공개 갤러리 (지금 get_public_wines()는 내 와인만 반환하도록 고정돼 있음)
- 계정별 AI 사용 제한 확대 — 지금은 시장가 일괄 업데이트만 막혀 있다(allow_bulk_price).
  사진 일괄 입력·단건 검색은 모든 계정이 소유자 키로 사용 가능

# CAVE 프로젝트 작업 규칙 (Cowork Instructions)

너는 이 폴더(`C:\Claude\wine-cellar-mgmt`)에 있는 CAVE 와인 셀러 관리 PWA의 소스를 직접 읽고 수정한다.

## 작업 방식
- 코드 수정은 **파일 전체를 채팅에 출력하지 말고, 실제 파일을 직접 편집**한다.
- 기존 기능은 절대 제거하지 않는다. 추가·수정만 한다.
- 수정 전에 어떤 파일이 실제로 바뀌어야 하는지 먼저 확인하고, 불필요한 파일은 건드리지 않는다.
- 큰 변경 전에는 무엇을 어떻게 바꿀지 짧게 계획을 말하고, 불확실하면 AskUserQuestion으로 묻는다.
- 수정 후에는 esbuild로 JSX 문법을 검증한 뒤 마무리한다. (과거 괄호 누락으로 빌드가 깨진 적 있음)

## 코드 스타일
- 스타일은 테마 객체 `T`(cellars.js) + 인라인 스타일을 유지한다. 새 CSS 파일/클래스를 만들지 않는다.
- 컴포넌트 구조·네이밍 컨벤션을 기존과 동일하게 유지한다.
- 모든 UI 텍스트는 한국어로 유지한다.
- camelCase(프론트) ↔ snake_case(DB) 매핑은 supabase.js의 wineToDb/dbToWine에 맞춘다.

## AI 호출 규칙 (절대 어기지 말 것)
- API 키는 브라우저/코드에 두지 않는다. 모든 Anthropic 호출은 Supabase Edge Function `anthropic-proxy` 경유.
- 프론트 진입점은 supabase.js의 `callProxy()`. cellars.js의 callAI, Modals.jsx의 callVisionAPI는 그 래퍼다.
- 모델: `claude-sonnet-4-6` 단일.
- `max_tokens`: 가격 검색 2000 이상, 이미지 분석 3000. **800 이하 금지**(JSON 잘림으로 조용한 실패).
- 가격/정보 검색에는 web_search 도구 필수: `tools: [{ type: 'web_search_20250305', name: 'web_search' }]`.
- 웹 검색은 `stop_reason === 'pause_turn'`일 수 있으므로 재호출(최대 4회) — 이 루프는 callProxy 내부에서 처리됨.
- JSON 추출은 완성된 JSON 객체 중 마지막 것을 파싱(greedy regex 금지).

## 빌드·검증 역할 분담 (중요)
- 무거운 `npm install`·`npm run build`·실제 배포는 **사용자가 로컬 PowerShell에서 직접** 한다.
  Cowork가 마운트된 폴더에 직접 돌리면 9p 마운트 캐시 때문에 매우 느리거나 거짓 실패가 난다.
- Cowork는 **코드 편집 + 가벼운 esbuild 단일 파일 문법 검증 + git 커밋/푸시**까지만 맡는다.
- esbuild 검증 시 마운트 캐시로 거짓 실패가 나면, 파일 자체는 Read로 재확인하고 outputs 경유로 우회 검증한다.
- 최종 빌드 판단은 **사용자의 로컬 \`npm run build\` 결과를 신뢰**한다.

## 배포 흐름
- 수정 → (사용자가 로컬에서) \`npm run build\`로 빌드 확인 → \`git add\` → \`git commit\` → \`git push\`.
- GitHub Actions가 자동 배포. 배포 후 캐시 때문에 안 바뀌어 보이면 Ctrl+Shift+R 강력 새로고침 안내.
- 커밋 메시지는 한국어로 간결하게, 무엇을 바꿨는지 한 줄로.

## 참고 문서
- 프로젝트 전체 맥락(셀러 구성, DB 스키마, 기능 이력, 미적용 기능)은 폴더의 \`CAVE-reference.md\`에 있다.
  작업 전 필요하면 이 파일을 먼저 읽는다.

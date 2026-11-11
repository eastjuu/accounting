# 복식부기 가계부 앱 — 프로젝트 안내 (Claude용)

개인 복식부기 가계부. **데이터는 구글 시트**, **화면은 Apps Script 웹앱**, **아이폰 홈 화면 앱처럼 보이게 하는 껍데기는 GitHub Pages**.
결제·입출금 알림은 iPhone 단축어 → 구글 폼(수신함) → 매일 00:05 Claude 예약 작업이 분개장에 입력.

## 사용자와 일하는 방식
- 한국어 존댓말, 친한 직장 동료처럼 자연스럽게. 과장된 공감은 빼기.
- 결론 먼저, 필요할 때만 덧붙이기. 불확실한 건 추측하지 말고 "불확실"이라고 표시.
- 회계 관련은 표 적극 사용, 선택지 비교(A vs B), 위험 명시, 원칙과 실무 구분.
- 사용자는 회계·재무 실무자(회계 전공). 회계 용어를 그대로 써도 됨.
- **장부 데이터(구글 시트)를 직접 고치는 일은 Claude 앱 쪽에서 함.** 여기(Claude Code)는 코드(앱·껍데기) 작업 중심. 시트를 직접 써야 하면 먼저 사용자에게 확인.

## 저장소 구조
```
/                     ← GitHub Pages로 그대로 공개됨 (공개 저장소)
├─ index.html         껍데기 페이지 (반드시 소문자 index.html)
├─ icon.png           홈 화면 아이콘 180×180 (바꾸면 index.html의 ?v=N도 올리기)
├─ icon-512.png
├─ apps-script/       clasp로 Apps Script 프로젝트와 연결된 폴더
│  ├─ .clasp.json     scriptId
│  ├─ appsscript.json 매니페스트 (시간대 Asia/Seoul, 웹앱: 나로 실행 / 모든 사용자)
│  ├─ Code.gs         서버 (clasp에 따라 Code.js로 보일 수 있음)
│  └─ Index.html      앱 화면 전체 (HTML+CSS+JS 한 파일)
├─ tools/preview.js   가짜 서버로 앱 화면을 띄워 캡처하는 테스트 (Playwright)
├─ CLAUDE.md
└─ SETUP.md           사람용 준비 순서
```
> 저장소가 공개라서 apps-script 코드와 시트 ID도 공개돼요. 시트는 공유돼 있지 않아 ID만으로는 열 수 없고, 접속 키는 코드가 아니라 스크립트 속성에 있어요.

## 구성 요소와 ID
| 이름 | 값 |
|---|---|
| 가계부 시트 `복식부기_가계부` | `1loAjxb7UOuZGwQX50ExM9ZztUFNQnzfAp8IdtysqwZA` |
| 수신함 시트 `가계부_수신함` (구글 폼 응답) | `1mp08Aj5-zcdjT1ZkP0TqSYigPo94ZPkW1Puw828UDhg`, 시트 `설문지 응답 시트1` |
| GitHub Pages | `https://eastjuu.github.io/accounting/` (저장소 `eastjuu/accounting`) |
| Apps Script 웹앱 배포 ID | `AKfycbw37FbwCQG84QMFl3i5w_ZhWj44Nb5zCpn1oqgyyRPHiVQLoUPSKcYMyCmXDQrwAL7i1Q` |
| 접속 키 | 스크립트 속성 `APP_KEY` (코드·저장소에 절대 넣지 않기). 새로 만들 땐 `makeKey()` 실행 |
| 예약 작업 | Claude 앱의 예약 작업 "가계부 수신함 정리", 매일 00:05 KST. 지시문 수정은 Claude 앱에서 |

## 시트 구조 (가계부)
- **분개장** A 전표번호 / B 날짜 / C 차변계정 / D 대변계정 / E 금액 / F 적요 / G 연월 / H 차변구분 / I 대변구분 / J 검증 / K 확인 / L 메모
  - **F 적요 = 사람이 쓰거나 추천값**(분류규칙의 기본 적요 → 가맹점명), **L 메모 = 알림 원문·참고**. 원문을 적요에 넣지 않기. (2026-11 이전 전표는 `적요 (알림: 원문)` 꼴 → `splitMemoRun()`으로 분리)
  - ⚠️ **A열은 자동번호 수식** `=IF(ISBLANK(Bn),"",A(n-1)+1)`, **G~J열도 수식이 1000행 아래까지 미리 채워져 있음.**
    → 코드든 사람이든 **B~F, K, L만 쓰기.** A·G~J에 값을 쓰면 번호 체계가 깨짐.
    → `append`는 수식 때문에 1000행 아래에 붙으니 쓰지 말 것. 마지막 데이터 행은 **B열 기준**으로 찾고, 쓰기 직전 그 행이 비었는지 재확인.
  - K는 `확인` / `미확인` / `무효`. 자동 입력은 항상 `미확인`, 사용자가 확인.
  - **삭제 대신 무효 처리**: K=`무효`면 행은 남고 집계에서 빠짐. 행 삭제·내용 비우기 금지(번호·수신함 D열·변경이력이 어긋남).
    - 시트 수식(2026-11-11 변경): G `=IF(OR(B="",K="무효"),"",…)`, J도 K=`무효`면 빈칸 → 월별합계(G 조건) 자동 제외. 시산표 D·E는 `SUMIFS(…,'분개장'!$K:$K,"<>무효")`, B2 검증도 같은 조건.
    - 중복 판단 등 자동 처리에서 K=`무효` 행은 무시.
  - 날짜는 `yyyy-mm-dd` 문자열로 쓰면 날짜로 인식됨.
  - 과거 사고: 예약 작업이 앱에서 만든 전표 18번을 덮어써서 50행에 복구함(번호 18은 빈 번호로 남음).
- **계정과목표** A 코드 / B 계정명 / C 구분(자산·부채·자본·수익·비용) / D 정상잔액 / E 재무제표 구분(현금및예금·적금·투자자산·기타자산·부채·자본·수익·비용). 계정은 여기 있는 이름만 사용.
- **분류규칙** A 키워드 / B 차변계정 / C 대변계정 / D 비고 / E 추가일 / F 기본 적요. 알림 원문에 키워드가 있으면 그 계정·적요. 가장 긴 키워드 우선. 기본 적요가 비어 있으면 가맹점명 등으로 추천.
- **변경이력** 시각 / 작업 / 분개장 행 / 변경 전 / 변경 후. 앱과 예약 작업의 모든 쓰기를 기록. (2026-11-10 이전 시각은 미국 서부 기준으로 찍혀 있음)
- 그 외: 안내, 시산표, 월별합계.
- 시트 시간대: Asia/Seoul (2026-11-10에 바꿈).

## 수신함 시트
A 타임스탬프 / B 알림 원문 / C 처리상태(빈칸=대기, 처리됨, 보류, 일부보류, 중복) / D 전표번호(쉼표 구분) / E 메모.
지금은 단축어가 하루치 미리알림을 **00:00에 한 줄로 묶어** 폼에 보냄 → 한 줄에 여러 건이 들어 있음.

## Apps Script (`apps-script/`)
**Code.gs**
- `doGet(e)` — `?k=키`가 맞을 때만 Index를 돌려줌. `XFrameOptionsMode.ALLOWALL`(껍데기 iframe에 넣기 위해).
- `getData(key)` — 분개장 A:L, 계정과목표 A:E, 수신함(`readInbox_`), 분류규칙(`readRules_`), 시각 `at`.
- 쓰기(모두 `withLock_` + `log_`):
  - `setConfirm(key, items[{row,no}], '확인'|'미확인')` — 무효 행은 건너뜀
  - `voidEntry(key, row, no, on)` — K를 `무효`로 / 취소하면 `미확인`. 무효 행은 `updateEntry` 거부
  - `updateEntry(key, row, no, f)` — B~F, K, L 수정
  - `addEntry(key, f, ib?)` — 마지막 데이터 행 아래에 B~F, K, L. 수신함 행이면 `처리됨`, `f.rule {keyword, desc}`가 있으면 분류규칙(기본 적요 포함) 저장
  - 필드 이름: `f.memo` = 적요(F), `f.note` = 메모(L). `header_()`가 L1/분류규칙 F1 제목이 비어 있으면 채움
  - `checkRow_` — 앱이 아는 행과 시트의 전표번호가 같은지 확인(행이 밀렸으면 거부). `clean_` — 입력값 검사
- `makeKey()` — 접속 키 재발급.
- `splitMemoPreview()` / `splitMemoRun()` — 1회용. 적요의 `(알림: …)`을 L열로 옮김(L이 빈 행만, 변경이력 기록). 편집기에서 실행.

**Index.html** (한 파일, 약 1,800줄)
- 상태 `S`, 데이터 가공 `build(raw)`, 화면 `VIEWS`(summary=홈, bs, is, trial, journal, ledger, monthly, inbox), `render()`.
- 홈: `homeView()`, `spend(ym)`(기준일: 오늘 전표가 없으면 어제), `lineChart()`(일별 막대+누적 선), `wcard`, `hcard`, `headline()`/`greetText()`(시간대별 인사말).
- 불러오기: `homeSkeleton()`/`skeleton()`(틀) → 데이터 오면 `S.reveal`로 차례로 등장 + `runCount()` 숫자 애니메이션.
- 쓰기 UI: `api()`, `setConfirmUI`, `openForm`/`submitForm`(수정·새 전표·알림→전표), `allBtn`(모두 확인, 두 번 눌러야 실행), `toast`.
- 무효: `e.void`(목록 필터 '무효'에서만 보임, `valid`·집계·최근 목록 제외), 상세의 "무효 처리"(두 번 눌러야 실행, `S.armV`) / "무효 취소" → `voidUI`.
- 폰(≤860px)은 iOS식 목록·하단 시트·당겨서 새로고침·push/pop 전환, PC는 사이드바+카드.

## GitHub 껍데기(`index.html`)와 앱 사이 통신 (postMessage)
| 메시지 | 방향 | 의미 |
|---|---|---|
| `ledger-hello` | 앱 → 껍데기 | 저장된 데이터 달라 |
| `ledger-cache` `{raw}` | 껍데기 → 앱 | 마지막 데이터 (앱이 바로 그림) |
| `ledger-save` `{raw}` | 앱 → 껍데기 | 새 데이터 보관 (localStorage `ledger-data-cache`) |
| `ledger-ready` | 앱 → 껍데기 | 데이터가 그려졌음 → 시작 화면 걷기 (0.5초 페이드, 15초 안전장치) |
- 껍데기는 `*.googleusercontent.com` / `script.google.com` 출처만 신뢰.
- 웹앱 주소·키는 껍데기의 localStorage `ledger-app-settings`에만 저장(저장소에 없음). 주소 끝에 `#reset`이면 초기화.

## 아이폰 관련 주의
- 앱(구글 주소 iframe) 안의 저장 공간은 아이폰에서 지워짐 → 캐시는 껍데기 쪽에 둠.
- 홈 화면 아이콘은 추가할 때 고정됨. 아이콘을 바꾸면 `?v=N`을 올리고 아이콘을 지웠다 다시 추가해야 하고, 그러면 주소·키를 다시 입력해야 함.
- **껍데기의 시작 화면(`.sp-m`)은 앱 홈의 틀과 위치가 똑같아야 전환이 자연스러움.** 홈 레이아웃(간격, 카드, 상단 버튼)을 바꾸면 `index.html`의 시작 화면과 `homeSkeleton()`도 같이 맞추기.
- 하단 탭 바: `bottom: max(12px, calc(env(safe-area-inset-bottom) - 10px))`.
- 입력창 글자 크기는 16px 이상(작으면 아이폰이 확대함).

## 디자인
- 포인트 주황 + 검은 글자·아이콘. 토큰: 라이트 `--bg #f3f4f6, --panel #fff, --fg #111214, --muted #8b9099, --accent #f0712c` / 다크 `--bg #14171d, --panel #1d2027, --fg #f2f3f5, --accent #ff8a4c`.
- 글꼴 Pretendard(jsDelivr). 카드 모서리 24px, 위젯 카드·사각 버튼(14px), 선택된 탭은 채운 아이콘.
- 예시로 받은 다른 앱과 너무 비슷해지지 않게(동그란 ↗ 버튼, 지갑 알약 등은 일부러 피함).

## 배포
사용자는 맥(집)·윈도우(회사)·아이패드를 오가며 **주로 클라우드 세션**에서 작업함. 클라우드 세션에는 clasp 로그인 정보가 없음.
- **기본: GitHub Actions** (`.github/workflows/deploy-apps-script.yml`). main에 `apps-script/**` 변경이 합쳐지면 `clasp push -f` → `clasp deploy -i <배포 ID>` 자동 실행. Secret `CLASPRC_JSON`(맥의 `~/.clasprc.json`) 필요. clasp는 2.4.2 고정.
  → Claude는 작업 브랜치에 푸시까지. main 합치기(=실배포)는 사용자가 함.
- 스크립트 ID: `1l89zKcHfVR8x17LagQ7DeRbY7AcmOC_ZgIaxpyuIpNyVqNn6efq7uabP` (`apps-script/.clasp.json`)
- 비상시 맥에서 수동:
```bash
cd apps-script
clasp push                                   # 코드 올리기 (저장만 된 상태)
clasp deploy -i AKfycbw37FbwCQG84QMFl3i5w_ZhWj44Nb5zCpn1oqgyyRPHiVQLoUPSKcYMyCmXDQrwAL7i1Q -d "변경 요약"  # 같은 배포에 새 버전 → 웹앱 주소 유지
clasp deployments                            # 배포 목록 확인
```
- ⚠️ `-i` 없이 `clasp deploy`하면 **새 배포(새 주소)**가 생겨서 아이폰 앱이 옛 주소를 계속 봄. 항상 `-i`.
- 껍데기(`index.html`, 아이콘)는 git push → GitHub Pages가 1~2분 뒤 반영(아이폰은 캐시로 더 늦을 수 있음).

## 테스트
```bash
npm install playwright   # 처음 한 번 (클라우드 세션엔 이미 설치돼 있음)
node tools/preview.js demo   # tools/out/에 폰·PC 캡처
```
- 실제 서버 대신 `google.script.run` 가짜를 붙여 화면만 확인함. 실제 시트 쓰기는 테스트되지 않으니, 서버 쓰기 코드를 바꾸면 사용자에게 테스트용 전표로 확인 요청.

## 남은 일 (백로그)
1. 알림을 한 건씩 폼으로 보내기(미리알림 거치지 않음) → 수신함 한 줄 = 알림 한 건.
2. 체크카드 이중 알림(현대 체크 승인 + 우리 "[출금] 현대카드", 출금취소) 처리 규칙을 예약 작업 지시문에 명시.
3. 분류규칙에 시작일·종료일(기간 규칙, 여행 모드).
4. 앱: 변경이력 보기, 장부 이상 징후 표시(빠진 번호, 같은 날 같은 금액).
5. 앱: 미수금(받을 돈) 정산 화면 — 필요해지면.

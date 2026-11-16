# 복식부기 가계부 앱 — 프로젝트 안내 (Claude용)

개인 복식부기 가계부. **데이터는 구글 시트**, **화면은 GitHub Pages에서 직접**(`apps-script/Index.html`을 Pages가 그대로 제공), **데이터는 Apps Script 웹앱 API(`doPost`)로**. (2026-11-16부터. 예전 방식 = 껍데기 iframe 안에 Apps Script 화면, `#classic`으로 남겨 둠)
결제·입출금 알림은 iPhone 단축어 → 웹앱 `doPost`(가계부 안 `수신함` 시트) → 분류규칙에 맞으면 바로 `미확인` 전표, 안 맞으면 대기 → 남은 건은 매일 00:05 Claude 예약 작업이 처리. (예전 경로: 단축어 → 구글 폼 → 수신함 파일)

## 사용자와 일하는 방식
- 한국어 존댓말, 친한 직장 동료처럼 자연스럽게. 과장된 공감은 빼기.
- 결론 먼저, 필요할 때만 덧붙이기. 불확실한 건 추측하지 말고 "불확실"이라고 표시.
- 회계 관련은 표 적극 사용, 선택지 비교(A vs B), 위험 명시, 원칙과 실무 구분.
- 사용자는 회계·재무 실무자(회계 전공). 회계 용어를 그대로 써도 됨.
- **장부 데이터(구글 시트)를 직접 고치는 일은 Claude 앱 쪽에서 함.** 여기(Claude Code)는 코드(앱·껍데기) 작업 중심. 시트를 직접 써야 하면 먼저 사용자에게 확인.

## 저장소 구조
```
/                     ← GitHub Pages로 그대로 공개됨 (공개 저장소)
├─ index.html         첫 화면: 연결 설정 → 앱 화면(apps-script/Index.html)을 **같은 주소에서** 그림(document.write). ?classic이면 예전 iframe 방식 (반드시 소문자 index.html)
├─ icon.png           홈 화면 아이콘 180×180 (바꾸면 index.html의 ?v=N도 올리기)
├─ icon-512.png
├─ apps-script/       clasp로 Apps Script 프로젝트와 연결된 폴더
│  ├─ .clasp.json     scriptId
│  ├─ appsscript.json 매니페스트 (시간대 Asia/Seoul, 웹앱: 나로 실행 / 모든 사용자)
│  ├─ Code.gs         서버 (clasp에 따라 Code.js로 보일 수 있음)
│  └─ Index.html      앱 화면 전체 (HTML+CSS+JS 한 파일). Pages에서 /accounting/apps-script/Index.html로도 열림(WEB 모드)
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
- **분개장** A 전표번호 / B 날짜 / C 차변계정 / D 대변계정 / E 금액 / F 적요 / G 연월 / H 차변구분 / I 대변구분 / J 검증 / K 확인 / L 메모 / M 묶음
  - **M 묶음 = 여러 줄 전표(복합분개)**: 차변·대변 여러 줄을 "차 1 / 대 1" 쌍으로 나눠 여러 행에 쓰고, 그 행들 M에 같은 값(첫 행 전표번호). 일반 전표는 M 빈칸. 행마다 차대가 맞아서 시트 수식은 그대로. 묶음은 무효·확인·수정을 **묶음 전체로만**(일부 행만 바꾸지 않기).
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
- **계정과목표** A 코드 / B 계정명 / C 구분(자산·부채·자본·수익·비용) / D 정상잔액 / E 재무제표 구분(현금및예금·적금·투자자산·기타자산·부채·자본·수익·비용) / F 안내 문구(1~2행) / G 사용(`사용중지`면 입력 목록에서 숨김). 계정은 여기 있는 이름만 사용, 사용중지 계정은 새 전표·규칙에 쓰지 않기.
  - ⚠️ 시산표는 계정과목표를 **행 순서대로** 참조(5~44행 = 계정과목표 2~41행, 40개 한도) → 중간 삽입·행 삭제 금지, **맨 아래에만 추가**.
  - ⚠️ 분개장·분류규칙은 계정 **이름**으로 연결 → 이름 변경·삭제는 앱에서 막음. 꼭 필요하면 분개장·분류규칙까지 같이 바꿔야 함.
  - 월별합계 비용 계정별 표(H10:J29)는 500번대 **20개까지** 표시(2026-11-12에 11→20으로 늘림). 합계 H30, 안내 H31, 차트는 H33에 있고 H9:I29를 그림.
  - 코드 범위: 자산 100~199, 부채 200~299, 자본 300~399, 수익 400~499, 비용 500~599.
- **분류규칙** A 키워드 / B 차변계정 / C 대변계정 / D 비고 / E 추가일 / F 기본 적요. 알림 원문에 키워드가 있으면 그 계정·적요. 가장 긴 키워드 우선. 기본 적요가 비어 있으면 가맹점명 등으로 추천.
- **변경이력** 시각 / 작업 / 분개장 행 / 변경 전 / 변경 후. 앱과 예약 작업의 모든 쓰기를 기록. (2026-11-10 이전 시각은 미국 서부 기준으로 찍혀 있음)
- 그 외: 안내, 시산표, 월별합계.
- 시트 시간대: Asia/Seoul (2026-11-10에 바꿈).

## 수신함 시트
A 타임스탬프 / B 알림 원문 / C 처리상태(빈칸=대기, 처리됨, 보류, 일부보류, 중복) / D 전표번호(쉼표 구분) / E 메모.
- **전환 방식**: 가계부 안 `수신함` 시트가 **있으면 그것만**, 없으면 예전 수신함 파일(구글 폼 응답)을 읽음. 단축어가 `doPost`로 첫 알림을 보내는 순간 `inboxSheet_`가 시트를 만들고 `migrateInbox_`로 예전 기록(빈 줄 제외)을 옮긴 뒤 이어서 씀 → 그 뒤로 예전 파일은 열지 않음(보관용).
  - 2026-11-16 기준 단축어는 아직 **구글 폼**으로 보내는 중(가계부 안 수신함 시트 없음).
- 앱에서 가계부 안 수신함 행은 **음수 행 번호**(-시트 행), 예전 파일 행은 양수.
- 대기 행에는 `getData`가 서버 추천(`guess_` 결과)을 7번째 값으로 붙임 → 앱 '전표로 만들기'가 미리 채움, 상세에 '추천 분개' 표시.
- 예약 작업도 같은 규칙(가계부 안 수신함이 있으면 그것만).

## Apps Script (`apps-script/`)
**Code.gs**
- `doGet(e)` — `?k=키`가 맞을 때만 Index를 돌려줌. `XFrameOptionsMode.ALLOWALL`(껍데기 iframe에 넣기 위해).
- `getData(key)` — 분개장 A:L, 계정과목표 A:G(`accountsOut_`), 수신함(`readInbox_(ss)`: 두 수신함 합침, `id/gid`=예전 파일, `id2/gid2`=가계부 안 시트), 분류규칙(`readRules_`), 시각 `at`.
- **쓰기 함수는 바뀐 부분을 돌려줌** → 앱이 `applyPatch()`로 그 부분만 반영(저장 뒤 전체 다시 불러오기 없음). `rows: [[행, A~L값]]`(`rowsOut_`, flush 뒤 읽어 G~J 수식 결과 포함), `inbox: [수신함 행]`, `rules`, `accounts`. 반환에 이게 없으면 앱은 `load()`로 전체를 다시 불러옴.
- 쓰기(모두 `withLock_` + `log_`/`logMany_`, 시트 호출은 행 단위로 묶음):
  - `setConfirm(key, items[{row,no}], '확인'|'미확인')` — 무효 행은 건너뜀
  - `voidEntry(key, row, no, on)` — K를 `무효`로 / 취소하면 `미확인`. 무효 행은 `updateEntry` 거부
  - `updateEntry(key, row, no, f)` — B~F, K, L 수정
  - `saveVoucher(key, refs[{row,no}], {date,memo,note,confirm,lines[{side:'차'|'대',acct,amount}]}, ib?)` — 여러 줄 전표 저장. `splitLines_`(차·대 줄을 순서대로 작은 금액만큼 떼어 쌍으로, 앱 `vPairs`와 같은 방식) → 기존 행은 제자리 수정, 늘면 맨 아래 추가(`writeEntries_`), 줄면 남는 행 `무효`+M 비움. 남은 행 2개 이상이면 M에 묶음 값, 1개면 M 비움. 메모(L)는 첫 행만. `voidEntry`는 M이 있으면 묶음 전체, `updateEntry`는 묶음 행 거부.
  - `addEntry(key, f, ib?)` — 마지막 데이터 행 아래에 B~F, K, L(`writeEntry_`→`writeEntries_`, 자동 입력과 공용). 수신함 행이면 `처리됨`(`ib.row` 음수면 가계부 안 수신함), `f.rule {keyword, desc}`가 있으면 분류규칙(기본 적요 포함) 저장
  - 필드 이름: `f.memo` = 적요(F), `f.note` = 메모(L). `header_()`가 L1/분류규칙 F1 제목이 비어 있으면 채움
  - `checkRow_` — 앱이 아는 행과 시트의 전표번호가 같은지 확인(행이 밀렸으면 거부). `clean_` — 입력값 검사
- 설정(모두 잠금 + 변경이력): `saveRule(key, {row?, kw?, keyword, debit, credit, desc})`, `deleteRule(key, row, kw)`(행의 키워드가 같을 때만), `addAccount(key, {type, code, name, fsg})`(맨 아래 추가, 코드·이름 중복·범위 검사), `setAccountUse(key, code, name, on)`(G열). `readRules_`는 각 규칙의 시트 행을 5번째 값으로 돌려줌.
- `makeKey()` — 접속 키 재발급.
- **분류(`guess_`) = 서버 한 곳 기준**: ① 분류규칙(가장 긴 키워드) ② **과거 전표 학습**: `merchantOf_`(가맹점명/현대 체크 금액 다음 줄/은행 '금액 상대 입출금'/우리 '[출금] 상대')로 같은 가맹점 최근 전표(무효·여러 줄 제외, 최대 3건)의 차변, `channelOf_`(승인 알림 첫 줄 = 결제 수단)로 같은 결제 수단 최근 전표의 대변 ③ 대변 빈 신용카드 승인은 첫 카드 부채(체크카드 제외). **자동 분개는 규칙이 맞거나, 승인 알림 + 같은 가맹점 최근 2건 이상 같은 차변일 때만**. 나머지는 `hint`(추천)만. 은행 입출금 알림은 학습 자동 분개 안 함(체크카드 이중 알림 방지).
- `doPost(e)` — 단축어 입력. 본문 JSON `{k, text}`, 키는 스크립트 속성 `INGEST_KEY`(앱 접속 키와 별개, `makeIngestKey()`로 발급). `ingest_`: 최근 300건에 같은 원문이 있으면 `중복` → `guess_`(가장 긴 키워드 규칙, 금액 `n원` 첫 번째, 날짜 `MM/DD hh:mm`·`MM.DD hh:mm` 없으면 오늘, 대변 빈 규칙+`승인`이면 첫 카드 부채 계정, 적요=기본 적요→가맹점명→키워드, `취소` 들어가면 대기) → `clean_` 통과 시 `미확인` 전표 + `처리됨`, 아니면 C 빈칸·E에 이유. 응답 `{ok, status, no?, msg}`.
  - ⚠️ 체크카드 이중 알림(승인 + 출금)이 둘 다 규칙에 맞으면 전표가 두 번 생길 수 있음 → 미확인으로 남으니 앱에서 무효 처리.
- `splitMemoPreview()` / `splitMemoRun()` — 1회용. 적요의 `(알림: …)`을 L열로 옮김(L이 빈 행만, 변경이력 기록). 편집기에서 실행.

**Index.html** (한 파일, 약 2,300줄)
- 최근 사용 계정: `build`의 `recentAccts`(최근 80건에서 많이 쓴 6개) → `acctOptions` 맨 위 '최근 사용' 묶음.
- 밀어서 확인(폰): 전표 줄을 왼쪽으로 90px 넘게 밀고 놓으면 확인↔미확인(`sw`, 줄 오른쪽 `::after` 버튼). 묶음은 전체.
- 여러 줄 전표: `build`가 M 묶음의 첫 행을 대표(`grpRows`, `lines`, `total`), 나머지는 `sub`(`lead`)로 표시. 목록·상세는 `D.list`(대표만), 집계·시산표는 행 단위 `D.journal`/`valid`. 원장은 같은 묶음·같은 방향 줄을 합치고 상대 계정이 여럿이면 `제좌`. 입력 폼은 줄 단위(`jlRow`/`jlRead`/`jlSum`, 계정·차변·대변, 줄 추가 시 차액 자동 채움). 한 쌍이면 `addEntry`/`updateEntry`, 아니면 `saveVoucher`. 상세는 `.vt` 표(구분·코드·계정·차변·대변·합계).
- 상태 `S`, 데이터 가공 `build(raw)`, 화면 `VIEWS`(summary=홈, bs, is, trial, journal, ledger, monthly, inbox), `render()`.
- 홈: `homeView()`, `spend(ym)`(기준일: 오늘 전표가 없으면 어제), `lineChart()`(일별 막대+누적 선), `wcard`, `hcard`, `headline()`/`greetText()`(시간대별 인사말).
- 불러오기: `homeSkeleton()`/`skeleton()`(틀) → 데이터 오면 `S.reveal`로 차례로 등장 + `runCount()` 숫자 애니메이션.
- 쓰기 UI: `api()`, `setConfirmUI`, `openForm`/`submitForm`(수정·새 전표·알림→전표), `allBtn`(모두 확인, 두 번 눌러야 실행), `toast`.
- 무효: `e.void`(목록 필터 '무효'에서만 보임, `valid`·집계·최근 목록 제외), 상세의 "무효 처리"(두 번 눌러야 실행, `S.armV`) / "무효 취소" → `voidUI`.
- 하단 탭: 홈 / 재무제표(대차 블록 아이콘) / 전표 / 원장 / **전체**(≡). 전체 탭(`moreView`) 아래 `MORE_SUB`: 월별 추이, 수신함, 분류 규칙(`rulesView`), 계정과목(`accountsView`), 정보(`APP_VER`). PC 사이드바엔 '관리' 그룹.
- 설정 폼: `openRule`(#rf), `openAcct`/`openAcctNew`(#af), 쓰기는 `settingWrite`. 삭제는 두 번 눌러야 실행.
- 글자 선택 막음(`body{user-select:none}`), 입력칸과 `.sel`(메모·알림 원문)만 복사 가능.
- **샘플 데이터 모드**(전체 → 보여주기, PC는 사이드바 아래): `setDemo(on)`, `sampleRaw()`(고정 시드로 최근 3개월 가짜 장부·수신함·규칙). 켜져 있으면 `api()`가 모든 쓰기를 거부, `load()`는 서버를 부르지 않음, 늦게 온 실제 데이터는 `S.realRaw`에 보관만. 플래그는 앱 localStorage `ledger-demo` + 껍데기 `ledger-demo-mode` 양쪽(앱 저장 공간이 지워져도 시작 때 실제 데이터가 안 보이게). 홈 상단에 '샘플' 표시.
- 폰(≤860px)은 iOS식 목록·하단 시트·당겨서 새로고침·push/pop 전환, PC는 사이드바+카드.

## 실행 방식 두 가지 (같은 Index.html)
| | **WEB (기본)** | **GAS (예전·#classic)** |
|---|---|---|
| 화면 | `index.html`이 `apps-script/Index.html`을 받아 **주소 이동 없이** 같은 페이지에 그림(`document.open/write`). 받은 파일은 localStorage `ledger-app-html`에 두고 다음 실행부터 즉시 그림, 새 버전은 뒤에서 받아 **다음 실행부터** 반영 | `index.html` 안 iframe에 Apps Script 웹앱 화면 |
| 데이터 | `call()` → `rpc()`: `fetch(웹앱 주소, POST, Content-Type text/plain, {k, fn, args})` → 서버 `doPost` → `api_`(허용 목록: getData·setConfirm·updateEntry·voidEntry·addEntry·saveVoucher·saveRule·deleteRule·addAccount·setAccountUse) → `{ok, data}` / `{ok:false, error}` | `google.script.run` |
| 판별 | head 스크립트 `WEB = !google.script.run`, 설정 `CFG` = localStorage `ledger-app-settings` {url, key, mode}. 설정 없으면 `../index.html`로 | |
| 캐시 | 같은 출처 localStorage `ledger-cache-v1` (없으면 예전 껍데기 캐시 `ledger-data-cache`) | 앱 localStorage + 껍데기에 postMessage |
| 상단 | `html.web body{padding-top:env(safe-area-inset-top)}` (예전 iframe 위치와 같게) | 껍데기 iframe이 상태 표시줄 아래 |
- ⚠️ **주소를 옮기지 말 것**: 홈 화면 앱에서 다른 경로(예: `/apps-script/Index.html`)로 이동하면 아이폰이 앱 밖으로 보고 사파리 주소창·버튼을 띄움(2026-11-16 실제로 발생). 전환·초기화도 같은 주소 다시 열기로 처리.
- 전환: `?classic`/`#classic`(mode='classic' 저장) / `?web` / `?reset`. 홈 화면 앱은 주소창이 없어서 **앱 전체 → 정보**에 '연결 다시 설정'·'예전 방식으로 열기'(WEB, `setMode`)·'새 방식으로 열기'(GAS iframe 안 → 껍데기에 `ledger-mode` 메시지) 버튼이 있음. 사파리와 홈 화면 앱은 저장 공간이 따로.
- `index.html`의 스크립트는 함수로 감쌈(앱 화면의 전역 이름과 충돌 방지). 앱 화면을 바꾸면 사용자는 **두 번째 실행부터** 새 버전을 봄.
- `text/plain` POST라서 사전 요청(preflight)이 없음. Apps Script는 302 → `script.googleusercontent.com`로 응답을 넘김(브라우저가 따라감). 웹앱은 '모든 사용자' 접근이어야 함.
- `doPost` 본문에 `fn`이 있으면 앱 API(APP_KEY), 없으면 단축어 입력(INGEST_KEY).

## (예전 방식) 껍데기(`index.html`)와 앱 사이 통신 (postMessage)
| 메시지 | 방향 | 의미 |
|---|---|---|
| `ledger-hello` | 앱 → 껍데기 | 저장된 데이터 달라 |
| `ledger-cache` `{raw}` | 껍데기 → 앱 | 마지막 데이터 (앱이 바로 그림) |
| `ledger-save` `{raw}` | 앱 → 껍데기 | 새 데이터 보관 (localStorage `ledger-data-cache`) |
| `ledger-ready` | 앱 → 껍데기 | 데이터가 그려졌음 → 시작 화면 걷기 (0.5초 페이드, 15초 안전장치) |
| `ledger-demo` `{on}` | 앱 ↔ 껍데기 | 샘플 모드 켬/끔 저장(앱→껍데기). 껍데기는 샘플 모드면 `ledger-hello`에 캐시 대신 `{on:true}`로 답함 |
- 껍데기는 `*.googleusercontent.com` / `script.google.com` 출처만 신뢰.
- 웹앱 주소·키는 껍데기의 localStorage `ledger-app-settings`에만 저장(저장소에 없음). 주소 끝에 `#reset`이면 초기화.

## 아이폰 관련 주의
- (예전 방식) 앱(구글 주소 iframe) 안의 저장 공간은 아이폰에서 지워짐 → 캐시는 껍데기 쪽에 둠. WEB 방식은 같은 출처라 해당 없음.
- 홈 화면 아이콘은 추가할 때 고정됨. 아이콘을 바꾸면 `?v=N`을 올리고 아이콘을 지웠다 다시 추가해야 하고, 그러면 주소·키를 다시 입력해야 함.
- **껍데기의 시작 화면(`.sp-m`)은 앱 홈의 틀과 위치가 똑같아야 전환이 자연스러움.** 홈 레이아웃(간격, 카드, 상단 버튼)을 바꾸면 `index.html`의 시작 화면과 `homeSkeleton()`도 같이 맞추기.
- 하단 탭 바: `bottom: max(12px, calc(env(safe-area-inset-bottom) - 10px))`.
- 입력창 글자 크기는 16px 이상(작으면 아이폰이 확대함).

## 디자인
- 포인트 주황 + 검은 글자·아이콘. 토큰: 라이트 `--bg #f3f4f6, --panel #fff, --fg #111214, --muted #8b9099, --accent #f0712c` / 다크 `--bg #14171d, --panel #1d2027, --fg #f2f3f5, --accent #ff8a4c`.
- 글꼴 Pretendard(jsDelivr). 카드 모서리 24px, 위젯 카드·사각 버튼(14px), 선택된 탭은 채운 아이콘.
- **Liquid Glass(폰)**: Index.html 스타일 맨 끝 블록. 하단 시트(`.drawer`)는 좌우·아래를 화면 끝에 붙이고 위 모서리만 34px(아이폰 화면 곡률과 어긋나지 않게, 2026-11-16). 유리(`backdrop-filter`)는 떠 있는 요소(탭 바·홈 상단 버튼·하단 시트·토스트)에만, 카드 본문은 불투명 유지(금액 가독성·성능).
  - 탭 바: 선택 알약 `.tb-pill`은 칸 번호 `--i`로 위치 계산(`S.tabI`에서 새 칸으로 스프링 이동). 스크롤 내리면 `.tabbar.min`(좌우 46px·글자 숨김, 접힐 땐 빠르게/펼칠 땐 `--spring`), 손가락 위치 `--mx`로 반사광.
  - 스프링은 CSS `linear()` 이징(`--spring`, `--spring-soft`). `prefers-reduced-motion`이면 전환 끔.
  - 웹 한계: 실제 굴절(렌즈), 기울기 반사광, 햅틱은 Safari에서 불가 → 하이라이트로 흉내.
  - 껍데기 시작 화면 `.sp-tab`도 같은 유리 모양(탭 바 스타일 바꾸면 같이 맞추기).
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
- 실제 서버 대신 `google.script.run` 가짜를 붙여 화면만 확인함. 쓰기 함수 가짜는 `window.__mockWrite(이름, 성공, 실패)`로 붙일 수 있음(없으면 빈 응답 → 앱이 전체 다시 불러옴). 실제 시트 쓰기는 테스트되지 않으니, 서버 쓰기 코드를 바꾸면 사용자에게 테스트용 전표로 확인 요청.

## 남은 일 (백로그)
1. ~~알림을 한 건씩 보내기~~ → `doPost`로 구현(2026-11-16). 남은 일: 단축어를 새 방식으로 바꾸고 예약 작업 지시문에 가계부 안 `수신함` 시트 추가(사용자).
2. 체크카드 이중 알림(현대 체크 승인 + 우리 "[출금] 현대카드", 출금취소) 처리 규칙을 예약 작업 지시문에 명시.
3. 분류규칙에 시작일·종료일(기간 규칙, 여행 모드).
4. 앱: 변경이력 보기, 장부 이상 징후 표시(빠진 번호, 같은 날 같은 금액).
5. 앱: 미수금(받을 돈) 정산 화면 — 필요해지면.

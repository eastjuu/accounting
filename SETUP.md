# 준비 순서 (사람용)

작업 방식: **코드 수정은 어디서든 클라우드 세션(claude.ai/code, Claude 앱)** → main에 합치면 **GitHub Actions가 Apps Script에 자동 배포**.
맥은 처음 한 번 로그인 정보를 만들 때만 필요해요. 회사 윈도우·아이패드에는 아무것도 설치하지 않아요.

| 기기 | 하는 일 |
|---|---|
| 맥 (집) | 처음 한 번: clasp 로그인 → GitHub Secret 등록. 비상시 수동 배포 |
| 윈도우 (회사)·아이패드 | 브라우저로 클라우드 세션 → 수정·미리보기 → main에 합치기 |

## 1. 맥에서 한 번만 (약 10분)
1. https://script.google.com/home/usersettings 에서 **Google Apps Script API**를 **사용**으로 켜기
2. **Node.js** LTS 설치: https://nodejs.org
3. 터미널에서 clasp 설치 후 로그인 (가계부 시트를 가진 구글 계정으로). 버전은 워크플로와 같은 2.4.2로 맞춰요.
   ```bash
   npm install -g @google/clasp@2.4.2
   ```
   ```bash
   clasp login
   ```
4. 로그인 정보를 클립보드로 복사
   ```bash
   pbcopy < ~/.clasprc.json
   ```
5. GitHub 저장소 → **Settings → Secrets and variables → Actions → New repository secret**
   - Name: `CLASPRC_JSON`
   - Secret: 복사한 내용 붙여넣기 → Add secret
6. 끝. (이 파일은 구글 계정 열쇠라서 채팅·메일·저장소에 절대 붙이지 마세요. Secret에만 넣어요.)

## 2. 처음 배포 전 확인 (한 번)
저장소의 `apps-script/` 코드는 Claude 앱에서 마지막으로 받은 버전이에요. 지금 배포된 코드와 다를 수 있어서, main에 처음 합치기 전에 비교해 두면 안전해요.
- 맥에서:
  ```bash
  mkdir -p ~/tmp-clasp && cd ~/tmp-clasp && clasp clone 1l89zKcHfVR8x17LagQ7DeRbY7AcmOC_ZgIaxpyuIpNyVqNn6efq7uabP
  ```
  받은 `Code.js`, `Index.html`을 클라우드 세션에 올려 "비교해줘"라고 하면 돼요.
- 또는 Apps Script 편집기에서 두 파일 내용을 복사해서 주셔도 돼요.

## 3. 평소 작업
1. 클라우드 세션에서 Claude에게 수정 요청 → 미리보기 캡처로 확인 → 작업 브랜치에 푸시
2. GitHub에서 PR을 만들고 main에 합치기 (아이패드에서도 GitHub 앱/사파리로 가능)
3. `apps-script/`가 바뀌었으면 Actions가 1~2분 안에 **같은 배포(주소 유지)**로 올려요. 결과는 저장소 **Actions** 탭에서 확인
4. `index.html`·아이콘은 GitHub Pages가 1~2분 뒤 반영 (아이폰은 캐시로 더 늦을 수 있음)

수동으로 다시 배포하려면: Actions 탭 → "Apps Script 배포" → Run workflow.

## 4. 단축어로 알림 바로 보내기 (구글 폼 대신)
알림 한 건을 웹앱으로 바로 보내면, 분류규칙에 맞는 건 즉시 `미확인` 전표가 되고 나머지는 앱의 수신함에 대기로 남아요.
1. Apps Script 편집기에서 `makeIngestKey` 실행 → 실행 로그의 **단축어 키** 복사 (앱 접속 키와 별개라, 단축어에 넣어도 장부는 못 봐요)
2. 단축어에 **URL 콘텐츠 가져오기** 동작 추가
   - URL: `https://script.google.com/macros/s/AKfycbw37FbwCQG84QMFl3i5w_ZhWj44Nb5zCpn1oqgyyRPHiVQLoUPSKcYMyCmXDQrwAL7i1Q/exec`
   - 방법: `POST`, 요청 본문: `JSON`
   - 필드 `k` = 단축어 키(텍스트), `text` = 알림 원문(변수)
3. (선택) 결과의 `msg`를 **알림 보기**로 띄우면 "전표 12번 · 스타벅스 5,000원 (식비 / 미지급금_신용카드)" 같은 확인이 떠요
4. 결과 `status`: `처리됨`(전표 생성) / `대기`(규칙 없음·금액 없음·취소 알림 → 앱에서 처리) / `중복`(같은 원문이 이미 있음)
- 받은 알림은 가계부 파일의 `수신함` 시트에 쌓여요(첫 알림 때 자동으로 생겨요).
- 예약 작업 "가계부 수신함 정리" 지시문에 **가계부 파일의 `수신함` 시트 대기 건도 처리**하라고 추가해 주세요(Claude 앱에서).

## 문제가 생기면
| 증상 | 해결 |
|---|---|
| Actions가 `CLASPRC_JSON이 없어요`로 실패 | 1-5단계 Secret 등록 |
| `invalid_grant`, 로그인 만료 | 맥에서 `clasp login` 다시 → 1-4·1-5단계로 Secret 덮어쓰기 |
| `User has not enabled the Apps Script API` | 1-1단계 |
| 급하게 맥에서 직접 배포 | `cd apps-script && clasp push && clasp deploy -i AKfycbw37FbwCQG84QMFl3i5w_ZhWj44Nb5zCpn1oqgyyRPHiVQLoUPSKcYMyCmXDQrwAL7i1Q -d "설명"` (`-i` 꼭 붙이기) |

## 알아둘 점
- 저장소가 공개라서 `apps-script/` 코드, 시트 ID, 스크립트·배포 ID(=웹앱 주소)가 공개돼요. 시트는 공유돼 있지 않아 ID만으로 열 수 없고, 웹앱은 접속 키가 없으면 열리지 않아요. 접속 키는 스크립트 속성에만 있어요.
- GitHub Secret은 공개 저장소에서도 밖으로 보이지 않고, 다른 사람이 포크해서 보낸 PR에는 전달되지 않아요.
- 장부 데이터 수정, 정산, 분류 규칙, 예약 작업은 계속 Claude 앱에서 하세요.

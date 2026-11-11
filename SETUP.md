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

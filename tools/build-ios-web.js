// iOS 앱에 넣을 화면·엔진 만들기: ios/Web/index.html, ios/Web/engine.js
// 사용법: node tools/build-ios-web.js   (저장소 루트에서. GitHub Actions의 iOS 빌드도 이걸 써요)
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const out = path.join(root, 'ios', 'Web');
fs.mkdirSync(out, { recursive: true });

// 엔진: 가짜 시트(pre) + 서버 코드 그대로(Code.gs) + 앱용 입구(post)
const pre = fs.readFileSync(path.join(root, 'ios', 'engine', 'pre.js'), 'utf8');
const code = fs.readFileSync(path.join(root, 'apps-script', 'Code.gs'), 'utf8');
const post = fs.readFileSync(path.join(root, 'ios', 'engine', 'post.js'), 'utf8');
fs.writeFileSync(path.join(out, 'engine.js'), pre + '\n' + code + '\n' + post);

// 화면: 웹과 같은 Index.html. 맨 앞에 엔진을 불러와요(앱이 __LEDGER_LOCAL·__LEDGER_DATA를 먼저 넣어 줌)
const html = fs.readFileSync(path.join(root, 'apps-script', 'Index.html'), 'utf8');
if (!html.includes('<head>')) throw new Error('Index.html에 <head>가 없어요');
fs.writeFileSync(path.join(out, 'index.html'), html.replace('<head>', '<head>\n<script src="engine.js"></script>'));
console.log('ios/Web: index.html, engine.js 만들었어요');

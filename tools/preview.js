const { chromium } = require('playwright');
const fs = require('fs');
// 사용법: node tools/preview.js [demo]   (저장소 루트에서 실행, 결과는 tools/out/)
const path = require('path');
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
process.chdir(OUT);
const html = fs.readFileSync(path.join(__dirname, '..', 'apps-script', 'Index.html'), 'utf8');
const J = [
 [1,'2026-11-03','보통예금_신한(주거래)','자본금',3035580,'기초잔액',202611,'자산','자본','OK','확인'],
 [2,'2026-11-03','보통예금_신한(여행자금)','자본금',303092,'기초잔액',202611,'자산','자본','OK','확인'],
 [3,'2026-11-03','보통예금_우리(Npay)','자본금',2288391,'기초잔액',202611,'자산','자본','OK','확인'],
 [4,'2026-11-03','보통예금_토스','자본금',195123,'기초잔액',202611,'자산','자본','OK','확인'],
 [5,'2026-11-03','보통예금_부산','자본금',882731,'기초잔액',202611,'자산','자본','OK','확인'],
 [6,'2026-11-03','보통예금_카카오뱅크','자본금',3003020,'기초잔액',202611,'자산','자본','OK','확인'],
 [7,'2026-11-03','정기적금_주택청약','자본금',5760000,'기초잔액',202611,'자산','자본','OK','확인'],
 [8,'2026-11-03','정기적금_신한알쓸','자본금',2400000,'기초잔액',202611,'자산','자본','OK','확인'],
 [9,'2026-11-03','정기적금_신한청년','자본금',600000,'기초잔액',202611,'자산','자본','OK','확인'],
 [10,'2026-11-03','투자_토스증권','자본금',2358497,'기초잔액',202611,'자산','자본','OK','확인'],
 [11,'2026-11-03','대여금','자본금',10000000,'기초잔액',202611,'자산','자본','OK','확인'],
 [12,'2026-11-03','자본금','미지급금_신용카드',352691,'기초잔액_10월대금',202611,'자본','부채','OK','확인'],
 [13,'2026-11-03','자본금','미지급금_신용카드',34320,'기초잔액_11월대금',202611,'자본','부채','OK','확인'],
 [14,'2026-11-04','보통예금_신한(주거래)','보통예금_토스',195123,'통장 간 이체 (알림: 입금 195,123원 이동주 입출금(5929) 11.04 13:51)',202611,'자산','자산','OK','확인'],
 ...Array.from({length:20},()=>['','','','','','','','','','',''])
];
const extra = process.argv[2]==='demo';
if (extra) { J.push([15,'2026-11-04','식비','미지급금_신용카드',12000,'점심',202611,'비용','부채','OK','미확인']); J.push([16,'2026-11-04','식비','없는계정',5000,'오타',202611,'비용','','오류','미확인']); }
const A = [[101,'현금','자산','차변','현금및예금'],[102,'보통예금_신한(주거래)','자산','차변','현금및예금'],[103,'보통예금_신한(여행자금)','자산','차변','현금및예금'],[104,'보통예금_우리(Npay)','자산','차변','현금및예금'],[105,'보통예금_토스','자산','차변','현금및예금'],[106,'보통예금_부산','자산','차변','현금및예금'],[107,'보통예금_카카오뱅크','자산','차변','현금및예금'],[121,'대여금','자산','차변','기타자산'],[151,'정기적금_주택청약','자산','차변','적금'],[152,'정기적금_신한알쓸','자산','차변','적금'],[153,'정기적금_신한청년','자산','차변','적금'],[171,'투자_토스증권','자산','차변','투자자산'],[201,'미지급금_신용카드','부채','대변','부채'],[202,'대출금','부채','대변','부채'],[301,'자본금','자본','대변','자본'],[401,'급여','수익','대변','수익'],[402,'이자수익','수익','대변','수익'],[403,'기타수익','수익','대변','수익'],[501,'식비','비용','차변','비용'],[502,'교통비','비용','차변','비용'],[511,'기타비용','비용','차변','비용']];
if (extra) { J.push([17,'2026-11-05','교통비','미지급금_신용카드',1550,'카카오T',202611,'비용','부채','OK','미확인','[신한카드(0534)승인] 승인금액 1,550원 가맹점명: 카카오T']); J.push([18,'2026-11-05','식비','미지급금_신용카드',8900,'신한카드(0534) 김밥천국',202611,'비용','부채','OK','미확인']); J.push([20,'2026-11-05','식비','미지급금_신용카드',8900,'김밥천국 (중복)',202611,'비용','부채','OK','무효','']); J.push([19,'2026-11-02','문화여가','미지급금_신용카드',15000,'영화',202611,'비용','부채','OK','확인','[신한카드(0534)승인] 승인금액 15,000원 가맹점명: CGV 대구']); }
const IB = extra ? { id:'IBX', gid:0, rows:[
 [8,'2026-11-05 00:00','[신한카드(0534)승인] 이*주\n- 승인금액: 4,300원(일시불)\n- 승인일시: 11/04 21:03\n- 가맹점명: 지에스25 불로센터점\n- 누적금액: 391,311원','처리됨','15','추정: 편의점이라 식비로 분류'],
 [9,'2026-11-05 09:12','출금\n352,691원 신한카드 입출금(5929)\n11.05 09:12 잔액 2,728,012원','',''],
 [10,'2026-11-05 09:12','출금\n352,691원 신한카드 입출금(5929)\n11.05 09:12 잔액 2,728,012원','',''],
 [11,'2026-11-04 13:51','입금\n195,123원 이동주 입출금(5929)\n11.04 13:51','보류','','통장을 특정할 수 없음(신한 계좌 2개)'],
 [12,'2026-11-04 13:51','입금\n195,123원 이동주 입출금(5929)\n11.04 13:51','중복','','']]} : undefined;
const raw = { journal:J, journalGid:1449833504, accounts:A, spreadsheetId:'X', at:'2026-11-04 16:50', inbox:IB, rules: extra ? [['지에스25','식비','미지급금_신용카드','편의점 간식']] : [] };
const mock = `<script>window.google={script:{run:(function mk(){let s,f;const o={withSuccessHandler(x){s=x;return o},withFailureHandler(x){f=x;return o},getData(){setTimeout(()=>s(JSON.parse(JSON.stringify(${JSON.stringify(raw)}))),50)}};return new Proxy({}, {get(_,k){const n={...o}; let ss,ff; n.withSuccessHandler=(x)=>{ss=x;return n}; n.withFailureHandler=(x)=>{ff=x;return n}; n.getData=()=>setTimeout(()=>ss(JSON.parse(JSON.stringify(${JSON.stringify(raw)}))),50); return n[k];}})})()}};</script>`;
fs.writeFileSync('page.html', html.replace('<head>', '<head>' + mock));
(async () => {
  const b = await chromium.launch();
  const errs = [];
  for (const [name, vp] of [['pc',{width:1440,height:900}],['m',{width:390,height:844}]]) {
    const p = await b.newPage({ viewport: vp });
    p.on('pageerror', e => errs.push(name+': '+e.message)); p.on('console', m => { if (m.type()==='error') errs.push(name+': '+m.text()); });
    await p.goto('file://' + process.cwd() + '/page.html'); await p.waitForTimeout(400);
    const tag = extra?'demo_':'';
    await p.screenshot({ path: tag+name + '_summary.png' });
    for (const v of ['bs','is','trial','journal','ledger','monthly']) {
      await p.evaluate((v)=>go(v), v); await p.waitForTimeout(150);
      await p.screenshot({ path: tag+name + '_' + v + '.png', fullPage: false });
    }
    await p.evaluate(()=>go('journal')); await p.click('#view [data-entry]'); await p.waitForTimeout(350);
    await p.screenshot({ path: tag+name + '_drawer.png' });
    if (extra) {
      await p.evaluate(()=>editEntry(Number(document.querySelector('#view [data-entry]').dataset.entry))); await p.waitForTimeout(350);
      await p.screenshot({ path: tag+name + '_form_edit.png' });
      await p.evaluate(()=>entryFromInbox(9)); await p.waitForTimeout(350);
      await p.screenshot({ path: tag+name + '_form_inbox.png' });
      await p.evaluate(()=>closeEntry());
    }
    const txt = await p.evaluate(()=>{go('bs'); return document.querySelector('.fs').innerText;});
    if (name==='pc') console.log(txt);
    await p.close();
  }
  console.log('ERRORS', errs);
  await b.close();
})();

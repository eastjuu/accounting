/**
 * 가계부 웹앱 - 서버 코드
 * 구글 시트(복식부기_가계부)의 분개장과 계정과목표를 읽어 화면으로 보냅니다.
 * 조회 + 일부 쓰기: 확인 처리, 전표 수정, 수신함 알림을 전표로 만들기.
 * 쓸 때는 잠금을 걸고, 행의 전표번호가 맞는지 확인한 뒤 쓰며, 모든 변경을 '변경이력' 시트에 남깁니다.
 *
 * 접근 보호: 주소 끝에 ?k=비밀키 가 맞아야만 화면과 데이터가 열립니다.
 * 비밀키는 처음 한 번 makeKey()를 실행해서 만듭니다.
 */
const SPREADSHEET_ID = '1loAjxb7UOuZGwQX50ExM9ZztUFNQnzfAp8IdtysqwZA';
/** 알림 수신함(구글 폼 응답 시트) */
const INBOX_ID = '1mp08Aj5-zcdjT1ZkP0TqSYigPo94ZPkW1Puw828UDhg';

function doGet(e) {
  const ok = checkKey_(e && e.parameter && e.parameter.k);
  const out = ok
    ? HtmlService.createHtmlOutputFromFile('Index')
    : HtmlService.createHtmlOutput('<div style="font-family:sans-serif;text-align:center;margin-top:30vh;color:#666">🔒 잠긴 페이지예요.</div>');
  return out
    .setTitle('가계부')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    // GitHub Pages 껍데기 페이지 안에 띄울 수 있게 허용
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/** 화면이 호출: 키가 맞을 때만 분개장(A:L)과 계정과목표(A:E)를 돌려줍니다. */
function getData(key) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const conv = (v) => (v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v);
  const read = (name, cols) => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('시트를 찾을 수 없어요: ' + name);
    const last = sh.getLastRow();
    const n = Math.min(cols, sh.getMaxColumns());   // 열이 모자라면 빈칸으로 채워요
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues().map((r) => r.map(conv).concat(Array(cols - n).fill('')));
    return { rows: rows, gid: sh.getSheetId() };
  };
  const journal = read('분개장', 12);
  const accounts = read('계정과목표', 5);
  return {
    journal: journal.rows,
    journalGid: journal.gid,
    accounts: accounts.rows,
    spreadsheetId: SPREADSHEET_ID,
    inbox: readInbox_(),
    rules: readRules_(ss),
    at: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
  };
}

/** 수신함 첫 번째 시트의 A~E열(타임스탬프, 알림 원문, 처리상태, 전표번호, 메모). 실패해도 장부 화면은 열리게 오류만 돌려줘요. */
function readInbox_() {
  try {
    const ss = SpreadsheetApp.openById(INBOX_ID);
    const sh = ss.getSheets()[0];
    const tz = ss.getSpreadsheetTimeZone();
    const last = sh.getLastRow();
    const cols = Math.min(5, sh.getMaxColumns());
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, cols).getValues().map((r, i) => {
      const at = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd HH:mm') : String(r[0] || '');
      return [i + 2, at, String(r[1] || ''), String(r[2] || ''), String(r[3] || ''), String(r[4] || '')];
    });
    return { id: INBOX_ID, gid: sh.getSheetId(), rows: rows };
  } catch (err) {
    return { error: String((err && err.message) || err) };
  }
}

/* ===================== 분류 규칙 ===================== */
/** '분류규칙' 시트: A 키워드 / B 차변계정 / C 대변계정 / D 비고 / E 추가일 / F 기본 적요. 알림 원문에 키워드가 있으면 그 계정·적요로 분류해요. */
const RULES = '분류규칙';
function rulesSheet_(ss) {
  let sh = ss.getSheetByName(RULES);
  if (!sh) {
    sh = ss.insertSheet(RULES);
    sh.getRange(1, 1, 1, 6).setValues([['키워드', '차변계정', '대변계정', '비고', '추가일', '기본 적요']]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  header_(sh, 6, '기본 적요');
  return sh;
}
function readRules_(ss) {
  const sh = ss.getSheetByName(RULES);
  if (!sh || sh.getLastRow() < 2) return [];
  const n = Math.min(6, sh.getMaxColumns());
  return sh.getRange(2, 1, sh.getLastRow() - 1, n).getDisplayValues()
    .filter((r) => String(r[0]).trim())
    .map((r) => [r[0], r[1], r[2], n >= 6 ? r[5] : '']);   // 키워드, 차변, 대변, 기본 적요
}
function upsertRule_(ss, keyword, debit, credit, desc) {
  const sh = rulesSheet_(ss);
  const kw = String(keyword).trim();
  const last = sh.getLastRow();
  const keys = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getDisplayValues().map((r) => String(r[0]).trim().toLowerCase());
  const i = keys.indexOf(kw.toLowerCase());
  const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  desc = String(desc || '').trim();
  if (i >= 0) {
    sh.getRange(i + 2, 2, 1, 4).setValues([[debit, credit, '앱에서 수정', today]]);
    sh.getRange(i + 2, 6).setValue(desc);
  } else sh.appendRow([kw, debit, credit, '앱에서 추가', today, desc]);
}
/** 1행 제목 칸이 비어 있으면 채워요 (새 열을 처음 쓸 때). */
function header_(sh, col, title) {
  if (sh.getMaxColumns() < col) sh.insertColumnsAfter(sh.getMaxColumns(), col - sh.getMaxColumns());
  const c = sh.getRange(1, col);
  if (!String(c.getDisplayValue()).trim()) c.setValue(title).setFontWeight('bold');
}

/* ===================== 쓰기 ===================== */
const COL_CONFIRM = 11;   // K열
const COL_NOTE = 12;      // L열 메모(알림 원문 등). 적요(F)는 사람이 쓰거나 추천값
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
/** 앱이 알고 있는 행과 지금 시트의 행이 같은 전표인지 확인해요(행이 밀렸으면 거부). */
function checkRow_(sh, row, no) {
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('분개장 ' + row + '행을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');
  const cur = String(sh.getRange(row, 1).getDisplayValue()).trim();
  if (cur !== String(no == null ? '' : no).trim()) throw new Error('시트의 ' + row + '행이 바뀌었어요(전표번호 ' + cur + '). 새로고침 후 다시 시도해 주세요.');
  return row;
}
/** 입력값 검사: 날짜 yyyy-mm-dd, 계정과목표에 있는 계정, 0보다 큰 금액. */
function clean_(ss, f) {
  const names = new Set(ss.getSheetByName('계정과목표').getRange('B2:B').getValues().map((r) => String(r[0]).trim()).filter(String));
  const date = String(f.date || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('날짜를 확인해 주세요.');
  const debit = String(f.debit || '').trim(), credit = String(f.credit || '').trim();
  if (!names.has(debit)) throw new Error('차변 계정이 계정과목표에 없어요: ' + debit);
  if (!names.has(credit)) throw new Error('대변 계정이 계정과목표에 없어요: ' + credit);
  if (debit === credit) throw new Error('차변과 대변이 같은 계정이에요.');
  const amount = Math.round(Number(String(f.amount).replace(/[^\d.-]/g, '')));
  if (!(amount > 0)) throw new Error('금액은 0보다 커야 해요.');
  const confirm = f.confirm === '확인' ? '확인' : '미확인';
  // memo = 적요(F열), note = 메모(L열)
  return { date: date, debit: debit, credit: credit, amount: amount, memo: String(f.memo || '').trim(), confirm: confirm, note: String(f.note || '').trim() };
}
function log_(ss, action, row, before, after) {
  let sh = ss.getSheetByName('변경이력');
  if (!sh) { sh = ss.insertSheet('변경이력'); sh.appendRow(['시각', '작업', '분개장 행', '변경 전', '변경 후']); sh.setFrozenRows(1); }
  sh.appendRow([new Date(), action, row, before ? JSON.stringify(before) : '', after ? JSON.stringify(after) : '']);
}

/** 확인 상태 바꾸기. items: [{row, no}], value: '확인' 또는 '미확인' */
function setConfirm(key, items, value) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  value = value === '확인' ? '확인' : '미확인';
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    (items || []).forEach((it) => checkRow_(sh, it.row, it.no));   // 모두 맞을 때만 씀
    (items || []).forEach((it) => {
      const cell = sh.getRange(Number(it.row), COL_CONFIRM);
      const before = cell.getDisplayValue();
      if (before !== value) { cell.setValue(value); log_(ss, '확인 상태', Number(it.row), before, value); }
    });
    return { n: (items || []).length };
  });
}

/** 기존 전표 수정 (B~F열, K열, L열) */
function updateEntry(key, row, no, f) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    row = checkRow_(sh, row, no);
    const v = clean_(ss, f);
    header_(sh, COL_NOTE, '메모');
    const before = sh.getRange(row, 1, 1, COL_NOTE).getDisplayValues()[0];
    sh.getRange(row, 2, 1, 5).setValues([[v.date, v.debit, v.credit, v.amount, v.memo]]);
    sh.getRange(row, COL_CONFIRM).setValue(v.confirm);
    sh.getRange(row, COL_NOTE).setValue(v.note);
    log_(ss, '전표 수정', row, before, v);
    return { row: row };
  });
}

/** 새 전표 추가. ib가 있으면 수신함의 그 알림을 '처리됨'으로 표시해요. ib: {row, at} */
function addEntry(key, f, ib) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    const v = clean_(ss, f);
    let ish = null, irow = 0;
    if (ib && ib.row) {
      ish = SpreadsheetApp.openById(INBOX_ID).getSheets()[0];
      irow = Number(ib.row);
      if (String(ish.getRange(irow, 3).getDisplayValue()).trim() === '처리됨') throw new Error('이미 처리된 알림이에요. 새로고침해 주세요.');
    }
    // 마지막 데이터 행(B~F 중 하나라도 값이 있는 행)과 다음 전표번호. A열은 자동번호 수식이라 판단에서 빼요
    const last = Math.max(1, sh.getLastRow());
    const vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, 6).getValues();
    let lastData = 1, maxNo = 0;
    vals.forEach((r, i) => {
      if (r.slice(1).some((x) => x !== '' && x !== null)) lastData = i + 2;
      const n = Number(r[0]); if (n > maxNo) maxNo = n;
    });
    let no = maxNo + 1;
    const row = lastData + 1;
    // 쓰기 전에 그 행이 정말 비어 있는지 한 번 더 확인 (다른 전표를 덮어쓰지 않게)
    if (sh.getRange(row, 2, 1, 5).getValues()[0].some((x) => x !== '' && x !== null)) throw new Error('분개장 ' + row + '행이 비어 있지 않아요. 새로고침 후 다시 시도해 주세요.');
    if (sh.getRange(row, 1).getFormula()) {
      // A열 자동번호 수식은 그대로 두고 B~F만 써요
      sh.getRange(row, 2, 1, 5).setValues([[v.date, v.debit, v.credit, v.amount, v.memo]]);
    } else {
      sh.getRange(row, 1, 1, 6).setValues([[no, v.date, v.debit, v.credit, v.amount, v.memo]]);
    }
    sh.getRange(row, COL_CONFIRM).setValue(v.confirm);
    if (v.note) { header_(sh, COL_NOTE, '메모'); sh.getRange(row, COL_NOTE).setValue(v.note); }
    SpreadsheetApp.flush();
    no = Number(sh.getRange(row, 1).getDisplayValue()) || no;
    // G~J열: 바로 위 행이 수식이면 같은 수식을 이어 붙여요(이미 값·수식이 있으면 그대로)
    if (lastData >= 2) {
      const src = sh.getRange(lastData, 7, 1, 4).getFormulasR1C1()[0];
      const tgt = sh.getRange(row, 7, 1, 4);
      const tf = tgt.getFormulasR1C1()[0], tv = tgt.getValues()[0];
      src.forEach((fm, j) => { if (fm && !tf[j] && tv[j] === '') sh.getRange(row, 7 + j).setFormulaR1C1(fm); });
    }
    if (ish) {
      const memo = String(ish.getRange(irow, 5).getDisplayValue()).trim();
      ish.getRange(irow, 3, 1, 3).setValues([['처리됨', no, (memo ? memo + ' / ' : '') + '앱에서 직접 입력']]);
    }
    if (f.rule && String(f.rule.keyword || '').trim()) {
      upsertRule_(ss, f.rule.keyword, v.debit, v.credit, f.rule.desc);
      log_(ss, '분류 규칙', '', null, { keyword: String(f.rule.keyword).trim(), debit: v.debit, credit: v.credit, desc: String(f.rule.desc || '').trim() });
    }
    log_(ss, '전표 추가' + (ish ? ' (수신함 ' + irow + '행)' : ''), row, null, Object.assign({ no: no }, v));
    return { row: row, no: no };
  });
}

function checkKey_(key) {
  const saved = PropertiesService.getScriptProperties().getProperty('APP_KEY');
  return !!saved && String(key || '') === saved;
}

/**
 * 처음 한 번만 실행: 비밀키를 새로 만들어 저장하고, 실행 로그에 보여줍니다.
 * 다시 실행하면 키가 바뀌어서 예전 키로는 열리지 않습니다(키가 새었을 때 사용).
 */
function makeKey() {
  const key = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  PropertiesService.getScriptProperties().setProperty('APP_KEY', key);
  Logger.log('비밀키: ' + key);
}

/* ===================== 1회용: 적요의 "(알림: …)"을 메모(L열)로 옮기기 ===================== */
/**
 * 편집기에서 실행. 1) splitMemoPreview() 로 바뀔 내용을 실행 로그에서 확인 → 2) splitMemoRun() 으로 실제 반영.
 * 적요(F)가 "제목 (알림: 원문)" 꼴이고 메모(L)가 비어 있는 행만 바꿔요. F는 "제목"만, L에는 "원문". 모든 변경은 변경이력에 남아요.
 */
function splitMemoPreview() { splitMemo_(false); }
function splitMemoRun() { splitMemo_(true); }
function splitMemo_(apply) {
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    const last = sh.getLastRow();
    if (last < 2) { Logger.log('분개장이 비어 있어요.'); return 0; }
    const n = Math.min(COL_NOTE, sh.getMaxColumns());
    const vals = sh.getRange(2, 1, last - 1, n).getDisplayValues();
    const re = /^([\s\S]*?)\s*\(알림\s*[:：]\s*([\s\S]*?)\)?\s*$/;
    const todo = [];
    vals.forEach((r, i) => {
      const memo = String(r[5] || ''), note = n >= COL_NOTE ? String(r[COL_NOTE - 1] || '').trim() : '';
      const m = re.exec(memo);
      if (!m || note) return;
      todo.push({ row: i + 2, no: r[0], before: memo, memo: m[1].trim(), note: m[2].trim() });
    });
    todo.forEach((t) => Logger.log('%s행(전표 %s)\n  적요: %s\n  메모: %s', t.row, t.no, t.memo || '(빈칸)', t.note));
    Logger.log('%s건 %s', todo.length, apply ? '반영했어요.' : '바뀔 예정이에요. 맞으면 splitMemoRun()을 실행하세요.');
    if (!apply || !todo.length) return todo.length;
    header_(sh, COL_NOTE, '메모');
    todo.forEach((t) => {
      sh.getRange(t.row, 6).setValue(t.memo);
      sh.getRange(t.row, COL_NOTE).setValue(t.note);
      log_(ss, '적요→메모 분리', t.row, { memo: t.before }, { memo: t.memo, note: t.note });
    });
    return todo.length;
  });
}

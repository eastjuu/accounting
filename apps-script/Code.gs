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

/** 화면이 호출: 키가 맞을 때만 분개장(A:L)과 계정과목표(A:G)를 돌려줍니다. 계정과목표 F는 안내 문구, G는 사용 여부. */
function getData(key) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const conv = (v) => cell_(v, tz);
  const read = (name, cols) => {
    const sh = ss.getSheetByName(name);
    if (!sh) throw new Error('시트를 찾을 수 없어요: ' + name);
    const last = sh.getLastRow();
    const n = Math.min(cols, sh.getMaxColumns());   // 열이 모자라면 빈칸으로 채워요
    const rows = last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues().map((r) => r.map(conv).concat(Array(cols - n).fill('')));
    return { rows: rows, gid: sh.getSheetId() };
  };
  const journal = read('분개장', COL_GRP);
  return {
    journal: journal.rows,
    journalGid: journal.gid,
    accounts: accountsOut_(ss),
    spreadsheetId: SPREADSHEET_ID,
    inbox: readInbox_(ss, { journal: journal.rows, rules: readRules_(ss), accounts: accountsOut_(ss) }),
    rules: readRules_(ss),
    at: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
  };
}

/** 계정과목표 A~G (getData와 계정 설정 저장 뒤에 같이 써요) */
function accountsOut_(ss) {
  const sh = ss.getSheetByName('계정과목표');
  const tz = ss.getSpreadsheetTimeZone();
  const last = sh.getLastRow();
  const n = Math.min(COL_ACCT_USE, sh.getMaxColumns());
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, n).getValues().map((r) => r.map((v) => cell_(v, tz)).concat(Array(COL_ACCT_USE - n).fill('')));
}
/** 날짜 칸은 yyyy-mm-dd 문자열로 (getData와 바뀐 행 돌려주기에서 같이 써요) */
function cell_(v, tz) { return v instanceof Date ? Utilities.formatDate(v, tz, 'yyyy-MM-dd') : v; }
/** 분개장의 지정한 행들(A~L)을 getData와 같은 모양으로: [[행, [값…]], …]. 저장 뒤 앱이 전체를 다시 부르지 않고 이 행만 바꿔요. */
function rowsOut_(sh, tz, rows) {
  rows = rows.map(Number).filter((r) => r >= 2);
  if (!rows.length) return [];
  SpreadsheetApp.flush();   // 방금 쓴 값과 G~J 수식 결과가 반영된 뒤 읽어요
  const lo = Math.min.apply(null, rows), hi = Math.max.apply(null, rows);
  const n = Math.min(COL_GRP, sh.getMaxColumns());
  const pad = (r) => r.map((v) => cell_(v, tz)).concat(Array(COL_GRP - n).fill(''));
  if (hi - lo > 60) return rows.map((r) => [r, pad(sh.getRange(r, 1, 1, n).getValues()[0])]);   // 멀리 떨어진 행은 따로 읽어요
  const vals = sh.getRange(lo, 1, hi - lo + 1, n).getValues();
  return rows.map((r) => [r, pad(vals[r - lo])]);
}

/* ===================== 알림 수신함 ===================== */
/**
 * 수신함은 두 곳이에요.
 *  1) 예전: 구글 폼 응답 파일(INBOX_ID)의 첫 시트. 앱에서의 행 번호 = 양수(시트 행).
 *  2) 지금: 가계부 파일 안 '수신함' 시트. 단축어가 doPost로 바로 보내요. 앱에서의 행 번호 = 음수(-시트 행).
 * 열은 둘 다 A 타임스탬프 / B 알림 원문 / C 처리상태 / D 전표번호 / E 메모.
 */
const INBOX_SHEET = '수신함';
function inboxRows_(sh, tz, sign) {
  const last = sh.getLastRow();
  const cols = Math.min(5, sh.getMaxColumns());
  if (last < 2) return [];
  return sh.getRange(2, 1, last - 1, cols).getValues().map((r, i) => inboxRow_(r, tz, sign * (i + 2)));
}
function inboxRow_(r, tz, id) {
  const at = r[0] instanceof Date ? Utilities.formatDate(r[0], tz, 'yyyy-MM-dd HH:mm') : String(r[0] || '');
  return [id, at, String(r[1] || ''), String(r[2] || ''), String(r[3] || ''), String(r[4] || '')];
}
/**
 * 수신함 읽기. 가계부 안 '수신함' 시트가 있으면 그것만 읽어요(예전 수신함 기록은 시트를 만들 때 옮겨 둠 → 파일을 하나만 열어 빨라요).
 * 아직 없으면(단축어가 구글 폼으로 보내는 동안) 예전 수신함 파일을 읽어요.
 * 대기(처리상태 빈칸) 알림에는 서버 추천 분개(sug)를 7번째 값으로 붙여요 — 앱의 '전표로 만들기'가 이걸 써요.
 */
function readInbox_(ss, ctx) {
  const out = { rows: [] };
  const lsh = ss.getSheetByName(INBOX_SHEET);
  try {
    if (lsh) {
      out.id = SPREADSHEET_ID; out.gid = lsh.getSheetId(); out.id2 = SPREADSHEET_ID; out.gid2 = lsh.getSheetId();
      out.rows = inboxRows_(lsh, ss.getSpreadsheetTimeZone(), -1);
    } else {
      const iss = SpreadsheetApp.openById(INBOX_ID);
      const sh = iss.getSheets()[0];
      out.id = INBOX_ID; out.gid = sh.getSheetId();
      out.rows = inboxRows_(sh, iss.getSpreadsheetTimeZone(), 1);
    }
  } catch (e) { return { error: String((e && e.message) || e) }; }
  if (ctx) out.rows.forEach((r) => { if (!r[3] && r[2]) { try { r.push(guess_(ss, r[2], ss.getSpreadsheetTimeZone(), ctx)); } catch (e) {} } });
  return out;
}
/** 앱의 수신함 행 번호 → {sh, row, id, tz} */
function inboxRef_(ss, id) {
  id = Number(id);
  if (id < 0) {
    const sh = ss.getSheetByName(INBOX_SHEET);
    if (!sh || -id > sh.getLastRow()) throw new Error('수신함 행을 찾을 수 없어요. 새로고침해 주세요.');
    return { sh: sh, row: -id, id: id, tz: ss.getSpreadsheetTimeZone() };
  }
  const iss = SpreadsheetApp.openById(INBOX_ID);
  const sh = iss.getSheets()[0];
  if (!(id >= 2 && id <= sh.getLastRow())) throw new Error('수신함 행을 찾을 수 없어요. 새로고침해 주세요.');
  return { sh: sh, row: id, id: id, tz: iss.getSpreadsheetTimeZone() };
}
function inboxOut_(ref) {
  const n = Math.min(5, ref.sh.getMaxColumns());
  const r = ref.sh.getRange(ref.row, 1, 1, n).getValues()[0];
  return inboxRow_(r, ref.tz, ref.id);
}
function inboxSheet_(ss) {
  let sh = ss.getSheetByName(INBOX_SHEET);
  if (!sh) {
    sh = ss.insertSheet(INBOX_SHEET);
    sh.getRange(1, 1, 1, 5).setValues([['타임스탬프', '알림 원문', '처리상태', '전표번호', '메모']]).setFontWeight('bold');
    sh.setFrozenRows(1);
    migrateInbox_(ss, sh);
  }
  return sh;
}
/** 가계부 안 수신함을 처음 만들 때: 예전 수신함(구글 폼) 기록을 그대로 옮겨요(빈 줄 제외). 예전 파일은 지우지 않고 보관용으로 남겨요. */
function migrateInbox_(ss, sh) {
  try {
    const old = SpreadsheetApp.openById(INBOX_ID).getSheets()[0];
    const last = old.getLastRow();
    if (last < 2) return 0;
    const n = Math.min(5, old.getMaxColumns());
    const rows = old.getRange(2, 1, last - 1, n).getValues()
      .filter((r) => String(r[0]).trim() || String(r[1]).trim())
      .map((r) => r.concat(Array(5 - n).fill('')));
    if (rows.length) sh.getRange(2, 1, rows.length, 5).setValues(rows);
    log_(ss, '수신함 옮기기 (예전 폼 수신함 → 가계부 수신함 시트)', '', null, { rows: rows.length });
    return rows.length;
  } catch (e) { return 0; }
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
    .map((r, i) => [r[0], r[1], r[2], n >= 6 ? r[5] : '', i + 2])   // 키워드, 차변, 대변, 기본 적요, 시트 행
    .filter((r) => String(r[0]).trim());
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
const COL_NOTE = 12;
const COL_GRP = 13;       // M열 묶음: 여러 줄 전표(복합분개)를 이루는 행들에 같은 값(첫 행의 전표번호)
/** K열 '무효' = 무효 처리된 전표. 행은 남기고 집계(시산표·월별합계 수식, 앱)에서만 빠져요. */
const VOID = '무효';      // L열 메모(알림 원문 등). 적요(F)는 사람이 쓰거나 추천값
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}
/** 앱이 알고 있는 행과 지금 시트의 행이 같은 전표인지 확인해요(행이 밀렸으면 거부). 그 행 A~L 표시값을 돌려줘요. */
function readRow_(sh, row, no) {
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('분개장 ' + row + '행을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');
  const n = Math.min(COL_GRP, sh.getMaxColumns());
  const v = sh.getRange(row, 1, 1, n).getDisplayValues()[0].concat(Array(COL_GRP - n).fill(''));
  checkNo_(row, v[0], no);
  return v;
}
function checkNo_(row, cur, no) {
  cur = String(cur).trim();
  if (cur !== String(no == null ? '' : no).trim()) throw new Error('시트의 ' + row + '행이 바뀌었어요(전표번호 ' + cur + '). 새로고침 후 다시 시도해 주세요.');
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
function log_(ss, action, row, before, after) { logMany_(ss, [[action, row, before, after]]); }
/** 변경이력 여러 줄을 한 번에 써요. items: [[작업, 행, 변경 전, 변경 후], …] */
function logMany_(ss, items) {
  if (!items.length) return;
  let sh = ss.getSheetByName('변경이력');
  if (!sh) { sh = ss.insertSheet('변경이력'); sh.appendRow(['시각', '작업', '분개장 행', '변경 전', '변경 후']); sh.setFrozenRows(1); }
  const now = new Date();
  const rows = items.map((x) => [now, x[0], x[1], x[2] ? JSON.stringify(x[2]) : '', x[3] ? JSON.stringify(x[3]) : '']);
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setValues(rows);
}

/** 확인 상태 바꾸기. items: [{row, no}], value: '확인' 또는 '미확인'. 읽기 1번 + 쓰기 1번으로 묶어요. */
function setConfirm(key, items, value) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  value = value === '확인' ? '확인' : '미확인';
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    const seen = {};
    items = (items || []).map((it) => ({ row: Number(it.row), no: it.no })).filter((it) => !seen[it.row] && (seen[it.row] = true));
    if (!items.length) return { n: 0, rows: [] };
    const last = sh.getLastRow();
    items.forEach((it) => { if (!(it.row >= 2 && it.row <= last)) throw new Error('분개장 ' + it.row + '행을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.'); });
    const lo = Math.min.apply(null, items.map((it) => it.row)), hi = Math.max.apply(null, items.map((it) => it.row));
    const block = sh.getRange(lo, 1, hi - lo + 1, COL_CONFIRM).getDisplayValues();
    items.forEach((it) => checkNo_(it.row, block[it.row - lo][0], it.no));   // 모두 맞을 때만 씀
    // 무효 전표는 확인 상태를 바꾸지 않아요 (무효 취소 먼저)
    const todo = items.map((it) => ({ row: it.row, before: block[it.row - lo][COL_CONFIRM - 1] })).filter((t) => t.before !== VOID && t.before !== value);
    if (todo.length) {
      sh.getRangeList(todo.map((t) => 'K' + t.row)).setValue(value);
      logMany_(ss, todo.map((t) => ['확인 상태', t.row, t.before, value]));
    }
    return { n: items.length, rows: rowsOut_(sh, ss.getSpreadsheetTimeZone(), items.map((it) => it.row)) };
  });
}

/** 기존 전표 수정 (B~F열, K열, L열) */
function updateEntry(key, row, no, f) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    header_(sh, COL_NOTE, '메모');
    const before = readRow_(sh, row, no);
    row = Number(row);
    if (String(before[COL_CONFIRM - 1]).trim() === VOID) throw new Error('무효 처리된 전표예요. 무효 취소 후 수정해 주세요.');
    if (String(before[COL_GRP - 1]).trim()) throw new Error('여러 줄 전표의 한 줄이에요. 새로고침 후 전표 전체로 수정해 주세요.');
    const v = clean_(ss, f);
    sh.getRange(row, 2, 1, 5).setValues([[v.date, v.debit, v.credit, v.amount, v.memo]]);
    sh.getRange(row, COL_CONFIRM, 1, 2).setValues([[v.confirm, v.note]]);   // K·L (G~J 수식은 건드리지 않아요)
    log_(ss, '전표 수정', row, before, v);
    return { row: row, rows: rowsOut_(sh, ss.getSpreadsheetTimeZone(), [row]) };
  });
}

/** 무효 처리(on=true) / 무효 취소(on=false). K열만 바꿔요. 취소하면 '미확인'으로 돌아가요. 묶음 전표면 묶음 전체를 함께 바꿔요. */
function voidEntry(key, row, no, on) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('분개장');
    const first = readRow_(sh, row, no);
    const rows = String(first[COL_GRP - 1]).trim() ? groupRows_(sh, first[COL_GRP - 1]) : [Number(row)];
    const after = on ? VOID : '미확인';
    const block = rowsDisp_(sh, rows);
    const todo = rows.filter((r) => { const b = String(block[r][COL_CONFIRM - 1]).trim(); return on ? b !== VOID : b === VOID; });
    if (todo.length) {
      sh.getRangeList(todo.map((r) => 'K' + r)).setValue(after);
      logMany_(ss, todo.map((r) => [on ? '전표 무효' : '무효 취소', r, block[r][COL_CONFIRM - 1], after]));
    }
    return { row: Number(row), rows: rowsOut_(sh, ss.getSpreadsheetTimeZone(), rows) };
  });
}
/** M열(묶음) 값이 grp인 행 번호들 */
function groupRows_(sh, grp) {
  grp = String(grp).trim();
  const last = sh.getLastRow();
  if (!grp || last < 2 || sh.getMaxColumns() < COL_GRP) return [];
  const out = [];
  sh.getRange(2, COL_GRP, last - 1, 1).getDisplayValues().forEach((r, i) => { if (String(r[0]).trim() === grp) out.push(i + 2); });
  return out;
}
/** 여러 행의 A~M 표시값 {행: [값…]} */
function rowsDisp_(sh, rows) {
  const out = {};
  if (!rows.length) return out;
  const n = Math.min(COL_GRP, sh.getMaxColumns());
  const lo = Math.min.apply(null, rows), hi = Math.max.apply(null, rows);
  const pad = (v) => v.concat(Array(COL_GRP - n).fill(''));
  if (hi - lo > 60) rows.forEach((r) => { out[r] = pad(sh.getRange(r, 1, 1, n).getDisplayValues()[0]); });
  else { const b = sh.getRange(lo, 1, hi - lo + 1, n).getDisplayValues(); rows.forEach((r) => { out[r] = pad(b[r - lo]); }); }
  return out;
}

/* ===================== 여러 줄 전표 (복합분개) ===================== */
/**
 * 차변·대변 여러 줄을 받아 "차변 1개 / 대변 1개" 쌍으로 나눠 분개장 여러 행에 쓰고, M열에 같은 묶음 값을 넣어요.
 * 시트 수식(시산표·월별합계·검증)은 행마다 차대가 맞으니 그대로 동작해요.
 * v: {date, memo, note, confirm, lines:[{side:'차'|'대', acct, amount}]}
 * 쌍 나누기: 차변 줄과 대변 줄을 순서대로 맞춰 가며 작은 금액만큼씩 떼어 내요(같은 입력이면 항상 같은 결과).
 */
function splitLines_(v) {
  const ls = (v.lines || []).map((l) => ({ side: l.side === '대' ? '대' : '차', acct: String(l.acct || '').trim(), amount: Math.round(Number(String(l.amount).replace(/[^\d.-]/g, ''))) }));
  if (ls.some((l) => !l.acct)) throw new Error('계정을 고르지 않은 줄이 있어요.');
  if (ls.some((l) => !(l.amount > 0))) throw new Error('금액이 0이거나 빈 줄이 있어요.');
  const dr = ls.filter((l) => l.side === '차').map((l) => Object.assign({}, l)), cr = ls.filter((l) => l.side === '대').map((l) => Object.assign({}, l));
  if (!dr.length || !cr.length) throw new Error('차변과 대변이 한 줄 이상씩 있어야 해요.');
  const sd = dr.reduce((s, l) => s + l.amount, 0), sc = cr.reduce((s, l) => s + l.amount, 0);
  if (sd !== sc) throw new Error('차변 합계(' + sd + ')와 대변 합계(' + sc + ')가 달라요.');
  if (dr.some((d) => cr.some((c) => c.acct === d.acct))) throw new Error('같은 계정이 차변과 대변에 모두 있어요.');
  if (ls.length > 20) throw new Error('한 전표는 20줄까지예요.');
  const pairs = [];
  let i = 0, j = 0;
  while (i < dr.length && j < cr.length) {
    const a = Math.min(dr[i].amount, cr[j].amount);
    pairs.push({ debit: dr[i].acct, credit: cr[j].acct, amount: a });
    dr[i].amount -= a; cr[j].amount -= a;
    if (!dr[i].amount) i++;
    if (!cr[j].amount) j++;
  }
  return pairs.map((p, k) => ({ date: v.date, debit: p.debit, credit: p.credit, amount: p.amount, memo: v.memo, note: k === 0 ? v.note : '', confirm: v.confirm }));
}
/**
 * 여러 줄 전표 저장. refs: 고칠 기존 행들 [{row, no}] (새 전표면 빈 배열). ib: 수신함 알림에서 만들 때.
 * - 기존 행은 순서대로 그 자리에서 고치고, 줄이 늘면 맨 아래에 추가, 줄면 남는 행은 무효 처리(묶음에서 빼요).
 * - 남은 행이 2개 이상이면 M열에 묶음 값(기존 묶음 값, 없으면 첫 행 전표번호). 1개면 M을 비워 일반 전표로.
 */
function saveVoucher(key, refs, v, ib) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tz = ss.getSpreadsheetTimeZone();
    const sh = ss.getSheetByName('분개장');
    const pairs = splitLines_(v).map((p) => clean_(ss, p));
    refs = (refs || []).map((r) => ({ row: Number(r.row), no: r.no }));
    const before = refs.map((r) => readRow_(sh, r.row, r.no));
    if (before.some((b) => String(b[COL_CONFIRM - 1]).trim() === VOID)) throw new Error('무효 처리된 전표예요. 무효 취소 후 수정해 주세요.');
    const grpOld = before.length ? String(before[0][COL_GRP - 1]).trim() : '';
    if (before.some((b) => String(b[COL_GRP - 1]).trim() !== grpOld)) throw new Error('묶음이 맞지 않아요. 새로고침 후 다시 시도해 주세요.');
    if (grpOld && groupRows_(sh, grpOld).length !== refs.length) throw new Error('묶음 행이 바뀌었어요. 새로고침 후 다시 시도해 주세요.');
    let ref = null, ibMemo = '';
    if (ib && ib.row) {
      ref = inboxRef_(ss, ib.row);
      const st = ref.sh.getRange(ref.row, 3, 1, 3).getDisplayValues()[0];
      if (String(st[0]).trim() === '처리됨') throw new Error('이미 처리된 알림이에요. 새로고침해 주세요.');
      ibMemo = String(st[2]).trim();
    }
    header_(sh, COL_NOTE, '메모');
    header_(sh, COL_GRP, '묶음');
    const logs = [];
    const keep = Math.min(refs.length, pairs.length);
    for (let i = 0; i < keep; i++) {
      const r = refs[i].row, p = pairs[i];
      sh.getRange(r, 2, 1, 5).setValues([[p.date, p.debit, p.credit, p.amount, p.memo]]);
      sh.getRange(r, COL_CONFIRM, 1, 2).setValues([[p.confirm, p.note]]);
      logs.push(['전표 수정 (여러 줄)', r, before[i], p]);
    }
    let added = [];
    if (pairs.length > keep) {
      added = writeEntries_(sh, tz, pairs.slice(keep));
      added.forEach((a, k) => logs.push(['전표 추가 (여러 줄)' + (ref ? ' (수신함 ' + (ref.id < 0 ? '시트 ' : '') + ref.row + '행)' : ''), a.row, null, Object.assign({ no: a.no }, pairs[keep + k])]));
    }
    const dropped = refs.slice(keep).map((r) => r.row);
    if (dropped.length) {
      sh.getRangeList(dropped.map((r) => 'K' + r)).setValue(VOID);
      sh.getRangeList(dropped.map((r) => 'M' + r)).setValue('');
      dropped.forEach((r, k) => logs.push(['전표 무효 (여러 줄 수정으로 줄 감소)', r, before[keep + k], { confirm: VOID, group: '' }]));
    }
    const active = refs.slice(0, keep).map((r) => r.row).concat(added.map((a) => a.row));
    SpreadsheetApp.flush();
    const nos = rowsOut_(sh, tz, active).map((x) => Number(x[1][0]));
    const grp = active.length > 1 ? (grpOld || String(nos[0])) : '';
    if (active.length > 1 || grpOld) sh.getRangeList(active.map((r) => 'M' + r)).setValue(grp);
    if (ref) ref.sh.getRange(ref.row, 3, 1, 3).setValues([['처리됨', nos.join(', '), (ibMemo ? ibMemo + ' / ' : '') + '앱에서 직접 입력']]);
    logMany_(ss, logs);
    return {
      row: active[0], no: nos[0], nos: nos,
      rows: rowsOut_(sh, tz, active.concat(dropped)),
      inbox: ref ? [inboxOut_(ref)] : undefined,
    };
  });
}

/** 새 전표 추가. ib가 있으면 수신함의 그 알림을 '처리됨'으로 표시해요. ib: {row(음수면 가계부 안 수신함), at} */
function addEntry(key, f, ib) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tz = ss.getSpreadsheetTimeZone();
    const sh = ss.getSheetByName('분개장');
    const v = clean_(ss, f);
    let ref = null, ibMemo = '';
    if (ib && ib.row) {
      ref = inboxRef_(ss, ib.row);
      const st = ref.sh.getRange(ref.row, 3, 1, 3).getDisplayValues()[0];
      if (String(st[0]).trim() === '처리됨') throw new Error('이미 처리된 알림이에요. 새로고침해 주세요.');
      ibMemo = String(st[2]).trim();
    }
    const out = writeEntry_(sh, tz, v);
    if (ref) ref.sh.getRange(ref.row, 3, 1, 3).setValues([['처리됨', out.no, (ibMemo ? ibMemo + ' / ' : '') + '앱에서 직접 입력']]);
    const logs = [];
    if (f.rule && String(f.rule.keyword || '').trim()) {
      upsertRule_(ss, f.rule.keyword, v.debit, v.credit, f.rule.desc);
      logs.push(['분류 규칙', '', null, { keyword: String(f.rule.keyword).trim(), debit: v.debit, credit: v.credit, desc: String(f.rule.desc || '').trim() }]);
    }
    logs.push(['전표 추가' + (ref ? ' (수신함 ' + (ref.id < 0 ? '시트 ' : '') + ref.row + '행)' : ''), out.row, null, Object.assign({ no: out.no }, v)]);
    logMany_(ss, logs);
    return {
      row: out.row, no: out.no, rows: out.rows,
      inbox: ref ? [inboxOut_(ref)] : undefined,
      rules: f.rule ? readRules_(ss) : undefined,
    };
  });
}

/**
 * 분개장 마지막 데이터 행(B~F 기준) 아래에 전표를 써요. 잠금 안에서만 불러요.
 * A열 자동번호·G~J 수식은 그대로 두고 B~F, K, L만 써요. 돌려주는 값: {row, no, rows}
 */
function writeEntry_(sh, tz, v) {
  const out = writeEntries_(sh, tz, [v])[0];
  return { row: out.row, no: out.no, rows: out.rows };
}
/** 여러 전표를 이어진 빈 행에 한 번에 써요. 돌려주는 값: [{row, no, rows}] */
function writeEntries_(sh, tz, vs) {
  const last = Math.max(1, sh.getLastRow());
  const vals = last < 2 ? [] : sh.getRange(2, 1, last - 1, 6).getValues();
  let lastData = 1, maxNo = 0;
  vals.forEach((r, i) => {
    if (r.slice(1).some((x) => x !== '' && x !== null)) lastData = i + 2;
    const n = Number(r[0]); if (n > maxNo) maxNo = n;
  });
  const row0 = lastData + 1, n = vs.length;
  // 쓰기 전에 그 행들이 정말 비어 있는지 (위에서 읽은 값으로 확인: lastData 아래는 B~F가 비어 있어요)
  for (let r = row0; r < row0 + n; r++) {
    if (r - 2 < vals.length && vals[r - 2].slice(1).some((x) => x !== '' && x !== null)) throw new Error('분개장 ' + r + '행이 비어 있지 않아요. 새로고침 후 다시 시도해 주세요.');
  }
  const fm = sh.getRange(row0, 1, n, 10).getFormulasR1C1();   // A, G~J 수식 여부
  if (fm.every((f) => f[0])) sh.getRange(row0, 2, n, 5).setValues(vs.map((v) => [v.date, v.debit, v.credit, v.amount, v.memo]));
  else vs.forEach((v, k) => {
    if (fm[k][0]) sh.getRange(row0 + k, 2, 1, 5).setValues([[v.date, v.debit, v.credit, v.amount, v.memo]]);
    else sh.getRange(row0 + k, 1, 1, 6).setValues([[maxNo + 1 + k, v.date, v.debit, v.credit, v.amount, v.memo]]);
  });
  if (vs.some((v) => v.note)) { header_(sh, COL_NOTE, '메모'); sh.getRange(row0, COL_CONFIRM, n, 2).setValues(vs.map((v) => [v.confirm, v.note || ''])); }
  else sh.getRange(row0, COL_CONFIRM, n, 1).setValues(vs.map((v) => [v.confirm]));
  // G~J열: 바로 위 행이 수식인데 이 행에 없으면 같은 수식을 이어 붙여요 (보통은 미리 채워져 있어 건너뜀)
  if (lastData >= 2 && fm.some((f) => f.slice(6, 10).some((x) => !x))) {
    const src = sh.getRange(lastData, 7, 1, 4).getFormulasR1C1()[0];
    const tv = sh.getRange(row0, 7, n, 4).getValues();
    fm.forEach((f, k) => src.forEach((s, j) => { if (s && !f[6 + j] && tv[k][j] === '') sh.getRange(row0 + k, 7 + j).setFormulaR1C1(s); }));
  }
  const rows = rowsOut_(sh, tz, vs.map((_, k) => row0 + k));
  return rows.map((x, k) => ({ row: x[0], no: Number(x[1][0]) || maxNo + 1 + k, rows: [x] }));
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

/* ===================== 앱 데이터 API (GitHub Pages 화면 → doPost) ===================== */
/**
 * 앱 화면이 GitHub Pages에서 직접 열릴 때는 google.script.run 대신 이 API를 fetch로 불러요.
 * 본문(JSON, Content-Type text/plain): {k: 접속 키(APP_KEY), fn: 함수 이름, args: [...]} → {ok, data} 또는 {ok:false, error}
 * 함수마다 첫 인자로 키를 받아 직접 검사하니(checkKey_), 여기서는 허용 목록만 확인해요.
 */
function api_(p) {
  const FNS = { getData: getData, setConfirm: setConfirm, updateEntry: updateEntry, voidEntry: voidEntry, addEntry: addEntry, saveVoucher: saveVoucher,
    saveRule: saveRule, deleteRule: deleteRule, addAccount: addAccount, setAccountUse: setAccountUse,
    taskInbox: taskInbox, taskApply: taskApply };
  const f = Object.prototype.hasOwnProperty.call(FNS, p.fn) ? FNS[p.fn] : null;
  if (!f) return { ok: false, error: '알 수 없는 요청이에요: ' + p.fn };
  try {
    return { ok: true, data: f.apply(null, [p.k].concat(Array.isArray(p.args) ? p.args : [])) };
  } catch (err) {
    return { ok: false, error: String((err && err.message) || err) };
  }
}

/* ===================== 야간 예약 작업용 API (taskInbox / taskApply) ===================== */
/**
 * Claude 예약 작업은 시트를 직접 쓰지 않고 이 두 API만 써요 → 모든 쓰기가 서버 잠금·검증·변경이력을 거쳐요.
 * 키: 스크립트 속성 TASK_KEY (예약 작업 전용, makeTaskKey()로 발급). 앱 접속 키(APP_KEY)도 허용.
 */
function checkTaskKey_(key) {
  const pr = PropertiesService.getScriptProperties();
  const t = pr.getProperty('TASK_KEY'), a = pr.getProperty('APP_KEY');
  key = String(key || '');
  return !!key && ((!!t && key === t) || (!!a && key === a));
}
function makeTaskKey() {
  const key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('TASK_KEY', key);
  Logger.log('예약 작업 키: ' + key);
}
/** 대기 알림(처리상태 빈칸) + 서버 추천 + 계정·규칙 + 최근 전표 150행 */
function taskInbox(key) {
  if (!checkTaskKey_(key)) throw new Error('예약 작업 키가 맞지 않아요.');
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const J = journalVals_(ss.getSheetByName('분개장'), tz);
  const rules = readRules_(ss), accts = accountsOut_(ss);
  const ib = readInbox_(ss, { journal: J, rules: rules, accounts: accts });
  if (ib.error) throw new Error('수신함을 읽지 못했어요: ' + ib.error);
  const pending = ib.rows.filter((r) => !r[3] && String(r[2]).trim()).map((r) => {
    const g = r[6] || {};
    return { id: r[0], at: r[1], text: r[2], memo: r[5],
      sug: { date: g.date || '', debit: g.debit || '', credit: g.credit || '', amount: g.amount || 0, memo: g.memo || '', basis: g.basis || '', why: g.why || g.hint || '' } };
  });
  const recent = [];
  for (let i = J.length - 1; i >= 0 && recent.length < 150; i--) {
    const r = J[i];
    if (!String(r[1] || '').trim()) continue;
    recent.push({ row: i + 2, no: r[0], date: r[1], debit: r[2], credit: r[3], amount: r[4], memo: r[5], confirm: r[10], grp: r[12] || '', note: String(r[11] || '').slice(0, 300) });
  }
  return {
    today: Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd HH:mm'),
    inboxSheet: ib.id === SPREADSHEET_ID ? '가계부 안 수신함' : '예전 수신함(구글 폼)',
    pending: pending,
    accounts: accts.filter((a) => String(a[1]).trim()).map((a) => ({ code: a[0], name: a[1], type: a[2], fsg: a[4], active: String(a[6]) !== '사용중지' })),
    rules: rules.map((r) => ({ keyword: r[0], debit: r[1], credit: r[2], desc: r[3] })),
    recent: recent,
  };
}
/**
 * 처리 결과 반영. ops: [{id(수신함 행 번호, taskInbox의 id), status('처리됨'|'보류'|'일부보류'|'중복'), memo,
 *   entries?: [{date, debit, credit, amount, memo, note} | {date, memo, note, lines:[{side:'차'|'대', acct, amount}]}],
 *   voids?: [{row, no, reason}] }]
 * 알림 하나(op)마다 먼저 전부 검사하고, 문제가 없을 때만 써요(일부만 쓰지 않음). 이미 처리된 알림은 건너뛰어요.
 * 전표는 항상 '미확인'. 무효는 '미확인'이고 여러 줄 전표가 아닌 행만.
 */
function taskApply(key, ops) {
  if (!checkTaskKey_(key)) throw new Error('예약 작업 키가 맞지 않아요.');
  ops = Array.isArray(ops) ? ops : [];
  if (ops.length > 60) throw new Error('한 번에 60건까지예요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const tz = ss.getSpreadsheetTimeZone();
    const sh = ss.getSheetByName('분개장');
    const OK = ['처리됨', '보류', '일부보류', '중복'];
    const results = [];
    ops.forEach((op) => {
      const res = { id: op && op.id, ok: false };
      results.push(res);
      try {
        if (OK.indexOf(op.status) < 0) throw new Error('처리상태가 이상해요: ' + op.status);
        const ref = inboxRef_(ss, op.id);
        const cur = ref.sh.getRange(ref.row, 2, 1, 2).getDisplayValues()[0];
        if (!String(cur[0]).trim()) throw new Error('빈 수신함 행이에요.');
        if (String(cur[1]).trim()) { res.skipped = '이미 처리된 알림(' + cur[1] + ')'; return; }
        // 1) 검사: 전표는 쌍으로 바꿔 clean_, 무효 대상은 미확인·단일 전표인지
        const groups = (op.entries || []).map((e) => {
          const base = { date: e.date, memo: e.memo, note: e.note, confirm: '미확인' };
          const pairs = e.lines ? splitLines_(Object.assign(base, { lines: e.lines })) : [Object.assign(base, { debit: e.debit, credit: e.credit, amount: e.amount })];
          return pairs.map((p) => clean_(ss, Object.assign(p, { confirm: '미확인' })));
        });
        const voids = (op.voids || []).map((v) => {
          const b = readRow_(sh, v.row, v.no);
          if (String(b[COL_CONFIRM - 1]).trim() !== '미확인') throw new Error('전표 ' + v.no + '번은 미확인이 아니라 무효 처리하지 않았어요(' + b[COL_CONFIRM - 1] + ').');
          if (String(b[COL_GRP - 1]).trim()) throw new Error('전표 ' + v.no + '번은 여러 줄 전표라 무효 처리하지 않았어요.');
          return { row: Number(v.row), no: v.no, reason: String(v.reason || '').trim(), before: b };
        });
        if (op.status === '처리됨' && !groups.length && !voids.length && !/거래 아님|제외/.test(String(op.memo || ''))) throw new Error('처리됨인데 전표·무효가 없어요(거래가 아니면 메모에 "거래 아님(제외)").');
        // 2) 쓰기
        const nos = [], logs = [];
        groups.forEach((pairs) => {
          const out = writeEntries_(sh, tz, pairs);
          if (out.length > 1) { header_(sh, COL_GRP, '묶음'); sh.getRangeList(out.map((o) => 'M' + o.row)).setValue(String(out[0].no)); }
          out.forEach((o, k) => { nos.push(o.no); logs.push(['[예약] 전표 추가 (수신함 ' + (ref.id < 0 ? '시트 ' : '') + ref.row + '행)', o.row, null, Object.assign({ no: o.no }, pairs[k])]); });
        });
        voids.forEach((v) => {
          sh.getRange(v.row, COL_CONFIRM).setValue(VOID);
          logs.push(['[예약] 전표 무효' + (v.reason ? ' (' + v.reason + ')' : ''), v.row, v.before[COL_CONFIRM - 1], VOID]);
        });
        ref.sh.getRange(ref.row, 3, 1, 3).setValues([[op.status, nos.join(', '), ('[예약] ' + String(op.memo || '')).trim()]]);
        logMany_(ss, logs);
        res.ok = true; res.nos = nos; res.voided = voids.map((v) => v.no);
      } catch (err) {
        res.error = String((err && err.message) || err);
      }
    });
    return { results: results };
  });
}

/* ===================== 단축어 → 바로 입력 (doPost) ===================== */
/**
 * 아이폰 단축어가 알림 한 건을 웹앱 주소로 POST 해요. 본문(JSON): {"k": 단축어 키, "text": 알림 원문}
 *  1) 가계부 안 '수신함' 시트에 한 줄 기록 (같은 원문이 최근에 있으면 '중복')
 *  2) 분류규칙(가장 긴 키워드)에 맞고 금액·계정이 다 정해지면 바로 '미확인' 전표를 만들고 '처리됨'
 *  3) 아니면 처리상태를 비워 두고(대기) 메모에 이유 → 앱이나 밤 정리 때 처리
 * 키는 앱 접속 키(APP_KEY)와 따로예요: 단축어에 들어가는 키로는 장부를 볼 수 없어요. 처음 한 번 makeIngestKey() 실행.
 */
function doPost(e) {
  const json = (o) => ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
  let body = {};
  try { body = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {}; } catch (err) { body = {}; }
  const p = Object.assign({}, (e && e.parameter) || {}, body);
  if (p.fn) return json(api_(p));   // 앱 화면(GitHub Pages)의 데이터 요청
  const saved = PropertiesService.getScriptProperties().getProperty('INGEST_KEY');
  if (!saved || String(p.k || '') !== saved) return json({ ok: false, msg: '키가 맞지 않아요' });
  const text = String(p.text || '').trim();
  if (!text) return json({ ok: false, msg: '알림 내용이 비어 있어요' });
  if (text.length > 3000) return json({ ok: false, msg: '알림이 너무 길어요' });
  try {
    return json(Object.assign({ ok: true }, withLock_(() => ingest_(text))));
  } catch (err) {
    return json({ ok: false, msg: String((err && err.message) || err) });
  }
}
function ingest_(text) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const tz = ss.getSpreadsheetTimeZone();
  const ish = inboxSheet_(ss);
  const last = ish.getLastRow();
  const from = Math.max(2, last - 299);   // 최근 300건 안에서 같은 원문·같은 결제 찾기 (단축어 재전송, 여러 앱의 같은 결제 알림)
  const recent = last >= 2 ? ish.getRange(from, 2, last - from + 1, 2).getDisplayValues() : [];
  const row = last + 1;
  const put = (st, no, memo) => ish.getRange(row, 1, 1, 5).setValues([[new Date(), text, st, no, memo]]);
  if (recent.some((r) => String(r[0]).trim() === text)) { put('중복', '', '같은 알림이 이미 수신함에 있어요'); return { status: '중복', msg: '이미 받은 알림이에요' }; }
  // 같은 결제를 다른 앱이 다시 알린 경우 (신한카드 앱 + 신한 SOL, 체크카드 승인 + 은행 출금)
  const same = sameTxn_(text, recent, from);
  if (same && !(same.kind === '출금' && payKind_(text) === '승인' && !same.status)) {
    put('중복', '', '같은 결제로 보이는 알림이 이미 있어요(수신함 ' + same.row + '행)');
    return { status: '중복', msg: '같은 결제 알림이 이미 있어요(수신함 ' + same.row + '행)' };
  }
  if (same) {   // 먼저 와서 대기 중인 은행 출금 알림 → 이번 승인 알림을 처리하고 출금 쪽을 중복으로
    ish.getRange(same.row, 3, 1, 3).setValues([['중복', '', '체크카드 승인 알림(수신함 ' + row + '행)과 같은 거래']]);
  }
  const sh = ss.getSheetByName('분개장');
  const g = guess_(ss, text, tz, { journal: journalVals_(sh, tz) });
  if (g.why || !g.auto) { const why = g.why || g.hint; put('', '', why); return { status: '대기', msg: why }; }
  let v;
  try { v = clean_(ss, g); } catch (err) { put('', '', String(err.message || err)); return { status: '대기', msg: String(err.message || err) }; }
  const out = writeEntry_(sh, tz, v);
  put('처리됨', out.no, '자동 분류: ' + g.basis);
  log_(ss, '전표 자동 추가 (수신함 시트 ' + row + '행)', out.row, null, Object.assign({ no: out.no }, v));
  return { status: '처리됨', no: out.no, msg: '전표 ' + out.no + '번 · ' + g.memo + ' ' + v.amount.toLocaleString() + '원 (' + v.debit + ' / ' + v.credit + ')' };
}
/** 분개장 A~M 값 (학습 분류용) */
function journalVals_(sh, tz) {
  const last = sh.getLastRow();
  if (last < 2) return [];
  const n = Math.min(COL_GRP, sh.getMaxColumns());
  return sh.getRange(2, 1, last - 1, n).getValues().map((r) => r.map((v) => cell_(v, tz)));
}

/* ----- 알림 원문 읽기 ----- */
/** 알림 종류: 카드 승인 / 출금 / ''(입금·취소·기타는 같은 결제 비교에서 뺌) */
function payKind_(text) {
  const t = String(text || '').replace(/입출금/g, '');   // '입출금(5929)', '입출금알림'은 종류가 아님
  if (/취소/.test(t)) return '';
  if (/승인/.test(t)) return '승인';
  if (/출금/.test(t)) return '출금';
  return '';
}
/** 알림에 적힌 거래 시각 → 월·일·분 숫자 (예: 11/14 13:38, 11.14 9:18, 11/15 12:30:20). 없으면 null */
function txnTime_(text) {
  const m = /(\d{1,2})[\/.](\d{1,2})\s+(\d{1,2}):(\d{2})/.exec(String(text || ''));
  return m ? (Number(m[1]) * 31 + Number(m[2])) * 1440 + Number(m[3]) * 60 + Number(m[4]) : null;
}
/** 같은 결제로 보이는 최근 수신함 알림: 금액 같고, 거래 시각 1분 안, 종류가 (승인·승인) 또는 (승인·출금). 중복으로 표시된 줄은 제외 */
function sameTxn_(text, recent, from) {
  const k = payKind_(text), tm = txnTime_(text), am = /([\d,]+)\s*원/.exec(text);
  if (!k || tm === null || !am) return null;
  const amount = am[1].replace(/,/g, '');
  for (let i = recent.length - 1; i >= 0; i--) {
    const t = String(recent[i][0] || ''), st = String(recent[i][1] || '').trim();
    if (st === '중복') continue;
    const k2 = payKind_(t);
    if (!k2 || (k === '출금' && k2 === '출금')) continue;
    const tm2 = txnTime_(t), am2 = /([\d,]+)\s*원/.exec(t);
    if (tm2 === null || !am2 || am2[1].replace(/,/g, '') !== amount || Math.abs(tm2 - tm) > 1) continue;
    return { row: from + i, kind: k2, status: st };
  }
  return null;
}
/** 가맹점·상대: 신한 '가맹점명:', 현대 체크(금액 줄 다음 줄), 은행 '금액 상대 입출금', 우리 '[출금] 상대 금액' */
function merchantOf_(text) {
  const t = String(text || '');
  let m = /가맹점명\s*[:：]\s*([^\n]+)/.exec(t);
  if (m) return m[1].trim();
  m = /[\d,]+원\s*(?:일시불|\d+개월)[^\n]*\n\s*([^\n]+)/.exec(t);
  if (m) return m[1].trim();
  m = /[\d,]+원\s+(.+?)\s+입출금/.exec(t);
  if (m) return m[1].trim();
  m = /\[(?:출금|입금)\]\s*(.+?)\s+[\d,]+원/.exec(t);
  if (m) return m[1].trim();
  return '';
}
/** 결제 수단(승인 알림만): 원문 첫 줄. 예) '[신한카드(0534)승인] 이*주', '이동주 님, 현대 체크 승인' */
function channelOf_(text) {
  const first = String(text || '').trim().split('\n')[0].trim();
  return /승인/.test(first) && !/취소/.test(first) ? first : '';
}

/**
 * 알림 원문 → 전표 추천. 반환 {date, debit, credit, amount, memo, note, confirm, kw, basis, auto, hint} 또는 {why}
 * 1) 분류규칙(가장 긴 키워드) 2) 과거 전표 학습: 같은 가맹점의 최근 전표 계정(차변), 같은 결제 수단의 최근 전표 대변
 * 자동 분개(auto)는 규칙이 맞거나, 승인 알림이면서 같은 가맹점 최근 전표 2건 이상이 같은 차변일 때만. 나머지는 추천만(hint).
 */
function guess_(ss, text, tz, ctx) {
  ctx = ctx || {};
  if (/취소/.test(text)) return { why: '취소 알림이라 직접 확인이 필요해요' };
  const amt = /([\d,]+)\s*원/.exec(text);
  const amount = amt ? Number(amt[1].replace(/,/g, '')) : 0;
  if (!(amount > 0)) return { why: '금액을 찾지 못했어요' };
  const t = text.toLowerCase();
  const rule = (ctx.rules || readRules_(ss)).filter((r) => t.indexOf(String(r[0]).trim().toLowerCase()) >= 0)
    .sort((a, b) => String(b[0]).trim().length - String(a[0]).trim().length)[0];
  const merchant = merchantOf_(text), channel = channelOf_(text);
  // 과거 전표 학습 (최신부터, 무효·여러 줄 전표 제외)
  const J = (ctx.journal || []).filter((r) => String(r[10]).trim() !== VOID && !String(r[12] || '').trim() && r[2] && r[3]);
  const hits = [];
  let chan = null;
  for (let i = J.length - 1; i >= 0; i--) {
    const r = J[i], note = String(r[11] || ''), memo = String(r[5] || '');
    if (merchant.length >= 2 && hits.length < 3 && (note.indexOf(merchant) >= 0 || memo.indexOf(merchant) >= 0)) hits.push(r);
    if (channel && !chan && note.trim().split('\n')[0].trim() === channel) chan = r;
    if (hits.length >= 3 && (chan || !channel)) break;
  }
  let debit = '', credit = '', basis = '', auto = false;
  if (rule) { debit = String(rule[1]).trim(); credit = String(rule[2] || '').trim(); basis = '규칙 ' + String(rule[0]).trim(); auto = true; }
  else if (hits.length) {
    debit = String(hits[0][2]).trim();
    const same = hits.filter((r) => String(r[2]).trim() === debit).length;
    basis = '과거 전표 ' + hits.filter((r) => String(r[2]).trim() === debit).map((r) => r[0]).join('·') + '번(같은 가맹점)';
    auto = !!channel && same >= 2 && String(hits[0][2]).trim() === debit;
    if (!channel || !chan) credit = String(hits[0][3]).trim();
  }
  if (!credit && chan) credit = String(chan[3]).trim();
  if (!credit && /승인/.test(text) && !/체크/.test(text)) {   // 대변 없는 신용카드 승인 → 첫 카드 부채 계정 (체크카드는 제외)
    const card = (ctx.accounts || accountsOut_(ss)).filter((a) => String(a[2]) === '부채' && String(a[1]).indexOf('카드') >= 0 && String(a[6]) !== '사용중지')
      .sort((a, b) => Number(a[0]) - Number(b[0]))[0];
    if (card) credit = String(card[1]).trim();
  }
  const now = new Date();
  let date = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  const m = /(\d{1,2})[\/.](\d{1,2})\s+\d{1,2}:\d{2}/.exec(text);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31) {
    let y = Number(Utilities.formatDate(now, tz, 'yyyy'));
    if (Number(m[1]) > Number(Utilities.formatDate(now, tz, 'M'))) y -= 1;   // 12월 알림을 1월에 받은 경우
    date = y + '-' + ('0' + m[1]).slice(-2) + '-' + ('0' + m[2]).slice(-2);
  }
  const kw = rule ? String(rule[0]).trim() : merchant;
  const memo = (rule && String(rule[3] || '').trim()) || merchant || kw;
  const g = { date: date, debit: debit, credit: credit, amount: amount, memo: memo, note: text, confirm: '미확인', kw: kw, basis: basis };
  if (!debit && !credit) return Object.assign(g, { why: '맞는 분류 규칙이나 과거 전표가 없어요' });
  if (!debit) return Object.assign(g, { auto: false, hint: '차변 계정을 정할 수 없어요 (추천 대변: ' + credit + ')' });
  if (!credit) return Object.assign(g, { auto: false, hint: '대변 계정을 정할 수 없어요 (규칙에 대변 계정 넣기)' });
  g.auto = auto;
  if (!auto) g.hint = '추천: ' + debit + ' / ' + credit + ' · ' + basis + (channel ? '' : ' · 체크카드 승인과 같은 거래인지 확인') + ' — 확인 후 전표로 만들어 주세요';
  return g;
}
/** 처음 한 번만 실행: 단축어용 키를 만들어 실행 로그에 보여줘요. 다시 실행하면 바뀌어요(단축어도 바꿔야 함). */
function makeIngestKey() {
  const key = Utilities.getUuid().replace(/-/g, '');
  PropertiesService.getScriptProperties().setProperty('INGEST_KEY', key);
  Logger.log('단축어 키: ' + key);
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

/* ===================== 설정: 분류 규칙 관리 ===================== */
/** 규칙 저장. r: {row?(수정할 시트 행), kw?(그 행의 원래 키워드), keyword, debit, credit, desc} */
function saveRule(key, r) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = rulesSheet_(ss);
    const names = accountNames_(ss);
    const kw = String(r.keyword || '').trim();
    const debit = String(r.debit || '').trim(), credit = String(r.credit || '').trim(), desc = String(r.desc || '').trim();
    if (!kw) throw new Error('키워드를 넣어 주세요.');
    if (!debit) throw new Error('차변 계정을 골라 주세요.');
    if (!names.has(debit)) throw new Error('차변 계정이 계정과목표에 없어요: ' + debit);
    if (credit && !names.has(credit)) throw new Error('대변 계정이 계정과목표에 없어요: ' + credit);
    if (debit === credit) throw new Error('차변과 대변이 같은 계정이에요.');
    const last = sh.getLastRow();
    const keys = last < 2 ? [] : sh.getRange(2, 1, last - 1, 1).getDisplayValues().map((x) => String(x[0]).trim().toLowerCase());
    const row = r.row ? ruleRow_(sh, r.row, r.kw) : 0;
    const dup = keys.indexOf(kw.toLowerCase());
    if (dup >= 0 && dup + 2 !== row) throw new Error('같은 키워드 규칙이 이미 있어요: ' + kw);
    const today = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd');
    if (row) {
      const before = sh.getRange(row, 1, 1, 6).getDisplayValues()[0];
      sh.getRange(row, 1, 1, 3).setValues([[kw, debit, credit]]);
      sh.getRange(row, 4, 1, 3).setValues([['설정에서 수정', today, desc]]);
      log_(ss, '분류 규칙 수정', '', before, { keyword: kw, debit: debit, credit: credit, desc: desc });
    } else {
      sh.appendRow([kw, debit, credit, '설정에서 추가', today, desc]);
      log_(ss, '분류 규칙 추가', '', null, { keyword: kw, debit: debit, credit: credit, desc: desc });
    }
    return { ok: true, rules: readRules_(ss) };
  });
}
/** 규칙 삭제. 행의 키워드가 kw와 같을 때만 지워요(행이 밀렸으면 거부). */
function deleteRule(key, row, kw) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = rulesSheet_(ss);
    row = ruleRow_(sh, row, kw);
    const before = sh.getRange(row, 1, 1, 6).getDisplayValues()[0];
    sh.deleteRow(row);
    log_(ss, '분류 규칙 삭제', '', before, null);
    return { ok: true, rules: readRules_(ss) };
  });
}
function ruleRow_(sh, row, kw) {
  row = Number(row);
  if (!(row >= 2 && row <= sh.getLastRow())) throw new Error('규칙을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');
  const cur = String(sh.getRange(row, 1).getDisplayValue()).trim();
  if (cur !== String(kw || '').trim()) throw new Error('규칙 시트가 바뀌었어요. 새로고침 후 다시 시도해 주세요.');
  return row;
}
function accountNames_(ss) {
  return new Set(ss.getSheetByName('계정과목표').getRange('B2:B').getValues().map((x) => String(x[0]).trim()).filter(String));
}

/* ===================== 설정: 계정과목 ===================== */
/**
 * 계정과목표: A 코드 / B 계정명 / C 구분 / D 정상잔액 / E 재무제표 구분 / F 안내 문구(일부 행) / G 사용('사용중지'면 숨김)
 * ⚠️ 시산표는 계정과목표를 "행 순서대로" 참조해요 → 중간 삽입·행 삭제 금지, 항상 맨 아래에 추가.
 * ⚠️ 분개장·분류규칙은 계정 "이름"으로 연결돼요 → 앱에서 이름 변경·삭제는 하지 않아요.
 */
const COL_ACCT_USE = 7;   // G열
const ACCT_RANGE = { '자산': [100, 199], '부채': [200, 299], '자본': [300, 399], '수익': [400, 499], '비용': [500, 599] };
const ACCT_FSG = { '자산': ['현금및예금', '적금', '투자자산', '기타자산'], '부채': ['부채'], '자본': ['자본'], '수익': ['수익'], '비용': ['비용'] };
function addAccount(key, a) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('계정과목표');
    const type = String(a.type || '').trim();
    const name = String(a.name || '').trim();
    const code = Number(a.code);
    const fsg = String(a.fsg || '').trim();
    if (!ACCT_RANGE[type]) throw new Error('구분을 골라 주세요.');
    if (!name) throw new Error('계정 이름을 넣어 주세요.');
    if (/[,'"!]/.test(name) || name.length > 30) throw new Error('계정 이름에 쉼표·따옴표·느낌표는 쓸 수 없고, 30자까지예요.');
    const [lo, hi] = ACCT_RANGE[type];
    if (!(Number.isInteger(code) && code >= lo && code <= hi)) throw new Error(type + ' 계정 코드는 ' + lo + '~' + hi + ' 사이여야 해요.');
    if (ACCT_FSG[type].indexOf(fsg) < 0) throw new Error('재무제표 구분을 골라 주세요.');
    const lastData = lastRowBy_(sh, 2);
    const rows = lastData < 2 ? [] : sh.getRange(2, 1, lastData - 1, 2).getDisplayValues();
    if (rows.some((r) => Number(r[0]) === code)) throw new Error('이미 있는 계정 코드예요: ' + code);
    if (rows.some((r) => String(r[1]).trim() === name)) throw new Error('이미 있는 계정 이름이에요: ' + name);
    const row = lastData + 1;
    if (sh.getRange(row, 1, 1, 5).getDisplayValues()[0].some(String)) throw new Error('계정과목표 ' + row + '행이 비어 있지 않아요. 시트를 확인해 주세요.');
    const side = (type === '자산' || type === '비용') ? '차변' : '대변';
    sh.getRange(row, 1, 1, 5).setValues([[code, name, type, side, fsg]]);
    log_(ss, '계정 추가', '', null, { row: row, code: code, name: name, type: type, side: side, fsg: fsg });
    return { row: row, count: row - 1, accounts: accountsOut_(ss) };
  });
}
/** 사용중지(on=false) / 다시 사용(on=true). G열만 바꿔요. */
function setAccountUse(key, code, name, on) {
  if (!checkKey_(key)) throw new Error('접속 키가 맞지 않아요.');
  return withLock_(() => {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sh = ss.getSheetByName('계정과목표');
    const lastData = lastRowBy_(sh, 2);
    const rows = lastData < 2 ? [] : sh.getRange(2, 1, lastData - 1, 2).getDisplayValues();
    const i = rows.findIndex((r) => Number(r[0]) === Number(code) && String(r[1]).trim() === String(name).trim());
    if (i < 0) throw new Error('계정을 찾을 수 없어요. 새로고침 후 다시 시도해 주세요.');
    header_(sh, COL_ACCT_USE, '사용');
    const cell = sh.getRange(i + 2, COL_ACCT_USE);
    const before = cell.getDisplayValue();
    const after = on ? '' : '사용중지';
    cell.setValue(after);
    log_(ss, on ? '계정 다시 사용' : '계정 사용중지', '', { code: code, name: name, use: before }, { use: after });
    return { ok: true, accounts: accountsOut_(ss) };
  });
}
/** col열 기준 마지막으로 값이 있는 행 (수식 등으로 getLastRow가 부풀어도 안전하게). */
function lastRowBy_(sh, col) {
  const last = sh.getLastRow();
  if (last < 2) return 1;
  const v = sh.getRange(2, col, last - 1, 1).getDisplayValues();
  for (let i = v.length - 1; i >= 0; i--) if (String(v[i][0]).trim()) return i + 2;
  return 1;
}

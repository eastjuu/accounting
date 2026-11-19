/*
 * 가계부 앱(iOS) 장부 엔진 — 앞부분
 * apps-script/Code.gs(서버 코드)를 앱 안에서 그대로 실행하려고, 구글 시트 대신 메모리 속 "가짜 시트"를 붙여요.
 * 빌드할 때 tools/build-ios-web.js가 [pre.js + Code.gs + post.js]를 이어 붙여 Web/engine.js를 만들어요.
 * - 시트 수식은 없어요: A열 번호는 Code.gs가 "수식이 없으면 직접 번호를 쓴다" 경로로 채우고, G~J는 앱이 쓰지 않아요.
 * - 데이터는 __LEDGER_DATA(앱이 넣어 줌)로 시작하고, 쓰기 뒤 serialize()로 꺼내 앱이 파일에 저장해요.
 */
var LedgerEngine = (function (G) {
  'use strict';
  var TZ = 'Asia/Seoul';
  var HEAD = {
    '분개장': ['전표번호', '날짜', '차변계정', '대변계정', '금액', '적요', '연월', '차변구분', '대변구분', '검증', '확인', '메모', '묶음'],
    '계정과목표': ['계정코드', '계정명', '구분', '정상잔액', '재무제표 구분', '안내', '사용'],
    '분류규칙': ['키워드', '차변계정', '대변계정', '비고', '추가일', '기본 적요'],
    '수신함': ['타임스탬프', '알림 원문', '처리상태', '전표번호', '메모'],
    '변경이력': ['시각', '작업', '분개장 행', '변경 전', '변경 후'],
  };
  var ORDER = ['분개장', '계정과목표', '분류규칙', '수신함', '변경이력'];

  /* ---------- 저장 형식: 날짜는 {"$d": ISO}로 ---------- */
  function revive(v) { return v && typeof v === 'object' && v.$d ? new Date(v.$d) : v; }
  function freeze(v) { return v instanceof Date ? { $d: v.toISOString() } : v; }

  /* ---------- 가짜 시트 ---------- */
  var book = { sheets: [], props: {} };
  function Sheet(name, rows, id) { this.name = name; this.d = rows || []; this.id = id; }
  var P = Sheet.prototype;
  P.getName = function () { return this.name; };
  P.getSheetId = function () { return this.id; };
  P.val = function (r, c) { var row = this.d[r - 1]; var v = row ? row[c - 1] : undefined; return v === undefined || v === null ? '' : v; };
  P.set = function (r, c, v) { while (this.d.length < r) this.d.push([]); var row = this.d[r - 1]; while (row.length < c - 1) row.push(''); row[c - 1] = v; };
  P.getLastRow = function () { for (var i = this.d.length - 1; i >= 0; i--) { var row = this.d[i] || []; for (var j = 0; j < row.length; j++) if (row[j] !== '' && row[j] !== null && row[j] !== undefined) return i + 1; } return 0; };
  P.getMaxColumns = function () { return 26; };
  P.insertColumnsAfter = function () {};
  P.setFrozenRows = function () {};
  P.appendRow = function (vals) { var r = this.getLastRow() + 1; for (var j = 0; j < vals.length; j++) this.set(r, j + 1, vals[j]); return this; };
  P.deleteRow = function (r) { this.d.splice(r - 1, 1); };
  P.getRangeList = function (a1s) { var sh = this; return { setValue: function (v) { a1s.forEach(function (a) { sh.getRange(a).setValue(v); }); } }; };
  function colNo(s) { var n = 0; for (var i = 0; i < s.length; i++) n = n * 26 + (s.charCodeAt(i) - 64); return n; }
  P.getRange = function (r, c, nr, nc) {
    if (typeof r === 'string') {
      var m = /^([A-Z]+)(\d*)(?::([A-Z]+)(\d*))?$/.exec(r);
      var c1 = colNo(m[1]), r1 = Number(m[2] || 1), c2 = m[3] ? colNo(m[3]) : c1;
      var r2 = m[3] ? (m[4] ? Number(m[4]) : Math.max(this.getLastRow(), r1)) : r1;
      return this.getRange(r1, c1, r2 - r1 + 1, c2 - c1 + 1);
    }
    return new Range(this, r, c, nr || 1, nc || 1);
  };
  function disp(v) {
    if (v instanceof Date) return fmtDate(v, 'yyyy-MM-dd HH:mm');
    return v === '' || v === null || v === undefined ? '' : String(v);
  }
  function Range(sh, r, c, nr, nc) { this.sh = sh; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
  var R = Range.prototype;
  R.grid = function (fn) { var out = []; for (var i = 0; i < this.nr; i++) { var row = []; for (var j = 0; j < this.nc; j++) row.push(fn(this.r + i, this.c + j)); out.push(row); } return out; };
  R.getValues = function () { var sh = this.sh; return this.grid(function (a, b) { return sh.val(a, b); }); };
  R.getDisplayValues = function () { var sh = this.sh; return this.grid(function (a, b) { return disp(sh.val(a, b)); }); };
  R.getDisplayValue = function () { return disp(this.sh.val(this.r, this.c)); };
  R.getValue = function () { return this.sh.val(this.r, this.c); };
  R.getFormulasR1C1 = function () { return this.grid(function () { return ''; }); };
  R.getFormula = function () { return ''; };
  R.setFormulaR1C1 = function () { return this; };
  R.setFontWeight = function () { return this; };
  R.setValues = function (vals) { for (var i = 0; i < vals.length; i++) for (var j = 0; j < vals[i].length; j++) this.sh.set(this.r + i, this.c + j, vals[i][j]); return this; };
  R.setValue = function (v) { for (var i = 0; i < this.nr; i++) for (var j = 0; j < this.nc; j++) this.sh.set(this.r + i, this.c + j, v); return this; };

  function sheetBy(name) { for (var i = 0; i < book.sheets.length; i++) if (book.sheets[i].name === name) return book.sheets[i]; return null; }
  var SS = {
    getSheetByName: sheetBy,
    getSheets: function () { return book.sheets; },
    getSpreadsheetTimeZone: function () { return TZ; },
    insertSheet: function (name) { var s = new Sheet(name, [], 1000 + book.sheets.length); book.sheets.push(s); return s; },
  };
  function load(data) {
    book = { sheets: [], props: (data && data.props) || {} };
    var src = (data && data.sheets) || {};
    var names = ORDER.concat(Object.keys(src).filter(function (n) { return ORDER.indexOf(n) < 0; }));
    names.forEach(function (n, i) {
      var rows = (src[n] || [HEAD[n] || []]).map(function (row) { return (row || []).map(revive); });
      if (!rows.length) rows = [HEAD[n] || []];
      book.sheets.push(new Sheet(n, rows, i + 1));
    });
    ['APP_KEY', 'INGEST_KEY', 'TASK_KEY'].forEach(function (k) { book.props[k] = 'local'; });
  }
  function serialize() {
    var out = { version: 1, savedAt: new Date().toISOString(), sheets: {} };
    book.sheets.forEach(function (s) {
      var last = s.getLastRow();
      out.sheets[s.name] = s.d.slice(0, Math.max(last, 1)).map(function (row) { return (row || []).map(freeze); });
    });
    return JSON.stringify(out);
  }

  /* ---------- Apps Script 흉내 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(d, f) {
    var k = new Date(d.getTime() + 9 * 3600e3);   // Asia/Seoul (서머타임 없음)
    var Y = k.getUTCFullYear(), M = k.getUTCMonth() + 1, D = k.getUTCDate(), h = k.getUTCHours(), mi = k.getUTCMinutes();
    if (f === 'M') return String(M);
    return f.replace('yyyy', Y).replace('MM', pad(M)).replace('dd', pad(D)).replace('HH', pad(h)).replace('mm', pad(mi));
  }
  var SpreadsheetApp = {
    openById: function (id) { if (id === SPREADSHEET_ID) return SS; throw new Error('앱에는 이 파일이 없어요: ' + id); },
    flush: function () {},
  };
  var PropertiesService = { getScriptProperties: function () { return { getProperty: function (k) { return book.props[k] || null; }, setProperty: function (k, v) { book.props[k] = v; } }; } };
  var LockService = { getScriptLock: function () { return { waitLock: function () {}, releaseLock: function () {} }; } };
  var Utilities = {
    formatDate: function (d, tz, f) { return fmtDate(d, f); },
    getUuid: function () { return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (ch) { var r = Math.random() * 16 | 0; return (ch === 'x' ? r : (r & 3 | 8)).toString(16); }); },
  };
  var ContentService = { createTextOutput: function (t) { return { t: t, setMimeType: function () { return this; }, getContent: function () { return t; } }; }, MimeType: { JSON: 'json' } };
  var HtmlService = {};
  var Logger = { log: function () {} };

  /* ===================== 여기부터 apps-script/Code.gs ===================== */


  /* ===================== 여기까지 apps-script/Code.gs ===================== */

  /* ---------- 앱에 내보내는 함수 ---------- */
  var FNS = { getData: getData, setConfirm: setConfirm, updateEntry: updateEntry, voidEntry: voidEntry, addEntry: addEntry, saveVoucher: saveVoucher,
    saveRule: saveRule, deleteRule: deleteRule, addAccount: addAccount, setAccountUse: setAccountUse };
  function persist() {
    try { if (G.webkit && G.webkit.messageHandlers && G.webkit.messageHandlers.ledger) G.webkit.messageHandlers.ledger.postMessage({ type: 'save', data: serialize() }); } catch (e) {}
  }
  /** 화면의 call(fn, args)가 부르는 입구. 서버와 같은 함수·같은 반환값. 쓰기 뒤엔 앱에 저장을 요청해요. */
  function call(fn, args) {
    if (!Object.prototype.hasOwnProperty.call(FNS, fn)) throw new Error('알 수 없는 요청이에요: ' + fn);
    var r = FNS[fn].apply(null, ['local'].concat(args || []));
    if (fn !== 'getData') persist();
    return r;
  }
  /** 단축어로 들어온 알림 한 건 → 서버의 doPost(단축어 입력)와 같은 처리. {ok, status, no?, msg} */
  function ingestText(text) {
    var out = doPost({ postData: { contents: JSON.stringify({ k: 'local', text: String(text || '') }) }, parameter: {} });
    var r = JSON.parse(out.getContent());
    persist();
    return r;
  }
  /** 구글 시트 웹앱의 getData 결과(raw)로 앱 장부를 새로 채워요 (처음 한 번 옮기기). */
  function importRaw(raw) {
    if (!raw || !Array.isArray(raw.journal) || !Array.isArray(raw.accounts)) throw new Error('가져온 데이터 형식이 이상해요');
    var J = [HEAD['분개장']].concat(raw.journal.map(function (r) { var x = r.slice(0, 13); while (x.length < 13) x.push(''); return x; }));
    while (J.length > 1 && !J[J.length - 1].slice(1, 6).some(function (v) { return v !== '' && v !== null; })) J.pop();   // 뒤쪽 빈 행(시트의 수식 행) 정리
    var A = [HEAD['계정과목표']].concat(raw.accounts.filter(function (r) { return r[1]; }).map(function (r) { var x = r.slice(0, 7); while (x.length < 7) x.push(''); return x; }));
    var RU = [HEAD['분류규칙']].concat((raw.rules || []).map(function (r) { return [r[0], r[1], r[2], '시트에서 가져옴', '', r[3] || '']; }));
    var IB = [HEAD['수신함']].concat(((raw.inbox && raw.inbox.rows) || []).slice().sort(function (a, b) { return Math.abs(a[0]) - Math.abs(b[0]); })
      .map(function (r) { return [r[1], r[2], r[3], r[4], r[5]]; }));
    load({ sheets: { '분개장': J, '계정과목표': A, '분류규칙': RU, '수신함': IB, '변경이력': [HEAD['변경이력']] } });
    log_(SS, '구글 시트에서 가져오기', '', null, { journal: J.length - 1, accounts: A.length - 1, rules: RU.length - 1, inbox: IB.length - 1 });
    persist();
    return { journal: J.length - 1, accounts: A.length - 1, rules: RU.length - 1, inbox: IB.length - 1 };
  }
  function isEmpty() { var s = sheetBy('분개장'), a = sheetBy('계정과목표'); return (!s || s.getLastRow() <= 1) && (!a || a.getLastRow() <= 1); }

  load(G.__LEDGER_DATA || null);
  return { call: call, ingestText: ingestText, importRaw: importRaw, serialize: serialize, load: load, isEmpty: isEmpty };
})(typeof window !== 'undefined' ? window : this);

/* =========================================================
 * 音訊管理：只播放預先製作好的音檔（ACE-Step 作曲的 BGM、離線製作的效果音、語音）
 * 不做任何即時合成。http(s) 下用解碼後的緩衝播放（低延遲、可同時多聲），
 * file:// 下改用 <audio> 元素。
 * ========================================================= */
(function (PK) {
  'use strict';

  var A = {
    ctx: null, ready: false, unlocked: false, useElements: location.protocol === 'file:',
    buffers: {}, elements: {}, missing: {},
    vol: { master: 0.9, bgm: 0.55, sfx: 0.8, voice: 1.0 }, muted: false,
    bgmKey: null, bgmNode: null, bgmGain: null, bgmEl: null,
    loops: {}, lastPlay: {}, duck: 1, boost: 1,
    hold: false, holds: {}, notes: [], heals: 0, loading: {}, tries: {},
  };
  function nop() { }
  // 最近發生的事（開發工具的「聲音狀態」顯示用：手機上音樂出狀況時，可以直接看到卡在哪一步）。連續一樣的只記一筆、後面加次數
  var T0 = Date.now();
  var NAMES = { bgm_cheer_m: '嗆司曲', bgm_reach: '聽牌曲', bgm_spsp: '九局下曲', bgm_bonus_v3: '大獎曲', jingle_bigwin_v3: '中獎號角', jingle_rush: '連莊號角', jingle_end: '結束號角' };
  function nm(key) { return NAMES[key] || key || '（無）'; }
  function note(text) {
    var last = A.notes[A.notes.length - 1], sec = Math.round((Date.now() - T0) / 1000);
    if (last && last[1] === text) { last[0] = sec; last[2] = (last[2] || 1) + 1; return; }
    A.notes.push([sec, text, 1]); if (A.notes.length > 30) A.notes.shift();
  }

  function path(group, name) { return 'assets/audio/' + group + '/' + name + '.mp3'; }
  function groupOf(name) {
    if (PK.SOUNDS.bgm.indexOf(name) >= 0) return 'bgm';
    if (PK.SOUNDS.voice.indexOf(name.replace(/^v_/, '')) >= 0 && name.indexOf('v_') === 0) return 'voice';
    return 'sfx';
  }

  try {
    var vs = localStorage.getItem('pk_volume');
    if (vs) Object.assign(A.vol, JSON.parse(vs));
    A.muted = localStorage.getItem('pk_muted') === '1';
  } catch (e) { /* 忽略 */ }

  A.saveVol = function () {
    try { localStorage.setItem('pk_volume', JSON.stringify(A.vol)); localStorage.setItem('pk_muted', A.muted ? '1' : '0'); } catch (e) { /* 忽略 */ }
    A.applyVolumes();
  };

  A.init = function () {
    if (!A.useElements) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        A.ctx = new AC();
        A.master = A.ctx.createGain(); A.master.connect(A.ctx.destination);
        A.gBgm = A.ctx.createGain(); A.gBgm.connect(A.master);
        A.gSfx = A.ctx.createGain(); A.gSfx.connect(A.master);
        A.gVoice = A.ctx.createGain(); A.gVoice.connect(A.master);
        A.applyVolumes();
        // 聲音輸出被手機暫停又恢復（來電、Siri、切換 app…）：恢復的那一刻順便確認歌有在播
        A.ctx.onstatechange = function () { note('聲音輸出：' + A.ctx.state); if (A.ctx.state === 'running') A.heal(); };
      } else {
        A.useElements = true;
      }
    }
    A.loadAll();
    watch();
  };

  // ---------- 聲音停掉了要自己回來 ----------
  // 使用者 2026-11-12：「手機在中獎時的背景音樂很容易喪失播放狀態，單純看漫畫時也會無法再播放音樂」。
  // 原本的程式只在順利的情況下會響：聲音輸出只在第一次觸控時開啟、歌被暫停了不會重播（要播的跟現在這首一樣就直接略過）、
  // 載入出錯一次就永久當成沒有這首。手機上這些「外力」很平常（來電、Siri、通知音、切換 app、鎖螢幕、網路斷一下），停一次就整場沒音樂。
  // 現在：記住「應該播哪一首」（A.bgmKey／A.bgmStream），每秒巡檢、每次觸控、切回前景時都對一次，沒在響就補播。
  function watch() {
    if (A.watching || typeof document === 'undefined') return; A.watching = true;
    // 手指碰到螢幕的每一下（不管碰在機台、按鈕還是漫畫閱讀器上）都是補救的機會：有些情況手機只准在這個當下恢復聲音
    ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'].forEach(function (t) { document.addEventListener(t, function () { A.unlock(); }, true); });
    document.addEventListener('visibilitychange', function () { A.setHold('hidden', document.hidden); });
    window.addEventListener('pageshow', function () { A.setHold('hidden', document.hidden); });
    setInterval(function () { A.heal(); }, 1000);
  }
  // 故意暫停聲音：切到背景（hidden）、全螢幕看漫畫（manga）。有一個理由成立就暫停，全部解除才恢復
  A.setHold = function (why, on) {
    A.holds[why] = !!on;
    var h = !!(A.holds.hidden || A.holds.manga);
    if (h !== A.hold) note(h ? '暫停聲音（' + (A.holds.hidden ? '切到背景' : '全螢幕看漫畫') + '）' : '恢復聲音');
    A.hold = h;
    if (h) {
      if (A.ctx) { try { var p = A.ctx.suspend(); if (p && p.catch) p.catch(nop); } catch (e) { /* 忽略 */ } }
      // 歌也一起停：不然它會在聽不到的狀態下繼續往前跑（原本只暫停聲音輸出，歌還掛在「播放中」）
      if (A.bgmStream && !A.bgmStream.el.paused) A.bgmStream.el.pause();
      if (A.bgmEl) A.bgmEl.pause();
      return;
    }
    if (A.bgmEl) { var q = A.bgmEl.play(); if (q && q.catch) q.catch(nop); }
    if (A.bgmStream && A.bgmStream.el.paused && A.unlocked) tryPlay(A.bgmStream);
    A.heal();
    // 剛切回來的那一刻手機不一定準備好：過一下再對兩次（之後還有每秒的巡檢與每次觸控）
    setTimeout(A.heal, 300); setTimeout(A.heal, 1200);
  };
  // 播一首串流的歌。healed＝這是補播（成功的話記一筆）
  function tryPlay(st, healed) {
    var el = st.el, sq = st.seq, p;
    st.moveAt = Date.now();
    if (!st.ready) return;   // 還在下載：抓到的時候會自己開始播（fetchStream）
    if (st.bad) {   // 上次載入出錯：重新載入；平常那首從剛才的位置接著播
      st.bad = false;
      var t = st.restart ? 0 : (el.currentTime || 0);
      try { el.load(); } catch (e) { /* 忽略 */ }
      if (t > 0.5) { var once = function () { el.removeEventListener('loadedmetadata', once); try { el.currentTime = t; } catch (e) { /* 忽略 */ } }; el.addEventListener('loadedmetadata', once); }
    }
    try { p = el.play(); } catch (e) { return; }
    if (p && p.then) p.then(function () {
      st.ok = 2; st.denyAt = 0;
      if (healed && A.bgmStream === st) { A.heals++; note('補播成功：' + nm(st.key)); }
    }, function (err) { playFailed(st, sq, err); });
  }
  function playFailed(st, sq, err) {
    var name = (err && err.name) || '';
    // 這段時間已經換歌或停掉了：這次播放作廢。
    // 原本不管原因一律當成「瀏覽器不准播」：把這首歌的串流拆掉、整首下載解碼（一首約 45MB），解碼完還會自己插進來把正在播的歌停掉——
    // 手機載入慢，大獎時一分鐘換六次歌（聽牌 → 九局下 → 號角 → 大獎曲 → 號角 → 嗆司曲），歌還在載入就換下一首，剛好踩中
    if (st.seq !== sq || A.bgmStream !== st) return;
    note('播放沒成功（' + (name || '不明') + '）：' + nm(st.key));
    if (name === 'NotAllowedError') { st.ok = 0; if (!st.denyAt) st.denyAt = Date.now(); return; }   // 要手指碰到螢幕的當下才准播：下一次觸控補播；一直等不到再改用整首解碼（A.heal）
    if (name === 'NotSupportedError') toBuffer(st.key);
    // 其他（載入中被暫停或重新載入打斷）：巡檢會再播
  }
  // 這一首放棄邊播邊載入，改成整首下載解碼（比較吃記憶體；只有瀏覽器不支援、一直不准播、連續載入失敗才走這條）
  function toBuffer(key) {
    var st = A.streams[key]; if (!st) return;
    note('改用整首解碼：' + nm(key));
    try { st.el.pause(); } catch (e) { /* 忽略 */ }
    if (A.bgmStream === st) A.bgmStream = null;
    delete A.streams[key]; A.noStream[key] = true; A.load('bgm', key, key);
  }
  // 對一次：聲音輸出有沒有開、應該播的歌有沒有在響；沒有就補
  A.heal = function () {
    if (!A.ctx || A.hold || !A.unlocked) return;
    if (typeof document !== 'undefined' && document.hidden) return;
    var now = Date.now();
    if (A.ctx.state !== 'running') { try { var p = A.ctx.resume(); if (p && p.catch) p.catch(nop); } catch (e) { /* 忽略 */ } }
    var st = A.bgmStream, key = A.bgmKey;
    if (st) {
      var el = st.el;
      if (!st.ready) return;   // 還在下載
      if (st.denyAt && now - st.denyAt > 5000 && el.paused && A.ctx.state === 'running') { toBuffer(st.key); return; }
      if (st.bad) { if (now >= (st.retryAt || 0)) tryPlay(st, true); return; }
      if (el.paused || el.ended) { tryPlay(st, true); return; }
      // 沒暫停卻一直不前進（卡在載入）：8 秒後重新載入
      if (A.ctx.state !== 'running' || el.seeking || el.currentTime !== st.lastT) { st.lastT = el.currentTime; st.moveAt = now; }
      else if (now - (st.moveAt || now) > 8000) { note('卡住 8 秒，重新載入：' + nm(st.key)); st.bad = true; tryPlay(st, true); }
    } else if (key && !A.bgmNode && key.indexOf('jingle') !== 0) {
      // 應該有音樂卻沒有東西在播（之前載入失敗）：每 3 秒再要一次
      if (!A.kickAt || now - A.kickAt > 3000) { A.kickAt = now; A.playBgm(key, true, true); }
    }
  };
  // 聲音現在的狀態（開發工具顯示用）
  A.diag = function () {
    var st = A.bgmStream, el = st && st.el, real;
    if (st) real = !st.ready ? '下載中' : el.paused ? '暫停' : el.readyState < 3 ? '載入中' : '播放中 ' + Math.floor(el.currentTime) + ' 秒';
    else if (A.bgmNode) real = '播放中';
    else real = A.bgmKey ? (A.loading[A.bgmKey] ? '載入中' : '沒有在播') : '—';
    return {
      out: A.ctx ? A.ctx.state : '（無）', hold: A.hold ? (A.holds.hidden ? '切到背景' : '全螢幕看漫畫') : '',
      want: A.bgmKey ? nm(A.bgmKey) : '—', real: real, heals: A.heals,
      // 每首串流的歌準備好了沒：↓＝還在下載、✓＝可以播、…＝啟動中、○＝還沒啟動（等手指碰螢幕）、✗＝出錯等重試
      bless: Object.keys(A.streams).map(function (k) { var s = A.streams[k]; return nm(k) + (!s.ready ? '↓' : s.bad ? '✗' : s.ok === 2 ? '✓' : s.ok === 1 ? '…' : '○'); }).join(' '),
      decoded: Object.keys(A.noStream).map(nm).join('、'),
      notes: A.notes.slice(-6),
    };
  };

  A.applyVolumes = function () {
    if (A.ctx) {
      var m = A.muted ? 0 : A.vol.master;
      A.master.gain.setTargetAtTime(m, A.ctx.currentTime, 0.02);
      A.gBgm.gain.setTargetAtTime(A.vol.bgm * A.duck * A.boost, A.ctx.currentTime, 0.08);
      A.gSfx.gain.setTargetAtTime(A.vol.sfx, A.ctx.currentTime, 0.02);
      A.gVoice.gain.setTargetAtTime(A.vol.voice, A.ctx.currentTime, 0.02);
    }
    if (A.bgmEl) A.bgmEl.volume = A.muted ? 0 : Math.min(1, A.vol.master * A.vol.bgm * A.duck * A.boost);
  };

  A.loadAll = function () {
    var list = [];
    PK.SOUNDS.bgm.forEach(function (n) { list.push(['bgm', n, n]); });
    PK.SOUNDS.sfx.forEach(function (n) { list.push(['sfx', n, n]); });
    PK.SOUNDS.voice.forEach(function (n) { list.push(['voice', n, 'v_' + n]); });
    list.forEach(function (it) { A.load(it[0], it[1], it[2]); });
  };

  // 背景音樂串流（PK.BGM_STREAM，新版才開）：bgm_ 開頭的長曲子用 <audio> 邊播邊載入，接到同一組音量控制。
  // 原本是每一首都整首解碼放進記憶體（120 秒的曲子一首 44MB，13 首共 368MB），手機記憶體撐不住會卡頓甚至整頁重載。
  // 短的 jingle 還是用解碼的方式（要跟中獎畫面精準對上）。
  A.streams = {};
  // 串流的歌：先把整個檔案抓到本機（壓縮檔，一首 1.4～2.9MB，四首共 8.6MB），再用本機網址交給 <audio> 邊解碼邊播。
  // 原本 <audio> 直接指到網路上的檔案，但線上主機不支援「只抓檔案的某一段」（Range 請求一律回整個檔案，2026-11-12 用 curl 確認兩個網址都是）。
  // iPhone 規定放影音的主機要支援這個：歌暫停一陣子再接著播、跳到某個位置，都要抓中間的一段，抓不到就卡住或出錯——
  // 大獎時嗆司曲被暫停好幾分鐘再接著播，剛好就是這種情況。抓到本機之後，暫停、接著播、循環都不再靠網路。
  function fetchStream(st, url) {
    var key = st.key; if (st.fetching || st.ready) return; st.fetching = true;
    fetch(url).then(function (r) {
      if (!r.ok) { var he = new Error('HTTP ' + r.status); he.http = true; throw he; }
      return r.blob();
    }).then(function (b) {
      st.fetching = false;
      if (A.streams[key] !== st) return;
      if (b.type !== 'audio/mpeg') b = b.slice(0, b.size, 'audio/mpeg');   // 類型要對，iPhone 才肯播
      st.url = URL.createObjectURL(b); st.ready = true; st.tries = 0;
      st.el.src = st.url;   // 換上真正的歌（還沒準備好的歌不會開始播，所以這時候它一定沒在響）
      if (A.bgmStream === st && !A.hold && A.unlocked) tryPlay(st);   // 正等著播這一首：開始
    }).catch(function (e) {
      st.fetching = false;
      if (A.streams[key] !== st) return;
      if (e && e.http) { A.missing[key] = true; return; }   // 檔案真的不存在
      var n = st.tries = (st.tries || 0) + 1; note('下載失敗（第 ' + n + ' 次）：' + nm(key));
      setTimeout(function () { if (A.streams[key] === st) fetchStream(st, url); }, Math.min(15000, 1000 * Math.pow(2, n)));   // 網路斷一下：過一下再抓，間隔越拉越長
    });
  }
  // 四分之一秒的無聲（8000Hz、單聲道、8 位元），現做一份放在本機網址
  var SILENT = null;
  function silentUrl() {
    if (SILENT) return SILENT;
    var n = 2000, v = new DataView(new ArrayBuffer(44 + n)), w = function (o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); };
    w(0, 'RIFF'); v.setUint32(4, 36 + n, true); w(8, 'WAVEfmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, 8000, true); v.setUint32(28, 8000, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, 'data'); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return (SILENT = URL.createObjectURL(new Blob([v.buffer], { type: 'audio/wav' })));
  }
  function isStream(group, key) { return !!PK.BGM_STREAM && !A.useElements && group === 'bgm' && key.indexOf('bgm_') === 0 && !A.noStream[key]; }
  A.noStream = {};
  A.load = function (group, file, key) {
    var url = path(group, file);
    if (isStream(group, key)) {
      // 一開始先掛一小段無聲（第一次觸控時每個 <audio> 都要啟動一次，要有東西可以播）；真正的歌抓到本機之後再換上（fetchStream）
      var se = new Audio(); se.preload = 'auto'; se.src = silentUrl();
      var st = { key: key, el: se, node: null, gain: null, seq: 0, ready: false };
      // 載入出錯（手機網路斷一下、Wi-Fi 與行動網路切換…）：記下來，下次要播時重新載入（間隔越拉越長）；連續四次才改用整首解碼。
      // 原本出錯一次就永久當成「沒有這首歌」，要重新整理網頁才會好
      se.addEventListener('error', function () {
        if (A.streams[key] !== st || !st.ready) return;
        st.bad = true; st.errN = (st.errN || 0) + 1; st.retryAt = Date.now() + Math.min(8000, 500 * Math.pow(2, st.errN));
        note('載入出錯（第 ' + st.errN + ' 次）：' + nm(key));
        if (st.errN >= 4) toBuffer(key);
      });
      se.addEventListener('playing', function () { st.errN = 0; st.denyAt = 0; st.restart = false; });
      se.addEventListener('pause', function () { if (A.bgmStream === st && st.ready && !A.hold) note('被外力暫停：' + nm(key)); });
      // 循環時避開曲尾的淡出：快到結尾就跳回開頭
      se.addEventListener('timeupdate', function () { if (st.ready && se.loop && se.duration && se.currentTime > se.duration - 0.7) se.currentTime = 0.05; });
      A.streams[key] = st;
      fetchStream(st, url);
      return;
    }
    if (A.useElements) {
      var el = new Audio();
      el.preload = group === 'bgm' ? 'metadata' : 'auto';
      el.src = url;
      el.onerror = function () { A.missing[key] = true; };
      A.elements[key] = el;
      return;
    }
    if (A.loading[key]) return;
    A.loading[key] = true;
    fetch(url).then(function (r) {
      if (!r.ok) { var he = new Error('HTTP ' + r.status); he.http = true; throw he; }
      return r.arrayBuffer();
    }).then(function (ab) {
      return new Promise(function (res, rej) { A.ctx.decodeAudioData(ab, res, rej); });
    }).then(function (buf) {
      A.loading[key] = false; A.tries[key] = 0;
      A.buffers[key] = buf;
      // 這首歌現在還是「應該播的那一首」而且沒有東西在響（要播的時候還沒載好）：開始播。
      // 原本只記「等著播哪一首」，中間換過歌也不會取消——載好的時候會把正在播的歌停掉、換成早就不要的那一首
      if (A.bgmKey === key && !A.bgmStream && !A.bgmNode) A.playBgm(key, true, true);
    }).catch(function (e) {
      A.loading[key] = false;
      // 檔案真的不存在才當成「沒有」；網路斷一下、解碼失敗都再試（2、6、15 秒後各一次；背景音樂之後要播的時候還會再載）
      if (e && e.http) { A.missing[key] = true; return; }
      var n = A.tries[key] = (A.tries[key] || 0) + 1;
      if (n <= 3) setTimeout(function () { if (!A.buffers[key]) A.load(group, file, key); }, [2000, 6000, 15000][n - 1]);
    });
  };

  // 第一次使用者操作時解鎖音訊（iOS 需要）
  // iPhone 規定每個 <audio> 都要在「使用者手指碰到螢幕的當下」啟動過一次，之後才准程式自己播；而且可能不讓好幾首同時啟動。
  // 所以每一次觸控都補做還沒成功的曲子（ok：0＝還沒試、1＝進行中、2＝成功；失敗就退回 0，下一次觸控再試），正在播的那一首不動它
  function blessStreams() {
    Object.keys(A.streams).forEach(function (k) {
      var st = A.streams[k], el = st.el;
      if (st.ok || A.bgmStream === st) { if (A.bgmStream === st && !el.paused) st.ok = 2; return; }
      st.ok = 1;
      try {
        el.muted = true; var p0 = el.play();
        if (p0 && p0.then) p0.then(function () { st.ok = 2; if (A.bgmStream !== st) { el.pause(); el.muted = false; } }).catch(function () { st.ok = 0; if (A.bgmStream !== st) el.muted = false; });
        else st.ok = 2;
      } catch (e) { st.ok = 0; el.muted = false; }
    });
  }
  A.unlock = function () {
    blessStreams();
    if (!A.unlocked) {
      A.unlocked = true;
      if (A.useElements) {
        Object.keys(A.elements).forEach(function (k) {
          var el = A.elements[k];
          if (k.indexOf('bgm') === 0 || k.indexOf('jingle') === 0) return;
          try { el.muted = true; var p = el.play(); if (p && p.then) p.then(function () { el.pause(); el.currentTime = 0; el.muted = false; }).catch(function () { el.muted = false; }); } catch (e) { /* 忽略 */ }
        });
      }
    }
    // 每一次觸控都對一次：聲音輸出開著、該播的歌在播。
    // 原本只有第一次觸控會開聲音輸出，之後被手機暫停（或進遊戲前切到背景過）就再也叫不回來，整台沒聲音
    A.heal();
  };

  // 播放效果音／語音。opts: {vol, rate, minGap(秒)}
  A.play = function (key, opts) {
    opts = opts || {};
    if (A.muted) return null;
    var now = performance.now() / 1000;
    var gap = opts.minGap != null ? opts.minGap : 0.03;
    if (A.lastPlay[key] && now - A.lastPlay[key] < gap) return null;
    A.lastPlay[key] = now;
    var isVoice = key.indexOf('v_') === 0;
    if (isVoice) A.duckBgm(0.45, 1.6);
    if (A.useElements) {
      var base = A.elements[key];
      if (!base || A.missing[key]) return null;
      var el = base.paused ? base : base.cloneNode();
      el.volume = Math.min(1, A.vol.master * (isVoice ? A.vol.voice : A.vol.sfx) * (opts.vol == null ? 1 : opts.vol));
      el.playbackRate = opts.rate || 1;
      el.currentTime = 0;
      var p = el.play(); if (p && p.catch) p.catch(function () { });
      return el;
    }
    var buf = A.buffers[key];
    if (!buf || !A.ctx) return null;
    var src = A.ctx.createBufferSource();
    src.buffer = buf;
    if (opts.rate) src.playbackRate.value = opts.rate;
    var g = A.ctx.createGain();
    g.gain.value = opts.vol == null ? 1 : opts.vol;
    src.connect(g); g.connect(isVoice ? A.gVoice : A.gSfx);
    src.start();
    return src;
  };

  A.voice = function (name, opts) {
    // 語音一次只講一句：新的會蓋掉舊的
    if (A.curVoice) { try { A.curVoice.stop ? A.curVoice.stop() : A.curVoice.pause(); } catch (e) { /* 忽略 */ } }
    A.curVoice = A.play('v_' + name, Object.assign({ minGap: 0.2 }, opts || {}));
    return A.curVoice;
  };

  // 循環效果音（鋼珠滾動聲、群眾）
  A.loop = function (key, on, vol) {
    var cur = A.loops[key];
    if (on && !cur) {
      if (A.useElements) {
        var el = A.elements[key];
        if (!el || A.missing[key]) return;
        el.loop = true; el.volume = A.muted ? 0 : A.vol.master * A.vol.sfx * (vol || 1);
        var p = el.play(); if (p && p.catch) p.catch(function () { });
        A.loops[key] = { el: el };
      } else {
        var buf = A.buffers[key];
        if (!buf) return;
        var src = A.ctx.createBufferSource(); src.buffer = buf; src.loop = true;
        var g = A.ctx.createGain(); g.gain.value = 0;
        g.gain.setTargetAtTime(vol || 1, A.ctx.currentTime, 0.15);
        src.connect(g); g.connect(A.gSfx); src.start();
        A.loops[key] = { src: src, g: g };
      }
    } else if (!on && cur) {
      if (cur.el) { cur.el.pause(); }
      else { cur.g.gain.setTargetAtTime(0, A.ctx.currentTime, 0.12); var s = cur.src; setTimeout(function () { try { s.stop(); } catch (e) { /* 忽略 */ } }, 600); }
      delete A.loops[key];
    } else if (on && cur && vol != null && cur.g) {
      cur.g.gain.setTargetAtTime(vol, A.ctx.currentTime, 0.1);
    }
  };

  // BGM：同時只有一首，切換時淡入淡出
  // 中獎、RUSH 的音樂要比平常大聲（不然會被出珠聲、語音蓋掉，聽起來沒感覺）
  var HYPE = { jingle_bigwin: 1.8, bgm_bonus: 1.7, bgm_lt: 1.7, jingle_rush: 1.8, bgm_rush: 1.4, jingle_bigwin_v2: 1.8, bgm_bonus_v2: 1.7, jingle_bigwin_v3: 1.8, bgm_bonus_v3: 1.7 };
  // 中獎音樂一律用最新版：熱血版（v3）→ 第二版（v2）→ 原版
  var LATEST = { jingle_bigwin: ['jingle_bigwin_v3', 'jingle_bigwin_v2'], bgm_bonus: ['bgm_bonus_v3', 'bgm_bonus_v2'] };
  A.hasSound = function (key) { return !A.missing[key] && !!(A.buffers[key] || A.elements[key] || A.streams[key]); };
  A.latest = function (key) {
    var al = PK.BGM_ALIAS && PK.BGM_ALIAS[key]; if (al && !A.missing[al]) return al;   // 新版（v2.html）可以把某首曲子換成別首（例：平常的背景音樂換成應援曲）；舊版沒有設定，不受影響
    var l = LATEST[key];
    if (l) for (var i = 0; i < l.length; i++) {
      if (A.hasSound(l[i])) return l[i];
      if (PK.BGM_STREAM && !A.missing[l[i]] && PK.SOUNDS.bgm.indexOf(l[i]) >= 0) return l[i];   // 新版只載入最新版的曲子：還在解碼中也用它（解碼完會自動開始播），不退回沒載入的舊版
    }
    return key;
  };
  A.playBgm = function (key, force, raw) {
    if (!raw) key = A.latest(key);
    if (!force && A.bgmKey === key) { A.heal(); return; }   // 已經是這一首：順便確認它真的在響（所有狀態都是同一首嗆司曲，被手機暫停過的話原本永遠不會重播）
    A.stopBgm(0.6);
    A.bgmKey = key;
    A.boost = (key && HYPE[key]) || 1; A.applyVolumes();
    if (!key) return;
    var oneShot = key.indexOf('jingle') === 0;
    if (A.useElements) {
      var el = A.elements[key];
      if (!el || A.missing[key]) return;
      el.loop = !oneShot; el.currentTime = 0;
      el.volume = A.muted ? 0 : Math.min(1, A.vol.master * A.vol.bgm * A.duck * A.boost);
      var p = el.play(); if (p && p.catch) p.catch(function () { });
      A.bgmEl = el;
      return;
    }
    var st = A.streams[key];
    if (st && !A.missing[key]) {
      var sel = st.el, now0 = A.ctx.currentTime;
      if (!st.node) { st.node = A.ctx.createMediaElementSource(sel); st.gain = A.ctx.createGain(); st.node.connect(st.gain); st.gain.connect(A.gBgm); }
      st.seq++; sel.loop = !oneShot; sel.muted = false;
      // 平常那首歌被聽牌、大獎的音樂打斷之後，從剛才停下來的地方接著播（每次都從頭會一直只聽到前奏）；其他曲子照舊從頭
      var resume = !oneShot && PK.BGM_ALIAS && key === PK.BGM_ALIAS.bgm_normal && sel.currentTime > 0.5 && !sel.ended;
      st.restart = !resume;
      if (!resume) { try { sel.currentTime = 0; } catch (e) { /* 還沒載到可以跳的程度：從頭播就好 */ } }
      st.gain.gain.cancelScheduledValues(now0); st.gain.gain.setValueAtTime(0, now0); st.gain.gain.setTargetAtTime(1, now0, 0.15);
      A.bgmStream = st; st.denyAt = 0; st.lastT = -1;
      if (!A.hold) tryPlay(st);   // 聲音暫停中（切到背景、全螢幕看漫畫）先不播，恢復時會補播
      return;
    }
    var buf = A.buffers[key];
    if (!buf) {   // 還沒載好：載好會自己開始播（A.load）；之前載入失敗的在這裡重新載入
      if (!A.missing[key] && !A.loading[key] && PK.SOUNDS.bgm.indexOf(key) >= 0) A.load('bgm', key, key);
      return;
    }
    var src = A.ctx.createBufferSource(); src.buffer = buf;
    if (!oneShot) {
      src.loop = true;
      src.loopStart = 0.05;
      src.loopEnd = Math.max(1, buf.duration - 0.45); // 避開尾端淡出
    }
    var g = A.ctx.createGain(); g.gain.value = 0;
    g.gain.setTargetAtTime(1, A.ctx.currentTime, 0.15);
    src.connect(g); g.connect(A.gBgm); src.start();
    A.bgmNode = src; A.bgmGain = g;
  };

  A.stopBgm = function (fade) {
    if (A.bgmEl) { var el = A.bgmEl; el.pause(); A.bgmEl = null; }
    if (A.bgmStream) {
      var ss = A.bgmStream, sq = ss.seq, ft = fade || 0.3;
      ss.gain.gain.cancelScheduledValues(A.ctx.currentTime); ss.gain.gain.setTargetAtTime(0, A.ctx.currentTime, ft / 3);
      setTimeout(function () { if (ss.seq === sq) ss.el.pause(); }, ft * 1000 + 200);   // 淡出後才暫停；這段時間同一首又被播放（seq 變了）就不要停它
      A.bgmStream = null;
    }
    if (A.bgmNode) {
      var n = A.bgmNode, g = A.bgmGain;
      g.gain.setTargetAtTime(0, A.ctx.currentTime, (fade || 0.3) / 3);
      setTimeout(function () { try { n.stop(); } catch (e) { /* 忽略 */ } }, (fade || 0.3) * 1000 + 200);
      A.bgmNode = null; A.bgmGain = null;
    }
    A.bgmKey = null;
  };

  // 語音時壓低 BGM
  A.duckBgm = function (level, sec) {
    A.duck = A.boost > 1 ? Math.max(level, 0.75) : level; A.applyVolumes();
    clearTimeout(A.duckTimer);
    A.duckTimer = setTimeout(function () { A.duck = 1; A.applyVolumes(); }, sec * 1000);
  };

  A.setMuted = function (m) { A.muted = m; A.saveVol(); if (m) { Object.keys(A.loops).forEach(function (k) { A.loop(k, false); }); } };

  PK.Audio = A;
})(window.PK);

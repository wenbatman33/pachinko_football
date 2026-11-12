/* =========================================================
 * 漫畫《PK大逆转》接入遊戲
 * - 累計贏得的珠數（新遊戲不會清掉，存在 pk_manga）→ 到門檻解鎖成就與新的一話（2026-11-11 以前是看累積遊玩時間）
 * - 解鎖當下在液晶播精華預告（約 30 秒），播完可點液晶立刻閱讀
 * - 漫畫櫃：封面入口，列出十話（已解鎖可讀、未解鎖顯示還要贏幾顆）
 * - 閱讀器：條漫（manga/chNN.html?embed=1）。遊戲中預設「邊玩邊看」：閱讀器靠邊、機台讓位繼續玩；切成全螢幕看的時候機台暫停
 * ========================================================= */
(function (PK) {
  'use strict';
  var Mg = { catalog: null, state: null, queue: [], busy: false, prompt: null, overlay: null };
  var KEY = 'pk_manga', BASE = 'manga/';
  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  var CFG = function () { return PK.MANGA; };

  // ---------- 進度存檔 ----------
  function load() {
    var s = null;
    try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { /* 損壞就重來 */ }
    s = s && s.v === 1 ? s : { v: 1, playMs: 0, won: 0, hits: 0, unlocked: [1], read: [], previewed: [1] };
    if (s.unlocked.indexOf(1) < 0) s.unlocked.push(1);   // 第一話一律免費
    // 舊進度（看遊玩時間的年代）沒有 won：已經解鎖的話數照樣保留，贏珠數從「最新那一話的門檻」起算
    if (typeof s.won !== 'number') { var U = CFG().unlockBalls, top = Math.max.apply(null, s.unlocked); s.won = U[Math.min(U.length, top) - 1] || 0; }
    if (typeof s.hits !== 'number') s.hits = s.unlocked.length > 1 || s.playMs > 10 * 60000 ? 1 : 0;   // 玩過一陣子的人當作中過大獎了（新手保證不再給）
    Mg.state = s;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(Mg.state)); } catch (e) { /* 忽略 */ } }
  Mg.save = save;

  // ---------- 時間與珠數的格式 ----------
  function nb(n) { return Math.max(0, Math.ceil(n)).toLocaleString('en-US'); }
  function hm(min) {
    min = Math.max(0, Math.ceil(min));
    var h = Math.floor(min / 60), m = min % 60;
    return h ? h + ' 小时' + (m ? ' ' + (m < 10 ? '0' : '') + m + ' 分' : '') : m + ' 分';
  }
  Mg.playMin = function () { return Mg.state.playMs / 60000; };
  Mg.won = function () { return Mg.state.won || 0; };
  Mg.isUnlocked = function (no) { return Mg.state.unlocked.indexOf(no) >= 0; };
  Mg.chapter = function (no) { return (Mg.catalog && Mg.catalog.chapters || []).filter(function (c) { return c.no === no; })[0] || null; };
  // 目錄（manga/catalog.json）公開的只有話數、標題、格數、封面小圖；每話的頁面網址與預告圖編過碼放在 x，
  // 解鎖了才解開（編碼方式跟 tools/build_manga.py 的 obf 一樣）。網址本身是一串亂碼，猜不到也不寫在看得懂的地方。
  // 回傳 { page, preview }；沒解鎖或解不開就回 null
  var OBF_KEY = 'pk-manga-v1';
  function unveil(no) {
    var c = Mg.chapter(no); if (!c || !c.x || !Mg.isUnlocked(no)) return null;
    if (c._open) return c._open;
    try {
      var key = OBF_KEY + ':' + no, h = 2166136261, i;
      for (i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
      var x = h || 1, bin = atob(c.x), out = new Uint8Array(bin.length);
      for (i = 0; i < bin.length; i++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; out[i] = bin.charCodeAt(i) ^ (x & 255); }
      c._open = JSON.parse(new TextDecoder('utf-8').decode(out));
    } catch (e) { console.warn('漫画目录解不开', e); return null; }
    return c._open;
  }

  // ---------- 累計贏得的珠數 → 解鎖（遊玩時間還是照記，只當統計，不影響解鎖） ----------
  var saveAcc = 0;
  Mg.tick = function (dt, active) {
    if (!Mg.state) return;
    dt = Math.min(dt, 0.5);   // 切回分頁時不會一次算進一大段
    if (active) {
      Mg.state.playMs += dt * 1000;
      saveAcc += dt;
      if (saveAcc > 10) { saveAcc = 0; save(); }
    }
    stepPreview();
    drawPrompt();
  };
  // 機台每吐出珠子就呼叫（js/game.js 的 addBalls）；存檔交給上面每 10 秒一次的定期存檔，解鎖當下另外立刻存
  Mg.addWon = function (n) { if (!Mg.state || !(n > 0)) return; Mg.state.won = (Mg.state.won || 0) + n; checkUnlock(); };
  Mg.noteHit = function () { if (!Mg.state) return; Mg.state.hits = (Mg.state.hits || 0) + 1; save(); };
  function checkUnlock() {
    var mins = Mg.won(), U = CFG().unlockBalls, got = false;
    for (var i = 0; i < U.length; i++) {
      var no = i + 1;
      if (mins >= U[i] && !Mg.isUnlocked(no)) { Mg.state.unlocked.push(no); got = true; }
    }
    if (got) { Mg.state.unlocked.sort(function (a, b) { return a - b; }); save(); queuePreviews(); if (Mg.refreshBtn) Mg.refreshBtn(); }   // 鈕上亮「新」
  }
  // 解鎖了但還沒播過液晶預告的話數，排進佇列（一次播一話）
  function queuePreviews() {
    Mg.state.unlocked.forEach(function (no) {
      if (Mg.state.previewed.indexOf(no) < 0 && Mg.queue.indexOf(no) < 0 && Mg.chapter(no)) Mg.queue.push(no);
    });
  }

  // ---------- 液晶精華預告 ----------
  function loadImg(src) {
    return new Promise(function (res) {
      var im = new Image(); var done = false;
      var fin = function () { if (!done) { done = true; res(im.naturalWidth ? im : null); } };
      im.onload = fin; im.onerror = fin; setTimeout(fin, 10000); im.src = src;
    });
  }
  function stepPreview() {
    var G = PK.Game, L = PK.LCD;
    if (Mg.busy || !Mg.queue.length || !Mg.started || Mg.overlay) return;
    if (G.paused || G.spinning || G.inBonus || G.cutscene || (L && L.cineBusy)) return;   // 只在兩轉之間的空檔播，不打斷轉輪或大獎
    var no = Mg.queue[0];
    if (!Mg.chapter(no)) return;   // 目錄還沒載到：先不播，等目錄好了再說
    Mg.busy = true;
    G.cutscene = true;   // 主迴圈看到這個旗標就先不開下一轉（保留照樣會累積）
    var released = false;
    // 不管成功、失敗或卡住，一定放開機台：最多 60 秒
    var finish = function (ok) {
      if (released) return; released = true; clearTimeout(guard);
      Mg.queue.shift();
      if (ok && Mg.state.previewed.indexOf(no) < 0) Mg.state.previewed.push(no);
      save();
      G.cutscene = false; Mg.busy = false;
      if (ok) Mg.prompt = { no: no, until: Date.now() + CFG().readPromptSec * 1000 };
    };
    var guard = setTimeout(function () { finish(false); }, 60000);
    var run;
    try { run = playPreview(no); } catch (e) { run = Promise.reject(e); }
    run.then(function () { finish(true); }, function (e) { console.warn('漫画预告失败', e); finish(false); });
  }
  // 液晶上的字：用支援繁體中文的字型，自己畫（遊戲內建的大字是日文字型＋粗描邊，繁中會糊）
  var TC = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif';
  function capFx(text) {
    return function (ctx, c, k, lt) {
      if (!text) return;
      var a = Math.min(1, Math.max(0, (lt - 0.2) / 0.3)); if (!a) return;
      ctx.save(); ctx.globalAlpha = a;
      ctx.font = '700 40px ' + TC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      var w = Math.min(c.w - 40, ctx.measureText(text).width + 60), y = 575;
      ctx.fillStyle = 'rgba(8,4,12,0.72)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(c.w / 2 - w / 2, y - 34, w, 68, 14); else ctx.rect(c.w / 2 - w / 2, y - 34, w, 68); ctx.fill();
      ctx.lineJoin = 'round'; ctx.lineWidth = 5; ctx.strokeStyle = '#120408'; ctx.strokeText(text, c.w / 2, y + 2, c.w - 70);
      ctx.fillStyle = '#ffffff'; ctx.fillText(text, c.w / 2, y + 2, c.w - 70);
      ctx.restore();
    };
  }
  function titleFx(main, sub) {
    return function (ctx, c, k, lt) {
      var e = Math.min(1, lt / 0.35), sc = 0.7 + 0.3 * (1 - Math.pow(1 - e, 3)) + (e >= 1 ? 0 : 0.08 * Math.sin(e * 3.14));
      ctx.save();
      ctx.fillStyle = 'rgba(8,4,12,0.55)'; ctx.fillRect(0, 230, c.w, 210);
      ctx.translate(c.w / 2, 305); ctx.scale(sc, sc);
      ctx.font = '900 92px ' + TC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
      var g = ctx.createLinearGradient(0, -46, 0, 46); g.addColorStop(0, '#fff6c8'); g.addColorStop(0.5, '#f2c44a'); g.addColorStop(1, '#b0700f');
      ctx.shadowColor = 'rgba(255,190,60,0.8)'; ctx.shadowBlur = 24;
      ctx.lineWidth = 14; ctx.strokeStyle = '#4a0010'; ctx.strokeText(main, 0, 0);
      ctx.shadowBlur = 0; ctx.fillStyle = g; ctx.fillText(main, 0, 0);
      ctx.restore();
      if (sub && lt > 0.3) {
        ctx.save(); ctx.globalAlpha = Math.min(1, (lt - 0.3) / 0.3);
        ctx.font = '700 34px ' + TC; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        ctx.lineWidth = 6; ctx.strokeStyle = '#120408'; ctx.strokeText(sub, c.w / 2, 395, c.w - 60);
        ctx.fillStyle = '#ffe9b8'; ctx.fillText(sub, c.w / 2, 395, c.w - 60);
        ctx.restore();
      }
    };
  }
  function playPreview(no) {
    var ch = Mg.chapter(no), A = PK.Assets, D = PK.Director, FX = PK.FX, sec = CFG().previewShot;
    var pics = ((unveil(no) || {}).preview || []).slice();
    return Promise.all(pics.map(function (p) { return loadImg(BASE + p.img); })).then(function (ims) {
      var shots = [], keys = [];
      ims.forEach(function (im, i) { if (!im) return; var k = 'mg_' + ch.no + '_' + i; A.imgs[k] = im; keys.push({ k: k, text: pics[i].text }); });
      if (!keys.length) throw new Error('预告图片都读不到');   // 當作失敗：不顯示「點液晶閱讀」，下次開頁面再播
      var ach = CFG().achievements[no - 1];
      // 開場：解鎖大字
      shots.push({ img: keys[0].k, dur: 3.4, z0: 1.25, z1: 1.05, flash: '#ffd23f', sfx: 'rainbow', confetti: 120, letter: true,
        fx: titleFx('第' + NUM[no] + '话 解锁！', '〈' + ch.title + '〉　成就「' + ach + '」') });
      // 精華格：每格輕微推近或拉遠，下方一句台詞
      keys.forEach(function (o, i) {
        if (i === 0) return;
        var inward = i % 2 === 1;
        shots.push({ img: o.k, dur: sec, z0: inward ? 1.04 : 1.2, z1: inward ? 1.2 : 1.04, f0: [0.5, 0.5], f1: [i % 3 === 0 ? 0.42 : 0.58, 0.46],
          fx: capFx(o.text) });   // 字幕在 y≈575：液晶底部 y≈672 是保留燈
      });
      // 收尾：去漫畫櫃
      shots.push({ img: keys[0].k, dur: 3.2, z0: 1.05, z1: 1.12, letter: true, sfx: 'yaku',
        fx: titleFx('漫画柜已开放', '点液晶，立刻阅读第' + NUM[no] + '话') });
      PK.Audio.duckBgm(0.35, shots.reduce(function (a, s) { return a + s.dur; }, 0));
      return D.cine(shots, { z: 48 });
    }).then(function () {
      Object.keys(A.imgs).forEach(function (k) { if (k.indexOf('mg_' + ch.no + '_') === 0) delete A.imgs[k]; });   // 播完就放掉，不佔記憶體
    });
  }
  // 預告播放中與播完後幾秒內，液晶下方一行「點液晶閱讀」（畫在液晶前景層）
  function drawPrompt() {
    var L = PK.LCD; if (!L) return;
    if (!L.overlays) L.overlays = [];   // 疊加清單平常要等演出用到才會建立
    var no = Mg.busy ? Mg.queue[0] : (Mg.prompt && Date.now() < Mg.prompt.until ? Mg.prompt.no : 0);
    if (!no || Mg.overlay) return;
    if (!Mg.busy && Mg.prompt && Date.now() >= Mg.prompt.until) Mg.prompt = null;
    var during = Mg.busy;
    L.overlays.push(function (ctx) {
      var C = PK.LCD_LAYOUT, a = 0.7 + 0.3 * Math.sin(Date.now() / 220);
      ctx.save();
      ctx.font = '700 ' + (during ? 26 : 32) + 'px ' + TC; ctx.textBaseline = 'middle';
      if (during) {
        // 預告播放中：右上角小標籤（不擋畫面和台詞）
        var t = '点液晶 直接阅读 ▶', w = ctx.measureText(t).width + 30, x = C.w - w - 16, y = 16;
        ctx.globalAlpha = 0.85; ctx.fillStyle = 'rgba(20,4,10,0.85)'; ctx.strokeStyle = '#e8b440'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, 44, 22) : ctx.rect(x, y, w, 44); ctx.fill(); ctx.stroke();
        ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.fillStyle = '#ffe9a0'; ctx.fillText(t, x + w / 2, y + 23);
      } else {
        // 播完後：轉輪和保留燈之間的一條橫帶
        var t2 = '▶ 点液晶，立刻阅读第' + NUM[no] + '话';
        ctx.fillStyle = 'rgba(0,0,0,0.62)'; ctx.fillRect(0, 588, C.w, 52);
        ctx.globalAlpha = a; ctx.textAlign = 'center'; ctx.lineWidth = 6; ctx.strokeStyle = '#1a0006'; ctx.strokeText(t2, C.w / 2, 615);
        ctx.fillStyle = '#ffe9a0'; ctx.fillText(t2, C.w / 2, 615);
      }
      ctx.restore();
    });
  }
  // 機台的液晶被點：預告中或剛播完 → 開閱讀器
  Mg.tapLcd = function () {
    var no = Mg.busy ? Mg.queue[0] : (Mg.prompt && Date.now() < Mg.prompt.until ? Mg.prompt.no : 0);
    if (!no) return false;
    Mg.prompt = null;
    Mg.openReader(no);
    return true;
  };
  Mg.canTapLcd = function () { return !!(Mg.busy || (Mg.prompt && Date.now() < Mg.prompt.until)); };

  // ---------- 暫停機台（看漫畫的時候） ----------
  var pauseMemo = null;
  // 聲音的開關：暫停／恢復都是「下命令」，不看當下的狀態。
  // 原本恢復前先檢查「是不是已經暫停」——但暫停要過一下才生效，開漫畫時「先暫停、馬上因為邊玩邊看又恢復」，
  // 檢查當下還沒暫停完，恢復就被跳過，之後整台都沒聲音（使用者 2026-11-11：「可是分割後就沒聲音了」）。
  // 恢復之後過一下再確認一次，沒在響就再叫一次
  Mg.audioOff = false;
  // 2026-11-12 起實際的暫停與恢復在 js/audio.js 的 A.setHold：連正在播的歌一起停（原本只停聲音輸出），
  // 恢復之後每秒巡檢、每次觸控都會再對一次（原本只多試一次，手機上沒成功就整台沒聲音）
  function setAudio(on) {
    var Au = PK.Audio; Mg.audioOff = !on;
    if (Au && Au.setHold) Au.setHold('manga', !on);
  }
  function pauseGame() {
    if (pauseMemo || !Mg.started) return;
    var G = PK.Game, M = PK.Machine;
    pauseMemo = { paused: G.paused, stopped: M && M.U ? M.U.stopped : false };
    G.paused = true; if (M && M.U) M.U.stopped = true;
    setAudio(false);
  }
  function resumeGame() {
    if (!pauseMemo) return;
    var G = PK.Game, M = PK.Machine;
    G.paused = pauseMemo.paused; if (M && M.U) M.U.stopped = pauseMemo.stopped; pauseMemo = null;
    setAudio(true);
  }

  // ---------- 漫畫櫃與閱讀器（DOM 疊在機台上） ----------
  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function closeOverlay() {
    if (!Mg.overlay) return;
    var wasDock = Mg.dockOn; Mg.dockOn = false; Mg.loadChapter = null; Mg._drag = null;
    Mg.overlay.remove(); Mg.overlay = null;
    document.body.classList.remove('mg-open'); document.body.classList.remove('mg-docked');
    resumeGame();
    if (wasDock) relayout();   // 機台放回整個螢幕
    Mg.refreshBtn();
    if (Mg.onCoverChange) Mg.onCoverChange();
  }
  Mg.close = closeOverlay;
  // keep＝這個畫面開著的時候機台照常跑（邊玩邊看的閱讀器）：一開始就不暫停，機台和聲音都不會斷一下
  function shell(cls, keep) {
    var wasDock = Mg.dockOn; Mg.dockOn = false; document.body.classList.remove('mg-docked'); Mg.loadChapter = null;
    if (Mg.overlay) { Mg.overlay.remove(); Mg.overlay = null; }
    if (!keep) pauseGame();
    var o = el('div', 'mg-overlay ' + cls); document.body.appendChild(o); Mg.overlay = o;
    document.body.classList.add('mg-open');
    if (wasDock) relayout();
    if (Mg.btn) Mg.btn.style.display = Mg.homeBtn.style.display = 'none';   // 漫畫開著的時候收起機台外面的兩顆鈕
    return o;
  }

  // ---------- 邊玩邊看：閱讀器靠邊，機台讓位繼續玩 ----------
  // 寬螢幕漫畫在右邊、瘦長螢幕漫畫在上面（PK.SPLIT）；玩家拖中間的把手可以改分割位置。
  // 要不要邊玩邊看、拖過的位置記在這台裝置的 pk_manga_split（讀不到就用預設，不影響功能）
  var SPLIT_KEY = 'pk_manga_split';
  Mg.split = { on: true, tall: 0, wide: 0 };
  try { var sv = JSON.parse(localStorage.getItem(SPLIT_KEY) || 'null'); if (sv && typeof sv === 'object') { if (typeof sv.on === 'boolean') Mg.split.on = sv.on; if (sv.tall > 0) Mg.split.tall = +sv.tall; if (sv.wide > 0) Mg.split.wide = +sv.wide; } } catch (e) { /* 忽略 */ }
  function saveSplit() { try { localStorage.setItem(SPLIT_KEY, JSON.stringify(Mg.split)); } catch (e) { /* 忽略 */ } }
  function relayout() { if (PK.UI && PK.UI.layout) PK.UI.layout(); }
  Mg.dockOn = false;
  Mg.docked = function () { return !!(Mg.overlay && Mg.dockOn); };
  // 機台排版時（js/machine.js 的 fit）來問：漫畫佔哪一邊（right／top）、多大（畫面像素）；同時把閱讀器擺到那一塊。W、H＝可用的畫面大小
  Mg.dock = function (W, H) {
    if (!Mg.docked()) return null;
    var S = PK.SPLIT, o = Mg.overlay, st = o.style, room = W - H * 2 / 3, side, size;   // room＝機台用滿高度之後右邊還剩多寬
    if (room >= S.wideMin) { side = 'right'; size = Mg.split.wide > 0 ? Mg.split.wide : Math.min(room, S.wideMax); size = Math.round(Math.max(S.wideMin, Math.min(size, W - 260))); }
    else { side = 'top'; size = Math.round(H * Math.max(0.3, Math.min(0.72, Mg.split.tall > 0 ? Mg.split.tall : S.tall))); }
    Mg.dockSide = side; Mg.dockW = W; Mg.dockH = H;
    o.classList.toggle('mg-dock-right', side === 'right'); o.classList.toggle('mg-dock-top', side === 'top');
    st.left = (side === 'right' ? W - size : 0) + 'px'; st.top = '0px'; st.width = (side === 'right' ? size : W) + 'px'; st.height = (side === 'right' ? H : size) + 'px';
    return { side: side, size: size };
  };
  // 切換「邊玩邊看／全螢幕看」（只有閱讀器能邊玩邊看）。start＝玩家自己按了切換鈕：還在首頁的話直接進遊戲再分割
  // （從首頁開漫畫時機台還沒開始，預設全螢幕看；使用者 2026-11-11 問「分割怎麼操作」——首頁進來原本連切換鈕都沒有）
  function setDock(on, start) {
    var o = Mg.overlay; if (!o) return;
    if (on && start && !Mg.started && o.classList.contains('mg-reader') && PK.Machine && PK.Machine.start) PK.Machine.start();
    Mg.dockOn = !!on && !!Mg.started && o.classList.contains('mg-reader');
    o.classList.toggle('mg-dock', Mg.dockOn); document.body.classList.toggle('mg-docked', Mg.dockOn);
    if (!Mg.dockOn) { o.classList.remove('mg-dock-right'); o.classList.remove('mg-dock-top'); o.style.left = o.style.top = o.style.width = o.style.height = ''; }
    if (Mg.dockOn) resumeGame(); else pauseGame();   // 邊玩邊看：機台照常跑；全螢幕看：機台暫停
    var b = o.querySelector('.mg-split'); if (b) b.innerHTML = Mg.dockOn ? '<b>⛶</b><span>全屏幕</span>' : '<b>◫</b><span>边玩边看</span>';
    relayout();
  }
  Mg.setDock = function (on) { Mg.split.on = !!on; saveSplit(); setDock(on, true); };

  Mg.openCabinet = function () {
    if (!Mg.catalog) { if (Mg.init) Mg.init().then(function () { if (Mg.catalog) Mg.openCabinet(); }); return; }   // 目錄還沒載到：先重新載入再打開
    var o = shell('mg-cabinet'), mins = Mg.won(), U = CFG().unlockBalls, ACH = CFG().achievements;
    var got = Mg.state.unlocked.length;
    var head = el('div', 'mg-head');
    head.appendChild(el('div', 'mg-title', '漫画柜'));
    head.appendChild(el('div', 'mg-sub', 'PK大逆转 —— 从防波堤，踢到世界杯'));
    head.appendChild(el('div', 'mg-stat', '累计赢得 <b>' + nb(mins) + ' 颗</b>　｜　成就 <b>' + got + ' / ' + U.length + '</b>'));
    var x = el('button', 'mg-x', '‹ 返回'); x.title = '关闭漫画柜'; x.onclick = closeOverlay; o.appendChild(x);
    o.appendChild(head);
    var grid = el('div', 'mg-grid'); o.appendChild(grid);
    for (var no = 1; no <= U.length; no++) (function (no) {
      var ch = Mg.chapter(no), open = Mg.isUnlocked(no) && ch, isNew = open && Mg.state.read.indexOf(no) < 0 && no > 1;
      var card = el(open ? 'button' : 'div', 'mg-card' + (open ? '' : ' locked'));
      var pic = el('div', 'mg-pic');
      if (ch) { var im = new Image(); im.loading = 'lazy'; im.src = BASE + ch.cover; im.alt = ''; pic.appendChild(im); }
      if (!open) pic.appendChild(el('div', 'mg-lock', '🔒'));
      if (isNew) pic.appendChild(el('div', 'mg-new', '新'));
      card.appendChild(pic);
      var b = el('div', 'mg-body');
      b.appendChild(el('div', 'mg-no', '第' + NUM[no] + '话'));
      b.appendChild(el('div', 'mg-t', esc(ch ? ch.title : '制作中')));
      b.appendChild(el('div', 'mg-ach', '🏆 ' + esc(ACH[no - 1])));
      if (open) b.appendChild(el('div', 'mg-go', Mg.state.read.indexOf(no) >= 0 ? '再读一次 →' : '开始阅读 →'));
      else {
        var need = U[no - 1], prev = no > 1 ? U[no - 2] : 0, k = Math.max(0, Math.min(1, (mins - prev) / (need - prev)));
        b.appendChild(el('div', 'mg-need', '累计赢得 ' + nb(need) + ' 颗解锁'));
        var bar = el('div', 'mg-bar'); var fill = el('i'); fill.style.width = (mins >= prev ? k * 100 : 0) + '%'; bar.appendChild(fill); b.appendChild(bar);
        b.appendChild(el('div', 'mg-left', '再赢 ' + nb(need - mins) + ' 颗'));
      }
      card.appendChild(b);
      if (open) card.onclick = function () { Mg.openReader(no); };
      grid.appendChild(card);
    })(no);
    o.appendChild(el('div', 'mg-foot', '赢得的珠数只算机台吐出来的（进洞、大奖、点球对决），买的不算。按「新游戏」也不会清掉漫画进度。'));
  };

  // 閱讀器：手機 app 的排法——所有操作都在底部工具列（拇指按得到、不會被狀態列／瀏海蓋住）：
  // 關閉｜上一話｜第 N 話（點開話數清單）｜下一話｜邊玩邊看／全螢幕
  // 使用者 2026-11-11：「手機 pwa 看漫畫後根本無法回到主畫面也無法換級數」「你可以使用手機 app 思維來調整介面嗎」
  // ——原本的返回與關閉鈕都在最上面，加到主畫面的全螢幕模式下剛好被狀態列蓋住，按不到。
  // 換話不重開閱讀器（只換漫畫頁），分割的位置不會跳一下
  Mg.openReader = function (no) {
    var ch = Mg.chapter(no);
    if (!ch || !Mg.isUnlocked(no)) { Mg.openCabinet(); return; }
    if (Mg.overlay && Mg.overlay.classList.contains('mg-reader') && Mg.loadChapter) { Mg.loadChapter(no); return; }
    var o = shell('mg-reader', !!(Mg.split.on && Mg.started)), cur = 0;
    var f = el('iframe', 'mg-frame'); o.appendChild(f);
    var bar = el('div', 'mg-tool'); o.appendChild(bar);
    var tb = function (cls, icon, label, fn) { var b = el('button', 'mg-tb ' + cls, '<b>' + icon + '</b><span>' + label + '</span>'); b.onclick = fn; bar.appendChild(b); return b; };
    tb('mg-close', '✕', '关闭', closeOverlay);
    var prev = tb('mg-prev', '‹', '上一话', function () { step(-1); });
    var pick = tb('mg-pick', '', '', function () { openSheet(); });
    var next = tb('mg-next', '›', '下一话', function () { step(1); });
    tb('mg-split', '◫', '边玩边看', function () { Mg.setDock(!Mg.dockOn); });   // 還在首頁時按它＝進遊戲並分割
    var toastT = 0;
    function toast(text) {
      var t = o.querySelector('.mg-toast') || o.appendChild(el('div', 'mg-toast'));
      t.textContent = text; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('on'); }, 2400);
    }
    function need(n) { return Math.max(0, CFG().unlockBalls[n - 1] - Mg.won()); }
    function step(d) {
      var n = cur + d; if (n < 1 || n > 10) return;
      if (!Mg.chapter(n)) { toast('第' + NUM[n] + '话还在制作中'); return; }
      if (!Mg.isUnlocked(n)) { toast('第' + NUM[n] + '话还没解锁：再赢 ' + nb(need(n)) + ' 颗'); return; }
      load(n);
    }
    function load(n) {
      var c = Mg.chapter(n), u = unveil(n); if (!c || !u) return;
      cur = n; Mg.reading = n; closeSheet();
      f.src = BASE + u.page + '?embed=1'; f.title = '第' + NUM[n] + '话';
      pick.innerHTML = '<b>第 ' + n + ' 话 ▾</b><span>' + esc(c.title) + '</span>';
      prev.disabled = n <= 1;
      var nx = n < CFG().unlockBalls.length && Mg.chapter(n + 1), lock = nx && !Mg.isUnlocked(n + 1);
      next.disabled = !nx; next.classList.toggle('locked', !!lock);
      next.innerHTML = '<b>' + (lock ? '🔒' : '›') + '</b><span>' + (lock ? '未解锁' : '下一话') + '</span>';
      if (Mg.state.read.indexOf(n) < 0) Mg.state.read.push(n);
      Mg.state.last = n; save();   // 記住看到哪一話：遊戲中按「看漫畫」直接接著看
    }
    Mg.loadChapter = load;
    // 話數清單：從底部滑上來的面板，直接在閱讀器裡換話（不用回漫畫櫃）
    function closeSheet() { var sh = o.querySelector('.mg-sheet'); if (sh) sh.remove(); }
    function openSheet() {
      if (o.querySelector('.mg-sheet')) { closeSheet(); return; }
      var sh = el('div', 'mg-sheet'), box = el('div', 'mg-sheet-box'); sh.appendChild(box);
      var hd = el('div', 'mg-sheet-h', '<div><b>选一话</b><span>累计赢得 ' + nb(Mg.won()) + ' 颗</span></div>'); box.appendChild(hd);
      var sx = el('button', 'mg-sheet-x', '✕'); sx.title = '收起清单'; sx.onclick = closeSheet; hd.appendChild(sx);   // 面板自己要有關閉鈕：邊玩邊看時面板幾乎蓋滿閱讀器，外面沒地方點
      var list = el('div', 'mg-sheet-list'); box.appendChild(list);
      for (var n = 1; n <= CFG().unlockBalls.length; n++) (function (n) {
        var c = Mg.chapter(n), open = c && Mg.isUnlocked(n), read = Mg.state.read.indexOf(n) >= 0;
        var row = el(open ? 'button' : 'div', 'mg-row' + (n === cur ? ' cur' : '') + (open ? '' : ' locked'));
        var pic = el('div', 'mg-row-pic'); if (c) { var im = new Image(); im.loading = 'lazy'; im.src = BASE + c.cover; im.alt = ''; pic.appendChild(im); } row.appendChild(pic);
        row.appendChild(el('div', 'mg-row-t', '<i>第' + NUM[n] + '话</i><b>' + esc(c ? c.title : '制作中') + '</b>'));
        row.appendChild(el('div', 'mg-row-s' + (open && !read && n !== cur ? ' new' : ''), n === cur ? '正在看' : open ? (read ? '已读' : '新') : c ? '🔒 再赢 ' + nb(need(n)) + ' 颗' : '制作中'));
        if (open) row.onclick = function () { load(n); };
        list.appendChild(row);
      })(n);
      sh.onclick = function (e) { if (e.target === sh) closeSheet(); };
      o.appendChild(sh);
      var c0 = list.querySelector('.cur'); if (c0 && c0.scrollIntoView) c0.scrollIntoView({ block: 'center' });
    }
    // 分割線上的把手：拖它改漫畫與機台各佔多大（放開才存）。
    // 拖的時候漫畫頁暫時不收滑鼠事件（不然游標一進漫畫頁，事件就被它吃掉）；移動與放開都在整個視窗上聽（見下面的 dragMove／dragEnd），
    // 放開的事件不管送到哪裡都收得到——原本只聽把手自己，萬一漏接，漫畫頁就一直不收滑鼠、滾輪捲不動
    // （使用者 2026-11-11：「螢幕比例調整後滑鼠就無法捲動了」）
    var grip = el('div', 'mg-grip'); o.appendChild(grip);
    grip.onpointerdown = function (e) {
      Mg._drag = o; o.classList.add('mg-dragging');
      try { grip.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      e.preventDefault();
    };
    load(no);
    setDock(Mg.split.on);
  };

  // ---------- 遊戲中的「看漫畫」鈕 ----------
  // 使用者 2026-11-11：「問題是不能由遊戲開嗎？」——機台左下的漫畫等級條其實點了會開，但它看起來不像按鈕、手機上又很小。
  // 所以在機台外面的空帶放一顆明顯的鈕（手機＝機台上方、寬螢幕＝機台右邊；都沒有空帶就縮成機台右上角的小圓鈕），
  // 按一下直接邊玩邊看：有還沒讀的新話就開那一話，不然接著上次看的那一話
  Mg.openCurrent = function () {
    if (!Mg.state) return;
    var un = Mg.state.unlocked.slice().sort(function (a, b) { return a - b; }), no = 0;
    for (var i = 0; i < un.length; i++) if (Mg.state.read.indexOf(un[i]) < 0) { no = un[i]; break; }
    if (!no) no = Mg.state.last || 1;
    if (Mg.isUnlocked(no) && Mg.chapter(no)) Mg.openReader(no); else Mg.openCabinet();
  };
  // 遊戲中機台外面的兩顆鈕：「看漫畫」（黃色，主要）與「首頁」（深色，次要）。
  // 加到手機主畫面之後沒有瀏覽器的上一頁／重新整理，沒有「首頁」鈕就回不去標題畫面（新遊戲、漫畫櫃都在那裡）。
  // 位置：手機＝機台上方的空帶（首頁在左、看漫畫在右，避開瀏海）；寬螢幕＝機台右邊上下排；都沒有空帶＝機台左上、右上角的小圓鈕
  Mg.refreshBtn = function () {
    var b = Mg.btn, h = Mg.homeBtn;
    if (!b) {
      b = Mg.btn = el('button', 'mg-fab', '<span>看漫画</span><i>新</i>'); b.title = '边玩边看漫画';
      b.onclick = function () { if (PK.Audio && PK.Audio.unlock) PK.Audio.unlock(); Mg.openCurrent(); };
      document.body.appendChild(b);
      h = Mg.homeBtn = el('button', 'mg-fab mg-fab-home', '<span>首页</span>'); h.title = '回首页（进度会保留）';
      h.onclick = function () { if (PK.Machine && PK.Machine.goHome) PK.Machine.goHome(); };
      document.body.appendChild(h);
    }
    var M = PK.Machine, show = !!(Mg.started && Mg.state && !Mg.overlay && M && M.rect && !(PK.Duel && PK.Duel.active));
    b.style.display = h.style.display = show ? '' : 'none'; if (!show) return;
    var unread = Mg.state.unlocked.some(function (n) { return Mg.state.read.indexOf(n) < 0; });
    b.classList.toggle('mg-fab-new', unread);
    var r = M.rect(), W = window.innerWidth, bh = (PK.SPLIT && PK.SPLIT.btnH) || 46, st = b.style, hs = h.style;
    st.height = hs.height = bh + 'px'; st.fontSize = hs.fontSize = Math.round(bh * 0.4) + 'px';
    b.classList.remove('mg-fab-mini'); h.classList.remove('mg-fab-mini');
    var bw = b.offsetWidth, hw = h.offsetWidth;
    if (r.y >= bh + 14) {                        // 機台上面有空帶：首頁靠左、看漫畫靠右
      var top = 'max(calc(var(--sat) + 6px), ' + Math.round((r.y - bh) / 2) + 'px)';   // --sat＝狀態列／瀏海的高度（css/style.css）
      st.left = Math.round(Math.min(W - bw - 12, r.x + r.w - bw - 10)) + 'px'; st.top = top;
      hs.left = Math.round(Math.max(12, r.x + 10)) + 'px'; hs.top = top;
    } else if (W - (r.x + r.w) >= Math.max(bw, hw) + 26) {     // 機台右邊有空帶：上下排
      st.left = hs.left = Math.round(r.x + r.w + 14) + 'px'; st.top = Math.round(r.y + 16) + 'px'; hs.top = Math.round(r.y + 16 + bh + 14) + 'px';
    } else {                                     // 都沒有（例如直立的平板）：機台左上、右上角的小圓鈕
      b.classList.add('mg-fab-mini'); h.classList.add('mg-fab-mini');
      st.left = Math.round(r.x + r.w - bh - 8) + 'px'; st.top = hs.top = Math.round(r.y + 8) + 'px'; hs.left = Math.round(r.x + 8) + 'px';
    }
  };
  // ---------- 拖分割把手、滾輪：都在整個視窗上聽 ----------
  Mg._drag = null;   // 正在拖把手的那個閱讀器
  function dragMove(e) {
    var o = Mg._drag; if (!o) return;
    if (o !== Mg.overlay || !Mg.dockOn) { dragEnd(); return; }
    if (e.pointerType === 'mouse' && e.buttons === 0) { dragEnd(); return; }   // 滑鼠鍵其實已經放開了（放開的事件漏接）：結束拖曳
    if (Mg.dockSide === 'right') Mg.split.wide = Math.max(1, Mg.dockW - e.clientX); else Mg.split.tall = Math.max(0.01, e.clientY / Mg.dockH);
    relayout();
  }
  function dragEnd() {
    var o = Mg._drag; if (!o) return;
    Mg._drag = null; o.classList.remove('mg-dragging'); saveSplit();
  }
  window.addEventListener('pointermove', dragMove);
  ['pointerup', 'pointercancel', 'blur'].forEach(function (t) { window.addEventListener(t, dragEnd, true); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) dragEnd(); });
  // 滑鼠滾輪：游標在漫畫頁上本來就會捲；停在機台、分割線或工具列上時也一樣捲漫畫（機台用不到滾輪），不用特地把游標移回去
  window.addEventListener('wheel', function (e) {
    var o = Mg.overlay; if (!o || !o.classList.contains('mg-reader')) return;
    if (e.target && e.target.closest && e.target.closest('.mg-sheet')) return;   // 話數清單自己會捲
    var f = o.querySelector('.mg-frame'); if (!f || !f.contentWindow) return;
    var dy = e.deltaMode === 1 ? e.deltaY * 32 : e.deltaMode === 2 ? e.deltaY * f.clientHeight : e.deltaY;
    // 漫畫頁本身設了平滑捲動；滾輪一格一格送過來時要直接到位，不然每一格都重新起跑，捲起來又慢又頓
    try { f.contentWindow.scrollBy({ top: dy, left: 0, behavior: 'instant' }); } catch (err) { try { f.contentWindow.scrollBy(0, dy); } catch (e2) { /* 忽略 */ } }
  }, { passive: true });
  // 閱讀頁（iframe）傳回來的訊息：下一話、回漫畫櫃
  window.addEventListener('message', function (e) {
    var d = e.data; if (!d || typeof d !== 'object' || !Mg.overlay) return;
    if (e.origin !== location.origin && location.protocol !== 'file:') return;
    if (d.type === 'pk-manga-next') {
      if (Mg.isUnlocked(d.no)) Mg.openReader(d.no); else Mg.openCabinet();
    } else if (d.type === 'pk-manga-cabinet') Mg.openCabinet();
  });
  window.addEventListener('keydown', function (e) { if (Mg.overlay && e.key === 'Escape') closeOverlay(); });

  // 機台計量表用：等級＝已解鎖話數；下一話的進度（0～1）與還要贏幾顆；還沒讀的新話數
  Mg.progress = function () {
    if (!Mg.state) return null;
    var U = CFG().unlockBalls, mins = Mg.won(), next = 0;
    for (var no = 1; no <= U.length; no++) if (!Mg.isUnlocked(no)) { next = no; break; }
    var unread = Mg.state.unlocked.filter(function (n) { return n > 1 && Mg.state.read.indexOf(n) < 0; }).length;
    if (!next) return { level: 10, next: 0, k: 1, left: 0, unread: unread };
    var prev = next > 1 ? U[next - 2] : 0, need = U[next - 1];
    return { level: Mg.state.unlocked.length, next: next, nextName: '第' + NUM[next] + '话', k: Math.max(0, Math.min(1, (mins - prev) / ((need - prev) || 1))), left: Math.max(0, need - mins), leftText: nb(need - mins) + ' 颗', unread: unread };
  };

  // 封面按鈕上的文字
  Mg.coverLabel = function () {
    if (!Mg.state) return '漫画柜';
    var unread = Mg.state.unlocked.filter(function (n) { return n > 1 && Mg.state.read.indexOf(n) < 0; }).length;
    return '漫画柜　' + Mg.state.unlocked.length + ' / ' + CFG().unlockBalls.length + ' 话' + (unread ? '　有新话' : '');
  };

  // ---------- 開發工具用 ----------
  Mg.devAddWon = function (n) { Mg.state.won = Mg.won() + n; save(); checkUnlock(); };
  Mg.devUnlockNext = function () {
    var U = CFG().unlockBalls;
    for (var i = 0; i < U.length; i++) if (!Mg.isUnlocked(i + 1)) { Mg.state.won = Math.max(Mg.won(), U[i]); break; }
    save(); checkUnlock();
  };
  Mg.devUnlockAll = function () { Mg.state.won = Math.max(Mg.won(), CFG().unlockBalls[CFG().unlockBalls.length - 1]); Mg.state.previewed = CFG().unlockBalls.map(function (x, i) { return i + 1; }); save(); checkUnlock(); Mg.queue = []; };
  Mg.devReset = function () { Mg.state = { v: 1, playMs: 0, won: 0, hits: 0, unlocked: [1], read: [], previewed: [1] }; Mg.queue = []; Mg.prompt = null; save(); };
  Mg.devReplay = function (no) { if (Mg.isUnlocked(no) && Mg.chapter(no) && Mg.queue.indexOf(no) < 0) Mg.queue.push(no); };

  // ---------- 啟動 ----------
  Mg.init = function () {
    if (!Mg.state) load();   // 重試時不要重讀存檔（會丟掉還沒存的幾秒遊玩時間）
    // 目錄載入失敗（網路不穩）就隔幾秒重試，最多 5 次
    var tries = 0;
    var get = function () {
      tries++;
      return fetch(BASE + 'catalog.json', { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
        .then(function (c) { Mg.catalog = c; queuePreviews(); if (Mg.onCoverChange) Mg.onCoverChange(); })
        .catch(function (e) { if (tries < 5) return new Promise(function (res) { setTimeout(res, 1500 * tries); }).then(get); console.warn('漫画目录加载失败', e); });
    };
    return get();
  };
  Mg.markStarted = function () { Mg.started = true; Mg.refreshBtn(); };   // 進遊戲了：「看漫畫」鈕出現
  window.addEventListener('pagehide', function () { if (Mg.state) save(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden && Mg.state) save(); });

  PK.Manga = Mg;
})(window.PK);

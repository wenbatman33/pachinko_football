/* =========================================================
 * 點球對決：蓋在機台上的漫畫對決小遊戲（足球版，2026-11-12 由棒球版的「投打對決」改寫）
 *
 * - 聽牌沒中時自動進入（PK.Game 的主迴圈在那一轉結束後呼叫 Duel.want／Duel.run）
 * - 對手是已解鎖漫畫各話的門將（PK.DUEL.opponents）；三腳定勝負
 * - 畫面：從主罰者（陸遠）背後看球門。球門裡會出現一個白色準星，外面的黃圈縮到跟準星一樣大的那一刻點下去＝起腳；
 *   前幾話只抓時機（點哪裡都可以），後面的對手要「點在準星上」——位置和時機都要對
 * - 時機完美＝世界波（門將撲錯邊）、不錯＝球進了（門將碰不到）、差一點＝中柱（再來一腳）、太差或沒點＝被撲出
 * - 世界波：送珠子＋漫畫進度往前推；球進了：少量珠子
 *
 * 程式裡的名稱沿用棒球版（改名會牽動開發工具與存檔）：pitch＝這一腳的準星、swing＝起腳、hr＝世界波、hit＝球進了、foul＝中柱、
 * pitcher／mound＝門將與他站的位置、batter＝主罰的陸遠、zone＝球門框內的範圍。
 * 自己一張 2D 畫布，剛好蓋住機台那一塊（PK.Machine.rect()），對決時機台整個停格（不算物理、不畫機台）。
 * 素材不跟首頁一起載入，進遊戲後才在背景載（assets/img/duel/）。數值都在 PK.DUEL（js/config.js），開發工具可以直接開打、拉滑桿、拖版面。
 * ========================================================= */
(function (PK) {
  'use strict';
  var Du = PK.Duel = { active: false, lastSpin: -999, imgs: {}, loading: {}, failed: {} };
  var CFG = function () { return PK.DUEL; };
  var FONT = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif';
  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  var WIND = 0.42;   // 哨音響到準星出現的秒數（主罰者開始助跑）
  var cv = null, g = null, W = 0, H = 0, DPR = 1, raf = 0, st = null, memo = null;
  var clamp01 = function (v) { return Math.max(0, Math.min(1, v)); };
  var play = function (k, o) { try { if (PK.Audio) PK.Audio.play(k, o); } catch (e) { /* 忽略 */ } };
  var voice = function (k) { try { if (PK.Audio) PK.Audio.voice(k); } catch (e) { /* 忽略 */ } };

  // ---------- 素材（第一次要用之前才載入）----------
  function load(key) {
    if (Du.imgs[key] || Du.loading[key] || Du.failed[key]) return;   // 載不到的不要一直重試
    var im = new Image(); Du.loading[key] = im;
    im.onload = function () { Du.imgs[key] = im; delete Du.loading[key]; };
    im.onerror = function () { delete Du.loading[key]; Du.failed[key] = true; };
    im.src = 'assets/img/duel/' + key + '.webp';
  }
  var COMMON = ['duel_batter_ready', 'duel_batter_swing', 'duel_eyes_tianba', 'duel_ball', 'duel_t_hr', 'duel_t_hit', 'duel_t_out', 'duel_emblem'];
  var ITEM_ART = {};
  // 每位對手要的素材：場景、臉部特寫、蓄力與出手兩個姿勢、要丟的東西；加上共用的打者、主角眼神、棒球、字卡
  function artOf(o) { var a = [o.bg, o.face, o.art + '_set', o.art + '_throw'].concat(COMMON); if (ITEM_ART[o.item]) a.push(ITEM_ART[o.item]); return a; }
  function isReady(o) { return artOf(o).every(function (k) { return !!Du.imgs[k]; }); }
  // 現在可以出場的對手：那一話的漫畫已經解鎖
  function available() {
    var Mg = PK.Manga;
    return CFG().opponents.filter(function (o) { return Mg && Mg.state ? Mg.isUnlocked(o.ch) : o.ch === 1; });
  }
  Du.preload = function () { available().forEach(function (o) { artOf(o).forEach(load); }); };
  // 挑對手：素材載好的才會出場；最新解鎖的那一位機率加倍
  function pick() {
    var list = available().filter(isReady); if (!list.length) return null;
    var top = list[list.length - 1], pool = list.concat([top]);
    return pool[(Math.random() * pool.length) | 0];
  }
  Du.isReady = isReady;   // 這位對手的素材都載好了嗎（開發工具用）
  // 機台的位置或大小變了（視窗改大小、開發面板開關）：對決畫面跟著對回機台那一塊；機台停格中，順便補畫一格背景
  Du.relayout = function () { if (!st) return; resize(); try { PK.Machine.app.render(); } catch (e) { /* 忽略 */ } };
  Du.byId = function (id) { return CFG().opponents.filter(function (o) { return o.id === id; })[0] || null; };

  // ---------- 什麼時候進對決 ----------
  // h＝剛轉完的那一轉。平常狀態、有聽牌但沒中、距離上一次對決夠久、素材載好了，才進
  Du.want = function (h) {
    var C = CFG(), G = PK.Game;
    if (!C || !C.on || Du.active || G.mode !== 'normal' || G.devMode || h.hit) return false;
    if (PK.Manga && PK.Manga.docked && PK.Manga.docked()) return false;   // 正在邊玩邊看漫畫：不跳出對決打斷閱讀（對決要抓時機，沒在看機台只會被三振）
    var p = h && h.script && h.script.pattern;
    if (!p || /none|quick|rush/.test(p)) return false;
    Du.preload();
    if (G.stats.total - Du.lastSpin < C.trigger.minGapSpins) return false;
    if (Math.random() > C.trigger.chance) return false;
    return !!pick();
  };

  // opts.opp：指定對手；opts.dev：開發工具開的（照常發獎勵，但不算冷卻）；opts.test：自動測試與版面模式用（不發獎勵、素材沒載好也照開）；
  // opts.layout：版面模式（不投球，可以拖投手、打者、擊球範圍）
  // 回傳 Promise：'hr'、'hit'、'out'（沒開成是 null）
  Du.run = function (opts) {
    opts = opts || {};
    var o = opts.opp || pick();
    if (!o || Du.active) return Promise.resolve(null);
    if (!isReady(o)) {
      artOf(o).forEach(function (k) { delete Du.failed[k]; load(k); });
      // 開發工具指定的對手：那一話還沒解鎖、圖還沒載入也照開——等素材載好就自動開始（最多等 12 秒）。
      // （第一版只載入已解鎖那幾話的圖，沒解鎖的對手按了永遠沒反應；使用者 2026-11-10：「我無法測試呀」）
      if (opts.dev) return new Promise(function (res) {
        var t0 = Date.now(), iv = setInterval(function () {
          var ok = isReady(o);
          if (!ok && Date.now() - t0 < 12000) return;
          clearInterval(iv);
          if (ok && !Du.active) open(o, opts, res); else res(null);
        }, 100);
      });
      if (!opts.test) return Promise.resolve(null);
    }
    return new Promise(function (res) { open(o, opts, res); });
  };
  Du.close = function () { if (st) { st.outcome = st.outcome || 'out'; finish(); } };
  // 自動測試用：看目前的狀態、在指定的時刻揮棒
  Du._state = function () { return st; };
  Du._swing = function (p) { swing(p || null); };
  Du._target = function () { var Lx = lay(); return { x: Lx.zx + st.pitch.tx * Lx.zw, y: Lx.zy + st.pitch.ty * Lx.zh, r: Lx.r1 }; };   // 這一球的擊球點（畫布座標）
  Du._tick = function () { if (st) { update(performance.now()); if (st) draw(); } };   // 分頁在背景時畫面不會自己更新，測試時手動推一格

  // ---------- 機台停格／恢復 ----------
  function pauseMachine() {
    var G = PK.Game, M = PK.Machine;
    memo = { paused: G.paused, stopped: M && M.U ? M.U.stopped : false, ticking: !!(M && M.app && M.app.ticker && M.app.ticker.started) };
    G.paused = true; if (M && M.U) M.U.stopped = true;
    if (memo.ticking) M.app.ticker.stop();   // 對決時不算物理、不畫機台：手機才跑得順，珠子也不會在看不到的時候白白掉光
  }
  function resumeMachine() {
    if (!memo) return;
    var G = PK.Game, M = PK.Machine;
    G.paused = memo.paused; if (M && M.U) M.U.stopped = memo.stopped;
    if (memo.ticking) M.app.ticker.start();
    memo = null;
  }

  // ---------- 開場／結束 ----------
  function ensureCanvas() {
    if (cv) return;
    cv = document.createElement('canvas'); cv.id = 'duel';
    cv.style.cssText = 'position:fixed;left:0;top:0;z-index:60;touch-action:none;display:none;cursor:pointer';
    document.body.appendChild(cv); g = cv.getContext('2d');
    cv.addEventListener('pointerdown', onDown); cv.addEventListener('pointermove', onMove);
    cv.addEventListener('pointerup', onUp); cv.addEventListener('pointercancel', onUp);
    window.addEventListener('resize', function () { setTimeout(function () { resize(); try { if (st) PK.Machine.app.render(); } catch (e) { /* 忽略 */ } }, 90); });   // 等機台先重新排好位置；機台停格中，手動補畫一格
    window.addEventListener('keydown', onKey, true);   // 搶在機台的鍵盤操作前面
  }
  function resize() {
    if (!cv) return;
    // 只蓋住機台那一塊（使用者：「打擊遊戲在遊戲機台範圍內，不要全部螢幕」）；拿不到機台範圍時才用整個視窗
    var r = PK.Machine && PK.Machine.rect ? PK.Machine.rect() : null;
    if (!r || !(r.w > 10)) r = { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight, r: 0 };
    DPR = Math.min(window.devicePixelRatio || 1, PK.LOW ? 1.5 : 2); W = r.w; H = r.h;
    cv.style.left = r.x + 'px'; cv.style.top = r.y + 'px'; cv.style.width = r.w + 'px'; cv.style.height = r.h + 'px'; cv.style.borderRadius = (r.r || 0) + 'px';
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  }
  function open(o, opts, res) {
    ensureCanvas(); resize();
    Du.active = true;
    if (PK.Manga && PK.Manga.refreshBtn) PK.Manga.refreshBtn();   // 對決中收起「看漫畫」鈕
    if (!opts.test && !opts.dev && PK.Game) Du.lastSpin = PK.Game.stats.total;   // 開發工具開的（dev）不算進冷卻
    st = { opp: o, opts: opts, res: res, phase: '', t: 0, t0: 0, now: performance.now(), time: 0, pitchNo: 0, pitch: null, swing: null, call: null,
      outcome: null, reward: null, fx: [], shake: 0, flash: 0, drag: null, fade: 0, swingAt: -9, played: 0 };
    pauseMachine();
    cv.style.display = 'block';
    if (opts.layout) { st.pitch = { type: 'fast', T: 1, tx: 0.5, ty: 0.5, bx: 0, by: 0 }; setPhase('layout'); }
    else {
      setPhase('intro');
      // 背景音樂不換：對決時繼續播平常那首嗆司曲（第一版一進對決就換成另一首配樂、結束再從頭播，
      // 使用者 2026-11-10：「音樂怎麼又跑掉了」「我要原本的配置」）。只加音效與語音
      play('cutin'); voice('kattobase');
    }
    cancelAnimationFrame(raf); raf = requestAnimationFrame(frame);
  }
  function finish() {
    if (!st) return;
    var s = st; st = null; Du.active = false;
    if (PK.Manga && PK.Manga.refreshBtn) PK.Manga.refreshBtn();
    cancelAnimationFrame(raf); cv.style.display = 'none';
    resumeMachine();
    // 獎勵等機台恢復之後才發：珠子會真的從出珠口掉出來
    if (s.reward && !s.opts.test) {
      if (s.reward.balls && PK.Game.duelWin) PK.Game.duelWin(s.reward.balls, !!s.opts.dev);   // 贏到的珠子會算進漫畫進度（開發工具開的對決不算）
    }
    s.res(s.outcome);
  }

  // ---------- 流程 ----------
  function setPhase(p) { st.phase = p; st.t0 = performance.now(); st.t = 0; }
  function startPitch() {
    var o = st.opp, type = o.pitches[(Math.random() * o.pitches.length) | 0];
    var T = o.flight[0] + Math.random() * (o.flight[1] - o.flight[0]);
    if (type === 'change') T *= 1.38; else if (type === 'curve') T *= 1.16;
    // 準星落在球門的左右兩側（門將站中間）：tx、ty＝球門框內的比例位置
    var side = Math.random() < 0.5 ? -1 : 1;
    var pt = { type: type, T: T, tx: 0.5 + side * (0.2 + Math.random() * 0.24), ty: 0.16 + Math.random() * 0.66, bx: 0, by: 0 };
    if (o.aim) {
      if (type === 'curve') pt.by = (pt.ty > 0.5 ? 1 : -1) * 0.28;                 // 準星一開始偏高或偏低，後段才滑到定位
      else if (type === 'slider') pt.bx = side * 0.16;                             // 準星從更靠門柱的地方往內滑
    }
    st.pitch = pt; st.swing = null; st.call = null; st.setDur = 0.9 + Math.random() * 0.8;
    setPhase('set');
  }
  // 揮棒：p＝點在畫面上的位置（鍵盤揮棒沒有位置，當作點在好球帶正中央）
  // 依「時機差」判定；要對位置的對手還要看「點的地方離球多遠」（單位：球到本壘時的半徑）
  function swing(p) {
    if (!st) return;
    if (st.phase === 'intro') { if (st.t > 0.7) startPitch(); return; }
    if (st.phase === 'end') { if (st.t > 0.9) setPhase('out'); return; }
    if ((st.phase !== 'wind' && st.phase !== 'fly') || st.swing) return;
    var C = CFG(), o = st.opp, pt = st.pitch, Lx = lay();
    var tNow = (performance.now() - st.t0) / 1000 - (st.phase === 'wind' ? WIND : 0);   // 從球出手開始算的秒數（還沒出手是負的）
    var err = tNow - pt.T, dist = 0, tx = Lx.zx + pt.tx * Lx.zw, ty = Lx.zy + pt.ty * Lx.zh;
    if (!p) p = { x: Lx.zx + Lx.zw / 2, y: Lx.zy + Lx.zh / 2 };
    if (o.aim) dist = Math.hypot(p.x - tx, p.y - ty) / Lx.r1;
    var a = Math.abs(err), k = o.ease, grade = 'miss';
    if (a <= C.timing.perfect * k && dist <= C.aim.perfect) grade = 'hr';
    else if (a <= C.timing.good * k && dist <= C.aim.good) grade = 'hit';
    else if (a <= C.timing.foul * k && dist <= C.aim.foul) grade = 'foul';
    st.swing = { err: err, dist: dist, grade: grade, p: clamp01(tNow / pt.T), x: p.x, y: p.y };
    st.swingAt = st.time;
    doCall(grade);
  }
  var CALLS = { hr: { dur: 2.6 }, hit: { dur: 1.7 }, foul: { dur: 1.2 }, miss: { dur: 1.2 }, look: { dur: 1.2 } };   // 判定之後停留幾秒
  function doCall(grade) {
    var Lx = lay(), pt = st.pitch, side = pt.tx < 0.5 ? -1 : 1;
    // bx、by＝這一腳瞄準的地方；dive＝門將撲的方向（世界波＝撲錯邊）
    st.call = { grade: grade, at: st.time, bx: Lx.zx + pt.tx * Lx.zw, by: Lx.zy + pt.ty * Lx.zh, br: Lx.r1, side: side, dive: grade === 'hr' ? -side : side };
    st.played++;
    if (grade === 'hr') { play('bat', { vol: 1 }); play('boom', { vol: 0.8 }); play('crowd_cheer', { vol: 0.9 }); voice('homerun'); st.shake = 1; st.flash = 1; }
    else if (grade === 'hit') { play('bat', { vol: 0.9 }); play('crowd_cheer', { vol: 0.6 }); st.shake = 0.6; st.flash = 0.6; }
    else if (grade === 'foul') { play('bat', { vol: 0.45 }); st.shake = 0.25; }
    else if (grade === 'miss') { play('mitt', { vol: 0.7 }); }
    else { play('mitt', { vol: 0.8 }); voice('strike'); }
    setPhase('call');
  }
  function afterCall() {
    var grade = st.call.grade, C = CFG(), R = C.reward;
    if (grade === 'hr' || grade === 'hit') {
      st.outcome = grade;
      st.reward = { balls: grade === 'hr' ? R.hrBalls : R.hitBalls };
      setPhase('end'); return;
    }
    st.pitchNo++;
    if (st.pitchNo >= C.pitches) { st.outcome = 'out'; st.reward = null; play('crowd_groan', { vol: 0.7 }); setPhase('end'); }
    else startPitch();
  }
  function update(now) {
    var gap = now - st.now;
    if (gap > 250) st.t0 += gap - 16;   // 分頁被切到背景再回來：這段時間不算（不然球會瞬間飛過去變成好球）
    var dt = Math.min(0.05, gap / 1000); st.now = now; st.time += dt;
    st.t = (now - st.t0) / 1000;
    st.shake = Math.max(0, st.shake - dt * 2.4); st.flash = Math.max(0, st.flash - dt * 2.2);
    var C = CFG();
    if (st.phase === 'intro') { if (st.t > 2.4) startPitch(); }
    else if (st.phase === 'set') { if (st.t > st.setDur) setPhase('wind'); }
    else if (st.phase === 'wind') { if (st.t > WIND) { setPhase('fly'); } }
    else if (st.phase === 'fly') { if (!st.swing && st.t > st.pitch.T + C.timing.foul * st.opp.ease + 0.03) { st.swing = null; doCall('look'); } }
    else if (st.phase === 'call') { if (st.t > CALLS[st.call.grade].dur) afterCall(); }
    else if (st.phase === 'end') { if (st.t > 4.2) setPhase('out'); }
    else if (st.phase === 'out') { if (st.t > 0.28) finish(); }
  }
  function frame(now) {
    if (!st) return;
    update(now);
    if (!st) return;
    draw();
    raf = requestAnimationFrame(frame);
  }

  // ---------- 版面（漫畫分鏡頁）----------
  // 使用者 2026-11-10 從三張設計稿選了 A「漫畫分鏡頁」（art_src/duel_ui/duel_ui_a.png）——第一版用程式畫的框線和圓圈太粗糙、投手又被名牌擋住。
  // 整頁分三格：最上格＝對手的臉部特寫＋名字（對手是誰一直看得到）；中間大格＝打者背後視角的打擊畫面；最下格＝主角的眼神＋提示／判定的字。
  // 中間大格裡的位置（PK.DUEL.layout）：x 是格寬的比例、y 是格高的比例、大小是格寬的比例。
  var PAPER = '#f4efe2', INK = '#12060a';
  function lay() {
    var L = CFG().layout, m = W * 0.014, gt = W * 0.016, topL = H * L.topL, topR = H * L.topR, botY = H * L.botY;
    var x = m, y = topR + gt, w = W - m * 2, h = botY - y;
    var Lx = { m: m, gt: gt, bw: Math.max(3, W * 0.009), u: W, x: x, y: y, w: w, h: h,
      top: [[m, m], [W - m, m], [W - m, topR], [m, topL]],
      main: [[m, topL + gt], [W - m, topR + gt], [W - m, botY], [m, botY]],
      bot: [[m, botY + gt], [W - m, botY + gt], [W - m, H - m], [m, H - m]] };
    Lx.mx = x + L.moundX * w; Lx.my = y + L.moundY * h; Lx.ph = L.pitcherH * w * (st.opp.size || 1);   // size＝這位對手的身高比例（阿嬤比較矮）
    Lx.zw = L.zoneW * w; Lx.zh = L.zoneH * w; Lx.zx = x + L.zoneX * w - Lx.zw / 2; Lx.zy = y + L.zoneY * h - Lx.zh / 2;
    Lx.bx = x + L.batterX * w; Lx.bb = y + h + L.batterDy * w; Lx.bh2 = L.batterH * w;
    Lx.r1 = L.ballR * w; Lx.r0 = 0.01 * w;
    Lx.sx = x + (L.spotX == null ? 0.52 : L.spotX) * w; Lx.sy = y + (L.spotY == null ? 0.86 : L.spotY) * h; Lx.rs = 0.05 * w;   // 點球點上的球
    return Lx;
  }
  // 準星在進度 p（0＝剛出現、1＝最佳起腳時機）時的位置：會移動的準星在後段才滑到定位
  function ballAt(p, Lx) {
    var pt = st.pitch, q = 1 - p * p;
    return { x: Lx.zx + (pt.tx - pt.bx * q) * Lx.zw, y: Lx.zy + (pt.ty - pt.by * q) * Lx.zh, r: Lx.r1 };
  }

  // ---------- 操作 ----------
  function pos(e) { var r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  // 只有一種操作：點畫面。只抓時機的對手點哪裡都可以；要對位置的對手要點在擊球點（白圈）上
  function onDown(e) {
    if (!st) return;
    e.preventDefault(); try { PK.Audio.unlock(); } catch (er) { /* 忽略 */ }
    var p = pos(e), Lx = lay();
    if (st.phase === 'layout') {   // 版面模式：拖最近的那一個（投手、打者、擊球範圍）
      var items = [['p', Lx.mx, Lx.my - Lx.ph / 2], ['b', Lx.bx, Lx.bb - Lx.bh2 * 0.5], ['z', Lx.zx + Lx.zw / 2, Lx.zy + Lx.zh / 2]];
      items.sort(function (a, b) { return Math.hypot(a[1] - p.x, a[2] - p.y) - Math.hypot(b[1] - p.x, b[2] - p.y); });
      st.drag = { k: items[0][0], px: p.x, py: p.y, v: JSON.parse(JSON.stringify(CFG().layout)) }; return;
    }
    swing(p);
  }
  function onMove(e) {
    if (!st || st.phase !== 'layout' || !st.drag) return;
    var p = pos(e), Lx = lay(), d = st.drag, L = CFG().layout, dx = (p.x - d.px) / Lx.w, dyh = (p.y - d.py) / Lx.h, dyw = (p.y - d.py) / Lx.w, r3 = function (v) { return Math.round(v * 1000) / 1000; };
    if (d.k === 'p') { L.moundX = r3(d.v.moundX + dx); L.moundY = r3(d.v.moundY + dyh); }
    else if (d.k === 'b') { L.batterX = r3(d.v.batterX + dx); L.batterDy = r3(d.v.batterDy + dyw); }
    else { L.zoneX = r3(d.v.zoneX + dx); L.zoneY = r3(d.v.zoneY + dyh); }
    if (PK.Dev && PK.Dev.touch) PK.Dev.touch();
  }
  function onUp() { if (st) st.drag = null; }
  // 鍵盤只留空白鍵／Enter（跳過開場與結算；只抓時機的對手也可以用它揮棒）。不用方向鍵
  function onKey(e) {
    if (!st) return;
    e.stopImmediatePropagation();
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); swing(null); }
  }

  // ---------- 畫圖工具 ----------
  function font(px, w) { return (w || '900') + ' ' + Math.max(8, Math.round(px)) + 'px ' + FONT; }
  function txt(s, x, y, px, fill, edge, ew, align, skew) {
    g.save(); g.font = font(px); g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    g.translate(x, y); if (skew) g.transform(1, 0, skew, 1, 0, 0);
    if (ew) { g.lineWidth = ew; g.strokeStyle = edge; g.strokeText(s, 0, 0); }
    g.fillStyle = fill; g.fillText(s, 0, 0); g.restore();
  }
  function textW(s, px) { g.font = font(px); var mt = g.measureText(s); return mt && mt.width ? mt.width : s.length * px; }
  function poly(P) { g.beginPath(); for (var i = 0; i < P.length; i++) g[i ? 'lineTo' : 'moveTo'](P[i][0], P[i][1]); g.closePath(); }
  // 漫畫格的墨線框
  function frameOf(P, bw) { poly(P); g.lineJoin = 'miter'; g.lineWidth = bw; g.strokeStyle = INK; g.stroke(); }
  // 把圖鋪滿一個矩形：圖上的 (fx, fy)（比例）盡量對到矩形中央；zoom＞1 再放大一點
  function cover(im, x, y, w, h, fx, fy, zoom) {
    var sc = Math.max(w / im.width, h / im.height) * (zoom || 1), dw = im.width * sc, dh = im.height * sc;
    g.drawImage(im, Math.max(x + w - dw, Math.min(x, x + w / 2 - fx * dw)), Math.max(y + h - dh, Math.min(y, y + h / 2 - fy * dh)), dw, dh);
  }
  // 漫畫的旁白框：白底、墨線框、右下墨色疊影；lines＝[[字, 字級, 顏色], ...]，x、y 是左上角。回傳框的寬高
  function caption(x, y, lines, alignRight) {
    var padX = W * 0.026, padY = W * 0.016, gap = W * 0.008, w = 0, h = padY * 2 - gap, i;
    for (i = 0; i < lines.length; i++) { w = Math.max(w, textW(lines[i][0], lines[i][1])); h += lines[i][1] * 1.12 + gap; }
    w += padX * 2; if (alignRight) x -= w;
    g.fillStyle = INK; g.fillRect(x + W * 0.012, y + W * 0.012, w, h);
    g.fillStyle = '#ffffff'; g.fillRect(x, y, w, h); g.lineJoin = 'miter'; g.lineWidth = Math.max(2.5, W * 0.006); g.strokeStyle = INK; g.strokeRect(x, y, w, h);
    var cy = y + padY;
    for (i = 0; i < lines.length; i++) { txt(lines[i][0], x + padX, cy + lines[i][1] * 0.56, lines[i][1], lines[i][2] || INK, '', 0, 'left'); cy += lines[i][1] * 1.12 + gap; }
    return { w: w, h: h };
  }
  // 漫畫的爆炸框
  function burst(x, y, r, n, fill, edge, ew, rot) {
    g.beginPath();
    for (var i = 0; i < n * 2; i++) { var a = (rot || 0) + i / (n * 2) * Math.PI * 2, rr = i % 2 ? r * 0.72 : r; g[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fillStyle = fill; g.fill(); if (ew) { g.lineWidth = ew; g.strokeStyle = edge; g.lineJoin = 'miter'; g.stroke(); }
  }
  // 集中線：從外圍往 (cx, cy) 收；seed 每隔幾格換一次，線才會抖動
  function speedLines(cx, cy, inner, alpha, seed, col, n) {
    var far = Math.hypot(W, H); n = n || 54;
    g.fillStyle = col || '#ffffff'; g.globalAlpha = alpha;
    for (var i = 0; i < n; i++) {
      var h1 = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453, r1 = h1 - Math.floor(h1);
      var h2 = Math.sin((i + 1) * 39.3468 + seed * 11.135) * 24634.6345, r2 = h2 - Math.floor(h2);
      var a = (i + r1 * 0.9) / n * Math.PI * 2, wd = 0.006 + r2 * 0.02, rin = inner * (1 + r1 * 0.8);
      g.beginPath(); g.moveTo(cx + Math.cos(a) * rin, cy + Math.sin(a) * rin);
      g.lineTo(cx + Math.cos(a - wd) * far, cy + Math.sin(a - wd) * far); g.lineTo(cx + Math.cos(a + wd) * far, cy + Math.sin(a + wd) * far); g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  // 人物：用「準備姿勢」那張圖裡人物的範圍當基準——人物高＝h、腳底中央對到 (x, y)；同一位角色的其他姿勢用同一套換算，動作之間才不會忽大忽小
  function drawChar(key, baseKey, x, y, h, alpha, flip) {
    var im = Du.imgs[key]; if (!im) return;
    if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }   // 左右翻面（門將往左撲）
    var box = (PK.DUEL_ART[baseKey] || {}).box || [0, 0, 1, 1], k = h / (box[3] * im.height);
    if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(im, x - (box[0] + box[2] / 2) * im.width * k, y - (box[1] + box[3]) * im.height * k, im.width * k, im.height * k);
    g.globalAlpha = 1; if (flip) g.restore();
  }
  // 發光的圈（擊球點）
  function ring(x, y, r, col, lw, glow) {
    g.save(); g.shadowColor = glow; g.shadowBlur = lw * 3.2; g.lineWidth = lw; g.strokeStyle = col;
    g.beginPath(); g.arc(x, y, Math.max(1, r), 0, Math.PI * 2); g.stroke(); g.stroke();
    g.shadowBlur = 0; g.lineWidth = lw * 0.38; g.strokeStyle = '#ffffff'; g.stroke(); g.restore();
  }
  // 飛過來的東西：棒球、寶特瓶、鹹酥雞都是插畫素材；r＝這一刻的半徑
  var ITEM = { ball: ['duel_ball', 2.1, 22] };
  function drawItem(kind, x, y, r, spin, alpha) {
    var it = ITEM[kind] || ITEM.ball, im = Du.imgs[it[0]];
    g.save(); g.translate(x, y); if (alpha != null) g.globalAlpha = alpha;
    if (im) { var w = r * it[1], h = w * im.height / im.width; g.rotate(spin * it[2]); g.drawImage(im, -w / 2, -h / 2, w, h); }
    else { g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fillStyle = '#ffffff'; g.fill(); g.lineWidth = Math.max(1, r * 0.1); g.strokeStyle = INK; g.stroke(); }
    g.restore();
  }
  // 插畫字卡（全壘打／安打／三振／對決徽章）：寬 w、中心 (x, y)
  function art(key, x, y, w, alpha) {
    var im = Du.imgs[key]; if (!im) return false;
    var h = w * im.height / im.width; if (alpha != null) g.globalAlpha = alpha;
    g.drawImage(im, x - w / 2, y - h / 2, w, h); g.globalAlpha = 1; return true;
  }

  // ---------- 畫面 ----------
  function draw() {
    var Lx = lay(), ph = st.phase, tk = Math.floor(st.time * 14);
    g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalAlpha = 1;
    if (ph === 'intro') { drawIntro(Lx, tk); return; }
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.save();
    if (st.shake > 0) g.translate((Math.sin(st.time * 90) * 9 + Math.sin(st.time * 57) * 5) * st.shake, Math.cos(st.time * 83) * 8 * st.shake);
    drawTop(Lx, tk); drawMain(Lx, tk); drawBottom(Lx, tk);
    g.restore();
    if (st.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (0.7 * st.flash) + ')'; g.fillRect(0, 0, W, H); }
    if (ph === 'layout') { caption(W * 0.04, H * 0.3, [['版面模式：直接拖门将、陆远、球门范围', W * 0.04]]); return; }
    if (ph === 'call') drawCallArt(Lx, tk);
    if (ph === 'end' || ph === 'out') drawEnd(Lx, tk);
    if (ph === 'out') { g.fillStyle = 'rgba(8,3,12,' + clamp01(st.t / 0.28) + ')'; g.fillRect(0, 0, W, H); }
  }
  // 最上格：對手的臉部特寫＋名字
  function drawTop(Lx, tk) {
    var o = st.opp, P = Lx.top, ph = st.phase, x0 = P[0][0], y0 = P[0][1], w = P[1][0] - x0, h = P[3][1] - y0, im = Du.imgs[o.face];
    var hot = ph === 'wind' || ph === 'fly';
    g.save(); poly(P); g.clip();
    g.fillStyle = o.col || '#2a1038'; g.fillRect(x0, y0, w, h);
    if (im) cover(im, x0, y0, w, h, 0.6, 0.42, 1.04 + 0.015 * Math.sin(st.time * 0.9) + (hot ? 0.035 : 0));
    if (ph === 'fly' && st.t < 0.2) { g.fillStyle = 'rgba(255,255,255,' + (0.55 * (1 - st.t / 0.2)) + ')'; g.fillRect(x0, y0, w, h); }   // 出手的瞬間閃一下
    if (ph === 'call' && (st.call.grade === 'hr' || st.call.grade === 'hit')) { g.fillStyle = 'rgba(10,4,30,0.45)'; g.fillRect(x0, y0, w, h); speedLines(x0 + w * 0.6, y0 + h * 0.45, h * 0.5, 0.5, tk, '#ffffff', 40); }   // 被打出去：嚇到的效果線
    g.restore();
    frameOf(P, Lx.bw);
    var p1 = W * 0.056, p2 = W * 0.034, box = { h: p1 * 1.12 + p2 * 1.12 + W * 0.04 };
    caption(Lx.m + W * 0.03, P[3][1] - W * 0.04 - box.h, [['第' + NUM[o.ch] + '话　' + o.name, p1], [o.title, p2]]);
  }
  // 中間大格：打擊畫面
  function drawMain(Lx, tk) {
    var C = CFG(), o = st.opp, ph = st.phase, P = Lx.main, x = Lx.x, y = Lx.y, w = Lx.w, h = Lx.h;
    var p = ph === 'fly' ? clamp01(st.t / st.pitch.T) : 0, i;
    g.save(); poly(P); g.clip();
    g.fillStyle = '#0e1430'; g.fillRect(x, y, w, h);
    // 背景：正方形的圖鋪滿這一格，圖上對手站的位置對到設定的投手位置
    var bg = Du.imgs[o.bg], at = (PK.DUEL_ART[o.bg] || {}).at || [0.6, 0.68];   // at＝這張場景圖上對手站的位置（比例）
    if (bg) {
      var sc = Math.max(w / bg.width, h / bg.height) * 1.03, bw2 = bg.width * sc, bh2 = bg.height * sc;
      g.drawImage(bg, Math.max(x + w - bw2, Math.min(x, Lx.mx - at[0] * bw2)), Math.max(y + h - bh2, Math.min(y, Lx.my - at[1] * bh2)), bw2, bh2);
    }
    var vg = g.createRadialGradient(x + w * 0.55, y + h * 0.5, w * 0.25, x + w * 0.55, y + h * 0.5, w * 0.85); vg.addColorStop(0, 'rgba(4,6,20,0)'); vg.addColorStop(1, 'rgba(4,6,20,0.5)');
    g.fillStyle = vg; g.fillRect(x, y, w, h);
    if (ph === 'wind' || ph === 'fly') speedLines(Lx.mx, Lx.my - Lx.ph * 0.6, w * (0.4 - 0.1 * p), 0.06 + 0.16 * p, tk, '#ffffff');

    // 門將：腳下的影子 → 等待時的氣焰 → 人物（站姿／撲救兩張；撲救那張是往畫面右邊撲，往左撲就翻面）
    var cl0 = ph === 'call' ? st.call : null, dk = cl0 ? 1 - Math.pow(1 - Math.min(1, st.t / 0.34), 3) : 0;
    var far0 = cl0 ? (cl0.grade === 'hr' ? 0.3 * Lx.zw : cl0.grade === 'hit' ? Math.abs(cl0.bx - Lx.mx) * 0.55 : Math.abs(cl0.bx - Lx.mx) * 0.8) : 0;
    var kx = Lx.mx + (cl0 ? cl0.dive * far0 * dk : (ph === 'set' || ph === 'wind' || ph === 'fly' ? Math.sin(st.time * 2.6) * 0.022 * w : 0));
    var bob = ph === 'set' ? Math.sin(st.time * 3.2) * 0.004 * w : 0;
    g.fillStyle = 'rgba(0,0,0,0.42)'; g.beginPath(); g.ellipse(kx, Lx.my, Lx.ph * 0.3, Lx.ph * 0.055, 0, 0, Math.PI * 2); g.fill();
    if (ph === 'set' || ph === 'wind') {
      var pw = ph === 'wind' ? 1 : 0.45 + 0.2 * Math.sin(st.time * 5);
      g.save(); g.globalCompositeOperation = 'lighter'; g.strokeStyle = o.col || '#a060ff'; g.lineCap = 'round';
      for (i = 0; i < 5; i++) { var a0 = st.time * (2.2 + i * 0.5) + i * 1.3; g.globalAlpha = 0.5 * pw; g.lineWidth = Lx.ph * (0.02 + 0.012 * i); g.beginPath(); g.ellipse(kx, Lx.my - Lx.ph * 0.45, Lx.ph * (0.34 + i * 0.05), Lx.ph * (0.5 + i * 0.04), 0.15 * i, a0, a0 + 1.1); g.stroke(); }
      g.restore();
    }
    drawChar(o.art + (cl0 ? '_throw' : '_set'), o.art + '_set', kx, Lx.my + bob, Lx.ph, null, !!(cl0 && cl0.dive < 0));

    // 擊球範圍的四個角（要對位置的對手才畫）
    if (o.aim) {
      var c = Lx.zw * 0.16, Z = [[Lx.zx, Lx.zy, 1, 1], [Lx.zx + Lx.zw, Lx.zy, -1, 1], [Lx.zx + Lx.zw, Lx.zy + Lx.zh, -1, -1], [Lx.zx, Lx.zy + Lx.zh, 1, -1]];
      [[INK, w * 0.013], ['#ffffff', w * 0.006]].forEach(function (s2) {
        g.strokeStyle = s2[0]; g.lineWidth = Math.max(1.5, s2[1]); g.lineCap = 'square'; g.beginPath();
        Z.forEach(function (q) { g.moveTo(q[0] + c * q[2], q[1]); g.lineTo(q[0], q[1]); g.lineTo(q[0], q[1] + c * q[3]); }); g.stroke();
      });
      g.lineCap = 'butt';
    }
    var aimNow = ballAt(ph === 'layout' ? 1 : p, Lx), tx = aimNow.x, ty = aimNow.y;
    // 擊球點：白圈；外面的黃圈縮到跟白圈一樣大的那一刻就是最佳時機。要對位置的對手要等球飛到 hintAt 才看得到
    if ((ph === 'fly' && p >= (o.hintAt || 0)) || ph === 'layout') {
      var pp = ph === 'layout' ? 0.55 : p, lw = Math.max(2.5, w * 0.011);
      ring(tx, ty, Lx.r1, '#dfeaff', lw, '#6fa8ff');
      ring(tx, ty, Lx.r1 * (1 + 2.6 * (1 - pp)), '#ffd21f', lw * 1.25, '#ff9d00');
    }
    // 球：起腳前放在點球點上；起腳後飛向球門（0.26 秒到）——世界波、球進了＝進網；中柱＝彈出來；被撲出＝停在門將手上
    if (ph !== 'call') drawItem('ball', Lx.sx, Lx.sy, Lx.rs, 0);
    else {
      var cl = st.call, fq = Math.min(1, st.t / 0.26), fe = 1 - Math.pow(1 - fq, 2), dx2 = cl.bx, dy2 = cl.by, after = Math.max(0, st.t - 0.26), rr = Lx.rs + (Lx.r1 * 0.42 - Lx.rs) * fe;
      if (cl.grade === 'foul') { if (st.pitch.ty < 0.4) dy2 = Lx.zy - Lx.r1 * 0.3; else dx2 = cl.side < 0 ? Lx.zx - Lx.r1 * 0.2 : Lx.zx + Lx.zw + Lx.r1 * 0.2; }
      else if (cl.grade === 'miss' || cl.grade === 'look') { dx2 = cl.bx + (kx - cl.bx) * 0.35; dy2 = cl.by + (Lx.my - Lx.ph * 0.55 - cl.by) * 0.35; }
      var bx3 = Lx.sx + (dx2 - Lx.sx) * fe, by3 = Lx.sy + (dy2 - Lx.sy) * fe - Math.sin(fq * Math.PI) * 0.03 * w;
      if (after > 0) {
        if (cl.grade === 'foul') { bx3 = dx2 - cl.side * after * w * 0.5; by3 = dy2 + after * w * 0.35 - Math.sin(Math.min(1, after / 0.5) * Math.PI) * w * 0.12; rr *= 1 + after * 1.2; }
        else if (cl.grade === 'hr' || cl.grade === 'hit') by3 = dy2 + Math.min(1, after / 0.5) * (Lx.zy + Lx.zh - Lx.r1 * 0.4 - dy2) * 0.9;   // 進網後沿著網子落下
      }
      for (i = 3; i >= 1; i--) if (fq < 1) { var fq2 = Math.max(0, fq - i * 0.07), fe2 = 1 - Math.pow(1 - fq2, 2); drawItem('ball', Lx.sx + (dx2 - Lx.sx) * fe2, Lx.sy + (dy2 - Lx.sy) * fe2, Lx.rs + (Lx.r1 * 0.42 - Lx.rs) * fe2, st.time * 1.4, 0.13 * (4 - i)); }
      drawItem('ball', bx3, by3, rr, st.time * 1.4);
    }
    // 剛才點在哪裡（沒打好時留一下，看得出離球多遠）
    if (ph === 'call' && st.swing && st.swing.x != null && o.aim && st.t < 0.9 && st.call.grade !== 'hr') {
      var sxp = st.swing.x, syp = st.swing.y, mk = w * 0.03;
      g.lineCap = 'round'; g.lineWidth = Math.max(4, w * 0.016); g.strokeStyle = INK; g.beginPath(); g.moveTo(sxp - mk, syp - mk); g.lineTo(sxp + mk, syp + mk); g.moveTo(sxp + mk, syp - mk); g.lineTo(sxp - mk, syp + mk); g.stroke();
      g.lineWidth = Math.max(2, w * 0.008); g.strokeStyle = '#ffffff'; g.stroke(); g.lineCap = 'butt';
    }
    // 打者（背影）：揮棒後短暫換成揮棒的姿勢
    var sw = st.time - st.swingAt < 0.34;
    drawChar(sw ? 'duel_batter_swing' : 'duel_batter_ready', 'duel_batter_ready', Lx.bx + (sw ? w * 0.02 : 0), Lx.bb + (ph === 'set' ? Math.sin(st.time * 2.6) * 0.003 * w : 0), Lx.bh2);
    // 球到球門的瞬間：爆炸框＋集中線
    if (ph === 'call' && (st.call.grade === 'hr' || st.call.grade === 'hit' || st.call.grade === 'foul') && st.t > 0.24 && st.t < 0.74) {
      var kk = (st.t - 0.24) / 0.5, big = st.call.grade === 'hr' ? 1.5 : st.call.grade === 'hit' ? 1.1 : 0.7;
      burst(st.call.bx, st.call.by, w * (0.1 + 0.26 * kk) * big, 12, 'rgba(255,255,255,' + (0.95 * (1 - kk)) + ')', 'rgba(255,214,60,' + (1 - kk) + ')', w * 0.02, st.time * 3);
      if (st.call.grade !== 'foul') speedLines(st.call.bx, st.call.by, w * 0.2, 0.5 * (1 - kk), tk, '#fff7c2');
    }
    g.restore();
    frameOf(P, Lx.bw);
    // 右上角：還剩幾球（用掉的變淡）
    var used = st.pitchNo + (ph === 'call' && st.call.grade !== 'hr' && st.call.grade !== 'hit' ? 1 : 0), bs = w * 0.036;
    for (i = 0; i < C.pitches; i++) drawItem('ball', x + w - w * 0.07 - (C.pitches - 1 - i) * w * 0.09, y + w * 0.075, bs, 0, i < used ? 0.22 : 1);
  }
  // 最下格：左邊是主角的眼神，右邊是提示與判定的字
  var CALL_TEXT = { hr: '世界波！！', hit: '球进了！', foul: '中柱！', miss: '被扑出！', look: '犹豫了，被扑出！' };
  function drawBottom(Lx, tk) {
    var o = st.opp, ph = st.phase, P = Lx.bot, x0 = P[0][0], y0 = P[0][1], w = P[1][0] - x0, h = P[3][1] - y0, eyes = Du.imgs.duel_eyes_tianba;
    g.save(); poly(P); g.clip();
    var cx = x0 + w * 0.72, cy = y0 + h / 2, gr = g.createRadialGradient(cx, cy, h * 0.1, cx, cy, w * 0.5); gr.addColorStop(0, '#fff7b0'); gr.addColorStop(0.45, '#ffc21f'); gr.addColorStop(1, '#e02a1c');
    g.fillStyle = gr; g.fillRect(x0, y0, w, h);
    speedLines(cx, cy, h * 1.1, 0.55, Math.floor(tk / 2), '#d1001c', 46);
    var cut = [[x0, y0], [x0 + w * 0.47, y0], [x0 + w * 0.4, y0 + h], [x0, y0 + h]];
    g.save(); poly(cut); g.clip(); g.fillStyle = '#7a1408'; g.fillRect(x0, y0, w * 0.5, h);
    if (eyes) cover(eyes, x0, y0, w * 0.47, h, 0.5, 0.5, 1.02 + (ph === 'fly' ? 0.06 * clamp01(st.t / st.pitch.T) : 0));
    g.restore();
    g.strokeStyle = INK; g.lineWidth = Lx.bw * 0.8; g.beginPath(); g.moveTo(x0 + w * 0.47, y0); g.lineTo(x0 + w * 0.4, y0 + h); g.stroke();
    // 字：平常是提示，判定出來時換成結果；沒打好再補一行原因（太早／太晚／沒點到球）
    var msg = o.aim ? '点准星射门！' : '抓准时机！', why = '', C = CFG();
    if (ph === 'call') {
      msg = CALL_TEXT[st.call.grade];
      if (st.swing && (st.call.grade === 'miss' || st.call.grade === 'foul')) { var far = o.aim && st.swing.dist > C.aim.good; why = far && Math.abs(st.swing.err) <= C.timing.good * o.ease ? '没瞄准' : st.swing.err < 0 ? '起脚太早' : '起脚太晚'; }
    } else if (ph === 'set' && st.played === 0) msg = o.aim ? '黄圈缩到白圈时，点白圈！' : '黄圈缩到白圈时，点一下！';
    var tw = w * 0.5, px = Math.min(h * (why ? 0.44 : 0.56), tw / Math.max(1, msg.length)), pop = ph === 'call' && st.t < 0.25 ? 1 + 0.25 * Math.sin(st.t / 0.25 * Math.PI) : 1;
    txt(msg, x0 + w * 0.73, y0 + h * (why ? 0.4 : 0.52), px * pop, INK, '#ffffff', px * 0.2, 'center', -0.14);
    if (why) txt(why, x0 + w * 0.73, y0 + h * 0.8, Math.min(h * 0.24, tw / 6), '#ffffff', INK, h * 0.05, 'center', -0.14);
    g.restore();
    frameOf(P, Lx.bw);
  }
  // 全壘打／安打：插畫字卡蓋在中間大格上
  function drawCallArt(Lx) {
    var gr = st.call.grade; if (gr !== 'hr' && gr !== 'hit') return;
    var k = Math.min(1, st.t / 0.18), s = 0.55 + 0.45 * k + (st.t < 0.36 ? 0.1 * Math.sin(st.t / 0.36 * Math.PI) : 0), key = gr === 'hr' ? 'duel_t_hr' : 'duel_t_hit';
    if (!art(key, W / 2, Lx.y + Lx.h * 0.14, W * (gr === 'hr' ? 0.72 : 0.56) * s)) { burst(W / 2, Lx.y + Lx.h * 0.14, W * 0.26 * s, 16, '#ffd21f', INK, W * 0.012, 0.2); txt(CALL_TEXT[gr], W / 2, Lx.y + Lx.h * 0.14, W * 0.1 * s, '#ffffff', '#b3000f', W * 0.026, 'center', -0.16); }
  }
  // 開場：整頁兩格——上格是對手、下格是主角的眼神，中間壓一顆「對決」徽章
  function drawIntro(Lx, tk) {
    var o = st.opp, k = Math.min(1, st.t / 0.42), e = 1 - Math.pow(1 - k, 3), m = Lx.m, gt = Lx.gt, face = Du.imgs[o.face], eyes = Du.imgs.duel_eyes_tianba;
    var yL = H * 0.6, yR = H * 0.5, top = [[m, m], [W - m, m], [W - m, yR], [m, yL]], bot = [[m, yL + gt], [W - m, yR + gt], [W - m, H - m], [m, H - m]];
    g.fillStyle = PAPER; g.fillRect(0, 0, W, H);
    g.save(); poly(top); g.clip(); g.fillStyle = o.col || '#2a1038'; g.fillRect(0, 0, W, yL);
    if (face) cover(face, m + (1 - e) * W * 0.6, m, W - m * 2, yL - m, 0.62, 0.42, 1.06);
    speedLines(W * 0.62, yL * 0.42, W * 0.5, 0.12, tk, '#ffffff', 40);
    g.restore(); frameOf(top, Lx.bw);
    g.save(); poly(bot); g.clip();
    var gr = g.createRadialGradient(W / 2, H * 0.8, W * 0.1, W / 2, H * 0.8, W * 0.8); gr.addColorStop(0, '#ffc21f'); gr.addColorStop(1, '#c81a12'); g.fillStyle = gr; g.fillRect(0, yR, W, H - yR);
    if (eyes) cover(eyes, m - (1 - e) * W * 0.6, yR + gt, W - m * 2, H - m - yR - gt, 0.5, 0.5, 1.04);
    speedLines(W / 2, H * 0.8, W * 0.55, 0.14, tk, '#ffffff', 40);
    g.restore(); frameOf(bot, Lx.bw);
    // 名字框：對手在上格左上、主角在下格右下
    if (st.t > 0.25) {
      caption(m + W * 0.03, m + W * 0.03, [['听牌落空？还没结束！', W * 0.046, '#c8102e']]);
      caption(m + W * 0.03, yL - W * 0.47, [['第' + NUM[o.ch] + '话　' + o.name, W * 0.07], [o.title, W * 0.04]]);   // 放高一點，不被中間的徽章蓋到
      caption(W - m - W * 0.03, H - m - W * 0.2, [['陆远', W * 0.07], ['中国队 10 号', W * 0.04]], true);
    }
    // 對手的台詞（對話框）
    if (st.t > 0.7) {
      var line = '「' + o.line + '」', px = Math.min(W * 0.052, W * 0.62 / line.length), bw = textW(line, px) + W * 0.08, bh = px * 2.1, bx = W - m - W * 0.04 - bw, by = m + W * 0.17;
      g.fillStyle = '#ffffff'; g.strokeStyle = INK; g.lineWidth = Math.max(2.5, W * 0.006); g.lineJoin = 'round';
      g.beginPath(); g.ellipse(bx + bw / 2, by + bh / 2, bw / 2, bh / 2, 0, 0, Math.PI * 2); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(bx + bw * 0.5, by + bh * 0.9); g.lineTo(bx + bw * 0.58, by + bh * 1.45); g.lineTo(bx + bw * 0.68, by + bh * 0.85); g.closePath(); g.fill(); g.stroke();   // 尾巴往下指向對手的嘴
      g.beginPath(); g.ellipse(bx + bw / 2, by + bh / 2, bw / 2 - g.lineWidth, bh / 2 - g.lineWidth, 0, 0, Math.PI * 2); g.fill();
      txt(line, bx + bw / 2, by + bh / 2, px, INK, '', 0);
    }
    // 「對決」徽章
    var pop = st.t < 0.45 ? 0 : Math.min(1, (st.t - 0.45) / 0.2), ps = pop * (1 + (st.t < 0.9 ? 0.15 * Math.sin((st.t - 0.45) / 0.45 * Math.PI) : 0) + 0.02 * Math.sin(st.time * 5));
    if (pop > 0 && !art('duel_emblem', W / 2, (yL + yR) / 2 + gt / 2, W * 0.4 * ps)) { burst(W / 2, (yL + yR) / 2, W * 0.2 * ps, 14, '#d1001c', INK, W * 0.012, st.time * 0.5); txt('对决', W / 2, (yL + yR) / 2, W * 0.12 * ps, '#ffe94a', INK, W * 0.022); }
    if (st.t > 1.0) txt('点一下开始', m + W * 0.05, H - m - W * 0.06, W * 0.042, 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(st.time * 6)) + ')', INK, W * 0.012, 'left');
  }
  // 結算：插畫字卡＋旁白框寫獎勵
  function drawEnd(Lx) {
    var oc = st.outcome, k = Math.min(1, st.t / 0.3), e = 1 - Math.pow(1 - k, 3), R = st.reward, y = H * 0.36;
    g.fillStyle = 'rgba(10,4,14,' + (0.66 * e) + ')'; g.fillRect(0, 0, W, H);
    var key = oc === 'hr' ? 'duel_t_hr' : oc === 'hit' ? 'duel_t_hit' : 'duel_t_out', wd = W * (oc === 'hr' ? 0.98 : 0.74) * e;
    if (!art(key, W / 2, y, wd)) txt(oc === 'hr' ? '世界波！！' : oc === 'hit' ? '球进了！' : '被扑出！', W / 2, y, W * 0.16 * e, '#ffffff', oc === 'out' ? INK : '#b3000f', W * 0.03, 'center', -0.16);
    if (st.t < 0.25) return;
    var lines = [];
    if (R && R.balls) lines.push(['获得 ' + R.balls + ' 颗珠子', W * 0.062, '#c8102e']);
    if (!lines.length) lines.push(['下次听牌再讨回来！', W * 0.052]);
    var wmax = 0; lines.forEach(function (l) { wmax = Math.max(wmax, textW(l[0], l[1])); });
    caption(W / 2 - (wmax + W * 0.052) / 2, H * 0.58, lines);
    if (st.t > 0.9) { g.fillStyle = 'rgba(10,4,14,0.6)'; g.fillRect(0, H * 0.86, W, H * 0.14); txt('点一下回到机台', W / 2, H * 0.93, W * 0.046, 'rgba(255,255,255,' + (0.6 + 0.4 * Math.sin(st.time * 6)) + ')', INK, W * 0.012); }   // 底下再壓暗一條，字才不會跟最下格的字疊在一起
  }
})(window.PK);

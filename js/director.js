/* =========================================================
 * 演出導演：依變動腳本編排每一次變動、リーチ、大當り、RUSH 的完整流程
 * ========================================================= */
(function (PK) {
  'use strict';
  var FX = PK.FX, Clock = FX.Clock, A = PK.Assets;
  var D = {};
  function W(ms) { return Clock.wait(ms); }
  function Au() { return PK.Audio; }
  function L() { return PK.LCD; }
  function B() { return PK.BoardR; }
  function G() { return PK.Game; }
  function C() { return PK.LCD_LAYOUT; }

  function modeBg() { var m = G().mode; return m === 'rush' ? 'bg_night' : m === 'lt' ? 'bg_gold' : m === 'jitan' ? 'bg_sunset' : 'bg_day'; }
  // 每個狀態一聽一看就知道：平常＝明亮應援曲＋暖橘慢呼吸燈；RUSH＝高速戰鬥曲＋藍白跑燈；CHANCE TIME＝緊張曲＋橘紅跑燈；
  // 金色 RUSH＝天堂曲＋金色燈；大獎中＝熱血曲＋彩虹爆閃（另外在大獎流程裡設定）
  // 每個狀態的背景音樂：一律是平常那首嗆司曲（bgm_normal → bgm_cheer_m）。
  // 原本連莊播 bgm_rush、幸運爆發播 bgm_lt、機會時間播 bgm_reach（都是最早做的舊配樂）：連莊一次一百多轉，玩家整段時間都聽不到嗆司曲，
  // 使用者 2026-11-10：「音樂怎麼又跑掉了」「我聽音樂還是錯的」「音樂舊的我都不用」。狀態改用整台燈光顏色與液晶背景區分。
  function modeBgm() { return 'bgm_normal'; }
  function modeLamp() { var m = G().mode; return m === 'rush' ? 'rush' : m === 'jitan' ? 'jitan' : m === 'lt' ? 'lt' : 'idle'; }
  D.restoreMode = function () {
    L().setBg(modeBg(), 500); Au().playBgm(modeBgm()); B().lampMode = modeLamp();
    B().rightArrow = G().inBonus && !PK.NO_RIGHT;   // 右打燈只在大獎中亮（沒有右打就不亮）
  };

  function drawImg(ctx, key, cx, bottom, h, flip, alpha) {
    var im = A.get(key);
    if (!im) return false;
    var w = im.width * h / im.height;
    ctx.save(); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.translate(cx, bottom); if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -w / 2, -h, w, h);
    ctx.restore();
    return true;
  }

  function silhouette(ctx, cx, bottom, h, color) {
    ctx.save(); ctx.fillStyle = color || '#222';
    ctx.beginPath(); ctx.ellipse(cx, bottom - h * 0.85, h * 0.09, h * 0.1, 0, 0, 6.28); ctx.fill();
    ctx.fillRect(cx - h * 0.12, bottom - h * 0.75, h * 0.24, h * 0.45);
    ctx.fillRect(cx - h * 0.11, bottom - h * 0.32, h * 0.08, h * 0.32); ctx.fillRect(cx + h * 0.03, bottom - h * 0.32, h * 0.08, h * 0.32);
    ctx.restore();
  }

  // ---------- 予告 ----------
  var CUT_TEXT = { blue: '上！', green: '看准了踢！', red: '就是现在！', gold: '一决胜负！！', rainbow: '球进了！！' };
  async function cutin(color) {
    var hero = color === 'red' || color === 'gold' || color === 'rainbow';
    Au().play('cutin');
    if (color === 'gold' || color === 'rainbow') { Au().play('kyuin', { vol: 0.8 }); L().flash(color === 'rainbow' ? 'rainbow' : '#ffd23f', 0.6); }
    L().cutin(hero ? 'cut_hero' : 'cut_manager', color, CUT_TEXT[color]);
    B().doShake(5);
    await W(1700);
  }

  async function stepup(level) {
    var cols = ['#ffffff', '#3fa9ff', '#3bff6e', '#ff3355', '#ffd23f'];
    var labels = ['', '', '机会来了', '绝佳机会', '超热血'];
    var st = { lit: 0 };
    var a = L().add({
      z: 45, dur: 0.6 + level * 0.5 + 1.0,
      draw: function (ctx) {
        var c = C(), x0 = c.w / 2 - 2.5 * 120 + 60, y = 150;
        var out = this.t > this.dur - 0.3 ? (this.dur - this.t) / 0.3 : 1;
        ctx.save(); ctx.globalAlpha = out;
        ctx.fillStyle = 'rgba(10,30,15,0.85)'; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 4;
        ctx.fillRect(x0 - 80, y - 70, 5 * 120 + 40, 140); ctx.strokeRect(x0 - 80, y - 70, 5 * 120 + 40, 140);
        FX.text(ctx, '攻势升级', c.w / 2, y - 50, { size: 22, fill: '#ffe9a8', outerW: 0.1, font: FX.FONT_BODY, weight: '900' });
        for (var i = 0; i < 5; i++) {
          var on = i < st.lit, x = x0 + i * 120 - 40;
          ctx.fillStyle = on ? cols[i] : 'rgba(255,255,255,0.08)';
          if (on) { ctx.shadowColor = cols[i]; ctx.shadowBlur = 24; }
          ctx.fillRect(x, y - 30, 100, 70); ctx.shadowBlur = 0;
          FX.text(ctx, String(i + 1), x + 50, y + 5, { size: 46, fill: on ? '#111' : '#555', outer: false });
        }
        if (st.lit === level && labels[level - 1]) {
          FX.text(ctx, labels[level - 1], c.w / 2, y + 110, { size: 58, fill: level >= 5 ? FX.GRAD.gold : level >= 4 ? FX.GRAD.red : FX.GRAD.green, glow: cols[level - 1] });
        }
        ctx.restore();
      },
    });
    await W(400);
    for (var i = 1; i <= level; i++) {
      st.lit = i;
      Au().play('reel_stop', { rate: 0.9 + i * 0.12, vol: 0.9 });
      if (i === level && level >= 4) { Au().play('kyuin', { vol: 0.6 }); Au().voice(level >= 5 ? 'gekiatsu' : 'chance'); }
      L().flash('#fff', 0.15);
      await W(480);
    }
    await W(800);
    void a;
  }

  async function gun(kind) {
    var gold = kind === 'gold';
    var balloons = [];
    for (var i = 0; i < 46; i++) {
      balloons.push({ x: FX.rand(-40, C().w + 40), y: C().h + FX.rand(20, 400), v: FX.rand(380, 640), w: FX.rand(0, 6.28), col: gold ? FX.pick(['#ffd23f', '#ffe9a8', '#ffb300']) : FX.pick(['#ff3355', '#3fa9ff', '#ffd23f', '#3bff6e', '#ff8ad8', '#ffffff']) });
    }
    Au().play('crowd_cheer', { vol: 0.8 });
    if (gold) { Au().play('kyuin', { vol: 0.6 }); Au().voice('kattobase'); }
    L().add({
      z: 40, dur: 2.4,
      draw: function (ctx) {
        var t = this.t;
        balloons.forEach(function (b) {
          var y = b.y - b.v * t, x = b.x + Math.sin(t * 3 + b.w) * 22;
          if (y < -120) return;
          ctx.save(); ctx.translate(x, y); ctx.rotate(Math.sin(t * 4 + b.w) * 0.25);
          var g = ctx.createLinearGradient(-12, 0, 12, 0);
          g.addColorStop(0, b.col); g.addColorStop(0.4, '#fff'); g.addColorStop(1, b.col);
          ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, 13, 62, 0, 0, 6.28); ctx.fill();
          ctx.fillStyle = b.col; ctx.beginPath(); ctx.moveTo(-4, 62); ctx.lineTo(4, 62); ctx.lineTo(0, 72); ctx.fill();
          ctx.restore();
        });
        if (t > 0.4 && t < 2.0) FX.text(ctx, gold ? '全场助威 超热血!!' : '全场助威', C().w / 2, C().h * 0.8, { size: gold ? 56 : 44, fill: gold ? FX.GRAD.gold : FX.GRAD.white });
      },
    });
    await W(2300);
  }

  var SERIF = { blue: '稳住！', red: '机会来了！', gold: '一定能进！！' };
  async function serif(color) {
    Au().play('hold_up', { vol: 0.6 });
    L().add({
      z: 42, dur: 2.0,
      draw: function (ctx) {
        var t = this.t, k = FX.ease.outBack(Math.min(1, t / 0.3)), out = t > 1.7 ? (2 - t) / 0.3 : 1;
        ctx.save(); ctx.globalAlpha = out;
        if (!drawImg(ctx, 'cut_heroine', 160, C().h + 40 + (1 - k) * 300, 420)) silhouette(ctx, 160, C().h, 380, '#ff6688');
        // 吹き出し
        var bx = 330, by = 430, bw = 470, bh = 120;
        ctx.fillStyle = color === 'gold' ? '#fff3b0' : '#fff';
        ctx.strokeStyle = color === 'gold' ? '#ffb300' : color === 'red' ? '#ff1f3d' : '#1f8bff'; ctx.lineWidth = 8;
        ctx.beginPath(); ctx.roundRect ? ctx.roundRect(bx, by, bw * k, bh, 30) : ctx.rect(bx, by, bw * k, bh); ctx.fill(); ctx.stroke();
        if (k > 0.8) FX.text(ctx, SERIF[color], bx + bw / 2, by + bh / 2, { size: 52, fill: color === 'gold' ? FX.GRAD.gold : color === 'red' ? FX.GRAD.red : FX.GRAD.blue, outer: '#fff', outerW: 0.2, maxW: bw - 30 });
        ctx.restore();
      },
    });
    await W(2000);
  }

  async function zone() {
    Au().play('cutin');
    L().setBg('bg_sunset', 600);
    L().banner('机会时刻', { fill: ['#fff', '#ffcf7a', '#ff6a00', '#7a1a00'], rays: '#ff8a00', dur: 1.6, sub: '黄昏之战' });
    B().lampMode = 'reach';
    await W(1600);
  }

  async function yaku() {
    var b = B();
    b.yaku.target = 1; b.yaku.glow = 1;
    Au().play('yaku'); Au().voice('gekiatsu');
    L().flash('#ffd23f', 0.7); L().doShake(18); b.doShake(10); b.doFlash('#ffd23f', 0.8);
    b.lampMode = 'hot';
    L().banner('超热血', { img: 'fx_gekiatsu', imgW: 820, fill: FX.GRAD.gold, size: 130, rays: '#ffd23f', dur: 1.6, shake: 6 });
    await W(1800);
    b.yaku.target = 0;
  }

  async function gijiren(n) {
    await W(700);
    var syms = [1 + Math.floor(Math.random() * 9)];
    syms.push(((syms[0] + 2) % 9) + 1); syms.push(((syms[0] + 4) % 9) + 1);
    for (var i = 0; i < 3; i++) { L().stopReel(i, syms[i], 260); await W(140); }
    await W(350);
    Au().play('cutin');
    if (n >= 2) Au().voice('next');
    L().flash('#fff', 0.6);
    L().banner('再攻一波', { fill: n >= 3 ? FX.GRAD.gold : n >= 2 ? FX.GRAD.red : FX.GRAD.blue, size: 84, dur: 1.0, sub: '连续 ×' + (n + 1), subSize: 46, subFill: FX.GRAD.gold });
    L().reels.forEach(function (r) { r.flash = 1; });
    await W(1000);
    L().startReels();
    await W(600);
  }

  // ---------- PUSH ボタン ----------
  D.push = async function (type) {
    if (PK.UNI) return;   // 一體成形機台沒有 PUSH 鈕：不跳「PUSH」要求，演出直接往下走（使用者：PUSH 沒作用、不需要）
    var g = G();
    g.pushReq = { type: type, done: false, hold: 0 };
    PK.UI && PK.UI.setPushActive(true, type);
    if (type === 'long') Au().voice('push'); else if (Math.random() < 0.6) Au().voice(type === 'gold' ? 'utte' : 'push');
    var cols = { normal: ['#ffffff', '#3fa9ff'], red: ['#ffd0d0', '#ff1f3d'], gold: ['#fff3b0', '#ffb300'], long: ['#ffffff', '#ff4bd8'] };
    var actor = L().add({
      z: 80,
      draw: function (ctx) {
        var c = C(), t = this.t, x = c.w / 2, y = c.h * 0.62, r = 105 + 10 * Math.sin(t * 10);
        var col = cols[type] || cols.normal;
        FX.rays(ctx, x, y, 330, 16, t, col[1], 0.45);
        var g2 = ctx.createRadialGradient(x - 30, y - 40, 10, x, y, r);
        g2.addColorStop(0, '#fff'); g2.addColorStop(0.45, col[0]); g2.addColorStop(1, col[1]);
        ctx.save(); ctx.shadowColor = col[1]; ctx.shadowBlur = 40;
        ctx.fillStyle = g2; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.28); ctx.fill(); ctx.restore();
        ctx.lineWidth = 10; ctx.strokeStyle = type === 'long' ? FX.rainbowGrad(ctx, x - r, y, x + r, y, L().t) : '#fff';
        ctx.beginPath(); ctx.arc(x, y, r + 6, 0, 6.28); ctx.stroke();
        FX.text(ctx, type === 'long' ? '长按' : '按！', x, y - 6, { size: type === 'long' ? 62 : 70, fill: type === 'gold' ? FX.GRAD.gold : type === 'red' ? FX.GRAD.red : FX.GRAD.white, outer: '#000' });
        if (type === 'long') {
          var k = Math.min(1, (g.pushReq ? g.pushReq.hold : 1) / 1.2);
          ctx.strokeStyle = '#ffe066'; ctx.lineWidth = 16; ctx.beginPath(); ctx.arc(x, y, r + 26, -Math.PI / 2, -Math.PI / 2 + k * Math.PI * 2); ctx.stroke();
        }
        FX.text(ctx, '射门！！', x, y + r + 58, { size: 50, fill: FX.GRAD.red, outer: '#000' });
      },
    });
    var t0 = Clock.now;
    await Clock.until(function () {
      var rq = g.pushReq; if (!rq) return true;
      if (rq.type === 'long' && rq.holding) rq.hold += 1 / 60;
      if (rq.type === 'long' && rq.hold >= 1.2) rq.done = true;
      return rq.done || Clock.now - t0 > (type === 'long' ? 7000 : 5500);
    });
    L().remove(actor);
    g.pushReq = null;
    PK.UI && PK.UI.setPushActive(false);
    Au().play('push');
    L().flash('#fff', 0.9); L().doShake(14); B().doShake(6);
    if (navigator.vibrate && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) { try { navigator.vibrate(type === 'long' ? [80, 40, 200] : 120); } catch (e) { /* 忽略 */ } }
    await W(250);
  };

  // ---------- 漫畫格子（聽牌的投打對決與大獎回合共用） ----------
  // 2026-11-11 使用者：「螢幕內的揮棒都很死板」「你應該使用漫畫方式就好呀，不用拆分元素吧」「依照遊戲結果顯示不同漫畫格子也可以」
  // ——原本是把打者（三張圖切換）、投手、背景拆開來拼，人物在液晶裡只佔一小塊，看起來不會動。
  // 現在畫面分成左右兩格（斜切的格線）：右格＝投手這一側、左格＝打者這一側；格子是整張畫好的漫畫圖（PK.PANELS，直式構圖、主體很大），
  // 依每一球、每個結果換不同的格子，新格子滑進來時有白閃、集中線、擬聲字。
  var PANEL_FALL = { L: 'sc_eye', R: 'sc_pitcher_smirk' };   // 格子的圖還沒載好時先用的圖
  // 每張圖裁切時要對準哪裡（-1＝靠上、0＝正中、1＝靠下）：人物的臉多半在上半部，裁掉的要是腳不是頭
  var PAN_FOCUS = { mp_b_stance: -1, mp_b_watch: -0.9, mp_b_take: -0.8, mp_b_foul: -0.8, mp_b_swing: -0.5, mp_b_glare: -0.4, mp_p_windup: -0.7, mp_p_release: -0.6, mp_p_smirk: -0.7, mp_p_shaken: -0.7, mp_cheer: -0.9, mp_crowd: -0.2, mp_versus: 0 };
  D.preloadPanels = function () {
    if (D._panelsOn || !PK.PANELS || typeof Image === 'undefined') return; D._panelsOn = true;
    Object.keys(PK.PANELS).forEach(function (k) { if (A.imgs[k]) return; var im = new Image(); im.onload = function () { A.imgs[k] = im; }; im.src = PK.PANELS[k]; });
  };
  // 換格子：o.lines＝集中線顏色、o.shake＝震動、o.zoom＝慢慢推近
  function panNew(old, img, o) { return Object.assign({ img: img, t: 0, prev: old ? old.img : null }, o || {}); }
  function panCover(ctx, key, bx, bw, HB, zoom, ox, oy) {
    var im = A.get(key); if (!im) return false;
    var sc = Math.max(bw / im.width, HB / im.height) * zoom, dw = im.width * sc, dh = im.height * sc, f = PAN_FOCUS[key] == null ? -0.5 : PAN_FOCUS[key];
    ctx.drawImage(im, bx + (bw - dw) / 2 + ox, (HB - dh) / 2 - f * Math.max(0, dh - HB) / 2 * 0.92 + oy, dw, dh);
    return true;
  }
  // 畫左右兩格（右格先畫，左格的格線壓在上面）。HB＝格子畫到的高度
  function drawPanels(ctx, c, pans, t, HB) {
    ctx.fillStyle = '#08080c'; ctx.fillRect(0, 0, c.w, HB);
    [['R', [[606, 0], [c.w, 0], [c.w, HB], [606 - HB * 0.145, HB]], 606 - HB * 0.145, c.w - (606 - HB * 0.145)], ['L', [[0, 0], [592, 0], [592 - HB * 0.145, HB], [0, HB]], 0, 592]].forEach(function (d) {
      var p = pans[d[0]]; if (!p) return;
      var pts = d[1], bx = d[2], bw = d[3], k = Math.min(1, p.t / 0.22), e = FX.ease.outCubic(k), dir = d[0] === 'L' ? -1 : 1;
      var img = A.get(p.img) ? p.img : PANEL_FALL[d[0]], prev = p.prev && A.get(p.prev) ? p.prev : null;
      ctx.save();
      ctx.beginPath(); pts.forEach(function (q, i) { if (i) ctx.lineTo(q[0], q[1]); else ctx.moveTo(q[0], q[1]); }); ctx.closePath();
      ctx.save(); ctx.clip();
      if (k < 1 && prev) panCover(ctx, prev, bx, bw, HB, 1.05, 0, 0);   // 新格滑進來的時候，上一格墊在下面
      var shk = p.shake && p.t < 0.45 ? p.shake * (1 - p.t / 0.45) : 0;
      ctx.save(); ctx.translate(dir * (1 - e) * bw * 0.6 + (Math.random() - 0.5) * shk, (Math.random() - 0.5) * shk);
      if (!panCover(ctx, img, bx, bw, HB, 1.05 + (1 - e) * 0.14 + (p.zoom || 0) * Math.min(1, p.t / 1.5), Math.sin(t * 0.45 + bx) * 7, Math.cos(t * 0.37 + bx) * 4)) {
        var gr = ctx.createLinearGradient(0, 0, 0, HB); gr.addColorStop(0, '#1b2450'); gr.addColorStop(1, '#05060f'); ctx.fillStyle = gr; ctx.fillRect(bx, 0, bw, HB);
      }
      ctx.restore();
      if (p.lines && p.t < 0.7) speedLines(ctx, bx + bw / 2, HB * 0.45, 150, 900, 64, p.lines, 0.55 * (1 - p.t / 0.7), Math.floor(t * 24));
      if (p.t < 0.14) { ctx.fillStyle = 'rgba(255,255,255,' + (0.8 * (1 - p.t / 0.14)) + ')'; ctx.fillRect(bx, 0, bw, HB); }
      ctx.restore();
      ctx.lineWidth = 14; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 5; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    });
  }
  // 擬聲字（list 裡每一筆 { text, x, y, size, rot, col, t }；t 小於 0＝還沒到出現的時間）
  function drawOno(ctx, list) {
    list.forEach(function (o) {
      if (o.t < 0) return;
      var ok = o.t < 0.12 ? FX.ease.outBack(o.t / 0.12) : 1, oa = o.t > 0.75 ? Math.max(0, 1 - (o.t - 0.75) / 0.22) : 1;
      ctx.save(); ctx.globalAlpha = oa; onomato(ctx, o.text, o.x, o.y, o.size, o.rot, o.col, ok); ctx.restore();
    });
  }
  function stepOno(list, dt) { for (var i = list.length - 1; i >= 0; i--) { list[i].t += dt; if (list[i].t > 1.0) list.splice(i, 1); } }

  // ---------- 對決場景（投手 vs 打者） ----------
  function BattleScene(opt) {
    opt = opt || {};
    D.preloadPanels();
    var s = {
      z: -1, keep: false, wind: 0, ball: null, swing: 0, count: { s: 0, b: 0 }, label: null, labelT: 0,
      flyBall: null, zoom: 0, dark: 0, aura: 0, release: 0, holdFollow: false,
      pan: { L: panNew(null, 'mp_b_stance', { lines: '#ffffff' }), R: panNew(null, 'mp_p_smirk') }, ono: [],
      draw: function (ctx) {
        var c = C(), t = this.t;
        // 左右兩格漫畫：右＝投手、左＝打者；每一球的過程與結果各換一格（見上面的 drawPanels）
        drawPanels(ctx, c, s.pan, L().t, c.h);
        drawOno(ctx, s.ono);
        // ボールカウント
        if (!opt.noCount) {
          ctx.save();
          // 好球數：放在右格的右下角（右上是投手的臉）
          ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(c.w - 236, 520, 214, 84); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(c.w - 236, 520, 214, 84);
          FX.text(ctx, '射门', c.w - 182, 563, { size: 36, fill: '#ffe066', outerW: 0.16, font: FX.FONT_BODY, weight: '900' });
          for (var i = 0; i < 2; i++) { ctx.fillStyle = i < s.count.s ? '#ffe066' : 'rgba(255,255,255,0.22)'; ctx.beginPath(); ctx.arc(c.w - 112 + i * 44, 562, 15, 0, 6.28); ctx.fill(); }
          ctx.restore();
        }
        if (s.label && s.labelT > 0) {
          var lk = FX.ease.outBack(Math.min(1, (0.9 - s.labelT + 0.001) / 0.2 + 0.0001));
          ctx.save(); ctx.translate(c.w / 2, 210); ctx.scale(lk, lk);
          FX.text(ctx, s.label.text, 0, 0, { size: 84, fill: s.label.fill, glow: s.label.glow });
          ctx.restore();
        }
      },
      update: function (dt) {
        // 揮棒進度 0→1；擊出全壘打時停在收棒姿勢
        s.swing = s.swing > 0 ? s.swing + dt * 3 : 0; if (s.swing > 1) s.swing = s.holdFollow ? 1 : 0;
        s.pan.L.t += dt; s.pan.R.t += dt; stepOno(s.ono, dt);
        if (s.labelT > 0) s.labelT -= dt;
        if (s.flyBall) s.flyBall.t += dt * 0.8;
        s.zoom += ((s.zoomTarget || 0) - s.zoom) * Math.min(1, dt * 4);
      },
      show: function (text, fill, glow) { s.label = { text: text, fill: fill, glow: glow }; s.labelT = 0.9; },
      // 投一球：outcome = strike | foul | hit | whiff
      pitch: async function (outcome, slow) {
        var sp = function (side, img, o) { s.pan[side] = panNew(s.pan[side], img, o); };
        var on = function (text, x, y, size, rot, col) { s.ono.push({ text: text, x: x, y: y, size: size, rot: rot, col: col, t: 0 }); };
        s.release = 0;   // 抬腿蓄力（右格）→ 打者握棒／瞪眼（左格）
        sp('R', 'mp_p_windup', { zoom: 0.08 }); sp('L', slow ? 'mp_b_glare' : 'mp_b_grip', { zoom: 0.06 });
        for (var w = 0; w <= 10; w++) { s.wind = w / 10; await W(35); }
        s.wind = 0; s.release = 1;
        Au().play('pitch');
        sp('R', slow ? 'mp_ball' : 'mp_p_release', { lines: '#e2d4ff' }); on('咻——!!', 752, 330, 84, 0.1, slow ? '#ff4bd8' : '#7a3cff');
        s.ball = { k: 0, col: slow ? '#ff4bd8' : null };
        var dur = slow ? 900 : 420, t0 = Clock.now;
        await Clock.until(function () { s.ball.k = Math.min(1, (Clock.now - t0) / dur); return s.ball.k >= 1; });
        if (outcome === 'strike') { s.ball = null; Au().play('mitt'); s.count.s++; s.show('被扑出!', FX.GRAD.red); sp('L', 'mp_mitt', { shake: 10, lines: '#ffffff' }); on('啪!!', 250, 450, 104, -0.1, '#2a6cff'); }
        else if (outcome === 'whiff') { s.swing = 0.01; s.whiff = true; s.ball = null; Au().play('mitt'); s.count.s = 3; s.show('射偏了…', FX.GRAD.white); sp('L', 'mp_mitt', { shake: 10 }); sp('R', 'mp_p_smirk'); on('啪!!', 250, 450, 104, -0.1, '#2a6cff'); }
        else if (outcome === 'foul') { s.swing = 0.01; s.whiff = false; s.ball = null; Au().play('bat', { vol: 0.7 }); if (s.count.s < 2) s.count.s++; s.show('中柱!', FX.GRAD.blue); sp('L', 'mp_b_foul', { shake: 12, lines: '#ffffff' }); on('当!', 250, 450, 100, -0.12, '#ff8a00'); }
        else if (outcome === 'hit') { s.swing = 0.01; s.whiff = false; s.holdFollow = true; s.ball = null; s.flyBall = { t: 0 }; Au().play('bat'); Au().play('boom'); L().flash('#fff', 1); L().doShake(20); B().doShake(10); sp('L', 'mp_b_swing', { shake: 30, lines: '#000000', zoom: 0.08 }); sp('R', 'mp_p_shaken', { lines: '#ffffff' }); on('嘭——!!!', 290, 440, 128, -0.16, '#ff2a4d'); }
        await W(slow ? 400 : 700);
      },
    };
    return s;
  }

  // 結果：打擊成功的大場面
  async function homerunMoment(text, voice) {
    Au().play('crowd_cheer');
    Au().voice(voice || 'homerun');
    L().setBg('splash_homerun', 120);
    L().clearActors();
    L().banner(text || '球进了!!', { img: /球进了/.test(text || '球进了') ? 'fx_homerun' : null, imgW: 860, rainbow: true, size: 120, rays: '#ffd23f', dur: 2.0, shake: 4 });
    L().fireworks(4);
    await W(1900);
  }

  async function strikeoutMoment(text) {
    Au().play('crowd_groan');
    Au().voice('strike');
    L().banner(text || '被扑出…', { fill: FX.GRAD.white, size: 96, dur: 1.4, glow: '#000' });
    L().dimTarget = 0.4;
    await W(1500);
  }

  // ---------- SP：投手戦リーチ ----------
  async function pitchDuel(h, opt) {
    var sc = h.script, win = h.hit && !opt.toSpsp;
    Au().play('cutin'); L().flash('#fff', 0.8);
    L().miniTarget = 1; L().setBg('bg_sunset', 300);
    Au().playBgm('bgm_reach');
    L().banner('单刀对决', { fill: FX.GRAD.red, rays: '#ff3355', dur: 1.8, sub: '与门将一对一，决一胜负！' });
    await W(1700);
    var scn = L().add(BattleScene());
    scn.aura = 1;
    await W(400);
    await scn.pitch('strike');
    await scn.pitch(Math.random() < 0.5 ? 'foul' : 'strike');
    if (scn.count.s < 2) scn.count.s = 2;
    // 最後一球
    L().dimTarget = 0.35; scn.zoomTarget = 1;
    Au().play('heartbeat'); Au().play('drumroll', { vol: 0.8 });
    L().banner('最后一脚', { fill: FX.GRAD.white, size: 70, dur: 1.2, y: 140 });
    await W(1300);
    if (sc.push && !opt.toSpsp) await D.push(sc.push);
    if (win) {
      await scn.pitch('hit');
      await homerunMoment('球进了!!');
    } else {
      await scn.pitch('whiff', true);
      if (opt.toSpsp) {
        await W(300);
        L().flash('#ff1f3d', 0.8); Au().play('kyuin'); Au().voice('matamada');
        L().banner('还没完!!', { fill: FX.GRAD.red, size: 130, rays: '#ff1f3d', dur: 1.2, shake: 8 });
        await W(1300);
      } else {
        await strikeoutMoment('被门将扑出…');
      }
    }
    L().remove(scn);
    L().dimTarget = 0;
  }

  // ---------- SP：ホームラン競争リーチ ----------
  async function derby(h, opt) {
    var sc = h.script, win = h.hit && !opt.toSpsp;
    Au().play('cutin'); L().flash('#fff', 0.8);
    L().miniTarget = 1; L().setBg('bg_day', 300);
    Au().playBgm('bgm_reach');
    L().banner('任意球挑战', { fill: FX.GRAD.gold, rays: '#ffd23f', dur: 1.8, sub: '球速突破 130 公里，就中大奖！' });
    await W(1700);
    var scn = L().add(BattleScene({ noCount: true }));
    var dist = { v: 0, target: 0 };
    var meter = L().add({
      z: 30,
      draw: function (ctx) {
        var c = C();
        dist.v += (dist.target - dist.v) * 0.08;
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(c.w / 2 - 220, 92, 440, 70);
        var k = Math.min(1, dist.v / 160);
        var g = ctx.createLinearGradient(c.w / 2 - 200, 0, c.w / 2 + 200, 0);
        g.addColorStop(0, '#3fa9ff'); g.addColorStop(0.7, '#ffd23f'); g.addColorStop(1, '#ff3355');
        ctx.fillStyle = g; ctx.fillRect(c.w / 2 - 205, 140, 410 * k, 14);
        ctx.fillStyle = '#fff'; ctx.fillRect(c.w / 2 - 205 + 410 * (130 / 160), 134, 4, 26);
        FX.text(ctx, Math.round(dist.v) + 'km/h', c.w / 2, 116, { size: 44, fill: dist.v >= 130 ? FX.GRAD.gold : FX.GRAD.white, outerW: 0.2 });
        ctx.restore();
      },
    });
    var steps = [FX.rand(82, 98), FX.rand(104, 121)];
    for (var i = 0; i < 2; i++) {
      await scn.pitch('hit');
      dist.target = steps[i];
      await W(900);
      scn.flyBall = null;
      L().setBg('bg_day', 200);
    }
    L().dimTarget = 0.3; scn.zoomTarget = 1;
    Au().play('drumroll');
    L().banner('最后一脚！', { fill: FX.GRAD.red, size: 70, dur: 1.2, y: 250 });
    await W(1300);
    if (sc.push && !opt.toSpsp) await D.push(sc.push);
    await scn.pitch('hit');
    if (win) {
      dist.target = FX.rand(140, 158);
      await W(500);
      await homerunMoment('世界波!!');
    } else {
      dist.target = FX.rand(118, 128);
      await W(1100);
      if (opt.toSpsp) {
        L().flash('#ff1f3d', 0.8); Au().play('kyuin'); Au().voice('matamada');
        L().banner('还没完!!', { fill: FX.GRAD.red, size: 130, rays: '#ff1f3d', dur: 1.2, shake: 8 });
        await W(1300);
      } else {
        Au().play('crowd_groan');
        L().banner('打在横梁上…', { fill: FX.GRAD.white, size: 84, dur: 1.4 });
        await W(1500);
      }
    }
    L().remove(scn); L().remove(meter);
    L().dimTarget = 0;
  }

  // ---------- SPSP：九回裏サヨナラリーチ ----------
  async function ninth(h) {
    var sc = h.script, win = h.hit;
    // 暗轉
    L().miniTarget = 1;
    L().dimTarget = 1; Au().stopBgm(0.3);
    await W(500);
    Au().play('boom'); L().flash('#ff1f3d', 0.9); B().doShake(12); B().lampMode = 'reach';
    L().setBg('bg_ninth', 100);
    var title = L().add({
      z: 70, dur: 2.6,
      draw: function (ctx) {
        var c = C(), t = this.t, k = FX.ease.outBack(Math.min(1, t / 0.3));
        ctx.save(); ctx.fillStyle = 'rgba(0,0,0,' + (0.8 * (t < 2.3 ? 1 : (2.6 - t) / 0.3)) + ')'; ctx.fillRect(0, 0, c.w, c.h);
        ctx.translate(c.w / 2, c.h / 2 - 30); ctx.scale(k, k);
        FX.text(ctx, '补时', 0, 0, { size: 200, fill: FX.GRAD.red, glow: '#ff0022', glowBlur: 50, mid: '#fff' });
        if (t > 0.8) FX.text(ctx, '最后一次进攻', 0, 150, { size: 64, fill: FX.GRAD.white, outerW: 0.25 });
        ctx.restore();
      },
    });
    Au().voice('ninth');
    await W(300);
    L().dimTarget = 0;
    Au().playBgm('bgm_spsp');
    await W(2400);
    L().remove(title);
    // スコアボード
    var board = L().add({
      z: 30,
      draw: function (ctx) {
        var c = C();
        ctx.save(); ctx.fillStyle = 'rgba(5,25,10,0.88)'; ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 3;
        ctx.fillRect(c.w - 300, 90, 270, 130); ctx.strokeRect(c.w - 300, 90, 270, 130);
        FX.text(ctx, '韩国  2', c.w - 165, 120, { size: 30, fill: '#fff', outerW: 0.1, font: FX.FONT_BODY, weight: '900' });
        FX.text(ctx, '中国  2', c.w - 165, 160, { size: 30, fill: '#ffe066', outerW: 0.1, font: FX.FONT_BODY, weight: '900' });
        FX.text(ctx, '补时第4分钟 任意球', c.w - 165, 198, { size: 22, fill: '#ff8a8a', outerW: 0.1, font: FX.FONT_BODY, weight: '900' });
        ctx.restore();
      },
    });
    var scn = L().add(BattleScene());
    scn.aura = 1; scn.count.s = 2;
    await W(600);
    await scn.pitch('foul');
    // 主角切入
    Au().play('cutin');
    L().cutin('cut_hero', win ? (Math.random() < 0.5 ? 'gold' : 'red') : (Math.random() < 0.8 ? 'red' : 'blue'), '一定要进！！', { dur: 1.8 });
    await W(1900);
    await scn.pitch('foul');
    // 最終決戰
    L().dimTarget = 0.45; scn.zoomTarget = 1;
    Au().play('heartbeat'); Au().play('drumroll');
    L().banner('命运的一脚', { fill: FX.GRAD.gold, size: 90, dur: 1.4, y: 150, rays: '#ffd23f' });
    await W(1500);
    await D.push(sc.push || 'red');
    if (win) {
      await scn.pitch('hit', true);
      L().remove(scn); L().remove(board);
      await homerunMoment('补时绝杀!!', 'sayonara');
      L().confetti(140);
    } else {
      await scn.pitch('whiff', true);
      L().remove(board);
      await strikeoutMoment('终场哨响…');
      L().remove(scn);
    }
    L().dimTarget = 0;
  }

  // ---------- 全回転 ----------
  async function zenkaiten(h) {
    L().flash('rainbow', 1); Au().play('rainbow'); Au().play('boom');
    Au().voice('zenkaiten');
    B().lampMode = 'hot'; B().doFlash('#fff', 1); B().doShake(10);
    L().setBg('bg_gold', 200);
    L().reelSync = true;
    L().reels.forEach(function (r) { r.state = 'spin'; r.target = 5; r.accel = 0.4; });
    L().banner('全回转', { rainbow: true, size: 150, rays: '#fff', dur: 2.4 });
    Au().playBgm('bgm_spsp');
    await W(3800);
    L().reelSync = false;
    var p = L().reels[0].p;
    L().reels.forEach(function (r) { r.p = p; });
    for (var i = 0; i < 3; i++) L().stopReel(i, 7, 1600);
    await W(1900);
  }

  // ---------- 揃い／ハズレ ----------
  async function ensureStopped(final, dur) {
    for (var i = 0; i < 3; i++) {
      var r = L().reels[i];
      if (r.state === 'spin') L().stopReel(i, final[i], dur || 400);
      else if (r.state === 'stop' && L().reelSym(i) !== final[i]) L().setReel(i, final[i]);
    }
    await Clock.until(function () { return L().allStopped(); });
  }

  async function winAlign(h, short) {
    var sc = h.script;
    L().miniTarget = 0; L().dimTarget = 0; L().reelAlpha = 1;
    L().clearActors();
    await ensureStopped(sc.final, 300);
    L().winGlow = 1;
    L().reels.forEach(function (r) { r.flash = 1; });
    Au().stopBgm(0.2);
    Au().play('shakin'); Au().play('boom', { vol: 0.8 });
    L().flash('#fff', 1); L().doShake(18);
    B().doFlash('#ffffff', 1); B().doShake(14); B().lampMode = 'hot';   // 整台彩虹爆閃
    if (B().kick) B().kick('#ffffff', 1.4);
    Au().play('kyuin', { vol: 0.8 });
    B().burst(PK.LAYOUT.lcd.x + PK.LAYOUT.lcd.w / 2, PK.LAYOUT.lcd.y + PK.LAYOUT.lcd.h / 2, ['#ffe066', '#fff', '#ff3355'], 80);
    Au().playBgm('jingle_bigwin');
    var seven = sc.final[0] === 7;
    Au().voice(seven ? 'homerun' : 'atari');
    // 機關降臨（金色翅膀棒球衝到盤面中央爆炸）＋整台大字「777」
    if (B().gimmick) B().gimmick(short ? 1.4 : 3.4); else if (B().yaku) B().yaku.target = 1;
    await W(short ? 250 : 550);
    if (B().slam) B().slam(sc.final.join(' '), { syms: sc.final, kind: 'rainbow', w: 980, h: 380, y: 860, hold: short ? 1.0 : 1.8, rays: 0xffd23f });
    L().fireworks(short ? 3 : 7); L().confetti(short ? 80 : 160);
    await W(short ? 900 : 1700);
    // 「大当り」美術字從液晶衝出到整台
    L().banner('中大奖', { img: 'fx_ooatari', imgW: 760, rainbow: seven, fill: FX.GRAD.gold, size: 150, rays: '#ffd23f', dur: short ? 2.0 : 4.6, y: C().h * 0.74 });
    // 連續白閃（像真台的「ビカビカ」）
    var nFlash = short ? 4 : 10;
    for (var k = 0; k < nFlash; k++) {
      await W(short ? 320 : 450);
      if (B().kick) B().kick(k % 2 ? '#ffe066' : '#ffffff', 1.2);
      B().doFlash(k % 2 ? '#ffe066' : '#ffffff', 0.8); B().doShake(6);
      if (k % 3 === 2) L().fireworks(3);
    }
    await W(short ? 900 : 900);
    if (B().yaku) B().yaku.target = 0;
    B().lampMode = 'bonus';
    L().winGlow = 0;
  }

  async function missEnd(h, wasSp) {
    L().miniTarget = 0; L().reelAlpha = 1;
    await ensureStopped(h.script.final, 500);
    if (wasSp) Au().play('fail');
    await W(wasSp ? 700 : 350);
    L().clearActors();
    D.restoreMode();
  }

  // ---------- 通常時變動 ----------
  async function normalSpin(h) {
    var sc = h.script, y = sc.yokoku || {}, fin = sc.final;
    var reach = !/none/.test(sc.pattern), big = /sp|zen/.test(sc.pattern);
    var t0 = Clock.now;
    if (L().bg.key !== 'bg_day' && !y.zone) L().setBg('bg_day', 400);
    Au().playBgm('bgm_normal');
    if (y.kyuin) { Au().play('kyuin'); L().flash('rainbow', 0.9); B().doFlash('#fff', 0.8); B().lampMode = 'hot'; await W(500); }
    if (sc.pattern === 'none_short') {
      await W(PK.TIMING.spinShort - 1200);
      L().stopReel(0, fin[0], 300); await W(380); L().stopReel(2, fin[2], 300); await W(380); L().stopReel(1, fin[1], 300);
      await Clock.until(function () { return L().allStopped(); });
      await W(250);
      return;
    }
    // 當該保留變化（一半在開始時）
    var lateUpgrade = h.color !== sc.holdColor && Math.random() < 0.5;
    if (h.color !== sc.holdColor && !lateUpgrade) { await W(350); L().upgradeHold(h, sc.holdColor); }
    await W(800);
    if (sc.pattern === 'zenkaiten') {
      if (h.color !== sc.holdColor) L().upgradeHold(h, sc.holdColor);
      await W(600);
      await zenkaiten(h);
      await winAlign(h);
      return;
    }
    if (y.zone) await zone();
    if (y.stepup) await stepup(y.stepup);
    if (y.gun && y.gun !== 'none') await gun(y.gun);
    if (y.serif && y.serif !== 'none') await serif(y.serif);
    if (!reach) {
      if (y.cutin && y.cutin !== 'none') await cutin(y.cutin);
      if (lateUpgrade) L().upgradeHold(h, sc.holdColor);
      var rest = PK.TIMING.spinNormal - (Clock.now - t0) - 2 * PK.TIMING.reelStopGap;
      await W(Math.max(300, rest));
      L().stopReel(0, fin[0], 420); await W(PK.TIMING.reelStopGap);
      L().stopReel(2, fin[2], 420); await W(PK.TIMING.reelStopGap);
      L().stopReel(1, fin[1], 420);
      await Clock.until(function () { return L().allStopped(); });
      await W(300);
      L().setBg('bg_day', 600); B().lampMode = 'idle';
      return;
    }
    for (var g = 1; g <= (y.gijiren || 0); g++) await gijiren(g);
    var rest2 = 4200 - (Clock.now - t0);
    if (rest2 > 0) await W(rest2);
    L().stopReel(0, fin[0], 420); await W(PK.TIMING.reelStopGap);
    if (lateUpgrade) { L().upgradeHold(h, sc.holdColor); await W(500); }
    L().stopReel(2, fin[2], 520); await W(560);
    // リーチ
    Au().voice('reach'); Au().play('reach_hit');
    L().reachGlow = 1; B().lampMode = big ? 'reach' : 'idle';
    L().banner('听牌', { img: 'fx_reach', imgW: 620, fill: FX.GRAD.red, size: 110, dur: 1.3, rays: big ? '#ff3355' : null, y: C().h * 0.76 });
    L().slowReel(1, 9);
    B().doShake(3);
    await W(900);
    if (y.cutin && y.cutin !== 'none') await cutin(y.cutin);
    if (y.yaku) await yaku();

    if (sc.pattern === 'normal') {
      Au().playBgm('bgm_reach');
      L().slowReel(1, 5); await W(PK.TIMING.reachNormal * 0.45);
      L().slowReel(1, 2.5); await W(PK.TIMING.reachNormal * 0.25);
      L().stopReel(1, fin[1], 1500);
      await Clock.until(function () { return L().allStopped(); });
      await W(200);
    } else if (sc.pattern === 'sp1') {
      await pitchDuel(h, {});
    } else if (sc.pattern === 'sp2') {
      await derby(h, {});
    } else if (sc.pattern === 'spsp') {
      if (sc.spspFrom === 'sp1') await pitchDuel(h, { toSpsp: true });
      else if (sc.spspFrom === 'sp2') await derby(h, { toSpsp: true });
      await ninth(h);
    }
    if (h.hit) await winAlign(h);
    else await missEnd(h, big);
  }

  // ---------- RUSH／時短中變動 ----------
  async function rushSpin(h) {
    var sc = h.script, fin = sc.final;
    var lt = G().mode === 'lt';
    if (h.color !== sc.holdColor) { await W(150); L().upgradeHold(h, sc.holdColor); }
    if (sc.pattern === 'rush_quick') {
      await W(FX.rand(900, 1500) * (PK.TIMING.spinRush / 2200));
      L().stopReel(0, fin[0], 220); await W(200); L().stopReel(2, fin[2], 220); await W(200); L().stopReel(1, fin[1], 220);
      await Clock.until(function () { return L().allStopped(); });
      await W(200);
      return;
    }
    if (sc.pattern === 'rush_ikki') {
      await W(FX.rand(500, 1000));
      Au().play('bat'); Au().play('kyuin', { vol: 0.7 });
      L().flash(lt ? '#ffd23f' : '#fff', 1);
      Au().voice(lt ? 'gold' : 'homerun');
      L().banner(lt ? '黄金!!' : '球进了!!', { img: lt ? null : 'fx_homerun', imgW: 860, rainbow: lt, fill: FX.GRAD.gold, size: 130, rays: '#fff', dur: 1.2 });
      for (var i = 0; i < 3; i++) L().stopReel(i, fin[i], 180);
      await W(900);
      await winAlign(h, true);
      return;
    }
    // バトル
    var long = sc.pattern === 'rush_long';
    await W(700);
    L().stopReel(0, fin[0], 260); await W(260); L().stopReel(2, fin[2], 300); await W(320);
    Au().play('reach_hit'); Au().voice('reach');
    L().slowReel(1, 7);
    L().miniTarget = 1; L().flash('#fff', 0.6);
    L().banner('对决', { fill: lt ? FX.GRAD.gold : FX.GRAD.blue, size: 110, dur: 1.0, rays: lt ? '#ffd23f' : '#2aa8ff' });
    await W(900);
    var scn = L().add(BattleScene());
    scn.aura = 1; scn.count.s = 2;
    if (long) {
      await scn.pitch('foul');
      L().dimTarget = 0.3; scn.zoomTarget = 1;
      await D.push(sc.push || 'normal');
    }
    if (h.hit) {
      await scn.pitch('hit');
      L().remove(scn);
      await homerunMoment(lt ? '黄金进球!!' : '球进了!!');
      await winAlign(h, true);
    } else {
      await scn.pitch('whiff');
      Au().play('crowd_groan', { vol: 0.6 });
      L().banner('被扑出…', { fill: FX.GRAD.white, size: 80, dur: 0.9 });
      await W(900);
      L().remove(scn);
      L().dimTarget = 0; L().miniTarget = 0;
      await ensureStopped(fin, 300);
      L().setBg(modeBg(), 300);
    }
  }

  // ---------- 對外：一次變動 ----------
  D.runSpin = async function (h) {
    var g = G();
    L().activeHold = h;
    // 其他保留的先讀變化（保留変化）
    var list = g.holds2.length ? g.holds2 : g.holds1;
    list.forEach(function (o, i) {
      if (o.color !== o.script.holdColor && Math.random() < 0.35) {
        setTimeout(function () { if (list.indexOf(o) >= 0) L().upgradeHold(o, o.script.holdColor); }, 600 + i * 400);
      }
    });
    Au().play('reel_tick', { vol: 0.5 });
    L().startReels(g.isDensapo() ? 30 : 24);
    if (g.isDensapo()) await rushSpin(h);
    else await normalSpin(h);
    L().activeHold = null;
  };

  // ---------- 大當り開始 ----------
  D.bonusStart = async function (h, b) {
    var title = b.lt ? '黄金大奖' : b.rounds >= 10 ? '绝杀大奖' : b.rounds >= 5 ? '进球大奖' : '大奖';
    L().reelAlpha = 0;
    L().setBg('splash_homerun', 400);
    Au().playBgm('bgm_bonus');   // 大獎回合一律用第三版的大獎音樂（幸運爆發原本另外播 bgm_lt，舊配樂不再用）
    B().lampMode = b.lt ? 'lt' : 'bonus';
    // 有整台大字時，液晶裡不再重複播小字（會疊成兩層）
    if (!B().slam) L().banner(title, { fill: b.lt ? FX.GRAD.gold : FX.GRAD.red, size: 104, rays: '#ffd23f', dur: 3.2, sub: b.rounds + ' 回合', subSize: 48, subFill: FX.GRAD.gold });
    else B().slam(title, { kind: b.lt ? 'gold' : 'red', w: 960, y: 560, hold: 2.2, rays: 0xffd23f, sub: b.rounds + ' 回合', subKind: 'gold' });
    L().fireworks(4); L().confetti(100);
    await W(3000);
    // 故事開場（動畫分鏡）：九回裏 2 出局、落後 N 分 → 宿敵冷笑 → 主角站起來 → 監督吼 → 女經理應援 → 「ここから逆転だ!!」
    var sty = storyFor(b.rounds);
    await D.cine(cineOpening(sty.deficit), { z: 45 });
    if (PK.NO_RIGHT) {   // 沒有右打：大獎中繼續打左邊，START 張開翼片
      if (B().slam) B().slam('启动口全开!!', { kind: 'gold', w: 860, y: 640, hold: 2.0, rays: 0xffd23f, sub: '进启动口就出珠！', subKind: 'white' });
      else L().banner('启动口全开!!', { fill: FX.GRAD.gold, size: 96, dur: 3.0, y: C().h * 0.75, sub: '进启动口就出珠！', subSize: 40, subFill: FX.GRAD.white });
      await W(2800); return;
    }
    B().rightArrow = true;
    Au().voice('migi');
    if (!B().slam) L().banner('打右边 ➡', { fill: FX.GRAD.white, size: 96, dur: 3.0, y: C().h * 0.75, band: 'rgba(200,0,30,0.85)', sub: '打右边！旋钮已自动转到最右', subSize: 40, subFill: FX.GRAD.gold });
    else B().slam('打右边 ➡', { kind: 'white', band: '#c8001e', w: 860, y: 640, hold: 2.0, rays: 0xff3355, sub: '打右边！旋钮自动转好了', subKind: 'gold' });
    await W(2800);
  };

  // ---------- 上次沒跑完的大獎：等玩家打出第一顆才接著跑 ----------
  // 按「繼續遊戲」之後、手把還沒轉之前，液晶先講清楚「上次的大獎還在」，玩家一開打才接回去（不會人還沒動手大獎就自己跑完）
  D.bonusWait = function (b) {
    L().reelAlpha = 0;
    L().setBg('splash_homerun', 300);
    B().lampMode = 'bonus';
    L().add({
      z: 50, keep: true,
      draw: function (ctx) {
        var g = G();
        if (g.shots > 0 || g.goResume || !g.resumeBonus) { this.done = true; return; }
        var c = C(), k = 0.5 + 0.5 * Math.abs(Math.sin(L().t * 2.6));
        ctx.save(); ctx.globalAlpha = 0.78; ctx.fillStyle = '#000'; ctx.fillRect(0, c.h * 0.22, c.w, c.h * 0.56); ctx.restore();
        FX.text(ctx, '大奖还没打完', c.w / 2, c.h * 0.37, { size: 112, fill: FX.GRAD.gold, glow: '#ff9900', maxW: c.w - 60 });
        FX.text(ctx, '第 ' + Math.max(1, b.round) + ' / ' + b.rounds + ' 回合', c.w / 2, c.h * 0.53, { size: 64, fill: '#fff', font: FX.FONT_BODY, outerW: 0.2, maxW: c.w - 80 });
        ctx.save(); ctx.globalAlpha = 0.45 + 0.55 * k;
        FX.text(ctx, '转动旋钮，接着打！', c.w / 2, c.h * 0.68, { size: 68, fill: '#ffe066', font: FX.FONT_BODY, outerW: 0.2, maxW: c.w - 80 });
        ctx.restore();
      },
    });
  };
  // 大獎回合中手把停著沒打：提醒一次（回合的時間這時候是停著的，見 js/game.js bonusRounds）
  D.bonusNudge = function () {
    L().banner('转动旋钮，继续打！', { fill: FX.GRAD.white, size: 72, dur: 2.4, y: C().h * 0.5, band: 'rgba(200,0,30,0.85)', sub: '回合会等你，进启动口才算', subSize: 44, subFill: '#ffe066' });
  };

  // ---------- 停電復帰（大当り中重新整理） ----------
  D.bonusResume = async function (b) {
    L().reelAlpha = 0;
    L().setBg('splash_homerun', 300);
    Au().playBgm('bgm_bonus');   // 大獎回合一律用第三版的大獎音樂（幸運爆發原本另外播 bgm_lt，舊配樂不再用）
    B().lampMode = b.lt ? 'lt' : 'bonus';
    B().rightArrow = !PK.NO_RIGHT;
    if (!PK.NO_RIGHT) Au().voice('migi');
    // 重新整理前的大獎還沒跑完 → 說清楚是「接續上次的大獎」，不然看起來像沒中獎就開了大獎口
    L().banner('大奖继续', { fill: FX.GRAD.gold, size: 96, rays: '#ffd23f', dur: 2.6, y: C().h * 0.42, sub: '上次的大奖还没跑完（第 ' + Math.max(1, b.round) + ' / ' + b.rounds + ' 回合）', subSize: 36, subFill: '#fff' });
    if (!PK.NO_RIGHT) L().banner('打右边 ➡', { fill: FX.GRAD.white, size: 96, dur: 2.6, y: C().h * 0.78, band: 'rgba(200,0,30,0.85)', sub: '打右边！', subSize: 44, subFill: FX.GRAD.gold });
    await W(1500);
  };

  // =========================================================
  // 動畫分鏡播放（大獎故事）
  // 一個鏡頭 shot：{ img, dur, z0, z1, f0, f1, tone, lines, flash, shake, text, sub, size, fill, at, sfx, voice, fx, letter }
  //   z＝鏡頭縮放（1＝剛好蓋滿液晶）、f＝畫面焦點（圖內 0..1），鏡頭在 dur 秒內從 (z0,f0) 推到 (z1,f1)
  //   tone：'mono' 黑白、'sepia' 回憶；lines：集中線；flash：開頭白閃；fx(ctx,c,k,t)：額外疊圖（比分板等）
  // =========================================================
  function shotImg(ctx, c, key, zoom, f) {
    var im = A.get(key);
    if (!im) {   // 圖還沒生成：深色漸層代替，動畫照樣跑
      var g = ctx.createLinearGradient(0, 0, 0, c.h); g.addColorStop(0, '#101a3a'); g.addColorStop(1, '#03040c'); ctx.fillStyle = g; ctx.fillRect(0, 0, c.w, c.h); return;
    }
    var s = Math.max(c.w / im.width, c.h / im.height) * zoom, w = im.width * s, h = im.height * s;
    var x = Math.min(0, Math.max(c.w - w, c.w / 2 - f[0] * w)), y = Math.min(0, Math.max(c.h - h, c.h / 2 - f[1] * h));
    ctx.drawImage(im, x, y, w, h);
  }
  function shotCam(sh, k) {
    var e = FX.ease.inOut ? FX.ease.inOut(k) : k, f0 = sh.f0 || [0.5, 0.5], f1 = sh.f1 || f0;
    return { z: FX.lerp(sh.z0 || 1.05, sh.z1 || sh.z0 || 1.15, e), f: [FX.lerp(f0[0], f1[0], e), FX.lerp(f0[1], f1[1], e)] };
  }
  function drawShot(ctx, c, sh, lt) {
    var k = Math.min(1, lt / sh.dur), cam = shotCam(sh, k);
    ctx.save();
    if (sh.tone && 'filter' in ctx) ctx.filter = sh.tone === 'mono' ? 'grayscale(1) contrast(1.35)' : 'sepia(0.85) saturate(1.2) brightness(1.05)';
    shotImg(ctx, c, sh.img, cam.z, cam.f);
    ctx.restore();
    if (sh.tone === 'sepia') { ctx.save(); var vg = ctx.createRadialGradient(c.w / 2, c.h / 2, c.h * 0.3, c.w / 2, c.h / 2, c.w * 0.65); vg.addColorStop(0, 'rgba(60,30,0,0)'); vg.addColorStop(1, 'rgba(40,20,0,0.7)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, c.w, c.h); ctx.restore(); }
    if (sh.lines) speedLines(ctx, c.w / 2, c.h / 2, 260, 900, 90, sh.lines === 'white' ? '#fff' : '#000', 0.45, Math.floor(L().t * 18));
    if (sh.fx) sh.fx(ctx, c, k, lt);
  }
  function Cine(shots, opt) {
    opt = opt || {};
    var total = 0; shots.forEach(function (sh) { sh.start = total; total += sh.dur; });
    return {
      z: opt.z || 40, dur: total + 0.05, idx: -1,
      update: function () {
        var t = this.t, i = 0; while (i < shots.length - 1 && t >= shots[i + 1].start) i++;
        if (i !== this.idx) {
          this.idx = i; var sh = shots[i];
          if (sh.flash) { L().flash(sh.flash === true ? '#fff' : sh.flash, 1); if (B().kick) B().kick('#ffffff', 1); }
          if (sh.shake) { L().doShake(sh.shake); if (B().doShake) B().doShake(sh.shake * 0.4); }
          if (sh.sfx) [].concat(sh.sfx).forEach(function (k) { Au().play(k, { vol: 0.7 }); });
          if (sh.voice) Au().voice(sh.voice);
          if (sh.fireworks) L().fireworks(sh.fireworks);
          if (sh.confetti) L().confetti(sh.confetti);
          if (sh.onStart) sh.onStart();
        }
      },
      draw: function (ctx) {
        var c = C(), t = this.t, i = Math.max(0, this.idx), sh = shots[i], lt = t - sh.start;
        // 鏡頭交接：開頭 0.18 秒從上一個鏡頭交叉淡入（cut:true 時直接切）
        var X = 0.18;
        if (i > 0 && lt < X && !sh.cut) { drawShot(ctx, c, shots[i - 1], shots[i - 1].dur); ctx.save(); ctx.globalAlpha = lt / X; drawShot(ctx, c, sh, lt); ctx.restore(); }
        else drawShot(ctx, c, sh, lt);
        // 電影黑邊
        if (opt.letter || sh.letter) { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.w, 54); ctx.fillRect(0, c.h - 54, c.w, 54); }
        // 台詞／大字
        if (sh.text && lt > (sh.at || 0.12)) {
          var tk = Math.min(1, (lt - (sh.at || 0.12)) / 0.18), ty = sh.y || c.h * 0.8, sz = Math.max(76, sh.size || 76);   // 字幕最小 76（原本預設 64，縮到液晶上太小）
          ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.72)'; ctx.fillRect(0, ty - sz * 0.85, c.w, sz * 1.7 + (sh.sub ? 58 : 0)); ctx.restore();
          ctx.save(); ctx.translate(c.w / 2, ty); var sc = FX.ease.outBack(tk); ctx.scale(sc, sc);
          FX.text(ctx, sh.text, 0, 0, { size: sz, fill: sh.fill === 'rainbow' ? FX.rainbowGrad(ctx, -420, 0, 420, 0, L().t) : (sh.fill || FX.GRAD.gold), outer: '#1a0006', mid: '#fff', glow: sh.glow || '#ff9900', maxW: c.w - 40, font: sh.body ? FX.FONT_BODY : undefined, weight: sh.body ? '900' : undefined });
          if (sh.sub) FX.text(ctx, sh.sub, 0, sz * 0.95, { size: 46, fill: '#fff', outerW: 0.2, font: FX.FONT_BODY, weight: '900', maxW: c.w - 60 });
          ctx.restore();
        }
        // 淡出（最後 0.25 秒）
        if (opt.fadeOut !== false && t > this.dur - 0.3) { ctx.save(); ctx.globalAlpha = Math.min(1, (t - (this.dur - 0.3)) / 0.25); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, c.w, c.h); ctx.restore(); }
      },
    };
  }
  // 播一段分鏡；回傳在播完時結束的 Promise（期間 L().cineBusy＝true，大獎結尾會等它）
  D.cine = function (shots, opt) {
    var a = Cine(shots, opt); L().add(a); L().cineBusy = (L().cineBusy || 0) + 1; L().hudHidden = true;   // 播分鏡時藏起回合面板等 HUD，畫面乾淨
    return W(a.dur * 1000).then(function () { L().cineBusy = Math.max(0, (L().cineBusy || 1) - 1); if (!L().cineBusy) L().hudHidden = false; });
  };
  // 記分板（自己畫，AI 圖裡不放文字）：away＝對手分數、home＝我方分數
  function scoreboardFx(away, home, label) {
    return function (ctx, c, k, lt) {
      var x = c.w / 2, y = 150, a = Math.min(1, lt / 0.3);
      ctx.save(); ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(5,10,5,0.9)'; ctx.fillRect(x - 250, y - 70, 500, 200); ctx.strokeStyle = '#e8b440'; ctx.lineWidth = 5; ctx.strokeRect(x - 250, y - 70, 500, 200);
      FX.text(ctx, label || '补时阶段', x, y - 28, { size: 40, fill: '#ffd23f', outerW: 0.12, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, '韩国', x - 150, y + 36, { size: 36, fill: '#9fe6ff', outerW: 0.12, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, '中国', x - 150, y + 96, { size: 36, fill: '#ffb0b0', outerW: 0.12, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, String(away), x + 120, y + 38, { size: 60, fill: '#ff8a3a', outerW: 0.12, glow: '#ff6a00' });
      FX.text(ctx, String(typeof home === 'function' ? home(lt) : home), x + 120, y + 98, { size: 60, fill: '#ff8a3a', outerW: 0.12, glow: '#ff6a00' });
      ctx.restore();
    };
  }

  // ---- 各段分鏡 ----
  function cineOpening(deficit) {
    return [
      { img: 'sc_stadium_night', dur: 2.6, z0: 1.0, z1: 1.22, f0: [0.5, 0.3], f1: [0.5, 0.42], letter: true, sfx: 'crowd_groan', fx: scoreboardFx(deficit, 0) },
      { img: 'sc_pitcher_smirk', dur: 2.0, z0: 1.12, z1: 1.3, f0: [0.6, 0.45], f1: [0.55, 0.4], letter: true, text: '……结束了', size: 52, fill: FX.GRAD.blue, glow: '#9b2bff', body: true },
      { img: 'sc_hero_rise', dur: 2.0, z0: 1.05, z1: 1.22, f0: [0.4, 0.5], f1: [0.45, 0.4], letter: true, text: '还没结束!!', size: 60, body: true },
      { img: 'sc_manager_shout', dur: 1.6, z0: 1.2, z1: 1.35, lines: true, shake: 10, text: '比赛还没结束!!', size: 56, fill: FX.GRAD.red, body: true },
      { img: 'sc_heroine_megaphone', dur: 1.5, z0: 1.1, z1: 1.25, f0: [0.45, 0.45], text: '踢进去——!!', size: 60, fill: FX.GRAD.red, body: true, confetti: 40 },
      { img: 'sc_hero_rise', dur: 1.5, z0: 1.4, z1: 1.6, f0: [0.45, 0.38], tone: 'mono', lines: 'white', flash: true, shake: 14, text: '从这里逆转!!', size: 88, fill: FX.GRAD.red, y: 360 },
    ];
  }
  function cineResult(bt, tie, loaded) {
    var hitShot = {
      single: { img: 'sc_hit_single', dur: 2.2, z0: 1.12, z1: 1.32, f0: [0.6, 0.55], f1: [0.42, 0.4], lines: true, flash: true, shake: 10, sfx: 'crowd_cheer' },
      double: { img: 'sc_hit_single', dur: 2.2, z0: 1.3, z1: 1.08, f0: [0.4, 0.4], f1: [0.6, 0.55], lines: true, flash: true, shake: 12, sfx: 'crowd_cheer' },
      walk: { img: 'sc_walk', dur: 2.0, z0: 1.05, z1: 1.2, f0: [0.6, 0.45], f1: [0.5, 0.45] },
      steal: { img: 'sc_steal', dur: 2.0, z0: 1.3, z1: 1.08, lines: true, shake: 12, flash: true },
      foul: { img: 'sc_pitcher_shaken', dur: 2.0, z0: 1.1, z1: 1.35, tone: null, lines: 'white' },
    }[bt.hit];
    if (!hitShot) return null;
    hitShot.text = bt.text; hitShot.size = 60;
    var shots = [hitShot];
    if (bt.runs > 0) shots.push({ img: 'sc_score', dur: 1.7, z0: 1.15, z1: 1.3, lines: true, shake: 10, sfx: 'round_hit', text: '球进了!!', size: 90, fireworks: 2 });
    if (tie) {
      shots.push({ img: 'sc_tie_crowd', dur: 1.7, z0: 1.05, z1: 1.2, confetti: 120, sfx: 'crowd_cheer', text: '扳平!!!', size: 110, fill: 'rainbow' });
      shots.push({ img: 'sc_pitcher_shaken', dur: 1.3, z0: 1.15, z1: 1.4, text: '……怎么可能', size: 50, fill: FX.GRAD.blue, glow: '#9b2bff', body: true });
    }
    if (loaded) shots.push({ img: 'sc_bases_loaded', dur: 1.7, z0: 1.0, z1: 1.18, f0: [0.5, 0.55], f1: [0.5, 0.45], text: '全线压上!!', size: 100, fill: FX.GRAD.red, sfx: 'crowd_cheer' });
    return shots;
  }
  function cinePinch() {
    return [
      { img: 'sc_pinch_walkout', dur: 2.4, z0: 1.0, z1: 1.22, f0: [0.5, 0.6], f1: [0.5, 0.42], letter: true, sfx: 'drumroll', text: '这一球，我来。', size: 56, body: true },
      { img: 'sc_memory', dur: 2.6, z0: 1.05, z1: 1.18, tone: 'sepia', letter: true, text: '防波堤上的三千脚，就是为了这一脚——', size: 44, fill: '#fff4d0', glow: '#ffb000', body: true },
    ];
  }
  function cineClimax(deficit, finalHome, bt, loaded) {
    return [
      { img: 'sc_bases_loaded', dur: 1.1, z0: 1.1, z1: 1.25, sfx: 'heartbeat', text: loaded ? '补时最后一分钟……任意球' : '补时最后一分钟……', size: 52, body: true },
      { img: 'sc_last_pitch', dur: 1.0, z0: 1.1, z1: 1.32, lines: true, shake: 10, sfx: 'pitch' },
      { img: 'sc_eye', dur: 0.9, z0: 1.15, z1: 1.45, tone: 'mono', lines: 'white', cut: true, sfx: 'heartbeat' },
      { img: 'sc_impact', dur: 1.0, z0: 1.25, z1: 1.05, flash: true, shake: 32, cut: true, sfx: ['bat', 'boom'], text: '嘭——!!!', size: 120, fill: 'rainbow', y: 360 },
      { img: 'sc_ball_sky', dur: 1.9, z0: 1.0, z1: 1.18, f0: [0.5, 0.7], f1: [0.5, 0.3], fireworks: 8, sfx: 'crowd_cheer' },
      { img: 'sc_round_bases', dur: 1.6, z0: 1.08, z1: 1.25, confetti: 120, text: (bt && bt.text) || '补时绝杀!!!', size: 58, fill: 'rainbow' },
      { img: 'sc_pileup', dur: 1.6, z0: 1.05, z1: 1.2, confetti: 100, fireworks: 3 },
      { img: 'sc_heroine_tears', dur: 1.3, z0: 1.1, z1: 1.28, f0: [0.45, 0.42] },
      { img: 'sc_stadium_night', dur: 1.8, z0: 1.15, z1: 1.3, f0: [0.5, 0.35], fireworks: 6, fx: scoreboardFx(deficit, function (lt) { return lt < 0.5 ? deficit : finalHome; }, '比赛结束'), text: '赢了!!', size: 120, fill: 'rainbow', y: 560, at: 0.6 },
    ];
  }

  var ROUND_BG = ['splash_homerun', 'splash_rush', 'bg_night', 'cut_hero', 'bg_gold'];
  // 漫畫集中線：從中心往外的黑白放射線
  function speedLines(ctx, cx, cy, r0, r1, n, col, alpha, seed) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * 6.283 + Math.sin(i * 12.9898 + seed) * 0.05, w = 0.006 + 0.012 * Math.abs(Math.sin(i * 78.233 + seed));
      var ri = r0 * (0.8 + 0.4 * Math.abs(Math.sin(i * 3.1 + seed)));
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a - w) * r1, cy + Math.sin(a - w) * r1);
      ctx.lineTo(cx + Math.cos(a) * ri, cy + Math.sin(a) * ri); ctx.lineTo(cx + Math.cos(a + w) * r1, cy + Math.sin(a + w) * r1); ctx.fill();
    }
    ctx.restore();
  }
  // 漫畫擬聲字：傾斜、白字黑粗邊、外圈色邊，微微抖動
  function onomato(ctx, text, x, y, size, rot, col, k) {
    ctx.save(); ctx.translate(x + (Math.random() - 0.5) * 6, y + (Math.random() - 0.5) * 6); ctx.rotate(rot); ctx.scale(k, k);
    ctx.font = '900 ' + size + 'px "Noto Sans SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    ctx.lineWidth = size * 0.34; ctx.strokeStyle = col; ctx.strokeText(text, 0, 0);
    ctx.lineWidth = size * 0.2; ctx.strokeStyle = '#000'; ctx.strokeText(text, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillText(text, 0, 0);
    ctx.restore();
  }
  // ---------- 大獎故事：九回裏 2 出局、落後幾分的逆轉戲 ----------
  // 每一回合＝一個打席：進大獎口的珠子推進球數（壞球、界外…），進滿 10 顆時揮出這個打席的結果；最後一回合是逆轉再見全壘打
  // bases＝打完後一二三壘有沒有人；runs＝這個打席得幾分
  // 足球版：補時階段落後幾球的逆轉戲。每一回合＝一波進攻；runs＝這一波進幾球（足球一次只會進一球）；
  // bases＝三盞「攻勢燈」（推進到中場／前場／禁區）；hit 沿用原本的鍵：single 傳切打穿、double 頭球或推射、walk 造成犯規或角球、steal 搶斷、foul 射門被撲出、homer 絕殺
  var PINCH = '陆远';   // 最後由陸遠主罰（原本的「代打」）
  var STORY = {
    10: { deficit: 3, beats: [
      { no: '第1波', line: '还没结束!!', img: 'cut_hero', col: '#ff2a4d', hit: 'single', text: '直塞打穿防线!!', runs: 0, bases: [1, 0, 0] },
      { no: '第2波', line: '压上去!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'walk', text: '造成犯规! 任意球!', runs: 0, bases: [1, 1, 0] },
      { no: '第3波', line: '先扳回一个!!', img: 'cut_manager', col: '#2aa8ff', hit: 'double', text: '头球破门!! 扳回一球!!', runs: 1, bases: [0, 0, 0] },
      { no: '第4波', line: '继续压!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'steal', text: '中场抢断!!', runs: 0, bases: [1, 0, 0] },
      { no: '第5波', line: '传中!!', img: 'cut_hero', col: '#ffb000', hit: 'single', text: '边路突破传中!!', runs: 0, bases: [1, 1, 0] },
      { no: '第6波', line: '再来一个!!', img: 'cut_hero', col: '#ff2a4d', hit: 'double', text: '推射得手!! 只差一球!!', runs: 1, bases: [0, 0, 0] },
      { no: '第7波', line: '别停下!!', img: 'cut_manager', col: '#2aa8ff', hit: 'walk', text: '赢得角球!', runs: 0, bases: [1, 0, 0] },
      { no: '第8波', line: '扳平了!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'single', text: '角球头球!! 扳平!!', runs: 1, bases: [1, 1, 0] },
      { no: PINCH, line: '交给你了……!!', img: 'cut_manager', col: '#ffd23f', hit: 'foul', text: '射门被扑出! 禁区前任意球!!', runs: 0, bases: [1, 1, 1] },
      { no: PINCH, line: '球进了!!!', img: 'cut_hero', col: '#ffd23f', hit: 'homer', text: '补时任意球绝杀!!!', runs: 1, bases: [0, 0, 0] },
    ] },
    5: { deficit: 2, beats: [
      { no: '第1波', line: '还没结束!!', img: 'cut_hero', col: '#ff2a4d', hit: 'single', text: '直塞打穿防线!!', runs: 0, bases: [1, 0, 0] },
      { no: '第2波', line: '先扳回一个!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'double', text: '头球破门!! 扳回一球!!', runs: 1, bases: [0, 0, 0] },
      { no: '第3波', line: '继续压!!', img: 'cut_manager', col: '#2aa8ff', hit: 'steal', text: '中场抢断!!', runs: 0, bases: [1, 1, 0] },
      { no: '第4波', line: '扳平了!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'single', text: '推射得手!! 扳平!!', runs: 1, bases: [1, 1, 1] },
      { no: PINCH, line: '球进了!!!', img: 'cut_hero', col: '#ffd23f', hit: 'homer', text: '补时任意球绝杀!!!', runs: 1, bases: [0, 0, 0] },
    ] },
    3: { deficit: 1, beats: [
      { no: '第1波', line: '还没结束!!', img: 'cut_hero', col: '#ff2a4d', hit: 'single', text: '直塞打穿防线!!', runs: 0, bases: [1, 0, 0] },
      { no: '第2波', line: '扳平了!!', img: 'cut_heroine', col: '#ff5a3c', hit: 'double', text: '头球破门!! 扳平!!', runs: 1, bases: [1, 1, 1] },
      { no: PINCH, line: '球进了!!!', img: 'cut_hero', col: '#ffd23f', hit: 'homer', text: '补时任意球绝杀!!!', runs: 1, bases: [0, 0, 0] },
    ] },
  };
  function storyFor(n) { return STORY[n] || STORY[n >= 10 ? 10 : n >= 5 ? 5 : 3]; }
  // 第 r 回合開始前的壘上狀況與比分
  function storyBefore(st, r) {
    var bases = [0, 0, 0], home = 0;
    for (var i = 0; i < Math.min(r - 1, st.beats.length); i++) { bases = st.beats[i].bases; home += st.beats[i].runs; }
    return { bases: bases.slice(), home: home };
  }
  var PITCH = ['射偏', '中柱!', '被扑出', '中柱!', '射偏', '中柱!!', '射偏', '中柱!', '中柱!!'];   // 圍攻中的每一腳射門
  var MANGA = [{ img: 'cut_hero', text: '踢进去——!!', col: '#ff2a4d' }];
  // 大獎回合＝一頁會動的漫畫（格子的畫法見前面的 drawPanels）：
  //   每進一顆珠子＝投一球：右格先換成投手出手的格子 → 球到的時候左格換成這一球的結果（選球不揮、界外、進手套…）；
  //   第 10 顆換成全力揮棒的格子，再接這個打席結果的分鏡。沒有珠子進來的時候格子自己輪替（握棒、瞪眼、觀眾、啦啦隊）。
  //   最下面一條是字幕列（回合／進球／獲得彈珠／比分）
  function RoundLive() {
    var st = { round: 0, last: 0, pitch: 0, pitchLabel: null, flash: 0, hit: null, conf: 0, manga: null,
      story: null, bases: [0, 0, 0], home: 0, scorePop: 0, pan: { L: null, R: null }, ono: [], rot: {}, idle: 0, flip: false, hudCount: 0, hudPop: 0 };
    function beat() { var g = G(); return st.story && g.bonus ? st.story.beats[Math.min(st.story.beats.length, Math.max(1, g.bonus.round)) - 1] : null; }
    // 換格子：side＝'L'（打者側）／'R'（投手側）；o.lines＝集中線顏色、o.shake＝震動、o.zoom＝慢慢推近
    function setPan(side, img, o) { st.pan[side] = panNew(st.pan[side], img, o); st.idle = 0; }
    function pick(key, list) { st.rot[key] = ((st.rot[key] == null ? -1 : st.rot[key]) + 1) % list.length; return list[st.rot[key]]; }
    function ono(text, x, y, size, rot, col, delay) { st.ono.push({ text: text, x: x, y: y, size: size, rot: rot, col: col, t: -(delay || 0) }); }
    D.preloadPanels();
    return {
      z: 2, keep: true,
      update: function (dt) {
        var g = G(), bb = g.bonus;
        if (!g.inBonus || !bb) return;
        if (!st.story) st.story = storyFor(bb.rounds);
        var N = PK.PAYOUT.attackerCount;
        // 新的回合＝新的打者上場（漫畫分格＋台詞）
        if (bb.round !== st.round) {
          st.round = bb.round; st.last = 0; st.hit = null; st.pitchLabel = null;
          var pre = storyBefore(st.story, bb.round); st.bases = pre.bases; st.home = pre.home;
          var bt = beat(); if (bt) st.manga = { t: 0, m: { img: bt.img, text: bt.line, col: bt.col }, no: bt.no };
          setPan('L', pick('in', ['mp_b_stance', 'mp_b_grip', 'mp_b_glare']), { lines: '#ffffff' });
          setPan('R', pick('pin', ['mp_p_smirk', 'mp_versus', 'mp_p_windup']));
        }
        // 進大獎口的珠子＝投一球
        if (bb.count > st.last) {
          var k = Math.min(bb.count, N);
          if (k < N && st.last < N) {
            st.pitch = 0.55; st.pitchLabel = { text: PITCH[(k - 1) % PITCH.length], t: -0.5 };   // 投手出手 → 0.55 秒後球到 → 判定字
            st.pend = st.pitchLabel.text;   // 球到了才換打者那一格
            setPan('R', pick('pit', ['mp_p_release', 'mp_p_windup', 'mp_ball']), { lines: '#e2d4ff' });
            ono('咻——!!', 752, 300, 80, 0.1, '#7a3cff', 0.16);
          } else if (k >= N && !st.hit) {
            // 第 10 顆：揮出這個打席的結果
            var bt2 = beat();
            st.hit = { t: 0, beat: bt2, applied: false }; st.pitchLabel = null; st.pend = null;
            if (bt2 && bt2.hit !== 'walk' && bt2.hit !== 'steal') {
              st.flash = 1; L().doShake(bt2.hit === 'homer' ? 30 : 12); Au().play('bat', { vol: 0.7 });
              setPan('L', 'mp_b_swing', { lines: '#000000', shake: bt2.hit === 'homer' ? 34 : 22, zoom: 0.08 });
              setPan('R', 'mp_p_shaken', { lines: '#ffffff' });
              ono(bt2.hit === 'homer' ? '嘭——!!!' : '嘭!!', 280, 400, bt2.hit === 'homer' ? 128 : 104, -0.16, '#ff2a4d', 0.04);
            } else { setPan('L', 'mp_b_take'); setPan('R', 'mp_p_shaken'); }
            Au().play('crowd_cheer', { vol: bt2 && bt2.hit === 'homer' ? 0.8 : 0.45, minGap: 0.5 });
            if (bt2 && bt2.hit === 'homer') { L().fireworks(8); L().confetti(160); if (B().kick) B().kick('#ffffff', 1.5); }
            if (bt2) {
              var pre2 = storyBefore(st.story, bb.round), after = storyBefore(st.story, bb.round + 1);
              var tie = bt2.runs > 0 && after.home === st.story.deficit;
              var loaded = bt2.bases.every(function (x) { return x; }) && !pre2.bases.every(function (x) { return x; });
              var shots = bt2.hit === 'homer' ? cineClimax(st.story.deficit, after.home, bt2, pre2.bases.every(function (x) { return x; })) : cineResult(bt2, tie, loaded);
              if (shots) { st.hit.cine = true; st.hit.cineAt = 0.55; st.hit.shots = shots; }   // 先讓揮棒那一格停半秒，再接結果的分鏡
            }
          }
          st.last = bb.count;
        }
        if (st.pitch > 0) st.pitch -= dt;
        // 球到了：依這一球的判定換打者那一格
        if (st.pend && st.pitch <= 0.02) {
          var lab = st.pend; st.pend = null;
          if (/中柱/.test(lab)) { Au().play('bat', { vol: 0.25, minGap: 0.1 }); setPan('L', 'mp_b_foul', { lines: '#ffffff', shake: 12 }); ono('当!', 240, 400, 96, -0.12, '#ff8a00'); }
          else if (/被扑出/.test(lab)) { Au().play('mitt', { vol: 0.3, minGap: 0.1 }); setPan('L', 'mp_mitt', { lines: '#ffffff', shake: 10 }); ono('啪!!', 240, 400, 100, -0.1, '#2a6cff'); }
          else { Au().play('mitt', { vol: 0.3, minGap: 0.1 }); var tk = pick('take', ['mp_b_take', 'mp_mitt', 'mp_b_glare']); setPan('L', tk, tk === 'mp_mitt' ? { shake: 8 } : null); if (tk === 'mp_mitt') ono('啪!', 240, 400, 88, -0.1, '#2a6cff'); }
        }
        st.flash = Math.max(0, st.flash - dt * 3);
        st.scorePop = Math.max(0, st.scorePop - dt * 1.5);
        if (st.pitchLabel) { st.pitchLabel.t += dt; if (st.pitchLabel.t > 1.1) st.pitchLabel = null; }
        if (st.hit) {
          st.hit.t += dt;
          if (st.hit.shots && st.hit.t >= st.hit.cineAt) { var sh2 = st.hit.shots; st.hit.shots = null; D.cine(sh2, { z: 40 }); }
          if (!st.hit.applied && st.hit.t > 0.8 && st.hit.beat) {
            st.hit.applied = true; st.bases = st.hit.beat.bases.slice(); st.home += st.hit.beat.runs;
            if (st.hit.beat.runs > 0) { st.scorePop = 1; Au().play('round_hit', { vol: 0.6 }); L().fireworks(2); }
          }
          // 分鏡播的時候底下換成「目送」那一格，分鏡結束看到的就是它
          if (!st.hit.watch && st.hit.t > 1.6 && st.hit.beat && st.hit.beat.hit !== 'walk' && st.hit.beat.hit !== 'steal') { st.hit.watch = true; setPan('L', 'mp_b_watch'); setPan('R', pick('after', ['mp_crowd', 'mp_cheer'])); }
        }
        if (st.manga) { st.manga.t += dt; if (st.manga.t > 1.9) st.manga = null; }
        st.conf -= dt; if (st.conf <= 0) { st.conf = 2.2; L().confetti(14); }
        ['L', 'R'].forEach(function (sd) { if (st.pan[sd]) st.pan[sd].t += dt; });
        stepOno(st.ono, dt);
        if (st.hudCount !== bb.count) { st.hudPop = bb.count > st.hudCount ? 1 : 0; st.hudCount = bb.count; }
        st.hudPop = Math.max(0, st.hudPop - dt * 3);
        // 沒有珠子進來：左右兩格輪流換場邊的畫面，畫面不會停著不動
        st.idle += dt;
        if (st.idle > 3.0 && !st.hit && st.pitch <= 0 && !st.manga) {
          st.flip = !st.flip;
          if (st.flip) setPan('R', pick('idleR', ['mp_crowd', 'mp_p_smirk', 'mp_versus', 'mp_p_windup']));
          else setPan('L', pick('idleL', ['mp_b_grip', 'mp_cheer', 'mp_b_glare', 'mp_b_stance']));
        }
      },
      draw: function (ctx) {
        var g = G(); if (!g.inBonus) { this.done = true; L().cheer = null; return; }
        var c = C(), t = L().t, bb = g.bonus, N = PK.PAYOUT.attackerCount;
        var HB = 594;   // 漫畫格子畫到這個高度；下面是字幕列
        ctx.fillStyle = '#08080c'; ctx.fillRect(0, 0, c.w, c.h);
        // 1) 左右兩格漫畫
        drawPanels(ctx, c, st.pan, t, HB);
        // 2) 擊球瞬間的白閃
        if (st.flash > 0) {
          ctx.save(); ctx.globalCompositeOperation = 'lighter'; var fl = ctx.createRadialGradient(300, 260, 0, 300, 260, 420);
          fl.addColorStop(0, 'rgba(255,255,255,' + st.flash + ')'); fl.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = fl; ctx.fillRect(0, 0, c.w, HB); ctx.restore();
        }
        // 3) 擬聲字
        drawOno(ctx, st.ono);
        // 4) 每一球的判定（壞球、界外…）：壓在兩格中間的字幕框
        if (st.pitchLabel && st.pitchLabel.t >= 0) {
          var pl = st.pitchLabel, pk = pl.t < 0.12 ? FX.ease.outBack(pl.t / 0.12) : 1, pa = pl.t > 0.9 ? Math.max(0, 1 - (pl.t - 0.9) / 0.2) : 1;
          ctx.save(); ctx.globalAlpha = pa; ctx.translate(c.w * 0.5 + 30, HB - 86); ctx.scale(pk, pk);
          ctx.fillStyle = 'rgba(8,8,12,0.9)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(-190, -52, 380, 104, 14); else ctx.rect(-190, -52, 380, 104); ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
          FX.text(ctx, pl.text, 0, 2, { size: 68, fill: /中柱/.test(pl.text) ? '#ffe066' : '#fff', outerW: 0.2, font: FX.FONT_BODY, weight: '900', maxW: 350 });
          ctx.restore();
        }
        // 5) 字幕列（回合／進球、獲得彈珠、比分）：畫在紙片特效之後（LCD.overlays），紙片不會蓋到字
        var self = this, hudDraw = function (ctx) {
          var y0 = HB + 10, hh = c.h - y0 - 8, last = bb.round === bb.rounds;
          var box = function (x, w, col) { ctx.save(); ctx.fillStyle = 'rgba(8,8,12,0.92)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(x, y0, w, hh, 12); else ctx.rect(x, y0, w, hh); ctx.fill(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); };
          // 回合＋進球
          box(10, 308, last ? '#ff3c50' : '#e8b440');
          FX.text(ctx, last ? '最后' : '回合', 26, y0 + 30, { size: 34, fill: last ? '#ff5a6e' : '#fff', align: 'left', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
          FX.text(ctx, Math.max(1, bb.round) + '/' + bb.rounds, 26, y0 + 76, { size: 48, fill: last ? FX.GRAD.red : FX.GRAD.gold, align: 'left', outerW: 0.2 });
          for (var i = 0; i < N; i++) {
            var on = i < bb.count, bx2 = 158 + (i % 5) * 32, by2 = y0 + 32 + Math.floor(i / 5) * 42, rr2 = 13 * (on && i === bb.count - 1 ? 1 + 0.5 * st.hudPop : 1);
            ctx.save(); if (on) { ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 14; }
            ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.16)'; ctx.beginPath(); ctx.arc(bx2, by2, rr2, 0, 6.28); ctx.fill();
            if (on) { ctx.shadowBlur = 0; ctx.fillStyle = '#16161c'; ctx.beginPath(); for (var pi = 0; pi < 5; pi++) { var pa2 = -Math.PI / 2 + pi * Math.PI * 2 / 5; ctx.lineTo(bx2 + Math.cos(pa2) * rr2 * 0.46, by2 + Math.sin(pa2) * rr2 * 0.46); } ctx.closePath(); ctx.fill(); }
            ctx.restore();
          }
          // 獲得彈珠
          var tgt = bb.payout || 0;
          if (self.show == null || self.show > tgt) self.show = tgt;
          if (self.show < tgt) { self.show = Math.min(tgt, self.show + Math.max(1, Math.ceil((tgt - self.show) * 0.08))); self.pop = 1; }
          self.pop = Math.max(0, (self.pop || 0) - 0.06);
          box(328, 300, 'rgba(255,210,63,' + (0.55 + 0.45 * self.pop) + ')');
          FX.text(ctx, '获得弹珠', 344, y0 + 30, { size: 34, fill: '#fff', align: 'left', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
          ctx.save(); ctx.translate(570, y0 + 76); ctx.scale(1 + 0.12 * self.pop, 1 + 0.12 * self.pop);
          FX.text(ctx, String(self.show), 0, 0, { size: 58, fill: FX.GRAD.gold, align: 'right', outerW: 0.2, glow: '#ff9900' }); ctx.restore();
          FX.text(ctx, '颗', 614, y0 + 80, { size: 36, fill: '#fff', align: 'right', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
          // 比分
          var sb = st.story || storyFor(bb ? bb.rounds : 10), away = sb.deficit;
          box(638, 312, '#e8b440');
          FX.text(ctx, '补时阶段', 770, y0 + 28, { size: 32, fill: '#fff', outerW: 0.16, font: FX.FONT_BODY, weight: '900' });
          FX.text(ctx, '韩国', 686, y0 + 78, { size: 34, fill: '#9fe6ff', outerW: 0.16, font: FX.FONT_BODY, weight: '900' });
          FX.text(ctx, String(away), 742, y0 + 78, { size: 46, fill: '#fff', outerW: 0.16 });
          FX.text(ctx, '－', 771, y0 + 78, { size: 30, fill: '#fff', outerW: 0.16, font: FX.FONT_BODY, weight: '900' });
          ctx.save(); ctx.translate(800, y0 + 78); ctx.scale(1 + 0.5 * st.scorePop, 1 + 0.5 * st.scorePop);
          FX.text(ctx, String(st.home), 0, 0, { size: 46, fill: st.home > away ? FX.GRAD.gold : st.home === away ? '#ff8a00' : '#fff', outerW: 0.16, glow: st.scorePop > 0 ? '#ffcc00' : null }); ctx.restore();
          FX.text(ctx, '中国', 856, y0 + 78, { size: 34, fill: '#ffd23f', outerW: 0.16, font: FX.FONT_BODY, weight: '900' });
          var dcx = 918, dcy = y0 + 56, ds = 15;   // 壘包
          [[dcx + ds, dcy], [dcx, dcy - ds], [dcx - ds, dcy]].forEach(function (bp, i2) {
            var onb = st.bases[i2]; ctx.save(); ctx.translate(bp[0], bp[1]); ctx.rotate(Math.PI / 4);
            if (onb) { ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 12; }
            ctx.fillStyle = onb ? '#ffd23f' : 'rgba(255,255,255,0.22)'; ctx.fillRect(-7, -7, 14, 14); ctx.shadowBlur = 0; ctx.lineWidth = 1.6; ctx.strokeStyle = '#fff'; ctx.strokeRect(-7, -7, 14, 14); ctx.restore();
          });
        };
        var overOk = !st.manga && !PK.LCD.hudHidden;   // 漫畫分格、全畫面分鏡播放時，字幕列照原順序畫在下面（不壓到它們的大字）
        if (overOk) (PK.LCD.overlays = PK.LCD.overlays || []).push(hudDraw); else if (!st.manga) hudDraw(ctx);
        // 6) 打席結果大字（漫畫橫帶）
        if (st.hit && st.hit.beat && !st.hit.cine && st.hit.t > 0.25 && st.hit.t < 3.6) {
          var ht = st.hit.t - 0.25, hk = ht < 0.18 ? FX.ease.outBack(ht / 0.18) : 1, ha = st.hit.t > 3.2 ? Math.max(0, (3.6 - st.hit.t) / 0.4) : 1, big = st.hit.beat.hit === 'homer';
          ctx.save(); ctx.globalAlpha = ha;
          ctx.fillStyle = big ? 'rgba(200,0,30,0.88)' : 'rgba(0,0,0,0.78)'; ctx.fillRect(0, HB * 0.5 - (big ? 92 : 78) * hk, c.w, (big ? 184 : 156) * hk);
          ctx.translate(c.w / 2, HB * 0.5); ctx.scale(hk, hk);
          FX.text(ctx, st.hit.beat.text, 0, 0, { size: big ? 96 : 84, fill: big ? FX.rainbowGrad(ctx, -400, 0, 400, 0, t) : FX.GRAD.gold, outer: '#1a0006', mid: '#fff', glow: '#ffcc00', maxW: c.w - 40 });
          ctx.restore();
        }
        // 7) 新打者上場的漫畫分格
        if (st.manga) drawManga(ctx, c, st.manga, t);
      },
    };
  }
  // 漫畫分格：三個斜切格子依序從兩側滑進來，最後一格放大字
  function drawManga(ctx, c, mg, t) {
    var T = mg.t, out = T > 1.6 ? Math.min(1, (T - 1.6) / 0.3) : 0;
    ctx.save(); ctx.globalAlpha = 1 - out;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, 0, c.w, c.h);
    var panels = [
      { pts: [[0, 0], [c.w * 0.62, 0], [c.w * 0.5, c.h * 0.5], [0, c.h * 0.56]], d: 0, from: -1, img: mg.m.img, zoom: 1.5, ox: -0.1, oy: 0.1 },
      { pts: [[c.w * 0.66, 0], [c.w, 0], [c.w, c.h * 0.46], [c.w * 0.54, c.h * 0.52]], d: 0.12, from: 1, img: 'cut_heroine', zoom: 1.2, ox: 0.1, oy: 0.05 },
      { pts: [[0, c.h * 0.6], [c.w * 0.52, c.h * 0.55], [c.w, c.h * 0.5], [c.w, c.h], [0, c.h]], d: 0.24, from: -1, img: 'splash_homerun', zoom: 1.1, ox: 0, oy: 0 },
    ];
    panels.forEach(function (pn, i) {
      var k = Math.min(1, Math.max(0, (T - pn.d) / 0.22)); if (k <= 0) return;
      var sx = (1 - FX.ease.outCubic(k)) * pn.from * c.w;
      ctx.save(); ctx.translate(sx, 0);
      ctx.beginPath(); pn.pts.forEach(function (p, j) { if (j) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }); ctx.closePath();
      ctx.save(); ctx.clip();
      var im = A.get(pn.img);
      ctx.fillStyle = '#fff'; ctx.fillRect(-c.w, -c.h, c.w * 3, c.h * 3);
      if (im) { var zw = c.w * pn.zoom, zh = zw * im.height / im.width; ctx.drawImage(im, (c.w - zw) / 2 + pn.ox * c.w + Math.sin(t * 3 + i) * 6, (c.h - zh) / 2 + pn.oy * c.h, zw, zh); }
      speedLines(ctx, c.w * 0.5, c.h * 0.45, 260, 1000, 70, i === 1 ? '#fff' : '#000', 0.35, i * 7);
      ctx.restore();
      ctx.lineWidth = 12; ctx.strokeStyle = '#000'; ctx.stroke(); ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke();
      ctx.restore();
    });
    if (T > 0.4) { var tk = Math.min(1, (T - 0.4) / 0.15); onomato(ctx, mg.m.text, c.w * 0.5, c.h * 0.78, 96, -0.08, mg.m.col, FX.ease.outBack(tk)); }
    if (mg.no && T > 0.25) { var nk = Math.min(1, (T - 0.25) / 0.15); onomato(ctx, mg.no + (mg.no === PINCH ? ' 主罚' : ' 进攻'), c.w * 0.36, c.h * 0.42, 72, -0.06, '#1a3aff', FX.ease.outBack(nk)); }
    ctx.restore();
  }
  D.roundStart = async function (b) {
    var t0 = Clock.now; await Clock.until(function () { return !L().cineBusy || Clock.now - t0 > 15000; });
    var sty0 = storyFor(b.rounds), pinchAt = sty0.beats.findIndex(function (x) { return x.no === PINCH; }) + 1 || sty0.beats.length;
    if (b.round === pinchAt) await D.cine(cinePinch(), { z: 45 });   // 主角代打登場（大獎口開之前播完）
    Au().play('round_hit', { vol: 0.55 });
    if (b.round === 1) Au().voice('round');
    L().setBg(ROUND_BG[(b.round - 1) % ROUND_BG.length], 600);
    if (!B().slam) L().banner('第 ' + b.round + ' 回合', { fill: FX.GRAD.gold, size: 80, dur: 1.1, y: C().h * 0.55 });
    else B().slam(b.round === b.rounds ? '最终回合' : '第 ' + b.round + ' 回合', { kind: b.round === b.rounds ? 'red' : 'gold', w: b.round === b.rounds ? 900 : 720, y: 520, hold: b.round === b.rounds ? 1.4 : 0.8, rays: b.round === b.rounds ? 0xff3355 : 0xffd23f });
    if (b.round === b.rounds && !B().slam) L().banner('最终回合', { fill: FX.GRAD.red, size: 56, dur: 1.4, y: C().h * 0.72 });
    // 回合中的「全壘打秀」：大獎洞口每進一顆，打者就擊出一支全壘打（漫畫集中線＋擬聲字＋煙火）
    if (!L().cheer) L().cheer = L().add(RoundLive());
    await W(300);
  };

  D.bonusEnd = async function (b, info) {
    var t1 = Clock.now; await Clock.until(function () { return !L().cineBusy || Clock.now - t1 > 16000; });
    var g = G(), sp = g.specObj();
    if (L().cheer) { L().cheer.done = true; L().cheer = null; }
    L().clearActors();
    if (b.payout > 0 && b.rounds >= 3) {
      await D.cine([{ img: 'sc_hero_raise', dur: 2.4, z0: 1.15, z1: 1.0, f0: [0.5, 0.4], flash: true, confetti: 80, fireworks: 3, text: '球进了!!', size: 110, fill: 'rainbow', y: 600 }], { z: 45 });
    }
    if (b.payout > 0) {
      // 本次大当り總出玉：數字從 0 滾上去
      Au().play('count', { vol: 0.6 });
      L().add({
        z: 55, dur: B().slam ? 2.9 : 4.5,   // 有整台大字時，數字跑完就淡出（不跟大字疊在一起）
        draw: function (ctx) {
          var c = C(), k = Math.min(1, this.t / 2.6), n = Math.round(b.payout * FX.ease.outCubic(k));
          var a = this.t > this.dur - 0.3 ? Math.max(0, (this.dur - this.t) / 0.3) : 1;
          ctx.save(); ctx.globalAlpha = a * 0.7; ctx.fillStyle = '#000'; ctx.fillRect(0, c.h * 0.26, c.w, c.h * 0.48); ctx.restore();
          ctx.save(); ctx.globalAlpha = a;
          FX.rays(ctx, c.w / 2, c.h / 2, 420, 18, L().t * 0.8, '#ffd23f', 0.35);
          FX.text(ctx, '大奖结束', c.w / 2, c.h * 0.31, { size: 72, fill: '#fff', font: FX.FONT_BODY, weight: '900', outerW: 0.22 });
          FX.text(ctx, '这次共获得', c.w / 2, c.h * 0.43, { size: 50, fill: '#ffd23f', font: FX.FONT_BODY, weight: '900', outerW: 0.22 });
          FX.text(ctx, n + '颗', c.w / 2, c.h * 0.6, { size: 150, fill: FX.GRAD.gold, glow: '#ff9900', maxW: c.w - 60 });
          ctx.restore();
        },
      });
      L().fireworks(4); L().confetti(90);
      if (B().kick) B().kick('#ffe066', 1);
      await W(2700); L().fireworks(5); if (B().kick) B().kick('#ffffff', 1.2);   // 數字跑完再爆一次
      if (B().slam) B().slam(b.payout + '颗', { kind: 'gold', w: 900, y: 600, hold: 1.4, rays: 0xffd23f, sub: '获得弹珠', subKind: 'white' });
      await W(2200);
    }
    L().reelAlpha = 1;
    var pct = function (p, n) { return Math.round((1 - Math.pow(1 - p, n)) * 100); };
    if (info.nextMode === 'lt' && info.prevMode !== 'lt') {
      Au().stopBgm(0.2);
      L().flash('#ffd23f', 1); B().doFlash('#ffd23f', 1); B().doShake(14); L().doShake(24);
      Au().play('lt'); Au().voice('lt');
      L().setBg('bg_gold', 200);
      B().lampMode = 'lt';
      L().banner('幸运爆发', { img: 'fx_lt', imgW: 860, rainbow: true, size: 110, rays: '#ffd23f', dur: 2.6, shake: 6 });
      L().fireworks(8); L().confetti(200);
      await W(2700);
      Au().playBgm('jingle_rush'); Au().voice('gold');
      L().setBg('splash_rush', 300);
      L().banner('黄金连胜', { fill: FX.GRAD.gold, size: 120, rays: '#fff', dur: 3.0, sub: '大奖结束 → 连胜机会！' + sp.ltSpins + ' 转内约 ' + pct(sp.ltProb, sp.ltSpins) + '% 再中' });
      await W(3200);
    } else if ((info.nextMode === 'rush' || info.nextMode === 'lt') && info.entering) {
      Au().playBgm('jingle_rush'); Au().voice('rush');
      L().setBg('splash_rush', 300);
      L().flash('#fff', 1); B().doFlash('#2aa8ff', 1); B().doShake(8);
      L().banner('连胜冲刺', { img: 'fx_rush', imgW: 840, fill: FX.GRAD.blue, size: 116, rays: '#2aa8ff', dur: 5.0, sub: '大奖结束 → 连胜机会！' + sp.stSpins + ' 转内约 ' + pct(sp.stProb, sp.stSpins) + '% 再中' });
      L().fireworks(6); L().confetti(150);
      await W(2600); L().fireworks(5);
      await W(2600);
    } else if (info.nextMode === 'rush' || info.nextMode === 'lt') {
      Au().voice('keizoku');
      L().setBg(info.nextMode === 'lt' ? 'bg_gold' : 'bg_night', 300);
      L().banner('连胜继续!!', { fill: info.nextMode === 'lt' ? FX.GRAD.gold : FX.GRAD.blue, size: 110, rays: '#fff', dur: 4.0, sub: '大奖结束 → 连胜继续！已连 ' + g.chain + ' 次' });
      L().confetti(80); L().fireworks(4);
      await W(4100);
    } else if (info.nextMode === 'jitan') {
      Au().voice('jitan');
      L().setBg('bg_sunset', 300);
      L().banner('机会时间', { fill: FX.GRAD.red, size: 110, rays: '#ff8a00', dur: 4.0, sub: '大奖结束 → 接下来 ' + sp.jitanSpins + ' 转是再中机会' });
      await W(4100);
    }
    D.restoreMode();
  };

  D.modeEnd = async function (prev, info) {
    B().rightArrow = false;
    if (prev === 'rush' || prev === 'lt') {
      Au().stopBgm(0.3);
      Au().playBgm('jingle_end'); Au().voice('rush_end');
      L().setBg('splash_rush', 400);
      L().dimTarget = 0.4;
      L().banner('连胜结束', { fill: FX.GRAD.white, size: 100, dur: 3.6, sub: '连胜 ' + info.chain + ' 次・共获得 ' + info.payout + ' 颗', subSize: 50, subFill: FX.GRAD.gold });
      await W(3800);
      L().dimTarget = 0;
    } else {
      L().banner('机会时间结束', { fill: FX.GRAD.white, size: 76, dur: 2.2, sub: '这次没有再中', subSize: 40, subFill: '#fff' });
      await W(1900);
    }
    G().mode = 'normal';
    D.restoreMode();
    // 不再播「請打左邊」的語音，字幕也不指定打哪邊（玩家想怎麼打是玩家的事）
    L().banner('回到平常状态', { fill: FX.GRAD.white, size: 56, dur: 3.0, y: C().h * 0.82, band: 'rgba(0,60,160,0.85)', sub: '打进启动口抽大奖', subSize: 32, subFill: '#fff' });
  };

  D.winAlign = winAlign;   // DEV「大獎畫面」預覽用
  PK.Director = D;
})(window.PK);

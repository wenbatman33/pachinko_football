/* =========================================================
 * 液晶畫面：背景、圖柄捲軸、保留圖示、HUD、演出角色（actors）
 * 液晶畫布 960 × 720，再縮放貼到盤面上的液晶框
 * ========================================================= */
(function (PK) {
  'use strict';
  var FX = PK.FX, A = PK.Assets;

  var L = {
    canvas: null, ctx: null, t: 0,
    bg: { key: 'bg_day', prev: null, fade: 1, zoom: 1.05, tint: 0, tintColor: '#000' },
    reels: [], mini: 0, miniTarget: 0, reelAlpha: 1, reelSync: false,
    actors: [], particles: null, flashA: 0, flashColor: '#fff', shake: 0, dim: 0, dimTarget: 0,
    activeHold: null, holdFx: [], symCache: {}, reachGlow: 0, winGlow: 0, hudHidden: false,
    pushActor: null,
  };
  var STRIP = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  function mod(a, n) { return ((a % n) + n) % n; }
  function LL() { return PK.LCD_LAYOUT; }

  L.init = function () {
    // q＝液晶畫布的解析度倍率（手機上液晶實際只顯示 400px 寬左右，用一半解析度畫就夠：每格要畫、要上傳到顯示卡的畫素只剩四分之一）
    L.q = PK.LCD_Q || 1;
    L.canvas = document.createElement('canvas');
    L.canvas.width = Math.round(LL().w * L.q); L.canvas.height = Math.round(LL().h * L.q);
    L.ctx = L.canvas.getContext('2d');
    // 前景畫布：文字、演出、比分板、保留燈畫在這張（透明底），機台把它疊在ワープ入口與透明管上面，字永遠不會被擋到
    L.canvasTop = document.createElement('canvas');
    L.canvasTop.width = Math.round(LL().w * L.q); L.canvasTop.height = Math.round(LL().h * L.q);
    L.ctxTop = L.canvasTop.getContext('2d');
    L.particles = new FX.Particles();
    for (var i = 0; i < 3; i++) L.reels.push({ p: Math.floor(Math.random() * 9), speed: 0, state: 'stop', bounce: 0, flash: 0 });
    L.buildSymbols();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { L.buildSymbols(); });
  };

  // ---------- 圖柄（預先繪製） ----------
  L.buildSymbols = function () {
    for (var n = 1; n <= 9; n++) L.symCache[n] = drawSymbol(n);
  };

  function drawSymbol(n) {
    var S = 256, c = document.createElement('canvas'); c.width = S; c.height = S;
    var g = c.getContext('2d'), cx = S / 2, cy = S / 2;
    // 有 AI 生成的 3D 圖柄就直接用（等比縮放置中，加一點發光）
    var art = A.get('sym_' + n);
    if (art) {
      var k = Math.min(244 / art.width, 244 / art.height), w = art.width * k, h = art.height * k;
      g.save(); g.shadowColor = n === 7 ? 'rgba(255,190,40,0.95)' : n % 2 ? 'rgba(255,50,70,0.75)' : 'rgba(60,150,255,0.75)'; g.shadowBlur = 22;
      g.drawImage(art, cx - w / 2, cy - h / 2, w, h); g.restore();
      return c;
    }
    var odd = n % 2 === 1, seven = n === 7;
    // 背後的足球（沒有數字圖檔時才會畫到）
    var bg = g.createRadialGradient(cx - 30, cy - 34, 10, cx, cy, 100);
    bg.addColorStop(0, '#ffffff'); bg.addColorStop(0.7, '#e9e4d8'); bg.addColorStop(1, '#a89f8c');
    g.save();
    g.shadowColor = seven ? 'rgba(255,200,40,0.9)' : odd ? 'rgba(255,60,60,0.7)' : 'rgba(60,160,255,0.7)';
    g.shadowBlur = 26;
    g.fillStyle = bg; g.beginPath(); g.arc(cx, cy, 96, 0, 6.283); g.fill();
    g.restore();
    // 足球的黑色五邊形拼塊：中央一塊、外圈五塊（只露出靠內的一角）
    g.save(); g.beginPath(); g.arc(cx, cy, 96, 0, 6.283); g.clip(); g.fillStyle = 'rgba(22,22,28,0.82)';
    var pent = function (px, py, r, rot) { g.beginPath(); for (var k = 0; k < 5; k++) { var a = rot + k * 1.2566; g.lineTo(px + Math.cos(a) * r, py + Math.sin(a) * r); } g.closePath(); g.fill(); };
    pent(cx, cy, 30, -1.5708);
    for (var k = 0; k < 5; k++) { var a2 = -1.5708 + k * 1.2566; pent(cx + Math.cos(a2) * 88, cy + Math.sin(a2) * 88, 30, a2 + 3.1416); }
    g.restore();
    if (seven) {
      // 7：金色光環
      g.save(); g.globalCompositeOperation = 'lighter';
      FX.rays(g, cx, cy, 128, 14, 0.2, 'rgba(255,210,60,0.9)', 0.5);
      g.restore();
    }
    // ---- 立體金屬數字：厚度 → 深色外框 → 金屬邊 → 金屬面（中間暗帶）→ 上半亮面 → 閃光 ----
    var str = String(n), fs = 214, ty = cy + 12, font = '400 ' + fs + 'px "Dela Gothic One", "Noto Sans SC", sans-serif';
    var FACE = seven ? [['#fffbe0', 0], ['#ffe066', 0.3], ['#b86a00', 0.5], ['#ffcc33', 0.64], ['#fff2a0', 1]]
      : odd ? [['#ffe0e0', 0], ['#ff4a5e', 0.34], ['#9a0018', 0.5], ['#ff2a3a', 0.66], ['#ffb0b8', 1]]
        : [['#e8f8ff', 0], ['#5ad0ff', 0.34], ['#0a3aa8', 0.5], ['#2a8cff', 0.66], ['#b8e8ff', 1]];
    var DEPTH = seven ? ['#8a4a00', '#3a1800'] : odd ? ['#70000e', '#2a0006'] : ['#08308a', '#020f3a'];
    var RIM = seven ? [['#fff6c8', 0], ['#ffd23f', 0.42], ['#7a4400', 0.55], ['#ffe680', 1]] : [['#ffffff', 0], ['#d8e0ec', 0.42], ['#5a6474', 0.55], ['#f4f8ff', 1]];
    g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    // 發光底
    if (seven || odd) { g.save(); g.shadowColor = seven ? 'rgba(255,200,40,1)' : 'rgba(255,60,80,0.9)'; g.shadowBlur = 34; g.fillStyle = 'rgba(0,0,0,0.01)'; g.fillText(str, cx, ty); g.restore(); }
    // 厚度：往右下疊深色
    for (var d = 16; d >= 1; d--) { g.fillStyle = d > 8 ? DEPTH[1] : DEPTH[0]; g.fillText(str, cx + d * 0.55, ty + d); }
    g.lineWidth = 26; g.strokeStyle = '#120004'; g.strokeText(str, cx, ty);
    var rim = g.createLinearGradient(0, ty - fs / 2, 0, ty + fs / 2); RIM.forEach(function (r) { rim.addColorStop(r[1], r[0]); });
    g.lineWidth = 13; g.strokeStyle = rim; g.strokeText(str, cx, ty);
    var face = g.createLinearGradient(0, ty - fs / 2, 0, ty + fs / 2); FACE.forEach(function (r) { face.addColorStop(r[1], r[0]); });
    g.fillStyle = face; g.fillText(str, cx, ty);
    // 上半部亮面（只蓋在字上）
    var t2 = document.createElement('canvas'); t2.width = S; t2.height = S; var h2 = t2.getContext('2d');
    h2.font = font; h2.textAlign = 'center'; h2.textBaseline = 'middle'; h2.fillStyle = '#fff'; h2.fillText(str, cx, ty);
    h2.globalCompositeOperation = 'source-in';
    var hl = h2.createLinearGradient(0, ty - fs / 2, 0, ty - 6); hl.addColorStop(0, 'rgba(255,255,255,0.8)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    h2.fillStyle = hl; h2.fillRect(0, 0, S, S);
    g.drawImage(t2, 0, 0);
    // 閃光星
    var star = function (x, y, r) {
      g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,255,255,0.95)';
      g.beginPath(); g.moveTo(x, y - r); g.quadraticCurveTo(x, y, x + r, y); g.quadraticCurveTo(x, y, x, y + r); g.quadraticCurveTo(x, y, x - r, y); g.quadraticCurveTo(x, y, x, y - r); g.fill();
      var gr = g.createRadialGradient(x, y, 0, x, y, r * 0.6); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 0.6, 0, 6.28); g.fill();
      g.restore();
    };
    star(cx + 46, ty - 78, seven ? 26 : 18); if (seven) star(cx - 52, ty + 40, 14);
    return c;
  }

  // ---------- 背景 ----------
  L.setBg = function (key, fadeMs) {
    if (L.bg.key === key) return;
    L.bg.prev = L.bg.key; L.bg.key = key; L.bg.fade = 0; L.bg.fadeSpd = 1000 / Math.max(50, fadeMs || 500);
  };
  function drawBgImage(ctx, key, alpha) {
    var W = LL().w, H = LL().h;
    ctx.save(); ctx.globalAlpha = alpha;
    var z = L.bg.zoom + Math.sin(L.t * 0.15) * 0.02;
    if (!A.cover(ctx, key, 0, 0, W, H, z)) {
      var g = ctx.createLinearGradient(0, 0, 0, H);
      var cols = { bg_day: ['#3fa9ff', '#bfe6ff', '#2f8f3f'], bg_sunset: ['#3a1050', '#ff7a3a', '#3f4f1f'], bg_night: ['#05051a', '#202060', '#1f4f2f'], bg_gold: ['#ffcc33', '#fff3b0', '#c78a00'], bg_ninth: ['#200008', '#601020', '#1f2f1f'] }[key] || ['#111', '#333', '#111'];
      g.addColorStop(0, cols[0]); g.addColorStop(0.6, cols[1]); g.addColorStop(1, cols[2]);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    }
    ctx.restore();
  }

  // ---------- 捲軸控制 ----------
  L.startReels = function (speed) {
    L.reels.forEach(function (r, i) {
      r.state = 'spin'; r.speed = 0; r.target = speed || 24; r.accel = 0.15 + i * 0.05; r.flash = 0;
    });
    L.reelSync = false;
  };
  // 停止：dur 毫秒內減速停在 sym
  L.stopReel = function (i, sym, dur) {
    var r = L.reels[i];
    var base = Math.ceil(r.p) + (dur > 800 ? 4 : 2);
    var idx = base; while (mod(idx, 9) !== sym - 1) idx++;
    r.from = r.p; r.to = idx; r.st = 0; r.dur = (dur || 300) / 1000; r.state = 'stopping';
  };
  L.slowReel = function (i, speed) { var r = L.reels[i]; r.state = 'spin'; r.target = speed; r.accel = 3; };
  L.reelSym = function (i) { return STRIP[mod(Math.round(L.reels[i].p), 9)]; };
  L.allStopped = function () { return L.reels.every(function (r) { return r.state === 'stop'; }); };
  L.setReel = function (i, sym) { var r = L.reels[i]; r.p = sym - 1 + 9 * 10; r.state = 'stop'; r.speed = 0; };

  function updateReels(dt) {
    L.reels.forEach(function (r) {
      if (r.state === 'spin') {
        r.speed += (r.target - r.speed) * Math.min(1, dt / Math.max(0.02, r.accel));
        r.p += r.speed * dt;
      } else if (r.state === 'stopping') {
        r.st += dt;
        var e = Math.min(1, r.st / r.dur);
        r.p = r.from + (r.to - r.from) * FX.ease.outCubic(e);
        r.speed = (r.to - r.from) / r.dur * 3 * Math.pow(1 - e, 2);
        if (e >= 1) { r.p = r.to; r.state = 'bounce'; r.bt = 0; r.speed = 0; if (L.onReelStop) L.onReelStop(); }
      } else if (r.state === 'bounce') {
        r.bt += dt;
        var k = Math.min(1, r.bt / 0.2);
        r.p = r.to + 0.1 * Math.sin(k * Math.PI) * (1 - k);
        if (k >= 1) { r.p = r.to; r.state = 'stop'; }
      }
      r.flash = Math.max(0, r.flash - dt * 2);
    });
    if (L.reelSync) { var p0 = L.reels[0].p; L.reels[1].p = p0; L.reels[2].p = p0; }
  }

  function drawReels(ctx) {
    var C = LL(), m = FX.ease.inOut(L.mini);
    if (L.reelAlpha <= 0) return;
    ctx.save(); ctx.globalAlpha = L.reelAlpha;
    var big = C.symSize, small = C.miniSize;
    // 大捲軸後方的暗幕（提升可讀性）
    if (m < 0.95) {
      // 暗幕加深、蓋到上下三排（使用者：數字被背景吃掉看不清楚）
      var hb = C.symGap * 1.9;
      ctx.save(); ctx.globalAlpha = L.reelAlpha * (1 - m) * 0.62;
      var gg = ctx.createLinearGradient(0, C.reelY - hb, 0, C.reelY + hb);
      gg.addColorStop(0, 'rgba(0,0,8,0)'); gg.addColorStop(0.22, 'rgba(0,0,8,0.75)'); gg.addColorStop(0.5, 'rgba(0,0,8,1)'); gg.addColorStop(0.78, 'rgba(0,0,8,0.75)'); gg.addColorStop(1, 'rgba(0,0,8,0)');
      ctx.fillStyle = gg; ctx.fillRect(0, C.reelY - hb, C.w, hb * 2); ctx.restore();
      // 每個轉輪後面一塊半透明深色底板，數字跟背景分開
      ctx.save(); ctx.globalAlpha = L.reelAlpha * (1 - m);
      for (var pi = 0; pi < 3; pi++) {
        var px = C.reelX[pi], pw2 = C.symGap - 14, ph = C.symGap * 2.4;
        ctx.fillStyle = 'rgba(4,6,20,0.42)'; ctx.beginPath(); ctx.roundRect(px - pw2 / 2, C.reelY - ph / 2, pw2, ph, 22); ctx.fill();
        ctx.strokeStyle = 'rgba(255,214,90,0.35)'; ctx.lineWidth = 3; ctx.stroke();
      }
      ctx.restore();
    }
    for (var i = 0; i < 3; i++) {
      var r = L.reels[i];
      var cx = FX.lerp(C.reelX[i], C.miniX + i * C.miniGap, m);
      var cy = FX.lerp(C.reelY, C.miniY, m);
      var size = FX.lerp(big, small, m), gap = FX.lerp(C.symGap, C.miniSize * 1.05, m);
      var visible = m > 0.5 ? 0 : 1;
      ctx.save();
      // 裁切出捲軸視窗
      ctx.beginPath();
      if (m > 0.5) ctx.rect(cx - size / 2 - 2, cy - size / 2 - 2, size + 4, size + 4);
      else ctx.rect(cx - gap / 2 - 10, cy - gap * 1.25, gap + 20, gap * 2.5);
      ctx.clip();
      var base = Math.floor(r.p), frac = r.p - base;
      var blur = Math.min(1, Math.abs(r.speed) / 22);
      for (var k = -2 - visible; k <= 2 + visible; k++) {
        var idx = base - k;
        var y = cy + (r.p - idx) * gap;
        if (Math.abs(y - cy) > gap * 1.6) continue;
        var sym = STRIP[mod(idx, 9)];
        var img = L.symCache[sym];
        var dist = Math.abs(y - cy) / gap;
        var a = Math.max(0, 1 - dist * (m > 0.5 ? 2 : 0.72));   // 上下兩排淡一點，中間那排最清楚
        if (blur > 0.25) {
          // 動態模糊：垂直拉長＋殘影
          ctx.globalAlpha = L.reelAlpha * a * 0.45;
          for (var bk = -2; bk <= 2; bk++) ctx.drawImage(img, cx - size / 2, y - size / 2 + bk * gap * 0.12 * blur, size, size * (1 + blur * 0.25));
        } else {
          ctx.globalAlpha = L.reelAlpha * a;
          var s2 = size * (r.state === 'stop' && k === 0 ? 1 + 0.06 * L.winGlow * Math.sin(L.t * 12) : 1);
          ctx.drawImage(img, cx - s2 / 2, y - s2 / 2, s2, s2);
        }
      }
      ctx.restore();
      if (r.flash > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = r.flash;
        var fg = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.7);
        fg.addColorStop(0, '#fff'); fg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = fg; ctx.beginPath(); ctx.arc(cx, cy, size * 0.7, 0, 6.28); ctx.fill(); ctx.restore();
      }
    }
    ctx.restore();
  }

  // ---------- 保留圖示 ----------
  var HOLD_COL = {
    white: ['#ffffff', '#d8d8d8'], blue: ['#bfe8ff', '#1f8bff'], green: ['#c8ffd0', '#1fcf4d'],
    red: ['#ffd0d0', '#ff1f3d'], gold: ['#fff3b0', '#ffb300'], rainbow: null,
  };
  function drawHoldIcon(ctx, x, y, r, color, t, pulse) {
    ctx.save();
    var col = HOLD_COL[color];
    var glowCol = color === 'rainbow' ? 'hsl(' + ((t * 300) % 360) + ',100%,60%)' : col[1];
    if (color !== 'white') {
      ctx.globalCompositeOperation = 'lighter';
      var gr = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * (2 + 0.3 * Math.sin(t * 6)));
      gr.addColorStop(0, glowCol); gr.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(x, y, r * 2.3, 0, 6.28); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }
    if (color === 'red' || color === 'gold' || color === 'rainbow') {
      // 火焰
      for (var f = 0; f < 6; f++) {
        var a = -Math.PI / 2 + (f - 2.5) * 0.35, fl = r * (1.2 + 0.4 * Math.sin(t * 14 + f * 2));
        ctx.fillStyle = color === 'red' ? 'rgba(255,90,40,0.75)' : color === 'gold' ? 'rgba(255,200,40,0.8)' : 'hsla(' + ((t * 300 + f * 60) % 360) + ',100%,60%,0.8)';
        ctx.beginPath(); ctx.ellipse(x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7 - r * 0.3, r * 0.28, fl * 0.6, a + Math.PI / 2, 0, 6.28); ctx.fill();
      }
    }
    var fill;
    if (color === 'rainbow') fill = FX.rainbowGrad(ctx, x - r, y - r, x + r, y + r, t * 0.6);
    else { fill = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); fill.addColorStop(0, '#fff'); fill.addColorStop(0.5, col[0]); fill.addColorStop(1, col[1]); }
    ctx.fillStyle = fill;
    var s = r * (pulse || 1);
    ctx.beginPath(); ctx.arc(x, y, s, 0, 6.28); ctx.fill();
    // 足球的拼塊：中央一塊黑色五邊形，外圈五塊只露出一角
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, s, 0, 6.28); ctx.clip();
    ctx.fillStyle = color === 'white' ? '#16161c' : 'rgba(20,6,10,0.72)';
    var pent = function (px, py, pr, rot) { ctx.beginPath(); for (var q = 0; q < 5; q++) { var pa = rot + q * 1.2566; ctx.lineTo(px + Math.cos(pa) * pr, py + Math.sin(pa) * pr); } ctx.closePath(); ctx.fill(); };
    pent(x, y, s * 0.36, -1.5708);
    for (var q2 = 0; q2 < 5; q2++) { var pa2 = -1.5708 + q2 * 1.2566; pent(x + Math.cos(pa2) * s * 0.98, y + Math.sin(pa2) * s * 0.98, s * 0.36, pa2 + 3.1416); }
    ctx.restore();
    ctx.strokeStyle = 'rgba(20,6,10,0.7)'; ctx.lineWidth = Math.max(1, r * 0.06); ctx.beginPath(); ctx.arc(x, y, s, 0, 6.28); ctx.stroke();
    ctx.restore();
  }
  L.drawHoldIcon = drawHoldIcon;

  function drawHolds(ctx) {
    if (PK.Game.inBonus && L.cheer) return;   // 大獎回合中最下面是字幕列，保留圖示先不畫（大獎結束會再出現）
    var C = LL(), G = PK.Game, t = L.t;
    var list = G.holds2.length ? G.holds2 : G.holds1;
    var other = G.holds2.length ? G.holds1 : G.holds2;
    // 當該保留（變動中）
    if (L.activeHold) {
      var ah = L.activeHold;
      ctx.save();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(C.holdActiveX, C.holdY + C.holdActiveR * 0.9, C.holdActiveR * 1.4, 7, 0, 0, 6.28); ctx.fill();
      ctx.restore();
      drawHoldIcon(ctx, C.holdActiveX, C.holdY, C.holdActiveR, ah.color, t, ah.pop ? 1 + ah.pop : 1);
    }
    for (var i = 0; i < 4; i++) {
      var x = C.holdX0 + i * C.holdGap, y = C.holdY;
      var h = list[i];
      if (!h) {
        ctx.save(); ctx.globalAlpha = 0.25; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, C.holdR * 0.6, 0, 6.28); ctx.stroke(); ctx.restore();
        continue;
      }
      if (h.dx == null) h.dx = x + 40;
      h.dx += (x - h.dx) * 0.2;
      drawHoldIcon(ctx, h.dx, y, C.holdR, h.color, t + i, h.pop ? 1 + h.pop : 1);
    }
    // 另一側特図的保留數（小字）
    if (other.length) {
      FX.text(ctx, (G.holds2.length ? '保留1 ' : '保留2 ') + other.length, C.holdX0 - 260, C.holdY, { size: 22, fill: '#ddd', outerW: 0.2, font: FX.FONT_BODY, weight: '800' });
    }
    // 保留變化特效
    for (var j = L.holdFx.length - 1; j >= 0; j--) {
      var f = L.holdFx[j]; f.t += 1 / 60;
      if (f.t > 0.6) { L.holdFx.splice(j, 1); continue; }
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 1 - f.t / 0.6;
      FX.rays(ctx, f.x, f.y, 70 * (0.5 + f.t), 12, f.t * 3, '#fff', 0.8);
      ctx.restore();
    }
  }

  // 保留色升級動畫
  L.upgradeHold = function (h, color, x, y) {
    h.color = color; h.pop = 0.6;
    var C = LL();
    var px = x != null ? x : (h === L.activeHold ? C.holdActiveX : h.dx || C.holdX0);
    L.holdFx.push({ x: px, y: y || C.holdY, t: 0 });
    L.particles.emit({ x: px, y: C.holdY, n: 24, color: color === 'rainbow' ? ['#ff3b3b', '#ffe93b', '#3bff6e', '#3bc8ff', '#ff4bd8'] : ['#fff', HOLD_COL[color] ? HOLD_COL[color][1] : '#fff'], speedMin: 80, speedMax: 320, gravity: 200, lifeMin: 0.4, lifeMax: 0.9 });
    PK.Audio.play(color === 'rainbow' ? 'rainbow' : 'hold_up', { vol: 0.9 });
    if (color === 'rainbow') PK.Audio.voice('kakutei');
  };

  L.onHoldAdded = function (h) { h.dx = null; };

  // ---------- HUD ----------
  function drawHud(ctx) {
    if (L.hudHidden) return;
    var G = PK.Game, C = LL(), W = C.w;
    // 要打右邊（大獎中、RUSH／時短中）：液晶右上角常駐一塊閃爍的「右打ち ➡」牌子
    if (G.inBonus && !PK.NO_RIGHT) {   // 右打ち牌子只在大獎中（沒有右打就不顯示）
      var bl = Math.floor(L.t * 4) % 2 === 0;
      ctx.save(); ctx.fillStyle = bl ? 'rgba(220,0,40,0.92)' : 'rgba(255,200,40,0.92)';
      ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(W - 250, 176, 226, 64, 14); else ctx.rect(W - 250, 176, 226, 64); ctx.fill();
      ctx.lineWidth = 4; ctx.strokeStyle = '#fff'; ctx.stroke(); ctx.restore();
      FX.text(ctx, '打右边 ➡', W - 137, 209, { size: 44, fill: bl ? '#fff' : '#3a0008', outerW: 0.12, font: FX.FONT_BODY, weight: '900' });
    }
    var mode = G.mode;
    if (G.inBonus && G.bonus) {
      if (L.cheer) return;   // 大獎回合的漫畫版面（js/director.js RoundLive）最下面有自己的字幕列：回合／進球／獲得彈珠／比分
      var b = G.bonus, N = PK.PAYOUT.attackerCount;
      // 左上角面板：ROUND 大字＋10 顆入賞計數（新入賞那顆會彈一下）；縮在左上角，讓開上方中央的金色翅膀棒球
      // 字級：面板上的小標題原本只有 20～22（液晶縮到手機上不到 6 個像素，使用者：「有些中文字根本看不清楚」），一律 34 以上
      ctx.save(); ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.beginPath(); if (ctx.roundRect) ctx.roundRect(14, 20, 318, 236, 14); else ctx.rect(14, 20, 318, 236); ctx.fill();
      ctx.strokeStyle = b.round === b.rounds ? 'rgba(255,60,80,0.9)' : 'rgba(255,210,63,0.8)'; ctx.lineWidth = 3; ctx.stroke(); ctx.restore();
      FX.text(ctx, b.round === b.rounds ? '最终' : '回合', 32, 54, { size: 34, fill: b.round === b.rounds ? '#ff5a6e' : '#fff', align: 'left', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, String(Math.max(1, b.round)), 74, 118, { size: 76, fill: b.round === b.rounds ? FX.GRAD.red : FX.GRAD.gold, outerW: 0.2 });
      FX.text(ctx, '/' + b.rounds, 116, 128, { size: 36, fill: '#fff', align: 'left', outerW: 0.2 });
      if (L.hudCount !== b.count) { L.hudPop = b.count > (L.hudCount || 0) ? 1 : 0; L.hudCount = b.count; }
      L.hudPop = Math.max(0, (L.hudPop || 0) - 0.05);
      FX.text(ctx, '进球', 196, 54, { size: 34, fill: '#ffe066', align: 'left', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, b.count + '/' + N, 196, 120, { size: 50, fill: '#fff', align: 'left', outerW: 0.2 });
      for (var i = 0; i < N; i++) {
        var on = i < b.count, cx = 54 + (i % 5) * 60, cy = 180 + Math.floor(i / 5) * 44, rr = 17 * (on && i === b.count - 1 ? 1 + 0.5 * L.hudPop : 1);
        ctx.save();
        if (on) { ctx.shadowColor = '#ffcc00'; ctx.shadowBlur = 16; }
        ctx.fillStyle = on ? '#fff' : 'rgba(255,255,255,0.16)';
        ctx.beginPath(); ctx.arc(cx, cy, rr, 0, 6.28); ctx.fill();
        if (on) { ctx.shadowBlur = 0; ctx.fillStyle = '#16161c'; ctx.beginPath(); for (var pq = 0; pq < 5; pq++) { var pb = -Math.PI / 2 + pq * Math.PI * 2 / 5; ctx.lineTo(cx + Math.cos(pb) * rr * 0.46, cy + Math.sin(pb) * rr * 0.46); } ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      return;
    }
    if (mode === 'rush' || mode === 'lt') {
      var lt = mode === 'lt';
      FX.text(ctx, lt ? '黄金连胜' : '连胜冲刺', 40, 92, { size: 46, fill: lt ? FX.GRAD.gold : FX.GRAD.blue, align: 'left', outerW: 0.22, glow: lt ? '#ffcc00' : '#2aa8ff' });
      // 右邊讓開透明管（液晶右緣 x > 900、右上角）
      FX.text(ctx, '剩', W - 196, 100, { size: 36, fill: '#fff', align: 'right', outerW: 0.2, font: FX.FONT_BODY, weight: '900' });
      FX.text(ctx, String(G.modeSpins), W - 86, 102, { size: 56, fill: lt ? FX.GRAD.gold : ['#fff', '#9fe6ff'], align: 'right', outerW: 0.2 });
      FX.text(ctx, G.chain + ' 连　' + G.chainPayout + ' 颗', 40, 148, { size: 36, fill: '#fff', align: 'left', outerW: 0.22, font: FX.FONT_BODY, weight: '900' });
    } else if (mode === 'jitan') {
      FX.text(ctx, '机会时间', 40, 92, { size: 46, fill: FX.GRAD.red, align: 'left', outerW: 0.22 });
      FX.text(ctx, '剩 ' + G.modeSpins, W - 86, 100, { size: 46, fill: '#fff', align: 'right', outerW: 0.2 });
    }
  }

  // ---------- Actors ----------
  L.add = function (a) { a.t = 0; a.z = a.z || 0; L.actors.push(a); L.actors.sort(function (x, y) { return x.z - y.z; }); return a; };
  L.clearActors = function (keepZ) { L.actors = L.actors.filter(function (a) { return a.keep || (keepZ != null && a.z < keepZ); }); };
  L.remove = function (a) { var i = L.actors.indexOf(a); if (i >= 0) L.actors.splice(i, 1); };

  // 大字橫幅：彈出 → 停留 → 消失
  L.banner = function (text, o) {
    o = o || {};
    var C = LL();
    return L.add({
      z: o.z || 50, dur: o.dur || 1.6,
      draw: function (ctx) {
        var t = this.t, d = this.dur, inT = 0.22, outT = 0.25;
        var s = t < inT ? FX.ease.outBack(t / inT) : 1;
        var a = t > d - outT ? Math.max(0, (d - t) / outT) : 1;
        ctx.save(); ctx.globalAlpha = a;
        var x = o.x || C.w / 2, y = o.y || C.h / 2;
        if (o.rays) FX.rays(ctx, x, y, 420, 18, L.t * 0.8, o.rays, 0.5 * a);
        if (o.band) {
          ctx.fillStyle = o.band; ctx.globalAlpha = a * 0.75;
          ctx.fillRect(0, y - (o.size || C.bannerFont) * 0.75 * s, C.w, (o.size || C.bannerFont) * 1.5 * s);
          ctx.globalAlpha = a;
        }
        ctx.translate(x, y); ctx.scale(s * (o.sx || 1), s);
        if (o.shake) ctx.translate((Math.random() - 0.5) * o.shake, (Math.random() - 0.5) * o.shake);
        var fxImg = o.img ? A.get(o.img) : null;
        if (fxImg) {
          // 美術字特效圖
          var iw = o.imgW || 820, ih = iw * fxImg.height / fxImg.width;
          if (o.imgGlow !== false) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.35 + 0.25 * Math.sin(L.t * 20); ctx.drawImage(fxImg, -iw * 0.53, -ih * 0.53, iw * 1.06, ih * 1.06); ctx.restore(); }
          ctx.drawImage(fxImg, -iw / 2, -ih / 2, iw, ih);
        } else {
          var fill = o.rainbow ? FX.rainbowGrad(ctx, -300, 0, 300, 0, L.t) : (o.fill || FX.GRAD.gold);
          FX.text(ctx, text, 0, 0, { size: o.size || C.bannerFont, fill: fill, outer: o.outer || '#1a0006', mid: o.mid || '#fff', glow: o.glow || '#ff9900', maxW: C.w - 60 });
        }
        if (o.sub) FX.text(ctx, o.sub, 0, fxImg ? (o.imgW || 820) * fxImg.height / fxImg.width * 0.5 + 30 : (o.size || C.bannerFont) * 0.85, { size: Math.max(46, o.subSize || 46), fill: o.subFill || '#fff', font: FX.FONT_BODY, weight: '900', outerW: 0.24, maxW: C.w - 80 });
        ctx.restore();
      },
    });
  };

  // カットイン
  L.cutin = function (imgKey, color, text, o) {
    o = o || {};
    var C = LL();
    var cols = { blue: '#1f8bff', green: '#1fcf4d', red: '#ff1f3d', gold: '#ffb300', rainbow: 'rainbow', purple: '#9b2bff' };
    var col = cols[color] || color;
    return L.add({
      z: 60, dur: o.dur || 1.7,
      draw: function (ctx) {
        var t = this.t, d = this.dur;
        var inK = FX.ease.outCubic(Math.min(1, t / 0.18)), outK = t > d - 0.2 ? (d - t) / 0.2 : 1;
        var bandH = 300 * inK * outK, y = C.h / 2 + (o.dy || 0);
        ctx.save();
        // 斜帶
        ctx.translate(C.w / 2, y); ctx.rotate(-0.06);
        ctx.beginPath(); ctx.rect(-C.w, -bandH / 2, C.w * 2, bandH); ctx.clip();
        ctx.fillStyle = '#000'; ctx.fillRect(-C.w, -bandH / 2, C.w * 2, bandH);
        var slide = (1 - inK) * 600 - t * 40;
        ctx.save(); ctx.translate(slide, 0);
        if (!A.cover(ctx, imgKey, -C.w / 2 - 40, -170, C.w + 80, 340, 1.05)) {
          ctx.fillStyle = '#333'; ctx.fillRect(-C.w / 2, -150, C.w, 300);
        }
        ctx.restore();
        FX.speedLines(ctx, C.w * 2, bandH, 0, 0, 60, '#fff', 0.25, t);
        // 邊框
        var stroke = col === 'rainbow' ? FX.rainbowGrad(ctx, -C.w / 2, 0, C.w / 2, 0, L.t) : col;
        ctx.strokeStyle = stroke; ctx.lineWidth = 14;
        ctx.strokeRect(-C.w, -bandH / 2 + 7, C.w * 2, bandH - 14);
        ctx.restore();
        if (text && t > 0.15) {
          ctx.save(); ctx.globalAlpha = outK;
          var k = FX.ease.outBack(Math.min(1, (t - 0.15) / 0.25));
          ctx.translate(C.w * 0.7, y + 95); ctx.scale(k, k); ctx.rotate(-0.06);
          var fill = col === 'rainbow' ? FX.rainbowGrad(ctx, -200, 0, 200, 0, L.t) : color === 'gold' ? FX.GRAD.gold : color === 'red' ? FX.GRAD.red : color === 'green' ? FX.GRAD.green : FX.GRAD.blue;
          FX.text(ctx, text, 0, 0, { size: o.size || 64, fill: fill, outer: '#000', mid: '#fff', maxW: 560 });
          ctx.restore();
        }
      },
    });
  };

  L.flash = function (color, a) { L.flashColor = color || '#fff'; L.flashA = a == null ? 1 : a; };
  L.doShake = function (k) { L.shake = Math.max(L.shake, k || 10); };

  // 煙火
  L.fireworks = function (n) {
    var C = LL();
    for (var i = 0; i < (n || 5); i++) {
      (function (i) {
        setTimeout(function () {
          var x = FX.rand(120, C.w - 120), y = FX.rand(100, C.h * 0.5);
          var cols = FX.pick([['#ff3355', '#ffd23f', '#fff'], ['#3fd2ff', '#fff', '#7a5bff'], ['#ffd23f', '#fff6c0', '#ff8a00'], ['#3bff6e', '#fff', '#ffe93b']]);
          L.particles.emit({ x: x, y: y, n: 70, color: cols, speedMin: 120, speedMax: 420, gravity: 160, lifeMin: 0.8, lifeMax: 1.6, sizeMin: 2, sizeMax: 5, drag: 0.96 });
        }, i * 260);
      })(i);
    }
  };
  L.confetti = function (n) {
    var C = LL();
    L.particles.emit({ x: C.w / 2, y: -20, jitter: C.w / 2, jitterY: 10, n: n || 120, angle: Math.PI / 2, spread: 0.5, speedMin: 80, speedMax: 260, gravity: 120, lifeMin: 2, lifeMax: 3.5, sizeMin: 5, sizeMax: 10, type: 'confetti', color: ['#ff3355', '#ffd23f', '#3fd2ff', '#3bff6e', '#ffffff', '#ff8a00'], drag: 0.985 });
  };

  // ---------- 主更新／繪製 ----------
  L.update = function (dt) {
    L.t += dt;
    var C = LL();
    var qw = Math.round(C.w * L.q), qh = Math.round(C.h * L.q);
    if (L.canvas.width !== qw || L.canvas.height !== qh) { L.canvas.width = qw; L.canvas.height = qh; }
    L.bg.fade = Math.min(1, L.bg.fade + dt * (L.bg.fadeSpd || 2));
    L.mini += (L.miniTarget - L.mini) * Math.min(1, dt * 6);
    L.dim += (L.dimTarget - L.dim) * Math.min(1, dt * 5);
    L.flashA = Math.max(0, L.flashA - dt * 2.5);
    L.shake = Math.max(0, L.shake - dt * 30);
    L.reachGlow = Math.max(0, L.reachGlow - dt * 0.5);
    updateReels(dt);
    L.particles.update(dt);
    for (var i = L.actors.length - 1; i >= 0; i--) {
      var a = L.actors[i];
      a.t += dt * (PK.TIMING.speed || 1);
      if (a.update) a.update(dt);
      if ((a.dur && a.t >= a.dur) || a.done) L.actors.splice(i, 1);
    }
    var holds = PK.Game.holds2.length ? PK.Game.holds2 : PK.Game.holds1;
    holds.forEach(function (h) { if (h.pop) h.pop = Math.max(0, h.pop - dt * 2); });
    if (L.activeHold && L.activeHold.pop) L.activeHold.pop = Math.max(0, L.activeHold.pop - dt * 2);
  };

  function drawAttract(ctx) {
    var C = LL(), t = L.t;
    A.cover(ctx, 'splash_homerun', 0, 0, C.w, C.h, 1.08 + Math.sin(t * 0.3) * 0.04);
    ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(0, 0, C.w, C.h);
    FX.rays(ctx, C.w / 2, C.h * 0.42, 700, 20, t * 0.4, '#ffd23f', 0.35);
    var lg = A.get('logo');
    if (lg) {
      var lw = C.w * 0.82, lh = lw * lg.height / lg.width, k = 1 + Math.sin(t * 2) * 0.02;
      ctx.drawImage(lg, C.w / 2 - lw * k / 2, C.h * 0.42 - lh * k / 2, lw * k, lh * k);
    } else {
      FX.text(ctx, 'PK大逆转', C.w / 2, C.h * 0.42, { size: 150, fill: FX.GRAD.gold, font: '"PingFang SC", "Noto Sans SC", sans-serif', weight: '900' });
    }
    if (Math.floor(t * 2) % 2 === 0) FX.text(ctx, '点击开始', C.w / 2, C.h * 0.84, { size: 56, fill: FX.GRAD.white, glow: '#fff' });
    L.particles.draw(ctx);
    if (Math.random() < 0.05) L.particles.emit({ x: FX.rand(100, C.w - 100), y: FX.rand(80, C.h * 0.6), n: 30, color: ['#ffd23f', '#fff', '#ff3355'], speedMin: 60, speedMax: 220, gravity: 80, lifeMin: 0.6, lifeMax: 1.2 });
  }

  L.draw = function () {
    var ctx = L.ctx, C = LL(), top = L.ctxTop;
    var q = L.q;
    ctx.setTransform(q, 0, 0, q, 0, 0);
    top.setTransform(q, 0, 0, q, 0, 0); top.clearRect(0, 0, C.w, C.h);
    if (L.attract) { drawAttract(ctx); return; }
    if (L.shake > 0) { var sx = (Math.random() - 0.5) * L.shake, sy = (Math.random() - 0.5) * L.shake; ctx.translate(sx, sy); top.translate(sx, sy); }
    // 背景
    if (L.bg.fade < 1 && L.bg.prev) drawBgImage(ctx, L.bg.prev, 1);
    drawBgImage(ctx, L.bg.key, L.bg.fade < 1 && L.bg.prev ? L.bg.fade : 1);
    // 暗幕
    if (L.dim > 0.01) { ctx.fillStyle = 'rgba(0,0,0,' + L.dim + ')'; ctx.fillRect(-20, -20, C.w + 40, C.h + 40); }
    // 背後角色（z < 0）
    var i;
    for (i = 0; i < L.actors.length; i++) if (L.actors[i].z < 0) L.actors[i].draw(ctx);
    // リーチ光
    if (L.reachGlow > 0) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = L.reachGlow * 0.5;
      var rg = ctx.createRadialGradient(C.w / 2, C.reelY, 50, C.w / 2, C.reelY, 520);
      rg.addColorStop(0, '#ff3355'); rg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, C.w, C.h); ctx.restore();
    }
    if (L.winGlow > 0) FX.rays(ctx, C.w / 2, C.reelY, 700, 24, L.t * 0.6, '#ffd23f', 0.45 * L.winGlow);
    drawReels(ctx);
    // 以下畫在前景畫布：演出（z ≥ 0）、文字、面板、保留燈（機台把前景疊在ワープ入口與透明管上面）
    for (i = 0; i < L.actors.length; i++) if (L.actors[i].z >= 0) L.actors[i].draw(top);
    L.particles.draw(top);
    // 要蓋在紙片特效上面的面板（大獎中的比分板、獲得出玉）：演出那邊每格登記，這裡畫完就清掉
    if (L.overlays && L.overlays.length) { var ov = L.overlays; L.overlays = []; ov.forEach(function (f) { f(top); }); }
    drawHolds(top);
    drawHud(top);
    if (L.flashA > 0) {
      top.save(); top.globalAlpha = Math.min(1, L.flashA); top.fillStyle = L.flashColor === 'rainbow' ? FX.rainbowGrad(top, 0, 0, C.w, C.h, L.t) : L.flashColor;
      top.fillRect(-20, -20, C.w + 40, C.h + 40); top.restore();
    }
  };

  PK.LCD = L;
})(window.PK);

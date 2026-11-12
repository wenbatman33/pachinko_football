/* =========================================================
 * 共用特效工具：粒子、緩動、文字描邊、時間排程
 * ========================================================= */
(function (PK) {
  'use strict';

  var FX = {};

  // ---------- 緩動 ----------
  FX.ease = {
    linear: function (t) { return t; },
    outCubic: function (t) { return 1 - Math.pow(1 - t, 3); },
    inCubic: function (t) { return t * t * t; },
    inOut: function (t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    outBack: function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
    outElastic: function (t) { if (t === 0 || t === 1) return t; return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1; },
  };
  FX.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  FX.lerp = function (a, b, t) { return a + (b - a) * t; };
  FX.rand = function (a, b) { return a + Math.random() * (b - a); };
  FX.pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };

  // 依權重抽選：table = [{w:..}, ...] 或 {key: weight}
  FX.weighted = function (table) {
    if (Array.isArray(table)) {
      var tot = 0; table.forEach(function (x) { tot += x.w; });
      var r = Math.random() * tot;
      for (var i = 0; i < table.length; i++) { r -= table[i].w; if (r < 0) return table[i]; }
      return table[table.length - 1];
    }
    var keys = Object.keys(table), sum = 0;
    keys.forEach(function (k) { sum += table[k]; });
    var q = Math.random() * sum;
    for (var j = 0; j < keys.length; j++) { q -= table[keys[j]]; if (q < 0) return keys[j]; }
    return keys[keys.length - 1];
  };

  // ---------- 字型 ----------
  // 全遊戲文字用繁體中文字型（日文字型缺很多繁中字，會混到別的字型、看起來糊）；轉輪數字另外用 Dela Gothic One
  FX.FONT_DISPLAY = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif';
  FX.FONT_BODY = '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Heiti SC", sans-serif';

  // 華麗描邊文字：多層外框＋漸層填色＋光暈
  FX.text = function (ctx, str, x, y, o) {
    o = o || {};
    var size = o.size || 60;
    ctx.save();
    ctx.font = (o.weight || '900') + ' ' + size + 'px ' + (o.font || FX.FONT_DISPLAY);
    ctx.textAlign = o.align || 'center';
    ctx.textBaseline = 'middle';
    if (o.maxW) {
      // 太寬就縮：先壓扁到最多 85%，還不夠才整個等比縮小（粗體中文字壓得太扁，筆畫會黏在一起）
      var mw = ctx.measureText(str).width;
      if (mw > o.maxW) { var sc = o.maxW / mw, sx0 = Math.max(sc, 0.85), su = sc / sx0; ctx.translate(x, y); ctx.scale(sx0 * su, su); x = 0; y = 0; }
    }
    if (o.glow) { ctx.shadowColor = o.glow; ctx.shadowBlur = o.glowBlur || size * 0.4; }
    ctx.lineJoin = 'round';
    // 有白邊（mid）的字：由外到內＝深色外框 → 白邊 → 一圈細的深色線 → 字。
    // 2026-11 以前白邊直接貼著字，筆畫多的中文字（壘、獎、還、結…）筆畫之間的空隙整個被白邊填滿，金色的字糊在白底上，
    // 使用者：「大獎的有些中文字根本看不清楚」。現在字的每一筆外面先有一圈深色，筆畫之間是暗的，字才分得開
    if (o.outer !== false) {
      ctx.strokeStyle = o.outer || '#000';
      ctx.lineWidth = size * (o.outerW || (o.mid ? 0.34 : 0.28));
      ctx.strokeText(str, x, y);
    }
    ctx.shadowBlur = 0;
    if (o.mid) {
      ctx.strokeStyle = o.mid; ctx.lineWidth = size * 0.2; ctx.strokeText(str, x, y);
      ctx.strokeStyle = o.key || (o.outer !== false && o.outer) || '#1a0006'; ctx.lineWidth = size * 0.08; ctx.strokeText(str, x, y);
    }
    var fill = o.fill || '#fff';
    if (Array.isArray(fill)) {
      var g = ctx.createLinearGradient(0, y - size / 2, 0, y + size / 2);
      fill.forEach(function (c, i) { g.addColorStop(i / (fill.length - 1), c); });
      fill = g;
    }
    ctx.fillStyle = fill;
    ctx.fillText(str, x, y);
    if (o.shine) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = o.shine;
      ctx.fillStyle = '#fff';
      ctx.fillText(str, x, y);
    }
    ctx.restore();
  };

  // 預設漸層配色
  FX.GRAD = {
    gold: ['#fffbe0', '#ffe066', '#ffb300', '#c76a00'],
    red: ['#fff0f0', '#ff7a7a', '#ff1f3d', '#8a0018'],
    blue: ['#f0fbff', '#7ad7ff', '#1f8bff', '#0a2d8a'],
    green: ['#f0fff2', '#86ff9a', '#1fcf4d', '#0a6b25'],
    white: ['#ffffff', '#f2f2f2', '#c9c9c9', '#8a8a8a'],
    purple: ['#fbf0ff', '#d68aff', '#9b2bff', '#40107a'],
  };

  FX.rainbowGrad = function (ctx, x0, y0, x1, y1, shift) {
    var g = ctx.createLinearGradient(x0, y0, x1, y1);
    var cols = ['#ff3b3b', '#ff9d2e', '#ffe93b', '#3bff6e', '#3bc8ff', '#7a5bff', '#ff4bd8'];
    for (var i = 0; i < cols.length; i++) {
      var p = ((i / cols.length) + (shift || 0)) % 1;
      g.addColorStop(p, cols[i]);
    }
    return g;
  };

  // ---------- 粒子系統 ----------
  function Particles() { this.list = []; }
  Particles.prototype.emit = function (o) {
    var n = o.n || 20;
    for (var i = 0; i < n; i++) {
      var a = o.angle != null ? o.angle + FX.rand(-1, 1) * (o.spread || Math.PI) : Math.random() * Math.PI * 2;
      var sp = FX.rand(o.speedMin || 100, o.speedMax || 400);
      this.list.push({
        x: o.x + FX.rand(-1, 1) * (o.jitter || 0), y: o.y + FX.rand(-1, 1) * (o.jitterY != null ? o.jitterY : (o.jitter || 0)),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: FX.rand(o.lifeMin || 0.6, o.lifeMax || 1.4), t: 0,
        size: FX.rand(o.sizeMin || 3, o.sizeMax || 8), color: Array.isArray(o.color) ? FX.pick(o.color) : (o.color || '#ffd23f'),
        g: o.gravity != null ? o.gravity : 300, drag: o.drag != null ? o.drag : 0.98,
        type: o.type || 'spark', rot: Math.random() * 6.28, vr: FX.rand(-8, 8),
      });
    }
  };
  Particles.prototype.update = function (dt) {
    for (var i = this.list.length - 1; i >= 0; i--) {
      var p = this.list[i];
      p.t += dt;
      if (p.t >= p.life) { this.list.splice(i, 1); continue; }
      p.vy += p.g * dt; p.vx *= Math.pow(p.drag, dt * 60); p.vy *= Math.pow(p.drag, dt * 60);
      p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
    }
  };
  Particles.prototype.draw = function (ctx) {
    ctx.save();
    for (var i = 0; i < this.list.length; i++) {
      var p = this.list[i], k = 1 - p.t / p.life;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      if (p.type === 'confetti') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color; ctx.fillRect(-p.size, -p.size * 0.4, p.size * 2, p.size * 0.8 * Math.abs(Math.cos(p.rot * 1.7)) + 1);
        ctx.restore();
      } else if (p.type === 'star') {
        ctx.globalCompositeOperation = 'lighter';
        drawStar(ctx, p.x, p.y, p.size * (0.6 + k * 0.6), p.rot, p.color);
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalCompositeOperation = 'lighter';
        var r = p.size * (0.4 + k * 0.6);
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
        g.addColorStop(0, '#fff'); g.addColorStop(0.3, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r * 2, 0, 6.283); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    ctx.restore();
  };
  Particles.prototype.clear = function () { this.list = []; };
  FX.Particles = Particles;

  function drawStar(ctx, x, y, r, rot, color) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
    ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < 8; i++) {
      var rr = i % 2 === 0 ? r : r * 0.28, a = i * Math.PI / 4;
      ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  FX.drawStar = drawStar;

  // 放射光芒
  FX.rays = function (ctx, x, y, r, n, rot, color, alpha) {
    ctx.save();
    ctx.translate(x, y); ctx.rotate(rot);
    ctx.globalAlpha = alpha == null ? 0.5 : alpha;
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, color); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.arc(0, 0, r, a, a + Math.PI / n * 0.9);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  };

  // 集中線
  FX.speedLines = function (ctx, w, h, cx, cy, n, color, alpha, t) {
    ctx.save();
    ctx.globalAlpha = alpha == null ? 0.6 : alpha;
    ctx.fillStyle = color || '#fff';
    var R = Math.hypot(w, h);
    for (var i = 0; i < n; i++) {
      var a = (i / n) * Math.PI * 2 + Math.sin(i * 12.9898 + (t || 0) * 20) * 0.05;
      var r0 = R * (0.28 + 0.12 * Math.abs(Math.sin(i * 78.233 + (t || 0) * 13)));
      var wd = 0.006 + 0.01 * Math.abs(Math.sin(i * 4.1));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a - wd) * R, cy + Math.sin(a - wd) * R);
      ctx.lineTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a + wd) * R, cy + Math.sin(a + wd) * R);
      ctx.fill();
    }
    ctx.restore();
  };

  // ---------- 遊戲時間排程（可暫停、可調速） ----------
  var Clock = { now: 0, waits: [], speed: 1 };
  Clock.update = function (dt) {
    Clock.now += dt * 1000 * (PK.TIMING.speed || 1);
    for (var i = Clock.waits.length - 1; i >= 0; i--) {
      var w = Clock.waits[i];
      if (Clock.now >= w.at || (w.cond && w.cond())) { Clock.waits.splice(i, 1); w.res(w.cond && w.cond() ? true : false); }
    }
  };
  // 等待 ms（遊戲時間）；cond 為提前結束條件
  Clock.wait = function (ms, cond) {
    return new Promise(function (res) { Clock.waits.push({ at: Clock.now + ms, res: res, cond: cond }); });
  };
  Clock.until = function (cond) {
    return new Promise(function (res) { Clock.waits.push({ at: Infinity, res: res, cond: cond }); });
  };
  FX.Clock = Clock;

  PK.FX = FX;
})(window.PK);

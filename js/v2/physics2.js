/* =========================================================
 * v2 物理引擎（真實比例）——對外介面與 js/physics.js 相同（PK.Phys），舊版不受影響
 *
 * 跟舊版不一樣的地方：
 * - 真實重力與真實珠子大小（見 js/v2/config2.js），固定步進，不受畫面更新率影響
 * - 鋼珠有自轉：每次碰撞算「正向反彈＋切向摩擦」兩個衝量，珠子會滾、會帶旋，斜面上是滾下去不是滑下去
 * - 發射是真的打上去：珠子在發射軌道裡受重力減速，力道不夠會滾回來（界外球），出口有防回彈閥
 * - 道釘是一根一根真的釘子（舊版是一條看不見的斜線）
 * - 風車真的被珠子帶著轉，葉片相位會影響珠子往哪邊彈
 * - 沒有憑空的推力：只有發射槌每打一發的機台震動，會把停在釘子上的珠子震鬆
 * ========================================================= */
(function (PK) {
  'use strict';

  var P = {
    nails: [], decoNails: [], segs: [], sensors: [], balls: [], nailGrid: {}, segGrid: {}, cell: 40,
    windmill: { angle: 0, spin: 0 }, idSeq: 1, handlers: {}, acc: 0, stat: { shaken: 0 },
  };

  function key(cx, cy) { return cx * 1024 + cy; }
  function addToGrid(grid, obj, x0, y0, x1, y1) {
    var c = P.cell;
    for (var cx = Math.floor(x0 / c); cx <= Math.floor(x1 / c); cx++) {
      for (var cy = Math.floor(y0 / c); cy <= Math.floor(y1 / c); cy++) {
        var k = key(cx, cy);
        (grid[k] || (grid[k] = [])).push(obj);
      }
    }
  }
  function nail(x, y, kind) { P.nails.push({ x: x, y: y, r: PK.PHYS.nailR, kind: kind || 'n', glow: 0 }); }
  function seg(x1, y1, x2, y2, opt) {
    var PH = PK.PHYS;
    var s = Object.assign({ x1: x1, y1: y1, x2: x2, y2: y2, e: PH.eWall, mu: PH.muWall, on: true, kind: 'wall' }, opt || {});
    P.segs.push(s);
    return s;
  }
  function poly(pts, opt) { for (var i = 0; i < pts.length - 1; i++) seg(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], opt); }
  function sensor(o) { P.sensors.push(o); return o; }
  function pillH() { var F = PK.LAYOUT.field; return Math.max(0, (F.ry || F.r) - F.r); }

  // ---------------------------------------------------------
  // 建立盤面（零件位置沿用 PK.LAYOUT；釘子來自 js/v2/gauge2.js）
  // ---------------------------------------------------------
  P.build = function () {
    var L = PK.LAYOUT, PH = PK.PHYS;
    P.nails = []; P.decoNails = []; P.segs = []; P.sensors = []; P.nailGrid = {}; P.segGrid = {};
    var F = L.field, lcd = L.lcd;
    PK.Gauge2.build(L).forEach(function (n) { nail(n.x, n.y, n.kind); });

    // ---- 內軌（發射軌道的內側）＋出口的防回彈閥 ----
    var ir = L.innerRail, pts = [];
    for (var a = ir.from; a <= ir.to + 0.01; a += 2) pts.push(PK.ellPt(a, F.r - ir.r));
    poly(pts, { kind: 'rail', e: PH.eRail, mu: PH.muRail });
    P.innerEnd = pts[pts.length - 1];
    // 內軌末端的鍍鉻圓頭（底圖上看得到，所以要有碰撞）：用兩條交叉的短線當成一顆半徑約 4 的圓柱
    var kx = P.innerEnd[0], ky = P.innerEnd[1] - 6;
    seg(kx - 4, ky, kx + 4, ky, { kind: 'rail', e: PH.eRail, mu: PH.muRail }); seg(kx, ky - 4, kx, ky + 4, { kind: 'rail', e: PH.eRail, mu: PH.muRail });
    // 防回彈閥：從外軌斜到圓頭的頂端（落在閥門上的珠子會順著滾過圓頭、掉進盤面，不會卡在閥門和圓頭之間）
    var vo = PK.ellPt(ir.to, 0), ve = [kx, ky - 4];
    P.valve = seg(vo[0], vo[1], ve[0], ve[1], { kind: 'valve', e: 0.15, mu: 0.1, fieldOnly: true });   // 只擋已經打進盤面的珠子（不讓它掉回發射軌道）
    var vnx = -(ve[1] - vo[1]), vny = ve[0] - vo[0], vl = Math.hypot(vnx, vny), fq = PK.ellPt(ir.to + 4, 10);
    vnx /= vl; vny /= vl; if ((fq[0] - vo[0]) * vnx + (fq[1] - vo[1]) * vny < 0) { vnx = -vnx; vny = -vny; }
    P.valveLine = { x: vo[0], y: vo[1], nx: vnx, ny: vny };   // 閥門的線與「盤面那一側」的法線：球心越過這條線才算打進盤面

    // ---- 中央機關：拱頂、左右柱（左柱開透明管入口）、液晶下緣、底座與 V 字導槽 ----
    var x0 = lcd.x, x1 = lcd.x + lcd.w, y1 = lcd.y + lcd.h;
    var w = L.warp, S = L.stage, UG = PK.unitGeom(L);
    var tl = UG.topLine(), ucx = (x0 + x1) / 2;
    for (var ti = 0; ti < tl.length - 1; ti++) {
      var mxs = (tl[ti][0] + tl[ti + 1][0]) / 2, flat = Math.abs(tl[ti + 1][1] - tl[ti][1]) < 0.2 * Math.abs(tl[ti + 1][0] - tl[ti][0]);
      seg(tl[ti][0], tl[ti][1], tl[ti + 1][0], tl[ti + 1][1], flat ? { kind: 'frame', crown: mxs < ucx ? -1 : 1 } : { kind: 'frame' });   // 拱頂最上面那段近乎水平：當成略為拱起（珠子不會停在正上方）
    }
    var wallTop = L.roof ? tl[0][1] : UG.winTop, wallTopR = L.roof ? tl[tl.length - 1][1] : wallTop;   // 側牆從外框頂端輪廓的兩端開始
    seg(x0, wallTop, x0, w.y - w.r - 2, { kind: 'frame' });
    seg(x0, w.y + w.r + 2, x0, y1, { kind: 'frame' });
    seg(x1, wallTopR, x1, y1, { kind: 'frame' });
    var pl = UG.platLine(), half0 = pl.length / 2, scx = UG.pcx, cw = S.chute || Math.max(16, PH.ballR + 6), pb = UG.platBot;   // cw＝落球導槽的半寬
    var chuteOpt = { kind: 'frame', e: S.chuteE == null ? PH.eWall : S.chuteE, mu: 0.4 };   // 導槽內壁：吸掉珠子的橫向速度，讓它直直掉向啟動口
    seg(x0, y1 + UG.rim, pl[0][0], y1 + UG.rim, { kind: 'frame' });
    seg(pl[pl.length - 1][0], y1 + UG.rim, x1, y1 + UG.rim, { kind: 'frame' });
    poly(pl.slice(0, half0), { kind: 'frame' });
    poly(pl.slice(half0), { kind: 'frame' });
    seg(pl[half0 - 1][0], pb, scx - cw, pb, { kind: 'frame' });
    seg(scx + cw, pb, pl[half0][0], pb, { kind: 'frame' });
    seg(scx - cw, y1 + 10 + S.depth + 1, scx - cw, pb + (S.chuteLen || 0), chuteOpt);
    seg(scx + cw, y1 + 10 + S.depth + 1, scx + cw, pb + (S.chuteLen || 0), chuteOpt);

    // ---- 舞台（液晶下面的 U 字形托盤，正中央有落球口） ----
    // 落球口只比珠子大一點（S.hole），兩側邊緣是精確的點：珠子在舞台上來回滾、慢下來之後才從正中央掉下去
    var sy = y1 + 10, half = S.w / 2, cx = S.x + half, left = [], right = [], hh2 = S.hole / 2;
    var stY = function (px) { var u = (px - cx) / half; return sy + S.depth * (1 - u * u); };
    for (var k = 0; k <= 24; k++) { var px = cx - half + k * half / 24; if (px < cx - hh2 - 0.5) left.push([px, stY(px)]); }
    left.push([cx - hh2, stY(cx - hh2)]);
    left.unshift([S.x - 4, sy - 9]);
    right.push([cx + hh2, stY(cx + hh2)]);
    for (var k2 = 0; k2 <= 24; k2++) { var qx = cx + k2 * half / 24; if (qx > cx + hh2 + 0.5) right.push([qx, stY(qx)]); }
    right.push([S.x + S.w + 4, sy - 9]);
    poly(left, { kind: 'stage', e: PH.eStage, mu: PH.muStage });
    poly(right, { kind: 'stage', e: PH.eStage, mu: PH.muStage });
    sensor({ type: 'stageHole', x: cx, y: sy + S.depth + 12, r: S.hole / 2 + 2, pass: true });
    sensor({ type: 'stageOut', x: cx, y: UG.platBot + (S.chuteLen || 0) + PH.ballR + 2, r: PH.ballR + 4, pass: true });   // 導槽出口：珠子離開導槽的瞬間（這裡決定它掉得多正）
    P.stageY = sy; P.stageX0 = S.x; P.stageX1 = S.x + S.w;
    P.stageExit = { x: S.x + 16, y: sy + S.depth * (1 - Math.pow(1 - 16 / half, 2)) - PH.ballR - 1 };   // 透明管出口：舞台左端的表面上
    P.warpPath = PK.warpPath(L, P.stageExit);
    // 透明管可以有很多條（P.warpList）：第 0 條是液晶左邊框的入口 → 舞台左端；
    // L.sky＝液晶圓弧頂正上方的入口 → 沿著圓弧頂內側、液晶右緣（走在螢幕前面）→ 舞台右端
    P.warpList = [{ path: P.warpPath, dir: 1, at: L.warp }];
    if (L.sky) {
      var ex2 = { x: S.x + S.w - 16, y: P.stageExit.y };
      P.warpList.push({ path: PK.warpPath({ warp: L.sky, warpTube: L.sky.tube || [] }, ex2), dir: -1, at: L.sky, sky: true });
    }

    // ---- 透明管入口、風車 ----
    sensor({ type: 'warp', x: w.x, y: w.y, r: w.r, wi: 0 });
    if (L.sky) sensor({ type: 'warp', x: L.sky.x, y: L.sky.y, r: L.sky.r, wi: 1 });
    P.windmillPos = { x: L.windmill.x, y: L.windmill.y, r: L.windmill.r };

    // ---- 啟動口（本壘）：命釘、跳釘、洞口 ----
    var H = L.heso, gp = H.gap / 2;
    nail(H.x - gp, H.y - 16, 'life'); nail(H.x + gp, H.y - 16, 'life');
    var J = L.jump || { dx: 26, dy: 32 };
    nail(H.x - gp - J.dx, H.y - J.dy, 'life'); nail(H.x + gp + J.dx, H.y - J.dy, 'life');   // 跳釘
    var hw = H.w / 2 + 2;
    P.hesoWide = sensor({ type: 'attacker', rect: { x: H.x - (H.wide || 40), y: H.y - (H.wideTop || 30), w: (H.wide || 40) * 2, h: (H.wideTop || 30) + 14 }, on: false });   // 大獎中啟動口張開翼片：這個範圍的珠子都收進去
    seg(H.x - hw, H.y - 3, H.x - hw, H.y + 16, { kind: 'cup' });
    seg(H.x + hw, H.y - 3, H.x + hw, H.y + 16, { kind: 'cup' });
    sensor({ type: 'heso', x: H.x, y: H.y + 4, rect: { x: H.x - hw + 1, y: H.y, w: hw * 2 - 2, h: 14 } });

    // ---- 一般洞口（壘包）：洞口下面的壘包是實心的 ----
    L.pockets.forEach(function (pk, idx) {
      var pw = pk.w / 2 + 2;
      seg(pk.x - pw, pk.y - 3, pk.x - pw, pk.y + 14, { kind: 'cup' });
      seg(pk.x + pw, pk.y - 3, pk.x + pw, pk.y + 14, { kind: 'cup' });
      poly([[pk.x - pw, pk.y - 3], [pk.x - pw - 6, pk.y + 9], [pk.x - pw - 5, pk.y + 30], [pk.x + pw + 5, pk.y + 30], [pk.x + pw + 6, pk.y + 9], [pk.x + pw, pk.y - 3]], { kind: 'cup' });
      nail(pk.x - pw - 5, pk.y - 14); nail(pk.x + pw + 5, pk.y - 14);
      sensor({ type: 'pocket', idx: idx, x: pk.x, y: pk.y + 3, rect: { x: pk.x - pw + 1, y: pk.y, w: pw * 2 - 2, h: 12 } });
    });

    // ---- 舊介面相容：沒有右打，右邊的斜軌／小翼片／大獎蓋板都不存在，只留座標給畫面用 ----
    var RP = L.ramp, D = L.denchu, AT = L.attacker;
    function rp(t) { return [RP.x1 + (RP.x2 - RP.x1) * t, RP.y1 + (RP.y2 - RP.y1) * t]; }
    P.denchuLid = { on: true }; P.attackerLid = { on: true }; P.rampStop = null;
    P.denchuSensor = { on: false }; P.attackerSensor = { on: false };
    P.rampNormal = [0, 1]; P.attackerUp = [0, -1]; P.attackerU = [1, 0];
    P.rampPts = { a0: rp(0), d0: rp(D.t0), d1: rp(D.t1), t0: rp(AT.t0), t1: rp(AT.t1), e1: rp(1) };
    P.rampDraw = [];

    // ---- 空間格 ----
    var mN = PH.ballR + 4, mS = PH.ballR + 3;
    P.nails.forEach(function (n) { addToGrid(P.nailGrid, n, n.x - mN, n.y - mN, n.x + mN, n.y + mN); });
    P.segs.forEach(function (s) { addToGrid(P.segGrid, s, Math.min(s.x1, s.x2) - mS, Math.min(s.y1, s.y2) - mS, Math.max(s.x1, s.x2) + mS, Math.max(s.y1, s.y2) + mS); });
    if (P.onBuild) P.onBuild();
  };

  P.on = function (type, fn) { P.handlers[type] = fn; };
  function emit(type, a, b) { if (P.handlers[type]) P.handlers[type](a, b); }

  P.setDenchu = function (open) { P.denchuOpen = open; };
  P.setAttacker = function (open) { P.attackerOpen = !!open; if (P.hesoWide) P.hesoWide.on = !!open; };

  // ---------------------------------------------------------
  // 發射：發射槌把珠子從軌道最下面打上去（之後全部交給物理）
  // ---------------------------------------------------------
  function curve(c, p) {
    var v = c[0][1];
    for (var i = 0; i < c.length - 1; i++) {
      if (p >= c[i][0] && p <= c[i + 1][0]) return c[i][1] + (c[i + 1][1] - c[i][1]) * (p - c[i][0]) / (c[i + 1][0] - c[i][0]);
      if (p > c[i + 1][0]) v = c[i + 1][1];
    }
    return v;
  }
  P.launchSpeed = function (power) { return curve(PK.PHYS.launchV, Math.max(0, Math.min(1, power))); };
  P.launch = function (power) {
    var PH = PK.PHYS, L = PK.LAYOUT, ir = L.innerRail, F = L.field;
    if (P.balls.length >= PH.maxBalls) return false;
    var p = Math.max(0, Math.min(1, power + (Math.random() * 2 - 1) * PH.powerJitter));
    var v0 = P.launchSpeed(p) * (1 + (Math.random() * 2 - 1) * (PH.launchVJitter || 0));
    var a0 = ir.from + 2.5, lane = (F.r - ir.r) / 2;
    var q = PK.ellPt(a0, lane), q2 = PK.ellPt(a0 + 0.6, lane), tx = q2[0] - q[0], ty = q2[1] - q[1], tl = Math.hypot(tx, ty);
    // 發射槌的震動：停在釘子上的珠子會被震鬆（真台也是這樣）
    if (PH.shake) P.balls.forEach(function (o) {
      if (o.state === 'field' && (o.rest || 0) > 0.25) { o.vx += (Math.random() * 2 - 1) * PH.shake; o.vy -= Math.random() * PH.shake; o.rest = 0; P.stat.shaken++; }   // 只震已經停住的珠子（彈到最高點那一瞬間速度也很慢，那種不算）
    });
    P.balls.push({ id: P.idSeq++, x: q[0], y: q[1], vx: tx / tl * v0, vy: ty / tl * v0, w: 0, t: 0, state: 'rail', gated: false, trail: [], vh: v0 });
    return true;
  };

  // ---------------------------------------------------------
  // 碰撞
  // ---------------------------------------------------------
  // 一次接觸：n＝從表面指向珠子的單位法線；sv＝表面本身的速度（風車用）。回傳撞擊速度（沒撞到回 0）
  function contact(b, nx, ny, e, mu, PH, svx, svy) {
    var rvx = b.vx - (svx || 0), rvy = b.vy - (svy || 0);
    var vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    var tx = -ny, ty = nx, vt = rvx * tx + rvy * ty - b.w * PH.ballR;   // 接觸點的切向相對速度（含自轉）
    var jn = -(1 + (-vn < PH.restV ? 0 : e)) * vn;
    var jt = -vt / 3.5, lim = mu * jn;                                   // 實心球：切向衝量 3.5 倍才抵銷相對滑動
    if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
    b.vx += jn * nx + jt * tx; b.vy += jn * ny + jt * ty;
    b.w -= 2.5 * jt / PH.ballR;
    return -vn;
  }

  function collideNail(b, n, PH) {
    var dx = b.x - n.x, dy = b.y - n.y, rr = PH.ballR + n.r, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr || d2 === 0) return;
    var d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    b.x = n.x + nx * rr; b.y = n.y + ny * rr;
    var vn = b.vx * nx + b.vy * ny;
    if (vn >= 0) return;
    if (-vn > PH.restV * 4 && PH.nailJitter) {   // 真的撞上去時才有釘子的個體差異；貼著滾的時候沒有
      var j = (Math.random() * 2 - 1) * PH.nailJitter, c = Math.cos(j), s = Math.sin(j), ox = nx;
      nx = ox * c - ny * s; ny = ox * s + ny * c;
    }
    // 鋼珠撞黃銅釘：輕輕碰的時候彈性好，撞得越重釘子吸收越多（釘子會彎、會震）
    var k = -vn / PH.eNailV, e = PH.eNailLow + (PH.eNail - PH.eNailLow) * (k > 1 ? 1 : k);
    var hit = contact(b, nx, ny, e, PH.muNail, PH);
    if (hit > PH.tinkV) { n.glow = 1; emit('tink', b, n); }
  }

  function collideSeg(b, s, PH, h) {
    if (!s.on) return;
    if (s.fieldOnly && b.state !== 'field') return;
    var ex = s.x2 - s.x1, ey = s.y2 - s.y1, l2 = ex * ex + ey * ey;
    var t = l2 ? ((b.x - s.x1) * ex + (b.y - s.y1) * ey) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    var cx = s.x1 + ex * t, cy = s.y1 + ey * t;
    var dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy, r = PH.ballR;
    if (d2 >= r * r) return;
    var d = Math.sqrt(d2) || 0.0001, nx = dx / d, ny = dy / d;
    if (d2 === 0) { var l = Math.sqrt(l2); nx = -ey / l; ny = ex / l; }
    b.x = cx + nx * r; b.y = cy + ny * r;
    contact(b, nx, ny, s.e, s.mu, PH);
    if (s.kind === 'stage' && PH.stageDamp) { var dmp = 1 - PH.stageDamp * h; b.vx *= dmp; b.vy *= dmp; b.w *= dmp; }   // 舞台的滾動阻力：珠子來回滾幾趟就慢下來，從落球口正中央掉下去
    if (s.crown) b.vx += s.crown * PH.gravity * 0.06 * h;   // 拱頂最上面：略為拱起，往外側滾
  }

  function collideRail(b, PH, L) {
    var F = L.field, R = F.r - PH.ballR, hh = pillH();
    var qy = Math.max(F.cy - hh, Math.min(F.cy + hh, b.y)), dx = b.x - F.cx, dy = b.y - qy, d = Math.sqrt(dx * dx + dy * dy);
    // 外框一整圈都擋，只有正下方的出口洞開口；珠子穿過開口後就一路掉出去
    if (b.drop || (b.y > F.cy + hh && Math.abs(b.x - F.cx) < L.out.hw)) { if (d > R) b.drop = true; return; }
    if (d <= R) return;
    var ux = dx / d, uy = dy / d;
    b.x = F.cx + ux * R; b.y = qy + uy * R;
    contact(b, -ux, -uy, PH.eRail, PH.muRail, PH);
  }

  function collideWindmill(b, PH) {
    var W = P.windmillPos, wm = P.windmill, dx = b.x - W.x, dy = b.y - W.y, rr = W.r + PH.ballR, d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) return;
    var d = Math.sqrt(d2) || 0.001, nx = dx / d, ny = dy / d;
    b.x = W.x + nx * rr; b.y = W.y + ny * rr;
    // 四片葉片：打到葉片的哪個位置，彈開的方向不一樣（跟風車當下轉到哪裡有關）
    var off = 0.32 * Math.sin(4 * (Math.atan2(ny, nx) - wm.angle)), c = Math.cos(off), s = Math.sin(off);
    var mx = nx * c - ny * s, my = nx * s + ny * c;
    var sv = wm.spin * W.r, tx = -ny, ty = nx, before = b.vx * tx + b.vy * ty;
    if (contact(b, mx, my, 0.35, 0.7, PH, tx * sv, ty * sv)) {
      var after = b.vx * tx + b.vy * ty;
      wm.spin -= (after - before) * PH.windK / W.r;   // 反作用力：珠子把風車帶著轉
      if (wm.spin > 70) wm.spin = 70; else if (wm.spin < -70) wm.spin = -70;
    }
  }

  function collideBalls(PH) {
    var n = P.balls.length, r = PH.ballR, r2 = r * 2;
    for (var a = 0; a < n; a++) {
      var A = P.balls[a]; if (A.state === 'warp') continue;
      for (var bb = a + 1; bb < n; bb++) {
        var B = P.balls[bb]; if (B.state === 'warp') continue;
        var dx = B.x - A.x, dy = B.y - A.y;
        if (dx > r2 || dx < -r2 || dy > r2 || dy < -r2) continue;
        var d2 = dx * dx + dy * dy;
        if (d2 >= r2 * r2 || d2 === 0) continue;
        var d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (r2 - d) / 2;
        A.x -= nx * ov; A.y -= ny * ov; B.x += nx * ov; B.y += ny * ov;
        var rv = (B.vx - A.vx) * nx + (B.vy - A.vy) * ny;
        if (rv >= 0) continue;
        var jn = -(1 + (-rv < PH.restV ? 0 : PH.eBall)) * rv / 2;
        var tx = -ny, ty = nx, vt = (B.vx - A.vx) * tx + (B.vy - A.vy) * ty - (A.w + B.w) * r;
        var jt = -vt / 7, lim = PH.muBall * jn;
        if (jt > lim) jt = lim; else if (jt < -lim) jt = -lim;
        A.vx -= jn * nx + jt * tx; A.vy -= jn * ny + jt * ty; B.vx += jn * nx + jt * tx; B.vy += jn * ny + jt * ty;
        A.w -= 2.5 * jt / r; B.w -= 2.5 * jt / r;
      }
    }
  }

  // ---------------------------------------------------------
  // 感應區
  // ---------------------------------------------------------
  function inSensor(b, s) {
    if (s.rect) { var r = s.rect; return b.x >= r.x && b.x <= r.x + r.w && b.y >= r.y && b.y <= r.y + r.h; }
    var dx = b.x - s.x, dy = b.y - s.y; return dx * dx + dy * dy <= s.r * s.r;
  }
  // 回傳 true 表示珠子被收走
  function checkSensors(b, PH) {
    for (var si = 0; si < P.sensors.length; si++) {
      var sn = P.sensors[si];
      if (sn.on === false || !inSensor(b, sn)) continue;
      if (sn.pass) {
        if (sn.type === 'stageHole' && !b.holed) { b.holed = true; emit('stageHole', b, sn); }
        // 離開導槽：大部分直直掉向啟動口（只有一點點左右偏差）；偶爾會碰到導槽口偏出去（真台的舞台也不是百發百中）
        if (sn.type === 'stageOut' && b.holed && !b.dropped) {
          b.dropped = true;
          if (PH.stageMiss && Math.random() < PH.stageMiss) b.vx += (Math.random() < 0.5 ? -1 : 1) * (PH.stageMissKick || 220) * (0.7 + Math.random() * 0.6);
          else b.vx += (Math.random() * 2 - 1) * (PH.stageKick || 0);
        }
        continue;
      }
      if (sn.type === 'warp') { b.state = 'warp'; b.wi = sn.wi || 0; b.ws = 0; b.wv = Math.max(PH.warpVmin, Math.min(600, Math.hypot(b.vx, b.vy) * 0.5)); emit('warp', b, sn); return false; }
      P.balls.splice(P.balls.indexOf(b), 1);
      emit(sn.type, b, sn);
      return true;
    }
    return false;
  }

  // 透明管：沿著管子滾下去（坡度決定加速，管壁有阻力）
  function warpStep(b, h, PH) {
    var WL = P.warpList[b.wi || 0] || P.warpList[0], WP = WL.path, q = PK.pathAt(WP, b.ws);
    b.wv += ((5 / 7) * PH.gravity * Math.sin(q[2]) - PH.warpDrag * b.wv) * h;
    if (b.wv < PH.warpVmin) b.wv = PH.warpVmin;
    b.ws += b.wv * h;
    if (b.ws >= WP.len) {
      var we = WP.pts[WP.pts.length - 1];
      b.state = 'field'; b.x = we[0]; b.y = we[1];
      b.vx = WL.dir * (Math.min(b.wv, 420) + Math.random() * 160); b.vy = 0; b.w = b.vx / PH.ballR;   // 滾出管口，滾上舞台（右邊那條往左滾）
      return;
    }
    q = PK.pathAt(WP, b.ws); b.x = q[0]; b.y = q[1];
  }

  // ---------------------------------------------------------
  // 每一小步
  // ---------------------------------------------------------
  function sub(h, PH, L) {
    var g = PH.gravity, c = P.cell, ir = L.innerRail, dr = 1 - PH.drag * h, sd = 1 - PH.spinDrag * h;
    var wm = P.windmill; wm.angle += wm.spin * h; wm.spin *= 1 - 0.9 * h;
    for (var bi = P.balls.length - 1; bi >= 0; bi--) {
      var b = P.balls[bi];
      b.t += h;
      if (b.state === 'warp') { warpStep(b, h, PH); continue; }
      b.vy += g * h; b.vx *= dr; b.vy *= dr; b.w *= sd;
      b.x += b.vx * h; b.y += b.vy * h;
      var gx = Math.floor(b.x / c), gy = Math.floor(b.y / c), k = key(gx, gy);
      var cellN = P.nailGrid[k];
      if (cellN) for (var i = 0; i < cellN.length; i++) collideNail(b, cellN[i], PH);
      var cellS = P.segGrid[k];
      if (cellS) for (var j = 0; j < cellS.length; j++) collideSeg(b, cellS[j], PH, h);
      collideRail(b, PH, L);
      collideWindmill(b, PH);
      if (b.state === 'rail') {
        // 還在發射軌道裡：過了出口的防回彈閥才算進盤面；滾回軌道最下面＝界外球（退回上方珠盤）
        var ang = PK.shapeAng(b.x, b.y), VL = P.valveLine;
        if (ang > ir.to - 8 && (b.x - VL.x) * VL.nx + (b.y - VL.y) * VL.ny > 1) b.state = 'field';   // 球心一過閥門的線就算進盤面（閥門在它後面關上，不會再掉回軌道）
        // 界外球：沒打出去、往回滾的珠子，滾到軌道下段就從界外球出口收走（真台的界外球出口也在發射點上方，回滾的珠子不會撞到下一顆要發射的）
        else if (ang < ir.from + 0.6 || (ang < ir.from + 60 && b.pa != null && ang < b.pa - 0.001)) { P.balls.splice(bi, 1); emit('foul', b); continue; }   // 出口設在軌道中段：回滾的珠子在下一顆打上來之前就收走，不會一顆撞一顆連環界外
        else { b.pa = ang; continue; }
      }
      if (checkSensors(b, PH)) continue;
      // 機台的微震（馬達、喇叭、發射槌）：珠子不會永遠停在兩根釘子之間不到 0.1px 深的凹槽裡
      if (b.vx * b.vx + b.vy * b.vy < 30 * 30) {
        b.rest = (b.rest || 0) + h;
        if (b.rest > 0.6 && !(b.y > P.stageY - 14 && b.y < P.stageY + 40 && b.x > P.stageX0 && b.x < P.stageX1)) { b.rest = 0; b.vx += (Math.random() * 2 - 1) * PH.shake; b.vy -= Math.random() * PH.shake * 0.6; P.stat.shaken++; }
      } else b.rest = 0;
      if (b.y > L.out.y || b.x < -30 || b.x > L.board.w + 30 || b.y < -200) { P.balls.splice(bi, 1); emit('out', b); }
    }
    collideBalls(PH);
  }

  P.step = function (dt) {
    var PH = PK.PHYS, L = PK.LAYOUT, h = 1 / PH.hz;
    P.acc += Math.min(dt, 0.05) * (PH.speed || 1);
    var n = Math.floor(P.acc / h);
    P.acc -= n * h;
    for (var i = 0; i < n; i++) sub(h, PH, L);
    for (var k = 0; k < P.nails.length; k++) { var nl = P.nails[k]; if (nl.glow > 0) nl.glow = Math.max(0, nl.glow - dt * 3); }
    for (var bi = 0; bi < P.balls.length; bi++) { var b = P.balls[bi]; b.trail.push(b.x, b.y); if (b.trail.length > 8) b.trail.splice(0, 2); }
  };

  P.clearBalls = function () { P.balls = []; };

  PK.Phys = P;
})(window.PK);

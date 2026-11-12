/* =========================================================
 * v2 釘子配置（真實比例：珠子直徑 20、釘身直徑 4.8）
 *
 * 照日本機台的釘群結構排：
 *   天釘 → 上方弧形釘 → 左側散釘 → 透明管入口的撥珠釘 → 風車上方的八字釘 → 風車
 *   → 道釘（一根一根的真釘子，珠子在上面一路彈跳滾向啟動口）→ 跳釘・命釘 → 啟動口（本壘）
 *   右側：弧形釘 → 散釘 → 右道釘 → 啟動口
 *
 * 釘距只有兩種（真台也是這樣）：
 *   PASS  ＝ 珠子過得去（釘心距 ≥ 29；散釘用 34）——珠子會在釘子之間彈來彈去
 *   GUIDE ＝ 珠子過不去（釘心距 15）——排成斜線讓珠子沿著滾；斜度一律 18° 以上，珠子不會停在上面
 * 不同釘群之間，釘心距小於 29 的一律不放（不留「剛好卡住一顆珠子」的縫）
 * ========================================================= */
(function (PK) {
  'use strict';
  var G = {};

  function distSeg(x, y, x1, y1, x2, y2) {
    var ex = x2 - x1, ey = y2 - y1, l2 = ex * ex + ey * ey, t = l2 ? ((x - x1) * ex + (y - y1) * ey) / l2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - (x1 + ex * t), y - (y1 + ey * t));
  }

  G.build = function (L) {
    var PH = PK.PHYS, D = PH.ballR * 2, NR = PH.nailR;
    var CL = D + NR * 2 + 4;          // 兩根釘之間要讓珠子過，釘心距至少這麼多（28.8）
    var PASS = 34, ROW = 30, GUIDE = 15;
    var out = [], seq = 0;
    var lcd = L.lcd, F = L.field, H = L.heso, W = L.windmill, R1 = L.roadNails, R2 = L.roadNails2, ir = L.innerRail, wp = L.warp;
    var lcdR = lcd.x + lcd.w, lcdB = lcd.y + lcd.h;

    function put(x, y, kind, grp, pri) { out.push({ x: x, y: y, kind: kind, grp: grp || null, pri: pri == null ? 2 : pri }); }
    // 一排釘（step＝釘心距）；skip＝要跳過的編號（留缺口）
    function line(x1, y1, x2, y2, step, kind, skip, pri) {
      var len = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.round(len / step)), gid = 'L' + (++seq);
      for (var i = 0; i <= n; i++) { if (skip && skip.indexOf(i) >= 0) continue; put(x1 + (x2 - x1) * i / n, y1 + (y2 - y1) * i / n, kind, gid, pri == null ? 0 : pri); }
      return gid;
    }
    // 交錯三角格
    function grid(x0, x1, y0, y1, kind, ok, pitch, row) {
      pitch = pitch || PASS; row = row || ROW;
      for (var r = 0, y = y0; y <= y1; y += row, r++) for (var x = x0 + (r % 2) * pitch / 2; x <= x1; x += pitch) if (!ok || ok(x, y)) put(x, y, kind);
    }
    var roadY = function (R, x) { var xx = Math.max(Math.min(R.x1, R.x2), Math.min(Math.max(R.x1, R.x2), x)); return R.y1 + (xx - R.x1) * (R.y2 - R.y1) / (R.x2 - R.x1); };
    var nearRoad = function (R, x, y, d) { return distSeg(x, y, R.x1, R.y1, R.x2, R.y2) < d; };
    // 道釘上方要留珠子滾的空間（一顆半珠子高），下方留一顆珠子
    var roadBand = function (R, x, y) {
      var xa = Math.min(R.x1, R.x2), xb = Math.max(R.x1, R.x2);
      if (x < xa - 16 || x > xb + 16) return false;
      var ly = roadY(R, x); return y > ly - (D * 1.6 + NR) && y < ly + CL;
    };
    // 一般洞口周圍留的空位：左右要留到「洞口側壁到釘子之間過得了一顆珠子」（半寬＋34）——留太少珠子會卡在側壁和釘子中間（2026-11-11 縮成＋24 時卡過）；上下留到洞口命釘上方、壘包下方各一顆珠子
    var nearPocket = function (x, y) { return L.pockets.some(function (p) { return Math.abs(x - p.x) < p.w / 2 + 34 && y > p.y - 46 && y < p.y + 60; }); };

    // =====================================================================================
    // 2026-11 重排（同事：「釘子太少，力道固定幾乎都是同樣軌跡」；使用者：「釘子要更豐富，讓玩家選擇進攻點」）
    // 力道＝珠子落在盤面上方的哪裡，四個進攻點各有各的路：
    //   輕打 → 左外側：沿著內軌往下，容易從風車左邊漏到左下的釘群（一般洞口、出界）
    //   左肩 → 落在圓弧頂的左肩，沿著液晶左牆滑下去 → 左邊的透明管入口 → 舞台 → 啟動口（最穩的一條）
    //   正上方 → 瞄準圓弧頂最高點的「上方入口」：進了就走螢幕前面的透明管直達舞台；沒進就從兩肩滾下去
    //   重打 → 右邊：被右上的擋釘打下來，穿過液晶右邊整片釘群 → 右道釘 → 啟動口／右邊的一般洞口
    // =====================================================================================
    var g2 = L.g2, T0 = { x: F.cx, y: F.cy - ((F.ry || F.r) - F.r) }, SK = L.sky;   // T0＝上半圓的圓心
    var arcPt = function (deg, inset) { var a = deg * Math.PI / 180, r = F.r - inset; return [T0.x + r * Math.cos(a), T0.y + r * Math.sin(a)]; };

    // ---- 上方釘群：外軌內側一圈一圈交錯的弧形釘（珠子離開外軌第一個撞到的地方，在這裡就散開） ----
    // 每一圈的釘距沿弧長約 PASS；相鄰兩圈錯開半格。正上方入口的正上方留一條直落的空檔
    var TA = g2.top || { insets: [42, 73, 104, 135, 166], from: 218, to: 338 };
    TA.insets.forEach(function (inset, ring) {
      var r = F.r - inset, stepDeg = (TA.pitch || PASS) / r * 180 / Math.PI, a0 = 270 - Math.floor((270 - TA.from) / stepDeg) * stepDeg + (ring % 2 ? stepDeg / 2 : 0);
      for (var a = a0; a <= TA.to; a += stepDeg) {
        var q = arcPt(a, inset);
        if (SK && Math.abs(q[0] - SK.x) < (SK.lane || 31) && q[1] > SK.y - (SK.laneH || 96)) continue;   // 上方入口正上方的直落通道
        put(q[0], q[1], ring === 0 ? 'ten' : 'top');
      }
    });
    // 上方入口的命釘：左右各一根，珠子剛好過得去（跟啟動口一樣的做法）；再往外各一根跳釘
    if (SK) {
      var sg = (SK.gap || 30) / 2;
      // 命釘跟洞口差不多高：沿著圓弧頂滾過來的珠子會被它擋住滾回去，只有從正上方掉進兩根命釘中間的才進得去
      put(SK.x - sg, SK.y - 7, 'sky', 'sky', 0); put(SK.x + sg, SK.y - 7, 'sky', 'sky', 0);
      put(SK.x - sg - 33, SK.y - 34, 'sky', 'sky', 0); put(SK.x + sg + 33, SK.y - 34, 'sky', 'sky', 0);
    }
    // 右上擋釘：貼著外軌的一小排。重打的珠子原本會一路貼著外軌滑到右下角（整片右邊的釘群都沒碰到），現在在這裡被打下來
    (g2.stop || [[322, 15], [322, 30]]).forEach(function (sp) { var q = arcPt(sp[0], sp[1]); put(q[0], q[1], 'stop', 'stop', 0); });

    // ---- 液晶左邊的走道：一排一根、一排兩根交錯往下（珠子一路在釘子和牆之間彈，每顆走的路都不一樣） ----
    // xa／xb＝這一排釘心可以放的左右界（已經離牆一顆珠子）；一排靠左起、下一排錯開半格
    var zig = function (xa, xb, y0, y1, kind, skip, pitch, rowH) {
      pitch = pitch || PASS; rowH = rowH || ROW;
      for (var r = 0, y = y0; y <= y1; y += rowH, r++) {
        var xl = typeof xa === 'function' ? xa(y) : xa, xr = typeof xb === 'function' ? xb(y) : xb;
        if (xr < xl) continue;
        var n = Math.floor((xr - xl) / pitch), pad = (xr - xl - n * pitch) / 2;   // 這一排放得下 n+1 根：置中
        if (r % 2 && n > 0) { for (var k2 = 0; k2 < n; k2++) { var xo = xl + pad + pitch / 2 + k2 * pitch; if (!skip || !skip(xo, y)) put(xo, y, kind); } }
        else for (var k = 0; k <= n; k++) { var xe = xl + pad + k * pitch; if (!skip || !skip(xe, y)) put(xe, y, kind); }
      }
    };
    var EDGE0 = D + NR + 3.4;
    var leftIn = function (y) { var dy = Math.max(0, T0.y - y), r = ir.r - EDGE0; return T0.x - (y < T0.y ? Math.sqrt(Math.max(0, r * r - dy * dy)) : r); };          // 離內軌一顆珠子
    var rightOut = function (y) { var dy = Math.max(0, T0.y - y), r = F.r - EDGE0 - 8; return T0.x + (y < T0.y ? Math.sqrt(Math.max(0, r * r - dy * dy)) : r); };   // 離外軌一顆珠子（貼著外軌滾的珠子不會撞到）
    // 撥珠釘：貼著液晶側牆的一小排斜釘（珠子過不去），把貼著牆一路滑下來的珠子撥回走道中間
    // （沒有它的話，從圓弧頂兩肩滾下來的珠子全部貼著牆直直滑到底，每一顆都一樣）
    var KL = g2.kickLen || 26;   // 撥珠釘伸出牆面多遠（太長會把整條走道的珠子都趕到同一邊，變成每顆都走同一條）
    // 釘距 12、斜度 50°：相鄰兩根釘之間的凹槽比斜度淺，珠子不會停在上面（釘距 15、斜度 30° 的時候珠子會停在凹槽裡，後面的再疊上去就卡住）
    var KS = 1.2, KSTEP = 12;
    var kicker = function (side, y) { var x0 = side < 0 ? lcd.x - 7 : lcdR + 7; line(x0, y, x0 + side * KL, y + KL * KS, KSTEP, 'kick'); };
    (g2.kickL || []).forEach(function (y) { kicker(-1, y); });
    (g2.kickR || []).forEach(function (y) { kicker(1, y); });
    // 內軌那一側也要有（kickI）：不然輕打的珠子會貼著內軌一路滑到最下面出界，每一顆都走同一條
    var B0y = F.cy + ((F.ry || F.r) - F.r);   // 下半圓的圓心高度
    var railX = function (y) { var dy = y < T0.y ? T0.y - y : y > B0y ? y - B0y : 0; return T0.x - Math.sqrt(Math.max(0, ir.r * ir.r - dy * dy)); };   // 內軌在高度 y 的位置
    (g2.kickI || []).forEach(function (k) { var y = k[0] || k, len = k[1] || KL, x0 = railX(y) + 7; line(x0, y, x0 + len, y + len * KS, KSTEP, 'kick'); });
    // 閘門排：兩面牆之間一排一排的釘子，一排靠左牆排起、下一排靠右牆排起（靠牆那個縫只比珠子大一點，另一邊的縫比較寬）。
    // 每一排珠子都有兩三個縫可以選，走哪個縫看它前一下怎麼彈；貼著牆直直掉下來的珠子，隔一排就會撞到靠牆的那根——
    // 同樣力道打出去的珠子在這裡分成好幾條，不會整串貼著牆滑到底
    var gates = function (xL, xR, y0, y1, kind, skip, rowH) {
      var FIRST = D + 4.6 + NR;   // 靠牆第一根釘心離牆的距離（縫寬 24.6）
      for (var r = 0, y = y0; y <= y1; y += rowH || ROW, r++) {
        var a = xL(y), b = xR(y);
        if (b - a < FIRST * 2) continue;
        if (r % 2) { for (var x = b - FIRST; x >= a + FIRST - 0.01; x -= PASS) if (!skip || !skip(x, y)) put(x, y, kind); }
        else for (var x2 = a + FIRST; x2 <= b - FIRST + 0.01; x2 += PASS) if (!skip || !skip(x2, y)) put(x2, y, kind);
      }
    };
    var GD = g2.guard;
    gates(railX, function () { return lcd.x; }, lcd.y + (g2.gateY0 || 62), W.y - 124, 'bara', function (x, y) { return Math.hypot(x - wp.x, y - wp.y) < 44; });

    // ---- 透明管入口：上方一排撥珠釘（把貼著液晶邊落下的珠子撥開，只留一個缺口），下方一根擋珠釘把珠子彈向入口 ----
    if (GD) line(wp.x + GD[0], wp.y + GD[1], wp.x + GD[2], wp.y + GD[3], GUIDE, 'warp', g2.guardSkip || []);
    if (g2.door) put(wp.x + g2.door[0], wp.y + g2.door[1], 'warp', 'wg', 1);

    // ---- 風車上方的八字釘：兩排密釘夾出通往風車的通道 ----
    // 外側那排不再從內軌邊上開始（hakOut＝離內軌留多寬）：貼著內軌下來的珠子（輕打的那一路）會從風車左邊漏到左下的釘群
    var hy = W.y - 100, hx = PK.shapeXs(hy, F.r - ir.r), hx0 = hx ? hx[0] : F.cx - ir.r;
    if (g2.hakOuter !== false && g2.hakA) line(hx0 + (g2.hakOut == null ? 9 : g2.hakOut), hy, W.x + g2.hakA[0], W.y + g2.hakA[1], GUIDE, 'hakama');   // hakA＝null：不放外側那排，貼著內軌下來的珠子直接從風車左邊掉下去
    // 內側那排的起點：不是緊貼內軌（g2.hakRail），就是離內軌至少一顆珠子寬（hakB[0]）。介於中間的話珠子會卡在第一根釘和內軌之間
    var hbx = g2.hakRail ? railX(W.y + g2.hakB[1]) + 4.6 : W.x + g2.hakB[0];   // 4.6＝貼著內軌放得下的最近位置（第一根在珠子重心的左邊，貼著內軌下來的珠子會被它往右推、滾下這排釘）
    line(hbx, W.y + g2.hakB[1], W.x + g2.hakB[2], W.y + g2.hakB[3], 12, 'hakama');
    if (g2.hk2) put(W.x + g2.hk2[0], W.y + g2.hk2[1], 'hakama', 'hk2', 1);

    // ---- 道釘：左右各一排，一路斜向啟動口兩側的跳釘 ----
    [R1, R2].forEach(function (R) {
      var len = Math.hypot(R.x2 - R.x1, R.y2 - R.y1), n = Math.round(len / (R.step || 12)), skip = [];
      (R.gaps || []).forEach(function (g) { var i0 = Math.round(g[0] * n); for (var k = 0; k < g[1]; k++) skip.push(i0 + k); });   // 漏珠缺口
      line(R.x1, R.y1, R.x2, R.y2, R.step || 12, 'road', skip);
    });

    // ---- 液晶左下（風車右邊 → 左道釘上方）的散釘 ----
    grid(W.x + 40, lcd.x + 60, lcdB + 6, R1.y1 + 60, 'bara', function (x, y) {
      if (Math.hypot(x - W.x, y - W.y) < W.r + D + 14) return false;
      return !roadBand(R1, x, y);
    }, 31, 27);

    // ---- 舞台下方到啟動口：左右散釘（正中央留給舞台落球口掉下來的直線） ----
    // 左右對稱（以啟動口為中心往兩邊排），釘距比別的地方密一點
    var LP = g2.lowPitch || 31, LR = g2.lowRow || 27;
    for (var yr = 0, yy = lcdB + 42; yy <= H.y - 40; yy += LR, yr++) {
      for (var xo = (yr % 2 ? LP : LP / 2) + 14; xo < 260; xo += LP) [-1, 1].forEach(function (sd2) {
        var x = H.x + sd2 * xo, R = sd2 < 0 ? R1 : R2;
        if (roadBand(R1, x, yy) || roadBand(R2, x, yy)) return;
        if (yy > roadY(R, x) - 10) return;
        if (x < Math.min(R1.x1, R1.x2) || x > Math.max(R2.x1, R2.x2)) return;
        if (Math.hypot(x - H.x, yy - H.y) > 64) put(x, yy, 'yori');
      });
    }

    // ---- 下段：道釘下方的落珠釘（比以前密：漏下來的珠子在這裡彈好幾下才進一般洞口或出界） ----
    grid(54, F.cx + F.r, R1.y1 + 26, L.out.y - 44, 'lower', function (x, y) {
      var R = x < H.x ? R1 : R2;
      if (roadBand(R1, x, y) || roadBand(R2, x, y)) return false;
      if (x >= Math.min(R.x1, R.x2) - 16 && x <= Math.max(R.x1, R.x2) + 16 && y < roadY(R, x) + CL) return false;   // 只在道釘下方
      if (nearPocket(x, y)) return false;
      if (x > R1.x2 - 8 && x < R2.x2 + 8 && y < H.y) return false;   // 兩條道釘終點之間、啟動口上方：這是舞台落球口掉向啟動口的直線，不放釘
      if (Math.hypot(x - W.x, y - W.y) < W.r + D + 14) return false;
      if (Math.hypot(x - H.x, y - H.y) < 64) return false;
      if (Math.abs(x - F.cx) < L.out.hw + 14 && y > L.out.y - 70) return false;   // 出口洞上方留空
      return true;
    }, LP, LR);

    // ---- 液晶右邊的走道：整片交錯的釘群（被擋釘打下來的珠子從最上面一路彈到右道釘） ----
    zig(lcdR + EDGE0, rightOut, lcd.y + 44, R2.y1 + 150, 'right', function (x, y) { return y > roadY(R2, x) - (D * 1.6 + NR + 4); }, 30, 27);

    // ---- 共同過濾：盤面內、離外軌／內軌／中央機關／舞台都至少一顆珠子的距離 ----
    var UG = PK.unitGeom(L), polys = [], ST = L.stage, stY = lcdB + 10 + ST.depth;
    var tl = UG.topLine(); polys.push(tl.concat([[lcdR, lcdB], [lcd.x, lcdB]]));
    polys.push(UG.platLine());
    var inPoly = function (x, y, pg) {
      var c = false;
      for (var i = 0, j = pg.length - 1; i < pg.length; j = i++) if ((pg[i][1] > y) !== (pg[j][1] > y) && x < (pg[j][0] - pg[i][0]) * (y - pg[i][1]) / (pg[j][1] - pg[i][1]) + pg[i][0]) c = !c;
      return c;
    };
    var nearUnit = function (x, y, d) {
      return polys.some(function (pg) {
        if (inPoly(x, y, pg)) return true;
        for (var i = 0; i < pg.length - 1; i++) if (distSeg(x, y, pg[i][0], pg[i][1], pg[i + 1][0], pg[i + 1][1]) < d) return true;
        return false;
      });
    };
    var SPL = L.startPlate, EDGE = D + NR + 3;   // 釘心離牆至少這麼遠，珠子才過得去
    // 發射軌道出口（外軌 → 內軌末端的圓頭）周圍兩顆半珠子內不放釘：出口要淨空，回彈的珠子才不會卡在出口跟下一顆相撞
    var exA = PK.ellPt(ir.to, 0), exB = PK.ellPt(ir.to, F.r - ir.r), EXIT = D * 2.5;
    var inside = out.filter(function (n) {
      var tight = n.kind === 'warp' || n.kind === 'hakama' || n.kind === 'road' || n.kind === 'sky' || n.kind === 'stop' || n.kind === 'kick';   // 這幾種本來就要貼著零件（不讓珠子從旁邊過）
      if (nearUnit(n.x, n.y, tight ? 5 : EDGE)) return false;
      if (distSeg(n.x, n.y, exA[0], exA[1], exB[0], exB[1]) < EXIT) return false;
      if (SPL && Math.abs(n.x - SPL.x) < SPL.w / 2 + 10 && Math.abs(n.y - SPL.y) < SPL.h / 2 + 10) return false;
      var a3 = PK.shapeAng(n.x, n.y);
      if (a3 >= ir.from - 2 && a3 <= ir.to + 2) {
        if (PK.ellK(n.x, n.y, F.r - ir.r + 4) > 1) return false;                              // 發射軌道裡不放
        if (!tight && PK.ellK(n.x, n.y, F.r - ir.r + EDGE) > 1) return false;                 // 離內軌一顆珠子
      } else if (PK.ellK(n.x, n.y, tight ? 6 : EDGE + 8) > 1) return false;                   // 離外軌：貼著外軌滾的珠子不會撞到
      if (n.x > ST.x - EDGE && n.x < ST.x + ST.w + EDGE && n.y > lcdB - 4 && n.y < stY + EDGE) return false;   // 舞台周圍
      return true;
    });

    // ---- 依優先順序放釘：跟別的釘群的釘心距小於 CL 就不放（不留卡珠的縫） ----
    var placed = [], gp = H.gap / 2;
    var J = L.jump || { dx: 26, dy: 32 };
    [[H.x - gp, H.y - 16], [H.x + gp, H.y - 16], [H.x - gp - J.dx, H.y - J.dy], [H.x + gp + J.dx, H.y - J.dy]].forEach(function (q) { placed.push({ x: q[0], y: q[1], grp: 'phys' }); });
    L.pockets.forEach(function (p) { var pw = p.w / 2 + 2; placed.push({ x: p.x - pw - 5, y: p.y - 14, grp: 'phys' }); placed.push({ x: p.x + pw + 5, y: p.y - 14, grp: 'phys' }); });
    placed.push({ x: W.x, y: W.y, grp: 'wm', rad: W.r });
    inside.sort(function (a, b) { return a.pri - b.pri; });
    var keep = [];
    inside.forEach(function (n) {
      var tight = n.kind === 'hakama' || n.kind === 'road';
      var clash = placed.some(function (q) {
        if (n.grp && q.grp === n.grp) return false;
        if (tight && (q.grp === 'wm' || q.grp === 'phys')) return Math.hypot(q.x - n.x, q.y - n.y) < (q.rad || NR) + NR + 4;   // 八字釘貼著風車、道釘接到跳釘：只要不重疊就好
        return Math.hypot(q.x - n.x, q.y - n.y) < CL + (q.rad ? q.rad - NR : 0);
      });
      if (!clash) { placed.push(n); keep.push(n); }
    });
    return keep;
  };

  PK.Gauge2 = G;
})(window.PK);

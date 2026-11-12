/* =========================================================
 * 演出抽選：依「當／不當」決定變動模式、予告、保留色、按鈕等
 * 每個表都是 {當:權重, 不當:權重}，讓信賴度貼近實機的感覺
 * ========================================================= */
(function (PK) {
  'use strict';
  var FX = PK.FX;
  var W = FX.weighted;

  var T = {
    // 通常時變動模式
    pattern: {
      hit: { none: 1, normal: 4, sp1: 15, sp2: 25, spsp: 50, zenkaiten: 5 },
      miss: { none: 880, normal: 85, sp1: 24, sp2: 8, spsp: 3 },
    },
    holdColor: {
      hit: { white: 45, blue: 14, green: 15, red: 18, gold: 7, rainbow: 1 },
      miss: { white: 920, blue: 60, green: 15, red: 5 },
    },
    // ステップアップ予告（記分板）層數，0 = 不出
    stepup: {
      hit: { 0: 30, 2: 5, 3: 15, 4: 25, 5: 25 },
      miss: { 0: 900, 1: 60, 2: 28, 3: 10, 4: 2 },
    },
    cutin: {
      hit: { none: 35, blue: 5, green: 10, red: 30, gold: 17, rainbow: 3 },
      miss: { none: 920, blue: 55, green: 18, red: 6, gold: 1 },
    },
    gun: { // ジェット風船群予告
      hit: { none: 55, normal: 25, gold: 20 },
      miss: { none: 975, normal: 24, gold: 1 },
    },
    serif: {
      hit: { none: 40, blue: 10, red: 30, gold: 20 },
      miss: { none: 900, blue: 75, red: 22, gold: 3 },
    },
    gijiren: {
      hit: { 0: 30, 1: 20, 2: 30, 3: 20 },
      miss: { 0: 900, 1: 80, 2: 18, 3: 2 },
    },
    push: {
      hit: { normal: 20, red: 35, gold: 25, long: 20 },
      miss: { normal: 80, red: 17, gold: 2, long: 1 },
    },
  };
  PK.SCRIPT_TABLES = T;

  function pickIn(tbl, hit) { return W(hit ? tbl.hit : tbl.miss); }
  var COLOR_RANK = ['white', 'blue', 'green', 'red', 'gold', 'rainbow'];

  function randSymExcept(ex) {
    var s; do { s = 1 + Math.floor(Math.random() * 9); } while (ex.indexOf(s) >= 0); return s;
  }

  var S = {};

  // ctx: {mode, src, holdCount}
  S.make = function (hit, allot, ctx) {
    var mode = ctx.mode, sc = { hit: hit, yokoku: {}, push: null };
    var force = ctx.force || {};

    // ---- RUSH / LT / 時短 中：快速變動 ----
    if ((mode === 'rush' || mode === 'lt' || mode === 'jitan') && !force.pattern) {
      if (hit) sc.pattern = W({ rush_ikki: 55, rush_reach: 32, rush_long: 13 });
      else sc.pattern = W({ rush_quick: mode === 'jitan' ? 93 : 90, rush_reach: 8, rush_long: 2 });
      if (sc.pattern === 'rush_long') sc.push = W(hit ? { red: 40, gold: 40, long: 20 } : { normal: 80, red: 20 });
      sc.holdColor = hit ? W({ white: 50, blue: 15, red: 25, gold: 10 }) : W({ white: 95, blue: 4, red: 1 });
    } else {
      sc.pattern = force.pattern || pickIn(T.pattern, hit);
      if (!hit && sc.pattern === 'none' && ctx.holdCount >= 3) sc.pattern = 'none_short';
      sc.holdColor = force.holdColor || pickIn(T.holdColor, hit);
      if (sc.pattern === 'zenkaiten') sc.holdColor = W({ rainbow: 30, gold: 30, red: 40 });

      var big = /sp|zen/.test(sc.pattern);
      var reach = sc.pattern !== 'none' && sc.pattern !== 'none_short';
      if (sc.pattern !== 'none_short') {
        var y = sc.yokoku;
        y.stepup = +pickIn(T.stepup, hit);
        y.cutin = pickIn(T.cutin, hit);
        y.gun = pickIn(T.gun, hit);
        y.serif = pickIn(T.serif, hit);
        y.gijiren = +pickIn(T.gijiren, hit);
        // 沒有發展的變動，不讓強予告出現（避免「強予告卻沒リーチ」的不自然）
        if (!big) {
          if (y.stepup > 3) y.stepup = 3;
          if (y.cutin === 'gold' || y.cutin === 'red') y.cutin = 'green';
          if (y.gun === 'gold') y.gun = 'normal';
          if (y.gijiren > 1) y.gijiren = 1;
        }
        if (!reach) { y.gijiren = 0; if (y.cutin !== 'none' && Math.random() < 0.6) y.cutin = 'none'; }
        if (y.cutin === 'rainbow' && !hit) y.cutin = 'gold';
        y.yaku = big && (hit ? Math.random() < 0.28 : Math.random() < 0.012);
        y.zone = big && (hit ? Math.random() < 0.45 : Math.random() < 0.12);
        y.kyuin = hit && Math.random() < 0.035;
        if (force.yokoku) Object.assign(y, force.yokoku);
      }
      if (/sp/.test(sc.pattern)) sc.push = force.push || pickIn(T.push, hit);
      // SPSP 的發展路線
      if (sc.pattern === 'spsp') sc.spspFrom = W({ direct: 30, sp1: 40, sp2: 30 });
    }
    if (force.holdColor) sc.holdColor = force.holdColor;

    // ---- 停止圖柄 ----
    if (hit) {
      var s = FX.pick(allot.sym);
      sc.final = [s, s, s]; sc.reachSym = s;
      if (sc.pattern === 'zenkaiten') { sc.final = [7, 7, 7]; sc.reachSym = 7; }
    } else if (/none|quick/.test(sc.pattern)) {
      var l = 1 + Math.floor(Math.random() * 9), r = randSymExcept([l]);
      sc.final = [l, randSymExcept([]), r];
    } else {
      var rs = 1 + Math.floor(Math.random() * 9);
      // 前後ハズレ（差一格）最常見
      var c = Math.random() < 0.7 ? ((rs + (Math.random() < 0.5 ? 0 : 7)) % 9) + 1 : randSymExcept([rs]);
      if (c === rs) c = (rs % 9) + 1;
      sc.final = [rs, c, rs]; sc.reachSym = rs;
    }

    // 保留初始顯示色：可能先顯示較低的顏色，之後「保留變化」
    var rank = COLOR_RANK.indexOf(sc.holdColor);
    sc.holdStart = rank > 0 && Math.random() < 0.6 ? COLOR_RANK[Math.floor(Math.random() * rank)] : sc.holdColor;
    if (sc.yokoku && sc.yokoku.kyuin) sc.holdStart = sc.holdColor = 'rainbow';
    return sc;
  };

  S.COLOR_RANK = COLOR_RANK;
  PK.Scripts = S;
})(window.PK);

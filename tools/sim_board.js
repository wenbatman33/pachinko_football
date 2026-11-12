#!/usr/bin/env node
/* =========================================================
 * 盤面球路分析：不開瀏覽器，直接載入遊戲本身的釘子配置與物理（js/config.js、js/v2/config2.js、
 * js/v2/gauge2.js、js/v2/physics2.js），每個手把力道連續打 n 顆，量出：
 *   - 落點：打進盤面後第一根撞到的釘子在哪一帶（＝這個力道瞄準的「進攻點」）
 *   - 固定程度：最常見的「前四根釘子」順序佔幾 %（越高＝每顆都走同一條路）、一共出現幾種走法
 *   - 散開程度：珠子落到液晶中段、道釘、洞口高度時，左右位置的標準差（越大＝越散）
 *   - 結果：主洞口／一般洞口／透明管／界外
 * 同事 2026-11 反應「釘子太少、力道固定幾乎都是同樣軌跡」，改釘子配置前後都用它量。
 *
 * 用法：
 *   node tools/sim_board.js                                  每個力道 400 顆的總表
 *   node tools/sim_board.js --powers 0.5,0.6,0.7 --balls 800
 *   node tools/sim_board.js --json /tmp/board.json --trace 60   另外把釘子、牆、每個力道 60 條軌跡寫出來（給 tools/draw_board.py 畫圖）
 *   其他：--seed 1  --set PHYS.nailJitter=0.05（先改設定再跑，可以給很多個，用逗號隔開）
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; });

function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

function makeBoard(seed) {
  const ctx = {
    console, Date, JSON, Object, Array, Number, String, Boolean, Error, RegExp, isNaN, parseFloat, parseInt, Infinity, NaN,
    navigator: { userAgent: 'sim' }, location: { search: '' }, screen: { width: 1000, height: 1500 },
    __rng: rng(seed),
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('Math.random = __rng;', ctx);
  ['js/config.js', 'js/v2/config2.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  const PK = ctx.PK;
  String(args.set || '').split(',').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='), ks = k.split('.'); let o = PK; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; if (!o || !(ks[ks.length - 1] in o)) throw new Error('沒有這個設定：' + k); o[ks[ks.length - 1]] = isNaN(+v) ? v : +v; });
  ['js/v2/gauge2.js', 'js/v2/physics2.js'].forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  PK.Phys.build();
  return PK;
}

const sd = (a) => { if (a.length < 2) return 0; const m = a.reduce((s, v) => s + v, 0) / a.length; return Math.sqrt(a.reduce((s, v) => s + (v - m) * (v - m), 0) / a.length); };
const pct = (n, d) => (d ? (n / d * 100).toFixed(1) : '0.0').padStart(5) + '%';

function run() {
  const PK = makeBoard(+(args.seed || 1)), P = PK.Phys, L = PK.LAYOUT, PH = PK.PHYS;
  const n = +(args.balls || 400), traceN = +(args.trace || 0);
  const powers = args.powers ? String(args.powers).split(',').map(Number) : [0.30, 0.38, 0.46, 0.54, 0.62, 0.70, 0.76, 0.82, 0.88, 0.94];
  const FI = PH.fireInterval / (PH.speed || 1);
  const lcd = L.lcd, YS = [lcd.y + lcd.h / 2, L.roadNails.y1, L.heso.y + 20];   // 量左右散開程度的三個高度：液晶中段、道釘起點、洞口
  const kinds = {}; P.nails.forEach((nl) => { kinds[nl.kind] = (kinds[nl.kind] || 0) + 1; });
  console.log('釘子一共 ' + P.nails.length + ' 根：' + Object.keys(kinds).map((k) => k + ' ' + kinds[k]).join('、'));
  console.log('');
  console.log('力道   落點(x,y)±散開     走法數  中段最擠  道釘最擠  走左／走右   主洞口   一般洞口  左入口  上入口   界外   平均撞釘  平均秒數  最久  超過12秒  沒出來');
  const dump = { board: L.board, field: L.field, lcd: L.lcd, nails: P.nails.map((q) => [Math.round(q.x * 10) / 10, Math.round(q.y * 10) / 10, q.kind]), segs: P.segs.map((s) => [s.x1, s.y1, s.x2, s.y2, s.kind]), windmill: L.windmill, heso: L.heso, pockets: L.pockets, warp: L.warp, out: L.out, tracks: {} };
  let cur = null;   // 目前這個力道的統計
  const info = new Map();   // 珠子 id → 這顆的紀錄
  P.on('tink', () => {});
  const origNails = P.nails;
  // 撞釘紀錄：包一層 glow 的設定太繞，直接每一步看珠子離哪根釘最近（撞到＝距離等於兩半徑和）
  ['heso', 'pocket', 'warp', 'foul', 'out', 'stageHole', 'attacker', 'denchu', 'gate', 'flapHit'].forEach((e) => P.on(e, (b) => {
    const r = b && info.get(b.id); if (!r) return;
    if (e === 'warp') { if (b.wi) r.sky = true; else r.warp = true; return; }
    if (e === 'stageHole') return;
    r.end = e; r.life = b.t; cur.done.push(r); info.delete(b.id);
  }));
  powers.forEach((pw) => {
    cur = { done: [] }; info.clear(); P.clearBalls();
    let shot = 0, acc = FI;
    const h = 1 / 240, rr = PH.ballR + PH.nailR + 0.6;
    for (let f = 0; shot < n || P.balls.length; f++) {
      acc += h;
      if (acc >= FI && shot < n) { acc -= FI; if (P.launch(pw)) { shot++; const b = P.balls[P.balls.length - 1]; info.set(b.id, { id: b.id, hits: [], last: -1, ys: [null, null, null], py: b.y, tr: shot <= traceN ? [] : null }); } }
      P.step(h / (PH.speed || 1));   // step 會乘上時間倍率，這裡先除回來：一格就是真實的 1/240 秒
      for (let i = 0; i < P.balls.length; i++) {
        const b = P.balls[i], r = info.get(b.id); if (!r) continue;
        if (r.tr && f % 2 === 0) r.tr.push(Math.round(b.x * 10) / 10, Math.round(b.y * 10) / 10);
        if (args.stuck && !r.slow && b.t > 12) { r.slow = true; console.log('   待超過 12 秒的珠子：(' + b.x.toFixed(1) + ', ' + b.y.toFixed(1) + ') 狀態 ' + b.state + '，速度 ' + Math.hypot(b.vx, b.vy).toFixed(0)); }
        if (b.state !== 'field') { r.py = b.y; continue; }
        const c = P.nailGrid[Math.floor(b.x / P.cell) * 1024 + Math.floor(b.y / P.cell)];
        if (c) for (let k = 0; k < c.length; k++) {
          const q = c[k], dx = b.x - q.x, dy = b.y - q.y;
          if (dx * dx + dy * dy < rr * rr) { const idx = origNails.indexOf(q); if (idx !== r.last) { r.hits.push(idx); r.last = idx; } break; }
        }
        for (let y = 0; y < 3; y++) if (r.ys[y] == null && r.py < YS[y] && b.y >= YS[y]) r.ys[y] = b.x;
        r.py = b.y;
      }
      if (f > (n * FI + 90) * 240) break;
    }
    const D = cur.done, live = D.filter((r) => r.end !== 'foul'), foul = D.length - live.length;
    if (args.stuck) P.balls.forEach((b) => console.log('   卡住的珠子：(' + b.x.toFixed(1) + ', ' + b.y.toFixed(1) + ') 狀態 ' + b.state + '，速度 ' + Math.hypot(b.vx, b.vy).toFixed(0) + '，已經 ' + b.t.toFixed(0) + ' 秒'));
    const firsts = live.filter((r) => r.hits.length).map((r) => origNails[r.hits[0]]);
    const fx = firsts.map((q) => q.x), fy = firsts.map((q) => q.y);
    const mx = fx.reduce((s, v) => s + v, 0) / (fx.length || 1), my = fy.reduce((s, v) => s + v, 0) / (fy.length || 1);
    const seq = {}; live.forEach((r) => { const k = r.hits.slice(0, 4).join('>'); seq[k] = (seq[k] || 0) + 1; });
    const top = Object.keys(seq).sort((a, b) => seq[b] - seq[a])[0];
    const cnt = (e) => live.filter((r) => r.end === e).length;
    const col = (y) => { const a = live.map((r) => r.ys[y]).filter((v) => v != null); return sd(a).toFixed(0).padStart(4); };
    const avgHits = live.reduce((s, r) => s + r.hits.length, 0) / (live.length || 1);
    // 最擠的一條：珠子通過某個高度時，把左右位置每 20 分一格，最多珠子的那一格佔幾 %（越高＝大家都走同一條）
    const crowd = (y) => { const a = live.map((r) => r.ys[y]).filter((v) => v != null), bins = {}; a.forEach((v) => { const k = Math.floor(v / 20); bins[k] = (bins[k] || 0) + 1; }); return pct(Math.max(0, ...Object.values(bins)), a.length); };
    const mid = live.map((r) => r.ys[0]).filter((v) => v != null), lr = pct(mid.filter((v) => v < L.field.cx).length, mid.length).trim() + '／' + pct(mid.filter((v) => v >= L.field.cx).length, mid.length).trim();
    console.log(pw.toFixed(2) + '   (' + mx.toFixed(0).padStart(3) + ',' + my.toFixed(0).padStart(3) + ') ±' + sd(fx).toFixed(0).padStart(3) + ',' + sd(fy).toFixed(0).padStart(3) + '   ' + String(Object.keys(seq).length).padStart(4) + '    ' + crowd(0) + '    ' + crowd(1) + '   ' + lr.padStart(13) + '   ' + pct(cnt('heso'), live.length) + '   ' + pct(cnt('pocket'), live.length) + '   ' + pct(live.filter((r) => r.warp).length, live.length) + '  ' + pct(live.filter((r) => r.sky).length, live.length) + '  ' + pct(foul, D.length) + '   ' + avgHits.toFixed(1).padStart(5)
      + '   ' + (live.reduce((s2, r) => s2 + (r.life || 0), 0) / (live.length || 1)).toFixed(1).padStart(5) + '   ' + Math.max(0, ...live.map((r) => r.life || 0)).toFixed(1).padStart(5) + '   ' + String(live.filter((r) => r.life > 12).length).padStart(4) + '    ' + String(info.size).padStart(4));   // 沒出來＝跑完還留在盤面上的珠子（卡住了）
    if (traceN) dump.tracks[pw.toFixed(2)] = D.filter((r) => r.tr).map((r) => ({ end: r.end, warp: !!r.warp, p: r.tr }));
  });
  if (args.json) { fs.writeFileSync(args.json, JSON.stringify(dump)); console.log('\n已寫出 ' + args.json); }
}
run();

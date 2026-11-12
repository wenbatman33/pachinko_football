#!/usr/bin/env node
/* =========================================================
 * 經濟模擬：不開瀏覽器，直接載入遊戲本身的規則與物理（js/config.js、js/v2/config2.js、js/fx.js、
 * js/v2/gauge2.js、js/v2/physics2.js、js/scripts.js、js/game.js、js/director.js），用虛擬時間快轉，
 * 量出「每分鐘贏幾顆、多久中一次大獎、兩小時累計贏幾顆」。漫畫解鎖的贏珠門檻（PK.MANGA.unlockBalls）就是用它訂的。
 *
 * 液晶、燈光、聲音都是空殼（不畫、不播），但演出的等待時間照導演程式真的走，所以每一轉花多久是準的。
 * 玩家的假設：一直按著手把打（力道固定）、沒珠子就再買 250 顆、按鈕提示 0.6 秒後按下、
 * 聽牌沒中進投打對決時照 --duel 給的機率打出全壘打／安打。
 *
 * 用法：
 *   node tools/sim_economy.js --sweep                         先看哪個手把力道最容易進主洞口
 *   node tools/sim_economy.js --hours 3 --runs 24             跑 24 次、每次 3 小時（機率照 PK.SPEC_DEFAULT，要試別組加 --spec light）
 *   其他參數：--power 0.6  --seed 1  --duel 0.25,0.35（全壘打率,安打率） --first 1（含新手保證中大獎）
 *            --json 檔名（把每一次每分鐘的累計贏珠數寫出來）
 *            --set DUEL.reward.hrBalls=300（先改設定再跑，可以給很多個，用逗號隔開）
 * ========================================================= */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const args = {};
process.argv.slice(2).forEach((a, i, arr) => { if (a.startsWith('--')) args[a.slice(2)] = arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true; });

const FILES = ['js/config.js', 'js/v2/config2.js', 'js/fx.js', 'js/v2/gauge2.js', 'js/v2/physics2.js', 'js/scripts.js', 'js/game.js', 'js/director.js'];
const SRC = {}; FILES.forEach((f) => { SRC[f] = fs.readFileSync(path.join(ROOT, f), 'utf8'); });

function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 什麼都接受的空殼：任何屬性都拿得到、任何函式都能呼叫（回傳另一個空殼）、設進去的值讀得回來
function shell(over) {
  const store = Object.assign({}, over || {});
  const p = new Proxy(function () {}, {
    get(t, k) {
      if (k in store) return store[k];
      if (k === 'then' || k === 'toJSON' || k === Symbol.iterator || k === Symbol.asyncIterator) return undefined;
      if (k === Symbol.toPrimitive) return (hint) => (hint === 'string' ? '' : 0);
      if (k === 'length') return 0;
      return shell();
    },
    set(t, k, v) { store[k] = v; return true; },
    has(t, k) { return k in store; },
    apply() { return shell(); },
  });
  return p;
}

function makeGame(seed) {
  const timers = [];
  const ctx = {
    console, Date, JSON, Promise, Symbol, Proxy, Object, Array, Number, String, Boolean, Error, RegExp, Map, Set, isNaN, parseFloat, parseInt, Infinity, NaN,
    navigator: { userAgent: 'sim' }, location: { search: '', hostname: 'sim.invalid', protocol: 'https:', origin: 'https://sim.invalid' }, screen: { width: 1000, height: 1500 },
    localStorage: { _d: {}, getItem(k) { return k in this._d ? this._d[k] : null; }, setItem(k, v) { this._d[k] = String(v); }, removeItem(k) { delete this._d[k]; } },
    document: { hidden: false, documentElement: { classList: { add() {}, remove() {}, toggle() {} } }, addEventListener() {}, getElementById() { return null; } },
    addEventListener() {},
    // 遊戲裡的 setTimeout／setInterval 只用在存檔與裝飾：走虛擬時間（interval 直接不跑）
    setTimeout(fn, ms) { timers.push({ at: ctx.__now + (ms || 0), fn }); return timers.length; },
    clearTimeout() {}, setInterval() { return 0; }, clearInterval() {},
    performance: { now() { return ctx.__now; } },
    __now: 0, __rng: rng(seed),
  };
  ctx.window = ctx; ctx.self = ctx; ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext('Math.random = __rng;', ctx);
  const run = (f) => vm.runInContext(SRC[f], ctx, { filename: f });
  run('js/config.js'); run('js/v2/config2.js'); run('js/fx.js');
  const PK = ctx.PK;
  // --set A.b.c=值：試算用，先改設定再跑
  String(args.set || '').split(',').filter(Boolean).forEach((kv) => { const [k, v] = kv.split('='), ks = k.split('.'); let o = PK; for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]]; if (!o || !(ks[ks.length - 1] in o)) throw new Error('沒有這個設定：' + k); o[ks[ks.length - 1]] = isNaN(+v) ? v : +v; });
  PK.Audio = shell();
  PK.Assets = { imgs: {}, get() { return null; }, cover() { return false; } };
  run('js/v2/gauge2.js'); run('js/v2/physics2.js'); run('js/scripts.js');
  PK.LCD = shell({ allStopped() { return true; }, cineBusy: 0, hudHidden: false, t: 0, overlays: [], reels: [{}, {}, {}], onHoldAdded() {}, attract: false });
  PK.BoardR = shell({ lampMode: 'idle', rightArrow: false });
  PK.UI = { power: 0.6, firing() { return true; }, setPushActive() {}, setPower() {} };
  run('js/game.js'); run('js/director.js');
  return { ctx, PK, timers };
}

// ---------- 只跑物理：每個手把力道打 n 顆，看進了哪裡 ----------
function sweep() {
  const { PK } = makeGame(+(args.seed || 1));
  const P = PK.Phys, n = +(args.balls || 1500);
  P.build();
  const FI = PK.PHYS.fireInterval / (PK.PHYS.speed || 1);
  console.log('力道   主洞口   一般洞口  透明管   界外    每分鐘進主洞口');
  for (let pw = 0.30; pw <= 0.96; pw += 0.03) {
    const c = { heso: 0, pocket: 0, warp: 0, foul: 0, out: 0 };
    ['heso', 'pocket', 'warp', 'foul', 'out', 'denchu', 'attacker', 'gate', 'tink', 'flapHit', 'stageHole'].forEach((e) => P.on(e, () => { if (e in c) c[e]++; }));
    P.clearBalls(); let shot = 0, acc = 0;
    for (let f = 0; shot < n || P.balls.length; f++) {
      acc += 1 / 60; if (acc >= FI && shot < n) { acc -= FI; if (P.launch(pw)) shot++; }
      P.step(1 / 60);
      if (f > n * FI * 60 + 60 * 60) break;
    }
    const live = n - c.foul;
    console.log(pw.toFixed(2) + '   ' + (c.heso / live * 100).toFixed(1).padStart(5) + '%   ' + (c.pocket / live * 100).toFixed(1).padStart(5) + '%   ' + (c.warp / live * 100).toFixed(1).padStart(5) + '%   ' + (c.foul / n * 100).toFixed(1).padStart(5) + '%   ' + (c.heso / n * 60 / FI).toFixed(1).padStart(6));
  }
}

// ---------- 跑整套遊戲 ----------
async function session(seed, opt) {
  const { ctx, PK, timers } = makeGame(seed);
  const G = PK.Game, P = PK.Phys, Clock = PK.FX.Clock;
  const errs = [];
  P.build();
  G.spec = opt.spec; G.paused = false;
  if (!opt.first) G.stats.hits = 0, G.stats.firstAt = 1e9;   // 不要新手保證：把保證的那一轉排到永遠不會到
  let wallExtra = 0;   // 投打對決花掉的時間（那段時間機台是暫停的）
  const st = { duels: 0, hr: 0, hit: 0, duelBalls: 0, rent: 0, modeSec: { normal: 0, rush: 0, lt: 0, jitan: 0, bonus: 0 } };
  let lastDuel = -1e9;
  PK.Duel = {
    preload() {},
    want(h) {
      const C = PK.DUEL; if (!C || !C.on || G.mode !== 'normal' || h.hit) return false;
      const p = h && h.script && h.script.pattern; if (!p || /none|quick|rush/.test(p)) return false;
      if (G.stats.total - lastDuel < C.trigger.minGapSpins) return false;
      return ctx.__rng() <= C.trigger.chance;
    },
    async run() {
      lastDuel = G.stats.total; st.duels++; wallExtra += opt.duelSec;
      const r = ctx.__rng(), R = PK.DUEL.reward;
      if (r < opt.duelHr) { st.hr++; st.duelBalls += R.hrBalls; G.duelWin(R.hrBalls); }
      else if (r < opt.duelHr + opt.duelHit) { st.hit++; st.duelBalls += R.hitBalls; G.duelWin(R.hitBalls); }
    },
  };
  G.start();
  const dt = 1 / 60, FI = PK.PHYS.fireInterval / (PK.PHYS.speed || 1), total = opt.hours * 3600;
  const perMin = [0]; let fireAcc = 0, t = 0, nextMin = 60, stuckAt = 0, stuckSpins = 0;
  const flush = () => new Promise((r) => setImmediate(r));
  while (t + wallExtra < total) {
    t += dt; ctx.__now = t * 1000;
    for (let i = timers.length - 1; i >= 0; i--) if (timers[i].at <= ctx.__now) { const f = timers[i].fn; timers.splice(i, 1); try { f(); } catch (e) { errs.push(e); } }
    Clock.update(dt);
    P.step(dt);
    fireAcc += dt;
    if (fireAcc >= FI) {
      fireAcc -= FI;
      if (G.balls <= 0) { G.rent(); st.rent++; }
      if (P.launch(opt.power)) G.consume();
    }
    const rq = G.pushReq;   // 按鈕提示：0.6 秒後按下（長按就按住）
    if (rq && !rq.done) { rq._t = (rq._t || 0) + dt; if (rq._t > 0.6) { if (rq.type === 'long') rq.holding = true; else rq.done = true; } }
    st.modeSec[G.inBonus ? 'bonus' : G.mode] += dt;
    await flush();
    while (t + wallExtra >= nextMin) { perMin.push(G.stats.safe); nextMin += 60; }
    if (t - stuckAt > 600) { if (G.stats.total === stuckSpins && G.stats.out > 0) throw new Error('十分鐘沒有新的一轉：模擬卡住了（第 ' + G.stats.total + ' 轉，狀態 ' + G.mode + (G.inBonus ? '／大獎中' : '') + '）'); stuckAt = t; stuckSpins = G.stats.total; }
  }
  if (errs.length) throw errs[0];
  return { perMin, safe: G.stats.safe, out: G.stats.out, spins: G.stats.total, hits: G.stats.hits, rushIn: G.stats.rushIn, maxChain: G.stats.maxChain, invested: G.invested, balls: G.balls, st, machineSec: t, duelSec: wallExtra };
}

async function main() {
  if (args.sweep) return sweep();
  const duel = String(args.duel || '0.25,0.35').split(',').map(Number);
  const opt = { spec: args.spec || makeGame(1).PK.SPEC_DEFAULT || 'light', hours: +(args.hours || 2), power: +(args.power || 0.6), first: args.first != null ? +args.first : 1, duelHr: duel[0], duelHit: duel[1], duelSec: +(args.duelSec || 25) };
  const runs = +(args.runs || 5), seed0 = +(args.seed || 1), res = [];
  process.on('unhandledRejection', (e) => { console.error('遊戲程式出錯：', e && e.stack || e); process.exit(1); });
  for (let i = 0; i < runs; i++) {
    const t0 = Date.now(), r = await session(seed0 + i, opt);
    res.push(r);
    const m = r.st.modeSec, tot = r.machineSec;
    console.log('第 ' + (i + 1) + ' 次｜贏 ' + r.safe + ' 顆（每分鐘 ' + (r.safe / (opt.hours * 60)).toFixed(1) + '）｜' + r.spins + ' 轉｜大獎 ' + r.hits + ' 次、最多連 ' + r.maxChain + '｜買珠 ' + r.st.rent + ' 次｜對決 ' + r.st.duels + ' 場（全壘打 ' + r.st.hr + '、安打 ' + r.st.hit + '）｜時間：平常 ' + Math.round(m.normal / tot * 100) + '%、連莊 ' + Math.round((m.rush + m.lt + m.jitan) / tot * 100) + '%、大獎 ' + Math.round(m.bonus / tot * 100) + '%｜算了 ' + ((Date.now() - t0) / 1000).toFixed(0) + ' 秒');
  }
  const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
  console.log('\n累計贏珠數（' + runs + ' 次，機率 ' + opt.spec + '，力道 ' + opt.power + '）');
  console.log('分鐘    最差     25%     中間     75%    最好    平均');
  for (let mn = 10; mn <= opt.hours * 60; mn += 10) {
    const v = res.map((r) => r.perMin[mn] != null ? r.perMin[mn] : r.safe);
    console.log(String(mn).padStart(4) + [q(v, 0), q(v, 0.25), q(v, 0.5), q(v, 0.75), q(v, 0.999), Math.round(v.reduce((a, b) => a + b, 0) / v.length)].map((x) => String(x).padStart(8)).join(''));
  }
  // 現在的漫畫門檻（PK.MANGA.unlockBalls）各要玩幾分鐘
  const U = res.length && makeGame(1).PK.MANGA.unlockBalls;   // --set 改過的門檻也會算進來
  if (U) {
    console.log('\n漫畫各話要玩幾分鐘（跑不到的算 ' + opt.hours * 60 + '+）');
    console.log('話   門檻    最快     25%    中間     75%    最慢');
    U.forEach((th, i) => { if (!th) return; const m = res.map((r) => { const k = r.perMin.findIndex((v) => v >= th); return k < 0 ? opt.hours * 60 + 1 : k; }); console.log(String(i + 1).padStart(2) + String(th).padStart(8) + [q(m, 0), q(m, 0.25), q(m, 0.5), q(m, 0.75), q(m, 0.999)].map((x) => String(x > opt.hours * 60 ? opt.hours * 60 + '+' : x).padStart(8)).join('')); });
  }
  if (args.json) fs.writeFileSync(args.json, JSON.stringify({ opt, runs: res.map((r) => ({ perMin: r.perMin, hits: r.hits, spins: r.spins, rent: r.st.rent, duels: r.st.duels })) }));
}
main().catch((e) => { console.error(e && e.stack || e); process.exit(1); });

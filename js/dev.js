/* =========================================================
 * DEV 開發者微調工具（按 D 或右下角齒輪開啟）
 * - 盤面元件可直接在畫面上拖曳；所有版面／物理／時間數值有滑桿
 * - 可強制觸發各種演出與狀態
 * - 💾 匯出目前數值（JSON），交給 Claude 寫回 config.js
 * ========================================================= */
(function (PK) {
  'use strict';
  var Dv = { open: false, tab: 'bonus', drag: null, handles: [], layoutForce: null };
  var $ = function (id) { return document.getElementById(id); };

  function saveOverrides() {
    var o = {};
    PK.CONFIG_KEYS.forEach(function (k) { o[k] = PK[k]; });
    o.layoutVer = PK.LAYOUT_VER;
    try { localStorage.setItem('pk_dev_overrides', JSON.stringify(o)); } catch (e) { /* 忽略 */ }
  }
  function changed(rebuild) {
    if (rebuild) PK.Phys.build();
    saveOverrides();
    if (Dv.tab === 'page') PK.UI.layout();
    if (PK.Machine && PK.Machine.layoutHome) PK.Machine.layoutHome();   // 首頁版面（首頁沒顯示時不會做事）
    if (PK.Machine && PK.Machine.layoutLoad) PK.Machine.layoutLoad();   // 載入畫面的進度條
    if (PK.Manga && PK.Manga.docked && PK.Manga.docked() && PK.UI && PK.UI.layout) PK.UI.layout();   // 邊玩邊看的分割（PK.SPLIT）
    if (PK.Manga && PK.Manga.refreshBtn) PK.Manga.refreshBtn();   // 「看漫畫」鈕的大小
    if (Dv.tab === 'machine' && PK.View3D) { clearTimeout(Dv.rbT); Dv.rbT = setTimeout(PK.View3D.rebuildAll, 60); }
  }

  Dv.touch = function () { saveOverrides(); refreshInputs(); };   // 首頁上直接拖元件之後呼叫：存起來、滑桿數字跟著更新

  // ---------- 可拖曳元件 ----------
  function handles() {
    var L = PK.LAYOUT, C = PK.LCD_LAYOUT, lcd = L.lcd;
    var sx = (lcd.w - 8) / C.w, sy = (lcd.h - 8) / C.h;
    var hs = [
      { name: '液晶', get: function () { return [lcd.x + lcd.w / 2, lcd.y + lcd.h / 2]; }, set: function (x, y) { lcd.x = Math.round(x - lcd.w / 2); lcd.y = Math.round(y - lcd.h / 2); }, rebuild: true, color: '#ff3355' },
      { name: '舞台', get: function () { return [L.stage.x + L.stage.w / 2, lcd.y + lcd.h + 20]; }, set: function (x) { L.stage.x = Math.round(x - L.stage.w / 2); }, rebuild: true },
      { name: '通道入口', get: function () { return [L.warp.x, L.warp.y]; }, set: function (x, y) { L.warp.y = Math.round(y); }, rebuild: true },
      { name: '風車', get: function () { return [L.windmill.x, L.windmill.y]; }, set: function (x, y) { L.windmill.x = Math.round(x); L.windmill.y = Math.round(y); }, rebuild: true },
      { name: '主洞口', get: function () { return [L.heso.x, L.heso.y]; }, set: function (x, y) { L.heso.x = Math.round(x); L.heso.y = Math.round(y); }, rebuild: true, color: '#ffd23f' },
      { name: '閘口', get: function () { return [L.gate.x, L.gate.y]; }, set: function (x, y) { L.gate.x = Math.round(x); L.gate.y = Math.round(y); }, rebuild: true },
      { name: 'ramp始', get: function () { return [L.ramp.x1, L.ramp.y1]; }, set: function (x, y) { L.ramp.x1 = Math.round(x); L.ramp.y1 = Math.round(y); }, rebuild: true, color: '#3fd2ff' },
      { name: 'ramp終', get: function () { return [L.ramp.x2, L.ramp.y2]; }, set: function (x, y) { L.ramp.x2 = Math.round(x); L.ramp.y2 = Math.round(y); }, rebuild: true, color: '#3fd2ff' },
      { name: '道釘始', get: function () { return [L.roadNails.x1, L.roadNails.y1]; }, set: function (x, y) { L.roadNails.x1 = Math.round(x); L.roadNails.y1 = Math.round(y); }, rebuild: true },
      { name: '道釘終', get: function () { return [L.roadNails.x2, L.roadNails.y2]; }, set: function (x, y) { L.roadNails.x2 = Math.round(x); L.roadNails.y2 = Math.round(y); }, rebuild: true },
      { name: '役物', get: function () { return [L.yaku.x, L.yaku.y]; }, set: function (x, y) { L.yaku.x = Math.round(x); L.yaku.y = Math.round(y); }, rebuild: false, color: '#ffd23f' },
      // 液晶內容（換算成盤面座標）
      { name: '圖柄', get: function () { return [lcd.x + 4 + C.reelX[1] * sx, lcd.y + 4 + C.reelY * sy]; }, set: function (x, y) {
        var nx = (x - lcd.x - 4) / sx, d = nx - C.reelX[1];
        C.reelX = C.reelX.map(function (v) { return Math.round(v + d); }); C.reelY = Math.round((y - lcd.y - 4) / sy);
      }, rebuild: false, color: '#7a5bff' },
      { name: '保留', get: function () { return [lcd.x + 4 + C.holdActiveX * sx, lcd.y + 4 + C.holdY * sy]; }, set: function (x, y) {
        var nx = (x - lcd.x - 4) / sx, d = nx - C.holdActiveX;
        C.holdActiveX = Math.round(nx); C.holdX0 = Math.round(C.holdX0 + d); C.holdY = Math.round((y - lcd.y - 4) / sy);
      }, rebuild: false, color: '#7a5bff' },
    ];
    L.pockets.forEach(function (p, i) {
      hs.push({ name: '入賞口' + (i + 1), get: function () { return [p.x, p.y]; }, set: function (x, y) { p.x = Math.round(x); p.y = Math.round(y); }, rebuild: true });
    });
    return hs;
  }

  // 由 view3d 轉送的盤面座標指標事件
  Dv.handlesOn = function () { return Dv.open && (Dv.tab === 'board' || Dv.tab === 'lcd' || Dv.tab === 'phys'); };
  Dv.pointerDown = function (p) {
    if (!Dv.handlesOn()) return false;
    var best = null, bd = 22;
    handles().forEach(function (h) { var q = h.get(), d = Math.hypot(q[0] - p[0], q[1] - p[1]); if (d < bd) { bd = d; best = h; } });
    Dv.drag = best;
    return !!best;
  };
  Dv.pointerMove = function (p) {
    if (!Dv.drag) return;
    Dv.drag.set(p[0], p[1]);
    changed(Dv.drag.rebuild);
    refreshInputs();
  };
  Dv.pointerUp = function () { Dv.drag = null; };

  // 在盤面上畫出拖曳把手（由 main 迴圈呼叫）
  Dv.drawOverlay = function (ctx) {
    if (!Dv.handlesOn()) return;
    ctx.save();
    handles().forEach(function (h) {
      var q = h.get();
      ctx.fillStyle = h.color || '#3bff6e'; ctx.globalAlpha = Dv.drag === h ? 1 : 0.8;
      ctx.beginPath(); ctx.arc(q[0], q[1], 8, 0, 6.28); ctx.fill();
      ctx.strokeStyle = '#000'; ctx.lineWidth = 2; ctx.stroke();
      ctx.font = '700 11px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#000'; ctx.lineWidth = 3;
      ctx.strokeText(h.name, q[0] + 10, q[1] - 8); ctx.fillText(h.name, q[0] + 10, q[1] - 8);
    });
    // 感應區
    ctx.globalAlpha = 0.5; ctx.strokeStyle = '#0ff'; ctx.lineWidth = 1;
    PK.Phys.sensors.forEach(function (s) {
      if (s.rect) ctx.strokeRect(s.rect.x, s.rect.y, s.rect.w, s.rect.h);
      else if (s.r) { ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.28); ctx.stroke(); }
    });
    ctx.restore();
  };

  // ---------- 面板 ----------
  var TABS = [
    ['bonus', '🏆 大獎畫面'], ['board', '盤面'], ['lcd', '液晶'], ['phys', '物理'], ['time', '時間'], ['fire', '觸發'], ['export', '💾 匯出'],
  ];

  function rangeFor(key, val, objName) {
    var k = key.toLowerCase();
    if (objName === 'TIMING') return k === 'speed' ? [0.2, 4, 0.05] : [0, Math.max(val * 3, 3000), 50];
    if (objName === 'PHYS' && PK.V2) {   // 新版（v2.html）：真實比例的數值範圍
      if (k === 'gravity') return [3000, 30000, 100];
      if (k === 'speed') return [0.2, 1.5, 0.05];
      if (k === 'hz') return [240, 1920, 60];
      if (/^e[A-Z]|^mu[A-Z]/.test(key) && k !== 'enailv') return [0, 1, 0.01];
      if (/drag$/.test(k)) return [0, k === 'warpdrag' ? 60 : 2, 0.01];
      if (k === 'nailjitter' || k === 'powerjitter' || k === 'launchvjitter') return [0, 0.2, 0.001];
      if (k === 'fireinterval') return [0.1, 2, 0.01];
      if (k === 'maxballs') return [10, 200, 1];
      if (k === 'ballr' || k === 'nailr' || k === 'nailhead') return [1, 16, 0.1];
      if (k === 'foulpower') return [0, 0.5, 0.01];
      if (key === '0') return [0, 1, 0.01];              // launchV 的手把位置
      if (key === '1') return [4000, 8000, 10];          // launchV 的初速
      return [0, Math.max(val * 3, 20), val >= 100 ? 5 : 0.5];
    }
    if (objName === 'PHYS') {
      if (k === 'gravity') return [300, 4000, 10];
      if (/^e|friction|jitter|foul|powerjitter/.test(k)) return [0, k === 'friction' ? 1 : 1, 0.005];
      if (k === 'substeps') return [1, 12, 1];
      if (k === 'fireinterval') return [0.1, 2, 0.01];
      if (k === 'maxballs') return [10, 200, 1];
      if (/vmin|vmax/.test(k)) return [200, 2000, 5];
      if (k === 'stagekick') return [0, 300, 1];
      return [0, val * 3 || 20, 0.5];
    }
    if (objName === 'LAYOUT_PC' || objName === 'LAYOUT_MOBILE') {
      if (k === 'fov') return [10, 60, 0.5];
      if (k === 'parallax') return [0, 80, 1];
      return [-800, 2400, 5];
    }
    if (objName === 'METER') return [0, 1, 0.001];   // 漫畫計量表：台座比例座標
    if (objName === 'SPLIT') return k === 'tall' ? [0.3, 0.72, 0.01] : k === 'btnh' ? [30, 80, 1] : [240, 1200, 10];   // 邊玩邊看的分割、「看漫畫」鈕的高度
    if (objName === 'DUEL') {                        // 點球對決
      if (k === 'on' || k === 'aim') return [0, 1, 1];
      if (k === 'chance' || k === 'hintat' || k === 'zoney') return [0, 1, 0.01];
      if (k === 'mingapspins') return [0, 60, 1];
      if (k === 'pitches') return [1, 6, 1];
      if (k === 'ch' || k === 'ver') return [1, 10, 1];
      if (k === 'hrballs' || k === 'hitballs') return [0, 200, 1];
      if (k === 'hrmin' || k === 'hitmin') return [0, 15, 0.5];
      if (k === 'perfect' || k === 'good' || k === 'foul') return val < 0.4 ? [0, 0.4, 0.005] : [0, 6, 0.1];   // 時機（秒）或位置（幾個球半徑）
      if (k === 'ease') return [0.5, 3, 0.05];
      if (key === '0' || key === '1') return [-1.5, 1.6, 0.005];   // 飛行秒數、出手位置
      return [-1.5, 1.5, 0.005];                                  // 版面
    }
    if (objName === 'HOME') {                        // 首頁版面：機台座標（寬 1000、高 1500）
      if (k === 'rot') return [-20, 20, 0.5];
      if (k === 'size' || k === 'sub') return [10, 140, 1];
      if (k === 'r') return [10, 80, 1];
      if (k === 'x') return [0, 1000, 1];
      if (k === 'y') return [0, 1500, 1];
      return [20, 1000, 1];
    }
    if (objName === 'MACHINE') {
      if (/opacity|bloom|threshold|env|exposure/.test(k)) return [0, k === 'exposure' ? 2.5 : 2, 0.01];
      if (k === 'x') return [-600, 600, 1];
      if (k === 'y' || /top|bottom|floor/.test(k)) return [-1000, 1000, 1];
      if (k === 'z') return [-50, 400, 1];
      return [0, Math.max(val * 2.5, 100), 1];
    }
    if (/font|size|r$|gap|depth|hole|step|w$|h$/.test(k)) return [0, Math.max(val * 2.5, 60), 1];
    if (/^t[01]$/.test(k)) return [0, 1, 0.005];
    if (/y/.test(k)) return [0, objName === 'LCD_LAYOUT' ? 720 : PK.LAYOUT.board.h, 1];
    if (/x/.test(k)) return [0, objName === 'LCD_LAYOUT' ? 960 : 800, 1];
    if (/from|to/.test(k)) return [0, 360, 1];
    return [0, Math.max(val * 3, 100), 1];
  }

  var inputs = [];
  function addControls(container, obj, path, objName, rebuild) {
    Object.keys(obj).forEach(function (key) {
      var v = obj[key], label = path ? path + '.' + key : key;
      if (Array.isArray(v)) {
        if (v.length && typeof v[0] === 'object') {
          v.forEach(function (it, i) { addControls(container, it, label + '[' + i + ']', objName, rebuild); });
        } else {
          v.forEach(function (n, i) { addRow(container, v, i, label + '[' + i + ']', objName, rebuild); });
        }
      } else if (v && typeof v === 'object') {
        var h = document.createElement('div'); h.className = 'dev-group'; h.textContent = label; container.appendChild(h);
        addControls(container, v, label, objName, rebuild);
      } else {
        addRow(container, obj, key, label, objName, rebuild);
      }
    });
  }

  function addRow(container, obj, key, label, objName, rebuild) {
    var v = obj[key];
    var row = document.createElement('label'); row.className = 'dev-row';
    var name = document.createElement('span'); name.textContent = label; row.appendChild(name);
    if (typeof v === 'string' && /^#/.test(v)) {
      var col = document.createElement('input'); col.type = 'color'; col.value = v;
      col.oninput = function () { obj[key] = col.value; changed(rebuild); };
      row.appendChild(col);
      inputs.push({ el: col, obj: obj, key: key });
    } else if (typeof v === 'number') {
      var rg = rangeFor(String(key), v, objName);
      var sl = document.createElement('input'); sl.type = 'range'; sl.min = rg[0]; sl.max = rg[1]; sl.step = rg[2]; sl.value = v;
      var num = document.createElement('input'); num.type = 'number'; num.step = rg[2]; num.value = v;
      sl.oninput = function () { obj[key] = parseFloat(sl.value); num.value = sl.value; changed(rebuild); if (objName === 'LCD_LAYOUT' && /sym/.test(key)) PK.LCD.buildSymbols(); };
      num.onchange = function () { obj[key] = parseFloat(num.value); sl.value = num.value; changed(rebuild); };
      row.appendChild(sl); row.appendChild(num);
      inputs.push({ el: sl, num: num, obj: obj, key: key });
    } else {
      return;
    }
    container.appendChild(row);
  }

  function refreshInputs() {
    inputs.forEach(function (i) { var v = i.obj[i.key]; if (document.activeElement !== i.el) i.el.value = v; if (i.num && document.activeElement !== i.num) i.num.value = v; });
  }

  function btn(container, text, fn, cls) {
    var b = document.createElement('button'); b.textContent = text; b.className = cls || '';
    // 按 DEV 按鈕也算「開始遊戲」（還沒觸碰機台時，保留會停在等待中）
    b.onclick = function () { PK.Audio.unlock(); if (PK.Machine && PK.Machine.start) PK.Machine.start(); fn(); };
    container.appendChild(b); return b;
  }

  function pvStatus(text) { var el = $('devPvStatus'); if (el) el.textContent = text; }

  // ---------- 聲音狀態顯示（畫面左上角的小字，不擋操作） ----------
  // 手機上音樂出狀況時直接看卡在哪一步：聲音輸出開著沒、應該播哪一首、實際有沒有在響、最近發生什麼事。
  // 開法：這個分頁的「🔊 聲音狀態」按鈕，或網址加 ?audio=1（上線版、沒開開發工具也能用）
  var hud = null, hudT = 0;
  Dv.audioHud = function (on) {
    if (on == null) on = !hud;
    if (!on) { if (hud) { hud.remove(); hud = null; clearInterval(hudT); } return; }
    if (hud || !PK.Audio || !PK.Audio.diag) return;
    hud = document.createElement('div'); hud.id = 'audioHud'; document.body.appendChild(hud);
    var draw = function () {
      var d = PK.Audio.diag(), h = [];
      h.push('🔊 輸出 ' + d.out + (d.hold ? '（' + d.hold + '，暫停中）' : '') + '｜應播 ' + d.want + '｜實際 ' + d.real);
      h.push('啟動 ' + (d.bless || '—') + (d.decoded ? '｜整首解碼 ' + d.decoded : '') + '｜自動補播 ' + d.heals + ' 次');
      d.notes.forEach(function (n) { h.push('+' + n[0] + '秒 ' + n[1] + (n[2] > 1 ? ' ×' + n[2] : '')); });
      hud.textContent = h.join('\n');
    };
    draw(); hudT = setInterval(draw, 500);
  };

  // 真的跑一次大獎（不轉圖案，直接 777）：アタッカー真的開、真的出珠，跑完真的進下一個狀態
  // from：'normal' 當作通常時初中獎；'rush' 當作 RUSH 中再中獎
  async function realRun(label, allot, from) {
    var G = PK.Game, C = PK.FX.Clock, M = PK.Machine;
    if (Dv.previewing) { pvStatus('上一個大獎還在跑，跑完再按'); return; }
    Dv.previewing = true;
    // 重新整理時若有上次沒跑完的大獎（停電復帰），先讓它接續跑完，避免兩場大獎同時跑
    if (G.resumeBonus) { pvStatus('先把上次沒跑完的大獎跑完…'); G.goResume = true; await C.until(function () { return !G.resumeBonus; }); }   // goResume：不用等玩家打第一顆，直接接著跑
    G.paused = true;
    if (G.spinning || G.inBonus) pvStatus('等目前這一轉停下來，馬上開始…');
    await C.until(function () { return !G.spinning && !G.inBonus; });
    pvStatus('中大獎！ ' + label);
    if (from === 'rush') {
      G.mode = 'rush'; G.modeSpins = G.specObj().stSpins; G.chain = Math.max(1, G.chain || 0); PK.Director.restoreMode();
    } else {
      G.mode = 'normal'; G.modeSpins = 0; G.chain = 0; G.chainPayout = 0;
    }
    var run = G.testBonus(allot, function () {
      // 跟真台一樣：大獎開始後改成打右邊（自動幫你轉好手把）
      if (M) { M.U.stopped = false; if (!PK.NO_RIGHT) PK.UI.setPower(0.96); }
    });
    G.paused = false;
    // 跑的過程中狀態列一直顯示進度，看得出大獎還在持續
    var tick = setInterval(function () {
      var bb = G.bonus; if (!bb || !bb.round) return;
      pvStatus('大獎進行中：第 ' + bb.round + ' / ' + bb.rounds + ' 回合・已進 ' + bb.count + ' 顆・本次獲得 ' + bb.payout + ' 顆');
    }, 250);
    try { await run; } catch (e) { console.warn('realRun', e); }
    clearInterval(tick);
    Dv.previewing = false;
    pvStatus('跑完了：進入 ' + (G.mode === 'rush' ? '連莊' : G.mode === 'jitan' ? '機會時間' : G.mode) + '（測試用，重新整理或按「結束測試」就回到平常）。共 ' + (G.chainPayout || 0) + ' 顆');
  }

  function forceHold(opts) {
    var G = PK.Game, src = G.isDensapo() ? 2 : 1;
    var f = Object.assign({ hit: true }, opts);
    if (f.hit && !f.allot) f.allot = src === 1 ? PK.ALLOT.heso[0] : (G.mode === 'lt' ? PK.ALLOT.lt[0] : PK.ALLOT.denchu[0]);
    G.addHold(src, f);
  }

  function renderTab() {
    var body = $('devBody'); body.innerHTML = ''; inputs = [];
    var t = Dv.tab;
    if (t === 'bonus' && PK.HOME && PK.Machine && PK.Machine.showHome) {
      // 首頁（封面）：叫出來看兩種狀態、直接拖元件、拉滑桿；這幾顆按了不會開始遊戲
      group(body, '🏠 首頁（按了會蓋住機台；預覽中首頁上的按鈕不會動作，每個元件都可以直接拖）');
      var bh = document.createElement('div'); bh.className = 'dev-btns dev-big'; body.appendChild(bh);
      var hb = function (text, fn, cls) { var b = document.createElement('button'); b.textContent = text; b.className = cls || ''; b.onclick = fn; bh.appendChild(b); };
      hb('看首頁：有存檔（繼續遊戲）', function () { PK.Machine.showHome(true); }, 'primary');
      hb('看首頁：第一次玩（開始遊戲）', function () { PK.Machine.showHome(false); });
      hb('■ 收起首頁', function () { PK.Machine.hideHome(); }, 'wide');
      // 載入畫面平常一閃就過，這顆叫出來慢慢看（進度條會自己一直跑；手機上面板會擋住下半部，所以先收起面板）
      hb('看載入畫面（點畫面收起）', function () { if (window.innerWidth <= 760 && Dv.open) Dv.toggle(false); PK.Machine.showLoading(); }, 'wide');
      var hd = document.createElement('details'); hd.className = 'dev-fold'; var hs = document.createElement('summary'); hs.textContent = '首頁每個元件的位置與大小（展開拉滑桿）'; hd.appendChild(hs); body.appendChild(hd);
      addControls(hd, PK.HOME, '', 'HOME', false);
      note(body, '調好之後到「💾 匯出」分頁，HOME 那一段就是首頁的數值。');
    }
    if (t === 'bonus' && PK.Duel && PK.DUEL) {
      // 點球對決：直接選對手開打、版面模式、所有數值
      group(body, '⚽ 點球對決（平常是聽牌落空時自動進入；這裡可以直接選對手開打）');
      var dst = document.createElement('div'); dst.className = 'dev-status'; dst.textContent = '按任一位對手就會開打（圖還沒載入的會先載幾秒）'; body.appendChild(dst);
      var bdu = document.createElement('div'); bdu.className = 'dev-btns dev-big'; body.appendChild(bdu);
      var db = function (text, fn, cls) { var b = document.createElement('button'); b.textContent = text; b.className = cls || ''; b.onclick = function () { PK.Audio.unlock(); fn(); }; bdu.appendChild(b); };
      PK.DUEL.opponents.forEach(function (o, i) { db('▶ 第' + o.ch + '話 ' + o.name + '（' + (o.aim ? '要點在擊球點上' : '只抓時機') + '）', function () {
        PK.Duel.close();
        var name = '第' + o.ch + '話 ' + o.name;
        dst.textContent = PK.Duel.isReady(o) ? name + '：開打！' : name + '：載入圖片中…';
        if (PK.Machine && PK.Machine.start) PK.Machine.start();   // 還在首頁的話先進遊戲
        PK.Duel.run({ opp: o, dev: true }).then(function (r) { dst.textContent = r == null && !PK.Duel.active ? name + '：圖片載入失敗，請再按一次' : name + '：結束（' + (r === 'hr' ? '世界波' : r === 'hit' ? '安打' : '出局') + '）'; });
        if (PK.Duel.isReady(o)) Dv.toggle(false);   // 開打時先把開發面板收起來，才不會擋住畫面（按 D 再打開）
        else var wv = setInterval(function () { if (PK.Duel.active) { clearInterval(wv); dst.textContent = name + '：開打！'; Dv.toggle(false); } }, 150);
      }, i === 0 ? 'primary' : ''); });
      db('版面模式（直接拖門將、陸遠、球門範圍）', function () { PK.Duel.close(); PK.Duel.run({ opp: PK.DUEL.opponents[PK.DUEL.opponents.length - 1], test: true, layout: true }); });
      db('■ 關閉對決', function () { PK.Duel.close(); }, 'wide');
      var dd = document.createElement('details'); dd.className = 'dev-fold'; var dsm = document.createElement('summary'); dsm.textContent = '對決的數值（觸發、獎勵、時機與準星的容許誤差、版面、每位對手的球速與難度）'; dd.appendChild(dsm); body.appendChild(dd);
      addControls(dd, PK.DUEL, '', 'DUEL', false);
      note(body, 'timing＝起腳時機的容許誤差（秒）；每位對手的 ease 越大越好踢、flight 是準星從出現到最佳時機的秒數（越小越快）。調好之後到「💾 匯出」分頁，DUEL 那一段就是對決的數值。');
    }
    if (t === 'bonus') {
      var st = document.createElement('div'); st.className = 'dev-status'; st.id = 'devPvStatus';
      st.textContent = Dv.previewing ? '大獎進行中…' : '按下面任一顆，會真的跑完一整個大獎'; body.appendChild(st);
      var bp = document.createElement('div'); bp.className = 'dev-btns dev-big'; body.appendChild(bp);
      btn(bp, '★ 中大獎：10 回合 → 進入連莊', function () { realRun('10 回合大獎', PK.ALLOT.heso[0], 'normal'); }, 'primary wide');
      btn(bp, '★ 中大獎：3 回合 → 機會時間', function () { realRun('3 回合大獎', PK.ALLOT.heso[2], 'normal'); }, 'wide');
      btn(bp, '★ 連莊中再中', function () { realRun('連莊中再中 10 回合', PK.ALLOT.denchu[0], 'rush'); });
      btn(bp, '★ 連莊中中幸運爆發', function () { realRun('幸運爆發 10 回合', PK.ALLOT.denchu[2], 'rush'); });
      btn(bp, '■ 結束測試，回到平常', function () { if (Dv.previewing) { pvStatus('大獎還在跑，跑完再按'); return; } PK.Game.endTest(); pvStatus('已回到平常狀態'); }, 'wide');
      note(body, '每一顆都是完整的大獎：777 停下 → 整台燈光閃爍 → 手把自動轉到打右邊 → 大獎洞口真的開蓋吃珠、上方珠盤一直出珠（每進 1 顆給 15 顆）→ 結尾秀總出珠 → 真的進入下一個狀態。10 回合約 2 分鐘，3 回合約 1 分鐘（照真台節奏：回合之間停 4 秒、開場與結尾都有完整演出）。');
      group(body, '試聽中獎音樂（要開聲音：按 M 或機台下方喇叭鍵）');
      var bm = document.createElement('div'); bm.className = 'dev-btns dev-big'; body.appendChild(bm);
      var Au = PK.Audio;
      btn(bm, '▶ 中獎號角', function () { Au.playBgm('jingle_bigwin', true); pvStatus('試聽中：中獎號角'); });
      btn(bm, '▶ 大獎回合音樂', function () { Au.playBgm('bgm_bonus', true); pvStatus('試聽中：大獎回合音樂'); });
      btn(bm, '■ 停止試聽', function () { PK.Director.restoreMode(); pvStatus('已停止試聽'); }, 'wide');
      note(body, '想看「從轉圖案到中獎」的完整流程：到「觸發」分頁按「5 回合連莊 中」，下一轉就會中獎。想看連莊結束：「觸發」分頁按「剩 1 轉」。');
      // 聲音狀態與「模擬手機把聲音停掉」：按了之後看左上角的狀態，一兩秒內應該自己補回來
      group(body, '🔊 聲音狀態（手機上音樂不見時用；網址加 ?audio=1 也會顯示）');
      var ba = document.createElement('div'); ba.className = 'dev-btns dev-big'; body.appendChild(ba);
      var ab = function (text, fn, cls) { var b = document.createElement('button'); b.textContent = text; b.className = cls || ''; b.onclick = fn; ba.appendChild(b); };
      ab('🔊 顯示／隱藏聲音狀態（畫面左上角）', function () { Dv.audioHud(); }, 'primary wide');
      ab('模擬：歌被手機暫停', function () { Dv.audioHud(true); if (Au.bgmStream) Au.bgmStream.el.pause(); });
      ab('模擬：聲音輸出被暫停', function () { Dv.audioHud(true); if (Au.ctx) Au.ctx.suspend(); });
      ab('模擬：歌載入出錯', function () { Dv.audioHud(true); if (Au.bgmStream) { Au.bgmStream.el.dispatchEvent(new Event('error')); Au.bgmStream.el.pause(); } }, 'wide');
      // 漫畫《PK大逆转》：解鎖靠累計贏得的珠數，這裡可以直接加珠數測試
      var Mg = PK.Manga;
      if (Mg && Mg.state) {
        group(body, '📖 漫畫解鎖（目前累計贏得 ' + Math.floor(Mg.won()).toLocaleString('en-US') + ' 顆，已解鎖 ' + Mg.state.unlocked.length + ' / ' + PK.MANGA.unlockBalls.length + ' 話）');
        var bk = document.createElement('div'); bk.className = 'dev-btns dev-big'; body.appendChild(bk);
        btn(bk, '★ 解鎖下一話（液晶播預告）', function () { Mg.devUnlockNext(); pvStatus('已解鎖下一話：兩轉之間的空檔會在液晶播預告，播完點液晶可以直接讀'); renderTab(); }, 'primary wide');
        btn(bk, '＋500 顆贏得的珠數', function () { Mg.devAddWon(500); renderTab(); });
        btn(bk, '▶ 重播最新一話的預告', function () { Mg.devReplay(Mg.state.unlocked[Mg.state.unlocked.length - 1]); pvStatus('下一個空檔會重播預告'); });
        btn(bk, '📖 打開漫畫櫃', function () { Dv.toggle(false); Mg.openCabinet(); });
        btn(bk, '◫ 邊玩邊看第一話（測分割畫面）', function () { if (window.innerWidth <= 760) Dv.toggle(false); PK.Machine.start(); Mg.split.on = true; Mg.openReader(1); }, 'wide');
        btn(bk, '全部解鎖（不播預告）', function () { Mg.devUnlockAll(); renderTab(); });
        btn(bk, '↺ 漫畫進度歸零（只剩第一話）', function () { Mg.devReset(); renderTab(); if (Mg.onCoverChange) Mg.onCoverChange(); }, 'wide');
        group(body, '邊玩邊看的分割（tall＝手機直立時漫畫佔的高度比例；wideMin／wideMax＝寬螢幕時漫畫那一欄的寬度，畫面像素）');
        addControls(body, PK.SPLIT, '', 'SPLIT', false);
        group(body, '漫畫等級計量表的位置（機台左下；x＝畫面寬比例、y＝台座高比例，拉了立刻看到）');
        addControls(body, PK.METER, '', 'METER', false);
        note(body, '解鎖門檻（累計贏得的珠數）：' + PK.MANGA.unlockBalls.map(function (m, i) { return '第' + (i + 1) + '話 ' + (m ? m.toLocaleString('en-US') : '免費'); }).join('、') + '。只算機台吐出來的珠子（進洞、大獎、點球對決），買的不算；開發工具的測試大獎與測試對決也不算。');
      }
    } else if (t === 'board') {
      note(body, '在盤面上直接拖曳彩色圓點即可移動元件；滑桿即時生效。');
      addControls(body, PK.LAYOUT, '', 'LAYOUT', true);
    } else if (t === 'machine') {
      note(body, '3D 機台各零件位置（手把、按鈕、購買鈕、持有珠數、標誌）與光影參數。');
      addControls(body, PK.MACHINE, '', 'MACHINE', false);
    } else if (t === 'lcd') {
      note(body, '液晶畫布座標 960×720。紫色圓點（圖柄／保留）也可在盤面上拖曳。');
      addControls(body, PK.LCD_LAYOUT, '', 'LCD_LAYOUT', false);
    } else if (t === 'phys') {
      note(body, '「釘子調整」：主洞口的 gap（主洞口兩根釘的間距）在盤面分頁。這裡調重力、反彈、發射力道。');
      addControls(body, PK.PHYS, '', 'PHYS', true);
      if (PK.PHYS.stageKick == null) PK.PHYS.stageKick = 60;
    } else if (t === 'time') {
      addControls(body, PK.TIMING, '', 'TIMING', false);
    } else if (t === 'page') {
      var bar = document.createElement('div'); bar.className = 'dev-btns';
      btn(bar, '自動', function () { Dv.layoutForce = null; PK.UI.forceMode = null; PK.UI.layout(); });
      btn(bar, '強制 PC', function () { PK.UI.forceMode = 'pc'; PK.UI.layout(); });
      btn(bar, '強制 手機', function () { PK.UI.forceMode = 'mobile'; PK.UI.layout(); });
      body.appendChild(bar);
      var h1 = document.createElement('div'); h1.className = 'dev-group'; h1.textContent = 'LAYOUT_PC'; body.appendChild(h1);
      addControls(body, PK.LAYOUT_PC, '', 'LAYOUT_PC', false);
      var h2 = document.createElement('div'); h2.className = 'dev-group'; h2.textContent = 'LAYOUT_MOBILE'; body.appendChild(h2);
      addControls(body, PK.LAYOUT_MOBILE, '', 'LAYOUT_MOBILE', false);
    } else if (t === 'fire') {
      var G = PK.Game;
      group(body, '次回變動（加入一個強制保留）');
      var b1 = document.createElement('div'); b1.className = 'dev-btns'; body.appendChild(b1);
      btn(b1, '九局下特別演出 中', function () { forceHold({ pattern: 'spsp', push: 'long' }); });
      btn(b1, '九局下特別演出 不中', function () { forceHold({ hit: false, pattern: 'spsp', push: 'red' }); });
      btn(b1, '單刀對決SP 當', function () { forceHold({ pattern: 'sp1', push: 'gold' }); });
      btn(b1, '單刀對決SP 不當', function () { forceHold({ hit: false, pattern: 'sp1', push: 'normal' }); });
      btn(b1, '任意球挑戰SP 當', function () { forceHold({ pattern: 'sp2', push: 'red' }); });
      btn(b1, '任意球挑戰SP 不當', function () { forceHold({ hit: false, pattern: 'sp2', push: 'normal' }); });
      btn(b1, '全迴轉', function () { forceHold({ pattern: 'zenkaiten' }); });
      btn(b1, '一般聽牌 中', function () { forceHold({ pattern: 'normal' }); });
      btn(b1, '3R 時短當', function () { forceHold({ allot: PK.ALLOT.heso[2] }); });
      btn(b1, '5 回合連莊 中', function () { forceHold({ allot: PK.ALLOT.heso[1] }); });
      btn(b1, '幸運爆發 中', function () { forceHold({ allot: PK.ALLOT.denchu[2] }); });
      btn(b1, '全部預告 中', function () { forceHold({ pattern: 'spsp', holdColor: 'red', yokoku: { stepup: 5, cutin: 'gold', gun: 'gold', serif: 'gold', gijiren: 3, yaku: true, zone: true } }); });
      btn(b1, '全部預告 不中', function () { forceHold({ hit: false, pattern: 'spsp', holdColor: 'red', yokoku: { stepup: 4, cutin: 'red', gun: 'normal', serif: 'red', gijiren: 2, yaku: false, zone: true } }); });
      btn(b1, '虹保留', function () { forceHold({ holdColor: 'rainbow' }); });
      btn(b1, '先告知音效', function () { forceHold({ yokoku: { kyuin: true } }); });
      group(body, '狀態');
      var b2 = document.createElement('div'); b2.className = 'dev-btns'; body.appendChild(b2);
      btn(b2, '連莊開始', function () { G.mode = 'rush'; G.modeSpins = G.specObj().stSpins; G.chain = Math.max(1, G.chain); PK.Director.restoreMode(); });
      btn(b2, '幸運爆發開始', function () { G.mode = 'lt'; G.modeSpins = G.specObj().ltSpins; G.chain = Math.max(1, G.chain); PK.Director.restoreMode(); });
      btn(b2, '時短 開始', function () { G.mode = 'jitan'; G.modeSpins = G.specObj().jitanSpins; PK.Director.restoreMode(); });
      btn(b2, '剩 1 轉', function () { if (G.mode !== 'normal') G.modeSpins = 1; });
      btn(b2, '回到平常', function () { G.mode = 'normal'; G.modeSpins = 0; PK.Director.restoreMode(); });
      btn(b2, '+1000 顆珠', function () { if (PK.Machine) PK.Machine.payout(1000); else G.balls += 1000; });
      btn(b2, '球全部清除', function () { PK.Phys.clearBalls(); });
      btn(b2, '加啟動口保留', function () { G.addHold(1); });
      group(body, '單一演出（立即播放）');
      var b3 = document.createElement('div'); b3.className = 'dev-btns'; body.appendChild(b3);
      btn(b3, '機關落下', function () { PK.BoardR.yaku.target = 1; PK.Audio.play('yaku'); setTimeout(function () { PK.BoardR.yaku.target = 0; }, 1600); });
      ['blue', 'green', 'red', 'gold', 'rainbow'].forEach(function (c) {
        btn(b3, '插圖 ' + c, function () { PK.Audio.play('cutin'); PK.LCD.cutin(c === 'red' || c === 'gold' || c === 'rainbow' ? 'cut_hero' : 'cut_manager', c, 'TEST'); });
      });
      btn(b3, '中大獎橫幅', function () { PK.LCD.banner('中大獎', { rainbow: true, size: 150, rays: '#ffd23f', dur: 2.5 }); PK.LCD.fireworks(6); PK.LCD.confetti(150); });
      btn(b3, '煙火', function () { PK.LCD.fireworks(8); });
      btn(b3, '按鈕測試', function () { PK.Director.push('long'); });
      btn(b3, '打右邊箭頭', function () { PK.BoardR.rightArrow = !PK.BoardR.rightArrow; });
      btn(b3, '珠子軌跡線 開／關 (T)', function () { if (PK.Machine) PK.Machine.toggleTrails(); });
      group(body, '速度');
      addControls(body, { speed: PK.TIMING.speed }, '', 'TIMING', false);
      var last = inputs[inputs.length - 1]; last.obj = PK.TIMING;
      last.el.oninput = function () { PK.TIMING.speed = parseFloat(last.el.value); last.num.value = last.el.value; saveOverrides(); };
    } else if (t === 'export') {
      note(body, '調整完成後按「💾 匯出」：複製 JSON 並下載檔案。把它交給 Claude，或說「我調好了，鎖定」，Claude 會寫回 js/config.js。調整值已自動暫存在瀏覽器。');
      var ta = document.createElement('textarea'); ta.className = 'dev-export'; ta.readOnly = true;
      var o = {}; PK.CONFIG_KEYS.forEach(function (k) { o[k] = PK[k]; });
      ta.value = JSON.stringify(o, null, 2);
      body.appendChild(ta);
      var b4 = document.createElement('div'); b4.className = 'dev-btns'; body.appendChild(b4);
      btn(b4, '💾 匯出（複製＋下載）', function () {
        ta.select();
        try { navigator.clipboard.writeText(ta.value); } catch (e) { document.execCommand('copy'); }
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([ta.value], { type: 'application/json' }));
        a.download = 'pachinko_layout_' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-') + '.json';
        a.click();
        saveOverrides();
      }, 'primary');
      btn(b4, '↺ 全部重設為預設', function () {
        if (!confirm('把所有調整恢復為原始預設值？')) return;
        try { localStorage.removeItem('pk_dev_overrides'); } catch (e) { /* 忽略 */ }
        PK.CONFIG_KEYS.forEach(function (k) {
          var d = JSON.parse(JSON.stringify(PK.DEFAULTS[k]));
          Object.keys(PK[k]).forEach(function (kk) { delete PK[k][kk]; });
          Object.assign(PK[k], d);
        });
        changed(true); PK.UI.layout(); PK.LCD.buildSymbols(); renderTab();
      });
    }
  }
  function note(body, text) { var n = document.createElement('p'); n.className = 'dev-note'; n.textContent = text; body.appendChild(n); }
  function group(body, text) { var h = document.createElement('div'); h.className = 'dev-group'; h.textContent = text; body.appendChild(h); }

  Dv.toggle = function (v) {
    Dv.open = v == null ? !Dv.open : v;
    $('devPanel').classList.toggle('open', Dv.open);
    document.body.classList.toggle('dev-open', Dv.open);
    if (Dv.open) renderTab();
    if (PK.View3D && PK.View3D.resize) PK.View3D.resize();   // 機台縮到面板旁邊，液晶不被擋住
  };
  Dv.showTab = function (tab) {
    Dv.tab = tab;
    Array.prototype.forEach.call($('devTabs').children, function (c) { c.classList.toggle('on', c.dataset.tab === tab); });
    if (Dv.open) renderTab(); else Dv.toggle(true);
  };

  Dv.init = function () {
    try { if (/[?&]audio=1(&|$)/.test(location.search)) Dv.audioHud(true); } catch (e) { /* 忽略 */ }   // 上線版也能看聲音狀態
    if (!PK.DEV) {
      // 上線版：拿掉齒輪與面板，D／J 鍵不作用
      ['devToggle', 'devPanel'].forEach(function (id) { var el = $(id); if (el) el.remove(); });
      Dv.toggle = function () {}; Dv.showTab = function () {};
      return;
    }
    var tabs = $('devTabs');
    TABS.forEach(function (t) {
      var b = document.createElement('button'); b.textContent = t[1]; b.dataset.tab = t[0];
      b.onclick = function () { Dv.showTab(t[0]); };
      if (t[0] === Dv.tab) b.classList.add('on');
      tabs.appendChild(b);
    });
    $('devToggle').onclick = function () { Dv.toggle(); };
    $('devClose').onclick = function () { Dv.toggle(false); };
    window.addEventListener('keydown', function (ev) {
      if (ev.target && /INPUT|SELECT|TEXTAREA/.test(ev.target.tagName)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;   // 系統快捷鍵（截圖、書籤等）不開開發工具
      if (ev.key === 'd' || ev.key === 'D') Dv.toggle();
      if (ev.key === 'j' || ev.key === 'J') Dv.showTab('bonus');
    });
    var head = document.querySelector('.dev-head'); if (head) head.firstChild.textContent = 'DEV 開發工具（11/10 版）';
  };

  PK.Dev = Dv;
})(window.PK);

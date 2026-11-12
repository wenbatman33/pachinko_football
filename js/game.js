/* =========================================================
 * 遊戲核心：入賞處理、保留、抽選、狀態（通常／時短／RUSH／LT）、大當り回合
 * ========================================================= */
(function (PK) {
  'use strict';
  var FX = PK.FX, Clock = FX.Clock, Au = PK.Audio;

  var G = {
    mode: 'normal', modeSpins: 0, holds1: [], holds2: [], spinning: false, inBonus: false,
    balls: 0, invested: 0, spec: PK.SPEC_DEFAULT || 'light', futoHolds: 0, futoBusy: false, futoLamp: false,
    bonus: null, chain: 0, chainPayout: 0, force: null, paused: false, cur: null,
    stats: { total: 0, since: 0, hits: 0, rushIn: 0, maxChain: 0, history: [], graph: [0], diff: 0, out: 0, safe: 0 },
  };

  G.specObj = function () { return PK.SPECS[G.spec]; };
  G.isDensapo = function () { return G.mode !== 'normal'; };

  G.probFor = function (mode) {
    var sp = G.specObj();
    if (mode === 'rush') return sp.stProb;
    if (mode === 'lt') return sp.ltProb;
    return sp.prob;
  };

  // ---------- 存檔（含停電復帰：模式、剩餘回數、保留、大当り進度） ----------
  function slimHold(h) { return { src: h.src, r: h.r, mode: h.mode, hit: h.hit, forced: h.forced, allot: h.allot }; }
  function reviveHold(o) {
    var hc = (o.src === 1 ? G.holds1.length : G.holds2.length);
    var script = PK.Scripts.make(o.hit, o.allot, { mode: o.mode, src: o.src, holdCount: hc, force: {} });
    return { src: o.src, r: o.r, mode: o.mode, hit: o.hit, forced: o.forced, allot: o.allot, script: script, color: script.holdStart, id: Math.random() };
  }
  G.save = function () {
    if (!G.loaded) return;   // 讀檔前不存（素材載入期間的定時存檔會蓋掉舊檔）
    if (G.previewing) return;   // DEV 預覽大獎畫面中不存
    try {
      var st = {
        // 開發工具測試大獎後進入的 RUSH 不存檔（重新整理就回到平常，不會出現「沒中獎卻要打右邊」）
        mode: G.devMode ? 'normal' : G.mode, modeSpins: G.devMode ? 0 : G.modeSpins, chain: G.devMode ? 0 : G.chain, chainPayout: G.devMode ? 0 : G.chainPayout,
        holds1: G.holds1.map(slimHold), holds2: G.holds2.map(slimHold),
        cur: G.cur && G.spinning ? slimHold(G.cur) : null,
        // 還沒接續的大獎（重新整理後、按「繼續遊戲」之前）要原樣保留，不然定時存檔會把它蓋掉，大獎就不見了
        bonus: G.bonus && !G.bonus.dev ? { round: G.bonus.round, rounds: G.bonus.rounds, payout: G.bonus.payout, next: G.bonus.next, prevMode: G.bonus.prevMode, lt: G.bonus.lt } : (G.resumeBonus || null),
      };
      localStorage.setItem('pk_save', JSON.stringify({ ver: 2, balls: G.balls, invested: G.invested, spec: G.spec, stats: G.stats, state: st }));
    } catch (e) { /* 忽略 */ }
  };
  G.load = function () {
    G.loaded = true;
    try {
      var s = JSON.parse(localStorage.getItem('pk_save') || 'null');
      if (!s) return;
      G.balls = s.balls || 0; G.invested = s.invested || 0; G.spec = PK.SPEC_DEFAULT || (PK.SPECS[s.spec] ? s.spec : 'light');   // 機率一律照設定（沒有讓玩家選的介面），不沿用存檔裡舊的
      Object.assign(G.stats, s.stats || {});   // 大獎次數、轉數、歷史紀錄（2026-11-11 改機率時這一行被接在上面的註解後面，變成沒執行，重新整理後統計全部歸零）
      var st = s.state;
      // 存檔版本 2 之前：開發測試時留下的 RUSH／時短／大獎狀態會被存進來，造成「沒中獎卻要打右邊」→ 一次清掉（珠子保留）
      if ((s.ver || 1) < 2) st = null;
      // 進行到一半的東西（連莊、排隊中的保留、轉到一半的那一轉、沒打完的大獎）只有「按遊戲裡的首頁鈕回首頁」才接回去；
      // 關掉視窗／分頁、重新整理之後一律重新開始——留下來的只有持有珠數、統計和漫畫進度。
      // 使用者 2026-11-11：「上次的大獎繼續不要保留可以嗎？畢竟已經關閉視窗了，應該要重玩呀」
      // （pk_keep 記在 sessionStorage：首頁鈕重新載入前寫入，讀一次就清掉；關掉視窗它自己就不見了）
      var keep = false;
      try { keep = sessionStorage.getItem('pk_keep') === '1'; sessionStorage.removeItem('pk_keep'); } catch (e) { /* 沒有 sessionStorage 就當作沒有 */ }
      if (!keep) st = null;
      if (!st) return;
      G.mode = st.mode || 'normal'; G.modeSpins = st.modeSpins || 0; G.chain = st.chain || 0; G.chainPayout = st.chainPayout || 0;
      G.holds1 = []; G.holds2 = [];
      (st.holds1 || []).forEach(function (o) { G.holds1.push(reviveHold(o)); });
      (st.holds2 || []).forEach(function (o) { G.holds2.push(reviveHold(o)); });
      // 變動中斷電：該保留放回最前面重新變動（已計的轉數先扣回）
      if (st.cur) {
        var c = reviveHold(st.cur);
        (c.src === 2 ? G.holds2 : G.holds1).unshift(c);
        G.stats.total = Math.max(0, G.stats.total - 1); G.stats.since = Math.max(0, G.stats.since - 1);
        if (G.mode !== 'normal') G.modeSpins++;
      }
      G.resumeBonus = st.bonus || null;
      G.resumed = G.mode !== 'normal' || !!st.bonus || G.holds1.length + G.holds2.length > 0;
      // 接續上次的進度要等玩家真的動手（使用者 2026-11：「剛開始玩都還沒轉動，為什麼就開始轉」「我都還沒轉動你就中大獎」——
      // 按「繼續遊戲」之後手把還沒碰，上次留下的保留就自己一顆一顆轉、沒跑完的大獎自己一回合一回合跑掉）：
      //   留下的保留 → 等這次第一顆珠子進啟動口才開始轉（看起來就是「進洞才轉」，只是後面多排了幾顆）
      //   沒跑完的大獎 → 等這次打出第一顆才接著跑（見 mainLoop）
      G.holdWait = G.holds1.length + G.holds2.length > 0;
    } catch (e) { /* 存檔損壞時從頭開始 */ }
  };
  G.resetData = function () {
    G.balls = 0; G.invested = 0;
    G.mode = 'normal'; G.modeSpins = 0; G.chain = 0; G.chainPayout = 0; G.holds1 = []; G.holds2 = []; G.resumeBonus = null;   // 新遊戲：舊的待接續大獎也一起清掉
    G.holdWait = false;
    G.stats = { total: 0, since: 0, hits: 0, rushIn: 0, maxChain: 0, history: [], graph: [0], diff: 0, out: 0, safe: 0 };
    G.save();
  };

  // 實體珠模式：機台（上皿／下皿）提供 G.onPayout，鋼珠從出球口實際落下
  G.rent = function () {
    G.invested += PK.RENT.yen;
    if (G.onPayout) G.onPayout(PK.RENT.balls, 'rent'); else G.balls += PK.RENT.balls;
    Au.play('payout', { vol: 0.8 });
    G.save();
  };

  G.duelWin = function (n, dev) { addBalls(n, dev ? 'dev' : 'duel'); G.save(); };   // 投打對決贏到的珠子（從下方珠盤出來）；dev＝開發工具開的對決
  function addBalls(n, kind) {
    if (G.onPayout) G.onPayout(n, kind); else G.balls += n;
    G.stats.safe += n; G.stats.diff += n;
    // 漫畫進度＝累計贏得的珠數：機台吐出來的每一顆都算（進洞、大獎、投打對決）；買的珠子不走這裡。
    // 開發工具的測試大獎／測試對決不算（測試不留痕跡）
    if (PK.Manga && PK.Manga.addWon && kind !== 'dev' && !G.devRun && !G.devMode && !(G.bonus && G.bonus.dev)) PK.Manga.addWon(n);
    if (G.bonus && kind === 'attacker') { G.bonus.payout += n; G.chainPayout += n; }
  }
  // 發射一顆（實體珠模式由機台呼叫，只記錄統計）
  G.shots = 0;   // 這次開頁面以來打了幾發（接續上次的大獎要等第一發）
  G.noteLaunch = function () { G.shots++; G.stats.out++; G.stats.diff--; };

  // ---------- 發射扣球 ----------
  G.consume = function () {
    if (G.balls <= 0) return false;
    G.balls--; G.shots++; G.stats.out++; G.stats.diff--;
    return true;
  };

  // ---------- 保留 ----------
  function allotTable(src, mode) {
    if (mode === 'lt') return PK.ALLOT.lt;
    if (mode === 'rush' || mode === 'jitan') return PK.ALLOT.denchu;   // RUSH／時短改打左邊：啟動口中的獎也照 RUSH 的分配（全部繼續 RUSH）
    return src === 1 ? PK.ALLOT.heso : PK.ALLOT.denchu;
  }

  // 新手保證中大獎：還沒中過大獎的人，第 firstAt 轉（10～25 之間隨機）一定中，讓第一次玩的人先感受中大獎。
  // 每台裝置只保證一次（記在漫畫進度裡，按新遊戲不會重來）：漫畫改成看贏得的珠數之後，
  // 如果每次新遊戲都保證，一直按新遊戲就能幾分鐘刷一次十回合大獎
  function firstWinDue(src, mode) {
    var S = G.stats;
    if (PK.Manga && PK.Manga.state && PK.Manga.state.hits > 0) return false;
    if (mode !== 'normal' || src !== 1 || S.hits > 0 || G.inBonus) return false;
    if ((G.cur && G.cur.hit) || G.holds1.concat(G.holds2).some(function (h) { return h.hit; })) return false;   // 已經排了一顆會中的
    if (!S.firstAt) S.firstAt = 10 + Math.floor(Math.random() * 16);
    var nth = S.total + G.holds1.length + G.holds2.length + 1;   // 這顆保留會是第幾轉（total 已含正在轉的那一轉）
    return nth >= S.firstAt;
  }

  function buildHold(src) {
    var mode = G.mode;
    var r = Math.random();
    var force = G.force; G.force = null;
    // 新手保證的那一轉：九局下特別演出＋777（10 回合→進 RUSH），一次看到最熱血的中大獎
    if (!force && firstWinDue(src, mode)) force = { hit: true, pattern: 'spsp', push: 'long', allot: PK.ALLOT.heso[0] };
    var forced = !!(force && force.hit != null);
    var hit = forced ? force.hit : r < G.probFor(mode);
    var allot = null;
    if (hit) allot = force && force.allot ? force.allot : FX.weighted(allotTable(src, mode));
    var hc = (src === 1 ? G.holds1.length : G.holds2.length) + (G.spinning ? 1 : 0);
    var script = PK.Scripts.make(hit, allot, { mode: mode, src: src, holdCount: hc, force: force || {} });
    return { src: src, r: r, mode: mode, hit: hit, forced: forced, allot: allot, script: script, color: script.holdStart, id: Math.random() };
  }

  G.addHold = function (src, force) {
    G.holdWait = false;   // 這次已經有珠子進啟動口了：上次留下的保留可以開始轉（保留滿了、這顆加不進去也算）
    var arr = src === 1 ? G.holds1 : G.holds2;
    if (arr.length >= 4) { if (!force) return false; arr.pop(); }   // DEV 強制保留：滿了就擠掉最後一個
    if (force) G.force = force;
    var h = buildHold(src);
    if (force) arr.unshift(h); else arr.push(h);   // DEV 強制保留插到最前面，下一轉就是它
    if (PK.LCD) PK.LCD.onHoldAdded(h);
    return true;
  };

  // 開始變動時，若狀態已改變則重新判定（實機是在變動開始時判定當否）
  function finalizeHold(h) {
    if (h.mode === G.mode) return h;
    var hit = h.forced ? h.hit : h.r < G.probFor(G.mode);
    var allot = hit ? (h.hit && h.allot && G.mode !== 'lt' ? h.allot : FX.weighted(allotTable(h.src, G.mode))) : null;
    var keepColor = h.color;
    h.hit = hit; h.allot = allot; h.mode = G.mode;
    h.script = PK.Scripts.make(hit, allot, { mode: G.mode, src: h.src, holdCount: 0 });
    // 已經顯示的保留色不倒退
    var R = PK.Scripts.COLOR_RANK;
    if (R.indexOf(keepColor) > R.indexOf(h.script.holdColor) && hit) h.script.holdColor = keepColor;
    return h;
  }

  // ---------- 物理事件 ----------
  G.bindPhysics = function () {
    var P = PK.Phys;
    P.on('heso', function () {
      G.hesoHits = (G.hesoHits || 0) + 1;   // 給新手引導判斷「第一次打進啟動口」
      addBalls(PK.PAYOUT.heso);
      PK.BoardR.hesoGlow = 1;
      PK.BoardR.burst(PK.LAYOUT.heso.x, PK.LAYOUT.heso.y, null, 10);
      Au.play('heso', { vol: 0.7, minGap: 0.05 });
      G.addHold(1);
    });
    P.on('denchu', function () {
      addBalls(PK.PAYOUT.denchu);
      Au.play('heso', { vol: 0.5, rate: 1.25, minGap: 0.05 });
      G.addHold(2);
    });
    P.on('pocket', function (b, s) {
      addBalls(PK.PAYOUT.pocket);
      var pk = PK.LAYOUT.pockets[s.idx];
      PK.BoardR.burst(pk.x, pk.y, ['#66ddff', '#fff'], 14);
      if (PK.BoardR.pocketHit) PK.BoardR.pocketHit(s.idx);
      if (PK.BoardR.payPop) PK.BoardR.payPop(PK.PAYOUT.pocket, pk.x, pk.y - 22);
      Au.play('payout', { vol: 0.35, minGap: 0.1 });
    });
    P.on('attacker', function () {
      addBalls(PK.PAYOUT.attacker, 'attacker');
      Au.play('attacker', { vol: 0.6, minGap: 0.04 });
      var rp = PK.Phys.rampPts, HZ = PK.LAYOUT.heso;
      if (PK.NO_RIGHT) { PK.BoardR.hesoGlow = 1; PK.BoardR.burst(HZ.x, HZ.y, ['#ff3355', '#ffe066', '#fff'], 18); }   // 大獎進球＝進 START
      else PK.BoardR.burst((rp.t0[0] + rp.t1[0]) / 2, (rp.t0[1] + rp.t1[1]) / 2 + 8, ['#ff3355', '#ffe066', '#fff'], 18);
      if (PK.BoardR.kick) PK.BoardR.kick('#ffe066', 0.8);   // 每顆入賞整台燈閃一下
      if (PK.BoardR.payPop) { if (PK.NO_RIGHT) PK.BoardR.payPop(PK.PAYOUT.attacker, HZ.x, HZ.y - 40); else PK.BoardR.payPop(PK.PAYOUT.attacker); }
      if (G.bonus) G.bonus.count++;
    });
    // 大獎洞口蓋板開關瞬間把珠子彈開：金屬撞擊聲
    P.on('flapHit', function () { Au.play('tink' + ((Math.random() * 3) | 0), { vol: 0.55, minGap: 0.04 }); });
    P.on('gate', function () {
      Au.play('gate', { vol: 0.5, minGap: 0.05 });
      PK.BoardR.gateSpin = 8;
      if (G.futoHolds < 4) G.futoHolds++;
    });
    P.on('warp', function (b, sn) {
      PK.BoardR.warpGlow = 1;
      // 上方入口（圓弧頂正上方，要從兩根命釘中間掉進去）：進了就走螢幕前面的透明管直達舞台，給一聲提示
      if (sn && sn.wi) { Au.play('gate', { vol: 0.55, minGap: 0.05 }); if (PK.BoardR.kick) PK.BoardR.kick('#3fd2ff', 0.6); }
    });
    P.on('foul', function () { if (G.onPayout) G.onPayout(1, 'foul'); else G.balls++; G.stats.out--; G.stats.diff++; });
    P.on('tink', function () {
      if (Math.random() < 0.18) Au.play('tink' + Math.floor(Math.random() * 3), { vol: 0.12 + Math.random() * 0.1, minGap: 0.05 });
    });
  };

  // ---------- 普図（ゲート → 電チュー） ----------
  async function futoLoop() {
    for (;;) {
      await Clock.until(function () { return G.futoHolds > 0 && !G.futoBusy; });
      G.futoHolds--; G.futoBusy = true;
      var densapo = G.isDensapo();
      // 普図變動：電サポ中 0.5 秒、幾乎必中；通常時 5 秒、1/12
      G.futoLamp = true;
      await Clock.wait(densapo ? 500 : 5000);
      G.futoLamp = false;
      var hit = densapo ? Math.random() < 0.995 : Math.random() < 1 / 12;
      G.futoLast = { hit: hit, at: performance.now() };   // 給閘口旁的普圖燈顯示結果
      if (hit && !G.inBonus) {
        var opens = densapo ? 2 : 1;
        for (var i = 0; i < opens; i++) {
          PK.Phys.setDenchu(true);
          await Clock.wait(densapo ? PK.TIMING.denchuOpen / opens : 200);
          PK.Phys.setDenchu(false);
          await Clock.wait(250);
        }
      }
      G.futoBusy = false;
    }
  }

  // ---------- 主導演迴圈 ----------
  async function mainLoop() {
    // 停電復帰：等玩家觸碰開始後，恢復 RUSH 等狀態或接續大当り
    await Clock.until(function () { return !G.paused; });
    if (G.resumeBonus) {
      // 上次沒跑完的大獎：液晶先提示「大獎還沒跑完」，等玩家打出這次的第一顆才接著跑（goResume＝開發工具要求直接接）
      if (PK.Director.bonusWait) PK.Director.bonusWait(G.resumeBonus);
      await Clock.until(function () { return G.shots > 0 || G.goResume || !G.resumeBonus; });
    }
    if (G.resumeBonus) { var sb = G.resumeBonus; G.resumeBonus = null; await resumeBonus(sb); }
    else if (G.mode !== 'normal') PK.Director.restoreMode();
    for (;;) {
      await Clock.until(function () { return !G.inBonus && !G.paused && !G.cutscene && !G.holdWait && (G.holds2.length > 0 || G.holds1.length > 0); });   // cutscene：漫畫解鎖預告播放中，先不開下一轉；holdWait：上次留下的保留等這次第一顆進啟動口
      // 特図2 優先消化
      var h = G.holds2.length ? G.holds2.shift() : G.holds1.shift();
      finalizeHold(h);
      G.cur = h;
      G.spinning = true;
      G.stats.total++; G.stats.since++;
      if (G.mode !== 'normal') G.modeSpins = Math.max(0, G.modeSpins - 1);
      await PK.Director.runSpin(h);
      G.spinning = false;
      if (h.hit) {
        await runBonus(h);
      } else if (G.mode !== 'normal' && G.modeSpins <= 0) {
        await endMode();
      } else if (PK.Duel && PK.Duel.want(h)) {
        await PK.Duel.run({ hold: h });   // 聽牌落空：全畫面的投打對決（js/duel.js），打完才開下一轉
      }
      G.cur = null;
      G.save();
    }
  }

  // ---------- 自動打右邊 ----------
  // 中大獎後要一直進大獎洞口才會出珠；玩家不一定知道要轉手把，所以自動轉到最右，回到平常時再轉回原本力道
  G.autoRight = function () {
    var UI = PK.UI; if (!UI || !UI.setPower || PK.NO_RIGHT) return;   // 沒有右打：大獎中一樣打左邊，手把不動
    if (UI.power < 0.9 && G.leftPower == null) G.leftPower = UI.power;
    if (UI.U) UI.U.stopped = false;
    UI.setPower(0.96);
  };
  G.autoLeft = function () {
    var UI = PK.UI; if (!UI || !UI.setPower || G.leftPower == null) return;
    UI.setPower(G.leftPower); G.leftPower = null;
  };

  // ---------- 大當り ----------
  async function runBonus(h) {
    G.autoRight();
    var prevMode = G.mode;
    var a = h.allot;
    G.inBonus = true;
    G.stats.hits++;
    if (!G.devRun && PK.Manga && PK.Manga.noteHit) PK.Manga.noteHit();   // 這台裝置中過大獎了（新手保證只給一次）
    var fromNormal = prevMode === 'normal';
    if (fromNormal) { G.chain = 1; G.chainPayout = 0; } else { G.chain++; }
    G.stats.maxChain = Math.max(G.stats.maxChain, G.chain);
    G.stats.history.unshift({ spins: G.stats.since, rounds: a.rounds, next: a.next, mode: prevMode, sym: h.script.final[0], t: Date.now() });
    if (G.stats.history.length > 30) G.stats.history.pop();
    G.stats.since = 0;
    G.bonus = { round: 0, rounds: a.rounds, count: 0, payout: 0, next: a.next, prevMode: prevMode, lt: a.next === 'lt' || prevMode === 'lt' };
    if (G.devRun) G.bonus.dev = true;   // 開發工具的測試大獎：不存檔
    G.save();
    await PK.Director.bonusStart(h, G.bonus);
    await bonusRounds(1);
  }

  // DEV：結束測試，回到平常（清掉測試大獎之後的 RUSH／時短）
  G.endTest = function () {
    G.mode = 'normal'; G.modeSpins = 0; G.chain = 0; G.chainPayout = 0; G.devMode = false;
    PK.Director.restoreMode(); G.autoLeft(); if (PK.BoardR) PK.BoardR.rightArrow = false; G.save();
  };
  // DEV 測試：不用轉，直接 777 揃い → 跑真正的大当り（アタッカー真的開、真的出珠）
  G.testBonus = async function (allot, onRight) {
    G.inBonus = true;   // 擋住主迴圈開始新的變動
    var syms = (allot && allot.sym) || [7], sym = syms[Math.floor(Math.random() * syms.length)];   // 依這個中獎種類的圖柄隨機挑（不一定是 777）
    var h = { src: 1, hit: true, allot: allot, script: { final: [sym, sym, sym] } };
    G.devRun = true;
    try {
      await PK.Director.winAlign(h, false);
      if (onRight) onRight();
      await runBonus(h);
    } finally { G.devRun = false; G.devMode = true; }
  };

  // 停電復帰：從中斷的那一回合重新開始
  async function resumeBonus(sb) {
    G.inBonus = true;
    G.bonus = { round: sb.round, rounds: sb.rounds, count: 0, payout: sb.payout || 0, next: sb.next, prevMode: sb.prevMode, lt: sb.lt };
    G.mode = sb.prevMode || G.mode;
    G.autoRight();
    await PK.Director.bonusResume(G.bonus);
    await bonusRounds(Math.max(1, sb.round || 1));
  }

  async function bonusRounds(from) {
    var b = G.bonus;
    for (var r = from; r <= b.rounds; r++) {
      b.round = r; b.count = 0;
      G.save();
      await PK.Director.roundStart(b);
      PK.Phys.setAttacker(true);
      // 回合的時間只在玩家有在打的時候才算：手把沒轉、盤面上也沒有珠子的時候回合停著等，不會人還沒動手大獎就自己跑完
      // （開發工具的測試大獎照舊一直算，不用打也跑得完）。停著超過 6 秒，液晶提醒一次「轉動手把」
      var act = 0, idle = 0, last = Clock.now;
      await Clock.until(function () {
        var now = Clock.now, d = now - last; last = now;
        var playing = b.dev || !PK.UI || !PK.UI.firing || PK.UI.firing() || PK.Phys.balls.length > 0;
        if (playing) { act += d; idle = 0; }
        else { idle += d; if (idle > 6000) { idle = 0; if (PK.Director.bonusNudge) PK.Director.bonusNudge(b); } }
        return b.count >= PK.PAYOUT.attackerCount || act > PK.TIMING.roundMax;
      });
      PK.Phys.setAttacker(false);
      // 關閉後仍在洞口上方的球給予少許時間（オーバー入賞）
      await Clock.wait(r < b.rounds ? (PK.TIMING.roundGap || 4000) : 1200);   // 回合之間停約 4 秒（真台約 2～5 秒）
    }
    // 回合結束 → 決定下一個狀態
    var sp = G.specObj(), prevMode = b.prevMode;
    var nextMode = b.next;
    if (nextMode === 'rush' && prevMode === 'lt') nextMode = 'lt';
    var entering = nextMode !== prevMode;
    G.mode = nextMode;
    G.modeSpins = nextMode === 'rush' ? sp.stSpins : nextMode === 'lt' ? sp.ltSpins : sp.jitanSpins;
    if ((nextMode === 'rush' || nextMode === 'lt') && prevMode !== 'rush' && prevMode !== 'lt') G.stats.rushIn++;
    await PK.Director.bonusEnd(b, { entering: entering, prevMode: prevMode, nextMode: nextMode });
    G.bonus = null;
    G.inBonus = false;
    G.autoLeft();   // 只有大獎中打右邊：大獎一結束，手把轉回原本的力道（打左邊）
    if (PK.BoardR) PK.BoardR.rightArrow = false;   // 右打燈熄掉
    G.stats.graph.push(G.stats.diff);
    G.save();
  }

  async function endMode() {
    var prev = G.mode;
    await PK.Director.modeEnd(prev, { chain: G.chain, payout: G.chainPayout });
    G.autoLeft(); G.devMode = false;
    G.mode = 'normal'; G.modeSpins = 0;
    G.chain = 0; G.chainPayout = 0;
    G.stats.graph.push(G.stats.diff);
  }

  // 特図 7 段顯示的文字
  G.segState = function (src) {
    if (G.spinning && G.cur && G.cur.src === src) return String.fromCharCode(48 + Math.floor(Clock.now / 80) % 10) + '-';
    return '--';
  };

  // 定期記錄差玉
  setInterval(function () {
    var g = G.stats.graph;
    if (g[g.length - 1] !== G.stats.diff) { g.push(G.stats.diff); if (g.length > 400) g.splice(0, g.length - 400); }
  }, 5000);

  // 定期存檔（保留、持玉隨時在變）；關頁面時也存
  setInterval(function () { G.save(); }, 2000);
  window.addEventListener('pagehide', function () { G.save(); });
  // 切到別的分頁／別的 app 超過 5 秒再回來：排隊中的保留先停著，等下一顆珠子進啟動口才接著轉
  // （使用者 2026-11：「我離開 chrome 一段時間後再回來居然還會中大獎」——人一回來，機台不可以自己把剩下的保留轉完）
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { G.save(); G.hiddenAt = Date.now(); return; }
    if (G.hiddenAt && Date.now() - G.hiddenAt > 5000 && G.holds1.length + G.holds2.length > 0) G.holdWait = true;
    G.hiddenAt = 0;
  });

  G.start = function () {
    G.bindPhysics();
    futoLoop();
    mainLoop();
  };

  PK.Game = G;
})(window.PK);

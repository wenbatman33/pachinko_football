/* =========================================================
 * PK大逆转 — 正式版機台（PixiJS）
 * 外觀：已確認的範本（棒球主題，全畫面只有機台）
 * 遊戲：PK.Game（抽選・保留・回合・RUSH/時短/LT）＋ PK.Director（液晶演出，canvas 繪製後貼到液晶）
 * 鋼珠：實體珠（上皿／下皿堆疊、出球口落下、送球口發射、溢流、ドル箱）
 * ========================================================= */
(async function () {
  'use strict';
  const PK = window.PK, FX = PK.FX;
  // 一體成形機台：整台是一張照片（PK.UNI），機台大小＝圖片等比縮成 1000 寬；盤面位置由圖片的配置換算
  const UNI = PK.UNI || null;
  const MW = 1000, MH = UNI ? Math.round(UNI.ih * MW / UNI.iw) : 1880, HEADER_H = 150, UK = UNI ? MW / UNI.iw : 1;
  // 盤面：直立橢圓，外レール左右幾乎貼齊機台；上緣固定在標題列下方，下方台座縮小後盤面往下延伸
  const BS = UNI ? UNI.s * UK : 482 / (PK.LAYOUT.field.r + 7);
  const WIN_R = (PK.LAYOUT.field.r + 7) * BS;              // 盤面窗（含外レール）的水平半徑
  const WIN_RY = ((PK.LAYOUT.field.ry || PK.LAYOUT.field.r) + 7) * BS;
  const BX = UNI ? UNI.ox * UK : MW / 2 - PK.LAYOUT.field.cx * BS;
  const BY = UNI ? UNI.oy * UK : 194 + WIN_RY - PK.LAYOUT.field.cy * BS;
  const WIN_CY = BY + PK.LAYOUT.field.cy * BS, WIN_TOP = WIN_CY - WIN_RY;
  const BH = PK.LAYOUT.board.h;
  const DEG = Math.PI / 180;
  const hex = (c) => (typeof c === 'number' ? c : parseInt(String(c || '#ffffff').replace('#', '').padEnd(6, 'f').slice(0, 6), 16));

  // ---------------------------------------------------------
  // Pixi
  // ---------------------------------------------------------
  // 手機（PK.LOW，見 js/v2/config2.js）：繪圖解析度上限 1.5、不開反鋸齒（畫素少四成多，手機的顯示晶片才跟得上）
  const app = new PIXI.Application({ resizeTo: window, backgroundColor: 0x050308, antialias: !PK.LOW, autoDensity: true, resolution: Math.min(window.devicePixelRatio || 1, PK.LOW ? 1.5 : 2) });
  document.getElementById('app').appendChild(app.view);
  const M = new PIXI.Container(); app.stage.addChild(M);
  // 整個螢幕在機台座標裡的範圍（x0、y0、w、h）、機台可用區的高度 ch、要避開的瀏海／底部橫條（safeT、safeB）；fit 每次重算
  // 首頁與機台後面的背景靠它跟著螢幕比例排版——機台本身是固定 2:3 的一張圖，只能整台縮放
  const VIEW = { s: 1, x0: 0, y0: 0, w: MW, h: MH, ch: MH, safeT: 0, safeB: 0 };
  const safeProbe = document.createElement('div'); document.body.appendChild(safeProbe);
  safeProbe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)';
  function fit() {
    if (app.resize) app.resize();   // 先讓 Pixi 立即套用新視窗大小（它本身會延到下一格才更新）
    // 開發面板打開時機台讓位：寬螢幕讓出右側 360px，窄螢幕讓出下方 55%
    const dev = document.body.classList.contains('dev-open'), narrow = window.innerWidth <= 760;
    let sw = app.screen.width - (dev && !narrow ? 360 : 0), sh = app.screen.height * (dev && narrow ? 0.45 : 1), top = 0;
    // 邊玩邊看漫畫：閱讀器佔右邊（寬螢幕）或上面（瘦長螢幕），機台縮到剩下的那一塊繼續玩（位置與大小由 js/manga.js 的 dock 決定）
    const dk = PK.Manga && PK.Manga.dock ? PK.Manga.dock(sw, sh) : null;
    if (dk) { if (dk.side === 'right') sw -= dk.size; else { top = dk.size; sh -= dk.size; } }
    // 機台上方留一整條給功能列（看漫畫、首頁、音樂、音效；js/manga.js 的 Mg.barH——進遊戲後才有，首頁與漫畫全螢幕時是 0）
    const barH = PK.Manga && PK.Manga.barH ? PK.Manga.barH() : 0; top += barH; sh -= barH;
    const cs = getComputedStyle(safeProbe), sT = parseFloat(cs.paddingTop) || 0, sB = parseFloat(cs.paddingBottom) || 0;
    // 直立的手機（寬不到 600、高超過寬的 1.5 倍）：機台下方一定有一條操作列（js/dock.js：珠數、購買、力度條）。
    // 「功能列＋機台＋操作列」整組排在安全區（避開動態島與底部橫條／瀏覽器工具列）裡上下置中；高度不夠就把機台縮小一點，操作列不會消失。
    // 第一版是「剩下的空間夠才顯示」：手機瀏覽器回報的上下安全區比預期大，算出來差幾個像素就整條不出現
    // （2026-11-12 使用者手機上、連無痕模式都看不到力度條）
    const DOCK_H = 58, phone = barH > 0 && !dk && sw < 600 && app.screen.height > sw * 1.5;
    const availH = phone ? Math.max(200, sh - sT - sB - DOCK_H) : sh, s = Math.min(sw / MW, availH / MH), dockOn = phone;
    M.scale.set(s); M.x = (sw - MW * s) / 2; M.y = dockOn ? top + sT + (availH - MH * s) / 2 : top + (sh - MH * s) / 2;
    PK.DockSpace = dockOn ? { x: M.x, w: MW * s, y: M.y + MH * s, h: DOCK_H } : null;
    VIEW.s = s; VIEW.x0 = -M.x / s; VIEW.y0 = -M.y / s; VIEW.w = app.screen.width / s; VIEW.h = app.screen.height / s; VIEW.ch = sh / s;
    VIEW.safeT = (parseFloat(cs.paddingTop) || 0) / s; VIEW.safeB = (parseFloat(cs.paddingBottom) || 0) / s;
    if (fit.after) fit.after();   // 背景與首頁跟著重排（它們比較晚才建立）
  }
  window.addEventListener('resize', () => setTimeout(fit, 30));

  // ---------------------------------------------------------
  // 素材（PK.Assets 也供液晶使用）
  // ---------------------------------------------------------
  // 載入畫面（index.html 的 #loading，樣式在 css/style.css）：首頁的主視覺與標誌＋漫畫風進度條
  // 進度分段：圖片 0～88%、兩段字型各一小段、整台建好才到 100%（原本圖片載完就 100%，後面還要等字型好幾秒，看起來像卡住）
  const ldEl = document.getElementById('loading'), bar = document.getElementById('loadBar'), ldPct = document.getElementById('loadPct');
  let ldP = 0, ldDemo = 0;
  const setLoad = (p, force) => { ldP = force ? p : Math.max(ldP, p); const t = Math.round(ldP * 100) + '%'; if (bar) bar.style.width = t; if (ldPct) ldPct.textContent = t; };
  // 進度條的位置與大小（PK.HOME.load，機台座標）→ 樣式變數；預設值跟 css/style.css 寫的一樣，所以平常畫面不會跳
  function layoutLoad() {
    const L = PK.HOME && PK.HOME.load; if (!L) return;
    const st = document.documentElement.style;
    st.setProperty('--ld-y', L.y); st.setProperty('--ld-w', L.w); st.setProperty('--ld-h', L.h); st.setProperty('--ld-size', L.size);
  }
  layoutLoad();
  await PK.Assets.load((p) => setLoad(p * 0.88));
  try { await Promise.race([document.fonts.load('400 60px "Dela Gothic One"'), new Promise((r) => setTimeout(r, 2500))]); } catch (e) { /* 忽略 */ }
  setLoad(0.92);
  // 繁中字型（Google Fonts 按字分批下載）：先把遊戲程式裡用到的中文字全部載好，再做畫面；最多等 4 秒
  try {
    const srcs = Array.from(document.scripts).map((s) => s.src).filter((u) => u && u.indexOf(location.origin) === 0);
    const txt = (await Promise.all(srcs.map((u) => fetch(u).then((r) => r.text()).catch(() => '')))).join('');
    const chars = Array.from(new Set(txt.match(/[\u3000-\u9fff\uff00-\uffef]/g) || [])).join('');
    await Promise.race([Promise.all([document.fonts.load('900 40px "Noto Sans SC"', chars), document.fonts.load('700 40px "Noto Sans SC"', chars)]), new Promise((r) => setTimeout(r, 4000))]);
  } catch (e) { /* 字型載不到就用系統字型 */ }
  setLoad(0.96);
  const T = {};
  Object.keys(PK.IMAGES).forEach((k) => { const im = PK.Assets.get(k); if (im) T[k] = PIXI.Texture.from(im); });
  const cv = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c; };
  const texC = (w, h, fn) => PIXI.Texture.from(cv(w, h, fn));
  // 機台後面的背景（店內走道，素材 parlor_bg）：螢幕比例跟機台（2:3）不一樣時，多出來的上下或左右不再是一片黑
  // （使用者 2026-11-10：「為什麼這個遊戲沒有自適應版面」——手機直立時上下約三成是空的）
  // 本來就是失焦的背景，用縮小的畫布當貼圖就夠（手機省顯示記憶體），順便壓暗讓機台跳出來
  const backdrop = new PIXI.Container(); app.stage.addChildAt(backdrop, 0);
  {
    const im = PK.Assets.get('parlor_bg');
    if (im) {
      const bw = 640, bh = Math.round(640 * im.height / im.width);
      const sp = new PIXI.Sprite(texC(bw, bh, (g) => { g.drawImage(im, 0, 0, bw, bh); g.fillStyle = 'rgba(8,3,12,0.5)'; g.fillRect(0, 0, bw, bh); }));
      sp.anchor.set(0.5); backdrop.addChild(sp); backdrop.sp = sp;
    }
  }
  const fitBackdrop = () => { const sp = backdrop.sp; if (!sp) return; const W = app.screen.width, H = app.screen.height; sp.scale.set(Math.max(W / sp.texture.width, H / sp.texture.height)); sp.position.set(W / 2, H / 2); };
  fit.after = fitBackdrop;
  T.glow = texC(128, 128, (g) => { const r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.6)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
  T.ball = texC(64, 64, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.ellipse(36, 40, 26, 26, 0, 0, 6.28); g.fill();
    const r = g.createRadialGradient(24, 20, 2, 32, 32, 30);
    r.addColorStop(0, '#ffffff'); r.addColorStop(0.18, '#f1f5fb'); r.addColorStop(0.45, '#9aa6b8'); r.addColorStop(0.75, '#3e4656'); r.addColorStop(0.92, '#7c879a'); r.addColorStop(1, '#c9d2e2');
    g.fillStyle = r; g.beginPath(); g.arc(32, 32, 29, 0, 6.28); g.fill();
    g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,120,60,0.18)'; g.beginPath(); g.ellipse(40, 46, 14, 7, -0.5, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(22, 18, 7, 4, -0.6, 0, 6.28); g.fill();
  });
  T.nail = texC(32, 32, (g) => {
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(19, 21, 9, 6, 0.4, 0, 6.28); g.fill();
    const r = g.createRadialGradient(13, 12, 1, 16, 16, 9);
    r.addColorStop(0, '#fffbe8'); r.addColorStop(0.4, '#e6c068'); r.addColorStop(0.85, '#8a6418'); r.addColorStop(1, '#4a3208');
    g.fillStyle = r; g.beginPath(); g.arc(16, 16, 8, 0, 6.28); g.fill();
  });
  // 新版（v2.html）的釘子：真實比例的黃銅釘頭，有倒角、高光與落在盤面上的影子（舊版不用這張）
  T.nail2 = texC(96, 96, (g) => {
    const sh = g.createRadialGradient(56, 60, 2, 56, 60, 30); sh.addColorStop(0, 'rgba(0,0,0,0.6)'); sh.addColorStop(0.55, 'rgba(0,0,0,0.3)'); sh.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sh; g.beginPath(); g.ellipse(58, 62, 30, 24, 0.6, 0, 6.28); g.fill();
    const rim = g.createLinearGradient(26, 26, 70, 70); rim.addColorStop(0, '#fff3c4'); rim.addColorStop(0.5, '#b8862a'); rim.addColorStop(1, '#4e3306');
    g.fillStyle = rim; g.beginPath(); g.arc(48, 48, 23, 0, 6.28); g.fill();
    const r = g.createRadialGradient(40, 38, 2, 48, 48, 21); r.addColorStop(0, '#fffdf0'); r.addColorStop(0.25, '#ffe9a0'); r.addColorStop(0.6, '#e0ae45'); r.addColorStop(1, '#8f6516');
    g.fillStyle = r; g.beginPath(); g.arc(48, 48, 19.5, 0, 6.28); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.95)'; g.beginPath(); g.ellipse(41, 39, 6.5, 4, -0.7, 0, 6.28); g.fill();
    g.strokeStyle = 'rgba(60,36,4,0.55)'; g.lineWidth = 1.5; g.beginPath(); g.arc(48, 48, 23, 0, 6.28); g.stroke();
  });
  T.ray = texC(512, 64, (g) => { const r = g.createLinearGradient(0, 0, 512, 0); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.moveTo(0, 28); g.lineTo(512, 0); g.lineTo(512, 64); g.lineTo(0, 36); g.fill(); });

  // ---------------------------------------------------------
  // 補間、粒子
  // ---------------------------------------------------------
  const EASE = { lin: (t) => t, out: (t) => 1 - Math.pow(1 - t, 3), in: (t) => t * t * t, inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2), back: (t) => { const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); } };
  const tweens = [], waits = [];
  const setP = (o, k, v) => { if (k === 's') o.scale.set(v); else if (k === 'sx') o.scale.x = v; else if (k === 'sy') o.scale.y = v; else o[k] = v; };
  const getP = (o, k) => (k === 's' || k === 'sx' ? o.scale.x : k === 'sy' ? o.scale.y : o[k]);
  function tween(o, to, dur, ease, delay) { return new Promise((res) => tweens.push({ o, to, dur: Math.max(0.001, dur), ease: EASE[ease || 'out'], t: -(delay || 0), from: null, res })); }
  function wait(sec) { return new Promise((res) => waits.push({ t: sec, res })); }
  function stepTime(dt) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i]; w.t += dt; if (w.t < 0) continue;
      if (w.o.destroyed) { tweens.splice(i, 1); w.res(); continue; }
      if (!w.from) { w.from = {}; for (const k in w.to) w.from[k] = getP(w.o, k); }
      const k = Math.min(1, w.t / w.dur), e = w.ease(k);
      for (const p in w.to) setP(w.o, p, w.from[p] + (w.to[p] - w.from[p]) * e);
      if (k >= 1) { tweens.splice(i, 1); w.res(); }
    }
    for (let i = waits.length - 1; i >= 0; i--) { waits[i].t -= dt; if (waits[i].t <= 0) { const r = waits[i].res; waits.splice(i, 1); r(); } }
  }
  function Particles(parent) {
    const c = new PIXI.Container(); parent.addChild(c);
    const list = [];
    return {
      c,
      emit(o) {
        for (let i = 0; i < (o.n || 20); i++) {
          const sp = new PIXI.Sprite(T.glow); sp.anchor.set(0.5); sp.blendMode = PIXI.BLEND_MODES.ADD;
          sp.tint = Array.isArray(o.color) ? o.color[(Math.random() * o.color.length) | 0] : (o.color || 0xffd23f);
          const a = Math.random() * Math.PI * 2, v = (o.vmin || 80) + Math.random() * ((o.vmax || 400) - (o.vmin || 80)), s = (o.smin || 0.06) + Math.random() * ((o.smax || 0.16) - (o.smin || 0.06));
          sp.position.set(o.x, o.y); sp.scale.set(s); c.addChild(sp);
          list.push({ sp, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: o.g != null ? o.g : 300, life: (o.life || 0.8) * (0.6 + Math.random() * 0.6), t: 0 });
        }
      },
      update(dt) {
        for (let i = list.length - 1; i >= 0; i--) {
          const p = list[i]; p.t += dt;
          if (p.t >= p.life) { p.sp.destroy(); list.splice(i, 1); continue; }
          p.vy += p.g * dt; p.sp.x += p.vx * dt; p.sp.y += p.vy * dt; p.sp.alpha = Math.min(1, (1 - p.t / p.life) * 1.8);
        }
      },
    };
  }

  const Au = PK.Audio; Au.init();
  const play = (k, o) => Au.play(k, o);

  // ---------------------------------------------------------
  // 機台本體、頂部標題列、資料燈
  // ---------------------------------------------------------
  M.addChild(new PIXI.Graphics().beginFill(0x120a16).drawRoundedRect(0, 0, MW, MH, 34).endFill().lineStyle(6, 0x3a3348, 1).drawRoundedRect(3, 3, MW - 6, MH - 6, 32));

  // ---------------------------------------------------------
  // 盤面（可重建：DEV 調整版面後重畫）
  // ---------------------------------------------------------
  const L = PK.LAYOUT;
  // 外框裝飾圖墊在盤面「後面」：盤面本身是藥丸形、蓋在上面，只露出四個角的裝飾；邊緣的鍍鉻框由程式沿藥丸形畫（buildBoard 裡的 bezel）
  // 一體成形機台：整台照片當底圖（外殼、盤面印刷、零件、台座都在上面）
  if (UNI && T[UNI.img]) { const mf = new PIXI.Sprite(T[UNI.img]); mf.width = MW; mf.height = MH; M.addChild(mf); }
  const CAB = !UNI && !!T.cabinet_frame;
  if (CAB) {
    // 機台外殼（cabinet_frame.webp）：上段＝喇叭＋吉祥物＋紅色招牌（標題列位置），窗口藏在盤面後面，只露出四個角。
    // 圖的窗口是扁拱形、比盤面窄，所以把窗口中段直邊切掉一截（三段拼接），讓上下拱都落在藥丸形盤面裡面
    const im = T.cabinet_frame, iw = im.width, ih = im.height, k = MW / iw * 1.024, fx = (MW - iw * k) / 2;
    const cut1 = 0.5, archB = 0.7, yTopEnd = cut1 * ih * k;
    const yArchB = WIN_CY + WIN_RY - WIN_R,   // 盤面下半圓的圓心高度＝圖中下拱起點（v 0.7）要對到的位置
          cut2 = archB - (yArchB - yTopEnd) / (ih * k);
    const deckTop0 = Math.round(WIN_CY + WIN_RY + 40), cabC = new PIXI.Container(); M.addChild(cabC);
    { const cm = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(0, 0, MW, deckTop0 + 12, 34).endFill(); M.addChild(cm); cabC.mask = cm; }
    const part = (v0, v1, y, h) => { const t = new PIXI.Texture(im.baseTexture, new PIXI.Rectangle(0, Math.round(v0 * ih), iw, Math.round((v1 - v0) * ih))); const sp = new PIXI.Sprite(t); sp.position.set(fx, y); sp.width = iw * k; sp.height = h; cabC.addChild(sp); return sp; };
    part(0, cut1, 0, yTopEnd);                                   // 上段：喇叭、吉祥物、招牌、上拱
    part(cut2, archB, yTopEnd, yArchB - yTopEnd);                // 直邊（切短）
    part(archB, 1, yArchB, deckTop0 + 12 - yArchB);              // 下拱：拉到台座上緣
  } else if (!UNI && (T.face_panel_oval || T.face_panel)) {
    const oval = !!T.face_panel_oval, fp = new PIXI.Sprite(oval ? T.face_panel_oval : T.face_panel);
    const wR = (PK.LAYOUT.field.r + 7) * BS;
    if (oval) { fp.anchor.set(0.4995, 0.4887); fp.width = wR * 2 / 0.7861; fp.height = WIN_RY * 2 / 0.7758; }
    else { fp.anchor.set(0.5); fp.width = wR / 0.40; fp.height = WIN_RY / 0.40; }
    fp.position.set(MW / 2, WIN_CY); M.addChild(fp);
    const fpm = new PIXI.Graphics().beginFill(0xffffff).drawRect(6, 0, MW - 12, MH).endFill(); M.addChild(fpm); fp.mask = fpm;
  }
  const B = new PIXI.Container(); B.position.set(BX, BY); B.scale.set(BS); M.addChild(B);
  const boardBase = new PIXI.Container(); B.addChild(boardBase);
  // 液晶（PK.LCD 的 canvas 貼圖）
  const lcdBox = new PIXI.Container(); B.addChild(lcdBox);
  const lcdMask = new PIXI.Graphics(); lcdBox.addChild(lcdMask);
  PK.LCD.init(); PK.LCD.attract = true;
  const lcdTex = PIXI.Texture.from(PK.LCD.canvas);
  const lcdSprite = new PIXI.Sprite(lcdTex); lcdBox.addChild(lcdSprite); lcdSprite.mask = lcdMask;
  const partsLayer = new PIXI.Container(); B.addChild(partsLayer);
  const nailLayer = new PIXI.Container(); B.addChild(nailLayer);
  const yaku = new PIXI.Sprite(T.yaku_ball || PIXI.Texture.WHITE); yaku.anchor.set(0.5); yaku.visible = false; B.addChild(yaku);   // 盤面上不放（會凸進球路、珠子會穿過去）；中獎時的機關降臨動畫另外疊在整台上
  const ballLayer = new PIXI.Container(); B.addChild(ballLayer);
  const warpFront = new PIXI.Container(); B.addChild(warpFront);   // ワープ透明管的正面反光（蓋在珠子上面，看起來珠子在管子裡）
  // 液晶前景層（文字、演出、比分板、保留燈）：疊在ワープ入口與透明管上面，液晶上的字永遠不會被擋到；背景與轉輪留在下層
  const lcdTopBox = new PIXI.Container(); B.addChild(lcdTopBox);
  const lcdTopMask = new PIXI.Graphics(lcdMask.geometry); lcdTopBox.addChild(lcdTopMask);   // 跟液晶共用同一個遮罩形狀
  const lcdTopTex = PIXI.Texture.from(PK.LCD.canvasTop);
  const lcdTopSprite = new PIXI.Sprite(lcdTopTex); lcdTopBox.addChild(lcdTopSprite); lcdTopSprite.mask = lcdTopMask;
  lcdTopBox.eventMode = 'none';   // 平常不吃點擊；漫畫預告時才打開（點液晶立刻閱讀）
  lcdTopBox.on('pointerdown', (e) => { if (PK.Manga && PK.Manga.tapLcd()) e.stopPropagation(); });
  // 透明管是實體零件，整組（管子背面 → 管子裡的珠子 → 管子正面 → 洞口）永遠疊在螢幕前面，連液晶的前景層（演出、面板）也蓋不到它。
  // 使用者 2026-11：「洞口怎麼會被螢幕蓋住？」「軌道被螢幕遮住啦」——原本管子夾在液晶背景層和前景層中間，大獎的畫面一出來整條管子就不見了。
  // 換過來之後，液晶上的面板和字要自己讓開管子經過的地方（左下緣、右緣、右上緣），見 js/lcd.js、js/director.js
  const tubeBack = new PIXI.Container(); B.addChild(tubeBack);
  const tubeBalls = new PIXI.Container(); B.addChild(tubeBalls);
  B.addChild(warpFront);   // 重新加一次＝移到最上面
  const holeLayer = new PIXI.Container(); B.addChild(holeLayer);
  [tubeBack, tubeBalls, warpFront, holeLayer].forEach((c) => { c.eventMode = 'none'; });
  const boardParts = Particles(B);
  const bezel = new PIXI.Graphics(); B.addChild(bezel);   // 盤面外圈鍍鉻框（藥丸形）
  const tube = new PIXI.Graphics(); tube.blendMode = PIXI.BLEND_MODES.ADD; B.addChild(tube);   // 鍍鉻框上的 LED 燈管（一整圈，顏色跟著整台狀態變）
  const devSprite = new PIXI.Sprite(); B.addChild(devSprite);
  const devCanvas = cv(800, BH, () => {}); devSprite.texture = PIXI.Texture.from(devCanvas); devSprite.visible = false;

  const BD = {}; // 盤面可動零件的參照
  function paintBoard() {
    return cv(1600, BH * 2, (g) => {
      g.scale(2, 2);
      const F = L.field;
      const FRY = F.ry || F.r;
      const bg = g.createRadialGradient(F.cx, F.cy, 40, F.cx, F.cy, FRY + 40);
      bg.addColorStop(0, '#1d2a52'); bg.addColorStop(0.7, '#101633'); bg.addColorStop(1, '#070915');
      g.save(); g.beginPath(); for (let a = 0; a <= 360; a += 2) { const q = PK.ellPt(a, -4); if (a) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.closePath(); g.clip();   // 藥丸形（外面透明）
      g.fillStyle = bg; g.fillRect(0, 0, 800, BH);
      const cel = PK.Assets.get('board_cel2'), im = cel || PK.Assets.get('board_field') || PK.Assets.get('board_art');
      if (im) {
        // 底圖的本壘板（board_cel2 在圖內 50%, 69%；board_field 約 50%, 84%）對到ヘソ；縮放要保證圖底蓋過盤面底部
        const HU = 0.5, HV = cel ? 0.69 : 0.8398, hx = L.heso.x, hy = L.heso.y + 4;
        const s = Math.max(870 / im.width,
          (F.cy + FRY + 4 - hy) / ((1 - HV) * im.height), (hy - (F.cy - FRY - 4)) / (HV * im.height),   // 上下蓋滿
          (hx - (F.cx - F.r - 4)) / (HU * im.width), (F.cx + F.r + 4 - hx) / ((1 - HU) * im.width));    // 左右蓋滿
        g.globalAlpha = 0.95; g.drawImage(im, hx - HU * im.width * s, hy - HV * im.height * s, im.width * s, im.height * s); g.globalAlpha = 1;
      }
      const vg = g.createRadialGradient(F.cx, F.cy, 160, F.cx, F.cy, FRY);
      vg.addColorStop(0, 'rgba(5,8,25,0.1)'); vg.addColorStop(1, 'rgba(5,8,25,0.45)');
      g.fillStyle = vg; g.fillRect(0, 0, 800, BH);
      const ir = L.innerRail, irIn = F.r - ir.r;
      g.strokeStyle = 'rgba(0,0,0,0.6)'; g.lineWidth = irIn;
      g.beginPath(); for (let a = ir.from; a <= ir.to + 0.01; a += 2) { const q = PK.ellPt(a, irIn / 2); if (a > ir.from) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); } g.stroke();
      const w = L.warp;
      g.fillStyle = '#000'; g.beginPath(); g.arc(w.x, w.y, w.r + 2, 0, 6.28); g.fill(); g.strokeStyle = '#3fd2ff'; g.lineWidth = 2; g.stroke();
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(F.cx, L.out.y - 6, 50, 16, 0, 0, 6.28); g.fill();
      g.restore();
    });
  }
  function sprite(key, x, y, w, parent, anchorY) {
    if (!T[key]) return null;
    const sp = new PIXI.Sprite(T[key]); sp.anchor.set(0.5, anchorY == null ? 0.5 : anchorY); sp.position.set(x, y);
    sp.width = w; sp.height = w * T[key].height / T[key].width; (parent || partsLayer).addChild(sp); return sp;
  }
  function tulip(x, y, w, big, col) {
    const g = new PIXI.Graphics(), hw = w / 2 + 2, e = big ? 14 : 9;
    g.beginFill(col).lineStyle(1.5, 0x3a2600, 1).moveTo(x - hw - e, y - 3).quadraticCurveTo(x - hw - 4, y + 22, x, y + (big ? 26 : 19)).quadraticCurveTo(x + hw + 4, y + 22, x + hw + e, y - 3)
      .lineTo(x + hw, y - 3).lineTo(x + hw, y + 12).lineTo(x - hw, y + 12).lineTo(x - hw, y - 3).closePath().endFill();
    g.beginFill(0x05030a).drawRect(x - hw + 1.5, y - 2, hw * 2 - 3, 12).endFill();
    partsLayer.addChild(g); return g;
  }

  // 透明管：入口（金框＋藍光環＋跑馬燈）→ 透明壓克力管 → 舞台。可以有很多條（PK.Phys.warpList）：
  //   第 0 條＝液晶左邊框的入口 → 沿液晶左下緣 → 舞台左端
  //   第 1 條＝圓弧頂正上方的入口 → 沿圓弧頂內側、液晶右緣（走在螢幕前面）→ 舞台右端
  // 珠子在管子裡全程看得到；管子中央一排箭頭燈指出流向，有珠子在跑時箭頭會追著亮
  function buildWarpTube() {
    [warpFront, holeLayer, tubeBack].forEach((ly) => ly.removeChildren().forEach((c) => c.destroy({ children: true })));
    BD.tubes = [];
    const list = PK.Phys.warpList || (PK.Phys.warpPath ? [{ path: PK.Phys.warpPath, at: L.warp }] : []);
    list.forEach((W0) => {
      const WP = W0.path, wq = W0.at, HR = wq.r + 2, TW = 11;   // HR＝洞口半徑（跟物理開口一樣大）、TW＝管子半寬
      if (!WP) return;
      const TB = { arrows: [], ring: [], glow: null }; BD.tubes.push(TB);
      const s0 = HR + 2, along = (s) => PK.pathAt(WP, s);
      // 從入口邊緣到出口，取樣點＋法線，畫兩側管壁
      const samp = []; for (let s = s0; s <= WP.len + 0.01; s += 3) samp.push(along(Math.min(s, WP.len)));
      const side = (k) => samp.map((q) => [q[0] - Math.sin(q[2]) * k, q[1] + Math.cos(q[2]) * k]);
      const poly = (gr, pts) => { gr.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) gr.lineTo(pts[i][0], pts[i][1]); };
      // 管子背面：先壓暗液晶（管子在畫面上清楚分得出來），再一層淡藍的壓克力
      const back = new PIXI.Graphics(); tubeBack.addChild(back);
      back.lineStyle({ width: TW * 2 + 8, color: 0x000814, alpha: 0.5, cap: 'round', join: 'round' }); poly(back, samp);
      back.lineStyle({ width: TW * 2, color: 0x0d3a5c, alpha: 0.55, cap: 'round', join: 'round' }); poly(back, samp);
      const glowG = new PIXI.Graphics(); glowG.blendMode = PIXI.BLEND_MODES.ADD; tubeBack.addChild(glowG);
      [-TW, TW].forEach((k) => { glowG.lineStyle({ width: 7, color: 0x3fd2ff, alpha: 0.28, join: 'round' }); poly(glowG, side(k)); });
      // 箭頭燈（›）：沿管子中央，每 20 一個
      for (let s = s0 + 12; s < WP.len - 8; s += 20) {
        const q = along(s), a = new PIXI.Graphics();
        a.lineStyle({ width: 3, color: 0xffffff, alpha: 1, cap: 'round', join: 'round' }).moveTo(-4, -5).lineTo(2, 0).lineTo(-4, 5);
        a.position.set(q[0], q[1]); a.rotation = q[2]; a.tint = 0x7fe3ff; a.alpha = 0.35; a.s = s; tubeBack.addChild(a); TB.arrows.push(a);
      }
      // 入口：深洞＋藍光環＋金框，外圈一圈跑馬燈。畫在最上層（holeLayer，比液晶的前景層還上面）——
      // 洞口是實體零件，不可以被螢幕蓋住（使用者 2026-11：「洞口怎麼會被螢幕蓋住？」原本液晶在演出時會蓋掉右半個洞口）
      const mouthGlow = new PIXI.Sprite(T.glow); mouthGlow.anchor.set(0.5); mouthGlow.position.set(wq.x, wq.y); mouthGlow.width = mouthGlow.height = (HR + 16) * 2.6; mouthGlow.tint = 0x3fd2ff; mouthGlow.blendMode = PIXI.BLEND_MODES.ADD; mouthGlow.alpha = 0.55; holeLayer.addChild(mouthGlow); TB.glow = mouthGlow;
      const m = new PIXI.Graphics(); holeLayer.addChild(m);
      m.beginFill(0x000000, 0.45).drawCircle(wq.x + 1.5, wq.y + 2.5, HR + 9).endFill();   // 落影
      m.beginFill(0x3a2400).drawCircle(wq.x, wq.y, HR + 9).endFill();
      m.beginFill(0xf2c44a).drawCircle(wq.x, wq.y, HR + 8).endFill();
      m.beginFill(0xa8700f).drawCircle(wq.x, wq.y + 0.8, HR + 5.2).endFill();
      m.beginFill(0xffe9a0).drawCircle(wq.x - 0.6, wq.y - 0.8, HR + 4.6).endFill();   // 金框內緣高光
      m.beginFill(0x3fd2ff).drawCircle(wq.x, wq.y, HR + 3.4).endFill();
      m.beginFill(0x020308).drawCircle(wq.x, wq.y, HR).endFill();
      const q1 = along(s0 + 6);
      m.beginFill(0x0d3a5c, 0.9).drawEllipse(wq.x + Math.cos(q1[2]) * HR * 0.4, wq.y + Math.sin(q1[2]) * HR * 0.4, HR * 0.55, HR * 0.4).endFill();   // 洞裡看得到通道口（朝管子的方向）
      m.lineStyle(1.6, 0xffffff, 0.55).arc(wq.x, wq.y, HR + 6.6, Math.PI * 1.05, Math.PI * 1.55);   // 金框左上反光
      for (let i = 0; i < 14; i++) {
        const a = i / 14 * Math.PI * 2, d = new PIXI.Sprite(T.glow); d.anchor.set(0.5); d.position.set(wq.x + Math.cos(a) * (HR + 6.6), wq.y + Math.sin(a) * (HR + 6.6));
        d.scale.set(0.075); d.tint = 0xbff3ff; d.blendMode = PIXI.BLEND_MODES.ADD; holeLayer.addChild(d); TB.ring.push(d);
      }
      // 管子正面（在珠子上面）：兩側管壁亮邊＋玻璃反光＋金色固定夾
      const fr = new PIXI.Graphics(); warpFront.addChild(fr);
      [-TW, TW].forEach((k) => { fr.lineStyle({ width: 2.4, color: 0xa8ecff, alpha: 0.95, join: 'round' }); poly(fr, side(k)); });
      fr.lineStyle({ width: 2.2, color: 0xffffff, alpha: 0.32, join: 'round' }); poly(fr, side(-TW + 4));
      (L.bezel ? [] : WP.len > 500 ? [0.12, 0.3, 0.48, 0.66, 0.84, 0.95] : [0.3, 0.62, 0.9]).forEach((f) => {   // 球道做在螢幕外框裡的時候不需要固定夾
        const q = along(s0 + (WP.len - s0) * f), nx = -Math.sin(q[2]), ny = Math.cos(q[2]), tx = Math.cos(q[2]) * 3, ty = Math.sin(q[2]) * 3;
        fr.lineStyle(0).beginFill(0xd9a636).drawPolygon([q[0] + nx * (TW + 3) - tx, q[1] + ny * (TW + 3) - ty, q[0] + nx * (TW + 3) + tx, q[1] + ny * (TW + 3) + ty, q[0] - nx * (TW + 3) + tx, q[1] - ny * (TW + 3) + ty, q[0] - nx * (TW + 3) - tx, q[1] - ny * (TW + 3) - ty]).endFill();
        fr.beginFill(0xfff0b8).drawPolygon([q[0] + nx * (TW + 3) - tx, q[1] + ny * (TW + 3) - ty, q[0] + nx * (TW + 3) - tx * 0.2, q[1] + ny * (TW + 3) - ty * 0.2, q[0] - nx * (TW + 3) - tx * 0.2, q[1] - ny * (TW + 3) - ty * 0.2, q[0] - nx * (TW + 3) - tx, q[1] - ny * (TW + 3) - ty]).endFill();
      });
      // 出口：管口亮環
      const ex = along(WP.len - 2); fr.lineStyle(2.4, 0xa8ecff, 0.9).moveTo(ex[0] - Math.sin(ex[2]) * TW, ex[1] + Math.cos(ex[2]) * TW).lineTo(ex[0] + Math.sin(ex[2]) * TW, ex[1] - Math.cos(ex[2]) * TW);
    });
  }
  // 每格更新：入口跑馬燈慢慢轉；有珠子在管子裡時，箭頭燈追著珠子往出口亮
  function stepWarpTube(now, list) {
    if (!BD.tubes) return;
    BD.tubes.forEach((TB, ti) => {
      const inTube = list.filter((b) => b.state === 'warp' && (b.wi || 0) === ti).map((b) => b.ws || 0);
      TB.ring.forEach((d, i) => { const ph = ((now / 90 - i) % 14 + 14) % 14; d.alpha = inTube.length ? 1 : 0.35 + 0.55 * Math.max(0, 1 - ph / 4); });
      TB.glow.alpha = inTube.length ? 0.95 : 0.45 + 0.12 * Math.sin(now / 400 + ti);
      TB.arrows.forEach((a) => {
        let k = 0.3 + 0.12 * Math.max(0, Math.sin(now / 160 - a.s / 18));   // 平常：淡淡往前流
        inTube.forEach((s2) => { const d = a.s - s2; if (d > -10 && d < 70) k = Math.max(k, 1 - Math.max(0, d) / 80); });
        a.alpha = k; a.tint = k > 0.6 ? 0xffffff : 0x7fe3ff;
      });
    });
  }

  // 一體成形的螢幕外框（L.roof＋L.bezel）：一整圈深色金屬框，金色飾條，畫面在正中央的窗口裡；
  // 球道做在框體裡面（左邊框、上邊框右半、右邊框、下邊框兩端，由 buildWarpTube 畫成嵌在框裡的透明球道），入口是框上的開口。
  // 框的頂端是一道鍍鉻的弧形軌，珠子落在上面會往兩肩滾下去
  // （使用者 2026-11-11：「你乾脆做一個螢幕框體有管道，這樣就不用再接管道了」「整體性的螢幕外框」）
  function buildRoof(UG) {
    if (!L.roof || !UG) return;
    const tl = UG.topLine(), lcd = L.lcd, BZ = L.bezel, x0 = lcd.x, x1 = lcd.x + lcd.w, yb = lcd.y + lcd.h + UG.rim;
    const win = BZ ? BZ.win : [x0 + 2, UG.winTop, x1 - 2, lcd.y + lcd.h], K = 3, pad = 10;
    const ox = x0 - pad, oy = Math.min.apply(null, tl.map((q) => q[1])) - pad, Wd = x1 - x0 + pad * 2, Hd = yb - oy + pad;
    const roofY = (x) => { for (let i = 1; i < tl.length; i++) if (x <= tl[i][0]) { const a = tl[i - 1], b = tl[i], k = (x - a[0]) / ((b[0] - a[0]) || 1); return a[1] + (b[1] - a[1]) * k; } return tl[tl.length - 1][1]; };
    const tex = texC(Math.round(Wd * K), Math.round(Hd * K), (g) => {
      g.scale(K, K); g.translate(-ox, -oy); g.lineJoin = 'round'; g.lineCap = 'round';
      const outer = () => { g.beginPath(); g.moveTo(tl[0][0], tl[0][1]); tl.forEach((q) => g.lineTo(q[0], q[1])); g.lineTo(x1, yb); g.lineTo(x0, yb); g.closePath(); };
      const rr = (x, y, w, h, r) => { g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.quadraticCurveTo(x + w, y, x + w, y + r); g.lineTo(x + w, y + h - r); g.quadraticCurveTo(x + w, y + h, x + w - r, y + h); g.lineTo(x + r, y + h); g.quadraticCurveTo(x, y + h, x, y + h - r); g.lineTo(x, y + r); g.quadraticCurveTo(x, y, x + r, y); g.closePath(); };
      const ww = win[2] - win[0], wh = win[3] - win[1];
      // 落影
      g.save(); g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 7; g.shadowOffsetY = 3; outer(); rr(win[0], win[1], ww, wh, 5); g.fillStyle = '#000'; g.fill('evenodd'); g.restore();   // 窗口要挖空（不然整塊黑的會蓋住畫面）
      // 框體：深色金屬（上亮下暗），中間挖掉畫面的窗口
      const body = g.createLinearGradient(0, oy + pad, 0, yb); body.addColorStop(0, '#565c6c'); body.addColorStop(0.07, '#30333f'); body.addColorStop(0.5, '#191a22'); body.addColorStop(1, '#0b0c11');
      outer(); rr(win[0], win[1], ww, wh, 5); g.fillStyle = body; g.fill('evenodd');
      // 框面上一圈紅色飾條（機台的紅金配色）：在框的正中間繞一圈，球道會蓋在它上面
      const midIn = (win[0] - x0) / 2;
      g.save(); outer(); g.clip(); g.beginPath(); rr(x0 + midIn, win[1] - (win[1] - roofY((x0 + x1) / 2)) * 0.36, (x1 - x0) - midIn * 2, (yb - win[1]) + (win[1] - roofY((x0 + x1) / 2)) * 0.36 - (yb - win[3]) / 2, 12);
      g.lineWidth = 2.2; g.strokeStyle = 'rgba(214,30,52,0.55)'; g.stroke(); g.restore();
      // 外緣金邊（左右與下緣）＋內側一道亮線
      g.beginPath(); g.moveTo(tl[0][0], tl[0][1]); g.lineTo(x0, yb); g.lineTo(x1, yb); g.lineTo(tl[tl.length - 1][0], tl[tl.length - 1][1]);
      g.lineWidth = 2.6; g.strokeStyle = '#3a2400'; g.stroke(); g.lineWidth = 1.6; g.strokeStyle = '#e8b440'; g.stroke();
      // 窗口：深色凹槽＋金色內框
      g.beginPath(); rr(win[0] - 2.5, win[1] - 2.5, ww + 5, wh + 5, 7); g.lineWidth = 5; g.strokeStyle = '#05060a'; g.stroke();
      const gold = g.createLinearGradient(0, win[1], 0, win[3]); gold.addColorStop(0, '#fff0b8'); gold.addColorStop(0.5, '#e8b440'); gold.addColorStop(1, '#a8701c');
      g.beginPath(); rr(win[0] - 1, win[1] - 1, ww + 2, wh + 2, 6); g.lineWidth = 2.2; g.strokeStyle = gold; g.stroke();
      // 頂端的鍍鉻弧形軌（珠子滾的地方）
      const top = (dy) => { g.beginPath(); g.moveTo(tl[0][0], tl[0][1] + dy); tl.forEach((q) => g.lineTo(q[0], q[1] + dy)); };
      top(2.6); g.lineWidth = 6.4; g.strokeStyle = '#20232c'; g.stroke();
      top(2.2); g.lineWidth = 4.4; g.strokeStyle = '#b9c3d2'; g.stroke();
      top(1.2); g.lineWidth = 1.6; g.strokeStyle = '#ffffff'; g.stroke();
      // 鉚釘：沒有球道的地方（上邊框左半、下邊框中段）
      const rivet = (x, y) => { g.beginPath(); g.arc(x, y, 2.6, 0, 6.3); g.fillStyle = '#7a5210'; g.fill(); g.beginPath(); g.arc(x, y - 0.4, 2, 0, 6.3); g.fillStyle = '#f2c44a'; g.fill(); g.beginPath(); g.arc(x - 0.6, y - 1, 0.8, 0, 6.3); g.fillStyle = '#fff6d0'; g.fill(); };
      for (let x = x0 + 44; x < (x0 + x1) / 2 - 30; x += 46) rivet(x, (roofY(x) + win[1]) / 2 + 2);
      for (let x = (x0 + x1) / 2 - 96; x <= (x0 + x1) / 2 + 96; x += 48) rivet(x, (win[3] + yb) / 2);
    });
    const sp = new PIXI.Sprite(tex); sp.position.set(ox, oy); sp.scale.set(1 / K); partsLayer.addChild(sp);
  }

  function buildBoard() {
    PK.Phys.build();
    const lcd = L.lcd, F = L.field, rp = PK.Phys.rampPts, ah = lcd.arch || 28;
    boardBase.removeChildren().forEach((c) => c.destroy({ children: true }));
    partsLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    nailLayer.removeChildren().forEach((c) => c.destroy());
    // 印刷＋レール
    // 一體成形機台：盤面印刷、外軌、零件都在底圖上，這裡只畫會動／會發光的東西與釘子
    const bs = new PIXI.Sprite(UNI ? PIXI.Texture.EMPTY : PIXI.Texture.from(paintBoard())); bs.scale.set(0.5); boardBase.addChild(bs);
    const rails = new PIXI.Graphics(); boardBase.addChild(rails); rails.visible = !UNI;
    // 橢圓レール：inset＝從外レール內緣往內縮的距離（負值＝往外）
    const arc = (inset, a0, a1, w, c) => { rails.lineStyle(w, c, 1); for (let a = a0, k = 0; a <= a1 + 0.01; a += 2, k++) { const q = PK.ellPt(a, inset); if (k) rails.lineTo(q[0], q[1]); else rails.moveTo(q[0], q[1]); } };
    arc(-4, 118, 422, 9, 0x2a2f3a); arc(-4, 118, 422, 5, 0xdfe6f2); arc(-2, 118, 422, 1.5, 0xffffff);
    const irIn = F.r - L.innerRail.r;
    arc(irIn, L.innerRail.from, L.innerRail.to, 7, 0x2a2f3a); arc(irIn, L.innerRail.from, L.innerRail.to, 3.5, 0xdfe6f2);
    const UG = (T.center_unit || UNI) ? PK.unitGeom(L) : null;
    // 液晶位置與遮罩（計分板外框蓋住拱形部分；有中央機關時液晶放進機關的窗口）
    const LS = UG ? (UG.winR - UG.winL + 4) / PK.LCD_LAYOUT.w : (lcd.w - 8) / PK.LCD_LAYOUT.w;
    if (UG) lcdBox.position.set(UG.winL - 2, UG.winTop - 2); else lcdBox.position.set(lcd.x + 4, lcd.y + 4);
    lcdSprite.scale.set(LS);
    // 一體成形機台：液晶要剛好蓋滿底圖上的洋紅色區域（量自 machine_full：邏輯座標 x 152.3–646.8、y 272.7–636.3），四邊各多 1 免得露出洋紅邊
    const LW = (L.bezel && L.bezel.win) || (UNI && UNI.lcd);   // 有螢幕外框時，畫面只佔外框的窗口（球道在外框裡，不壓到畫面）
    if (LW) { lcdBox.position.set(LW[0] - 1, LW[1] - 1); lcdSprite.scale.set((LW[2] - LW[0] + 2) / PK.LCD_LAYOUT.w, (LW[3] - LW[1] + 2) / PK.LCD_LAYOUT.h); }
    lcdMask.clear().beginFill(0xffffff);
    if (LW) lcdMask.drawRect(0, 0, LW[2] - LW[0] + 2, LW[3] - LW[1] + 2);
    else if (UG) lcdMask.drawRect(0, 0, PK.LCD_LAYOUT.w * LS, PK.LCD_LAYOUT.h * LS);
    else if (T.part_scoreboard) lcdMask.drawRect(0, ah - 8, lcd.w - 8, lcd.h - 8 - (ah - 8)); else { lcdMask.moveTo(0, ah); for (let i = 0; i <= 24; i++) { const u = i / 24; lcdMask.lineTo(u * (lcd.w - 8), ah - ah * Math.sin(u * Math.PI)); } lcdMask.lineTo(lcd.w - 8, lcd.h - 8).lineTo(0, lcd.h - 8).closePath(); }
    lcdMask.endFill();
    if (PK.LCD.q && PK.LCD.q !== 1) lcdSprite.scale.set(lcdSprite.scale.x / PK.LCD.q, lcdSprite.scale.y / PK.LCD.q);   // 液晶畫布用較低解析度繪製時，貼圖放大回原本的大小
    lcdTopBox.position.copyFrom(lcdBox.position); lcdTopSprite.scale.copyFrom(lcdSprite.scale);   // 前景層跟液晶完全對齊
    { const lb = lcdMask.getLocalBounds(); lcdTopBox.hitArea = new PIXI.Rectangle(lb.x, lb.y, lb.width, lb.height); }
    // 計分板外框
    const SW = { l: 0.0195, r: 0.9797, t: 0.1024, b: 0.9718 };
    if (UG && !UNI) {
      // 中央機關：拱頂（原比例×archK）＋窗框（縱向拉成 4:3）＋底座（只在ステージ正下方、等比縮小）；碰撞跟這個外形一致（physics.js）
      const im = T.center_unit, C = UG.C, iw = im.width, ih = im.height;
      const sub = (u0, v0, u1, v1, x, y, w, h) => { const t = new PIXI.Texture(im.baseTexture, new PIXI.Rectangle(Math.round(u0 * iw), Math.round(v0 * ih), Math.round((u1 - u0) * iw), Math.round((v1 - v0) * ih))); const sp = new PIXI.Sprite(t); sp.position.set(x, y); sp.width = w; sp.height = h; partsLayer.addChild(sp); return sp; };
      sub(0, 0, 1, C.win[1], UG.left, UG.V(0), UG.sx, UG.winTop - UG.V(0));                       // 拱頂
      sub(0, C.win[1], 1, C.win[3], UG.left, UG.winTop, UG.sx, UG.winBot - UG.winTop);           // 窗框（兩側柱）
      sub(C.side[0] + 0.01, C.win[3], C.side[1] - 0.01, C.win[3] + 0.012, lcd.x, UG.winBot - 1, lcd.w, UG.rim + 1);   // 液晶下緣細金邊
      sub(0, C.win[3], 1, C.bottom + 0.004, UG.PU(0), UG.winBot, UG.ps, (C.bottom + 0.004 - C.win[3]) * UG.ps);    // 底座
      // 底座正中央原本是本壘盾牌（會被誤認成啟動口）：改畫成往下指的 V 字導槽，ステージ落下的珠子從這裡掉向啟動口
      {
        const PU = UG.PU, PV = UG.PV, vg = new PIXI.Graphics();
        const xa = PU(0.459), xb = PU(0.543), ya = PV(0.733), ym = PV(0.776), yt = PV(0.799), cx = UG.pcx;
        vg.beginFill(0x1a0306).drawPolygon([xa, ya, xb, ya, xb, ym, cx, yt, xa, ym]).endFill();
        vg.beginFill(0x000000).drawRoundedRect(cx - 9, yt - 5, 18, 6, 3).endFill();   // 落球口
        partsLayer.addChild(vg);
        BD.vChevs = [0, 1, 2].map((i) => {
          const c = new PIXI.Graphics(), yy = ya + 3 + i * 6.5, hw = 11 - i * 2.2;
          c.lineStyle(2.6, 0xffffff, 1).moveTo(cx - hw, yy).lineTo(cx, yy + hw * 0.55).lineTo(cx + hw, yy);
          c.blendMode = PIXI.BLEND_MODES.ADD; partsLayer.addChild(c); return c;
        });
      }
      // 拱頂中央的金色名牌：放機種 logo（真台的中央機關通常有機種名）
      if (T.logo) { const lg = new PIXI.Sprite(T.logo); lg.anchor.set(0.5); const pw2 = (0.6 - 0.4) * UG.sx * 0.95; lg.width = pw2; lg.height = pw2 * T.logo.height / T.logo.width;
        const ph = UG.V(0.19) - UG.V(0.07); if (lg.height > ph) { lg.height = ph; lg.width = ph * T.logo.width / T.logo.height; } lg.position.set(UG.U(0.5), (UG.V(0.07) + UG.V(0.19)) / 2); partsLayer.addChild(lg); }
      // ワープ入口與透明管統一在下面畫（buildWarpTube）
    } else if (!UNI && T.part_scoreboard) {
      const wx0 = lcd.x - 2, wx1 = lcd.x + lcd.w + 2, wy0 = lcd.y + ah - 4, wy1 = lcd.y + lcd.h + 2;
      const fw = (wx1 - wx0) / (SW.r - SW.l), fh = (wy1 - wy0) / (SW.b - SW.t);
      // 框頂的兩座球場燈塔拿掉（凸在球路上、珠子會穿過去）；中間的棒球徽章保留，物理上是實心的
      if (!T.part_scoreboard_clean) {
        const im0 = PK.Assets.get('part_scoreboard');
        T.part_scoreboard_clean = im0 ? texC(im0.width, im0.height, (g, w, h) => { g.drawImage(im0, 0, 0); g.clearRect(0.305 * w, 0, 0.092 * w, 0.0668 * h); g.clearRect(0.6 * w, 0, 0.092 * w, 0.0668 * h); }) : T.part_scoreboard;
      }
      const sb = new PIXI.Sprite(T.part_scoreboard_clean); sb.width = fw; sb.height = fh; sb.position.set(wx0 - SW.l * fw, wy0 - SW.t * fh); partsLayer.addChild(sb);
    }
    // 框燈（沿計分板外緣；有中央機關時沿拱頂外形）
    BD.frameLeds = [];
    if (UG) {
      // 圓弧頂（L.roof）：燈沿著弧形軌下緣排；舊的金色拱頂已經拿掉，不能再沿著它的輪廓排（使用者 2026-11：拱頂沒了「居然還有閃燈」浮在半空中）
      const hp = L.roof ? UG.topLine() : UG.hull, segL = [], ofs = 9; let tot = 0;
      for (let i = 0; i < hp.length - 1; i++) { const d = Math.hypot(hp[i + 1][0] - hp[i][0], hp[i + 1][1] - hp[i][1]); segL.push(d); tot += d; }
      for (let n = 0; n < 30; n++) {
        let t = (n + 0.5) / 30 * tot, i = 0; while (i < segL.length - 1 && t > segL[i]) { t -= segL[i]; i++; }
        const f = t / segL[i], x = hp[i][0] + (hp[i + 1][0] - hp[i][0]) * f, y = hp[i][1] + (hp[i + 1][1] - hp[i][1]) * f;
        const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(x, y + ofs); s.scale.set(0.1); s.blendMode = PIXI.BLEND_MODES.ADD; partsLayer.addChild(s); BD.frameLeds.push(s);
      }
    }
    for (let i = 0; i < (UG ? 0 : 28); i++) {
      const u = i / 27; let x, y;
      if (u < 0.25) { x = lcd.x - 9; y = lcd.y + lcd.h - (u / 0.25) * (lcd.h - ah); }
      else if (u < 0.75) { x = lcd.x + (u - 0.25) / 0.5 * lcd.w; y = lcd.y + ah - 12; }
      else { x = lcd.x + lcd.w + 9; y = lcd.y + ah + (u - 0.75) / 0.25 * (lcd.h - ah); }
      const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(0.1); s.blendMode = PIXI.BLEND_MODES.ADD; partsLayer.addChild(s); BD.frameLeds.push(s);
    }
    buildRoof(UG);
    buildWarpTube();
    // ステージ、ramp、隔牆
    const g = new PIXI.Graphics(); partsLayer.addChild(g);
    const S = L.stage, sy = lcd.y + lcd.h + 10;
    if (!UNI) {
    if (UG) g.beginFill(0xffffff, 0.12).lineStyle(2.5, 0xffe8a0, 0.85).moveTo(S.x - 4, lcd.y + lcd.h);   // 透明壓克力ステージ（疊在底座前面）
    else g.beginFill(0x3f8cff, 0.28).lineStyle(2.5, 0x9fdcff, 0.9).moveTo(S.x - 4, lcd.y + lcd.h);
    for (let u = -1; u <= 1.001; u += 0.05) g.lineTo(S.x + S.w / 2 + u * S.w / 2, sy + S.depth * (1 - u * u) + 4);
    g.lineTo(S.x + S.w + 4, lcd.y + lcd.h).closePath().endFill();
    g.lineStyle(0).beginFill(0x000000, 0.8).drawEllipse(S.x + S.w / 2, sy + S.depth + 6, 12, 5).endFill();
    }
    if (!UNI) (PK.Phys.rampDraw || [[rp.a0, rp.d0], [rp.d1, rp.t0], [rp.t1, rp.e1]]).forEach((sgm) => { g.lineStyle(7, 0x2a2f3a, 1).moveTo(sgm[0][0], sgm[0][1] + 4).lineTo(sgm[1][0], sgm[1][1] + 4); g.lineStyle(4, 0xe6ecf6, 1).moveTo(sgm[0][0], sgm[0][1] + 3).lineTo(sgm[1][0], sgm[1][1] + 3); });
    // 右打ち通道：淡藍色通道底（跟中央用一列仕切り釘分開，見 gauge.js）
    if (!UNI) {
      const RP = L.ramp, wx = lcd.x + lcd.w, rampYat = (x) => RP.y1 + (x - RP.x1) * (RP.y2 - RP.y1) / (RP.x2 - RP.x1);
      const xr = (PK.shapeXs(lcd.y, 0) || [0, F.cx + F.r])[1];
      let a0 = PK.shapeAng(RP.x1, RP.y1), aTop = PK.shapeAng(xr, lcd.y);
      if (a0 > 180) a0 -= 360; if (aTop > a0) aTop -= 360;   // 跨過 0° 的右側
      BD.lane = new PIXI.Graphics(); partsLayer.addChildAt(BD.lane, 0);
      BD.lane.beginFill(0x2a8cff, 0.16).moveTo(wx, lcd.y).lineTo(wx, rampYat(wx)).lineTo(RP.x1, RP.y1);
      for (let a = a0; a >= aTop - 0.01; a -= 2) { const q = PK.ellPt(a, 2); BD.lane.lineTo(q[0], q[1]); }
      BD.lane.closePath().endFill();
      // ramp 終端擋片
      const st = PK.Phys.rampStop;
      if (st) { g.lineStyle(7, 0x2a2f3a, 1).moveTo(st[0], st[1]).lineTo(st[2], st[3]); g.lineStyle(3.5, 0xe6ecf6, 1).moveTo(st[0], st[1]).lineTo(st[2], st[3]); }
    }
    // ヘソ＝本壘板：白色五角形本壘板（尖端朝下＝捕手那側），洞口就開在本壘板上（不放手套，免得看起來像兩個洞）
    // 入賞口＝壘包
    {
      const hx = L.heso.x, hy = L.heso.y, pw = 27;
      // 啟動口的圓形燈座（參考真台：ヘソ外圍一圈 LED，是整個盤面最亮的焦點）：印在盤面上的圓盤＋一圈燈，燈色跟著整台狀態變
      const rcx = hx, rcy = hy + 12, rr = 50;
      const disk = new PIXI.Graphics(); disk.visible = !UNI;
      disk.beginFill(0x2a0410, 0.62).drawCircle(rcx, rcy, rr + 6).endFill();
      disk.lineStyle(3, 0xe8b440, 0.95).drawCircle(rcx, rcy, rr + 6).lineStyle(1.5, 0xfff0b0, 0.6).drawCircle(rcx, rcy, rr - 6);
      partsLayer.addChild(disk);
      BD.hesoRing = [];
      for (let i = 0; i < 20; i++) {
        const a = -Math.PI / 2 + i / 20 * Math.PI * 2, s2 = new PIXI.Sprite(T.glow); s2.anchor.set(0.5);
        s2.position.set(rcx + Math.cos(a) * rr, rcy + Math.sin(a) * rr); s2.scale.set(0.11); s2.blendMode = PIXI.BLEND_MODES.ADD; partsLayer.addChild(s2); BD.hesoRing.push(s2);
      }
      const plateP = (dy) => [hx - pw, hy - 6 + dy, hx + pw, hy - 6 + dy, hx + pw, hy + 16 + dy, hx, hy + 38 + dy, hx - pw, hy + 16 + dy];
      const plate = new PIXI.Graphics(); plate.visible = !UNI;
      plate.beginFill(0x000000, 0.35).drawPolygon(plateP(3)).endFill();
      plate.lineStyle(3, 0xb9c3d0).beginFill(0xfbfbf4).drawPolygon(plateP(0)).endFill();
      plate.lineStyle(2.5, 0xe8b440).beginFill(0x050505).drawRoundedRect(hx - 12, hy - 3, 24, 17, 5).endFill();   // 洞口（與物理杯壁同寬）
      partsLayer.addChild(plate);
    }
    BD.pocketGlow = [];
    L.pockets.forEach((p) => {
      if (!UNI && !sprite('part_base', p.x, p.y + 12, 40)) tulip(p.x, p.y, p.w, false, 0x7fd0ff);
      const pw = p.w / 2 + 2, pg = new PIXI.Graphics(); pg.visible = !UNI;
      pg.beginFill(0xe8b440).drawRoundedRect(p.x - pw - 5, p.y - 5, pw * 2 + 10, 16, 4).endFill();   // 金框
      pg.beginFill(0x000000).drawRoundedRect(p.x - pw + 1, p.y - 3, pw * 2 - 2, 12, 3).endFill();     // 黑色開口
      partsLayer.addChild(pg);
      const gl = new PIXI.Sprite(T.glow); gl.anchor.set(0.5); gl.position.set(p.x, p.y + 3); gl.scale.set(0.55); gl.tint = 0x7fd0ff; gl.blendMode = PIXI.BLEND_MODES.ADD; gl.alpha = 0; partsLayer.addChild(gl); BD.pocketGlow.push(gl);
      // 洞口兩側的小燈（參考真台：袖入賞口有自己的燈飾，一眼看出是洞口）
      [-1, 1].forEach((sd) => { const d = new PIXI.Sprite(T.glow); d.anchor.set(0.5); d.position.set(p.x + sd * 15, p.y - 6); d.scale.set(0.09); d.blendMode = PIXI.BLEND_MODES.ADD; partsLayer.addChild(d); (BD.pocketLeds = BD.pocketLeds || []).push(d); });
    });
    // 沒有右打：大獎回合中啟動口兩片翼片往外張開（像鬱金香），張開的範圍就是收珠範圍（physics.js 的 hesoWide）；平常收起來看不到
    BD.startWings = null;
    if (PK.NO_RIGHT) {
      const HW = L.heso, wl = (HW.wide || 40) - 8;
      BD.startWings = [-1, 1].map((sd) => {
        const pv = new PIXI.Container(); pv.position.set(HW.x + sd * 12, HW.y - 2); partsLayer.addChild(pv);
        const w = new PIXI.Graphics();
        w.beginFill(0x000000, 0.35).drawRoundedRect(-4, -wl + 2, 9, wl, 4).endFill();
        w.beginFill(0xffd23f).lineStyle(1.5, 0x7a4a00).drawRoundedRect(-4.5, -wl, 9, wl, 4).endFill();
        w.lineStyle(0).beginFill(0xe8102c).drawRoundedRect(-2.4, -wl + 4, 4.8, wl - 8, 2.4).endFill().beginFill(0xffffff, 0.6).drawRoundedRect(-1.2, -wl + 6, 1.6, wl - 14, 1).endFill();
        pv.addChild(w); pv.sd = sd; pv.alpha = 0; return pv;
      });
      BD.wingK = 0;
    }
    BD.hesoGlow = new PIXI.Sprite(T.glow); BD.hesoGlow.anchor.set(0.5); BD.hesoGlow.position.set(L.heso.x, L.heso.y + 4); BD.hesoGlow.scale.set(0.8); BD.hesoGlow.tint = 0xffe066; BD.hesoGlow.blendMode = PIXI.BLEND_MODES.ADD; BD.hesoGlow.alpha = 0; partsLayer.addChild(BD.hesoGlow);
    // 大獎口：在右邊斜軌上（最一開始的位置），外殼沿著斜軌角度；平常紅色門板關著，中大獎時往前倒開
    // attPv 區域座標：原點在洞口下游端（t1），x 沿斜軌往右上，+y 是斜軌下方（外殼那側），-y 是珠子滾的那側
    const attLen = Math.hypot(rp.t1[0] - rp.t0[0], rp.t1[1] - rp.t0[1]);
    const attPv = new PIXI.Container(); attPv.position.set(rp.t1[0], rp.t1[1]); attPv.rotation = Math.atan2(rp.t0[1] - rp.t1[1], rp.t0[0] - rp.t1[0]); partsLayer.addChild(attPv); attPv.visible = !PK.NO_RIGHT;
    const plateG = new PIXI.Graphics(); attPv.addChild(plateG); plateG.visible = !UNI;
    plateG.beginFill(0x5a0a14).lineStyle(3, 0xe8b440, 1).drawRoundedRect(-14, 2, attLen + 28, 44, 8).endFill();
    BD.attSlot = new PIXI.Graphics().beginFill(0x000000, 0.95).drawRoundedRect(0, 1, attLen, 14, 4).endFill(); BD.attSlot.alpha = 0; attPv.addChild(BD.attSlot);
    BD.attSlotGlow = new PIXI.Graphics().beginFill(0xffe066).drawRoundedRect(2, 3, attLen - 4, 10, 4).endFill(); BD.attSlotGlow.alpha = 0; BD.attSlotGlow.blendMode = PIXI.BLEND_MODES.ADD; attPv.addChild(BD.attSlotGlow);
    BD.attLid = new PIXI.Graphics().beginFill(0xff2a4d).lineStyle(2, 0xffd0d8).drawRoundedRect(0, -3, attLen, 10, 3).endFill()
      .lineStyle(0).beginFill(0xffffff, 0.5).drawRect(4, -1, attLen - 8, 2).endFill().beginFill(0x8a0018).drawRect(4, 4, attLen - 8, 2).endFill();
    attPv.addChild(BD.attLid); BD.attLid.visible = !UNI;   // 一體成形機台：紅色蓋板畫在底圖上，開啟時只亮出洞口
    BD.attY = 0; BD.attK = 0;
    const txt = (t, size, col, w) => { const sp = new PIXI.Sprite(texC(320, 70, (g2) => { g2.font = '900 ' + size + 'px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 8; g2.strokeStyle = '#2a0006'; g2.strokeText(t, 160, 37); g2.fillStyle = col; g2.fillText(t, 160, 37); })); sp.anchor.set(0.5); sp.width = w; sp.height = w * 70 / 320; attPv.addChild(sp); return sp; };
    txt('大奖口', 52, '#ffd23f', 84).position.set(attLen / 2, 24); attPv.children[attPv.children.length - 1].visible = !UNI;
    BD.attHint = txt('中大奖时打开', 40, '#ffffff', 76); BD.attHint.position.set(attLen / 2, 38); BD.attHint.visible = !UNI;
    // 開啟時的「進這裡！」＋箭頭：在洞口上方（珠子滾來的那側），不跟斜軌一起轉，保持正的
    const amx = (rp.t0[0] + rp.t1[0]) / 2, amy = (rp.t0[1] + rp.t1[1]) / 2, up = PK.Phys.attackerUp || [0, -1];
    BD.attGo = new PIXI.Container(); BD.attGo.position.set(amx + up[0] * 40, amy + up[1] * 40); BD.attGo.alpha = 0; partsLayer.addChild(BD.attGo); BD.attGo.visible = !UNI;
    { const gt = new PIXI.Sprite(texC(320, 80, (g2) => { g2.font = '900 56px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 10; g2.strokeStyle = '#2a0006'; g2.strokeText('进这里！', 160, 42); g2.fillStyle = '#ffe066'; g2.fillText('进这里！', 160, 42); }));
      gt.anchor.set(0.5); gt.width = 96; gt.height = 24; gt.y = -16; BD.attGo.addChild(gt);
      const ar = new PIXI.Graphics().beginFill(0xffe066).lineStyle(2, 0x2a0006).moveTo(-9, 0).lineTo(9, 0).lineTo(9, 6).lineTo(15, 6).lineTo(0, 18).lineTo(-15, 6).lineTo(-9, 6).closePath().endFill();
      ar.y = 0; BD.attGo.addChild(ar); BD.attGoArrow = ar; }
    BD.attLeds = []; for (let i = 0; i < 8; i++) { const s2 = new PIXI.Sprite(T.glow); s2.anchor.set(0.5); s2.position.set(-6 + i * (attLen + 12) / 7, 50); s2.scale.set(0.09); s2.blendMode = PIXI.BLEND_MODES.ADD; attPv.addChild(s2); BD.attLeds.push(s2); }
    // 電チュー羽根
    const dlen = Math.hypot(rp.d1[0] - rp.d0[0], rp.d1[1] - rp.d0[1]) / 2;
    BD.wings = [rp.d0, rp.d1].map((pt, i) => {
      const pv = new PIXI.Container(); pv.position.set(pt[0], pt[1]); pv.rotation = Math.atan2(rp.d1[1] - rp.d0[1], rp.d1[0] - rp.d0[0]); partsLayer.addChild(pv); pv.visible = !PK.NO_RIGHT;
      const w = new PIXI.Graphics().beginFill(0xffd23f).drawRoundedRect(i === 0 ? 0 : -dlen, -3, dlen, 5, 2).endFill(); pv.addChild(w); pv.side = i === 0 ? 1 : -1; pv.wing = w; return pv;
    });
    // ゲート（縫線圈）、風車（旋轉棒球）
    const gate = new PIXI.Container(); gate.position.set(L.gate.x, L.gate.y); partsLayer.addChild(gate); gate.visible = !PK.NO_RIGHT;
    const gring = new PIXI.Graphics().lineStyle(4, 0xf6f1e6).drawCircle(0, 0, L.gate.r);
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; gring.lineStyle(2, 0xd4142a).moveTo(Math.cos(a) * (L.gate.r - 4), Math.sin(a) * (L.gate.r - 4)).lineTo(Math.cos(a + 0.12) * (L.gate.r + 4), Math.sin(a + 0.12) * (L.gate.r + 4)); }
    gate.addChild(gring); gring.visible = !UNI;
    BD.gateBl = new PIXI.Graphics().lineStyle(2.5, 0xe6ecf6); for (let i = 0; i < 3; i++) { const a = i * Math.PI / 3; BD.gateBl.moveTo(-Math.cos(a) * (L.gate.r - 3), -Math.sin(a) * (L.gate.r - 3)).lineTo(Math.cos(a) * (L.gate.r - 3), Math.sin(a) * (L.gate.r - 3)); } gate.addChild(BD.gateBl);
    // 風車：四片紅白扇葉＋中央足球，轉速跟著被打的力道變；被打到時發光（左邊打的珠子約六七成會碰到它，把珠子分到往啟動口的斜釘道）
    BD.windGlow = new PIXI.Sprite(T.glow); BD.windGlow.anchor.set(0.5); BD.windGlow.position.set(L.windmill.x, L.windmill.y); BD.windGlow.scale.set(0.9); BD.windGlow.tint = 0xffe066; BD.windGlow.blendMode = PIXI.BLEND_MODES.ADD; BD.windGlow.alpha = 0; partsLayer.addChild(BD.windGlow);
    const wind = new PIXI.Graphics(); wind.position.set(L.windmill.x, L.windmill.y); partsLayer.addChild(wind);
    const WR = L.windmill.r + 9;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      wind.lineStyle(1.5, 0x5a0010).beginFill(i % 2 ? 0xffffff : 0xe8283c)
        .drawPolygon([Math.cos(a - 0.5) * 6, Math.sin(a - 0.5) * 6, Math.cos(a - 0.18) * WR, Math.sin(a - 0.18) * WR, Math.cos(a + 0.22) * (WR - 2), Math.sin(a + 0.22) * (WR - 2), Math.cos(a + 0.35) * 6, Math.sin(a + 0.35) * 6]).endFill();
    }
    wind.lineStyle(1.5, 0x8a7f6a).beginFill(0xf6f1e6).drawCircle(0, 0, 7).endFill();
    wind.lineStyle(0).beginFill(0x16161c).drawPolygon([0, -3.4, 3.2, -1.05, 2, 2.75, -2, 2.75, -3.2, -1.05]).endFill();   // 中央是足球：白球上一塊黑色五邊形
    BD.wind = wind;
    BD.futoO = null; BD.futoDots = [];
    if (!PK.NO_RIGHT) {
      const FX0 = L.gate.x - 62, FY0 = L.gate.y + 30;   // 閘口左下方，跟上面的右打燈箱錯開
      partsLayer.addChild(new PIXI.Graphics().beginFill(0x0a0608, 0.92).lineStyle(2.5, 0xe8b440).drawRoundedRect(FX0 - 24, FY0 - 20, 48, 46, 8).endFill());
      const mk = (txt, col, size) => { const sp = new PIXI.Sprite(texC(120, 120, (g2) => { g2.font = '900 ' + size + 'px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = col; g2.shadowColor = col; g2.shadowBlur = 16; g2.fillText(txt, 60, 64); })); sp.anchor.set(0.5); sp.width = sp.height = 30; sp.position.set(FX0, FY0); partsLayer.addChild(sp); return sp; };
      BD.futoO = mk('○', '#3bff6e', 96); BD.futoX = mk('×', '#ff3a4a', 96);
      BD.futoTag = new PIXI.Sprite(texC(160, 50, (g2) => { g2.font = '900 34px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = '#ffd23f'; g2.fillText('普图', 80, 27); }));
      BD.futoTag.anchor.set(0.5); BD.futoTag.position.set(FX0, FY0 - 30); BD.futoTag.width = 40; BD.futoTag.height = 12.5; partsLayer.addChild(BD.futoTag);
      BD.futoDots = []; for (let i = 0; i < 4; i++) { const d = new PIXI.Graphics().beginFill(0xffffff).drawCircle(0, 0, 3).endFill(); d.position.set(FX0 - 13 + i * 8.7, FY0 + 18); partsLayer.addChild(d); BD.futoDots.push(d); }
    }
    // 右打ち箭頭燈
    // 零件名稱標示（參考使用者提供的網頁柏青哥：每個洞口都標名稱，一眼看懂用途）；一體成形機台不貼標籤（零件本身一看就懂）
    if (!UNI) {
      const tag = (text, x, y, col, size) => {
        const t = new PIXI.Sprite(texC(260, 64, (g2) => {
          g2.font = '900 40px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle';
          g2.shadowColor = col; g2.shadowBlur = 14; g2.fillStyle = col; g2.fillText(text, 130, 34); g2.shadowBlur = 0; g2.fillStyle = '#ffffff'; g2.globalAlpha = 0.85; g2.fillText(text, 130, 34);
        }));
        t.anchor.set(0.5); t.position.set(x, y); t.width = size; t.height = size * 64 / 260; partsLayer.addChild(t); return t;
      };
      const H2 = L.heso, A2 = PK.Phys.rampPts;
      // 啟動口名牌：燈座下緣一塊印刷的金色小牌（參考真台的 START 牌）
      {
        const nm = new PIXI.Sprite(texC(240, 64, (g2) => {
          const gr = g2.createLinearGradient(0, 4, 0, 60); gr.addColorStop(0, '#fff0b0'); gr.addColorStop(0.5, '#e8b440'); gr.addColorStop(1, '#a8701c');
          g2.fillStyle = gr; g2.beginPath(); g2.roundRect(6, 6, 228, 52, 14); g2.fill(); g2.lineWidth = 4; g2.strokeStyle = '#5a3200'; g2.stroke();
          g2.font = '900 38px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.fillStyle = '#4a0610'; g2.fillText('启动口', 120, 34);
        }));
        nm.anchor.set(0.5); nm.position.set(H2.x, H2.y + 70); nm.width = 62; nm.height = 62 * 64 / 240; partsLayer.addChild(nm); BD.tagStart = nm;
      }
      BD.tagGate = tag('闸口', L.gate.x - 10, L.gate.y + 32, '#5ad0ff', 64);
      // 一般入賞口：+3（進去給 3 顆）
      L.pockets.forEach((pk2) => tag('+' + PK.PAYOUT.pocket, pk2.x + (pk2.x < H2.x ? -36 : 36), pk2.y + 8, '#7fd0ff', 78));   // 標在洞口外側
    }
    // 一體成形機台的標示（使用者：START、大獎洞要寫清楚）：啟動口燈座下緣的金色 START 名牌、大獎口紅色蓋板上的金字
    if (UNI) {
      const H2 = L.heso, SP = L.startPlate;
      const nm = new PIXI.Sprite(texC(300, 110, (g2) => {
        const gr = g2.createLinearGradient(0, 6, 0, 104); gr.addColorStop(0, '#fff3b8'); gr.addColorStop(0.45, '#f0bf45'); gr.addColorStop(1, '#9a6512');
        g2.fillStyle = 'rgba(0,0,0,0.45)'; g2.beginPath(); g2.roundRect(8, 12, 288, 94, 22); g2.fill();
        g2.fillStyle = gr; g2.beginPath(); g2.roundRect(4, 4, 288, 94, 22); g2.fill(); g2.lineWidth = 5; g2.strokeStyle = '#6a3a00'; g2.stroke();
        g2.textAlign = 'center'; g2.textBaseline = 'middle';
        // 只留「啟動口」三個大字：下面原本還有一行「進球就轉一次」，縮到盤面上只剩 3～4 個像素高，根本看不到
        g2.font = '900 78px "Noto Sans SC", sans-serif'; g2.lineWidth = 8; g2.strokeStyle = '#fff6d0'; g2.strokeText('启动口', 148, 54); g2.fillStyle = '#b0061e'; g2.fillText('启动口', 148, 54);
      }));
      nm.anchor.set(0.5); nm.position.set(SP.x, SP.y); nm.width = SP.w; nm.height = SP.w * 110 / 300; partsLayer.addChild(nm); BD.tagStart = nm;
      const at = new PIXI.Sprite(texC(300, 90, (g2) => { g2.font = '900 64px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 10; g2.strokeStyle = '#3a0006'; g2.strokeText('大奖口', 150, 48); const gr = g2.createLinearGradient(0, 14, 0, 82); gr.addColorStop(0, '#fff3b8'); gr.addColorStop(1, '#e0a72c'); g2.fillStyle = gr; g2.fillText('大奖口', 150, 48); }));
      at.anchor.set(0.5); at.position.set(attLen / 2, 29); at.width = attLen * 0.78; at.height = at.width * 90 / 300; attPv.addChild(at);
    }
    // 右打ち燈：液晶右上方一塊大燈箱＋四個大箭頭；要打右邊時紅色爆閃、箭頭由上往下跑燈（平常暗著）
    BD.rightBox = null; BD.arrows = [];
    if (!PK.NO_RIGHT) {
      const RX = lcd.x + lcd.w + 56, RY = lcd.y + 40;   // 液晶右上方（普圖燈在下方閘口旁，兩者錯開）
      BD.rightGlow = new PIXI.Sprite(T.glow); BD.rightGlow.anchor.set(0.5); BD.rightGlow.position.set(RX, RY + 70); BD.rightGlow.scale.set(1.6, 2.6); BD.rightGlow.tint = 0xff2244; BD.rightGlow.blendMode = PIXI.BLEND_MODES.ADD; BD.rightGlow.alpha = 0; partsLayer.addChild(BD.rightGlow);
      BD.rightBox = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(-42, -22, 84, 44, 10).endFill(); BD.rightBox.position.set(RX, RY); BD.rightBox.tint = 0x3a0a10; partsLayer.addChild(BD.rightBox);
      partsLayer.addChild(new PIXI.Graphics().lineStyle(3, 0xe8b440).drawRoundedRect(RX - 42, RY - 22, 84, 44, 10));
      BD.rightTxt = new PIXI.Sprite(texC(240, 110, (g2) => { g2.font = '900 84px "Noto Sans SC", sans-serif'; g2.textAlign = 'center'; g2.textBaseline = 'middle'; g2.lineWidth = 10; g2.strokeStyle = '#2a0006'; g2.strokeText('右打', 120, 58); g2.fillStyle = '#ffffff'; g2.fillText('右打', 120, 58); }));
      BD.rightTxt.anchor.set(0.5); BD.rightTxt.position.set(RX, RY); BD.rightTxt.width = 80; BD.rightTxt.height = 37; partsLayer.addChild(BD.rightTxt);
      BD.arrows = [];
      for (let i = 0; i < 4; i++) {
        const a = new PIXI.Graphics().beginFill(0xffffff).lineStyle(2, 0x2a0006).moveTo(-22, -12).lineTo(4, -12).lineTo(4, -22).lineTo(26, 0).lineTo(4, 22).lineTo(4, 12).lineTo(-22, 12).closePath().endFill();
        a.position.set(RX, RY + 48 + i * 38); a.alpha = 0.25; partsLayer.addChild(a); BD.arrows.push(a);
      }
    }
    // 外圈鍍鉻框：深色底＋銀色主體＋白色高光＋鉚釘
    bezel.clear(); bezel.visible = !UNI;
    const ring = (inset, w, c, al) => { bezel.lineStyle(w, c, al == null ? 1 : al); for (let a = 0, k = 0; a <= 360.01; a += 1.5, k++) { const q = PK.ellPt(a, inset); if (k) bezel.lineTo(q[0], q[1]); else bezel.moveTo(q[0], q[1]); } };
    ring(-15, 22, 0x1c1418); ring(-15, 15, 0xaeb8c8); ring(-11, 4, 0xffffff, 0.85); ring(-19, 3, 0x5c6474); ring(-23, 3, 0xe8b440);
    bezel.lineStyle(0);
    for (let a = 0; a < 360; a += 10) { const q = PK.ellPt(a, -15); bezel.beginFill(0x4a5260).drawCircle(q[0], q[1], 3.4).endFill().beginFill(0xffffff, 0.9).drawCircle(q[0] - 0.9, q[1] - 0.9, 1.2).endFill(); }
    tube.clear();
    if (CAB) { const tr = (inset, w, al) => { tube.lineStyle(w, 0xffffff, al); for (let a = 0, k = 0; a <= 360.01; a += 1.5, k++) { const q = PK.ellPt(a, inset); if (k) tube.lineTo(q[0], q[1]); else tube.moveTo(q[0], q[1]); } }; tr(-7, 8, 0.28); tr(-7, 3.2, 0.95); }
    // 釘
    PK.Phys.nails.concat(PK.Phys.decoNails || []).forEach((n) => { const s = new PIXI.Sprite(PK.V2 ? T.nail2 : T.nail); s.anchor.set(0.5); s.position.set(n.x, n.y); s.scale.set(PK.V2 ? (PK.PHYS.nailHead || 4) / 23 : 0.42); nailLayer.addChild(s); });   // 新版：釘頭半徑 nailHead（比碰撞用的釘身粗）
    // 役物
    const yh = L.yaku.size; yaku.height = yh; yaku.width = yh * (T.yaku_ball ? T.yaku_ball.width / T.yaku_ball.height : 1);
    BD.yakuBase = { x: L.yaku.x, y: L.yaku.y, sx: yaku.scale.x };
    yaku.position.set(L.yaku.x, L.yaku.y);
  }

  // ---------------------------------------------------------
  // ガラス枠（前面板）、外圈 LED、頂部
  // ---------------------------------------------------------
  const F0 = L.field, winCx = BX + F0.cx * BS, winCy = BY + F0.cy * BS, winR = (F0.r + 7) * BS, winRy = WIN_RY;
  const glassHi = new PIXI.Sprite(texC(512, 512, (g) => { const r = g.createLinearGradient(0, 0, 512, 512); r.addColorStop(0, 'rgba(255,255,255,0.09)'); r.addColorStop(0.35, 'rgba(255,255,255,0)'); r.addColorStop(0.62, 'rgba(255,255,255,0)'); r.addColorStop(0.7, 'rgba(255,255,255,0.05)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.beginPath(); g.arc(256, 256, 256, 0, 6.28); g.fill(); }));
  glassHi.anchor.set(0.5); glassHi.position.set(winCx, winCy); glassHi.width = winR * 2; glassHi.height = winRy * 2; M.addChild(glassHi);
  const ringLeds = [];
  for (let i = 0; i < (UNI ? 0 : 44); i++) { const q = PK.ellPt(270 + i / 44 * 360, -(7 + 12 / BS)); const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(BX + q[0] * BS, BY + q[1] * BS); s.scale.set(0.16); s.blendMode = PIXI.BLEND_MODES.ADD; M.addChild(s); ringLeds.push(s); }
  const header = new PIXI.Container(); M.addChild(header);
  if (T.header_art && !CAB && !UNI) {
    const h = new PIXI.Sprite(T.header_art); h.width = MW - 16; h.height = (MW - 16) * T.header_art.height / T.header_art.width; h.position.set(8, 6 + HEADER_H / 2 - h.height / 2 + 10); header.addChild(h);
    const hm = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(8, 6, MW - 16, HEADER_H, 26).endFill(); header.addChild(hm); h.mask = hm;
    header.addChild(new PIXI.Graphics().beginFill(0x000000, 0.25).drawRoundedRect(8, 6, MW - 16, HEADER_H, 26).endFill());
  }
  if (UNI && (T.logo_line || T.logo)) {
    // 頂部金色招牌（又寬又扁）：一行的標題 logo（PK大逆转），高度照牌面、寬度照圖的比例
    const tx = T.logo_line || T.logo, lg = new PIXI.Sprite(tx); lg.anchor.set(0.5); const LG = UNI.logo;
    // 寬度佔牌面 82%，高度照圖的比例；最高不超過牌面高度的 2.1 倍（火焰可以稍微超出牌框）
    const LH = LG.w * UK * 240 / 2086; lg.width = LG.w * UK * 0.82; lg.height = lg.width * tx.height / tx.width;
    if (lg.height > LH * 2.1) { lg.height = LH * 2.1; lg.width = lg.height * tx.width / tx.height; }
    lg.position.set(LG.x * UK, LG.y * UK); header.addChild(lg);
  } else if (T.logo) { const lg = new PIXI.Sprite(T.logo); lg.anchor.set(0.5); lg.width = 360; lg.height = 360 * T.logo.height / T.logo.width; lg.position.set(MW / 2, 6 + HEADER_H / 2); header.addChild(lg); }
  const headLeds = [];
  // 標題列下緣一排燈（有外殼時只排在紅色招牌範圍，不壓到兩邊的吉祥物）
  if (!UNI) { const n = CAB ? 14 : 26, xa = CAB ? 300 : 40, xb = CAB ? MW - 300 : MW - 40;
    for (let i = 0; i < n; i++) { const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(xa + i * (xb - xa) / (n - 1), HEADER_H + 4); s.scale.set(0.12); s.blendMode = PIXI.BLEND_MODES.ADD; header.addChild(s); headLeds.push(s); } }

  // 7 段數字
  const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', ' ': '' };
  function draw7(g, str, x, y, h, on, off) {
    const w = h * 0.55, t = h * 0.12;
    for (const ch of String(str)) {
      const sg = SEG[ch] || '';
      const P = { a: [x + t, y, w - 2 * t, t], d: [x + t, y + h - t, w - 2 * t, t], g: [x + t, y + h / 2 - t / 2, w - 2 * t, t], f: [x, y + t, t, h / 2 - t], e: [x, y + h / 2, t, h / 2 - t], b: [x + w - t, y + t, t, h / 2 - t], c: [x + w - t, y + h / 2, t, h / 2 - t] };
      for (const k of 'abcdefg') { g.fillStyle = sg.includes(k) ? on : off; const r = P[k]; g.fillRect(r[0] + 1, r[1] + 1, r[2] - 2, r[3] - 2); }
      x += w + h * 0.16;
    }
  }
  // 資料燈（標題列兩側）：左＝大当り回數、右＝スタート（本次回轉數）
  // 有外殼時：資料燈縮小，放在左右喇叭下方的角落（不擋喇叭與吉祥物）
  const DPW = UNI ? 130 : CAB ? 150 : 200, DPH = UNI ? 70 : CAB ? 56 : 74, DPY = UNI ? 205 : CAB ? 200 : 26;
  function dataPanel(x, label) {
    const CH = UNI ? 140 : 96;   // 一體成形機台：標籤一行、數字一行，字比較大
    const c = cv(260, CH, () => {}), tex = PIXI.Texture.from(c), sp = new PIXI.Sprite(tex);
    sp.position.set(x, DPY); sp.width = DPW; sp.height = DPH; header.addChild(sp);
    header.addChild(new PIXI.Graphics().lineStyle(4, 0xe8b440).drawRoundedRect(x - 3, DPY - 3, DPW + 6, DPH + 6, 10));
    let last = null;
    return (v) => {
      if (v === last) return; last = v;
      const g = c.getContext('2d'); g.fillStyle = '#060203'; g.fillRect(0, 0, 260, CH);
      if (UNI) { g.fillStyle = '#ffd0c4'; g.font = '900 32px "Noto Sans SC", sans-serif'; g.textBaseline = 'top'; g.textAlign = 'center'; g.fillText(label, 130, 8); g.textAlign = 'left';
        g.shadowColor = '#ff2010'; g.shadowBlur = 12; draw7(g, String(Math.min(9999, v)).padStart(4, ' '), 26, 50, 80, '#ff3a26', 'rgba(255,40,20,0.1)'); g.shadowBlur = 0; tex.update(); return; }
      g.fillStyle = '#ffb0a0'; g.font = '900 22px "Noto Sans SC", sans-serif'; g.textBaseline = 'top'; g.fillText(label, 10, 6);
      g.shadowColor = '#ff2010'; g.shadowBlur = 10; draw7(g, String(Math.min(9999, v)).padStart(4, ' '), 92, 12, 74, '#ff3a26', 'rgba(255,40,20,0.08)'); g.shadowBlur = 0;
      tex.update();
    };
  }
  // 一體成形機台：大獎次數／轉數直接放進上方兩個喇叭（使用者：喇叭沒用，拿來放資訊）——喇叭網面改成圓形顯示屏，外圈 LED 燈環照舊
  function speakerPanel(sp, label) {
    const S = 256, c = cv(S, S, () => {}), tex = PIXI.Texture.from(c), spr = new PIXI.Sprite(tex);
    spr.anchor.set(0.5); spr.position.set(sp[0] * UK, sp[1] * UK); spr.width = spr.height = sp[2] * 2 * UK; header.addChild(spr);
    let last = null;
    return (v) => {
      if (v === last) return; last = v;
      const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
      g.save(); g.beginPath(); g.arc(128, 128, 127, 0, 6.283); g.clip();
      const bg = g.createRadialGradient(110, 96, 10, 128, 128, 130); bg.addColorStop(0, '#1c1428'); bg.addColorStop(1, '#040208');
      g.fillStyle = bg; g.fillRect(0, 0, S, S);
      g.fillStyle = 'rgba(160,140,255,0.07)'; for (let y = 6; y < S; y += 9) for (let x = (y / 9) % 2 ? 6 : 10.5; x < S; x += 9) { g.beginPath(); g.arc(x, y, 1.6, 0, 6.283); g.fill(); }   // 點陣屏的細點
      g.restore();
      g.strokeStyle = 'rgba(232,180,64,0.75)'; g.lineWidth = 4; g.beginPath(); g.arc(128, 128, 124, 0, 6.283); g.stroke();
      g.fillStyle = '#ffd6c8'; g.font = '900 34px "Noto Sans SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(label, 128, 74);
      g.shadowColor = '#ff2010'; g.shadowBlur = 14; draw7(g, String(Math.min(9999, v)).padStart(4, ' '), 24, 102, 80, '#ff3a26', 'rgba(255,40,20,0.1)'); g.shadowBlur = 0;
      tex.update();
    };
  }
  const SPK = UNI && UNI.speakerPanels;
  const setHits = SPK ? speakerPanel(SPK[0], '大奖次数') : dataPanel(CAB ? 14 : 28, '大奖次数'), setStart = SPK ? speakerPanel(SPK[1], '转数') : dataPanel(CAB ? MW - 14 - DPW : MW - 228, '转数');

  // ---------------------------------------------------------
  // 下半部（範本確認的版面：底圖＋互動零件）
  // ---------------------------------------------------------
  // 台座：寬版台座圖（2.09:1，撐滿機台寬度、不用兩側裝飾柱）；沒有寬版時才用舊圖縮小置中
  // 一體成形機台：台座就是底圖下段（上珠盤、數字窗＋兩顆按鈕、下珠盤、右下旋鈕都畫在圖上）
  const WIDE = UNI ? true : !!T.deck_wide;
  const deckTex = UNI && T[UNI.img] ? new PIXI.Texture(T[UNI.img].baseTexture, new PIXI.Rectangle(0, UNI.deck.y0, UNI.iw, UNI.deck.y1 - UNI.deck.y0)) : (T.deck_wide || T.deck_art || T.concept_deck);
  const DECK_TOP = UNI ? Math.round(UNI.deck.y0 * UK) : Math.round(winCy + winRy + 40), DECK_H = deckTex ? MW * deckTex.height / deckTex.width : 667;
  const DECK_S = WIDE ? 1 : 0.8, DECK_X = (MW - MW * DECK_S) / 2;
  // 零件位置（台座圖內的比例座標，量自 deck_wide.webp）
  const DP = UNI ? {   // 量自 machine_full.webp：u＝圖片 x / 1024、v＝（圖片 y − 1240）/ 296
    tray: { x0: 0.1074, x1: 0.8955, top: 0.186, floor: 0.385 }, trayRim: { y0: 0.368, y1: 0.446 },   // 底面在金色前緣後面：前緣蓋住珠子下半部，看起來是放在盤子裡
    counter: { x0: 0.0703, y0: 0.524, x1: 0.179, y1: 0.676 },
    push: { x: -1, y: -1, r: 0.01 },
    rent: { x: 0.2471, y: 0.601, w: 0.1191, h: 0.1757 }, ret: { x: -1, y: -1, w: 0.01, h: 0.01 },   // 只留「購買」一顆，做成長條（從數字窗右邊延伸到下珠盤左邊）
    handle: { x: 0.8525, y: 0.676, r: 0.0566, arc: 0.0684 },
    lower: { x0: 0.3262, x1: 0.7422, top: 0.507, floor: 0.8885 }, lowerRim: { y0: 0.865, y1: 0.946 },
    lever: { x: -1, y: -1, w: 0.1 },
    vol: { x: 0.9424, y: 0.523, r: 0.024 },   // 音量鍵：放在旋鈕右上（原本停止鍵的位置）
    stop: { x: 0.9424, y: 0.523 },
  } : WIDE ? {
    tray: { x0: 0.07, x1: 0.934, top: 0.035, floor: 0.122 }, trayRim: { y0: 0.118, y1: 0.17 },
    counter: { x0: 0.062, y0: 0.298, x1: 0.323, y1: 0.43 },
    push: { x: 0.501, y: 0.51, r: 0.125 },
    rent: { x: 0.753, y: 0.353, w: 0.107, h: 0.177 }, ret: { x: 0.88, y: 0.353, w: 0.107, h: 0.177 },
    handle: { x: 0.837, y: 0.659, r: 0.054, arc: 0.095 },
    lower: { x0: 0.04, x1: 0.325, top: 0.735, floor: 0.835 }, lowerRim: { y0: 0.83, y1: 0.868 },
    lever: { x: 0.215, y: 0.882, w: 0.17 },
    vol: { x: 0.5, y: 0.89, r: 0.033 },
  } : {
    tray: { x0: 0.075, x1: 0.925, top: 0.035, floor: 0.128 }, trayRim: { y0: 0.122, y1: 0.165 },
    counter: { x0: 0.06, y0: 0.275, x1: 0.312, y1: 0.405 },
    push: { x: 0.5, y: 0.465, r: 0.145 },
    rent: { x: 0.755, y: 0.328, w: 0.11, h: 0.11 }, ret: { x: 0.9, y: 0.328, w: 0.11, h: 0.11 },
    handle: { x: 0.848, y: 0.585, r: 0.062, arc: 0.1 },
    lower: { x0: 0.045, x1: 0.35, top: 0.67, floor: 0.785 }, lowerRim: { y0: 0.778, y1: 0.812 },
    lever: { x: 0.225, y: 0.835, w: 0.17 },
    vol: { x: 0.5, y: 0.842, r: 0.034 },
  };
  const DX = (u) => u * MW, DYv = (v) => v * DECK_H;
  // 兩側裝飾柱（台座縮小後空出的位置）
  if (!WIDE && T.side_pillar) [0, 1].forEach((k) => {
    const sp = new PIXI.Sprite(T.side_pillar); sp.height = MH - DECK_TOP; sp.width = DECK_X + 24; sp.position.set(k ? MW - DECK_X - 24 : 0, DECK_TOP);
    if (k) { sp.scale.x *= -1; sp.x = MW; } M.addChild(sp);
  });
  const deck = new PIXI.Container(); deck.position.set(DECK_X, DECK_TOP); deck.scale.set(DECK_S); M.addChild(deck);
  { const dm = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, DECK_TOP - 4, MW, MH - DECK_TOP).endFill(); M.addChild(dm); deck.mask = dm; }
  if (deckTex && !UNI) { const bg = new PIXI.Sprite(deckTex); bg.position.set(0, 0); bg.width = MW; bg.height = DECK_H; deck.addChild(bg); }
  const TRAY = { x0: DX(DP.tray.x0), x1: DX(DP.tray.x1), top: DYv(DP.tray.top), floorL: DYv(DP.tray.floor) - (UNI ? 6 : 0), floorR: DYv(DP.tray.floor) + 4,   /* 盤底往送珠口微微傾斜：珠子會往右滾，但表面接近水平、平鋪整齊 */ feedX: DX(DP.tray.x1) - 34, r: 10 };
  const LOWER = { x0: DX(DP.lower.x0), x1: DX(DP.lower.x1), top: DYv(DP.lower.top), floor: DYv(DP.lower.floor), r: 10 };
  LOWER.gateX0 = LOWER.x0 + (LOWER.x1 - LOWER.x0) * 0.42; LOWER.gateX1 = LOWER.gateX0 + 90;
  if (!UNI) {
    deck.addChild(new PIXI.Graphics().beginFill(0x07050a, 0.3).drawRoundedRect(TRAY.x0, TRAY.top, TRAY.x1 - TRAY.x0, TRAY.floorR - TRAY.top + 8, 18).endFill());
    deck.addChild(new PIXI.Graphics().beginFill(0x07050a, 0.3).drawRoundedRect(LOWER.x0, LOWER.top, LOWER.x1 - LOWER.x0, LOWER.floor - LOWER.top + 8, 16).endFill());
  }
  if (!WIDE) {   // 寬版台座圖本身就畫了出珠口與送珠洞
    deck.addChild(new PIXI.Graphics().beginFill(0xe6ecf6).drawRoundedRect(TRAY.x0 + 4, TRAY.top - 6, 64, 30, 10).endFill().beginFill(0x050308).drawRoundedRect(TRAY.x0 + 12, TRAY.top, 48, 16, 8).endFill());
    deck.addChild(new PIXI.Graphics().beginFill(0x000000).drawRoundedRect(TRAY.feedX + 2, TRAY.floorR - 22, TRAY.x1 - TRAY.feedX - 4, 30, 8).endFill());
  }
  const trayBallC = new PIXI.Container(); deck.addChild(trayBallC);
  const lowerBallC = new PIXI.Container(); deck.addChild(lowerBallC);
  if (UNI) {   // 珠子只在珠盤內側顯示：送珠口往下掉、出珠口掉進來、堆太高時都不會露在白色外殼上
    const m1 = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(TRAY.x0, TRAY.top - 6, TRAY.x1 - TRAY.x0, TRAY.floorR - TRAY.top + 6 + TRAY.r, 24).endFill(); deck.addChild(m1); trayBallC.mask = m1;
    const m2 = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(LOWER.x0, LOWER.top - 6, LOWER.x1 - LOWER.x0, LOWER.floor - LOWER.top + 6 + LOWER.r, 18).endFill(); deck.addChild(m2); lowerBallC.mask = m2;
  }
  function rimOverlay(y0, y1, x0, x1) {
    if (!deckTex) return;
    const sp = new PIXI.Sprite(deckTex); sp.position.set(0, 0); sp.width = MW; sp.height = DECK_H; deck.addChild(sp);
    const m = new PIXI.Graphics().beginFill(0xffffff).drawRect(x0, DYv(y0), x1 - x0, DYv(y1) - DYv(y0)).endFill(); deck.addChild(m); sp.mask = m;
  }
  rimOverlay(DP.trayRim.y0, DP.trayRim.y1, 0, MW);
  rimOverlay(DP.lowerRim.y0, DP.lowerRim.y1, DX(DP.lower.x0) - 30, DX(DP.lower.x1) + 30);
  if (!UNI) deck.addChild(new PIXI.Graphics().lineStyle(3, 0xffffff, 0.25).moveTo(TRAY.x0 + 60, DYv(DP.trayRim.y0) + 6).lineTo(TRAY.x0 + 340, DYv(DP.trayRim.y0) + 6));

  // 堆疊物理
  function Pile(cfg) {
    const P = { balls: [], segs: cfg.segs, r: cfg.r, cont: cfg.cont, sprites: [], ax: cfg.ax || 0, damp: cfg.damp || 0.995 };
    P.add = (x, y, vx, vy) => P.balls.push({ x, y, vx: vx || 0, vy: vy || 0 });
    P.step = (dt) => {
      const sub = 3, h = dt / sub, r = P.r, r2 = r * 2;
      for (let s = 0; s < sub; s++) {
        const grid = new Map(), cs = r2;
        P.balls.forEach((b, i) => {
          b.vy += 1700 * h; b.vx += P.ax * h; b.x += b.vx * h; b.y += b.vy * h; b.vx *= P.damp; b.vy *= 0.999;
          if (P.calm) { b.vx *= 0.82; b.vy *= 0.82; }   // 沒在發射、沒在出珠：快速靜止
          const k = ((b.x / cs) | 0) + ',' + ((b.y / cs) | 0); (grid.get(k) || grid.set(k, []).get(k)).push(i);
        });
        P.balls.forEach((a, i) => {
          const gx = (a.x / cs) | 0, gy = (a.y / cs) | 0;
          for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
            const cell = grid.get((gx + ox) + ',' + (gy + oy)); if (!cell) continue;
            for (const j of cell) {
              if (j <= i) continue;
              const b = P.balls[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
              if (d2 >= r2 * r2 || d2 === 0) continue;
              const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, ov = (r2 - d) * 0.5;
              a.x -= nx * ov; a.y -= ny * ov; b.x += nx * ov; b.y += ny * ov;
              const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
              if (rv < 0) { const im = -0.55 * rv; a.vx -= im * nx; a.vy -= im * ny; b.vx += im * nx; b.vy += im * ny; }
            }
          }
        });
        P.balls.forEach((b) => {
          P.segs.forEach((sg) => {
            if (sg.off) return;
            const ex = sg[2] - sg[0], ey = sg[3] - sg[1], l2 = ex * ex + ey * ey;
            let t = ((b.x - sg[0]) * ex + (b.y - sg[1]) * ey) / l2; t = t < 0 ? 0 : t > 1 ? 1 : t;
            const cx = sg[0] + ex * t, cy = sg[1] + ey * t, dx = b.x - cx, dy = b.y - cy, d2 = dx * dx + dy * dy;
            if (d2 >= r * r) return;
            const d = Math.sqrt(d2) || 0.01, nx = dx / d, ny = dy / d;
            b.x = cx + nx * r; b.y = cy + ny * r;
            const vn = b.vx * nx + b.vy * ny;
            if (vn < 0) { b.vx -= 1.3 * vn * nx; b.vy -= 1.3 * vn * ny; if (Math.abs(vn) > 160 && P.onHit) P.onHit(Math.abs(vn)); b.vx *= 0.96; }
          });
        });
        if (P.clamp) P.balls.forEach(P.clamp);
      }
    };
    P.draw = () => {
      while (P.sprites.length < P.balls.length) { const s = new PIXI.Sprite(T.ball); s.anchor.set(0.5); s.width = s.height = P.r * 2.25; P.cont.addChild(s); P.sprites.push(s); }
      P.sprites.forEach((s, i) => { const b = P.balls[i]; if (!b) { s.visible = false; return; } s.visible = true; s.position.set(b.x, b.y); });
    };
    return P;
  }
  // ax：往送球口的推力（太大會讓珠子全擠在右邊堆高）
  const upper = Pile({ r: TRAY.r, cont: trayBallC, ax: UNI ? 28 : 160, damp: 0.9988,   // 往右推力要小：推力太大整盤珠子會像傾斜的水面一樣全擠在右邊疊好幾層（使用者回報）
    segs: [[TRAY.x0, TRAY.top - 200, TRAY.x0, TRAY.floorL], [TRAY.x0, TRAY.floorL, TRAY.feedX, TRAY.floorR], [TRAY.x1, TRAY.top - 200, TRAY.x1, TRAY.floorR + 60]] });
  const feedGate = [TRAY.feedX, TRAY.floorR, TRAY.x1, TRAY.floorR + 1]; upper.segs.push(feedGate);
  upper.clamp = (b) => {
    const r = TRAY.r;
    if (b.x < TRAY.x0 + r) { b.x = TRAY.x0 + r; if (b.vx < 0) b.vx *= -0.3; }
    if (b.x > TRAY.x1 - r) { b.x = TRAY.x1 - r; if (b.vx > 0) b.vx *= -0.3; }
    if ((b.x > TRAY.feedX && feedGate.off) || b.y > TRAY.floorR + 6) return;
    const fy = TRAY.floorL + (TRAY.floorR - TRAY.floorL) * Math.min(1, (b.x - TRAY.x0) / (TRAY.feedX - TRAY.x0)) - r;
    if (b.y > fy) { b.y = fy; if (b.vy > 0) b.vy *= -0.25; }
    // 皿緣：珠子不會疊得比皿的邊緣高（滿了就溢到下皿）
    const ceil = TRAY.top + r - 4;
    if (b.y < ceil) { b.y = ceil; if (b.vy < 0) b.vy = 0; }
  };
  const lower = Pile({ r: LOWER.r, cont: lowerBallC, ax: UNI ? -20 : -60, segs: [[LOWER.x0, LOWER.top - 200, LOWER.x0, LOWER.floor], [LOWER.x0, LOWER.floor, LOWER.gateX0, LOWER.floor + 6], [LOWER.gateX1, LOWER.floor + 6, LOWER.x1, LOWER.floor], [LOWER.x1, LOWER.top - 200, LOWER.x1, LOWER.floor]] });
  const lowerGate = [LOWER.gateX0, LOWER.floor + 6, LOWER.gateX1, LOWER.floor + 6]; lower.segs.push(lowerGate);
  lower.clamp = (b) => {
    const r = LOWER.r;
    if (b.x < LOWER.x0 + r) { b.x = LOWER.x0 + r; if (b.vx < 0) b.vx *= -0.3; }
    if (b.x > LOWER.x1 - r) { b.x = LOWER.x1 - r; if (b.vx > 0) b.vx *= -0.3; }
    if ((lowerGate.off && b.x > LOWER.gateX0 + 4 && b.x < LOWER.gateX1 - 4) || b.y > LOWER.floor + 10) return;
    if (b.y > LOWER.floor - r) { b.y = LOWER.floor - r; if (b.vy > 0) b.vy *= -0.25; }
    const ceil = LOWER.top + r - 4;
    if (b.y < ceil && b.y > LOWER.top - 40) { b.y = ceil; if (b.vy < 0) b.vy = 0; }
  };
  // 珠盤裡珠子互撞的叮噹聲：只在真的出珠或正在發射時才有（從珠箱補珠、讀檔還原時安靜）
  upper.onHit = (v) => { if ((PAY.real > 0 || (started && PK.UI.firing())) && Math.random() < 0.3) play('tink' + ((Math.random() * 3) | 0), { vol: Math.min(0.35, v / 1400), minGap: 0.03 }); };
  lower.onHit = upper.onHit;

  // 鋼珠經濟：持ち玉＝上皿＋下皿＋出球中＋ドル箱
  const PAY = { queue: 0, acc: 0, box: 0, fast: false, real: 0, hold: 0, lowQ: 0, lacc: 0 };   // hold＝購買後還在機台裡等著注入上方珠盤；lowQ＝中獎後要掉進下方珠盤的顆數
  let trayIdleT = 0;   // 珠盤沒動靜的時間（秒）   // real＝佇列裡「真的出珠」（中獎、入賞）的顆數；從珠箱補珠不算
  // 容量依皿的實際大小計算（平鋪排滿約九成），超過就往下皿、再往ドル箱
  const capOf = (w, h, r) => Math.floor(Math.floor(w / (2 * r)) * Math.max(1, Math.floor((h - 2 * r) / (r * 1.74) + 1)) * 0.92);
  const CAP_UP = capOf(TRAY.feedX - TRAY.x0, TRAY.floorL - TRAY.top, TRAY.r);
  const CAP_LOW = Math.min(48, capOf(LOWER.x1 - LOWER.x0, LOWER.floor - LOWER.top, LOWER.r));
  function payout(n, kind) {
    if (kind === 'rent') {   // 購買的珠子只進上方珠盤：滿了就在機台裡等，不會溢到下方珠盤
      // 購買後要馬上能打（使用者：「不要滾動太久」）：珠盤快空的時候，前 10 顆直接放在送珠口前面，其餘的從左邊快速倒進來
      let k = 0;
      if (upper.balls.length < 6) {
        for (const m = Math.min(n, 10); k < m; k++) {
          const x = TRAY.feedX - 6 - k * (TRAY.r * 2 + 0.6);
          upper.add(x, TRAY.floorL + (TRAY.floorR - TRAY.floorL) * Math.min(1, (x - TRAY.x0) / (TRAY.feedX - TRAY.x0)) - TRAY.r, 0, 0);
        }
      }
      PAY.hold += n - k; PAY.fast = true; return;
    }
    if (kind === 'foul') { PAY.queue += n; return; }   // 沒打出去的球退回上方珠盤
    PAY.lowQ += n;                                     // 中獎（入賞、大獎）的珠子：掉到下方珠盤
  }
  function owned() { return upper.balls.length + lower.balls.length + PAY.queue + PAY.box + PAY.hold + PAY.lowQ; }
  function stepPayout(dt) {
    // 【上方珠盤】只放購買的彈珠（從左上注入口進來）：有空位就注入，滿了就在機台裡等
    if (PAY.hold > 0 && PAY.queue === 0 && upper.balls.length < CAP_UP - 2) {
      const n = Math.min(PAY.hold, CAP_UP - upper.balls.length); PAY.hold -= n; PAY.queue += n; PAY.real += n;
    }
    // 上方珠盤快打完（遊戲中、正在發射）且沒有購買的珠子了 → 把中獎贏來的珠子（下方珠盤＋珠箱）補上去繼續打
    if (started && PK.UI.firing() && upper.balls.length < 12 && PAY.queue === 0 && PAY.hold === 0) {
      let n = Math.min(PAY.box, CAP_UP - upper.balls.length); PAY.box -= n;
      while (n < CAP_UP - upper.balls.length && lower.balls.length > 0) { lower.balls.pop(); n++; }
      if (n > 0) { PAY.queue += n; PAY.real += n; }
    }
    // 【下方珠盤】只接中獎掉出來的彈珠；滿了自動打開下方的閘門流進珠箱
    PAY.drain = Math.max(0, (PAY.drain || 0) - dt);
    lowerGate.off = leverOpen || PAY.drain > 0;
    if (PAY.lowQ > 0) {
      PAY.lacc += dt * 36;
      while (PAY.lacc >= 1 && PAY.lowQ > 0) {
        PAY.lacc -= 1; PAY.lowQ--;
        if (lower.balls.length < CAP_LOW + 6) lower.add(LOWER.x0 + 44, LOWER.top - 4, 160 + Math.random() * 140, 60);
        else PAY.box++;
        if (lower.balls.length >= CAP_LOW) PAY.drain = 1.5;
      }
    } else PAY.lacc = 0;
    const jara = PAY.real > 0 || PAY.lowQ > 0;
    Au.loop('jara_loop', jara, G.inBonus ? 0.28 : 0.5);   // 出珠聲只在真的出珠時響（大獎中壓低，讓音樂出來）
    if (PAY.queue <= 0) { PAY.fast = false; PAY.real = 0; return; }
    PAY.acc += dt * (PAY.fast ? 120 : 32);
    while (PAY.acc >= 1 && PAY.queue > 0) {
      PAY.acc -= 1; PAY.queue--; if (PAY.real > 0) PAY.real--;
      if (upper.balls.length < CAP_UP) upper.add(TRAY.x0 + 44, TRAY.top + 30, 240 + Math.random() * 160, 40 + Math.random() * 40);
      else PAY.hold++;   // 上方珠盤滿了：留在機台裡等（不會掉到下方珠盤）
    }
  }

  // 計數器
  const dispCanvas = cv(560, 150, () => {}), dispTex = PIXI.Texture.from(dispCanvas);
  const disp = new PIXI.Sprite(dispTex); disp.position.set(DX(DP.counter.x0), DYv(DP.counter.y0)); disp.width = DX(DP.counter.x1) - DX(DP.counter.x0); disp.height = DYv(DP.counter.y1) - DYv(DP.counter.y0); deck.addChild(disp);
  let lastDisp = '';
  if (UNI) { const lb = new PIXI.Text('持有珠数', Object.assign({ fontFamily: '"Noto Sans SC", sans-serif', fontWeight: '900', fontSize: 13, fill: '#7a0614' }, PK.V2 ? { fill: '#ffe7a0', stroke: '#1a0503', strokeThickness: 3 } : {})); lb.anchor.set(0.5, 1); lb.position.set((DX(DP.counter.x0) + DX(DP.counter.x1)) / 2, DYv(DP.counter.y0) - 2); deck.addChild(lb); }
  function paintDisp() {
    const n = owned(), key = n + '/' + PAY.box;
    if (key === lastDisp) return; lastDisp = key;
    const g = dispCanvas.getContext('2d');
    g.fillStyle = '#060203'; g.fillRect(0, 0, 560, 150);
    if (UNI) { g.shadowColor = '#ff2010'; g.shadowBlur = 14; draw7(g, String(Math.min(99999, n)).padStart(5, ' '), 34, 18, 114, '#ff3a26', 'rgba(255,40,20,0.1)'); g.shadowBlur = 0; dispTex.update(); return; }
    g.fillStyle = '#ff6a50'; g.font = '900 30px "Noto Sans SC", sans-serif'; g.textBaseline = 'middle'; g.fillText('持有', 18, 52);
    g.fillStyle = '#ffb000'; g.font = '900 22px "Noto Sans SC", sans-serif'; g.fillText('珠箱 ' + PAY.box, 18, 112);
    g.shadowColor = '#ff2010'; g.shadowBlur = 14;
    draw7(g, String(Math.min(99999, n)).padStart(5, ' '), 150, 22, 104, '#ff3a26', 'rgba(255,40,20,0.08)');
    g.shadowBlur = 0; dispTex.update();
  }

  // 漫畫等級計量表（持有珠數下面）：上面一行字＋LED 窗（Lv 數字＋10 格到下一話的進度燈），點一下打開漫畫櫃
  // 位置在 PK.METER（台座比例座標），開發工具第一分頁「🏆 大獎畫面」的漫畫區可以即時拉滑桿調
  const meter = { sp: null, cv: null, tex: null, key: '', w: 0, h: 0, lv: 0, flash: 0 };
  function meterLayout() {
    const C = PK.METER, w = Math.max(40, DX(C.x1) - DX(C.x0)), h = Math.max(20, DYv(C.y1) - DYv(C.y0));
    if (!meter.sp || Math.abs(w - meter.w) > 0.5 || Math.abs(h - meter.h) > 0.5) {   // 大小變了：畫布照新比例重建，字才不會被拉扁
      meter.w = w; meter.h = h; meter.key = '';
      meter.cv = document.createElement('canvas'); meter.cv.width = Math.round(w * 4); meter.cv.height = Math.round(h * 4);
      const tex = PIXI.Texture.from(meter.cv);
      if (meter.sp) { meter.sp.texture = tex; if (meter.tex) meter.tex.destroy(true); }
      else {
        meter.sp = new PIXI.Sprite(tex); deck.addChild(meter.sp);
        meter.sp.eventMode = 'static'; meter.sp.cursor = 'pointer';
        meter.sp.on('pointerdown', (e) => { e.stopPropagation(); Au.unlock(); play('reel_stop', { vol: 0.6 }); if (PK.Manga) PK.Manga.openCabinet(); });
      }
      meter.tex = tex;
    }
    meter.sp.position.set(DX(C.x0), DYv(C.y0)); meter.sp.width = w; meter.sp.height = h;
  }
  function paintMeter(dt) {
    if (!UNI || !PK.Manga || !PK.Manga.progress) return;
    const P = PK.Manga.progress(); if (!P) return;
    meterLayout();
    if (meter.lv && P.level > meter.lv) meter.flash = 4;   // 剛升級：整條燈閃 4 秒
    meter.lv = P.level; meter.flash = Math.max(0, meter.flash - dt);
    const blink = Math.floor(lampT * 3) % 2 === 0, flashOn = meter.flash > 0 && Math.floor(lampT * 8) % 2 === 0;
    const lit = P.next ? Math.floor(P.k * 10) : 10;
    const msg = P.unread ? '有新话！点我阅读' : P.next ? P.nextName + '　再赢 ' + P.leftText : '全话解锁完成';
    const key = [P.level, lit, msg, P.unread && blink, flashOn, P.next && blink].join('|');
    if (key === meter.key) return; meter.key = key;
    const g = meter.cv.getContext('2d'), W = meter.cv.width, H = meter.cv.height, S = W / meter.w;   // S：每單位幾個畫素
    g.clearRect(0, 0, W, H);
    // 上面一行：標籤（跟「持有珠數」同款深紅字）＋下一話還差多久
    const LH = Math.round(H * 0.3);
    g.textBaseline = 'middle'; g.font = '900 ' + Math.round(13 * S) + 'px "Noto Sans SC", sans-serif';
    const LC = PK.V2 ? '#ffe7a0' : '#7a0614', LHOT = PK.V2 ? '#ff5a4a' : '#e0102a';   // 新版外殼是深色：標籤用淺金色加深色描邊
    const lbl = (t, x) => { if (PK.V2) { g.lineJoin = 'round'; g.lineWidth = 3 * S; g.strokeStyle = '#1a0503'; g.strokeText(t, x, LH / 2); } g.fillText(t, x, LH / 2); };
    g.fillStyle = LC; g.textAlign = 'left'; lbl('漫画等级', 2 * S);
    g.textAlign = 'right'; g.font = '900 ' + Math.round(11.5 * S) + 'px "Noto Sans SC", sans-serif';
    g.fillStyle = P.unread ? (blink ? LHOT : LC) : LC; lbl(msg, W - 2 * S);
    // LED 窗
    const y0 = LH + 2 * S, wh = H - y0 - 1 * S, rr = 6 * S;
    g.fillStyle = '#060203'; g.beginPath(); g.roundRect(0, y0, W, wh, rr); g.fill();
    g.strokeStyle = '#d9a640'; g.lineWidth = 1.6 * S; g.stroke();
    // Lv＋數字
    g.textAlign = 'left'; g.fillStyle = '#ffb000'; g.font = '900 ' + Math.round(12 * S) + 'px "Noto Sans SC", sans-serif';
    g.shadowColor = '#ff9000'; g.shadowBlur = 4 * S;
    g.fillText('Lv', 7 * S, y0 + wh * 0.55);
    const dh = wh * 0.62, dx = 24 * S;
    draw7(g, String(P.level).padStart(2, ' '), dx, y0 + (wh - dh) / 2, dh, '#ffb000', 'rgba(255,160,0,0.1)');
    // 10 格進度燈：亮的格子＝這一話已經走了幾成，下一格閃（還在累積）；滿級全部金色
    const bx0 = dx + dh * 0.55 * 2 + dh * 0.16 * 2 + 4 * S, bx1 = W - 7 * S, cw = (bx1 - bx0) / 10, chh = wh * 0.5, cy = y0 + (wh - chh) / 2;
    for (let i = 0; i < 10; i++) {
      const on = i < lit || flashOn, cur = P.next && i === lit;
      g.fillStyle = on ? (P.next ? '#ffb000' : '#ffe27a') : cur && blink ? 'rgba(255,176,0,0.55)' : 'rgba(255,160,0,0.12)';
      g.shadowBlur = on ? 5 * S : 0;
      g.beginPath(); g.roundRect(bx0 + i * cw + 1.2 * S, cy, cw - 2.4 * S, chh, 2 * S); g.fill();
    }
    g.shadowBlur = 0;
    meter.tex.update();
  }

  // PUSH
  const PR = DX(DP.push.r);
  const push = new PIXI.Container(); push.position.set(DX(DP.push.x), DYv(DP.push.y)); deck.addChild(push);
  const pushGlow = new PIXI.Sprite(T.glow); pushGlow.anchor.set(0.5); pushGlow.width = pushGlow.height = PR * 3.2; pushGlow.blendMode = PIXI.BLEND_MODES.ADD; pushGlow.alpha = 0; push.addChild(pushGlow);
  const pushShade = new PIXI.Graphics().beginFill(0x000000).drawCircle(0, 0, PR * 0.92).endFill(); pushShade.alpha = 0; push.addChild(pushShade);
  const pushRing = new PIXI.Graphics().lineStyle(8, 0xffffff, 1).drawCircle(0, 0, PR * 0.96); pushRing.alpha = 0; pushRing.blendMode = PIXI.BLEND_MODES.ADD; push.addChild(pushRing);
  const pushGauge = new PIXI.Graphics(); push.addChild(pushGauge);
  // 按鈕上的 PUSH 字樣：平常半透明，液晶要求按下時變亮跳動
  const pushTxt = new PIXI.Text('按！', { fontFamily: '"Noto Sans SC", sans-serif', fontWeight: '900', fontSize: 70, fill: ['#ff4b5c', '#a3001a'], stroke: '#ffffff', strokeThickness: 9, letterSpacing: 3, dropShadow: true, dropShadowColor: '#000000', dropShadowAlpha: 0.35, dropShadowDistance: 4, dropShadowBlur: 2 });
  pushTxt.anchor.set(0.5); pushTxt.alpha = 0.5; push.addChild(pushTxt);
  push.eventMode = 'static'; push.cursor = 'pointer'; push.hitArea = new PIXI.Circle(0, 0, PR);
  if (UNI) { push.visible = false; push.eventMode = 'none'; }   // 一體成形機台沒有 PUSH 鈕（使用者：沒作用、不需要）
  let pushType = null;

  // 玉貸・返却
  function baseBtn(cfg, label, fn) {
    const c = new PIXI.Container(); c.position.set(DX(cfg.x), DYv(cfg.y)); deck.addChild(c);
    const w = DX(cfg.w), h = DECK_H * cfg.h;
    const shade = new PIXI.Graphics().beginFill(0x000000).drawRoundedRect(-w / 2, -h / 2, w, h, 12).endFill(); shade.alpha = 0; c.addChild(shade);
    if (UNI && w > h * 1.4) {
      // 一體成形機台：長條按鈕（紅色電鍍外框＋白色亮面），蓋在圖上原本的按鈕上
      if (!T.btnPill) T.btnPill = texC(480, 200, (g) => {
        const rr2 = (x, y, w2, h2, r2) => { g.beginPath(); g.roundRect(x, y, w2, h2, r2); };
        g.fillStyle = 'rgba(0,0,0,0.3)'; rr2(10, 18, 462, 176, 88); g.fill();
        const ring = g.createLinearGradient(0, 0, 0, 200); ring.addColorStop(0, '#ff8a96'); ring.addColorStop(0.35, '#e0102c'); ring.addColorStop(0.7, '#8a0012'); ring.addColorStop(1, '#ff5468');
        g.fillStyle = ring; rr2(6, 8, 466, 178, 89); g.fill();
        g.strokeStyle = '#ffd56a'; g.lineWidth = 4; rr2(10, 12, 458, 170, 85); g.stroke();
        const face = g.createLinearGradient(0, 30, 0, 168); face.addColorStop(0, '#ffffff'); face.addColorStop(0.55, '#f1f1f4'); face.addColorStop(1, '#c4c6ce');
        g.fillStyle = face; rr2(28, 30, 422, 134, 67); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.8)'; rr2(70, 40, 300, 34, 17); g.fill();
      });
      // 閃爍用的外圈光（在按鈕後面）與亮面（疊在按鈕上、ADD）：按鈕本身永遠不透明，底圖上原本的小按鈕不會透出來
      c.halo = new PIXI.Sprite(T.glow); c.halo.anchor.set(0.5); c.halo.width = w * 1.6; c.halo.height = h * 2.6; c.halo.tint = 0xff4060; c.halo.blendMode = PIXI.BLEND_MODES.ADD; c.halo.alpha = 0; c.addChild(c.halo);
      const bg = new PIXI.Sprite(T.ui_btn_red || T.btnPill); bg.anchor.set(0.5); bg.width = w * 1.04; bg.height = h * 1.04; c.addChild(bg);   // 跟封面同款的紅寶石金框
      c.flash = new PIXI.Sprite(T.ui_btn_red || T.btnPill); c.flash.anchor.set(0.5); c.flash.width = bg.width; c.flash.height = bg.height; c.flash.blendMode = PIXI.BLEND_MODES.ADD; c.flash.alpha = 0; c.addChild(c.flash);
      shade.clear().beginFill(0x000000).drawRoundedRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, (h - 12) / 2).endFill(); c.addChild(shade);
    } else if (UNI) {
      // 一體成形機台：圓形按鈕（紅色電鍍外圈＋白色亮面），蓋在圖上原本的小按鈕上、放大到看得清楚
      if (!T.btnUni) T.btnUni = texC(160, 160, (g) => {
        const c0 = 80;
        g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); g.arc(c0, c0 + 5, 76, 0, 6.28); g.fill();
        const ring = g.createLinearGradient(0, 0, 0, 160); ring.addColorStop(0, '#ff8a96'); ring.addColorStop(0.35, '#e0102c'); ring.addColorStop(0.7, '#8a0012'); ring.addColorStop(1, '#ff5468');
        g.fillStyle = ring; g.beginPath(); g.arc(c0, c0, 74, 0, 6.28); g.fill();
        g.strokeStyle = '#ffd56a'; g.lineWidth = 3; g.beginPath(); g.arc(c0, c0, 72, 0, 6.28); g.stroke();
        const disc = g.createRadialGradient(c0 - 18, c0 - 22, 6, c0, c0, 58); disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.6, '#f1f1f4'); disc.addColorStop(1, '#c4c6ce');
        g.fillStyle = disc; g.beginPath(); g.arc(c0, c0, 57, 0, 6.28); g.fill();
        g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.ellipse(c0 - 8, c0 - 30, 30, 12, -0.2, 0, 6.28); g.fill();
      });
      const R0 = Math.min(w, h) / 2, bg = new PIXI.Sprite(T.btnUni); bg.anchor.set(0.5); bg.width = bg.height = R0 * 2; c.addChild(bg);
      shade.clear().beginFill(0x000000).drawCircle(0, 0, R0 * 0.78).endFill(); c.addChild(shade);
    }
    const pill = UNI && w > h * 1.4;
    const gem = pill && T.ui_btn_red;
    const t = new PIXI.Text(label, { fontFamily: '"Noto Sans SC", sans-serif', fontWeight: '900', fontSize: pill ? 26 : UNI ? 19 : 26, fill: gem ? ['#ffffff', '#ffe9a0'] : '#a3061c', stroke: gem ? '#4a0008' : '#ffffff', strokeThickness: gem ? 5 : UNI ? 2 : 4, letterSpacing: pill ? 6 : 0 }); t.anchor.set(0.5); c.addChild(t);
    c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = UNI && !pill ? new PIXI.Circle(0, 0, Math.min(w, h) / 2 + 4) : new PIXI.Rectangle(-w / 2, -h / 2, w, h);
    c.on('pointerdown', () => { Au.unlock(); start(); shade.alpha = 0.35; t.y = 3; fn(); setTimeout(() => { shade.alpha = 0; t.y = 0; }, 140); });
    return c;
  }
  const rentBtn = baseBtn(DP.rent, '购买', () => PK.Game.rent());
  // 結算鈕已拿掉（使用者：只留「購買」一顆按鈕）

  // 音量鍵：按下打開小面板，「音樂」與「音效（含語音）」分開調整，各 4 段（關、小、中、大），設定會記住
  const VOL = {
    bgm: [0, 0.2, 0.38, 0.55],
    sfx: [0, 0.3, 0.55, 0.8],
    voice: [0, 0.4, 0.7, 1.0],
  };
  const nearest = (arr, v) => { let bi = 0; arr.forEach((x, i) => { if (Math.abs(x - v) < Math.abs(arr[bi] - v)) bi = i; }); return bi; };
  // 舊版的「全部靜音」換算成兩組都關
  if (Au.muted) { Au.muted = false; Au.vol.master = 0.9; Au.vol.bgm = 0; Au.vol.sfx = 0; Au.vol.voice = 0; Au.saveVol(); }
  const lvBgm = () => nearest(VOL.bgm, Au.vol.bgm), lvSfx = () => nearest(VOL.sfx, Au.vol.sfx);
  function setLevel(kind, lv) {
    if (kind === 'bgm') Au.vol.bgm = VOL.bgm[lv];
    else { Au.vol.sfx = VOL.sfx[lv]; Au.vol.voice = VOL.voice[lv]; }
    if (lv === 0 && kind === 'sfx') Object.keys(Au.loops || {}).forEach((k) => Au.loop(k, false));
    Au.saveVol(); drawVol(); drawVolPanel();
    if (kind === 'sfx' && lv > 0) play('reel_tick', { vol: 0.8 });
  }
  const volBtn = new PIXI.Container(); volBtn.position.set(DX(DP.vol.x), DYv(DP.vol.y)); deck.addChild(volBtn);
  const volG = new PIXI.Graphics(); volBtn.addChild(volG);
  function speaker(g, x, y, k, c, lv) {
    g.lineStyle(0).beginFill(c).drawRect(x - 17 * k, y - 7 * k, 9 * k, 14 * k).moveTo(x - 8 * k, y - 7 * k).lineTo(x + 2 * k, y - 16 * k).lineTo(x + 2 * k, y + 16 * k).lineTo(x - 8 * k, y + 7 * k).closePath().endFill();
    if (lv === 0) g.lineStyle(4 * k, 0xd8213b).moveTo(x + 9 * k, y - 8 * k).lineTo(x + 23 * k, y + 8 * k).moveTo(x + 23 * k, y - 8 * k).lineTo(x + 9 * k, y + 8 * k);
    for (let i = 0; i < lv; i++) g.lineStyle(3.5 * k, c).arc(x + 2 * k, y, (9 + i * 7) * k, -0.75, 0.75);
  }
  function note(g, x, y, k, c, off) {
    g.lineStyle(0).beginFill(c).drawEllipse(x - 8 * k, y + 10 * k, 7 * k, 5.5 * k).drawEllipse(x + 10 * k, y + 6 * k, 7 * k, 5.5 * k).endFill();
    g.lineStyle(3.5 * k, c).moveTo(x - 2 * k, y + 10 * k).lineTo(x - 2 * k, y - 14 * k).lineTo(x + 16 * k, y - 18 * k).lineTo(x + 16 * k, y + 6 * k);
    if (off) g.lineStyle(4 * k, 0xd8213b).moveTo(x - 16 * k, y - 18 * k).lineTo(x + 22 * k, y + 18 * k);
  }
  let onVolDraw = null;   // 首頁右上角的聲音開關：音量變了跟著重畫（首頁在後面才建立）
  function drawVol() {
    const b = lvBgm(), f = lvSfx(), off = b === 0 && f === 0;
    volG.clear();
    if (UNI) { const R0 = DX(DP.vol.r); volG.beginFill(0x000000, 0.3).drawCircle(0, 3, R0 + 3).endFill().beginFill(0xd8213b).drawCircle(0, 0, R0 + 2).endFill().lineStyle(2, 0xffd56a).drawCircle(0, 0, R0).lineStyle(0).beginFill(0xf4f4f6).drawCircle(0, 0, R0 - 4).endFill(); }   // 紅框白面圓鈕

    // 菜單圖示：三條橫線；有還沒讀的新話時右上角一顆紅點
    { const R1 = DX(DP.vol.r), lw = R1 * 0.2; volG.lineStyle(lw, 0x7a0614, 1, 0.5); [-1, 0, 1].forEach((k) => volG.moveTo(-R1 * 0.42, k * R1 * 0.34).lineTo(R1 * 0.42, k * R1 * 0.34)); volG.lineStyle(0);
      if (PK.Manga && PK.Manga.hasUnread && PK.Manga.hasUnread()) volG.beginFill(0xffffff).drawCircle(R1 * 0.78, -R1 * 0.78, R1 * 0.4).endFill().beginFill(0xe60023).drawCircle(R1 * 0.78, -R1 * 0.78, R1 * 0.3).endFill(); }
    if (onVolDraw) onVolDraw();
  }
  drawVol();
  volBtn.eventMode = 'static'; volBtn.cursor = 'pointer'; volBtn.hitArea = new PIXI.Circle(0, 0, DX(DP.vol.r) * 1.7);

  // 音量面板（蓋在整台最上層；點面板外任何地方就關閉）
  const volLayer = new PIXI.Container(); volLayer.visible = false; volLayer.position.copyFrom(deck.position); volLayer.scale.copyFrom(deck.scale);   // 跟台座同一套座標
  const volCatch = new PIXI.Graphics().beginFill(0x000000, 0.25).drawRect(0, 0, MW, MH).endFill(); volCatch.eventMode = 'static'; volLayer.addChild(volCatch);
  // 面板設計：跟機台同一套紅白金配色——金框、深紅底、標題「音量」，每列「圖示＋名稱＋關／小／中／大」四格，選中的格子是紅寶石金框
  const PW = 560, PH = 300, ARW = 22, volPanel = new PIXI.Container(), VPX = Math.max(10, Math.min(MW - PW - 10, DX(DP.vol.x) - PW / 2)), VAX = DX(DP.vol.x) - VPX;   // 面板不超出畫面，小箭頭對準按鈕
  volPanel.position.set(VPX, DYv(DP.vol.y) - DX(DP.vol.r) - 18 - ARW - PH); volLayer.addChild(volPanel); volPanel.eventMode = 'static';
  volPanel.hitArea = new PIXI.Rectangle(0, 0, PW, PH + ARW);   // 點面板空白處不會關掉
  const PSC = 2;   // 畫布貼圖解析度倍率（字與框邊才不會糊）
  const rrPath = (g, x, y, w, h, r) => { g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const goldGrad = (g, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#fff4c2'); gr.addColorStop(0.35, '#f2c44a'); gr.addColorStop(0.6, '#a8700f'); gr.addColorStop(0.85, '#f7d474'); gr.addColorStop(1, '#8a5a0c'); return gr; };
  {
    // 面板底：陰影 → 金框（含指向音量鍵的小箭頭）→ 深紅內面 → 上緣反光 → 標題下金線
    const pad = 16, tw = PW + pad * 2, th = PH + ARW + pad * 2;
    const shape = (g, k) => { rrPath(g, k, k, PW - k * 2, PH - k * 2, 30 - k); g.moveTo(VAX - (ARW + 2 - k), PH - k - 1); g.lineTo(VAX, PH + ARW - k * 1.4); g.lineTo(VAX + (ARW + 2 - k), PH - k - 1); g.closePath(); };
    const bgTex = texC(tw * PSC, th * PSC, (g) => {
      g.scale(PSC, PSC); g.translate(pad, pad - 4);
      g.save(); g.shadowColor = 'rgba(0,0,0,0.65)'; g.shadowBlur = 16; g.shadowOffsetY = 6; g.fillStyle = '#000'; g.beginPath(); shape(g, 0); g.fill(); g.restore();
      g.fillStyle = goldGrad(g, 0, PH + ARW); g.beginPath(); shape(g, 0); g.fill();
      const inner = g.createLinearGradient(0, 7, 0, PH); inner.addColorStop(0, '#5a0c1c'); inner.addColorStop(0.3, '#2e0610'); inner.addColorStop(1, '#14030a');
      g.fillStyle = inner; g.beginPath(); shape(g, 7); g.fill();
      g.save(); g.beginPath(); shape(g, 7); g.clip();
      const sheen = g.createLinearGradient(0, 7, 0, 90); sheen.addColorStop(0, 'rgba(255,220,220,0.16)'); sheen.addColorStop(1, 'rgba(255,220,220,0)'); g.fillStyle = sheen; g.fillRect(0, 0, PW, 90);
      g.restore();
      g.strokeStyle = 'rgba(255,214,120,0.18)'; g.lineWidth = 1.5; g.beginPath(); rrPath(g, 11, 11, PW - 22, PH - 22, 24); g.stroke();   // 內圈細金線
      const ln = g.createLinearGradient(30, 0, PW - 30, 0); ln.addColorStop(0, 'rgba(242,196,74,0)'); ln.addColorStop(0.5, 'rgba(242,196,74,0.9)'); ln.addColorStop(1, 'rgba(242,196,74,0)');
      g.fillStyle = ln; g.fillRect(30, 74, PW - 60, 2);
    });
    const bg = new PIXI.Sprite(bgTex); bg.scale.set(1 / PSC); bg.position.set(-pad, -(pad - 4)); volPanel.addChild(bg);
  }
  const panelText = (t, size, fill, o) => { const x = new PIXI.Text(t, Object.assign({ fontFamily: '"Noto Sans SC", "PingFang SC", "Hiragino Sans", sans-serif', fontWeight: '900', fontSize: size, fill, align: 'center', lineJoin: 'round' }, o || {})); x.resolution = 2; return x; };
  {
    const title = panelText('音量', 40, ['#fffbe0', '#ffd23f', '#d68a12'], { stroke: '#3a0008', strokeThickness: 7, letterSpacing: 10, dropShadow: true, dropShadowColor: '#000000', dropShadowAlpha: 0.5, dropShadowDistance: 3, dropShadowBlur: 2 });
    title.anchor.set(0.5); title.position.set(PW / 2 + 5, 40); volPanel.addChild(title);
    // 關閉鈕：右上角金框圓鈕
    const cb = new PIXI.Container(); cb.position.set(PW - 44, 40); volPanel.addChild(cb);
    cb.addChild(new PIXI.Graphics().beginFill(0x000000, 0.35).drawCircle(0, 2, 22).endFill().beginFill(0xd9a636).drawCircle(0, 0, 21).endFill().beginFill(0x2a0610).drawCircle(0, 0, 18).endFill()
      .lineStyle(4, 0xffe9a8).moveTo(-7, -7).lineTo(7, 7).moveTo(7, -7).lineTo(-7, 7));
    cb.eventMode = 'static'; cb.cursor = 'pointer'; cb.hitArea = new PIXI.Circle(0, 0, 30);
    cb.on('pointerdown', (e) => { e.stopPropagation(); openVol(false); });
  }
  // 選項格的兩種底板（選中：紅寶石＋金框；沒選：深色）
  const VSEG = { w: 74, h: 62, gap: 10 };
  const segTex = (on) => texC((VSEG.w + 8) * PSC, (VSEG.h + 8) * PSC, (g) => {
    g.scale(PSC, PSC); g.translate(4, 4);
    if (on) {
      g.fillStyle = goldGrad(g, 0, VSEG.h); g.beginPath(); rrPath(g, 0, 0, VSEG.w, VSEG.h, 16); g.fill();
      const rb = g.createLinearGradient(0, 4, 0, VSEG.h - 4); rb.addColorStop(0, '#ff6a7a'); rb.addColorStop(0.45, '#d4142a'); rb.addColorStop(1, '#6e0010');
      g.fillStyle = rb; g.beginPath(); rrPath(g, 4, 4, VSEG.w - 8, VSEG.h - 8, 12); g.fill();
      const hl = g.createLinearGradient(0, 4, 0, VSEG.h / 2); hl.addColorStop(0, 'rgba(255,255,255,0.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = hl; g.beginPath(); rrPath(g, 8, 6, VSEG.w - 16, VSEG.h / 2 - 6, 9); g.fill();
    } else {
      const dk = g.createLinearGradient(0, 0, 0, VSEG.h); dk.addColorStop(0, '#2c1a22'); dk.addColorStop(1, '#170b11');
      g.fillStyle = dk; g.beginPath(); rrPath(g, 1, 1, VSEG.w - 2, VSEG.h - 2, 15); g.fill();
      g.strokeStyle = 'rgba(214,170,120,0.35)'; g.lineWidth = 2; g.beginPath(); rrPath(g, 2, 2, VSEG.w - 4, VSEG.h - 4, 14); g.stroke();
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); rrPath(g, 4, 4, VSEG.w - 8, 10, 6); g.fill();   // 上緣內陰影：看起來是凹下去的
    }
  });
  const SEG_ON = segTex(true), SEG_OFF = segTex(false);
  const LV_NAMES = ['关', '小', '中', '大'];
  const ROWS = [{ kind: 'bgm', name: '音乐', y: 136 }, { kind: 'sfx', name: '音效', y: 232 }];
  const SEG_X0 = PW - 30 - 4 * VSEG.w - 3 * VSEG.gap;
  ROWS.forEach((r) => {
    // 圖示：跟機台上的音量鍵一樣的紅框白面圓鈕，點一下可快速開／關
    const icon = new PIXI.Container(); icon.position.set(66, r.y); icon.eventMode = 'static'; icon.cursor = 'pointer'; icon.hitArea = new PIXI.Circle(0, 0, 38); volPanel.addChild(icon);
    r.iconG = new PIXI.Graphics(); icon.addChild(r.iconG);
    icon.on('pointerdown', (e) => { e.stopPropagation(); const cur = r.kind === 'bgm' ? lvBgm() : lvSfx(); setLevel(r.kind, cur === 0 ? 2 : 0); });
    const nm = panelText(r.name, 32, ['#ffffff', '#ffe6b0'], { stroke: '#2a0008', strokeThickness: 5 }); nm.anchor.set(0, 0.5); nm.position.set(112, r.y); volPanel.addChild(nm);
    r.segs = LV_NAMES.map((label, i) => {
      const c = new PIXI.Container(); c.position.set(SEG_X0 + i * (VSEG.w + VSEG.gap) + VSEG.w / 2, r.y); volPanel.addChild(c);
      const glow = new PIXI.Sprite(T.glow); glow.anchor.set(0.5); glow.width = VSEG.w * 1.7; glow.height = VSEG.h * 1.7; glow.tint = 0xffc23f; glow.blendMode = PIXI.BLEND_MODES.ADD; glow.alpha = 0; c.addChild(glow);
      const plate = new PIXI.Sprite(SEG_OFF); plate.anchor.set(0.5); plate.width = VSEG.w + 8; plate.height = VSEG.h + 8; c.addChild(plate);
      const t = panelText(label, 30, '#a99099', { stroke: '#1a0006', strokeThickness: 0 }); t.anchor.set(0.5); t.y = -1; c.addChild(t);
      c.eventMode = 'static'; c.cursor = 'pointer'; c.hitArea = new PIXI.Rectangle(-VSEG.w / 2 - 4, -VSEG.h / 2 - 8, VSEG.w + 8, VSEG.h + 16);
      c.on('pointerdown', (e) => { e.stopPropagation(); setLevel(r.kind, i); });
      return { glow, plate, t };
    });
  });
  function drawVolPanel() {
    ROWS.forEach((r) => {
      const lv = r.kind === 'bgm' ? lvBgm() : lvSfx(), g = r.iconG;
      g.clear().beginFill(0x000000, 0.35).drawCircle(0, 3, 35).endFill().beginFill(0xd8213b).drawCircle(0, 0, 34).endFill().lineStyle(2.5, 0xffd56a).drawCircle(0, 0, 31).lineStyle(0).beginFill(lv ? 0xf6f3f0 : 0xb9b2b0).drawCircle(0, 0, 28).endFill();
      if (r.kind === 'bgm') note(g, 0, 0, 0.92, lv ? 0x7a0614 : 0x5c5458, lv === 0); else speaker(g, -3, 0, 0.92, lv ? 0x7a0614 : 0x5c5458, lv);
      r.segs.forEach((s, i) => {
        const on = i === lv;
        s.plate.texture = on ? SEG_ON : SEG_OFF; s.glow.alpha = on ? 0.4 : 0;
        s.t.style.fill = on ? ['#ffffff', '#ffe9b8'] : '#a99099'; s.t.style.strokeThickness = on ? 5 : 0;
      });
    });
  }
  function openVol(v) { volLayer.visible = v == null ? !volLayer.visible : v; if (volLayer.visible) { M.addChild(volLayer); drawVolPanel(); } }
  volCatch.on('pointerdown', (e) => { e.stopPropagation(); openVol(false); });
  volBtn.on('pointerdown', (e) => { e.stopPropagation(); Au.unlock(); openVol(); });
  // 2026-11-12 使用者：「看漫畫、首頁和音量不能整合成一個介面嗎」「一定只能在外面嗎，不能在主體內嗎」
  // → 試過機台外的「菜单」鈕、機台右下的小圓鈕，使用者：「藏起來太奇怪，不能騰出一整條空間嗎」→ 定案：機台正上方一整條功能列（js/manga.js）
  volBtn.visible = false; volBtn.eventMode = 'none';   // 機台上的圓鈕收起來：功能都在機台上方那一整條功能列
  PK.VolumeUI = { get: () => ({ bgm: lvBgm(), sfx: lvSfx() }), set: (kind, lv) => { Au.unlock(); setLevel(kind, lv); }, redraw: () => drawVol() };
  // M 鍵：音樂與音效一起開／關
  let volMemo = null;
  function toggleAllSound() {
    const b = lvBgm(), f = lvSfx();
    if (b || f) { volMemo = [b, f]; setLevel('bgm', 0); setLevel('sfx', 0); }
    else { const m = volMemo || [3, 3]; setLevel('bgm', m[0]); setLevel('sfx', m[1]); }
  }

  // 下皿レバー
  const LVW = DX(DP.lever.w);
  const lever = new PIXI.Container(); lever.position.set(DX(DP.lever.x) - LVW / 2, DYv(DP.lever.y)); deck.addChild(lever);
  lever.addChild(new PIXI.Graphics().beginFill(0x1a0c14).drawRoundedRect(-6, -14, LVW + 12, 28, 14).endFill());
  const leverKnob = new PIXI.Container(); lever.addChild(leverKnob);
  leverKnob.addChild(new PIXI.Graphics().beginFill(0xd8357a).drawRoundedRect(-8, -20, LVW * 0.62, 40, 18).endFill().beginFill(0xff6fb0).drawRoundedRect(-4, -17, LVW * 0.6 - 6, 22, 12).endFill().beginFill(0xffffff, 0.35).drawRoundedRect(4, -14, LVW * 0.4, 6, 3).endFill());
  leverKnob.addChild(new PIXI.Graphics().beginFill(0xe6ecf6).lineStyle(2, 0x8a93a6).drawCircle(LVW * 0.52, 0, 13).endFill());
  lever.eventMode = 'static'; lever.cursor = 'pointer'; lever.hitArea = new PIXI.Rectangle(-14, -28, LVW + 28, 56);
  if (UNI) { lever.visible = false; lever.eventMode = 'none'; }
  let leverOpen = false;
  lever.on('pointerdown', () => { Au.unlock(); leverOpen = !leverOpen; lowerGate.off = leverOpen; play('reel_stop', { vol: 0.7 }); tween(leverKnob, { x: leverOpen ? LVW * 0.4 : 0 }, 0.18, 'back'); });

  // 手把
  const HC = { x: DX(DP.handle.x), y: DYv(DP.handle.y), r: DX(DP.handle.r), arc: DX(DP.handle.arc) };
  const handle = new PIXI.Container(); handle.position.set(HC.x, HC.y); deck.addChild(handle);
  const GA0 = 150 * DEG, GA1 = 390 * DEG;
  const knobHold = new PIXI.Sprite(T.glow); knobHold.anchor.set(0.5); knobHold.width = knobHold.height = HC.arc * 3; knobHold.blendMode = PIXI.BLEND_MODES.ADD; knobHold.alpha = 0; handle.addChild(knobHold);
  // 刻度環：不透明底座蓋住底圖印刷的燈，亮／暗一眼分得出來
  const GR0 = HC.arc - (UNI ? 8 : 13), GR1 = HC.arc + (UNI ? 8 : 13), SEGN = 24;
  const wedge = (g, r0, r1, a0, a1) => g.moveTo(Math.cos(a0) * r0, Math.sin(a0) * r0).arc(0, 0, r1, a0, a1).arc(0, 0, r0, a1, a0, true).closePath();
  const gaugeBack = new PIXI.Graphics(); handle.addChild(gaugeBack);
  if (!UNI) { gaugeBack.beginFill(0x06050a, 0.97).lineStyle(3, 0x9aa3b5, 0.9); wedge(gaugeBack, GR0 - 6, GR1 + 6, GA0 - 0.07, GA1 + 0.07); gaugeBack.endFill(); }   // 一體成形機台：用圖上的 LED 環當刻度環
  const gaugeSegs = [];
  for (let i = 0; i < SEGN; i++) {
    const a0 = GA0 + (GA1 - GA0) * (i + 0.12) / SEGN, a1 = GA0 + (GA1 - GA0) * (i + 0.88) / SEGN, am = (a0 + a1) / 2, u = (i + 0.5) / SEGN;
    const sg = new PIXI.Graphics().beginFill(0xffffff); wedge(sg, GR0, GR1, a0, a1); sg.endFill(); handle.addChild(sg);
    sg.col = u < 0.1 ? 0xb8c0d0 : u < 0.65 ? 0x2bff6a : u < 0.93 ? 0xffd23f : 0xff2a4d; sg.u0 = i / SEGN; sg.red = u >= 0.93;
    const gl = new PIXI.Sprite(T.glow); gl.anchor.set(0.5); gl.position.set(Math.cos(am) * (GR0 + GR1) / 2, Math.sin(am) * (GR0 + GR1) / 2); gl.scale.set(0.3); gl.blendMode = PIXI.BLEND_MODES.ADD; gl.tint = sg.col; handle.addChild(gl); sg.glow = gl;
    gaugeSegs.push(sg);
  }
  // 目前位置（白色大箭頭）、記憶位置（小金標）
  const curMark = new PIXI.Graphics().beginFill(0xffffff).lineStyle(2, 0x000000, 0.85).moveTo(GR1 + 2, 0).lineTo(GR1 + 22, -11).lineTo(GR1 + 22, 11).closePath().endFill(); handle.addChild(curMark);
  const savedMark = new PIXI.Graphics().beginFill(0xffc83d).moveTo(GR0 - 3, 0).lineTo(GR0 - 13, -5).lineTo(GR0 - 13, 5).closePath().endFill(); handle.addChild(savedMark);
  if (UNI) { curMark.visible = false; savedMark.visible = false; }   // 一體成形機台：旋鈕的紅色指針＋燈環就看得出力道；白色三角會戳到上珠盤的金框
  // 旋鈕：整顆會轉（握把橫桿＋紅色指針）
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  T.knob = texC(256, 256, (g) => {
    const c = 128;
    g.fillStyle = '#17191e'; g.beginPath(); g.arc(c, c, 124, 0, 6.28); g.fill();
    for (let i = 0; i < 48; i++) { const a = i / 48 * 6.28; g.strokeStyle = i % 2 ? '#565c69' : '#2a2e36'; g.lineWidth = 6; g.beginPath(); g.moveTo(c + Math.cos(a) * 103, c + Math.sin(a) * 103); g.lineTo(c + Math.cos(a) * 122, c + Math.sin(a) * 122); g.stroke(); }
    const ring = g.createLinearGradient(0, 0, 256, 256); ring.addColorStop(0, '#ffffff'); ring.addColorStop(0.5, '#646d7f'); ring.addColorStop(1, '#e8edf5');
    g.strokeStyle = ring; g.lineWidth = 8; g.beginPath(); g.arc(c, c, 100, 0, 6.28); g.stroke();
    const disc = g.createRadialGradient(c - 30, c - 34, 6, c, c, 98); disc.addColorStop(0, '#ffffff'); disc.addColorStop(0.45, '#c3cad6'); disc.addColorStop(1, '#596272');
    g.fillStyle = disc; g.beginPath(); g.arc(c, c, 96, 0, 6.28); g.fill();
    g.globalAlpha = 0.1; for (let r = 8; r < 96; r += 3) { g.strokeStyle = (r / 3) % 2 ? '#000' : '#fff'; g.lineWidth = 1; g.beginPath(); g.arc(c, c, r, 0, 6.28); g.stroke(); } g.globalAlpha = 1;
    g.save(); g.translate(c, c);
    g.fillStyle = 'rgba(0,0,0,0.5)'; rr(g, -18, -88, 44, 190, 20); g.fill();
    const bar = g.createLinearGradient(-22, 0, 22, 0); bar.addColorStop(0, '#4c5462'); bar.addColorStop(0.35, '#f6f8fc'); bar.addColorStop(0.6, '#a9b2c1'); bar.addColorStop(1, '#353b46');
    g.fillStyle = bar; rr(g, -22, -94, 44, 188, 20); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2; for (let y = 30; y < 86; y += 10) { g.beginPath(); g.moveTo(-14, y); g.lineTo(14, y); g.stroke(); }
    g.fillStyle = '#ff2a4d'; rr(g, -13, -122, 26, 70, 13); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.75)'; rr(g, -6, -114, 8, 30, 4); g.fill();
    const cap = g.createRadialGradient(-6, -6, 2, 0, 0, 20); cap.addColorStop(0, '#ffffff'); cap.addColorStop(1, '#7d8696');
    g.fillStyle = cap; g.beginPath(); g.arc(0, 0, 18, 0, 6.28); g.fill();
    g.restore();
  });
  const KR = HC.r * (UNI ? 1 : 1.16);
  // 一體成形機台：旋鈕本體（鍍鉻圓盤）畫在圖上，只疊一根會跟著轉的紅色指針
  if (UNI) T.knob = texC(256, 256, (g) => {
    g.save(); g.translate(128, 128);
    g.fillStyle = 'rgba(0,0,0,0.28)'; rr(g, -14, -118, 28, 76, 14); g.fill();
    g.fillStyle = '#ff2a4d'; rr(g, -11, -122, 22, 70, 11); g.fill(); g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.7)'; rr(g, -5, -114, 7, 30, 4); g.fill();
    g.restore();
  });
  const knob = new PIXI.Container(); handle.addChild(knob);
  const knobSp = new PIXI.Sprite(T.knob); knobSp.anchor.set(0.5); knobSp.width = knobSp.height = KR * 2 * 256 / 248; knob.addChild(knobSp);
  // 還沒轉過時的提示：順時針箭頭＋旋鈕輕晃
  let handleHint = true;
  try { handleHint = localStorage.getItem('pk_handle_learned') !== '1'; } catch (e) { /* 忽略 */ }
  const hintG = new PIXI.Graphics(); handle.addChild(hintG);
  {
    const hr = KR * 0.66, h0 = 200 * DEG, h1 = 320 * DEG, tx = -Math.sin(h1), ty = Math.cos(h1), px = Math.cos(h1) * hr, py = Math.sin(h1) * hr;
    [[13, 0x000000, 0.7], [7, 0xffffff, 1]].forEach((s) => { hintG.lineStyle(s[0], s[1], s[2]).moveTo(Math.cos(h0) * hr, Math.sin(h0) * hr).arc(0, 0, hr, h0, h1); });
    hintG.lineStyle(3, 0x000000, 0.7).beginFill(0xffffff).moveTo(px + tx * 16, py + ty * 16).lineTo(px - ty * 14, py + tx * 14).lineTo(px + ty * 14, py - tx * 14).closePath().endFill();
  }
  function learnHandle() { if (!handleHint) return; handleHint = false; try { localStorage.setItem('pk_handle_learned', '1'); } catch (e) { /* 忽略 */ } }
  // STOP 不能放在手把容器裡（超出手把點擊範圍會被整個略過）
  const stopBtn = new PIXI.Container(); stopBtn.position.set(DP.stop ? DX(DP.stop.x) : HC.x - HC.arc - 26, DP.stop ? DYv(DP.stop.y) : HC.y - HC.arc * 0.55); deck.addChild(stopBtn);
  if (UNI) { stopBtn.visible = false; stopBtn.eventMode = 'none'; }   // 停止鍵拿掉（使用者：太小也沒必要；旋鈕轉回 0 就停）
  stopBtn.addChild(new PIXI.Graphics().beginFill(0x0c0a10).drawCircle(0, 4, 27).endFill().beginFill(0xd8213b).lineStyle(3, 0xffffff, 0.7).drawCircle(0, 0, 23).endFill());
  const stopTxt = new PIXI.Text('停止', { fontFamily: '"Noto Sans SC", sans-serif', fontWeight: '900', fontSize: 13, fill: '#fff' }); stopTxt.anchor.set(0.5); stopBtn.addChild(stopTxt);
  stopBtn.eventMode = 'static'; stopBtn.cursor = 'pointer'; stopBtn.hitArea = new PIXI.Circle(0, 0, 30);
  const stopLit = new PIXI.Sprite(T.glow); stopLit.anchor.set(0.5); stopLit.scale.set(0.75); stopLit.tint = 0xff2a4d; stopLit.blendMode = PIXI.BLEND_MODES.ADD; stopLit.alpha = 0; stopBtn.addChildAt(stopLit, 0);

  // 轉動手把就發射（手一直放在手把上），轉回 0 停止；STOP 按一下暫停／再按一下繼續
  const U = { power: 0, holding: false, stopped: false, saved: 0.36, forceMode: null, isMobile: false };
  try { const sv = parseFloat(localStorage.getItem('pk_proto_power')); if (sv > 0) U.saved = sv; } catch (e) { /* 忽略 */ }
  let needRight = false;
  function drawGauge(t) {
    // 亮到目前力道為止；沒亮的格子是暗灰，不會跟底圖混在一起
    gaugeSegs.forEach((sg) => {
      const lit = sg.u0 < U.power - 0.001, pulse = needRight && sg.red ? 0.55 + 0.45 * Math.sin(t * 10) : 1;
      sg.tint = lit ? sg.col : (needRight && sg.red ? 0x7a1424 : 0x2a2632);
      sg.alpha = lit ? pulse : (needRight && sg.red ? 0.6 + 0.4 * pulse : UNI ? 0.45 : 1);
      sg.glow.alpha = lit ? 0.5 * pulse : 0;
    });
    curMark.rotation = GA0 + (GA1 - GA0) * U.power;
    savedMark.rotation = GA0 + (GA1 - GA0) * U.saved;
    // 旋鈕：跟著力道轉；未學會前每 2.4 秒晃一下
    let wig = 0;
    if (handleHint && !U.holding) { const ph = t % 2.4; if (ph < 0.9) wig = Math.sin(ph / 0.9 * Math.PI * 2) * 0.28; }
    knob.rotation = (GA1 - GA0) * (U.power - 0.5) + wig;
    knob.scale.set(U.holding ? 1.05 : 1);
    hintG.visible = (handleHint || U.power <= 0.04) && !U.holding && !U.stopped; hintG.alpha = 0.55 + 0.45 * Math.sin(t * 5);
  }
  function tick() { play('reel_tick', { vol: 0.6 }); if (navigator.vibrate && ('ontouchstart' in window) && navigator.userActivation && navigator.userActivation.hasBeenActive) { try { navigator.vibrate(8); } catch (e) { /* 忽略 */ } } }
  function setPower(p, fromDrag) {
    const old = U.power; p = Math.max(0, Math.min(1, p));
    if (fromDrag) {
      if (Math.abs(p - U.saved) < 0.012 && Math.abs(old - U.saved) >= 0.012) { p = U.saved; tick(); }
      if (p >= 0.995 && old < 0.995) { p = 1; tick(); }
    }
    U.power = p; knob.rotation = (GA1 - GA0) * (p - 0.5);
  }
  setPower(U.power);
  handle.eventMode = 'static'; handle.cursor = 'grab'; handle.hitArea = new PIXI.Circle(0, 0, HC.arc + 30);
  let drag = null;
  handle.on('pointerdown', (e) => {
    if (e.target === stopBtn) return;
    Au.unlock(); start();
    const p = e.getLocalPosition(handle);
    drag = { id: e.pointerId, a: Math.atan2(p.y, p.x), y: e.global.y, near: Math.hypot(p.x, p.y) < 40, p0: U.power };
    U.holding = true; handle.cursor = 'grabbing';
  });
  // 舞台不可設成 static：Pixi 會把上層不可互動的精靈（全機閃光層等）當成遮擋物，按鈕全部點不到
  app.stage.eventMode = 'passive';
  // 拖曳與放開改用視窗事件（手指滑出畫布也能繼續轉）
  const canvasPt = (e) => { const r = app.view.getBoundingClientRect(); return new PIXI.Point(e.clientX - r.left, e.clientY - r.top); };
  window.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const gp = canvasPt(e), p = handle.toLocal(gp);
    if (drag.near || Math.hypot(p.x, p.y) < 36) { const dy = gp.y - drag.y; drag.y = gp.y; setPower(U.power - dy / (260 * M.scale.x), true); }
    else { const a = Math.atan2(p.y, p.x); let d = a - drag.a; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; drag.a = a; setPower(U.power + d / (GA1 - GA0), true); }
    if (Math.abs(U.power - drag.p0) > 0.03) learnHandle();
  });
  const endDrag = (e) => {
    if (drag && (!e || e.pointerId === drag.id)) {
      drag = null; U.holding = false; handle.cursor = 'grab';
      if (U.power > 0.12 && U.power < 0.8) { U.saved = U.power; try { localStorage.setItem('pk_proto_power', U.power); } catch (e2) { /* 忽略 */ } }
    }
    pushUp();
  };
  window.addEventListener('pointerup', endDrag); window.addEventListener('pointercancel', endDrag);
  function toggleStop(v) { U.stopped = v == null ? !U.stopped : v; tick(); }
  stopBtn.on('pointerdown', (e) => { e.stopPropagation(); Au.unlock(); start(); toggleStop(); stopBtn.scale.set(0.9); setTimeout(() => stopBtn.scale.set(1), 120); });
  app.view.addEventListener('wheel', (e) => { e.preventDefault(); setPower(U.power - e.deltaY * 0.0006, true); learnHandle(); }, { passive: false });

  // PUSH：接到 PK.Director 的要求
  function pushDown() {
    pushShade.alpha = 0.35; tween(pushShade, { alpha: 0 }, 0.25);
    const rq = PK.Game.pushReq;
    if (!rq) { play('reel_tick', { vol: 0.4 }); return; }
    if (rq.type === 'long') rq.holding = true; else rq.done = true;
  }
  function pushUp() { const rq = PK.Game.pushReq; if (rq) rq.holding = false; }
  push.on('pointerdown', () => { Au.unlock(); start(); pushDown(); });

  // ---------------------------------------------------------
  // 燈光、閃光、震動、飛び出し
  // ---------------------------------------------------------
  let lampMode = 'idle', lampT = 0;
  const hsv = (h, s, v) => { const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); }; return (Math.round(f(5) * 255) << 16) | (Math.round(f(3) * 255) << 8) | Math.round(f(1) * 255); };
  function lampColor(i, n) {
    const t = lampT;
    switch (lampMode) {
      case 'reach': return (Math.floor(t * 8) + i) % 2 ? 0xff2244 : 0xff9a2a;
      // 大当り中：彩虹流水，每 0.6 秒整圈白閃一下
      case 'bonus': return (t % 0.6) < 0.08 ? 0xffffff : hsv(((i / n) * 720 - t * 420 + 7200) % 360, 0.85, 1);
      case 'hot': return (Math.floor(t * 16) % 2) ? 0xffffff : hsv((i / n * 360 + t * 900) % 360, 1, 1);
      case 'rush': return (Math.floor(t * 10 + i * 0.5) % 3) === 0 ? 0xffffff : 0x2aa8ff;
      case 'jitan': return (Math.floor(t * 8 + i * 0.5) % 3) === 0 ? 0xffe066 : 0xff4a1a;
      case 'lt': return hsv(40 + 15 * Math.sin(t * 8 + i), 0.85, 0.75 + 0.25 * Math.sin(t * 12 + i * 0.7));
      default: { const k = (Math.sin(t * 2 - i * 0.4) + 1) / 2; return hsv(20 + 25 * k, 0.9, 0.35 + 0.55 * k); }
    }
  }
  // 「+15」賞球飄字
  const payPops = [], payPopCache = {};
  function payPopTex(n) {
    if (payPopCache[n]) return payPopCache[n];
    return (payPopCache[n] = texC(160, 70, (g) => {
      g.font = '900 52px "Dela Gothic One", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 9; g.strokeStyle = '#3a0008'; g.strokeText('+' + n, 80, 36);
      const gr = g.createLinearGradient(0, 12, 0, 60); gr.addColorStop(0, '#fff7c0'); gr.addColorStop(0.5, '#ffd23f'); gr.addColorStop(1, '#ff8a00');
      g.fillStyle = gr; g.fillText('+' + n, 80, 36);
    }));
  }
  function stepPayPops(dt) {
    for (let i = payPops.length - 1; i >= 0; i--) {
      const p = payPops[i]; p.t += dt;
      p.s.y -= dt * 70; p.s.scale.set(0.5 + Math.min(1, p.t * 6) * 0.25);
      p.s.alpha = p.t < 0.6 ? 1 : Math.max(0, 1 - (p.t - 0.6) / 0.4);
      if (p.t > 1) { p.s.destroy(); payPops.splice(i, 1); }
    }
  }
  // 亮度（0..1）：平常微亮，大当り全亮爆閃
  function lampLevel(i, n) {
    const t = lampT;
    switch (lampMode) {
      case 'bonus': return (Math.floor(t * 9) + i) % 3 ? 1 : 0.45;
      case 'hot': return (Math.floor(t * 16) % 2) ? 1 : 0.55;
      case 'lt': return 0.75 + 0.25 * Math.sin(t * 12 + i * 0.7);
      case 'rush': case 'jitan': return (Math.floor(t * 10 + i * 0.5) % 3) === 0 ? 1 : 0.5;
      case 'reach': return (Math.floor(t * 8) + i) % 2 ? 0.95 : 0.45;
      default: return 0.18 + 0.3 * (Math.sin(t * 2 - i * 0.4) + 1) / 2;
    }
  }
  const BIG_LAMP = { bonus: 1, hot: 1, lt: 1 };

  // ---------------------------------------------------------
  // 枠ランプ：機台四周的大型燈（平常微亮，大当り時整台閃爍）
  // ---------------------------------------------------------
  const lampLayer = new PIXI.Container(); M.addChild(lampLayer);
  const lampMask = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(0, 0, MW, MH, 34).endFill(); M.addChild(lampMask); lampLayer.mask = lampMask;   // 光不溢出機台外
  let lampKick = 0, lampKickCol = 0xffffff;
  // 1) 整台外緣光暈
  const edgeGlow = new PIXI.Sprite(texC(250, 470, (g, w, h) => {
    const k = 26;
    g.globalCompositeOperation = 'lighter';
    const side = (x0, y0, x1, y1, rx, ry, rw, rh) => { const gr = g.createLinearGradient(x0, y0, x1, y1); gr.addColorStop(0, 'rgba(255,255,255,0.9)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(rx, ry, rw, rh); };
    side(0, 0, k, 0, 0, 0, k, h); side(w, 0, w - k, 0, w - k, 0, k, h); side(0, 0, 0, k, 0, 0, w, k); side(0, h, 0, h - k, 0, h - k, w, k);
  }));
  edgeGlow.width = MW; edgeGlow.height = MH; edgeGlow.blendMode = PIXI.BLEND_MODES.ADD; edgeGlow.alpha = 0; lampLayer.addChild(edgeGlow);
  // 1b) 外框整片染色：盤面以外的外框區域（不含盤面本身），依狀態染成藍（RUSH）／橘紅（CHANCE TIME）／彩虹（大獎）
  const frameWash = new PIXI.Graphics(); frameWash.blendMode = PIXI.BLEND_MODES.ADD; frameWash.alpha = 0;
  {
    const pts = []; for (let a = 0; a < 360; a += 3) { const q = PK.ellPt(a, -(7 + 26 / BS)); pts.push(BX + q[0] * BS, BY + q[1] * BS); }
    frameWash.beginFill(0xffffff).drawRect(0, 0, MW, DECK_TOP).beginHole().drawPolygon(pts).endHole().endFill();
  }
  lampLayer.addChild(frameWash); frameWash.visible = !UNI;   // 一體成形機台外殼是白的，整片染色會過曝成一層白（使用者：閃光多疊了一層很明顯）
  // 2) 盤面外圈第二道燈（只放在四個斜角、不超出機台的位置）
  const outerLeds = [];
  for (let d = 0; d < (UNI ? 0 : 360); d += 2.6) {
    const q = PK.ellPt(d, -(7 + 44 / BS)), x = BX + q[0] * BS, y = BY + q[1] * BS;
    if (x < 18 || x > MW - 18 || y < HEADER_H + 22 || y > winCy + winRy + 30) continue;
    const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(0.15); s.blendMode = PIXI.BLEND_MODES.ADD; lampLayer.addChild(s); outerLeds.push(s);
  }
  // 3) 四角大燈（左右交互爆閃）
  const cornerPos = UNI ? [[UNI.speakers[0][0] * UK, UNI.speakers[0][1] * UK], [UNI.speakers[1][0] * UK, UNI.speakers[1][1] * UK], [50 * UK, 1200 * UK], [974 * UK, 1200 * UK]]
    : [[64, HEADER_H + 70], [MW - 64, HEADER_H + 70], [64, winCy + winRy - 40], [MW - 64, winCy + winRy - 40]];
  const cornerLamps = cornerPos.map(([x, y], k) => {
    const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(UNI ? 1.15 : 2.2); s.blendMode = PIXI.BLEND_MODES.ADD; s.alpha = 0; s.k = k; lampLayer.addChild(s); return s;
  });
  // 4) 頂部燈（logo 後方）
  const topLamp = new PIXI.Sprite(T.glow); topLamp.anchor.set(0.5); topLamp.position.set(MW / 2, 6 + HEADER_H / 2); topLamp.scale.set(4.2, 1.8); topLamp.blendMode = PIXI.BLEND_MODES.ADD; topLamp.alpha = 0; lampLayer.addChild(topLamp);
  // 5) 台座上緣一排燈
  const deckLeds = [];
  for (let i = 0; i < (UNI ? 0 : 30); i++) { const s = new PIXI.Sprite(T.glow); s.anchor.set(0.5); s.position.set(36 + i * (MW - 72) / 29, DECK_TOP + 6); s.scale.set(0.16); s.blendMode = PIXI.BLEND_MODES.ADD; lampLayer.addChild(s); deckLeds.push(s); }
  // 6) 一體成形機台：燈打在圖上真的有燈的地方——兩側直立 LED 燈管（整條光＋跑燈）、上方兩個喇叭燈圈
  const uniLeds = [], tubeGlows = [];
  if (UNI) {
    UNI.tubes.forEach(([x0, y0, x1, y1]) => {
      const cx = (x0 + x1) / 2 * UK, h = (y1 - y0) * UK, w = (x1 - x0) * UK;
      const gl = new PIXI.Sprite(texC(32, 256, (g) => { const gr = g.createLinearGradient(0, 0, 32, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,1)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 32, 256);
        g.globalCompositeOperation = 'destination-in'; const vg = g.createLinearGradient(0, 0, 0, 256); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.1, 'rgba(0,0,0,1)'); vg.addColorStop(0.9, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = vg; g.fillRect(0, 0, 32, 256); }));   // 上下兩端淡出，不會有硬邊
      gl.anchor.set(0.5, 0); gl.position.set(cx, y0 * UK); gl.width = w * 2.2; gl.height = h; gl.blendMode = PIXI.BLEND_MODES.ADD; gl.alpha = 0; lampLayer.addChild(gl); tubeGlows.push(gl);
      for (let i = 0; i < 26; i++) { const sp = new PIXI.Sprite(T.glow); sp.anchor.set(0.5); sp.position.set(cx, y0 * UK + (i + 0.5) * h / 26); sp.scale.set(0.14); sp.blendMode = PIXI.BLEND_MODES.ADD; lampLayer.addChild(sp); uniLeds.push(sp); }
    });
    UNI.speakers.forEach(([x, y, r]) => { for (let i = 0; i < 18; i++) { const a = i / 18 * Math.PI * 2, sp = new PIXI.Sprite(T.glow); sp.anchor.set(0.5); sp.position.set((x + Math.cos(a) * r * 0.9) * UK, (y + Math.sin(a) * r * 0.9) * UK); sp.scale.set(0.12); sp.blendMode = PIXI.BLEND_MODES.ADD; lampLayer.addChild(sp); uniLeds.push(sp); } });
  }
  function stepLamps(dt) {
    lampKick = Math.max(0, lampKick - dt * 3.2);
    const big = !!BIG_LAMP[lampMode], kick = lampKick;
    const paint = (arr, base, boost) => arr.forEach((s, i) => {
      const lv = lampLevel(i, arr.length);
      s.tint = kick > 0.45 ? lampKickCol : lampColor(i, arr.length);
      s.alpha = Math.min(1, lv + kick);
      s.scale.set(base + (big ? boost * lv : 0) + kick * boost * 0.6);
    });
    paint(ringLeds, 0.16, 0.14); paint(outerLeds, 0.13, 0.13); paint(headLeds, 0.12, 0.12); paint(deckLeds, 0.14, 0.14); paint(uniLeds, 0.13, 0.12);
    tubeGlows.forEach((gl) => { gl.tint = kick > 0.45 ? lampKickCol : lampColor(0, 1); gl.alpha = big ? 0.3 + 0.3 * lampLevel(0, 1) + kick * 0.2 : lampMode === 'idle' ? 0.1 : 0.22; });
    paint(BD.frameLeds || [], 0.1, 0.08); paint(BD.hesoRing || [], 0.11, 0.07); paint(BD.pocketLeds || [], 0.09, 0.05);
    if (BD.vChevs) BD.vChevs.forEach((c, i) => { c.tint = kick > 0.45 ? lampKickCol : lampColor(i, 3); c.alpha = 0.35 + 0.65 * ((Math.floor(lampT * (big ? 10 : 4)) % 3) === i ? 1 : 0.25); });   // V 字導槽由上往下跑燈
    const col0 = kick > 0.45 ? lampKickCol : lampColor(0, 1);
    cornerLamps.forEach((s) => {
      s.tint = kick > 0.45 ? lampKickCol : lampColor(s.k * 3, 12);
      const alt = (Math.floor(lampT * 5) + s.k + (s.k >> 1)) % 2;
      const modeOn = lampMode === 'rush' || lampMode === 'jitan';   // RUSH／CHANCE TIME：四角燈中等亮度交互閃，整台顏色一看就知道
      s.alpha = (big ? (alt ? 0.95 : 0.3) * 0.9 + kick * 0.3 : modeOn ? (alt ? 0.6 : 0.2) + kick * 0.3 : lampMode === 'idle' ? 0.06 + 0.05 * Math.sin(lampT * 2 + s.k) : lampMode === 'reach' ? 0.35 * lampLevel(s.k, 4) : 0.25 * lampLevel(s.k, 4)) * (UNI ? 0.45 : 1);
    });
    tube.tint = col0; tube.alpha = big ? 0.75 + 0.25 * lampLevel(0, 1) + kick * 0.3 : lampMode === 'idle' ? 0.5 : 0.8;
    topLamp.tint = col0; topLamp.alpha = (big ? 0.55 + 0.35 * lampLevel(0, 1) + kick * 0.3 : lampMode === 'idle' ? 0.08 : lampMode === 'rush' || lampMode === 'jitan' ? 0.45 : 0.25) * (UNI ? 0.3 : 1);
    { const mo = lampMode === 'rush' ? 0x1a6cff : lampMode === 'jitan' ? 0xff4a10 : lampMode === 'lt' ? 0xffb000 : big ? col0 : 0;
      frameWash.tint = mo || 0xffffff; frameWash.alpha = !mo ? 0 : big ? 0.16 + 0.12 * lampLevel(0, 1) + kick * 0.15 : 0.22 + 0.08 * Math.sin(lampT * 3); }
    edgeGlow.tint = col0; edgeGlow.alpha = (big ? 0.45 + 0.4 * lampLevel(1, 2) + kick * 0.4 : lampMode === 'reach' ? 0.25 * lampLevel(0, 1) : lampMode === 'rush' || lampMode === 'jitan' ? 0.3 + 0.1 * Math.sin(lampT * 4) : 0) * (UNI ? 0.25 : 1);
  }

  const popLayer = new PIXI.Container(); M.addChild(popLayer);
  const popMask = new PIXI.Graphics().beginFill(0xffffff).drawRoundedRect(0, 0, MW, MH, 34).endFill(); M.addChild(popMask); popLayer.mask = popMask;
  const flashAll = new PIXI.Graphics().beginFill(0xffffff).drawRect(0, 0, MW, MH).endFill(); flashAll.alpha = 0; flashAll.blendMode = PIXI.BLEND_MODES.ADD; M.addChild(flashAll);
  if (UNI) { const fm = new PIXI.Graphics(); fm.beginFill(0xffffff); for (let a = 0; a <= 360; a += 3) { const q = PK.ellPt(a, -4); if (a) fm.lineTo(BX + q[0] * BS, BY + q[1] * BS); else fm.moveTo(BX + q[0] * BS, BY + q[1] * BS); } fm.closePath().endFill(); M.addChild(fm); flashAll.mask = fm; }   // 一體成形機台：爆閃只打在盤面，不把白色外殼洗白
  let shakeK = 0;
  const popSpin = [];
  async function popOut(key, o) {
    o = o || {}; if (!T[key]) return;
    const lcd = L.lcd, cx = BX + (lcd.x + lcd.w / 2) * BS, cy = BY + (lcd.y + lcd.h / 2) * BS;
    const c = new PIXI.Container(); c.position.set(cx, cy); popLayer.addChild(c);
    const rc = new PIXI.Container(); c.addChild(rc);
    for (let i = 0; i < 20; i++) { const r = new PIXI.Sprite(T.ray); r.anchor.set(0, 0.5); r.rotation = i / 20 * Math.PI * 2; r.width = 1100; r.height = 150; r.tint = o.rayColor || 0xffd23f; r.blendMode = PIXI.BLEND_MODES.ADD; rc.addChild(r); }
    rc.alpha = 0; popSpin.push(rc);
    const gl = new PIXI.Sprite(T.glow); gl.anchor.set(0.5); gl.scale.set(9); gl.tint = o.rayColor || 0xffd23f; gl.blendMode = PIXI.BLEND_MODES.ADD; gl.alpha = 0; c.addChild(gl);
    const sp = new PIXI.Sprite(T[key]); sp.anchor.set(0.5); c.addChild(sp);
    const base = (o.w || 940) / sp.texture.width;
    sp.scale.set(base * 0.25); sp.alpha = 0;
    tween(sp, { alpha: 1 }, 0.06); tween(rc, { alpha: 0.38 }, 0.2); tween(gl, { alpha: 0.35 }, 0.15);
    await tween(sp, { s: base * 1.18 }, 0.22, 'out'); await tween(sp, { s: base }, 0.18, 'back');
    shakeK = Math.max(shakeK, o.shake || 14);
    await wait(o.hold || 1.1);
    tween(rc, { alpha: 0 }, 0.3); tween(gl, { alpha: 0 }, 0.3);
    await tween(sp, { s: base * 0.4, alpha: 0 }, 0.35, 'inOut');
    popSpin.splice(popSpin.indexOf(rc), 1); c.destroy({ children: true });
  }
  // 液晶的重要美術字同時從液晶衝出到整台
  const POP = {
    fx_ooatari: { w: 1000, hold: 2.4, rayColor: 0xffd23f, shake: 30 }, fx_rush: { w: 1000, hold: 2.6, rayColor: 0x2aa8ff, shake: 26 },
    fx_lt: { w: 1000, hold: 2.6, rayColor: 0xffd23f, shake: 30 }, fx_gekiatsu: { w: 900, hold: 0.9, rayColor: 0xff3355, shake: 16 },
    fx_reach: { w: 620, hold: 0.35, rayColor: 0xff3355, shake: 6 }, fx_homerun: { w: 900, hold: 0.9, rayColor: 0xffd23f, shake: 16 },
  };
  const origBanner = PK.LCD.banner;
  PK.LCD.banner = function (text, o) { if (o && o.img && POP[o.img] && T[o.img]) popOut(o.img, POP[o.img]); return origBanner(text, o); };

  // ---------------------------------------------------------
  // 整台大字：蓋滿整台砸下來（777、BONUS、打右邊、ROUND、獲得出玉…）
  // ---------------------------------------------------------
  const slamCache = {};
  const SLAM_FILL = {
    // 填色不要太白：字外面那一圈是亮金色，字本身也接近白色的話，筆畫多的中文字（最、終、壘、獎）會整個糊成一片
    gold: [['#fff3a8', 0], ['#ffd23f', 0.3], ['#c47a00', 0.52], ['#ffc21a', 0.66], ['#ffe680', 1]],
    red: [['#ff8a96', 0], ['#ff2a40', 0.35], ['#a0001a', 0.52], ['#f01830', 0.68], ['#ff6a78', 1]],
    blue: [['#a8e4ff', 0], ['#3ab8ff', 0.35], ['#0a3aa8', 0.52], ['#2a8cff', 0.68], ['#8ad4ff', 1]],
    white: [['#ffffff', 0], ['#ffffff', 0.45], ['#b8c4d6', 0.55], ['#ffffff', 1]],
  };
  function slamTex(text, kind) {
    const key = text + '|' + kind; if (slamCache[key]) return slamCache[key];
    const fs = 200, f = '900 ' + fs + 'px "Noto Sans SC", sans-serif';
    const mg = document.createElement('canvas').getContext('2d'); mg.font = f;
    const tw = Math.ceil(mg.measureText(text).width), W = tw + 140, H = fs + 150, cx = W / 2, cy = H / 2;
    return (slamCache[key] = texC(W, H, (g) => {
      g.font = f; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      // 立體厚度
      for (let d = 14; d >= 1; d--) { g.fillStyle = d > 7 ? '#1a0006' : '#5a1a00'; g.fillText(text, cx + d * 0.6, cy + d); }
      g.lineWidth = 30; g.strokeStyle = '#1a0006'; g.strokeText(text, cx, cy);
      const rim = g.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2); rim.addColorStop(0, '#fff6c8'); rim.addColorStop(0.45, '#ffd23f'); rim.addColorStop(0.55, '#8a5200'); rim.addColorStop(1, '#ffe680');
      g.lineWidth = 20; g.strokeStyle = rim; g.strokeText(text, cx, cy);
      g.lineWidth = 9; g.strokeStyle = '#2a0008'; g.strokeText(text, cx, cy);   // 字和金邊之間一圈深色細線：筆畫之間是暗的，筆畫多的字才分得開
      let fill;
      if (kind === 'rainbow') { fill = g.createLinearGradient(cx - tw / 2, 0, cx + tw / 2, 0); ['#ff2a4d', '#ff8a00', '#ffe066', '#3bff6e', '#2aa8ff', '#b050ff'].forEach((c, i, a) => fill.addColorStop(i / (a.length - 1), c)); }
      else { fill = g.createLinearGradient(0, cy - fs / 2, 0, cy + fs / 2); (SLAM_FILL[kind] || SLAM_FILL.gold).forEach(([c, st]) => fill.addColorStop(st, c)); }
      g.fillStyle = fill; g.fillText(text, cx, cy);
      // 上半部亮面
      const t2 = document.createElement('canvas'); t2.width = W; t2.height = H; const h2 = t2.getContext('2d');
      h2.font = f; h2.textAlign = 'center'; h2.textBaseline = 'middle'; h2.fillStyle = '#fff'; h2.fillText(text, cx, cy);
      h2.globalCompositeOperation = 'source-in'; const hl = h2.createLinearGradient(0, cy - fs / 2, 0, cy); hl.addColorStop(0, 'rgba(255,255,255,0.4)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); h2.fillStyle = hl; h2.fillRect(0, 0, W, H);
      g.drawImage(t2, 0, 0);
    }));
  }
  async function slam(text, o) {
    o = o || {};
    const tex = (o.syms && o.syms.every((d) => T['sym_' + d])) ? null : slamTex(text, o.kind || 'gold');
    const c = new PIXI.Container(); c.position.set(MW / 2, o.y || 600); popLayer.addChild(c);
    if (o.band) { const bd = new PIXI.Graphics().beginFill(hex(o.band), 0.88).drawRect(-MW, -120, MW * 2, 240).endFill(); bd.scale.y = 0; c.addChild(bd); tween(bd, { sy: 1 }, 0.15); }
    const rc = new PIXI.Container(); c.addChild(rc);
    for (let i = 0; i < 24; i++) { const r = new PIXI.Sprite(T.ray); r.anchor.set(0, 0.5); r.rotation = i / 24 * Math.PI * 2; r.width = 1300; r.height = 170; r.tint = o.rays || 0xffd23f; r.blendMode = PIXI.BLEND_MODES.ADD; rc.addChild(r); }
    rc.alpha = 0; popSpin.push(rc);
    // 數字（例如 777）有 3D 圖柄就用圖柄排在一起，否則用文字貼圖
    let sp, tw, th;
    if (o.syms && o.syms.every((d) => T['sym_' + d])) {
      sp = new PIXI.Container(); th = 300; const gap = 6;
      const parts = o.syms.map((d) => { const s2 = new PIXI.Sprite(T['sym_' + d]); s2.anchor.set(0.5); s2.scale.set(th / s2.texture.height); return s2; });
      const ws = parts.map((s2) => s2.texture.width * s2.scale.x); tw = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
      let x = -tw / 2; parts.forEach((s2, i) => { s2.x = x + ws[i] / 2; x += ws[i] + gap; sp.addChild(s2); });
    } else { sp = new PIXI.Sprite(tex); sp.anchor.set(0.5); tw = tex.width; th = tex.height; }
    c.addChild(sp);
    const base = Math.min((o.w || 900) / tw, (o.h || 420) / th);
    sp.scale.set(base * 3); sp.alpha = 0;
    let sub = null;
    if (o.sub) { const st = slamTex(o.sub, o.subKind || 'white'); sub = new PIXI.Sprite(st); sub.anchor.set(0.5); sub.y = th * base * 0.5 + 40; const sb = Math.min(620 / st.width, 110 / st.height); sub.scale.set(sb); sub.alpha = 0; c.addChild(sub); tween(sub, { alpha: 1 }, 0.2, 'out', 0.25); }
    tween(sp, { alpha: 1 }, 0.06); tween(rc, { alpha: 0.45 }, 0.2);
    await tween(sp, { s: base }, 0.2, 'in');
    shakeK = Math.max(shakeK, o.shake || 26); flashAll.tint = 0xffffff; flashAll.alpha = 0.3; lampKick = Math.max(lampKick, 1.2); lampKickCol = 0xffffff;
    boardParts.emit({ x: PK.LAYOUT.field.cx, y: (c.y - BY) / BS, n: 40, color: [0xffe066, 0xffffff, 0xff3355, 0x2aa8ff].map((v) => v), vmin: 200, vmax: 700, life: 0.9 });
    // 停留時微微脈動
    const hold = o.hold || 1.2, t0 = performance.now();
    const pulse = () => { if (sp.destroyed) return; const k = (performance.now() - t0) / 1000; sp.scale.set(base * (1 + 0.035 * Math.sin(k * 14))); if (k < hold) requestAnimationFrame(pulse); };
    pulse();
    await wait(hold);
    tween(rc, { alpha: 0 }, 0.25); if (sub) tween(sub, { alpha: 0 }, 0.2);
    await tween(sp, { s: base * 1.3, alpha: 0 }, 0.25, 'in');
    popSpin.splice(popSpin.indexOf(rc), 1); c.destroy({ children: true });
  }
  // 機關降臨：金色翅膀棒球從上方衝下來到盤面正中央，放大、旋轉光芒、爆炸，然後飛回去
  async function gimmick(hold) {
    if (!T.yaku_ball) return;
    yaku.alpha = 0;
    const c = new PIXI.Container(); c.position.set(MW / 2, -260); popLayer.addChild(c);
    const rc = new PIXI.Container(); c.addChild(rc);
    for (let i = 0; i < 28; i++) { const r = new PIXI.Sprite(T.ray); r.anchor.set(0, 0.5); r.rotation = i / 28 * Math.PI * 2; r.width = 1400; r.height = 200; r.tint = i % 2 ? 0xffd23f : 0xffffff; r.blendMode = PIXI.BLEND_MODES.ADD; rc.addChild(r); }
    rc.alpha = 0; popSpin.push(rc);
    const gl = new PIXI.Sprite(T.glow); gl.anchor.set(0.5); gl.scale.set(10); gl.tint = 0xffcc33; gl.blendMode = PIXI.BLEND_MODES.ADD; gl.alpha = 0; c.addChild(gl);
    const sp = new PIXI.Sprite(T.yaku_ball); sp.anchor.set(0.5); const bw = 560 / sp.texture.width; sp.scale.set(bw); c.addChild(sp);
    await tween(c, { y: 560 }, 0.42, 'in');
    // 落地爆炸
    shakeK = Math.max(shakeK, 34); flashAll.tint = 0xffe066; flashAll.alpha = 0.35; lampKick = 1.5; lampKickCol = 0xffffff;
    boardParts.emit({ x: PK.LAYOUT.field.cx, y: (560 - BY) / BS, n: 90, color: [0xffe066, 0xffffff, 0xff8a00, 0xff3355], vmin: 250, vmax: 900, life: 1.1 });
    tween(rc, { alpha: 0.55 }, 0.2); tween(gl, { alpha: 0.6 }, 0.2);
    tween(sp, { s: bw * 1.25 }, 0.18, 'out').then(() => tween(sp, { s: bw * 1.1 }, 0.2, 'back'));
    const t0 = performance.now();
    const wob = () => { if (sp.destroyed) return; const k = (performance.now() - t0) / 1000; sp.rotation = Math.sin(k * 9) * 0.08; gl.alpha = 0.45 + 0.25 * Math.sin(k * 20); if (k < hold) requestAnimationFrame(wob); };
    wob();
    await wait(hold || 2.4);
    tween(rc, { alpha: 0 }, 0.3); tween(gl, { alpha: 0 }, 0.3);
    await tween(c, { y: -320 }, 0.4, 'in');
    popSpin.splice(popSpin.indexOf(rc), 1); c.destroy({ children: true });
  }

  // ---------------------------------------------------------
  // 與 PK.Game / PK.Director 的介面
  // ---------------------------------------------------------
  const yk = { pos: 0, target: 0, glow: 0 };
  let hesoGlowV = 0;
  PK.BoardR = {
    get lampMode() { return lampMode; }, set lampMode(v) { lampMode = v; },
    get rightArrow() { return needRight; }, set rightArrow(v) { needRight = !!v; },
    get hesoGlow() { return hesoGlowV; }, set hesoGlow(v) { hesoGlowV = v; },
    warpGlow: 0, gateSpin: 0, dirty: false, canvas: app.view, yaku: yk,
    burst(x, y, colors, n) { boardParts.emit({ x, y, n: n || 18, color: (colors || ['#ffe066', '#ffffff', '#ff8a00']).map(hex), vmin: 60, vmax: 260, life: 0.7 }); },
    doFlash(color, k) { flashAll.tint = hex(color); flashAll.alpha = Math.min(0.22, (k || 1) * 0.2); },
    doShake(k) { shakeK = Math.max(shakeK, (k || 6) * 1.6); },
    // 整台燈光爆閃一下（アタッカー入賞、図柄揃い時）
    kick(color, k) { lampKick = Math.max(lampKick, k || 1); lampKickCol = hex(color || '#ffffff'); },
    slam(text, o) { return slam(text, o); }, gimmick(h) { return gimmick(h); },
    // アタッカー入賞時在洞口上方飄出「+15」
    pocketHit(idx) { const gl = (BD.pocketGlow || [])[idx]; if (gl) gl.alpha = 1; },
    payPop(n, x, y) {
      const rp = PK.Phys.rampPts; if (!rp) return;
      if (x == null) { x = rp.t0[0] + 30 + (Math.random() - 0.5) * 16; y = rp.t0[1] - 30; }   /* 大獎口右上方飄出，不蓋住「進這裡！」 */
      const s = new PIXI.Sprite(payPopTex(n)); s.anchor.set(0.5); s.position.set(x, y); s.scale.set(0.5); B.addChild(s);
      payPops.push({ s, t: 0 });
    },
    resize() {},
  };
  PK.UI = {
    get power() { return U.power; }, setPower, U, forceMode: null, isMobile: false,
    setPushActive(on, type) { pushType = on ? (type || 'normal') : null; },
    layout() { fit(); }, toggleLock(v) { toggleStop(v == null ? undefined : !v); },
    firing() { return !U.stopped && U.power > 0.04; },
  };
  PK.View3D = { rebuildAll: () => buildBoard(), resize: fit };
  const G = PK.Game;
  G.onPayout = (n, kind) => payout(n, kind);

  // ---------------------------------------------------------
  // 發射：上皿 → 送球口 → 盤面レール
  // ---------------------------------------------------------
  // 每分 100 發：每個發射週期直接從上方珠盤拿 1 顆打出去，珠盤裡的珠子一顆一顆變少
  // （原本要等珠子自己滾到最右邊的送珠口掉下去才算一發：珠子堆在左邊滾不過來時，手把轉著也一發都打不出去。
  //   使用者 2026-11-10：「彈珠無法自動滾到右邊的話，那就不要有滾右邊才能發球的判斷，發射就逐量減少」）
  let fireAcc = 0, warnT = 0;
  function stepFire(dt) {
    const firing = PK.UI.firing() && started;
    knobHold.alpha += ((firing ? 0.35 : 0) - knobHold.alpha) * Math.min(1, dt * 10);
    const FI = PK.V2 ? PK.PHYS.fireInterval / (PK.PHYS.speed || 1) : PK.PHYS.fireInterval;   // 新版的時間倍率是整台一起放慢：發射間隔也跟著放慢（不然珠子的回彈時機會剛好撞上下一顆）
    if (!firing) { fireAcc = Math.min(fireAcc, FI); warnT = Math.max(0, warnT - dt); return; }
    fireAcc += dt;
    if (fireAcc >= FI) {
      fireAcc -= FI;
      // 珠盤裡有珠子就打：打得出去才從珠盤拿走最靠近送珠口（最右邊）的那一顆；打不出去（盤面上珠子太多）就留著
      if (upper.balls.length > 0 && PK.Phys.launch(U.power)) {
        let bi = 0; for (let i = 1; i < upper.balls.length; i++) if (upper.balls[i].x > upper.balls[bi].x) bi = i;
        upper.balls.splice(bi, 1);
        G.noteLaunch(); play('launch', { vol: 0.28, minGap: 0.08 });
      }
    }
    knob.x = (Math.random() - 0.5) * 0.8;
    // 大獎中提醒打右邊（只有還有右打的舊設定才會用到）。平常打到右邊不再提醒「請改回打左邊」——
    // 使用者 2026-11-10：「不用請改回打左邊的音效吧，玩家想怎麼玩是玩家的事啊」
    warnT -= dt;
    if (warnT <= 0) {
      if (G.inBonus && !PK.NO_RIGHT && U.power < 0.86) { Au.voice('migi'); PK.LCD.banner('打右边 ➡', { fill: FX.GRAD.white, size: 64, dur: 1.6, y: PK.LCD_LAYOUT.h * 0.86, band: 'rgba(200,0,30,0.85)' }); warnT = 7; }
      else warnT = 1;
    }
  }
  function stepFeed() {
    for (let i = upper.balls.length - 1; i >= 0; i--) {
      const b = upper.balls[i];
      // 送珠口現在一直關著（發射改成直接從珠盤拿珠）；萬一有珠子掉到盤底下面，放回盤裡
      if (b.y > TRAY.floorR + 18 && b.x > TRAY.feedX - 30) { b.y = TRAY.floorR - TRAY.r - 2; b.x = TRAY.feedX + 6; b.vx = 0; b.vy = 0; }
      else if (b.y > TRAY.floorR + 18) { b.y = TRAY.top + 10; b.vy = 0; }
    }
    for (let i = lower.balls.length - 1; i >= 0; i--) {
      const b = lower.balls[i];
      if (b.y > LOWER.floor + 30 && !lowerGate.off) { b.y = LOWER.top + 10; b.vy = 0; continue; }
      if (b.y > LOWER.floor + 30) { lower.balls.splice(i, 1); PAY.box++; if (Math.random() < 0.2) play('tink' + ((Math.random() * 3) | 0), { vol: 0.2 }); }
    }
  }

  // 盤面鋼珠
  const ballPool = [];
  let warpFlash = 0;
  const launchG = new PIXI.Graphics(); launchG.blendMode = PIXI.BLEND_MODES.ADD; B.addChildAt(launchG, B.getChildIndex(ballLayer));
  const warpFx = new PIXI.Sprite(T.glow); warpFx.anchor.set(0.5); warpFx.position.set(L.warp.x, L.warp.y); warpFx.scale.set(0.6); warpFx.tint = 0x3fd2ff; warpFx.blendMode = PIXI.BLEND_MODES.ADD; warpFx.alpha = 0; B.addChildAt(warpFx, B.getChildIndex(holeLayer));   // 入口的閃光：跟洞口一樣在螢幕前面
  const ghostPool = [];   // 新版的運動殘影（每顆珠子兩顆）
  function syncBoardBalls() {
    const list = PK.Phys.balls;
    // 發射光跡＋ワープ入口閃光
    launchG.clear();
    list.forEach((b) => { const tr = b.lt; if (!tr || tr.length < 4) return; if (b.state !== 'rail') { tr.length = 0; return; }
      for (let i = 2; i < tr.length; i += 2) { if (Math.hypot(tr[i] - tr[i - 2], tr[i + 1] - tr[i - 1]) > (PK.V2 ? 260 : 60)) continue;   // 位置跳太遠（不是連續移動）就不連線（新版是真實速度，一格本來就移動比較遠）
        const k = i / tr.length; launchG.lineStyle(PK.PHYS.ballR * 1.4 * k, 0xffffff, 0.35 * k).moveTo(tr[i - 2], tr[i - 1]).lineTo(tr[i], tr[i + 1]); } });
    warpFlash = Math.max(0, warpFlash - 0.05); warpFx.alpha = warpFlash; warpFx.scale.set(0.5 + 0.5 * warpFlash);
    stepWarpTube(performance.now(), list);
    while (ballPool.length < list.length) { const s = new PIXI.Sprite(T.ball); s.anchor.set(0.5); s.width = s.height = PK.PHYS.ballR * 2.3; ballLayer.addChild(s); ballPool.push(s); }
    ballPool.forEach((s, i) => {
      const b = list[i]; if (!b) { s.visible = false; if (ghostPool[i * 2]) { ghostPool[i * 2].visible = false; ghostPool[i * 2 + 1].visible = false; } return; }
      s.visible = true;
      if (b.state === 'warp' && !b.warpLit) { b.warpLit = true; warpFlash = 1; const wa = ((PK.Phys.warpList || [])[b.wi || 0] || {}).at || L.warp; warpFx.position.set(wa.x, wa.y); }   // 進ワープ入口：入口閃一下，珠子接著在透明管裡看得到地滾到ステージ
      s.position.set(b.x, b.y); s.alpha = 1;
      const home = b.state === 'warp' ? tubeBalls : ballLayer; if (s.parent !== home) home.addChild(s);   // 管子裡的珠子跟管子一起在螢幕前面
      // 新版：珠子是真實速度，一格會移動好幾顆珠子的距離；在上一格和這一格的位置之間補兩顆半透明的殘影，看起來才是連續移動而不是一跳一跳
      if (PK.V2 && perf.level < 2) {
        while (ghostPool.length < (i + 1) * 2) { const gs = new PIXI.Sprite(T.ball); gs.anchor.set(0.5); gs.width = gs.height = PK.PHYS.ballR * 2.3; gs.visible = false; ballLayer.addChildAt(gs, 0); ghostPool.push(gs); }
        const px = b.rx == null ? b.x : b.rx, py = b.ry == null ? b.y : b.ry, dd = Math.hypot(b.x - px, b.y - py), fast = dd > PK.PHYS.ballR * 0.8 && dd < 260;
        for (let gi = 0; gi < 2; gi++) { const gs = ghostPool[i * 2 + gi]; gs.visible = fast; if (fast) { const k = (gi + 1) / 3; gs.position.set(px + (b.x - px) * k, py + (b.y - py) * k); gs.alpha = 0.2 + 0.25 * gi; } }
        b.rx = b.x; b.ry = b.y;
      }
      // 發射通道裡往上衝的珠子：拖一道短光跡，看得出是從左邊打上去的
      if (b.state === 'rail') { if (!launchG.visible) launchG.visible = true; const tr = b.lt || (b.lt = []); tr.push(b.x, b.y); if (tr.length > 14) tr.splice(0, 2); }
    });
  }

  // 珠子軌跡線：每顆珠子拖一條淡出的尾巴，看得出撞釘與走向（T 鍵開關，設定會記住）
  const trailG = new PIXI.Graphics(); trailG.blendMode = PIXI.BLEND_MODES.ADD; B.addChildAt(trailG, B.getChildIndex(ballLayer));
  let trailsOn = true;
  try { trailsOn = localStorage.getItem('pk_trails') !== '0'; } catch (e) { /* 忽略 */ }
  const trails = new Map(), TRAIL_N = PK.LOW ? 10 : 18;   // 手機的軌跡短一點（每格要重建的線段少一半）
  function drawTrails() {
    trailG.clear();
    if (!trailsOn || perf.level >= 2) { trails.clear(); return; }
    const alive = new Set();
    PK.Phys.balls.forEach((b) => {
      alive.add(b.id);
      let tr = trails.get(b.id); if (!tr) { tr = []; trails.set(b.id, tr); }
      const last = tr[tr.length - 1];
      if (last && Math.hypot(last[0] - b.x, last[1] - b.y) > (PK.V2 ? 260 : 60)) tr.length = 0;   // 瞬移（回收、推開）時重新開始（新版是真實速度，一格本來就會移動比較遠）
      if (!last || tr.length === 0 || Math.hypot(last[0] - b.x, last[1] - b.y) > 1.5) tr.push([b.x, b.y]);
      if (tr.length > (perf.level >= 1 ? 6 : TRAIL_N)) tr.shift();
      for (let i = 1; i < tr.length; i++) {
        const k = i / tr.length;
        trailG.lineStyle(PK.PHYS.ballR * 1.2 * k, 0x7fd8ff, 0.5 * k).moveTo(tr[i - 1][0], tr[i - 1][1]).lineTo(tr[i][0], tr[i][1]);
      }
    });
    for (const id of trails.keys()) if (!alive.has(id)) trails.delete(id);
  }
  function toggleTrails(v) { trailsOn = v == null ? !trailsOn : v; try { localStorage.setItem('pk_trails', trailsOn ? '1' : '0'); } catch (e) { /* 忽略 */ } }

  // ---------------------------------------------------------
  // 鍵盤
  // ---------------------------------------------------------
  window.addEventListener('keydown', (e) => {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;   // 截圖、切換視窗等系統快捷鍵不算遊戲操作
    if (coverOn) return;                              // 封面只能點「新遊戲／繼續遊戲」進入，按鍵盤不會開始（使用者：按鍵盤就進遊戲，沒辦法截圖）
    Au.unlock();
    if (e.key === 'd' || e.key === 'D') return;
    start();
    if (e.key === 'ArrowUp') { e.preventDefault(); setPower(U.power + 0.01, true); learnHandle(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setPower(U.power - 0.01, true); learnHandle(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); if (!e.repeat) pushDown(); }
    else if (e.key === 'f' || e.key === 'F' || e.key === 's' || e.key === 'S') toggleStop();
    else if (e.key === 'r' || e.key === 'R') G.rent();
    else if (e.key === 'm' || e.key === 'M') toggleAllSound();
    else if (e.key === 't' || e.key === 'T') toggleTrails();
    else if (e.key === '1') { setPower(U.saved); learnHandle(); }
    else if (e.key === '2') { setPower(1); learnHandle(); }
    else if (e.key === '0') setPower(0);
  });
  window.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') pushUp(); });

  // ---------------------------------------------------------
  // DEV 微調工具（盤面拖曳）
  // ---------------------------------------------------------
  let devDrag = false;
  function boardPt(e) { const r = app.view.getBoundingClientRect(); const p = B.toLocal(new PIXI.Point(e.clientX - r.left, e.clientY - r.top)); return [p.x, p.y]; }
  app.view.addEventListener('pointerdown', (e) => {
    if (!PK.Dev || !PK.Dev.open) return;
    if (PK.Dev.pointerDown(boardPt(e))) { devDrag = true; e.stopImmediatePropagation(); }
  }, true);
  window.addEventListener('pointermove', (e) => { if (devDrag) PK.Dev.pointerMove(boardPt(e)); });
  window.addEventListener('pointerup', () => { if (devDrag) { devDrag = false; PK.Dev.pointerUp(); } });
  let rebuildT = null;
  PK.Phys.onBuild = () => { if (!building) { clearTimeout(rebuildT); rebuildT = setTimeout(() => { building = true; buildBoard(); building = false; }, 30); } };
  let building = false;

  // ---------------------------------------------------------
  // 開始
  // ---------------------------------------------------------
  // ---------------------------------------------------------
  // 封面＋新手引導
  // ---------------------------------------------------------
  const deckPt = (x, y) => [deck.x + x * deck.scale.x, deck.y + y * deck.scale.y];   // 台座座標 → 機台座標
  const brdPt = (x, y) => [BX + x * BS, BY + y * BS];                              // 盤面座標 → 機台座標
  const uiText = (t, size, fill, o) => new PIXI.Text(t, Object.assign({ fontFamily: '"Noto Sans SC", sans-serif', fontWeight: '900', fontSize: size, fill: fill || '#ffffff', stroke: '#1a0006', strokeThickness: Math.max(3, size / 7), align: 'center', lineJoin: 'round' }, o || {}));

  // 封面（首頁）：熱血少年漫畫週刊封面風——使用者 2026-11-10 從三個方向的範本選了 A（art_src/home/home_a.png）
  // 有存檔的人主要按鈕是「繼續遊戲」（玩這個遊戲是為了累積時間換漫畫，「新遊戲」只是次要的小按鈕）；第一次玩的人只有一顆「開始遊戲」
  // 版面數值在 PK.HOME（機台座標：寬 1000、高 1500）；開發工具第一分頁「🏠 首頁」可以把首頁叫出來直接拖元件、拉滑桿
  const cover = new PIXI.Container(); cover.eventMode = 'static'; cover.hitArea = new PIXI.Rectangle(0, 0, MW, MH);
  let coverOn = true;
  const HM = PK.HOME, HKY = MH / 1500, HY = (y) => y * HKY;
  const INK = '#120003';   // 漫畫墨線的顏色
  // force：開發預覽時強制當作「有存檔／第一次玩」（null＝照實際）；preview：開發預覽中（按鈕不動作，可以拖）
  // oy：螢幕比 2:3 瘦長時，首頁往上、往下各多出來的高度（機台座標）；safeT／safeB：要避開的瀏海與底部橫條
  const home = { force: null, preview: false, drag: null, oy: 0, safeT: 0, safeB: 0 };
  const HT = (y) => HY(y) - home.oy + home.safeT;   // 貼著螢幕上緣排的元件（標誌、聲音開關）
  const HB = (y) => HY(y) + home.oy - home.safeB;   // 貼著螢幕下緣排的元件（標語、漫畫櫃、按鈕、說明小字）
  const homeBack = () => (home.force != null ? home.force : !!(G.stats.total > 0 || G.invested > 0 || G.resumed || G.resumeBonus || owned() > 0 || (PK.Manga && PK.Manga.state && PK.Manga.state.playMs > 0)));
  // 換掉畫布貼圖（舊的釋放掉）
  const setCvTex = (sp, c) => { const old = sp.texture; sp.texture = PIXI.Texture.from(c); if (old && old !== PIXI.Texture.EMPTY && old !== PIXI.Texture.WHITE) old.destroy(true); };
  const polyPath = (g, pts, dx, dy) => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0] + dx, p[1] + dy) : g.moveTo(p[0] + dx, p[1] + dy))); g.closePath(); };
  const HFONT = (size) => '900 ' + size + 'px "Noto Sans SC", "PingFang SC", sans-serif';

  // 標語框：黃底黑框、兩端鋸齒、右下紅色疊影、右端網點
  function drawHomeTag() {
    const C = HM.tag, w = C.w, h = C.h, pad = 18, K = PSC;
    const pts = [[20, 0], [w, 0], [w - 18, h * 0.36], [w - 2, h * 0.56], [w - 26, h], [0, h], [16, h * 0.62], [2, h * 0.4]];
    const c = cv(Math.round((w + pad * 2) * K), Math.round((h + pad * 2) * K), (g) => {
      g.scale(K, K); g.translate(pad, pad); g.lineJoin = 'miter';
      polyPath(g, pts, 9, 9); g.fillStyle = '#d1001c'; g.fill(); g.lineWidth = 5; g.strokeStyle = INK; g.stroke();
      polyPath(g, pts, 0, 0); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#fff36e'); gr.addColorStop(1, '#ffc400'); g.fillStyle = gr; g.fill();
      g.save(); polyPath(g, pts, 0, 0); g.clip(); g.fillStyle = 'rgba(255,96,0,0.5)';
      for (let i = 0; i < 14; i++) for (let j = 0; j < 12; j++) { const x = w - 150 + i * 11, y = 3 + j * 11 + (i % 2 ? 5.5 : 0); g.beginPath(); g.arc(x, y, 0.4 + 4.4 * i / 13, 0, 6.3); g.fill(); }
      g.restore();
      polyPath(g, pts, 0, 0); g.lineWidth = 6; g.strokeStyle = INK; g.stroke();
      g.font = HFONT(C.size); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = INK;
      g.transform(1, 0, -0.16, 1, 0, 0);   // 字往右斜一點，有速度感
      g.fillText('从防波堤，踢到世界杯', w / 2 + h * 0.08, h / 2 + 2);
    });
    setCvTex(home.tag, c); home.tag.scale.set(1 / K);
  }

  // 鎖頭圖示（s＝鎖身寬）
  const drawLock = (g, cx, cy, s) => {
    const sy = cy - s * 0.12;
    g.lineCap = 'butt';
    [[INK, s * 0.36], ['#ffffff', s * 0.16]].forEach(([col, lw]) => { g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(cx - s * 0.28, sy + s * 0.2); g.lineTo(cx - s * 0.28, sy); g.arc(cx, sy, s * 0.28, Math.PI, 0); g.lineTo(cx + s * 0.28, sy + s * 0.2); g.stroke(); });
    g.fillStyle = INK; g.beginPath(); rrPath(g, cx - s * 0.5, cy - s * 0.02, s, s * 0.76, s * 0.14); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); rrPath(g, cx - s * 0.5 + s * 0.09, cy - s * 0.02 + s * 0.09, s - s * 0.18, s * 0.76 - s * 0.18, s * 0.08); g.fill();
    g.fillStyle = INK; g.beginPath(); g.arc(cx, cy + s * 0.3, s * 0.1, 0, 6.3); g.fill(); g.fillRect(cx - s * 0.04, cy + s * 0.3, s * 0.08, s * 0.2);
  };

  // 漫畫櫃資訊框：白底粗黑框——標題、十話的格子（解鎖的是封面縮圖、沒解鎖的是鎖頭）、下一話的進度條
  const homeTiles = () => { const padX = 20, gap = 8; const N = PK.MANGA.unlockBalls.length; return { padX, gap, N, tw: (HM.panel.w - padX * 2 - gap * (N - 1)) / N, t: 84, y0: 66 }; };   // 每話一格橫長的格子（tw 寬、t 高）；話數看 PK.MANGA.unlockBalls
  function drawHomePanel() {
    const C = HM.panel, w = C.w, h = C.h, K = PSC, pad = 14, Mg = PK.Manga, st = Mg && Mg.state, pr = Mg && Mg.progress ? Mg.progress() : null;
    const lv = pr ? pr.level : 1, TL = homeTiles(), thumbs = PK.Assets.get('home_chapters');
    const c = cv(Math.round((w + pad * 2) * K), Math.round((h + pad * 2) * K), (g) => {
      g.scale(K, K); g.translate(pad, pad);
      g.fillStyle = 'rgba(18,0,3,0.85)'; g.fillRect(9, 10, w, h);   // 疊影
      g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
      // 標題列兩側的速度線（往標題收）
      g.fillStyle = INK;
      for (let i = 0; i < 24; i++) {
        const y = 5 + i * 2.3, len = 36 + ((i * 53) % 150), th = 0.5 + ((i * 7) % 3) * 0.45, ty = y + (34 - y) * 0.3;
        g.beginPath(); g.moveTo(0, y - th); g.lineTo(len, ty); g.lineTo(0, y + th); g.fill();
        g.beginPath(); g.moveTo(w, y - th); g.lineTo(w - len, ty); g.lineTo(w, y + th); g.fill();
      }
      g.lineJoin = 'miter'; g.lineWidth = 6; g.strokeStyle = INK; g.strokeRect(0, 0, w, h);
      g.fillStyle = INK; g.textBaseline = 'middle'; g.textAlign = 'center'; g.font = HFONT(40);
      g.fillText('漫画柜　第 ' + lv + ' 话／全 ' + TL.N + ' 话', w / 2, 35);
      // 十話的格子
      for (let i = 0; i < TL.N; i++) {
        const no = i + 1, t = TL.t, tw = TL.tw, x = TL.padX + i * (tw + TL.gap), y = TL.y0, open = st ? Mg.isUnlocked(no) : no === 1;
        if (open && thumbs) g.drawImage(thumbs, i * thumbs.width / TL.N, 0, thumbs.width / TL.N, thumbs.height, x, y, tw, t);
        else {
          const gr = g.createLinearGradient(0, y, 0, y + t); gr.addColorStop(0, '#a6a6a6'); gr.addColorStop(1, '#787878'); g.fillStyle = gr; g.fillRect(x, y, tw, t);
          g.save(); g.beginPath(); g.rect(x, y, tw, t); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.13)'; g.lineWidth = 2;
          for (let d = -t; d < tw; d += 9) { g.beginPath(); g.moveTo(x + d, y + t); g.lineTo(x + d + t, y); g.stroke(); }
          g.restore();
          drawLock(g, x + tw / 2, y + t / 2 - t * 0.1, t * 0.4);
        }
        g.lineWidth = open ? 5 : 3.5; g.strokeStyle = INK; g.strokeRect(x, y, tw, t);
        if (open) { g.lineWidth = 2.5; g.strokeStyle = '#ffd21f'; g.strokeRect(x + 3.6, y + 3.6, tw - 7.2, t - 7.2); }
        // 解鎖了還沒讀的新話：右上角紅色「新」
        if (open && st && no > 1 && st.read.indexOf(no) < 0) {
          g.fillStyle = '#e60023'; g.beginPath(); g.arc(x + tw - 7, y + 7, 15, 0, 6.3); g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#ffffff'; g.stroke();
          g.fillStyle = '#ffffff'; g.font = HFONT(18); g.textAlign = 'center'; g.fillText('新', x + tw - 7, y + 8);
        }
      }
      // 下一話的進度
      const by = h - 38, bh = 26;
      const label = pr && !pr.next ? '全话解锁完成' : pr && pr.left <= 0 ? '下一话　进游戏就解锁' : '下一话　再赢 ' + (pr ? pr.leftText : '') + '解锁';   // 2026-11-11 起漫畫看累計贏得的珠數（之前是遊玩時間：「再玩 9 分鐘」）
      g.textAlign = 'left'; g.font = HFONT(30); g.fillStyle = INK; g.fillText(label, TL.padX, by + 1);
      const bx = TL.padX + g.measureText(label).width + 22, bw = w - TL.padX - bx, k = pr ? (pr.next ? pr.k : 1) : 0;
      if (bw > 60) {
        g.beginPath(); rrPath(g, bx, by - bh / 2, bw, bh, bh / 2); g.fillStyle = '#c9c9c9'; g.fill();
        g.save(); g.beginPath(); rrPath(g, bx, by - bh / 2, bw, bh, bh / 2); g.clip();
        const fw = k > 0 ? Math.max(bh, bw * k) : 0; g.fillStyle = '#ffd21f'; g.fillRect(bx, by - bh / 2, fw, bh);
        g.beginPath(); g.rect(bx, by - bh / 2, fw, bh); g.clip(); g.strokeStyle = '#f59e00'; g.lineWidth = 7;
        for (let d = -bh; d < fw + bh; d += 18) { g.beginPath(); g.moveTo(bx + d, by + bh / 2); g.lineTo(bx + d + bh, by - bh / 2); g.stroke(); }
        g.restore();
        g.beginPath(); rrPath(g, bx, by - bh / 2, bw, bh, bh / 2); g.lineWidth = 4; g.strokeStyle = INK; g.stroke();
      }
    });
    setCvTex(home.panel, c); home.panel.scale.set(1 / K);
  }

  // 次要按鈕「新遊戲」：切角的銀灰色小按鈕
  function drawHomeSub() {
    const C = HM.sub, w = C.w, h = C.h, K = PSC, pad = 10, cut = h * 0.3;
    const pts = [[cut, 0], [w - cut, 0], [w, cut], [w, h - cut], [w - cut, h], [cut, h], [0, h - cut], [0, cut]];
    const c = cv(Math.round((w + pad * 2) * K), Math.round((h + pad * 2) * K), (g) => {
      g.scale(K, K); g.translate(pad, pad); g.lineJoin = 'round';
      polyPath(g, pts, 0, 6); g.fillStyle = 'rgba(18,0,3,0.75)'; g.fill();
      polyPath(g, pts, 0, 0); const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.55, '#e2e2e2'); gr.addColorStop(1, '#a6a6a6'); g.fillStyle = gr; g.fill();
      g.lineWidth = 4.5; g.strokeStyle = '#1c1c1c'; g.stroke();
      g.font = HFONT(C.size); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = '#1c1c1c';
      const chars = ['新', '游', '戏'], sp = C.size * 1.22; chars.forEach((ch, i) => g.fillText(ch, w / 2 + (i - 1) * sp, h / 2 + 2));
    });
    setCvTex(home.sub, c); home.sub.scale.set(1 / K);
  }

  // 右上角聲音開關：黑底黃框的小方鈕，點一下全部開／關（要分開調音樂和音效，進遊戲後按機台右下的音量鍵）
  function drawHomeSpk() {
    const r = HM.spk.r, g = home.spkG, lv = Math.max(lvBgm(), lvSfx());
    g.clear().lineStyle(4, 0xffd21f).beginFill(0x120003).drawRoundedRect(-r, -r, r * 2, r * 2, r * 0.3).endFill().lineStyle(0);
    speaker(g, -r * 0.16, 0, r / 30, lv ? 0xffffff : 0xb9b2b0, lv);
  }

  {
    // 版面跟著螢幕比例（layoutHome）：比 2:3 瘦長（手機直立）→ 首頁往上下延伸到整個螢幕，標誌貼上緣、按鈕貼下緣；
    // 比 2:3 寬（電腦、平板橫放）→ 首頁是中間一張 2:3 的「封面」，兩旁鋪主視覺的氣氛底
    const art = T.home_bg || T.splash_homerun, artIm = PK.Assets.get(T.home_bg ? 'home_bg' : 'splash_homerun');
    // 最底層：鋪滿整個螢幕的氣氛底——主視覺一次縮一半、縮到很小再放大（＝均勻的失焦），乘上深紅色再壓暗
    // （第一版只縮一次又只蓋六成黑：寬螢幕兩旁又亮又一格一格的）
    {
      let tiny = artIm || null, tw = artIm ? artIm.width : 0, th = artIm ? artIm.height : 0;
      while (tiny && tw > 40) { const src = tiny; tw = Math.round(tw / 2); th = Math.round(th / 2); const w2 = tw, h2 = th; tiny = cv(w2, h2, (g) => g.drawImage(src, 0, 0, w2, h2)); }
      const mid = tiny ? cv(tw * 3, th * 3, (g) => { g.imageSmoothingQuality = 'high'; g.drawImage(tiny, 0, 0, tw * 3, th * 3); }) : null;
      home.amb = new PIXI.Sprite(mid ? texC(tw * 8, th * 8, (g, w, h) => {
        g.imageSmoothingQuality = 'high'; g.drawImage(mid, 0, 0, w, h);
        g.globalCompositeOperation = 'multiply'; g.fillStyle = '#8a1622'; g.fillRect(0, 0, w, h);
        g.globalCompositeOperation = 'source-over'; g.fillStyle = 'rgba(10,0,3,0.45)'; g.fillRect(0, 0, w, h);
      }) : PIXI.Texture.EMPTY);
      home.amb.anchor.set(0.5); cover.addChild(home.amb);
    }
    home.frame = new PIXI.Graphics(); cover.addChild(home.frame);   // 寬螢幕：封面外圍的陰影與金邊
    const card = new PIXI.Container(); cover.addChild(card); home.card = card;
    home.base = new PIXI.Graphics(); card.addChild(home.base);
    home.mask = new PIXI.Graphics(); card.addChild(home.mask); card.mask = home.mask;   // 內容不超出首頁的範圍（寬螢幕時是圓角）
    // 主視覺：紅黃集中線＋主角揮棒（art_src/home/home_a_bg.png），鋪滿整個首頁
    if (art) {
      // 瘦長螢幕（手機直立）用的兩層：artBg＝放大鋪滿整個螢幕當底（壓暗）；art＝整張寬度完整放進去、上下緣淡出接到底圖
      // （2026-11-12 使用者：「手機版主角的踢球被切掉了」——原本只有一層放大鋪滿，左右各被裁掉一截，頭和足球都出畫面）
      home.artBg = new PIXI.Sprite(art); home.artBg.anchor.set(0.5, 0); home.artBg.tint = 0x8a7078; card.addChild(home.artBg);
      home.artFull = art;
      home.artFade = artIm ? texC(artIm.width, artIm.height, (g, w, h) => {
        g.drawImage(artIm, 0, 0, w, h); g.globalCompositeOperation = 'destination-in';
        const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.1, 'rgba(0,0,0,1)'); gr.addColorStop(0.6, 'rgba(0,0,0,1)'); gr.addColorStop(0.78, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(0, 0, w, h);
      }) : art;
      home.art = new PIXI.Sprite(art); home.art.anchor.set(0.5, 0); card.addChild(home.art);
    }
    // 下半部壓暗，資訊框和按鈕才跳得出來
    home.shade = new PIXI.Sprite(texC(8, 256, (g) => { const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(70,0,10,0)'); gr.addColorStop(0.42, 'rgba(70,0,10,0.5)'); gr.addColorStop(1, 'rgba(40,0,6,0.88)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 256); })); card.addChild(home.shade);
    // 標誌後面慢慢轉的光芒
    const rays = new PIXI.Container(); card.addChild(rays); cover.rays = rays;
    for (let i = 0; i < 24; i++) { const r = new PIXI.Sprite(T.ray); r.anchor.set(0, 0.5); r.rotation = i / 24 * Math.PI * 2; r.width = 720; r.height = 100; r.tint = i % 2 ? 0xffe066 : 0xffffff; r.blendMode = PIXI.BLEND_MODES.ADD; r.alpha = 0.2; rays.addChild(r); }
    if (T.logo) { const lg = new PIXI.Sprite(T.logo); lg.anchor.set(0.5); card.addChild(lg); cover.logo = lg; }
    home.tag = new PIXI.Sprite(PIXI.Texture.EMPTY); home.tag.anchor.set(0.5); card.addChild(home.tag);
    home.panel = new PIXI.Sprite(PIXI.Texture.EMPTY); home.panel.anchor.set(0.5); card.addChild(home.panel);
    // 主要按鈕（紅寶石金框底板＋緩慢掃過的反光）
    const mb = new PIXI.Container(); card.addChild(mb); home.main = mb;
    mb.glow = new PIXI.Sprite(T.glow); mb.glow.anchor.set(0.5); mb.glow.tint = 0xffe066; mb.glow.blendMode = PIXI.BLEND_MODES.ADD; mb.addChild(mb.glow);
    mb.plate = new PIXI.Sprite(T.home_btn || T.ui_btn_red); mb.plate.anchor.set(0.5); mb.addChild(mb.plate);
    mb.shine = new PIXI.Sprite(texC(128, 64, (g) => { const gr = g.createLinearGradient(0, 0, 128, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 64); }));
    mb.shine.anchor.set(0.5); mb.shine.skew.x = -0.5; mb.shine.blendMode = PIXI.BLEND_MODES.ADD; mb.addChild(mb.shine);
    mb.shineMask = new PIXI.Graphics(); mb.addChild(mb.shineMask); mb.shine.mask = mb.shineMask;
    mb.label = uiText('', HM.main.size, ['#ffffff', '#fff0b8'], { stroke: '#5a0008', strokeThickness: 12, dropShadow: true, dropShadowColor: '#2a0004', dropShadowAlpha: 0.6, dropShadowDistance: 5, dropShadowBlur: 0, letterSpacing: 10 }); mb.label.anchor.set(0.5); mb.addChild(mb.label);
    mb.sub = uiText('', HM.main.sub, '#ffffff', { stroke: '#5a0008', strokeThickness: 7, letterSpacing: 3 }); mb.sub.anchor.set(0.5); mb.addChild(mb.sub);
    home.sub = new PIXI.Sprite(PIXI.Texture.EMPTY); home.sub.anchor.set(0.5); card.addChild(home.sub);
    home.spk = new PIXI.Container(); card.addChild(home.spk); home.spkG = new PIXI.Graphics(); home.spk.addChild(home.spkG);
    home.foot = uiText('本游戏为模拟娱乐，没有任何真实金钱输赢或兑换', HM.foot.size, '#f3e6e6', { stroke: '#2a0004', strokeThickness: 4 }); home.foot.anchor.set(0.5); card.addChild(home.foot);

    // 點擊；開發預覽中改成拖曳（直接改 PK.HOME 的位置）
    const tapOrDrag = (obj, cfg, onTap) => {
      obj.eventMode = 'static'; obj.cursor = onTap ? 'pointer' : 'default';   // 標誌、標語、說明小字只有開發預覽時可以拖，平常點了沒作用
      obj.on('pointerdown', (e) => {
        e.stopPropagation();
        if (home.preview) { const p = e.getLocalPosition(cover); home.drag = { cfg, px: p.x, py: p.y, x0: cfg.x, y0: cfg.y }; return; }
        if (onTap) onTap(e);
      });
    };
    cover.on('globalpointermove', (e) => {
      const d = home.drag; if (!d) return;
      const p = e.getLocalPosition(cover); if (d.cfg.x != null) d.cfg.x = Math.round(d.x0 + p.x - d.px); d.cfg.y = Math.round(d.y0 + (p.y - d.py) / HKY);
      layoutHome(); if (PK.Dev && PK.Dev.touch) PK.Dev.touch();
    });
    const endDrag = () => { home.drag = null; };
    cover.on('pointerup', endDrag); cover.on('pointerupoutside', endDrag);
    if (cover.logo) tapOrDrag(cover.logo, HM.logo, null);
    tapOrDrag(home.tag, HM.tag, null);
    tapOrDrag(home.foot, HM.foot, null);
    tapOrDrag(mb, HM.main, () => closeCover(!homeBack()));
    tapOrDrag(home.sub, HM.sub, () => closeCover(true));
    tapOrDrag(home.spk, HM.spk, () => { Au.unlock(); toggleAllSound(); });
    // 漫畫櫃資訊框：點已解鎖的那一格直接讀那一話，點其他地方打開漫畫櫃
    tapOrDrag(home.panel, HM.panel, (e) => {
      const Mg = PK.Manga; if (!Mg) return;
      Au.unlock(); play('reel_stop', { vol: 0.6 });
      const p = e.getLocalPosition(home.panel), TL = homeTiles(), lx = p.x / PSC + HM.panel.w / 2 - TL.padX, ly = p.y / PSC + HM.panel.h / 2 - TL.y0;
      const i = Math.floor(lx / (TL.tw + TL.gap)), inTile = ly >= 0 && ly <= TL.t && i >= 0 && i < TL.N && lx - i * (TL.tw + TL.gap) <= TL.tw;
      if (inTile && Mg.state && Mg.isUnlocked(i + 1) && Mg.chapter(i + 1)) Mg.openReader(i + 1); else Mg.openCabinet();
    });
    onVolDraw = () => { if (cover.visible) drawHomeSpk(); };
  }

  // 依 PK.HOME 與目前的存檔／漫畫進度，把首頁每個元件排好、畫好（存檔狀態變了、漫畫解鎖了、開發工具調了數值都呼叫這個）
  function layoutHome() {
    if (!cover.visible) return;
    const back = homeBack(), n = owned();
    // 首頁可用的範圍（機台座標）：螢幕比 2:3 瘦長 → 從螢幕最上面到最下面；否則就是機台那一塊
    const tall = VIEW.ch > MH + 1, top = tall ? VIEW.y0 : 0, hh = tall ? VIEW.ch : MH;
    home.oy = -top; home.safeT = tall ? VIEW.safeT : 0; home.safeB = tall ? VIEW.safeB : 0;
    cover.hitArea = new PIXI.Rectangle(VIEW.x0, VIEW.y0, VIEW.w, VIEW.h);   // 整個螢幕都算首頁（點旁邊不會穿到機台）
    home.amb.position.set(VIEW.x0 + VIEW.w / 2, VIEW.y0 + VIEW.h / 2); home.amb.scale.set(Math.max(VIEW.w / home.amb.texture.width, VIEW.h / home.amb.texture.height) || 1);
    home.base.clear().beginFill(0x1a0306).drawRect(0, top, MW, hh).endFill();
    home.mask.clear().beginFill(0xffffff).drawRoundedRect(0, top, MW, hh, tall ? 0 : 34).endFill();
    home.frame.clear(); if (!tall) home.frame.lineStyle(26, 0x000000, 0.28).drawRoundedRect(-9, -5, MW + 18, MH + 18, 44).lineStyle(12, 0x000000, 0.4).drawRoundedRect(-4, -2, MW + 8, MH + 8, 38).lineStyle(4, 0xffd21f, 0.95).drawRoundedRect(-2, -2, MW + 4, MH + 4, 36);
    if (home.art) {
      const a = home.art, bgA = home.artBg, split = tall && hh > MH * 1.12;   // 明顯比 2:3 瘦長才分兩層
      bgA.visible = split; a.texture = split ? home.artFade : home.artFull;
      if (split) {
        bgA.scale.set(Math.max(MW / bgA.texture.width, hh / bgA.texture.height)); bgA.position.set(MW / 2, top);
        // 整張寬度放進去；主角的踢球動作（圖高約 38% 處）對到「標誌下緣」與「標語」中間
        const k = MW / a.texture.width, mid = top + (330 + (hh - 650)) / 2;
        a.scale.set(k); a.position.set(MW / 2, Math.max(top - a.texture.height * k * 0.08, mid - a.texture.height * k * 0.38));
      } else { a.scale.set(Math.max(MW / a.texture.width, hh / a.texture.height)); a.position.set(MW / 2, top); }
    }
    home.shade.width = MW; home.shade.y = HY(750) + home.oy; home.shade.height = top + hh - home.shade.y;
    cover.rays.position.set(HM.logo.x, HT(HM.logo.y));
    if (cover.logo) { const lg = cover.logo; lg.position.set(HM.logo.x, HT(HM.logo.y)); cover.logoS = HM.logo.w / lg.texture.width; lg.scale.set(cover.logoS); }
    drawHomeTag(); home.tag.position.set(HM.tag.x, HB(HM.tag.y)); home.tag.rotation = HM.tag.rot * Math.PI / 180;
    drawHomePanel(); home.panel.position.set(HM.panel.x, HB(HM.panel.y));
    const mb = home.main, C = HM.main, pw = C.w, ph = pw * mb.plate.texture.height / mb.plate.texture.width;
    // 第一次玩沒有次要按鈕：主要按鈕往下移到資訊框和說明小字的中間
    mb.position.set(C.x, HB(back ? C.y : (C.y + HM.sub.y) / 2 - 20)); mb.plate.width = pw; mb.plate.height = ph; mb.glow.width = pw * 1.25; mb.glow.height = ph * 2.3;
    mb.hitArea = new PIXI.Rectangle(-pw / 2, -ph / 2, pw, ph);
    const held = back && n > 0 ? '持有 ' + n.toLocaleString() + ' 颗' : '';
    mb.label.text = back ? '继续游戏' : '开始游戏'; mb.label.style.fontSize = held ? C.size : Math.round(C.size * 1.12); mb.label.y = held ? -ph * 0.13 : -2;
    mb.sub.text = held; mb.sub.visible = !!held; mb.sub.style.fontSize = C.sub; mb.sub.y = ph * 0.25;
    mb.shine.width = ph * 0.9; mb.shine.height = ph * 1.4; mb.shineW = pw;
    mb.shineMask.clear().beginFill(0xffffff).drawRoundedRect(-pw / 2 + ph * 0.14, -ph / 2 + ph * 0.14, pw - ph * 0.28, ph * 0.72, ph * 0.12).endFill();
    drawHomeSub(); home.sub.position.set(HM.sub.x, HB(HM.sub.y)); home.sub.visible = back;   // 第一次玩沒有東西可以「重新開始」，不放這顆
    home.spk.position.set(HM.spk.x, HT(HM.spk.y)); home.spk.hitArea = new PIXI.Rectangle(-HM.spk.r * 1.4, -HM.spk.r * 1.4, HM.spk.r * 2.8, HM.spk.r * 2.8); drawHomeSpk();
    home.foot.style.fontSize = HM.foot.size; home.foot.position.set(MW / 2, HB(HM.foot.y));
  }
  // 進場：標誌落下、標語從右邊滑入、資訊框與按鈕由下往上
  home.enter = (fromLoad) => {
    [fromLoad ? [null] : [cover.logo, 0, -70, 0], [home.tag, 160, 0, 0.14], [home.panel, 0, 80, 0.24], [home.main, 0, 70, 0.34], [home.sub, 0, 40, 0.44], [home.foot, 0, 0, 0.5], [home.spk, 0, 0, 0.5]].forEach(([o, dx, dy, delay]) => {
      if (!o) return;
      const x = o.x, y = o.y; o.alpha = 0; o.x = x + dx; o.y = y + dy;
      tween(o, { alpha: 1 }, 0.3, 'out', delay); tween(o, { x, y }, 0.5, 'back', delay);
    });
  };
  // 開發工具：把首頁再叫出來調版面（asBack：true＝當作有存檔、false＝當作第一次玩、不給＝照實際）；預覽中按鈕不動作
  function showHome(asBack) {
    home.force = asBack == null ? null : !!asBack; home.preview = true; home.drag = null;
    coverOn = true; cover.visible = true; cover.alpha = 1; cover.eventMode = 'static'; M.addChild(cover);
    layoutHome();
  }
  function hideHome() {
    home.preview = false; home.force = null; home.drag = null;
    if (started) { coverOn = false; cover.visible = false; } else layoutHome();   // 還沒開始玩：留在真正的首頁
  }
  // 開發工具：把載入畫面叫出來看、調進度條的位置（進度條自己從 0 跑到 100% 一直重複；點畫面或再按一次收起）
  function hideLoading() {
    if (!ldEl) return;
    clearInterval(ldDemo); ldDemo = 0; ldEl.onclick = null; ldEl.classList.add('done');
    setTimeout(() => { if (!ldDemo) ldEl.style.display = 'none'; }, 500);
  }
  function showLoading() {
    if (!ldEl) return;
    if (ldDemo) { hideLoading(); return; }
    const t0 = performance.now();
    ldEl.style.display = ''; ldEl.classList.remove('done'); setLoad(0, true);
    ldDemo = setInterval(() => setLoad(Math.min(1, ((performance.now() - t0) / 1000 % 7.5) / 6), true), 120);   // 6 秒跑完，停 1.5 秒再重來
    ldEl.onclick = hideLoading;
  }
  function stepCover(dt, now) {
    if (!cover.parent || !cover.visible) return;
    cover.rays.rotation += dt * 0.2;
    if (cover.logo) cover.logo.scale.set(cover.logoS * (1 + 0.02 * Math.sin(now / 320)));
    const mb = home.main;
    mb.glow.alpha = 0.28 + 0.3 * Math.abs(Math.sin(now / 380));
    mb.shine.x = -mb.shineW * 0.6 + ((now / 2600) % 1) * mb.shineW * 1.6;   // 反光由左往右掃過
    mb.scale.set(1 + 0.012 * Math.sin(now / 380));                          // 主要按鈕輕輕呼吸
  }
  function closeCover(fresh) {
    if (!coverOn) return;
    if (home.preview) { hideHome(); return; }   // 開發預覽：只收起首頁，不動存檔
    coverOn = false; cover.eventMode = 'none'; Au.unlock(); play('reel_stop', { vol: 0.6 });   // 開始淡出就不再擋點擊
    tween(cover, { alpha: 0 }, 0.35).then(() => { cover.visible = false; });
    if (fresh) {
      // 新遊戲：從 0 顆開始，珠盤清空，跟著引導走：借珠 → 注入 → 發射 → 啟動口
      G.resetData(); G.resumeBonus = null; PAY.queue = 0; PAY.box = 0; PAY.real = 0; PAY.fast = false; PAY.hold = 0; PAY.lowQ = 0;
      upper.balls = []; lower.balls = []; PK.Phys.clearBalls(); PK.Director.restoreMode();
      setPower(0); U.stopped = false;
      start(true);
    } else {
      start();
    }
  }

  // 回首頁：先存檔再重新載入，回到標題畫面。轉到一半或大獎中途也沒關係——存檔記著正在轉的那一轉與打到第幾回合，
  // 按「繼續遊戲」會接回去（接回去之後要等玩家動手才繼續，見 js/game.js mainLoop）。
  // 注意：只有從這顆首頁鈕回去才接；關掉視窗、重新整理是重新開始
  function goHome() {
    if (!started || (PK.Duel && PK.Duel.active)) return;
    try { G.save(); if (PK.Manga && PK.Manga.save) PK.Manga.save(); } catch (e) { /* 忽略 */ }
    try { sessionStorage.setItem('pk_keep', '1'); } catch (e) { /* 忽略 */ }   // 這次是按首頁鈕回去的，不是關視窗：進行到一半的大獎／連莊／保留要接回來（見 js/game.js G.load）
    location.reload();
  }
  let started = false;
  function start(fresh) {
    if (coverOn) { coverOn = false; cover.visible = false; }   // DEV 工具直接開始時也收起封面
    if (started) return; started = true;
    if (PK.Manga) PK.Manga.markStarted();
    if (PK.Director && PK.Director.preloadPanels) setTimeout(PK.Director.preloadPanels, 2500);   // 大獎回合的漫畫格子：進遊戲後在背景載入
    if (PK.Duel) setTimeout(PK.Duel.preload, 4000);   // 投打對決的素材：進遊戲幾秒後在背景載入（不拖慢首頁）
    Au.unlock();
    PK.LCD.attract = false;
    if (!fresh && owned() === 0) G.rent();
    G.paused = false;
    if (G.mode === 'normal' && !G.resumeBonus) {
      Au.playBgm('bgm_normal'); Au.voice('playball');
      PK.LCD.banner('开打!!', { fill: FX.GRAD.gold, size: 120, rays: '#ffd23f', dur: 2.0 });
    } else if (G.resumeBonus) Au.playBgm('bgm_normal');   // 上次的大獎還沒跑完：等玩家打出第一顆才接著跑（js/game.js mainLoop），等的時候先有音樂
  }
  app.view.addEventListener('pointerdown', () => { Au.unlock(); if (!coverOn) start(); });
  // 切到背景／切回來的聲音暫停與恢復在 js/audio.js（A.setHold）：原本寫在這裡，而且只在「遊戲已經開始」時才恢復——
  // 從首頁看漫畫、離開瀏覽器再回來，之後進遊戲整台都沒聲音

  building = true; buildBoard(); building = false;
  G.load();
  // 上次的持ち玉：直接放回珠盤（快速倒入）
  const savedBalls = G.balls || 0; G.balls = 0;
  // 讀檔還原持有珠：只把上方珠盤裝滿，其餘算在珠箱（下方珠盤只在出珠滿出來時才有珠子，平常是空的）
  // 裝填過程先在背景算完，畫面一出來珠盤就是滿的、靜止的（不會一開頁就看到珠子在滾）
  if (savedBalls > 0) {
    const n = Math.min(savedBalls, CAP_UP); PAY.queue = n; PAY.box += savedBalls - n; PAY.fast = true;
    let idle = 0;
    for (let i = 0; i < 1200 && (PAY.queue > 0 || idle < 4); i++) { stepPayout(1 / 60); idle = PAY.queue > 0 ? 0 : idle + 1 / 60; upper.calm = idle > 3; upper.step(1 / 60); }
    trayIdleT = 99;
  }
  M.addChild(cover);
  // 首頁：存檔與漫畫進度都讀好了才排版（漫畫解鎖、看完漫畫回來都會再排一次）
  if (PK.Manga) { PK.Manga.onCoverChange = layoutHome; PK.Manga.init().then(layoutHome); }
  fit.after = () => { fitBackdrop(); layoutHome(); if (PK.Duel && PK.Duel.relayout) PK.Duel.relayout(); if (PK.Manga && PK.Manga.refreshBtn) PK.Manga.refreshBtn(); if (PK.Dock) PK.Dock.layout(); };   // 視窗大小、方向變了（或開發面板開關）：背景、首頁、對決畫面都重排
  layoutHome();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(layoutHome);   // 字型晚到的話重畫一次
  PK.Dev.init();
  G.paused = true;   // 觸碰開始前不消化保留（停電復帰也等玩家回來）
  G.start();
  fit();
  // 載入畫面淡出：底下的首頁主視覺與標誌在同一個位置，看起來只是進度條退場、標語與按鈕進場
  setLoad(1);
  if (ldEl) { ldEl.classList.add('done'); setTimeout(() => { if (!ldDemo) ldEl.style.display = 'none'; }, 520); }
  home.enter(!!ldEl);   // 首頁進場動畫

  // ---------------------------------------------------------
  // 主迴圈
  // ---------------------------------------------------------
  function frame(dt) {
    const sp = PK.TIMING.speed || 1;
    // 漫畫：累積遊玩時間（只算真的在玩）＋解鎖預告；放在時鐘前面，預告開始的那一格主迴圈就不會再開下一轉
    if (PK.Manga) {
      const playing = started && !G.paused && !document.hidden && (PK.Phys.balls.length > 0 || G.spinning || G.inBonus);
      PK.Manga.tick(dt, playing);
      const tap = PK.Manga.canTapLcd(); lcdTopBox.eventMode = tap ? 'static' : 'none'; lcdTopBox.cursor = tap ? 'pointer' : 'auto';
    }
    FX.Clock.update(dt);
    stepTime(dt * sp);
    PK.Phys.step(dt);
    stepFire(dt);
    const trayBusy = PAY.queue > 0 || PAY.lowQ > 0 || lowerGate.off || feedGate.off || (started && PK.UI.firing());
    trayIdleT = trayBusy ? 0 : trayIdleT + dt; upper.calm = lower.calm = !trayBusy && trayIdleT > 3;   // 先讓珠子往送珠洞滾（約 3 秒），再收住
    if (trayIdleT < 4) { upper.step(dt); lower.step(dt); }   // 沒動靜 4 秒後凍結，珠子不會一直微微滾動
    stepFeed(); stepPayout(dt);
    G.balls = owned();
    PK.LCD.update(dt);
    // 處理器跟不上時（效能調節第 1 級以上）液晶隔格重畫：液晶每秒 30 格就夠，省下一半的繪製與貼圖上傳
    if (!(perf.level >= 1 && (perf.frame++ & 1))) { PK.LCD.draw(); lcdTex.baseTexture.update(); lcdTopTex.baseTexture.update(); }
  }
  // 效能調節：只看「這一格實際運算＋繪圖花了多久」（不看畫面間隔——省電模式或背景分頁會把畫面鎖在每秒 30 格，那不是機器慢）。
  // 平均超過 14 毫秒（處理器跟不上每秒 60 格）就降一級，最多兩級，只降不升；不切換繪圖解析度（切換當下會卡好幾秒）
  // 1 級：液晶隔格重畫、軌跡縮短　2 級：關掉軌跡與殘影
  const perf = { level: 0, ema: 4, cool: 5, frame: 0, t0: 0 };
  function govern(workMs, sec) {
    if (!PK.LOW || document.hidden || !started) return;   // 只在手機上調節（電腦的畫質不動）
    perf.ema += (Math.min(workMs, 60) - perf.ema) * 0.05; perf.cool -= sec;
    if (perf.cool > 0 || perf.level >= 2 || perf.ema < 14) return;
    perf.level++; perf.cool = 4; perf.ema = 8;
  }
  function render(dt, now) {
    syncBoardBalls(); drawTrails(); upper.draw(); lower.draw(); paintDisp(); paintMeter(dt);
    setHits(G.stats.hits); setStart(G.stats.since);
    boardParts.update(dt);
    lampT += dt;
    stepLamps(dt);
    stepPayPops(dt); stepCover(dt, now);
    // 右打ち燈
    { const ph = Math.floor(lampT * 8), blink = ph % 2 === 0;
      (BD.arrows || []).forEach((a, i) => { const on = needRight && (ph % 4) === i; a.alpha = needRight ? (on ? 1 : 0.55) : 0.08; a.tint = needRight ? (on ? 0xffffff : 0xff2244) : 0x5a3a3a; a.scale.set(needRight && on ? 1.15 : 1); });
      if (BD.rightBox) { BD.rightBox.tint = needRight ? (blink ? 0xff1a3a : 0xffd23f) : 0x3a0a10; BD.rightTxt.alpha = needRight ? 1 : 0.15; BD.rightBox.alpha = needRight ? 1 : 0.35; BD.rightTxt.scale.set((needRight ? 1 + 0.08 * Math.sin(lampT * 14) : 1) * 80 / 240); BD.rightGlow.alpha = needRight ? 0.55 + 0.35 * Math.sin(lampT * 12) : 0; } }
    (BD.attLeds || []).forEach((s, i) => { s.tint = PK.Phys.attackerOpen ? ((Math.floor(lampT * 10) + i) % 2 ? 0xffe066 : 0xff2244) : 0x332200; });
    hesoGlowV = Math.max(0, hesoGlowV - dt * 2.5); if (BD.hesoGlow) BD.hesoGlow.alpha = hesoGlowV;
    (BD.pocketGlow || []).forEach((gl) => { gl.alpha = Math.max(0, gl.alpha - dt * 2.5); });
    // 役物
    yk.pos += (yk.target - yk.pos) * Math.min(1, dt * (yk.target > yk.pos ? 9 : 3));
    if (BD.yakuBase) {
      yaku.y = BD.yakuBase.y + yk.pos * L.lcd.h * 0.36;
      yaku.scale.x = BD.yakuBase.sx * (1 + (yk.pos > 0.5 ? 0.06 * Math.sin(now / 60) : 0));
      yaku.rotation = yk.pos > 0.5 ? Math.sin(now / 200) * 0.05 : 0;
    }
    // 可動零件
    if (BD.attLid) {
      // 蓋板往前倒：壓扁＋往下移，露出洞口
      BD.attK += ((PK.Phys.attackerOpen ? 1 : 0) - BD.attK) * Math.min(1, dt * 28);
      BD.attLid.scale.y = 1 - 0.8 * BD.attK; BD.attLid.y = BD.attY + 9 * BD.attK; BD.attLid.alpha = 1 - 0.35 * BD.attK;
      BD.attSlot.alpha = BD.attK;
      if (BD.attHint) BD.attHint.alpha = 1 - BD.attK;
      if (BD.attGo) { BD.attGo.alpha = BD.attK; BD.attGoArrow.y = Math.abs(Math.sin(now / 160)) * 6; }
    }
    if (BD.attSlotGlow) BD.attSlotGlow.alpha = PK.Phys.attackerOpen ? 0.55 + 0.35 * Math.sin(now / 70) : 0;
    if (BD.startWings) {   // START 翼片：大獎回合中張開（往外倒約 58°），回合之間收起
      BD.wingK += ((PK.Phys.attackerOpen ? 1 : 0) - BD.wingK) * Math.min(1, dt * 9);
      BD.startWings.forEach((pv) => { pv.rotation = pv.sd * 1.02 * BD.wingK; pv.alpha = Math.min(1, BD.wingK * 3); });
      if (PK.Phys.attackerOpen && BD.hesoGlow) BD.hesoGlow.alpha = Math.max(BD.hesoGlow.alpha, 0.35 + 0.25 * Math.sin(now / 90));
    }
    if (BD.lane) BD.lane.alpha = needRight ? 0.75 + 0.25 * Math.sin(now / 160) : 0.45;
    (BD.wings || []).forEach((w) => { w.wing.rotation += ((PK.Phys.denchuOpen ? -w.side * 1.1 : 0) - w.wing.rotation) * Math.min(1, dt * 18); });
    if (BD.gateBl) BD.gateBl.rotation += dt * 3;
    // 普圖燈
    if (BD.futoO) {
      const fl = G.futoLast, recent = fl && performance.now() - fl.at < 1600;
      if (G.futoLamp) { const k = Math.floor(lampT * 10) % 2; BD.futoO.alpha = k ? 1 : 0.15; BD.futoX.alpha = k ? 0.15 : 1; }
      else if (recent) { BD.futoO.alpha = fl.hit ? 1 : 0; BD.futoX.alpha = fl.hit ? 0 : 1; BD.futoO.scale.set((fl.hit ? 1 + 0.15 * Math.sin(lampT * 20) : 1) * 30 / 120); }
      else { BD.futoO.alpha = 0.12; BD.futoX.alpha = 0.12; BD.futoO.scale.set(30 / 120); }
      BD.futoDots.forEach((d, i) => { d.tint = i < G.futoHolds ? 0xffd23f : 0x3a3030; });
    }
    if (BD.wind) BD.wind.rotation = PK.Phys.windmill.angle;
    if (BD.windGlow) BD.windGlow.alpha = Math.min(0.9, Math.max(0, (PK.Phys.windmill.spin - 3) / 8));   // 被打到轉快時發光
    popSpin.forEach((r) => { r.rotation += dt * 0.8; });
    flashAll.alpha = Math.max(0, flashAll.alpha - dt * 2.5);
    // PUSH 發光（長押し時顯示進度）
    pushGauge.clear();
    if (pushType) {
      const col = pushType === 'red' ? 0xff2a4d : pushType === 'gold' ? 0xffd23f : pushType === 'long' ? hsv((now / 4) % 360, 1, 1) : 0x5aa0ff;
      pushGlow.alpha = 0.55 + 0.35 * Math.sin(now / 60); pushGlow.tint = col; pushRing.alpha = 0.5 + 0.5 * Math.sin(now / 50); pushRing.tint = col;
      pushTxt.alpha = 1; pushTxt.scale.set(1 + 0.07 * Math.sin(now / 80));
      const rq = G.pushReq;
      if (pushType === 'long' && rq) { pushGauge.lineStyle(10, 0xffe066).arc(0, 0, PR * 1.05, -Math.PI / 2, -Math.PI / 2 + Math.min(1, rq.hold / 1.2) * Math.PI * 2); }
    } else { pushGlow.alpha = 0; pushRing.alpha = 0; pushTxt.alpha = 0.5; pushTxt.scale.set(1); }
    // 震動
    if (shakeK > 0) { shakeK = Math.max(0, shakeK - dt * 40); B.position.set(BX + (Math.random() - 0.5) * shakeK, BY + (Math.random() - 0.5) * shakeK); }
    else B.position.set(BX, BY);
    stopLit.alpha = U.stopped ? 0.55 + 0.45 * Math.sin(now / 120) : 0;
    drawGauge(lampT);
    { const need = owned() === 0 && started, k = need ? Math.abs(Math.sin(now / 200)) : 0;   // 沒珠子：購買鈕發亮閃爍（不用透明度，否則底圖的小按鈕會透出來）
      if (rentBtn.flash) { rentBtn.alpha = 1; rentBtn.flash.alpha = 0.55 * k; rentBtn.halo.alpha = 0.8 * k; } else rentBtn.alpha = need ? 0.45 + 0.55 * k : 1; }
    // DEV 覆蓋層
    devSprite.visible = !!(PK.Dev && PK.Dev.handlesOn && PK.Dev.handlesOn());
    if (devSprite.visible) { const g = devCanvas.getContext('2d'); g.clearRect(0, 0, 800, BH); PK.Dev.drawOverlay(g); devSprite.texture.update(); }
  }
  let last = performance.now();
  app.ticker.add(() => {
    const now = performance.now(), raw = (now - last) / 1000, dt = Math.min(0.05, raw); last = now;
    perf.t0 = now; perf.sec = raw;
    frame(dt); render(dt, now);
  });
  // 排在 Pixi 自己的繪圖之後：量這一格從更新到畫完總共花了多久
  app.ticker.add(() => { govern(performance.now() - perf.t0, perf.sec || 0); }, null, PIXI.UPDATE_PRIORITY.UTILITY);

  // 測試用：手動推進（視窗隱藏時 requestAnimationFrame 會暫停）
  PK.Machine = {
    simulate(sec) { const dt = 1 / 60; for (let t = 0; t < sec; t += dt) frame(dt); render(1 / 60, performance.now()); },
    upper, lower, PAY, U, start, setPower, popOut, payout, owned, app, handle, toggleTrails, perf, layoutHome, showHome, hideHome, home, layoutLoad, showLoading, hideLoading, goHome,
    rect() { const s = M.scale.x; return { x: M.x, y: M.y, w: MW * s, h: MH * s, r: 34 * s }; },   // 機台在螢幕上的範圍（CSS 像素）：投打對決的畫面只蓋這一塊
  };
})();

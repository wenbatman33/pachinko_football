/* =========================================================
 * P PK大逆转 — 設定檔
 * 所有可調整的版面／物理／規格數值集中在這裡，DEV 工具會改寫這些物件
 * ========================================================= */
window.PK = window.PK || {};

(function (PK) {
  'use strict';

  // ---------- 開發工具只在本機開放 ----------
  // localhost／127.0.0.1／file: 才有右下角齒輪與 D、J 鍵；上線版隱藏。上線版要用時在網址加 ?dev=1
  PK.DEV = (function () {
    try {
      var h = location.hostname;
      if (location.protocol === 'file:' || h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || /\.localhost$/.test(h)) return true;
      return /[?&]dev=1(&|$)/.test(location.search);
    } catch (e) { return false; }
  })();
  if (PK.DEV) document.documentElement.classList.add('pk-dev');

  // ---------- 機種規格（スペック） ----------
  // prob: 通常時大當り機率；stProb: RUSH 中機率；stSpins: ST 回數；jitanSpins: 時短回數
  PK.SPECS = {
    middle: {
      name: '标准', label: '1/319.7', prob: 1 / 319.7, stProb: 1 / 99.4, stSpins: 163,
      ltProb: 1 / 99.4, ltSpins: 250, jitanSpins: 100,
    },
    light: {
      name: '轻松', label: '1/199.8', prob: 1 / 199.8, stProb: 1 / 99.4, stSpins: 130,
      ltProb: 1 / 99.4, ltSpins: 230, jitanSpins: 100,
    },
    ama: {
      name: '超好中', label: '1/99.9', prob: 1 / 99.9, stProb: 1 / 49.9, stSpins: 60,
      ltProb: 1 / 49.9, ltSpins: 115, jitanSpins: 50,
    },
  };

  // 目前用哪一組機率。2026-11-11 使用者：「你機率的配置也應該寬鬆點」→ 從 light（1/199.8）換成 ama（1/99.9，連莊中 1/49.9）。
  // 遊戲裡沒有讓玩家選機率的介面，所以存檔裡舊的 spec 不沿用，一律照這裡
  PK.SPEC_DEFAULT = 'ama';

  // 大當り振り分け（ヘソ = 特図1、電チュー = 特図2）
  PK.ALLOT = {
    heso: [ // 奇數圖柄 → RUSH，偶數 → 時短（チャンスタイム）
      { w: 4, rounds: 10, next: 'rush', sym: [7] },
      { w: 46, rounds: 5, next: 'rush', sym: [1, 3, 5, 9] },
      { w: 50, rounds: 3, next: 'jitan', sym: [2, 4, 6, 8] },
    ],
    denchu: [ // RUSH / 時短中：全部 RUSH，一部分觸發ラッキートリガー
      { w: 55, rounds: 10, next: 'rush', sym: [7, 3] },
      { w: 37, rounds: 5, next: 'rush', sym: [1, 5, 9] },
      { w: 8, rounds: 10, next: 'lt', sym: [7] },
    ],
    lt: [ // LT 中：全 10R，繼續 LT
      { w: 100, rounds: 10, next: 'lt', sym: [7, 3, 1, 5, 9] },
    ],
  };

  PK.PAYOUT = { heso: 1, denchu: 1, pocket: 3, attacker: 15, attackerCount: 10 };
  PK.RENT = { yen: 1000, balls: 250 };

  // ---------- 盤面版面（邏輯座標 800 × 1060；2026-11-09 改成直立橢圓、液晶加大） ----------
  // DEV 工具可拖曳／調整，匯出後由 Claude 寫回這裡
  PK.LAYOUT = {
    board: { w: 800, h: 1060 },
    field: { cx: 400, cy: 535, r: 385, ry: 465 },        // 外レール內緣：藥丸形（r＝半寬＝上下半圓半徑、ry＝上下半高）
    innerRail: { r: 362, from: 120, to: 226 },            // 內レール（與外レール距離固定 23）；角度為橢圓參數角（度）
    lcd: { x: 150, y: 262, w: 500, h: 375, arch: 28 },    // 液晶外框（arch = 頂部拱高）；左上角與內レール之間要留約 5 顆珠子寬的球路（540 寬時太窄）
    stage: { x: 262, w: 300, depth: 22, hole: 26 },       // ステージ（位於液晶下緣）
    warp: { x: 152, y: 470, r: 13 },                      // ワープ入口（液晶左牆上；開口 2r+4 高）
    // ワープ通道：入口 → 液晶左下緣前方的透明管 → ステージ左端（珠子全程看得到；控制點會用平滑曲線串起來）
    warpTube: [[166, 474], [174, 490], [176, 530], [177, 585], [182, 610], [196, 624], [222, 631], [250, 636]],
    windmill: { x: 110, y: 681, r: 12 },                  // 風車
    heso: { x: 405, y: 830, w: 22, gap: 28, wide: 50, wideTop: 40 },  // wide／wideTop＝大獎中翼片張開時的收珠半寬／高度             // ヘソ＝本壘（gap = 命釘間距；球場底圖的本壘板會對齊這裡）
    pockets: [ { x: 291, y: 866, w: 12 }, { x: 518, y: 866, w: 12 } ],   // 一般入賞口：夾著啟動口左右對稱（參考真台：袖入賞口在ヘソ兩側）
    centerUnit: {                                         // 中央機關（assets/img/center_unit.webp，量自 tools/measure_unit.py）：外側柱對齊液晶左右牆，窗口內放液晶
      win: [0.1514, 0.2666, 0.8486, 0.7236], side: [0.112, 0.888], bottom: 0.8154,
      hull: [[0.1084, 0.1934], [0.124, 0.1514], [0.1553, 0.125], [0.1865, 0.1025], [0.2178, 0.0879], [0.249, 0.0752], [0.3115, 0.0557], [0.3584, 0.0439], [0.4053, 0.0352], [0.4521, 0.0293], [0.499, 0.0273],
        [0.5615, 0.0312], [0.6084, 0.0381], [0.6709, 0.0518], [0.7178, 0.0654], [0.7646, 0.082], [0.7959, 0.0957], [0.8271, 0.1133], [0.8428, 0.125], [0.874, 0.1523], [0.8896, 0.1904]],
      plat: [[0.106, 0.75], [0.112, 0.78], [0.124, 0.80], [0.14, 0.8154]],   // 底座左緣（由上而下；右緣左右對稱）
      plate: [0.449, 0.554],                              // 底座正中央原本的本壘盾牌（會被誤認成洞口，改畫成 V 字導槽）
      archK: 0.68, thin: 8,                               // 拱頂縱向比例＋液晶細框（液晶畫面 484×363；拱頂頂端維持在 y≈169，跟調好的球路一樣）
    },
    gate: { x: 766, y: 560, r: 15 },                      // 普図ゲート
    startPlate: { x: 405, y: 903, w: 78, h: 28 },         // 啟動口燈座下緣的 START 名牌（名牌範圍內不放釘）
    ramp: { x1: 778, y1: 640, x2: 548, y2: 800 },         // 右打ちルート
    denchu: { t0: 0.02, t1: 0.22 },                       // 電チュー在 ramp 上的位置
    attacker: { t0: 0.58, t1: 0.80 },                     // 大獎口在右邊斜軌上的位置（斜軌長度的比例）
    yaku: { x: 416, y: 280, size: 150 },                  // 役物（金色棒球）
    warpGuard: { x0: -8, y0: -62, x1: -50, y1: -32, skip: [1] }, // ワープ入口上方的撥珠釘（相對ワープ入口；skip＝中間留一個缺口）
    roadNails: { x1: 150, y1: 720, x2: 377, y2: 808, step: 15, gapEvery: 999, gapAt: 998 }, // 左道釘不留漏珠缺口：走上左道釘的珠子穩定滾到 START（使用者要一條穩定的路線）
    roadNails2: { x1: 781, y1: 612, x2: 433, y2: 808, step: 15, gapEvery: 6, gapAt: 3, inset: 1 }, // 右邊的道釘（沒有右打時：把右側下來的珠子導向啟動口）
    gauge: 'blueprint',                                   // 手工ゲージ（js/gauge.js）
    out: { y: 998, hw: 42 },                              // 出口洞：y＝珠子出界線；hw＝外框底部開口的半寬（只有畫面上黑色出口洞這一段不擋）
  };

  // ---------- 液晶內容版面（液晶畫布 960 × 720） ----------
  PK.LCD_LAYOUT = {
    w: 960, h: 720,
    reelX: [210, 480, 750], reelY: 330, symSize: 230, symGap: 250,
    miniX: 92, miniY: 104, miniSize: 52, miniGap: 56,
    holdY: 672, holdActiveX: 480, holdX0: 580, holdGap: 60, holdR: 20, holdActiveR: 28,
    titleFont: 92, bannerFont: 76, infoFont: 30,
    colorMain: '#ffd23f', colorHot: '#ff3355', colorCool: '#3fd2ff',
  };

  // ---------- 物理參數 ----------
  PK.PHYS = {
    ballR: 7, nailR: 3, gravity: 1500, substeps: 6,
    warpV0: 220, warpAcc: 900,  // 珠子在ワープ透明管裡的初速與加速度（約 0.5 秒走完）
    eNail: 0.52, eWall: 0.32, eRail: 0.08, friction: 0.992,
    jitter: 0.12,              // 撞釘時的隨機偏折
    fireInterval: 0.6,         // 每分 100 發
    powerCurve: [[0.1, 370], [0.7, 540], [0.82, 700], [0.9, 860], [0.95, 950], [1.0, 1000]], // 手把力道 → 交接點速度（橢圓盤面重調）
    foulPower: 0.1,            // 低於此力道 → ファール
    powerJitter: 0.012,
    maxBalls: 70,
    stageKick: 150,             // ステージ中央落下時的左右散布
  };

  // ---------- 演出時間（毫秒，DEV 可調） ----------
  PK.TIMING = {
    speed: 1.0,                // 全體演出速度倍率
    spinNormal: 9000, spinShort: 3500, spinRush: 2200,
    reelStopGap: 650, reachNormal: 9000, roundGap: 4000, roundMax: 45000,   // roundMax：沒有右打時大獎進球靠 START（進球率約 2 成），一回合要比較久才進滿 10 顆
    denchuOpen: 2200, attackerFlash: 600,
  };

  // ---------- 3D 機台構造（世界座標：盤面中心為原點，Y 向上，Z 朝向玩家） ----------
  PK.MACHINE = {
    bodyW: 980, faceTop: 470, headerH: 300, dataH: 76,
    trayTop: -470, trayFloor: -508, trayBottom: -640, trayDepth: 178,
    lowerTop: -650, lowerBottom: -770,
    handle: { x: 326, y: -684, z: 150, r: 76 },
    push: { x: 0, y: -566, z: 206, r: 58 },
    rent: { x: 262, y: -574, z: 198, r: 32 },
    volume: { x: 340, y: -574, z: 198, r: 24 },
    ballDisp: { x: -270, y: -574, z: 196, w: 250, h: 70 },
    logo: { x: 0, y: 598, z: 64, w: 640 },
    glassOpacity: 0, bloom: 0.16, bloomThreshold: 1.0, envIntensity: 0.6, exposure: 0.88, trayTilt: 0.3,
  };

  // ---------- 鏡頭（PC / 手機分開） ----------
  PK.LAYOUT_PC = { fov: 28, fitW: 1120, fitH: 1560, centerY: 20, camLift: 520, lookDrop: 20, parallax: 26 };
  PK.LAYOUT_MOBILE = { fov: 30, fitW: 920, fitH: 1760, centerY: -10, camLift: 480, lookDrop: 20, parallax: 14 };

  // ---------- 資產清單 ----------
  PK.IMAGES = {
    bg_day: 'assets/img/bg_day.webp', bg_sunset: 'assets/img/bg_sunset.webp',
    bg_night: 'assets/img/bg_night.webp', bg_gold: 'assets/img/bg_gold.webp',
    bg_ninth: 'assets/img/bg_ninth.webp', cut_hero: 'assets/img/cut_hero.webp',
    cut_manager: 'assets/img/cut_manager.webp', cut_heroine: 'assets/img/cut_heroine.webp',
    splash_homerun: 'assets/img/splash_homerun.webp', splash_rush: 'assets/img/splash_rush.webp', yaku_ball: 'assets/img/yaku_ball.webp',
    // 大獎動畫分鏡
    sc_stadium_night: 'assets/img/sc_stadium_night.webp', sc_pitcher_smirk: 'assets/img/sc_pitcher_smirk.webp', sc_hero_rise: 'assets/img/sc_hero_rise.webp', sc_manager_shout: 'assets/img/sc_manager_shout.webp', sc_heroine_megaphone: 'assets/img/sc_heroine_megaphone.webp', sc_hit_single: 'assets/img/sc_hit_single.webp', sc_walk: 'assets/img/sc_walk.webp', sc_steal: 'assets/img/sc_steal.webp', sc_score: 'assets/img/sc_score.webp', sc_tie_crowd: 'assets/img/sc_tie_crowd.webp', sc_pitcher_shaken: 'assets/img/sc_pitcher_shaken.webp', sc_bases_loaded: 'assets/img/sc_bases_loaded.webp', sc_pinch_walkout: 'assets/img/sc_pinch_walkout.webp', sc_memory: 'assets/img/sc_memory.webp', sc_last_pitch: 'assets/img/sc_last_pitch.webp', sc_eye: 'assets/img/sc_eye.webp', sc_impact: 'assets/img/sc_impact.webp', sc_ball_sky: 'assets/img/sc_ball_sky.webp', sc_round_bases: 'assets/img/sc_round_bases.webp', sc_pileup: 'assets/img/sc_pileup.webp', sc_heroine_tears: 'assets/img/sc_heroine_tears.webp', sc_hero_raise: 'assets/img/sc_hero_raise.webp',
    sym_1: 'assets/img/sym_1.webp', sym_2: 'assets/img/sym_2.webp', sym_3: 'assets/img/sym_3.webp', sym_4: 'assets/img/sym_4.webp', sym_5: 'assets/img/sym_5.webp', sym_6: 'assets/img/sym_6.webp', sym_7: 'assets/img/sym_7.webp', sym_8: 'assets/img/sym_8.webp', sym_9: 'assets/img/sym_9.webp',
    parlor_bg: 'assets/img/parlor_bg.webp', logo: 'assets/img/logo.webp',
    fx_reach: 'assets/img/fx_reach.webp', fx_gekiatsu: 'assets/img/fx_gekiatsu.webp', fx_ooatari: 'assets/img/fx_ooatari.webp',
    fx_homerun: 'assets/img/fx_homerun.webp', fx_rush: 'assets/img/fx_rush.webp', fx_lt: 'assets/img/fx_lt.webp', machine_full: 'assets/img/machine_full.webp', ui_btn_red: 'assets/img/ui_btn_red.webp', home_bg: 'assets/img/home_bg.webp', home_btn: 'assets/img/home_btn.webp', home_chapters: 'assets/img/home_chapters.webp', logo_line: 'assets/img/logo_line.webp',
  };

  PK.SOUNDS = {
    // 背景音樂只列現在在用的。舊的都拿掉了（使用者 2026-11-10：「音樂舊的我都不用，都可以刪」）：最早沒有歌聲的 bgm_normal、
    // 被第三版取代的 bgm_bonus／bgm_bonus_v2／jingle_bigwin／jingle_bigwin_v2、十一首試聽候選曲；檔案移到 _backup/20261110_old_music/（不進版）
    // 連莊與幸運爆發原本各有一首舊配樂（bgm_rush、bgm_lt），同一天也拿掉了：那些狀態現在都播嗆司曲
    bgm: ['bgm_cheer_m', 'bgm_reach', 'bgm_spsp', 'jingle_rush', 'jingle_end', 'jingle_bigwin_v3', 'bgm_bonus_v3'],
    sfx: ['launch', 'tink0', 'tink1', 'tink2', 'jara_loop', 'heso', 'payout', 'reel_stop', 'reel_tick',
      'reach_hit', 'round_hit', 'kyuin', 'cutin', 'push', 'hold_up', 'rainbow', 'bat', 'mitt', 'boom',
      'crowd_cheer', 'crowd_groan', 'crowd_loop', 'attacker', 'gate', 'shakin', 'drumroll', 'count',
      'yaku', 'fail', 'lt', 'heartbeat', 'pitch'],
    voice: ['reach', 'chance', 'gekiatsu', 'homerun', 'sayonara', 'atari', 'migi', 'hidari', 'rush',
      'lt', 'playball', 'ninth', 'kattobase', 'push', 'strike', 'keizoku', 'rush_end', 'omedetou',
      'next', 'zenkaiten', 'jitan', 'utte', 'round', 'matamada', 'kakutei', 'gold'],
  };

  // 平常的背景音樂：嗆司曲風格的原創曲（tools/gen_music_cheer.py 的 bgm_cheer_m）。程式裡仍然叫 bgm_normal，在這裡對過去；新舊版都一樣
  PK.BGM_ALIAS = { bgm_normal: 'bgm_cheer_m', bgm_rush: 'bgm_cheer_m', bgm_lt: 'bgm_cheer_m' };   // 舊的狀態配樂名稱也對到嗆司曲（以防還有地方用到）

  // ---------- DEV 覆寫：從 localStorage 載入上次調整 ----------
  // 盤面形狀工具（藥丸形＝膠囊形：左右筆直、上下半圓）。field.r＝半寬（半圓半徑），field.ry＝上下半高；直線段半長 h＝ry－r
  // （函式名稱沿用 ell*：ellK < 1 在盤面內；ellPt(參數角, inset)：0°右中、90°最下、180°左中、270°最上，沿周長等速）
  function pillH() { var F = PK.LAYOUT.field; return Math.max(0, (F.ry || F.r) - F.r); }
  PK.ellK = function (x, y, inset) {
    var F = PK.LAYOUT.field, h = pillH(), R = F.r - (inset || 0), dy = Math.max(0, Math.abs(y - F.cy) - h);
    return Math.sqrt((x - F.cx) * (x - F.cx) + dy * dy) / R;
  };
  PK.ellPt = function (deg, inset) {
    var F = PK.LAYOUT.field, h = pillH(), R = F.r - (inset || 0), PI = Math.PI, L = 4 * h + 2 * PI * R;
    var s = (((deg % 360) + 360) % 360) / 360 * L, a;
    if (s < h) return [F.cx + R, F.cy + s];
    s -= h; if (s < PI * R) { a = s / R; return [F.cx + R * Math.cos(a), F.cy + h + R * Math.sin(a)]; }
    s -= PI * R; if (s < 2 * h) return [F.cx - R, F.cy + h - s];
    s -= 2 * h; if (s < PI * R) { a = PI + s / R; return [F.cx + R * Math.cos(a), F.cy - h + R * Math.sin(a)]; }
    s -= PI * R; return [F.cx + R, F.cy - h + s];
  };
  // 點對應的參數角（0..360，以外レール為準）
  PK.shapeAng = function (x, y) {
    var F = PK.LAYOUT.field, h = pillH(), R = F.r, PI = Math.PI, L = 4 * h + 2 * PI * R, s, a;
    if (y > F.cy + h) { a = Math.atan2(y - F.cy - h, x - F.cx); if (a < 0) a += 2 * PI; s = h + a * R; }
    else if (y < F.cy - h) { a = Math.atan2(y - F.cy + h, x - F.cx); if (a < 0) a += 2 * PI; s = 3 * h + PI * R + (a - PI) * R; }
    else if (x >= F.cx) s = y >= F.cy ? y - F.cy : L - (F.cy - y);
    else s = h + PI * R + (F.cy + h - y);
    return s / L * 360;
  };
  // x 處的上下邊界、y 處的左右邊界（inset 內縮）；超出回傳 null
  PK.ellYs = function (x, inset) {
    var F = PK.LAYOUT.field, h = pillH(), R = F.r - (inset || 0), u = x - F.cx;
    if (Math.abs(u) > R) return null;
    var d = Math.sqrt(R * R - u * u); return [F.cy - h - d, F.cy + h + d];
  };
  PK.shapeXs = function (y, inset) {
    var F = PK.LAYOUT.field, h = pillH(), R = F.r - (inset || 0), dy = Math.max(0, Math.abs(y - F.cy) - h);
    if (dy > R) return null;
    var d = Math.sqrt(R * R - dy * dy); return [F.cx - d, F.cx + d];
  };
  // 一體成形機台（2026-11-09）：整台用一張 AI 生成的機台照片（assets/img/machine_full.webp，1024×1536，照物理配置圖畫的），
  // 盤面零件、外殼、台座都在圖上；程式只疊釘子、珠子、液晶、燈光與會動的零件。盤面邏輯座標 → 圖片像素：x*1.1468+53.3、y*1.1468+114.3
  PK.UNI = { img: 'machine_full', s: 1.1468, ox: 53.3, oy: 114.3, iw: 1024, ih: 1536,
    logo: { x: 515, y: 149, w: 448 },
    lcd: [152.3, 272.7, 646.8, 636.3],                                  // 液晶（底圖洋紅區，盤面邏輯座標 x0,y0,x1,y1）                                   // 頂部金牌上的一行標題（圖片像素）
    deck: { y0: 1240, y1: 1536 },                                       // 台座範圍（圖片像素）
    speakers: [[143, 127, 80], [877, 130, 80]], speakerPanels: [[143, 127, 62], [877, 130, 62]], tubes: [],   // 喇叭燈圈、喇叭網面（放大獎次數／轉數）。兩側的 LED 燈管 2026-11-12 拿掉了（使用者：「左右兩側的燈有點虛設」「不要搶走盤面的焦點」）：機台圖兩側改成素面黑色烤漆，程式也不再往那裡打光；原本的位置是 [[16, 258, 48, 1245], [976, 258, 1008, 1245]]
  };
  // 沒有右打（2026-11-09 使用者：右打沒人懂；大獎中一樣打左邊、持續進 START 就好，右邊也要能走到 START）
  PK.NO_RIGHT = true;
  PK.LAYOUT_VER = 10;   // 2026-11-09：中央機關、一般入賞口改成夾著啟動口左右對稱

  // 中央機關的座標換算（物理、釘配置、畫面共用）：拱頂用圖的原比例；窗口縱向拉成 4:3 放液晶；底座用原比例
  PK.unitGeom = function (L) {
    var C = L.centerUnit, lcd = L.lcd; if (!C) return null;
    var sx = lcd.w / (C.side[1] - C.side[0]), left = lcd.x - C.side[0] * sx;
    var ww = C.thin ? lcd.w - 2 * C.thin : (C.win[2] - C.win[0]) * sx, wh = ww * 0.75, sy = wh / (C.win[3] - C.win[1]);   // thin＝細框寬度：液晶畫面幾乎撐滿液晶外框
    var winBot = lcd.y + lcd.h, winTop = winBot - wh;
    var U = function (u) { return left + u * sx; };
    var ak = C.archK || 1;   // 拱頂縱向比例（1＝原圖比例）
    var V = function (v) { return v < C.win[1] ? winTop - (C.win[1] - v) * sx * ak : winTop + (v - C.win[1]) * sy; };
    // 底座只做在ステージ正下方（等比縮小、中心對準ステージ落球口）：兩翼不能伸到液晶左下，那裡是「風車右邊 → 道釘 → 啟動口」的主路
    var S = L.stage, pcx = S.x + S.w / 2, ps = (S.w + 24) / (1 - 2 * C.plat[0][0]);
    var PU = function (u) { return pcx + (u - 0.5) * ps; }, PV = function (v) { return winBot + (v - C.win[3]) * ps; };
    return { sx: sx, sy: sy, left: left, winTop: winTop, winBot: winBot, winL: C.thin ? lcd.x + C.thin : U(C.win[0]), winR: C.thin ? lcd.x + lcd.w - C.thin : U(C.win[2]), U: U, V: V, C: C,
      ps: ps, pcx: pcx, PU: PU, PV: PV, platBot: PV(C.bottom), rim: 5,   // rim＝液晶下緣細金邊的厚度
      hull: C.hull.map(function (p) { return [U(p[0]), V(p[1])]; }),
      // 上緣輪廓（含拱頂兩側略凸出側柱的部分），左 → 右
      topLine: function () {
        // 新版（2026-11）：金色拱頂拿掉了（同事：「莫名其妙的裝飾佔住盤面範圍」），液晶頂端只剩一道低矮的圓弧頂（L.roof：兩端在 y0、正中央最高在 peak）
        // 左右兩端可以不一樣高（y0＝左端、y0R＝右端）：右半邊底下藏著上方入口的透明管，所以右端比較高
        if (L.roof) {
          var RF = L.roof, CH = RF.chamfer || [0, 0], xa = lcd.x + CH[0], xb = lcd.x + lcd.w - CH[0], ha = (xb - xa) / 2, rcx = lcd.x + lcd.w / 2, rn = RF.n || 24, rp = [];
          if (CH[0]) rp.push([lcd.x, RF.y0 + CH[1]]);   // 削角：兩個上角各削掉一塊（珠子離開發射軌道的第一個彎比較寬）
          for (var ri = 0; ri <= rn; ri++) { var rx = xa + (xb - xa) * ri / rn, ru = (rx - rcx) / ha, re = ru < 0 ? RF.y0 : (RF.y0R == null ? RF.y0 : RF.y0R); rp.push([rx, RF.peak + (re - RF.peak) * ru * ru]); }
          if (CH[0]) rp.push([lcd.x + lcd.w, (RF.y0R == null ? RF.y0 : RF.y0R) + CH[1]]);
          return rp;
        }
        var a = [[lcd.x, winTop], [lcd.x - 3, V(0.235)]], b = [[lcd.x + lcd.w + 3, V(0.235)], [lcd.x + lcd.w, winTop]];   // 拱頂兩端略凸出側柱（只算 3，貼著左牆的珠子才會掉進ワープ）
        return a.concat(C.hull.map(function (p) { return [U(p[0]), V(p[1])]; })).concat(b);
      },
      // 底座外緣，左 → 右（不含中央落球口）
      platLine: function () {
        var l = [[PU(C.plat[0][0]), winBot]].concat(C.plat.map(function (p) { return [PU(p[0]), PV(p[1])]; }));
        var r = C.plat.slice().reverse().map(function (p) { return [PU(1 - p[0]), PV(p[1])]; }).concat([[PU(1 - C.plat[0][0]), winBot]]);
        return l.concat(r);
      },
    };
  };
  // ワープ通道路徑（物理與畫面共用）：入口 → warpTube 控制點 → 出口，用 Catmull-Rom 串成平滑曲線，附累計長度
  PK.warpPath = function (L, exit) {
    var c = [[L.warp.x, L.warp.y]].concat(L.warpTube || []).concat([[exit.x, exit.y]]), pts = [], N = 10;
    for (var i = 0; i < c.length - 1; i++) {
      var p0 = c[Math.max(0, i - 1)], p1 = c[i], p2 = c[i + 1], p3 = c[Math.min(c.length - 1, i + 2)];
      for (var k = 0; k < N; k++) {
        var t = k / N, t2 = t * t, t3 = t2 * t;
        pts.push([0, 1].map(function (j) { return 0.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3); }));
      }
    }
    pts.push([exit.x, exit.y]);
    var cum = [0]; for (var m = 1; m < pts.length; m++) cum.push(cum[m - 1] + Math.hypot(pts[m][0] - pts[m - 1][0], pts[m][1] - pts[m - 1][1]));
    return { pts: pts, cum: cum, len: cum[cum.length - 1] };
  };
  // 路徑上走了 s 長度的位置與切線角度
  PK.pathAt = function (wp, s) {
    var cum = wp.cum, pts = wp.pts, i = 1;
    s = Math.max(0, Math.min(wp.len, s));
    while (i < cum.length - 1 && cum[i] < s) i++;
    var a = pts[i - 1], b = pts[i], seg = cum[i] - cum[i - 1] || 1, t = (s - cum[i - 1]) / seg;
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, Math.atan2(b[1] - a[1], b[0] - a[0])];
  };
  // ---------- 漫畫《PK大逆转》解鎖（累計贏得的珠數，新遊戲不會清掉） ----------
  // 沿革：最早看累積遊玩時間（2026-11-10 改成兩小時全解：0、5、15、27、40、54、69、85、102、120 分），2026-11-11 改成看贏得的珠數
  // unlockBalls[i]＝第 i+1 話需要的「累計贏得珠數」；achievements[i]＝解鎖時拿到的成就名稱
  // 2026-11-11 使用者：「贏得漫畫的機制有點糟糕」「是不是贏得多少彈珠量比較好一點」→ 從累積遊玩時間改成累計贏得的珠數
  // （只算機台吐出來的：進洞、大獎、投打對決；買的不算、打出去不倒扣、按新遊戲不歸零）。
  // 門檻是用 tools/sim_economy.js 跑出來的（2026-11-11，機率 1/99.9、對決全壘打 300 顆／安打 60 顆、各 24 次 3 小時）：
  // 十話全拿＝最快 58 分、中間 100 分上下、四分之三的人 2 小時 20 分內、最慢 2 小時 45 分；第二話中間 5 分鐘（第一次大獎就拿到）。
  // 改機率、出珠數或對決獎勵之後要重跑
  PK.MANGA = {
    unlockBalls: [0, 1000, 4000, 8000, 13000],   // 足球版五話（2026-11-12）：門檻沿用原本的節奏、總量約原本的三分之二，改機率後要用 tools/sim_economy.js 重跑
    achievements: ['国家队报到', '第七十分钟的见证人', '高原冬训生', '补时绝杀的见证人', '世界杯八强的见证人'],
    previewShot: 2.8,     // 液晶預告每格秒數
    readPromptSec: 15,    // 預告播完後「點液晶立刻閱讀」維持幾秒
  };
  // 邊玩邊看漫畫（2026-11-11 使用者：「有辦法分割螢幕看漫畫嗎」）：閱讀器靠邊、機台讓位繼續玩。
  // 寬螢幕＝漫畫在右邊、機台在左邊；瘦長螢幕（手機直立）＝漫畫在上面、機台在下面。玩家可以拖中間的把手改分割位置。
  // tall＝瘦長螢幕時漫畫佔螢幕高度的比例；wideMin／wideMax＝寬螢幕時漫畫那一欄的最小／最大寬度（畫面像素）。開發工具第一分頁的漫畫區可調
  // btnH＝遊戲中「看漫畫」鈕的高度（畫面像素）。這顆鈕放在機台外面的空帶上（手機是機台上方、寬螢幕是機台右邊），沒有空帶就縮成機台右上角的小圓鈕
  PK.SPLIT = { tall: 0.5, wideMin: 340, wideMax: 760, btnH: 46 };
  // 漫畫等級計量表（機台左下、持有珠數下面）：台座比例座標 x＝畫面寬的比例、y＝台座高的比例；開發工具第一分頁的漫畫區可拉滑桿調
  PK.METER = { x0: 0.0703, y0: 0.712, x1: 0.3067, y1: 0.93 };
  // 首頁（封面）版面：熱血少年漫畫週刊封面風（使用者 2026-11-10 從三個範本選 A）。機台座標：寬 1000、高 1500；x、y 都是元件中心
  // 開發工具第一分頁「🏠 首頁」可以把首頁叫出來直接拖元件、拉滑桿
  PK.HOME = {
    logo: { x: 500, y: 166, w: 730 },                              // 標誌
    load: { y: 1290, w: 800, h: 54, size: 54 },                    // 載入畫面的進度條（中心高度、寬、粗細、字的大小；棒球＝粗細的 1.9 倍）；預設值要跟 css/style.css 的 --ld-* 一樣
    tag: { x: 612, y: 846, w: 720, h: 84, rot: -7, size: 44 },     // 斜放的黃色標語框
    panel: { x: 500, y: 1046, w: 950, h: 236 },                    // 漫畫櫃資訊框（標題、十話的格子、下一話進度條）
    main: { x: 500, y: 1264, w: 820, size: 80, sub: 32 },          // 主要按鈕：繼續遊戲（第一次玩是開始遊戲）；size＝大字、sub＝「持有幾顆」小字
    sub: { x: 500, y: 1400, w: 340, h: 74, size: 36 },             // 次要按鈕：新遊戲
    spk: { x: 938, y: 62, r: 34 },                                 // 右上角聲音開關
    foot: { y: 1466, size: 21 },                                   // 最下面的說明小字
  };
  // ---------- 投打對決（漫畫分鏡頁的打擊小遊戲，js/duel.js）----------
  // 使用者 2026-11-10 的決定：聽牌沒中時自動進入；每一話一位不同的對手（那一話的漫畫解鎖了才會出現）；
  // 全壘打給珠子＋漫畫解鎖時間往前推；操作只有「點畫面」——前幾話只抓時機，後面的對手要點在擊球點上；
  // 畫面只蓋住機台、不佔滿螢幕；介面是一頁漫畫分鏡（最上格對手特寫、中間打擊、最下格主角眼神）。
  // 開發工具第一分頁「⚾ 投打對決」可以直接選對手開打、進版面模式拖曳、拉滑桿
  PK.DUEL = {
    ver: 6,                        // 對手名單或欄位改了就加 1：開發工具存的舊微調會自動作廢（5＝足球版點球對決、6＝版面對齊新場景圖）
    on: 1,                         // 1＝開、0＝關
    trigger: { chance: 1, minGapSpins: 12 },   // 聽牌落空時進入的機率、兩次對決至少隔幾轉
    pitches: 3,                    // 一次對決最多幾腳（三腳定勝負：踢進就結束）
    reward: { hrBalls: 300, hitBalls: 60 },   // 世界波／球進了：送幾顆珠子（贏到的珠子直接算進漫畫進度）
    timing: { perfect: 0.045, good: 0.1, foul: 0.17 },           // 起腳時機的容許誤差（秒，正負）：世界波、球進了、中柱；每位對手再乘上自己的 ease
    aim: { perfect: 1.0, good: 2.0, foul: 3.2 },   // 要瞄準的對手：點的地方離準星幾個「準星半徑」以內算世界波、球進了、中柱
    // 版面（漫畫分鏡頁）：topL／topR＝最上格左、右兩邊的下緣（畫面高的比例；右邊比較高＝斜切）、botY＝最下格的上緣；
    // 其餘是中間大格裡的位置：x 是格寬的比例、y 是格高的比例、大小（H、W、R、Dy）是格寬的比例。
    // mound＝門將站的位置（球門線中央）、pitcherH＝門將的身高、batter＝陸遠的背影、zone＝球門框內的範圍（要跟場景圖上的球門對齊）、spot＝點球點上的球
    layout: { topL: 0.262, topR: 0.205, botY: 0.86, moundX: 0.5, moundY: 0.6, pitcherH: 0.215, batterX: 0.19, batterH: 0.5, batterDy: 0.2, zoneX: 0.5, zoneY: 0.472, zoneW: 0.8, zoneH: 0.255, ballR: 0.05, spotX: 0.5, spotY: 0.885 },   // 量自場景圖（球門柱在圖寬 10.5%～89.5%、橫梁 34%、球門線 60%、點球點 86%）
    // 對手：一話一位門將。ch＝第幾話解鎖後會出現；aim＝要不要點在準星上（0＝點哪裡都可以，只看時機）；flight＝準星從出現到最佳時機的秒數範圍；
    // ease＝時機容許誤差的倍率（越大越好踢）；hintAt＝進度到多少（0～1）才顯示準星；pitches＝準星的動法（fast 固定、change 比較慢、curve 上下滑到定位、slider 左右滑到定位）；
    // col＝這位對手的代表色（氣焰、特寫格的底色）；size＝身高比例（不寫＝1）
    opponents: [
      { ch: 1, id: 'shilei', name: '石磊', title: '中国队门将・队内点球训练', line: '来吧。让我看看你的左脚。', art: 'duel_p_shilei', face: 'duel_face_shilei', bg: 'duel_bg_train', col: '#2f8f4a', aim: 0, flight: [0.95, 1.15], ease: 1.35, hintAt: 0, pitches: ['fast', 'fast', 'change'] },
      { ch: 2, id: 'jp', name: '早濑岳', title: '日本队门将', line: '你的习惯，我们都研究过了。', art: 'duel_p_jp', face: 'duel_face_jp', bg: 'duel_bg_asia', col: '#f08a1c', aim: 0, flight: [0.82, 0.98], ease: 1.25, hintAt: 0, pitches: ['fast', 'change', 'fast'] },
      { ch: 3, id: 'ir', name: '莫拉迪', title: '伊朗队门将・八万人的主场', line: '在这里，没有人能进球。', art: 'duel_p_ir', face: 'duel_face_ir', bg: 'duel_bg_asia', col: '#7a8494', aim: 1, flight: [0.8, 0.94], ease: 1.25, hintAt: 0.1, pitches: ['fast', 'curve', 'change'] },
      { ch: 4, id: 'kr', name: '尹成贤', title: '韩国队门将・最后一轮', line: '到此为止了。', art: 'duel_p_kr', face: 'duel_face_kr', bg: 'duel_bg_home', col: '#3a9fe0', aim: 1, flight: [0.66, 0.8], ease: 1.12, hintAt: 0.2, pitches: ['fast', 'slider', 'curve'] },
      { ch: 5, id: 'de', name: '布兰特', title: '德国队队长・世界最佳门将', line: '证明给我看，你配站在这里。', art: 'duel_p_de', face: 'duel_face_de', bg: 'duel_bg_world', col: '#4a4a5c', aim: 1, flight: [0.56, 0.68], ease: 1.0, hintAt: 0.3, pitches: ['fast', 'slider', 'curve', 'change'] },
    ],
  };
  // 對決素材的資料（人物範圍、出手位置、場景站位）在 js/duel_art.js，由 tools/process_duel.py 自動產生
  // 大獎回合的漫畫格子（js/director.js RoundLive）：整張畫好的直式漫畫圖，依每一球與打席的結果換。進遊戲後才在背景載入
  // mp_p_*＝投手這一側、mp_b_*＝打者這一側；原圖在 art_src/panels（tools/manifest_panels.json）
  PK.PANELS = { mp_p_windup: 'assets/img/panels/mp_p_windup.webp', mp_p_release: 'assets/img/panels/mp_p_release.webp', mp_ball: 'assets/img/panels/mp_ball.webp', mp_mitt: 'assets/img/panels/mp_mitt.webp', mp_p_smirk: 'assets/img/panels/mp_p_smirk.webp', mp_p_shaken: 'assets/img/panels/mp_p_shaken.webp', mp_b_stance: 'assets/img/panels/mp_b_stance.webp', mp_b_glare: 'assets/img/panels/mp_b_glare.webp', mp_b_take: 'assets/img/panels/mp_b_take.webp', mp_b_foul: 'assets/img/panels/mp_b_foul.webp', mp_b_swing: 'assets/img/panels/mp_b_swing.webp', mp_b_grip: 'assets/img/panels/mp_b_grip.webp', mp_b_watch: 'assets/img/panels/mp_b_watch.webp', mp_cheer: 'assets/img/panels/mp_cheer.webp', mp_crowd: 'assets/img/panels/mp_crowd.webp', mp_versus: 'assets/img/panels/mp_versus.webp' };
  PK.CONFIG_KEYS = ['LAYOUT', 'LCD_LAYOUT', 'PHYS', 'TIMING', 'MACHINE', 'LAYOUT_PC', 'LAYOUT_MOBILE', 'METER', 'HOME', 'DUEL', 'SPLIT'];
  PK.DEFAULTS = JSON.parse(JSON.stringify(PK.CONFIG_KEYS.reduce(function (o, k) { o[k] = PK[k]; return o; }, {})));

  function deepAssign(dst, src) {
    Object.keys(src).forEach(function (k) {
      if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k]) && dst[k] && typeof dst[k] === 'object') {
        deepAssign(dst[k], src[k]);
      } else {
        dst[k] = src[k];
      }
    });
  }
  PK.deepAssign = deepAssign;

  try {
    var saved = PK.DEV ? localStorage.getItem('pk_dev_overrides') : null;   // 上線版不套用開發工具存的微調，大家看到的都是正式版面
    if (saved) {
      var o = JSON.parse(saved);
      if (o.layoutVer !== PK.LAYOUT_VER) delete o.LAYOUT;   // 版面改版（洞口位置等）後，舊的版面存檔不再套用
      if (o.DUEL && o.DUEL.ver !== PK.DUEL.ver) delete o.DUEL;   // 對決的對手名單改版後，舊的微調不再套用
      PK.CONFIG_KEYS.forEach(function (k) { if (o[k]) deepAssign(PK[k], o[k]); });
    }
  } catch (e) { /* 無法存取 localStorage 時忽略 */ }
})(window.PK);

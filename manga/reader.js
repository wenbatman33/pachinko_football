/* 《PK大逆转》條漫閱讀程式：讀 window.CHAPTER（建置時寫進每話的 HTML），畫出封面、分格、對白、狀聲詞 */
(function () {
  'use strict';
  var C = window.CHAPTER;
  if (!C) return;
  var EMBED = /[?&]embed=1(&|$)/.test(location.search);   // 遊戲裡的閱讀器開啟
  // 只能在遊戲的閱讀器裡看，而且那一話要已經解鎖；直接開網址（或沒解鎖）一律帶回遊戲。
  // 2026-11-11 以前每一話都能單獨開，網址又是照話數排的，沒解鎖也能直接看
  var ok = false;
  try { var PM = EMBED && window.parent !== window && window.parent.PK && window.parent.PK.Manga; ok = !!(PM && PM.isUnlocked && PM.isUnlocked(C.no)); } catch (e) { ok = false; }
  if (!ok) { try { window.top.location.replace(new URL('../../', location.href).href); } catch (e) { location.replace('../../'); } return; }
  document.documentElement.classList.add('embed');
  // 邊玩邊看的時候手指都在漫畫頁上，外面的遊戲收不到觸控；這段時間音樂被手機暫停（來電、通知音、切換 app…）的話沒有東西能把它叫回來。
  // 所以每一次點擊／放開都請遊戲對一次聲音（全螢幕看漫畫、聲音是故意暫停的時候，遊戲那邊不會動）
  ['pointerup', 'touchend', 'click'].forEach(function (t) {
    addEventListener(t, function () { try { window.parent.PK.Audio.unlock(); } catch (e) { /* 忽略 */ } }, { passive: true, capture: true });
  });
  // 角色名牌顏色
  var COLORS = { '陆远': '#ff5a4d', '顾长河': '#7fc8ff', '韩铮': '#ffb02e', '周牧': '#a9b8ff', '艾尔肯': '#ffd36b', '石磊': '#9be38a', '林晚': '#ff9ac0', '父亲': '#c9b79a', '神崎凛': '#6fa8ff', '姜泰俊': '#d0d6e0', '卡维': '#d0d6e0', '布兰特': '#c8c8d8', '解说': '#ffe066' };
  var NUM = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  var el = function (tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var colorOf = function (who) { for (var k in COLORS) if (who && who.indexOf(k) === 0) return COLORS[k]; return null; };

  document.title = 'PK大逆转｜第' + NUM[C.no] + '话〈' + C.title + '〉';
  var root = el('main', 'col'); document.body.appendChild(root);
  document.body.insertBefore(el('div', 'progress'), document.body.firstChild);

  function talk(lines, at) {
    var list = lines.filter(function (l) { return (l.at || 'after') === at; });
    if (!list.length) return null;
    var box = el('div', 'talk ' + at);
    list.forEach(function (l) {
      if (l.type === 'nar') { var n = el('div', 'line nar'); n.appendChild(el('div', 'box', esc(l.text))); box.appendChild(n); return; }
      var ln = el('div', 'line ' + (l.side || 'l') + ' ' + l.type);
      if (l.who) { var w = el('div', 'who', esc(l.who)); var c = colorOf(l.who); if (c) w.style.setProperty('--c', c); ln.appendChild(w); }
      ln.appendChild(el('div', 'bubble', esc(l.text)));
      box.appendChild(ln);
    });
    return box;
  }

  C.items.forEach(function (p, i) {
    var lines = p.lines || [];
    var wh = (p.size || '1536x1024').split('x').map(Number);
    if (i === 0 && p.id === 'p00') {
      // 封面：圖＋書名、話數、標題
      var cv = el('section', 'cover');
      var im = new Image(); im.src = p.img; im.alt = '第' + NUM[C.no] + '话封面'; im.width = wh[0]; im.height = wh[1]; cv.appendChild(im);
      var t = el('div', 'titles');
      t.appendChild(el('div', 'series', 'PK大逆转'));
      t.appendChild(el('div', 'chno', '第' + NUM[C.no] + '话'));
      t.appendChild(el('div', 'chtitle', esc(C.title)));
      cv.appendChild(t); root.appendChild(cv);
      return;
    }
    var b = talk(lines, 'before'); if (b) root.appendChild(b);
    var pn = el('section', 'panel' + (wh[1] > wh[0] ? ' tall' : ''));
    var img = new Image(); img.loading = i < 3 ? 'eager' : 'lazy'; img.decoding = 'async'; img.src = p.img; img.alt = ''; img.width = wh[0]; img.height = wh[1];
    pn.appendChild(img);
    (p.sfx || []).forEach(function (s) {
      var sf = el('div', 'sfx', esc(s.text));
      sf.style.left = (s.x * 100) + '%'; sf.style.top = (s.y * 100) + '%';
      sf.style.setProperty('--rot', (s.rot || 0) + 'deg'); sf.style.setProperty('--k', s.size || 1);
      pn.appendChild(sf);
    });
    root.appendChild(pn);
    var a = talk(lines, 'after'); if (a) root.appendChild(a);
  });

  var end = el('section', 'end');
  end.appendChild(el('div', 'done', C.next ? '第' + NUM[C.no] + '话・完' : '全剧终'));   // 最終話（沒有下一話）顯示全劇終
  if (C.next) {
    // 下一話已建置好就變成連結，還沒有就顯示製作中（網址不寫在頁面裡，按了交給遊戲決定給不給看）
    var nx = el(C.hasNext ? 'a' : 'div', 'next');
    if (C.hasNext) nx.href = '#';
    nx.appendChild(el('div', 'lbl', '下一话'));
    nx.appendChild(el('div', 't', esc(C.next)));
    nx.appendChild(el('div', 'lock', C.hasNext ? '继续阅读 →' : '制作中・敬请期待'));
    end.appendChild(nx);
  }
  var back = el('a', 'tolib', '← 回漫画柜'); back.href = '#'; end.appendChild(back);
  root.appendChild(end);
  // 嵌在遊戲裡（?embed=1）：下一話要不要給看、回漫畫櫃，都交給遊戲決定（遊戲知道解鎖進度）
  if (EMBED) {
    var post = function (msg) { try { parent.postMessage(msg, location.origin === 'null' ? '*' : location.origin); } catch (e) { /* 忽略 */ } };
    if (C.next) {
      nx = end.querySelector('.next');
      var lockEl = nx.querySelector('.lock'); lockEl.textContent = '前往下一话 →';
      if (nx.tagName !== 'A') { var a2 = el('a', 'next'); while (nx.firstChild) a2.appendChild(nx.firstChild); nx.replaceWith(a2); nx = a2; }
      nx.href = '#'; nx.onclick = function (e) { e.preventDefault(); post({ type: 'pk-manga-next', no: C.no + 1 }); };
    }
    back.onclick = function (e) { e.preventDefault(); post({ type: 'pk-manga-cabinet' }); };
  }
  root.appendChild(el('div', 'foot', '《PK大逆转》原创漫画｜本作品纯属虚构，与真实人物、团体无关'));

  // 閱讀進度條
  var bar = document.querySelector('.progress');
  var upd = function () { var h = document.documentElement.scrollHeight - innerHeight; bar.style.width = (h > 0 ? scrollY / h * 100 : 0) + '%'; };
  addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); upd();
})();

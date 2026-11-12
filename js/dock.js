/* =========================================================
 * 操作面板（手機直立時機台下方多出來的那一塊，2026-11-12）
 *
 * 機台本體是固定的 2:3，瘦長的手機螢幕上下會剩一截；使用者：「手機版上下的留白是不是有機會填滿」。
 * 第一版做成佔滿下方的大面板加一顆大足球旋鈕，使用者：「好像有點誇張了吧」→ 現在是一條矮的橫列（跟上方功能列同一種樣式）：
 *   持有珠數、「购买」、橫向的力度條（2026-11-12 使用者：「下方的集數和旋鈕改成橫向的力度控制 bar，跟上面的旋鈕連動」）
 * 有沒有這一條、放哪裡，由 js/machine.js 的 fit() 決定（PK.DockSpace；空間不夠就不出現，電腦與平板不會有）。
 * ========================================================= */
(function (PK) {
  'use strict';
  var D = PK.Dock = { el: null }, drag = null;
  var nf = function (n) { return Math.floor(n).toLocaleString('en-US'); };
  function build() {
    var e = D.el = document.createElement('div'); e.className = 'pk-dock'; e.style.display = 'none';
    e.innerHTML = '<span class="pd-lab">持有</span><b class="pd-balls">0</b><button class="pd-buy">购买</button>'
      + '<div class="pd-power"><i></i><u></u><span>力度</span></div>';
    document.body.appendChild(e);
    e.querySelector('.pd-buy').onclick = function () { try { PK.Audio.unlock(); } catch (x) { /* 忽略 */ } if (PK.Machine.start) PK.Machine.start(); PK.Game.rent(); };
    // 力度條：手指按在哪裡、拖到哪裡，力度就是那個位置（最左＝0、最右＝最大）；跟機台右下的旋鈕是同一個力道，兩邊同步
    var k = D.bar = e.querySelector('.pd-power');
    var at = function (ev) { var r = k.getBoundingClientRect(), pad = r.height / 2; return (ev.clientX - r.left - pad) / Math.max(1, r.width - pad * 2); };
    k.addEventListener('pointerdown', function (ev) {
      ev.preventDefault(); try { PK.Audio.unlock(); } catch (x) { /* 忽略 */ }
      var M = PK.Machine; if (M.start) M.start();
      drag = { id: ev.pointerId }; M.U.holding = true; k.classList.add('on'); M.setPower(at(ev), true); tick();
      try { k.setPointerCapture(ev.pointerId); } catch (x) { /* 忽略 */ }
    });
    k.addEventListener('pointermove', function (ev) { if (drag && ev.pointerId === drag.id) { PK.Machine.setPower(at(ev), true); tick(); } });
    var end = function (ev) {
      if (!drag || (ev && ev.pointerId !== drag.id)) return;
      drag = null; var M = PK.Machine; M.U.holding = false; k.classList.remove('on');
      if (M.U.power > 0.12 && M.U.power < 0.8) { M.U.saved = M.U.power; try { localStorage.setItem('pk_proto_power', M.U.power); } catch (x) { /* 忽略 */ } }
    };
    k.addEventListener('pointerup', end); k.addEventListener('pointercancel', end);
    setInterval(tick, 120);
  }
  function tick() {
    var e = D.el; if (!e || e.style.display === 'none') return;
    var M = PK.Machine;
    e.querySelector('.pd-balls').textContent = nf(M.owned());
    D.bar.style.setProperty('--p', M.U.power);
  }
  D.layout = function () {
    var sp = PK.DockSpace, on = !!(sp && PK.Manga && PK.Manga.barH && PK.Manga.barH() > 0);
    if (!D.el) { if (!on) return; build(); }
    var e = D.el; e.style.display = on ? '' : 'none'; if (!on) return;
    e.style.left = Math.round(sp.x) + 'px'; e.style.width = Math.round(sp.w) + 'px'; e.style.top = Math.round(sp.y) + 'px'; e.style.height = Math.round(sp.h) + 'px';
    e.style.setProperty('--h', (Math.round(sp.h) - 16) + 'px');   // 力度條的高度（面板高度扣掉上下留邊與框線）
    e.classList.toggle('dim', !!(PK.Duel && PK.Duel.active));
    tick();
  };
})(window.PK);

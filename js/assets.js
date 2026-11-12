/* =========================================================
 * 圖片資產載入（缺圖時各繪製函式會改用程式繪製的備用圖）
 * ========================================================= */
(function (PK) {
  'use strict';
  var A = { imgs: {}, loaded: 0, total: 0 };

  A.load = function (onProgress) {
    var keys = Object.keys(PK.IMAGES);
    A.total = keys.length;
    return Promise.all(keys.map(function (k) {
      return new Promise(function (res) {
        var im = new Image(), tries = 0;
        im.onload = function () { A.imgs[k] = im; A.loaded++; if (onProgress) onProgress(A.loaded / A.total); res(); };
        // 網路一時斷線（伺服器拒絕連線、行動網路不穩）時重試，不要讓演出整段少圖
        im.onerror = function () {
          if (++tries <= 3) { setTimeout(function () { im.src = PK.IMAGES[k] + (PK.IMAGES[k].indexOf('?') < 0 ? '?' : '&') + 'r=' + tries; }, 400 * tries); return; }
          A.loaded++; if (onProgress) onProgress(A.loaded / A.total); res();
        };
        im.src = PK.IMAGES[k];
      });
    }));
  };
  A.get = function (k) { return A.imgs[k] || null; };

  // 以 cover 方式畫滿指定區域
  A.cover = function (ctx, k, x, y, w, h, zoom, ox, oy) {
    var im = A.get(k);
    if (!im) return false;
    zoom = zoom || 1;
    var s = Math.max(w / im.width, h / im.height) * zoom;
    var dw = im.width * s, dh = im.height * s;
    ctx.drawImage(im, x + (w - dw) / 2 + (ox || 0), y + (h - dh) / 2 + (oy || 0), dw, dh);
    return true;
  };

  PK.Assets = A;
})(window.PK);

"""把 art_src/duel 的對決原圖處理成遊戲用 webp（assets/img/duel/）：人物、字卡去背（綠幕或洋紅幕）、縮小；並把每張人物在圖裡的範圍、出手位置、場景站位寫進 js/duel_art.js（遊戲直接載入）。原圖沒變的不會重做。

用法：/Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5/.venv/bin/python -I tools/process_duel.py [id ...]
"""
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art_src" / "duel_fb"
OUT = ROOT / "assets" / "img" / "duel"

# id: (輸出寬, 輸出高, 去背色：None 不去背／'g' 綠幕／'m' 洋紅幕, 去背後是否裁掉空白)
# 人物的兩個姿勢不裁（同一張畫布才對得上）；字卡、徽章、要丟的東西裁掉空白
JOBS = {
    "duel_bg_home": (1024, 1024, None, False), "duel_bg_train": (1024, 1024, None, False), "duel_bg_asia": (1024, 1024, None, False), "duel_bg_world": (1024, 1024, None, False),
    "duel_batter_ready": (800, 800, "g", False), "duel_batter_swing": (800, 800, "g", False),
    "duel_eyes_tianba": (1152, 768, None, False),
    "duel_ball": (256, 256, "g", True),
    "duel_t_hr": (1200, 800, "g", True), "duel_t_hit": (1000, 667, "g", True), "duel_t_out": (1000, 667, "g", True), "duel_emblem": (560, 560, "g", True),
}
# 足球版（2026-11-12）：五位門將，站姿與撲救兩張都是洋紅幕、同一張正方形畫布
for _c in ["shilei", "jp", "ir", "kr", "de"]:
    JOBS[f"duel_face_{_c}"] = (1152, 768, None, False)
    JOBS[f"duel_p_{_c}_set"] = (800, 800, "m", False)
    JOBS[f"duel_p_{_c}_throw"] = (800, 800, "m", False)


def key_out(im: Image.Image, colour: str) -> Image.Image:
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 「背景色程度」：綠幕＝G 比 R、B 都高很多；洋紅幕＝R、B 都高而 G 低
    chroma = np.clip(((g - np.maximum(r, b)) if colour == "g" else (np.minimum(r, b) - g)) / 255.0, 0, 1)
    near = chroma > (0.35 if colour == "g" else 0.5)
    # 只移除跟邊界相連的背景，以及人物內部封閉的純背景色區塊（手臂和身體之間的縫）
    lab, n = ndimage.label(near)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]])))
    border.discard(0)
    bg = np.isin(lab, list(border))
    if n:
        means = ndimage.mean(chroma, lab, index=np.arange(1, n + 1))
        sizes = ndimage.sum(np.ones_like(chroma), lab, index=np.arange(1, n + 1))
        bg |= np.isin(lab, [i + 1 for i in range(n) if means[i] > (0.6 if colour == "g" else 0.8) and sizes[i] > 20])
    # 邊緣過渡帶：背景外擴 3px 內依背景色程度給半透明
    grown = ndimage.binary_dilation(bg, iterations=3)
    alpha = np.ones_like(chroma)
    alpha[bg] = 0
    edge = grown & ~bg
    alpha[edge] = np.clip(1 - chroma[edge] * 2.2, 0, 1)
    # 去色邊：靠近背景的地方把背景色壓掉
    spill = ndimage.binary_dilation(bg, iterations=6) & ~bg
    r2, g2, b2 = r.copy(), g.copy(), b.copy()
    if colour == "g":
        g2[spill] = np.minimum(g[spill], np.maximum(r[spill], b[spill]))
    else:
        lim = g[spill] + 40
        r2[spill] = np.minimum(r[spill], np.maximum(lim, (r[spill] + g[spill]) / 2))
        b2[spill] = np.minimum(b[spill], np.maximum(lim, (b[spill] + g[spill]) / 2))
    out = np.dstack([r2, g2, b2, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


# 場景圖上對手站的位置（寬、高的比例）：看圖量的
BG_AT = {k: [0.5, 0.59] for k in ["duel_bg_home", "duel_bg_train", "duel_bg_asia", "duel_bg_world"]}   # 四張場景同一個構圖：球門線中央在 (50%, 59%)
ART_JS = ROOT / "js" / "duel_art.js"


def box_of(path):
    """去背圖裡人物的範圍 [x, y, 寬, 高]（比例）與 alpha 陣列"""
    al = np.asarray(Image.open(path).convert("RGBA"))[..., 3] > 24
    ys, xs = np.where(al)
    h, w = al.shape
    return [round(float(xs.min()) / w, 4), round(float(ys.min()) / h, 4), round(float(xs.max() - xs.min() + 1) / w, 4), round(float(ys.max() - ys.min() + 1) / h, 4)], al


def hand_of(al_throw, set_box):
    """出手那張圖裡「往鏡頭伸過來的手」的位置。
    伸向鏡頭的那隻手因為透視畫得比較大：看人物上半部，離身體中線夠遠的部分左右兩邊哪一邊面積大，就是那一邊；
    （只比誰伸得遠會選錯——另一隻手常常張得更開但比較小。）手的位置取那一邊最外側三成的重心。
    回傳相對「蓄力姿勢腳底中央」的位移，單位是蓄力姿勢的人物高度（往左、往上是負的）"""
    h, w = al_throw.shape
    ys, xs = np.where(al_throw)
    top, bot = ys.min(), ys.max()
    fh = set_box[3] * h
    upper = al_throw[top:top + int((bot - top) * 0.6)]
    uy, ux = np.where(upper)
    cx = float(np.median(xs))                          # 身體中線：出手那張圖自己的中位數
    far = np.abs(ux - cx) > fh * 0.16
    left_area, right_area = int(np.sum(far & (ux < cx))), int(np.sum(far & (ux > cx)))
    side = -1 if left_area >= right_area else 1
    sel = far & ((ux < cx) if side < 0 else (ux > cx))
    ext = np.max(np.abs(ux[sel] - cx))
    tip = sel & (np.abs(ux - cx) > ext * 0.7)
    hx = float(np.mean(ux[tip])); hy = float(np.mean(uy[tip])) + top
    ax, ay = (set_box[0] + set_box[2] / 2) * w, (set_box[1] + set_box[3]) * h
    return [round((hx - ax) / fh, 3), round((hy - ay) / fh, 3)]


def main():
    only = set(sys.argv[1:])
    OUT.mkdir(parents=True, exist_ok=True)
    for name, (w, h, key, crop) in JOBS.items():
        if only and name not in only:
            continue
        src = RAW / f"{name}.png"
        dst = OUT / f"{name}.webp"
        if not src.exists():
            continue
        if not only and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue                                   # 已經處理過、原圖沒變：跳過
        im = Image.open(src)
        if key:
            im = key_out(im, key)
            if crop:
                im = im.crop(im.getbbox())
                im.thumbnail((w, h), Image.LANCZOS)
            else:
                im = im.resize((w, h), Image.LANCZOS)
            im.save(dst, "WEBP", quality=88, method=5)
        else:
            im = im.convert("RGB").resize((w, h), Image.LANCZOS)
            im.save(dst, "WEBP", quality=82, method=5)
        print("ok", name, im.size, dst.stat().st_size // 1024, "KB")
    # 把所有已經處理好的素材資料寫進 js/duel_art.js（遊戲直接載入這個檔）
    meta, missing = {}, []
    for name, (w, h, key, crop) in JOBS.items():
        dst = OUT / f"{name}.webp"
        if not dst.exists():
            missing.append(name)
            continue
        if name in BG_AT:
            meta[name] = {"at": BG_AT[name]}
        elif key and not crop:
            meta[name] = {"box": box_of(dst)[0]}
    ART_JS.write_text("/* 由 tools/process_duel.py 自動產生，不要手改。\n * 點球對決素材的資料：box＝去背人物在圖裡的範圍 [x, y, 寬, 高]（比例）；at＝場景圖上對手站的位置；\n * hand＝出手那張圖裡手的位置（相對蓄力姿勢的腳底中央，單位是人物高度；往左、往上是負的） */\nwindow.PK.DUEL_ART = "
                      + json.dumps(meta, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print("已寫入", ART_JS.name, len(meta), "筆；還沒有的素材：", "、".join(missing) if missing else "無")


if __name__ == "__main__":
    main()

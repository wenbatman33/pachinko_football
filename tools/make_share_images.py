#!/usr/bin/env python3
"""分享圖（assets/share/）：用首頁主視覺（home_bg）＋標誌（logo）＋三行字拼出來。
  og-1200x630.jpg   連結預覽用（index.html 的 og:image／twitter:image；上線後要把完整網址填回 index.html）
  ig-1080x1350.jpg  直式 4:5，直接貼圖用
用法：python3 tools/make_share_images.py   （需要 PIL；字型用系統的冬青黑體簡體 Hiragino Sans GB）
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
IMG = ROOT / "assets" / "img"
OUT = ROOT / "assets" / "share"
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
TAG, SUB, LINE3 = "从防波堤，踢到世界杯", "足球弹珠机 × 五话原创漫画", "赢珠子就能解锁下一话・免费游玩"
INK = (18, 6, 10)


def font(size):
    return ImageFont.truetype(FONT, size, index=2)   # index 2＝W6（粗）


def cover(im, w, h, fy=0.5):
    k = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * k), round(im.height * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, round((im.height - h) * fy)
    return im.crop((x, y, x + w, y + h))


def outlined(d, xy, text, f, fill, edge=INK, ew=6, anchor="mm"):
    d.text(xy, text, font=f, fill=fill, stroke_width=ew, stroke_fill=edge, anchor=anchor)


def banner(base, cx, cy, text, size):
    f = font(size)
    tw = ImageDraw.Draw(base).textlength(text, font=f)
    bw, bh = int(tw + size * 1.3), int(size * 1.62)
    tile = Image.new("RGBA", (bw + 40, bh + 40), (0, 0, 0, 0))
    d = ImageDraw.Draw(tile)
    d.rectangle([26, 28, bw + 26, bh + 28], fill=(0, 0, 0, 140))
    d.rectangle([15, 15, bw + 25, bh + 25], fill=INK + (255,))
    d.rectangle([20, 20, bw + 20, bh + 20], fill=(255, 212, 0, 255))
    d.text((bw // 2 + 20, bh // 2 + 20), text, font=f, fill=INK, anchor="mm")
    tile = tile.rotate(2, expand=True, resample=Image.BICUBIC)
    base.alpha_composite(tile, (int(cx - tile.width / 2), int(cy - tile.height / 2)))


def make(w, h, name, portrait):
    bg = Image.open(IMG / "home_bg.webp").convert("RGB")
    logo = Image.open(IMG / "logo.webp").convert("RGBA")
    base = Image.new("RGBA", (w, h), (20, 4, 8, 255))
    if portrait:
        base.paste(cover(bg, w, h, 0.25), (0, 0))
    else:
        # 橫式：主視覺放右邊，左邊壓暗放標誌與字
        art = cover(bg, int(w * 0.62), h, 0.3)
        base.paste(art, (w - art.width, 0))
        shade = Image.new("L", (w, h), 0)
        sd = ImageDraw.Draw(shade)
        for x in range(w):
            sd.line([(x, 0), (x, h)], fill=int(255 * max(0, min(1, (w * 0.62 - x) / (w * 0.3)))))
        base.paste(Image.new("RGBA", (w, h), (30, 4, 8, 255)), (0, 0), shade)
    d = ImageDraw.Draw(base)
    if portrait:
        dark = Image.new("L", (w, h), 0)
        dd = ImageDraw.Draw(dark)
        for y in range(h):
            dd.line([(0, y), (w, y)], fill=int(200 * max(0, min(1, (y - h * 0.62) / (h * 0.25)))))
        base.paste(Image.new("RGBA", (w, h), (20, 2, 6, 255)), (0, 0), dark)
        lw = int(w * 0.86); lg = logo.resize((lw, round(lw * logo.height / logo.width)), Image.LANCZOS)
        base.alpha_composite(lg, ((w - lw) // 2, int(h * 0.03)))
        cx, y0, k = w // 2, int(h * 0.78), 1.25
    else:
        lw = int(w * 0.5); lg = logo.resize((lw, round(lw * logo.height / logo.width)), Image.LANCZOS)
        base.alpha_composite(lg, (int(w * 0.03), int(h * 0.08)))
        cx, y0, k = int(w * 0.28), int(h * 0.6), 1.0
    banner(base, cx, y0, TAG, int(46 * k))
    d = ImageDraw.Draw(base)
    outlined(d, (cx, y0 + int(84 * k)), SUB, font(int(38 * k)), (255, 255, 255))
    outlined(d, (cx, y0 + int(146 * k)), LINE3, font(int(30 * k)), (255, 224, 102))
    OUT.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(OUT / name, "JPEG", quality=88, optimize=True, progressive=True)
    print("ok", name)


if __name__ == "__main__":
    make(1200, 630, "og-1200x630.jpg", False)
    make(1080, 1350, "ig-1080x1350.jpg", True)

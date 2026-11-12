"""把 art_src/pwa/pwa_icon.png 做成 PWA 要用的各種圖示（assets/pwa/）。

用法：python3 tools/make_pwa_icons.py
  icon-192.png／icon-512.png      一般圖示（整張正方形）
  icon-maskable-512.png          Android 會裁成圓形／圓角的版本：主體縮到中央八成以內，外圍補上同色的放射線
  apple-touch-icon.png           iPhone「加入主畫面」用（180，系統會自己切圓角，不可以有透明）
  favicon-32.png                 瀏覽器分頁的小圖示（只取臉，縮小才認得出來）
"""
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "art_src" / "football" / "pwa_icon.png"   # 足球版（棒球版的在 art_src/pwa/）
OUT = ROOT / "assets" / "pwa"


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    art = Image.open(SRC).convert("RGB")
    S = art.width
    for name, size in [("icon-512.png", 512), ("icon-192.png", 192), ("apple-touch-icon.png", 180)]:
        art.resize((size, size), Image.LANCZOS).save(OUT / name, optimize=True)
    # 分頁小圖示：只取臉和頭盔
    art.crop((int(S * 0.1), int(S * 0.08), int(S * 0.86), int(S * 0.84))).resize((32, 32), Image.LANCZOS).save(OUT / "favicon-32.png", optimize=True)
    # 會被裁切的版本：先畫一張紅黃放射線當底，再把原圖縮到 86% 貼在中央，邊緣羽化接上去
    M = 1024
    bg = Image.new("RGB", (M, M), (224, 16, 28))
    d = ImageDraw.Draw(bg)
    n = 28
    for i in range(n):
        a0, a1 = (i + 0.08) / n * 2 * math.pi, (i + 0.55) / n * 2 * math.pi
        d.polygon([(M / 2, M / 2), (M / 2 + math.cos(a0) * M, M / 2 + math.sin(a0) * M), (M / 2 + math.cos(a1) * M, M / 2 + math.sin(a1) * M)], fill=(255, 205, 30))
    bg = bg.filter(ImageFilter.GaussianBlur(1.2))
    k = 0.86
    small = art.resize((int(M * k), int(M * k)), Image.LANCZOS)
    mask = Image.new("L", small.size, 0)
    md = ImageDraw.Draw(mask)
    r0 = small.width * 0.5
    md.ellipse((small.width / 2 - r0, small.height / 2 - r0, small.width / 2 + r0, small.height / 2 + r0), fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(small.width * 0.035))
    # 羽化只往內縮（外圈不可以露出原圖的方角）
    inner = Image.new("L", small.size, 0)
    ImageDraw.Draw(inner).ellipse((small.width * 0.03, small.height * 0.03, small.width * 0.97, small.height * 0.97), fill=255)
    mask = Image.composite(mask, Image.new("L", small.size, 0), inner.filter(ImageFilter.GaussianBlur(small.width * 0.02)))
    bg.paste(small, ((M - small.width) // 2, (M - small.height) // 2), mask)
    bg.resize((512, 512), Image.LANCZOS).save(OUT / "icon-maskable-512.png", optimize=True)
    for p in sorted(OUT.glob("*.png")):
        im = Image.open(p)
        print(p.name, im.size, im.mode, p.stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()

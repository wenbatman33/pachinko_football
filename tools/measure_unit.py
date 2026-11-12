"""量測中央機關圖（assets/img/center_unit.webp，去背後不裁切）：
   - 液晶窗口：畫面中心往外找透明區的邊界（u0,v0,u1,v1，比例）
   - 外形上緣：每一欄最上面不透明的點，取上凸包（讓珠子順著滑下去，不會卡在凹處）
   - 左右外緣：窗口高度範圍內，零件最左／最右的不透明位置
用法：.venv/bin/python -I tools/measure_unit.py  → 印出 JSON，貼進 config.js 的 LAYOUT.centerUnit
"""
import json
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
im = Image.open(ROOT / "assets" / "img" / "center_unit.webp").convert("RGBA")
a = np.asarray(im)[:, :, 3] > 100
H, W = a.shape
cy, cx = H // 2, W // 2
# 窗口：從中心往四個方向走到第一個不透明
def walk(dx, dy):
    x, y = cx, int(H * 0.45)
    while 0 < x < W - 1 and 0 < y < H - 1 and not a[y, x]:
        x += dx; y += dy
    return x, y
l = walk(-1, 0)[0]; r = walk(1, 0)[0]; t = walk(0, -1)[1]; b = walk(0, 1)[1]
win = [round((l + 1) / W, 4), round((t + 1) / H, 4), round(r / W, 4), round(b / H, 4)]
# 上緣輪廓
pts = []
for i in range(0, 65):
    x = int(i * (W - 1) / 64)
    col = np.nonzero(a[: int(H * 0.8), x])[0]
    if len(col): pts.append((x / W, col.min() / H))
pts.sort()
hull = []
for p in pts:
    while len(hull) >= 2:
        (x1, y1), (x2, y2) = hull[-2], hull[-1]
        if (x2 - x1) * (p[1] - y1) - (y2 - y1) * (p[0] - x1) <= 0: hull.pop()
        else: break
    hull.append(p)
# 左右外緣（窗口上下範圍內）
rows = a[t:b, :]
colsAny = np.nonzero(rows.any(axis=0))[0]
side = [round(colsAny.min() / W, 4), round((colsAny.max() + 1) / W, 4)]
bottom = round(np.nonzero(a.any(axis=1))[0].max() / H, 4)
print(json.dumps({"win": win, "hull": [[round(x, 4), round(y, 4)] for x, y in hull], "side": side, "bottom": bottom}))

#!/usr/bin/env python3
"""把 tools/sim_board.js --json 寫出來的盤面（釘子、牆、軌跡）畫成圖，改釘子配置時用來看球路。

用法：
  node tools/sim_board.js --json /tmp/board.json --trace 60
  python3 tools/draw_board.py /tmp/board.json /tmp/board.png            全部力道疊在一張（每個力道一個顏色）
  python3 tools/draw_board.py /tmp/board.json /tmp/board.png 0.62       只畫某一個力道
  python3 tools/draw_board.py /tmp/board.json /tmp/board.png none       只畫釘子與牆（不畫軌跡）
"""
import json
import math
import sys
from PIL import Image, ImageDraw

S = 2  # 放大倍率
KIND = {
    'ten': (255, 90, 90), 'top': (255, 200, 80), 'bara': (120, 220, 255), 'warp': (190, 140, 255), 'hakama': (255, 150, 60),
    'road': (120, 255, 150), 'yori': (255, 255, 140), 'lower': (170, 170, 190), 'right': (255, 160, 220), 'life': (255, 60, 60),
    'n': (255, 255, 255),
}
TRACK = [(255, 80, 80), (255, 170, 60), (240, 230, 70), (120, 230, 90), (70, 220, 200), (80, 160, 255), (160, 120, 255), (240, 110, 230), (255, 255, 255), (150, 150, 150)]


def main():
    src, dst = sys.argv[1], sys.argv[2]
    only = sys.argv[3] if len(sys.argv) > 3 else None
    d = json.load(open(src))
    w, h = d['board']['w'] * S, d['board']['h'] * S
    im = Image.new('RGB', (w, h), (14, 16, 26))
    dr = ImageDraw.Draw(im, 'RGBA')
    f = d['field']
    hh = max(0, f.get('ry', f['r']) - f['r'])
    # 外軌（藥丸形）
    dr.rounded_rectangle([(f['cx'] - f['r']) * S, (f['cy'] - hh - f['r']) * S, (f['cx'] + f['r']) * S, (f['cy'] + hh + f['r']) * S], radius=f['r'] * S, outline=(90, 100, 130), width=3)
    lcd = d['lcd']
    dr.rectangle([lcd['x'] * S, lcd['y'] * S, (lcd['x'] + lcd['w']) * S, (lcd['y'] + lcd['h']) * S], fill=(26, 30, 48), outline=(60, 70, 100))
    # 軌跡
    keys = sorted(d['tracks'].keys())
    if only != 'none':
        for i, k in enumerate(keys):
            if only and k != only and abs(float(k) - float(only)) > 1e-6:
                continue
            col = TRACK[i % len(TRACK)]
            for t in d['tracks'][k]:
                p = t['p']
                pts = [(p[j] * S, p[j + 1] * S) for j in range(0, len(p), 2)]
                if len(pts) > 1:
                    dr.line(pts, fill=col + (70 if not only else 90,), width=2)
    # 牆
    for s in d['segs']:
        c = {'rail': (200, 200, 220), 'stage': (255, 210, 90), 'cup': (255, 110, 110), 'valve': (120, 255, 200)}.get(s[4], (150, 160, 190))
        dr.line([s[0] * S, s[1] * S, s[2] * S, s[3] * S], fill=c, width=3)
    wm = d['windmill']
    dr.ellipse([(wm['x'] - wm['r']) * S, (wm['y'] - wm['r']) * S, (wm['x'] + wm['r']) * S, (wm['y'] + wm['r']) * S], outline=(255, 120, 40), width=3)
    wp = d['warp']
    dr.ellipse([(wp['x'] - wp['r']) * S, (wp['y'] - wp['r']) * S, (wp['x'] + wp['r']) * S, (wp['y'] + wp['r']) * S], outline=(190, 140, 255), width=3)
    # 釘子（畫成碰撞半徑 2.4 的實際大小，旁邊的淡圈＝一顆珠子貼上去時球心的位置）
    for n in d['nails']:
        c = KIND.get(n[2], (255, 255, 255))
        r = 2.4 * S
        dr.ellipse([n[0] * S - r, n[1] * S - r, n[0] * S + r, n[1] * S + r], fill=c)
    # 每 100 一條格線＋座標
    for x in range(0, d['board']['w'] + 1, 100):
        dr.line([x * S, 0, x * S, h], fill=(255, 255, 255, 22))
        dr.text((x * S + 3, 3), str(x), fill=(200, 200, 200))
    for y in range(0, d['board']['h'] + 1, 100):
        dr.line([0, y * S, w, y * S], fill=(255, 255, 255, 22))
        dr.text((3, y * S + 3), str(y), fill=(200, 200, 200))
    # 圖例
    if only != 'none':
        y0 = h - 22 * len(keys) - 10
        for i, k in enumerate(keys):
            if only and abs(float(k) - float(only)) > 1e-6:
                continue
            dr.rectangle([w - 150, y0 + i * 22, w - 130, y0 + i * 22 + 14], fill=TRACK[i % len(TRACK)])
            dr.text((w - 122, y0 + i * 22), '力道 ' + k, fill=(230, 230, 230))
    im.save(dst)
    print('已寫出', dst, im.size, '釘子', len(d['nails']), '根')


if __name__ == '__main__':
    main()

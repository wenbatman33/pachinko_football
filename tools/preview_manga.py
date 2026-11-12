#!/usr/bin/env python3
# 審稿用的預覽頁：不用進遊戲、直接用瀏覽器打開就能看一整話，版型跟正式閱讀頁完全一樣（共用 manga/reader.js、reader.css：
# 左右對話框、角色名牌顏色、旁白框、狀聲詞疊在畫面上）。
# 用法：python3 tools/preview_manga.py ch01 [ch02 ...] → manga/preview/chNN.html（縮小的圖放在 manga/preview/chNN/）
# 這是製作時審稿用的，不進版、不上線（上線的閱讀頁由 tools/build_manga.py 產生，只能在遊戲裡開）。
import json, os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
HTML = '''<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>PK大逆转</title>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../reader.css">
</head>
<body>
<script>window.MANGA_PREVIEW = true; window.CHAPTER = %s;</script>
<script src="../reader.js"></script>
</body>
</html>
'''
def build(cid):
    d = json.load(open(os.path.join(ROOT, 'manga', 'data', cid + '.json'), encoding='utf-8'))
    out = os.path.join(ROOT, 'manga', 'preview'); img_dir = os.path.join(out, cid); os.makedirs(img_dir, exist_ok=True)
    ch = {k: d[k] for k in ('id', 'no', 'title', 'free', 'next') if k in d}; ch['items'] = []; ch['hasNext'] = False
    miss = 0
    for it in d['items']:
        raw = os.path.join(ROOT, d['out'], it['id'] + '.png'); jpg = os.path.join(img_dir, it['id'] + '.jpg')
        if os.path.exists(raw) and (not os.path.exists(jpg) or os.path.getmtime(jpg) < os.path.getmtime(raw)):
            im = Image.open(raw).convert('RGB'); im.thumbnail((1280, 1280)); im.save(jpg, quality=84)
        if not os.path.exists(jpg): miss += 1; continue
        p = {k: it[k] for k in ('id', 'size', 'lines', 'sfx') if k in it}; p['img'] = '%s/%s.jpg' % (cid, it['id']); ch['items'].append(p)
    p = os.path.join(out, cid + '.html')
    open(p, 'w', encoding='utf-8').write(HTML % json.dumps(ch, ensure_ascii=False).replace('</', '<\\/'))
    print(p, '（%d 格%s）' % (len(ch['items']), '，還缺 %d 格' % miss if miss else ''))
for c in sys.argv[1:] or ['ch01']: build(c)

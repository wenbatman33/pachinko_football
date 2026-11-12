#!/usr/bin/env python3
# 審稿用的單頁預覽：把一話的每一格（縮小的圖＋格號＋對白旁白）排成一頁，直接用瀏覽器打開就能看，不用進遊戲。
# 用法：python3 tools/preview_manga.py ch01 [ch02 ...] → manga/preview/chNN.html（圖放在 manga/preview/chNN/）
# 這是給製作時審稿用的，不是上線的閱讀頁（上線的閱讀頁由 tools/build_manga.py 產生，只能在遊戲裡開）。
import html, json, os, sys
from PIL import Image
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KIND = {'nar': '旁白', 'say': '', 'shout': '（大喊）', 'think': '（内心）'}
def build(cid):
    d = json.load(open(os.path.join(ROOT, 'manga', 'data', cid + '.json'), encoding='utf-8'))
    out = os.path.join(ROOT, 'manga', 'preview'); img_dir = os.path.join(out, cid); os.makedirs(img_dir, exist_ok=True)
    rows = []
    for it in d['items']:
        raw = os.path.join(ROOT, d['out'], it['id'] + '.png'); jpg = os.path.join(img_dir, it['id'] + '.jpg')
        if os.path.exists(raw) and (not os.path.exists(jpg) or os.path.getmtime(jpg) < os.path.getmtime(raw)):
            im = Image.open(raw).convert('RGB'); im.thumbnail((1100, 1100)); im.save(jpg, quality=82)
        def line(l):
            who = (l.get('who', '') + KIND[l['type']] + '：') if l['type'] != 'nar' else ''
            return '<div class="l %s">%s%s</div>' % (l['type'], html.escape(who), html.escape(l['text']))
        before = ''.join(line(l) for l in it['lines'] if l.get('at') == 'before')
        after = ''.join(line(l) for l in it['lines'] if l.get('at', 'after') != 'before')
        sfx = ''.join('<span class="s">%s</span>' % html.escape(s['text']) for s in it.get('sfx', []))
        pic = '<img loading="lazy" src="%s/%s.jpg">' % (cid, it['id']) if os.path.exists(jpg) else '<div class="miss">（這一格還沒有圖）</div>'
        rows.append('<section>%s%s%s</section>' % (before, pic, after))   # 使用者 2026-11-12：格號與狀聲詞標記都拿掉，只留畫面與對白
    page = '''<!doctype html><html lang="zh-Hans"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>審稿預覽｜第%d話 %s</title><style>
body{margin:0;background:#15131a;color:#eee;font:17px/1.6 "PingFang SC","Noto Sans SC",sans-serif}
main{max-width:900px;margin:0 auto;padding:16px}h1{font-size:26px}section{margin:22px 0}
img{width:100%%;display:block;border:3px solid #000;border-radius:4px}.l{padding:4px 10px;margin:4px 0;border-radius:6px;background:#26222e}
.nar{background:#3a2f18;color:#ffe9b0}.shout{font-weight:900;color:#ff7a6a}.think{color:#b9c6ff;font-style:italic}
.s{margin-left:10px;color:#ff5a4d;font-weight:900}.miss{padding:40px;text-align:center;background:#333}
</style><main><h1>第%d話〈%s〉</h1>%s</main></html>''' % (d['no'], d['title'], d['no'], html.escape(d['title']), ''.join(rows))
    p = os.path.join(out, cid + '.html'); open(p, 'w', encoding='utf-8').write(page); print(p)
for c in sys.argv[1:] or ['ch01']: build(c)

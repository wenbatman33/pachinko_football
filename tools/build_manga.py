#!/usr/bin/env python3
# 《PK大逆转》每話建置：原圖 PNG → 網頁用 webp，並產生每話一個 HTML（資料直接寫進頁面）
# 用法（需要 PIL）：python tools/build_manga.py [ch01 ch02 ...]（不給就建全部）
#
# 網址猜不到（2026-11-11 使用者：「集數的規則太容易被猜出來了」——原本是 manga/ch05.html、manga/img/ch05/…，
# 沒解鎖的人把數字改一下就能直接看）：
# - 每一話的頁面與圖片資料夾用一串亂碼命名：manga/r/<亂碼>.html、manga/img/<亂碼>/pNN.webp
#   亂碼＝sha256(本機的密鑰 + 話數)，密鑰在 tools/.manga_salt（不進版；弄丟的話重建會換一組新網址，不影響功能）
# - 遊戲讀的目錄 manga/catalog.json 裡，每一話的頁面網址與預告圖都編過碼（欄位 x），解鎖了遊戲才會解開（js/manga.js）
# - 封面另外縮一份小圖放在 manga/cover/NN.webp（漫畫櫃要顯示沒解鎖的封面，不能從封面路徑看出那一話的資料夾）
# - 頁面只能在遊戲的閱讀器裡開，直接開網址會被帶回遊戲（manga/reader.js）
# 這只擋得住「猜網址」和隨手翻；程式都在使用者的瀏覽器裡，真的要鎖（例如收費）得靠伺服器驗證
import base64, hashlib, json, os, secrets, sys, glob
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANGA = os.path.join(ROOT, 'manga')
KEEP = ('id', 'no', 'title', 'free', 'next')          # 頁面需要的章節欄位
PANEL_KEEP = ('id', 'size', 'lines', 'sfx')           # 頁面需要的分格欄位（提示詞、參考圖不放進網頁）

HTML = '''<!doctype html>
<html lang="zh-Hans">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#0b0710">
<title>PK大逆转</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400;500;700;900&family=Dela+Gothic+One&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../reader.css">
</head>
<body>
<script>window.CHAPTER = %s;</script>
<script src="../reader.js"></script>
</body>
</html>
'''

SALT_FILE = os.path.join(ROOT, 'tools', '.manga_salt')
OBF_KEY = 'pk-manga-v1'   # 目錄編碼用的字串，js/manga.js 裡要一樣（這不是密碼，只是讓目錄不能一眼看懂）


def salt():
    if not os.path.exists(SALT_FILE):
        open(SALT_FILE, 'w').write(secrets.token_hex(24) + '\n')
        print('产生新的密钥：%s（不进版）' % SALT_FILE)
    return open(SALT_FILE).read().strip()


def token(cid):
    """这一话的乱码名称（页面档名与图片资料夹共用）"""
    return hashlib.sha256((salt() + ':' + cid).encode()).hexdigest()[:22]


def obf(no, obj):
    """目录里每话的私密栏位编码：JSON → 跟一串假乱数做 XOR → base64。js/manga.js 的 unveil() 用同一套解开"""
    key = ('%s:%d' % (OBF_KEY, no)).encode()
    h = 2166136261
    for b in key: h = ((h ^ b) * 16777619) & 0xFFFFFFFF
    x = h or 1
    out = bytearray()
    for b in json.dumps(obj, ensure_ascii=False, separators=(',', ':')).encode('utf-8'):
        x ^= (x << 13) & 0xFFFFFFFF; x ^= x >> 17; x ^= (x << 5) & 0xFFFFFFFF
        out.append(b ^ (x & 0xFF))
    return base64.b64encode(bytes(out)).decode()


def build(cid):
    src = os.path.join(MANGA, 'data', cid + '.json')
    d = json.load(open(src, encoding='utf-8'))
    raw_dir = os.path.join(ROOT, d['out'])
    tk = token(cid)
    img_dir = os.path.join(MANGA, 'img', tk)
    os.makedirs(img_dir, exist_ok=True)
    os.makedirs(os.path.join(MANGA, 'r'), exist_ok=True)
    out = {k: d[k] for k in KEEP if k in d}
    out['items'] = []
    missing = []
    for it in d['items']:
        raw = os.path.join(raw_dir, it['id'] + '.png')
        web = os.path.join(img_dir, it['id'] + '.webp')
        if not os.path.exists(raw) and not os.path.exists(web):   # 原圖不在（清掉了）但網頁圖還在：照用
            missing.append(it['id']); continue
        if os.path.exists(raw) and (not os.path.exists(web) or os.path.getmtime(web) < os.path.getmtime(raw)):
            Image.open(raw).convert('RGB').save(web, 'WEBP', quality=88, method=6)
        p = {k: it[k] for k in PANEL_KEEP if k in it}
        p['img'] = '../img/%s/%s.webp' % (tk, it['id'])
        out['items'].append(p)
    nid = 'ch%02d' % (d.get('no', 0) + 1)
    nimg = glob.glob(os.path.join(MANGA, 'img', token(nid), '*.webp'))
    try: ncnt = len(json.load(open(os.path.join(MANGA, 'data', nid + '.json'), encoding='utf-8'))['items'])
    except Exception: ncnt = 0
    out['hasNext'] = bool(ncnt and len(nimg) >= ncnt)   # 下一話全部轉好才顯示「繼續閱讀」；網址不寫進頁面，給不給看由遊戲決定
    # 封面小圖（漫畫櫃與話數清單用；沒解鎖的也會顯示，所以不放在那一話的資料夾裡）
    cov_src = os.path.join(img_dir, 'p00.webp')
    cov = os.path.join(MANGA, 'cover', '%02d.webp' % d.get('no', 0))
    os.makedirs(os.path.dirname(cov), exist_ok=True)
    if os.path.exists(cov_src) and (not os.path.exists(cov) or os.path.getmtime(cov) < os.path.getmtime(cov_src)):
        im = Image.open(cov_src).convert('RGB'); im.thumbnail((480, 720), Image.LANCZOS); im.save(cov, 'WEBP', quality=82, method=6)
    page = os.path.join(MANGA, 'r', tk + '.html')
    data = json.dumps(out, ensure_ascii=False).replace('</', '<\\/')
    open(page, 'w', encoding='utf-8').write(HTML % data)
    print('%s：%d 格写进 %s%s' % (cid, len(out['items']), page, ('，缺图 ' + ' '.join(missing)) if missing else ''))


def pick_preview(items, n=8):
    """液晶预告用的精华格：前 85% 的格子里，挑有大喊或状声词的、平均分散的 n 格（不剧透结局）"""
    body = [it for it in items if it['id'] != 'p00']
    pool = body[:max(n, int(len(body) * 0.85))]
    hot = [it for it in pool if it.get('sfx') or any(l.get('type') == 'shout' for l in it.get('lines', []))]
    if len(hot) < n: hot = pool
    step = len(hot) / float(n)
    picks = [hot[int(i * step)] for i in range(n)]
    out = []
    for it in picks:
        if it.get('size', '1536x1024') != '1536x1024':
            continue   # 直式格放在 4:3 液晶上會被裁太多，跳過
        text = ''
        for l in it.get('lines', []):
            if l.get('type') in ('shout', 'say') and l.get('who'):
                text = '%s：%s' % (l['who'], l['text']); break
        if not text:
            for l in it.get('lines', []):
                if l.get('type') == 'nar': text = l['text']; break
        if len(text) > 26: text = text[:25] + '…'
        out.append({'img': 'img/%s/%s.webp' % (token(it['_cid']), it['id']), 'text': text})
    return out


def catalog():
    """游戏读的漫画目录（manga/catalog.json）：每话标题、封面、格数、液晶预告精华格"""
    chs = []
    for n in range(1, 11):
        cid = 'ch%02d' % n
        try: d = json.load(open(os.path.join(MANGA, 'data', cid + '.json'), encoding='utf-8'))
        except Exception: continue
        webps = len(glob.glob(os.path.join(MANGA, 'img', token(cid), '*.webp')))
        if webps < len(d['items']): continue   # 還沒全部轉好的話不放進目錄
        for it in d['items']: it['_cid'] = cid
        # 公開的只有話數、標題、格數、封面小圖；頁面網址與預告圖編過碼放在 x
        chs.append({'no': n, 'title': d['title'], 'panels': len(d['items']), 'free': bool(d.get('free')), 'cover': 'cover/%02d.webp' % n,
                    'x': obf(n, {'page': 'r/%s.html' % token(cid), 'preview': pick_preview(d['items'])})})
    json.dump({'v': 2, 'chapters': chs}, open(os.path.join(MANGA, 'catalog.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print('游戏用目录：%s（%d 话）' % (os.path.join(MANGA, 'catalog.json'), len(chs)))


if __name__ == '__main__':
    ids = sys.argv[1:] or sorted(os.path.splitext(os.path.basename(f))[0] for f in glob.glob(os.path.join(MANGA, 'data', 'ch*.json')))
    for cid in ids:
        build(cid)
    # 第二輪：第一輪時後面幾話的圖可能還沒轉好，「下一話」連結會漏接；圖已快取，這輪只重寫頁面
    for cid in ids:
        build(cid)
    catalog()   # 公開的章節目錄頁（chapters.html）不再產生：誰都能從那裡直接點進每一話

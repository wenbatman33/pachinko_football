#!/usr/bin/env python3
# 把 JS／HTML／CSS 檔裡「字串常值」中的繁體字轉成簡體（註解不動：註解是給開發者看的）。
# 用法：python3 tools/to_simplified.py 檔案1 檔案2 ...    （需要 opencc：pip install opencc-python-reimplemented）
import re, sys, opencc
cv = opencc.OpenCC('t2s')
CJK = re.compile(r'[一-鿿]')
# 轉完之後再換成中國大陸的說法
TERMS = [('著', '着'), ('连庄', '连胜'), ('手把', '旋钮'), ('荧幕', '屏幕'), ('萤幕', '屏幕'), ('画面', '画面'), ('档案', '文件'), ('阅读器', '阅读器'), ('重新整理', '刷新'), ('载入', '加载'), ('点击', '点击'), ('储存', '保存'), ('资讯', '信息'), ('网址', '网址'), ('解锁', '解锁')]
def conv(s):
    if not CJK.search(s): return s
    t = cv.convert(s)
    for a, b in TERMS: t = t.replace(a, b)
    return t
LIT = re.compile(r"/\*.*?\*/|//[^\n]*|'(?:[^'\\\n]|\\.)*'|\"(?:[^\"\\\n]|\\.)*\"|`(?:[^`\\]|\\.)*`", re.S)
def js(src):
    def rep(m):
        s = m.group(0)
        if s.startswith('/*'): return s
        if s.startswith('//'):
            # 「http://」這種不是註解；真的註解不動
            return s
        return conv(s)
    return LIT.sub(rep, src)
def html(src):
    # 標籤外的文字與屬性值都轉；<script>、<style> 區塊照 JS 規則；<!-- --> 註解不動
    out, i = [], 0
    for m in re.finditer(r'<!--.*?-->|<script\b[^>]*>.*?</script>|<style\b[^>]*>.*?</style>', src, re.S):
        out.append(conv(src[i:m.start()])); blk = m.group(0)
        out.append(blk if blk.startswith('<!--') else js(blk)); i = m.end()
    out.append(conv(src[i:])); return ''.join(out)
for f in sys.argv[1:]:
    src = open(f, encoding='utf-8').read()
    new = html(src) if f.endswith(('.html', '.webmanifest', '.json')) else js(src)
    if new != src: open(f, 'w', encoding='utf-8').write(new)
    print('%s：%s' % (f, '已轉換' if new != src else '沒有變動'))

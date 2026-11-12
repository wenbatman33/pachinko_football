#!/usr/bin/env python3
# 《PK大逆转》分鏡腳本共用詞庫：把每話的精簡腳本（tools/manga_src/chNN.py）展開成 manga/data/chNN.json
#
# 為什麼要這一層：300 格的提示詞裡，每個角色的外型、每套球衣、每種時間光線都要一字不差地重複，
# 手寫很容易前後不一致（上一版棒球漫畫就吃過這個虧）。這裡把它們寫成固定詞庫，腳本裡只寫代號。
#
# 腳本寫法（見 tools/manga_src/ch01.py）：
#   P('p01', 'N_STAD', '畫面描述……@ly:cn 站在任意球前……@hz:cn 在後方……',
#     L=[('nar<', '旁白'), ('say', '陆远', 'l', '对白'), ('shout', '韩铮', 'r', '大喊'), ('think', '陆远', 'c', '内心话')],
#     S=[('砰——！', 0.8, 0.12, 1.2, -8)], size='1536x1024', ref=[...可省略...])
# - @角色代號:服裝代號 → 換成「名字（外型）」，並在提示詞最後補上「某某這時穿的是……」；同時自動帶入角色設計圖當參考（最多 3 張，照出現順序）
# - 服裝代號可省略（@gu、@lw 這種只有一套衣服的角色）
# - 對白類型後面加 < 表示畫在這一格上方（before），不加就是下方（after）
# - 提示詞用繁體或簡體都可以（給生圖模型看的）；L 與 S 裡的字是讀者看到的，一律簡體中文
import json, os, re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

STYLE = ("日本柏青哥液晶演出風格的高品質原創動畫插畫（跟柏青哥機台同系列）：寫實比例的青年運動漫畫畫風（人物是寫實的八頭身比例），"
         "鮮豔高彩度、強烈戲劇性光影、乾淨的賽璐璐上色加上光暈與粒子特效，嚴肅、專業、熱血的足球漫畫分鏡。"
         "人物表情真摯有力、動作有張力與速度感，肌肉與汗水的質感寫實。"
         "絕對不使用搞笑表現：不可Q版變形、不可豆豆眼、不可誇張的汗滴或青筋符號、不可搞笑臉。")

RULES = ("畫面中絕對不可出現任何文字、中文字、字母、招牌字、對話框、記分板數字、贊助商標誌、Logo、浮水印；唯一的例外是球衣上的背號數字。"
         "不可出現任何真實存在的球隊隊徽、品牌或名人；所有角色都是原創角色。"
         "球衣是有設計感的職業比賽服（暗紋、拼接、滾邊、火焰或線條圖案、背號、原創的隊徽圖案），但不可以有任何文字、贊助商字樣或真實品牌的標誌（勾勾、三條線等）；球鞋與手套沒有品牌標誌。"
         "同一隊所有球員的球衣款式完全相同，只有背號不同。中國隊的隊徽是原創的金色龍頭盾形徽章（沒有文字）。"
         "足球是經典的黑白拼塊足球，沒有任何品牌標誌。"
         "看台觀眾揮舞的旗幟與圍巾只能是單一純色、上面沒有任何圖案、徽章或文字。"
         "記分板、廣告看板、報紙、手機與平板螢幕上都沒有任何文字或數字（看板只有純色色塊，螢幕只有曲線與色塊）。"
         "足球常識：每隊場上 11 人；只有門將可以用手碰球，門將穿跟隊友不同顏色的球衣並戴手套；其他球員絕對不可用手碰球或抱球。"
         "球門是白色門柱、白色橫梁加白色球網；草皮上有白色邊線、禁區線與中圈。"
         "主裁判穿全素面的黃色短袖上衣、黑色短褲、黑色長襪。"
         "任意球時防守方排成人牆，人牆離球約九公尺；點球時球放在點球點上，禁區裡只有主罰球員和守門的門將。"
         "同一場比賽的兩隊球衣顏色必須明顯不同、不可混淆；同一隊的場上球員球衣完全相同。"
         "每個人只有兩條手臂兩條腿、每隻手五根手指，肢體結構正確：手臂與腿的長度是正常人體比例（手臂伸直時指尖大約到大腿中段），絕對不可以把手臂或腿畫得過長；"
         "兩個人身體貼近或對抗時，每個人的四肢要分得清楚：不可以多畫出第三條腿或第三隻手，也不可以把兩個人的腿畫成連在一起。"
         "手、手臂和身體不可以穿過門柱、橫梁、球網或別人的身體；門將撲球時手在橫梁的下方或前方，不會搭在橫梁上面。"
         "場景在中國時：建築、街道、路人服裝都是當代中國的樣子，不可出現日本或歐美的街景元素。")

C = 'manga/raw/chars/'
# 代號: (名字, 外型, 預設參考圖, 只有一套衣服時的服裝)
CHARS = {
    'ly':  ('陸遠', '22 歲的中國足球員，黑色短髮略帶凌亂、瀏海不過眉，左眉上有一道明顯的斜向舊疤，身形偏瘦但肌肉結實精幹，深褐色的眼睛、眼神沉靜堅定，左手腕纏著白色運動貼布，背號 10 號', C + 'char_luyuan.png', None),
    # lyc＝當上隊長之後的陸遠（第三話結尾韓錚把袖標交給他，第四話起才戴）；ly＝還沒當隊長，手臂上沒有袖標
    'lyc':  ('陸遠', '22 歲的中國足球員，黑色短髮略帶凌亂、瀏海不過眉，左眉上有一道明顯的斜向舊疤，身形偏瘦但肌肉結實精幹，深褐色的眼睛、眼神沉靜堅定，左手腕纏著白色運動貼布，背號 10 號，左上臂戴著黃色隊長袖標', C + 'char_luyuan_captain.png', None),
    'ly14': ('14 歲的少年陸遠', '瘦小的中國少年，黑色短髮，左眉上有一道剛結痂的小傷口，眼神倔強', C + 'char_father.png', '褪色的舊運動衫、短褲和磨破的舊球鞋'),
    'dad': ('陸建國', '五十多歲的中國漁港碼頭工人、陸遠的父親，皮膚被海風曬得黝黑，花白短髮，皺紋深、表情嚴肅寡言，身材寬厚，走路時右腿微跛', C + 'char_father.png', '深藍色舊工裝外套、灰色長褲、黑色勞保鞋'),
    'gu':  ('顧長河', '55 歲的中國國家隊主教練，灰白色短髮向後梳，眼角皺紋深，眼神銳利，身形挺拔', C + 'char_gu.png', '深藍黑色運動教練外套（紅色與金色的肩線、左胸金色龍頭隊徽）、黑色長褲、黑色運動鞋，脖子上掛著哨子'),
    'hz':  ('韓錚', '32 歲的中國國家隊隊長、中後衛，身高約 188 公分，肩膀寬厚、高大強壯，寸頭，下巴有短鬍渣，左上臂戴黃色隊長袖標，右膝戴黑色護膝，背號 4 號', C + 'char_hanzheng.png', None),
    'zm':  ('周牧', '22 歲的中國國家隊後腰，中等身材、勻稱結實，黑色中分短髮，細長的眼睛，神情冷靜理性，背號 6 號', C + 'char_zhoumu.png', None),
    'ae':  ('艾爾肯', '21 歲的維吾爾族中國國家隊右邊鋒，身形精瘦、有爆發力，深棕色捲髮，五官深邃、濃眉、高鼻梁、淺棕色眼睛，背號 7 號', C + 'char_aierken.png', None),
    'sl':  ('石磊', '28 歲的中國國家隊門將，身高約 192 公分，體格高大勻稱，黑色短髮整齊向後梳，表情沉默穩重', C + 'char_shilei.png', '翠綠色長袖門將球衣（胸前與袖子有深綠色的火焰暗紋、白色 V 領、左胸金色龍頭隊徽、白色背號 1 號）、綠色短褲、綠色長襪、白色足球鞋，戴白色大號門將手套'),
    'lw':  ('林晚', '29 歲的中國國家隊女性運動康復師兼數據分析師，黑色長髮綁成俐落的低馬尾，五官清秀、眼神專業直接', C + 'char_linwan.png', '深藍黑色的隊服運動外套（紅色與金色的肩線、左胸金色龍頭隊徽）、黑色運動長褲、白色運動鞋，左手腕戴黑色運動手錶'),
    'kz':  ('神崎凜', '24 歲的日本國家隊中場核心，身形勻稱輕盈，黑色短髮乾淨俐落、略長的瀏海側分，眼神平靜而銳利，氣質沉穩不動聲色', C + 'char_kanzaki.png', '日本隊球衣：深藍色短袖球衣（胸前有淺藍色的細直紋暗紋、白色圓領與袖口、白色背號 8 號）、深藍色短褲、深藍色長襪、白色足球鞋'),
    'jtj': ('姜泰俊', '25 歲的韓國國家隊中鋒，身高約 186 公分，強壯厚實，黑色短髮兩側剃短，眼神凶悍、鬥志旺盛', C + 'char_rivals.png', '韓國隊客場球衣：白色短袖球衣（肩膀與袖口是紅色與藍色的斜向條紋、紅色背號 9 號）、白色短褲、白色長襪、黑色足球鞋'),
    'kv':  ('卡維', '29 歲的伊朗國家隊中後衛，身高約 193 公分，極為高大魁梧，黑色短髮、濃密的黑色絡腮鬍，表情冷峻，左上臂戴綠色素面袖標', C + 'char_rivals.png', '伊朗隊球衣：白色短袖球衣（胸前一道綠色與紅色的橫向飾帶、綠色圓領、綠色背號 5 號）、白色短褲、白色長襪、白色足球鞋'),
    'bt':  ('布蘭特', '31 歲的德國國家隊門將隊長，身高約 195 公分，金色短髮、藍色眼睛、輪廓硬朗，神情沉著自信，左上臂戴黃色素面袖標', C + 'char_rivals.png', '德國隊門將球衣：黑色長袖門將球衣（袖子與身側有金色的細線條、白色背號 1 號）、黑色短褲、黑色長襪，戴白色門將手套'),
}
# 服裝代號
OUTFITS = {
    'cn': '中國國家隊比賽球衣（烈焰款）：鮮紅色短袖球衣、往下擺漸層成深酒紅，下擺與袖口有金黃色的火焰紋往上竄，白色 V 領、肩上各一道白色滾邊（只有一道，不可畫成三條平行線），左胸一枚金色龍頭盾形隊徽，胸前與背後是白色帶金邊的背號；白色短褲、兩側有紅色火焰紋；紅色長襪、襪口白色；白色足球鞋',
    'train': '國家隊訓練服：白色短袖訓練衫（胸前一道紅色與金色的斜向火焰紋、左胸金色龍頭隊徽）、紅色短褲、紅色長襪、白色足球鞋',
    'bib': '國家隊訓練服外面套一件螢光黃色的訓練背心：白色短袖訓練衫、紅色短褲、紅色長襪、白色足球鞋',
    'jacket': '國家隊外出服：紅色立領運動外套（肩線與袖口是金色滾邊、左胸金色龍頭隊徽，拉鍊拉上）、黑色運動長褲、白色運動鞋',
    'club': '俱樂部「遼東海鯨」的球衣：深藍色短袖球衣、胸前有白色與淺藍色的海浪斜紋、白色圓領與袖口、白色背號，白色短褲，深藍色長襪，白色足球鞋',
    'casual': '便服：深灰色連帽運動外套、黑色運動長褲、白色運動鞋',
    'winter': '冬訓服：紅色長袖保暖訓練外套（肩線金色滾邊、左胸金色龍頭隊徽）、黑色運動長褲、黑色手套，呼出白色的霧氣',
    'suit':  '深色西裝外套配白襯衫、不打領帶',
    'bench': '替補席的裝扮：比賽球衣外面披著紅色長版保暖外套（金色滾邊、左胸金色龍頭隊徽）',
    'injured': '便服：紅色立領運動外套（金色滾邊、左胸金色龍頭隊徽）、黑色長褲，右膝裹著厚厚的白色支架，拄著一支鋁製拐杖',
}
# 時間／光線
TIMES = {
    'N_STAD': '【時間：夜晚。天空是深藍色或黑色的夜空，場景靠球場高大的照明燈塔照明，燈光雪亮；絕對不可以是白天、不可以出現藍天白雲】',
    'NIGHT':  '【時間：夜晚。天空是深藍色或黑色的夜空，場景靠路燈、窗戶透出的燈光和月光照明；絕對不可以是白天、不可以出現藍天白雲】',
    'DAY':    '【時間：白天，晴朗的陽光，藍天】',
    'GRAY':   '【時間：白天，陰天，天空是厚重的灰白色雲層，光線冷而平】',
    'DAWN':   '【時間：清晨天剛亮，天邊一抹金色與淡藍，柔和的晨光，空氣清冷】',
    'DUSK':   '【時間：傍晚，夕陽西下，天空是橘紅色的晚霞，人物被拉出長長的影子】',
    'IN':     '【時間：室內，沒有窗外景色；靠天花板的白色燈管照明】',
    'IN_DARK': '【時間：深夜的室內，只開了一盞燈，四周昏暗，光影對比強烈】',
    'WINTER': '【時間：冬天的白天，高原上稀薄清冷的空氣，淡藍色的天空，遠處是覆著薄雪的山，人物呼出白色的霧氣】',
}

TOKEN = re.compile(r'@([a-z0-9]+)(?::([a-z]+))?')


def expand(text, ref=None):
    """把 @角色:服裝 換成完整外型描述，並回傳（提示詞, 參考圖清單）"""
    seen, outfits, refs = set(), [], []

    def rep(m):
        cid, oid = m.group(1), m.group(2)
        if cid not in CHARS: raise KeyError('沒有這個角色代號：@' + cid)
        name, look, rf, fixed = CHARS[cid]
        if oid and oid not in OUTFITS: raise KeyError('沒有這個服裝代號：' + oid)
        wear = OUTFITS[oid] if oid else fixed
        if cid in ('ly', 'lyc') and oid in ('club', 'casual'): rf = C + 'char_luyuan_club.png'
        if rf not in refs: refs.append(rf)
        if cid in seen: return name
        seen.add(cid)
        if wear: outfits.append('%s這時穿的是%s。' % (name, wear))
        if cid == 'ly' and oid in ('cn', 'train', 'bib'): outfits.append('陸遠的兩隻手臂上都沒有任何袖標（他這時還不是隊長）。')
        return '%s（%s）' % (name, look)

    body = TOKEN.sub(rep, text)
    return body + ''.join(outfits), (ref if ref is not None else refs[:3])


class Chapter:
    def __init__(self, no, title, next_title=None, free=False):
        self.no, self.title, self.next, self.free, self.items = no, title, next_title, free, []

    def P(self, pid, time, text, L=(), S=(), size='1536x1024', ref=None):
        prompt, refs = expand(text, ref)
        lines = []
        for l in L:
            t = l[0]; at = 'after'
            if t.endswith('<'): t, at = t[:-1], 'before'
            if t == 'nar': lines.append({'type': 'nar', 'at': at, 'text': l[1]})
            else: lines.append({'type': t, 'who': l[1], 'side': l[2], 'at': at, 'text': l[3]})
        sfx = [{'text': s[0], 'x': s[1], 'y': s[2], 'size': s[3] if len(s) > 3 else 1, 'rot': s[4] if len(s) > 4 else 0} for s in S]
        it = {'id': pid, 'size': size, 'prompt': TIMES[time] + prompt, 'lines': lines, 'sfx': sfx}
        if refs: it['ref'] = refs
        self.items.append(it)

    def save(self):
        cid = 'ch%02d' % self.no
        d = {'id': cid, 'no': self.no, 'title': self.title, 'free': self.free, 'out': 'manga/raw/' + cid,
             'style': STYLE, 'rules': RULES, 'items': self.items}
        if self.next: d['next'] = self.next
        check(d)
        p = os.path.join(ROOT, 'manga', 'data', cid + '.json')
        os.makedirs(os.path.dirname(p), exist_ok=True)
        json.dump(d, open(p, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
        n = sum(len(i['lines']) for i in d['items'])
        print('%s〈%s〉：%d 格、%d 句、%d 個狀聲詞 → %s' % (cid, self.title, len(d['items']), n, sum(len(i['sfx']) for i in d['items']), p))


def check(d):
    ids = [i['id'] for i in d['items']]
    assert len(ids) == 60, '要剛好 60 格，現在 %d 格' % len(ids)
    assert ids == ['p%02d' % n for n in range(60)], 'id 要依序 p00～p59'
    assert d['items'][0]['size'] == '1024x1536', 'p00 是封面，尺寸要 1024x1536'
    tall = [i['id'] for i in d['items'][1:] if i['size'] == '1024x1536']
    assert len(tall) <= 3, '直式大格最多 3 格：%s' % tall
    for i in d['items']:
        assert i['size'] in ('1536x1024', '1024x1536'), i['id']
        assert len(i.get('ref', [])) <= 3, i['id'] + ' 參考圖超過 3 張'
        assert len(i['lines']) <= 4, i['id'] + ' 超過 4 句'
        for l in i['lines']:
            assert l['type'] in ('nar', 'say', 'shout', 'think'), i['id']
            if l['type'] != 'nar': assert l['side'] in ('l', 'r', 'c'), i['id']
            assert '话・完' not in l['text'] and '話・完' not in l['text'], i['id']
        for s in i['sfx']:
            assert 0 <= s['x'] <= 1 and 0 <= s['y'] <= 1, i['id']
    try:
        import opencc   # 有裝的話用它檢查讀者看得到的字是不是全部簡體
        cv = opencc.OpenCC('t2s')
        for i in d['items']:
            for t in [l['text'] for l in i['lines']] + [l.get('who', '') for l in i['lines']] + [s['text'] for s in i['sfx']]:
                assert cv.convert(t) == t, '%s 有繁體字：%s → %s' % (i['id'], t, cv.convert(t))
        assert cv.convert(d['title']) == d['title'], '標題有繁體字'
    except ImportError:
        print('（沒裝 opencc，略過簡體字檢查）')

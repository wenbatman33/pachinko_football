#!/usr/bin/env python3
# 《PK大逆转》點球對決素材清單 → tools/manifest_duel_football.json（原圖輸出到 art_src/duel_fb/）
# 鍵名沿用棒球版：duel_p_*_set＝門將站姿、duel_p_*_throw＝門將撲救（一律往畫面右邊撲，程式會翻面）、
# duel_batter_ready／duel_batter_swing＝陸遠的背影（起腳前／起腳後）、duel_eyes_tianba＝陸遠的眼神、duel_t_hr／hit／out＝世界波／球進了／被撲出
import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from manga_lib import STYLE, RULES, expand
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KM = '背景必須是完全均勻的純洋紅色 #FF00FF，整個背景只有這個顏色，沒有地面、影子、漸層或任何其他物體；人物身上不可以有洋紅色或紫色。'
KG = '背景必須是完全均勻的純綠色 #00FF00，整個背景只有這個綠色，沒有地面、影子、漸層或任何其他物體；主體不可以使用任何綠色。'
items = []
def add(pid, size, text, ref=None, style=None, rules=None, refNote=None):
    prompt, refs = expand(text, ref)
    it = {'id': pid, 'size': size, 'prompt': prompt}
    if refs: it['ref'] = refs
    if style: it['style'] = style
    if rules is not None: it['rules'] = rules
    if refNote: it['refNote'] = refNote
    items.append(it)
S, W = '1024x1024', '1536x1024'
# ── 場景：從點球點後方看球門（四張構圖完全相同，只換看台與氣氛）──
COMP = ('一張正方形的背景圖，沒有任何人物在場上：從點球點後方、主罰者眼睛的高度正對球門看過去。白色球門完全置中、正面平視、左右對稱：'
        '球門的寬度佔畫面寬度的 80%（左門柱在畫面 10% 處、右門柱在 90% 處），橫梁在畫面高度 32% 處，球門線（門柱底部）在畫面高度 59% 處，球門裡是白色球網。'
        '球門前是禁區的草皮與白線，畫面下方正中央（高度 86% 處）有一個白色的點球點。畫面最上方是看台。球門裡和草皮上都沒有任何人、沒有足球。')
add('duel_bg_home', S, '【時間：夜晚，球場照明燈雪亮】' + COMP + '球門後方的看台是一片紅色的人海，觀眾揮舞純紅色的旗幟，氣氛沸騰。')
SAME = '完全依照附圖的構圖重畫一張：球門、門柱、橫梁、球門線、點球點、禁區線的位置與大小必須跟附圖一模一樣，只換掉球門後方的看台與整體氣氛：'
NOTE = '附圖是構圖參考：球門與草皮上所有線條的位置大小完全照它，只換看台與氣氛。'
add('duel_bg_train', S, '【時間：傍晚，夕陽】' + SAME + '這是國家隊的訓練場，球門後方沒有看台，只有綠色的圍網、幾棵樹、遠處白色的訓練大樓和橘紅色的晚霞；場邊放著一排訓練用的標誌桶。安靜的訓練氣氛。場上沒有任何人。', ref=['art_src/duel_fb/duel_bg_home.png'], refNote=NOTE)
add('duel_bg_asia', S, '【時間：夜晚，球場照明燈雪亮】' + SAME + '這是客場的巨大球場，球門後方的看台坐滿穿白色與深色衣服的對方球迷，揮舞純白色與純藍色的旗幟，壓迫感十足。場上沒有任何人。', ref=['art_src/duel_fb/duel_bg_home.png'], refNote=NOTE)
add('duel_bg_world', S, '【時間：夜晚，球場照明燈雪亮】' + SAME + '這是世界盃的超現代化巨型球場，看台有三層、座無虛席，觀眾席是各種顏色混雜的人海，無數手機燈光像星海，上空有弧形的巨大頂棚與光束，金色紙花飄落。場上沒有任何人。', ref=['art_src/duel_fb/duel_bg_home.png'], refNote=NOTE)
# ── 門將 ──
KEEPERS = [
 ('shilei', '@sl', None),
 ('jp', '日本隊門將早瀨岳（26 歲日本男性，身高約 188 公分，精瘦敏捷，黑色短髮、額前幾縷碎髮，眼神冷靜專注，穿全素面的橘色長袖門將球衣、橘色短褲、橘色長襪、白色素面足球鞋，戴白色門將手套）', None),
 ('ir', '伊朗隊門將莫拉迪（30 歲伊朗男性，身高約 194 公分，魁梧厚實，黑色短捲髮、濃眉、修剪整齊的黑色短鬍，表情威嚴，穿全素面的灰色長袖門將球衣、灰色短褲、灰色長襪、白色素面足球鞋，戴白色門將手套）', None),
 ('kr', '韓國隊門將尹成賢（27 歲韓國男性，高瘦、手長，黑色短髮向上梳、細長的眉眼、神情冷靜，穿全素面的天藍色長袖門將球衣、天藍色短褲、天藍色長襪、白色素面足球鞋，戴白色門將手套）', None),
 ('de', '@bt', None),
]
for kid, who, _ in KEEPERS:
    setp = 'art_src/duel_fb/duel_p_%s_set.png' % kid
    add('duel_p_%s_set' % kid, S, '只畫一個人：' + who + '的正面全身像，面向鏡頭（鏡頭在點球點的位置），門將守門的準備姿勢：雙腳與肩同寬、膝蓋微彎、重心壓低、雙臂向兩側張開、眼睛盯著鏡頭。人物站在畫布正中央，從頭頂到腳底的高度剛好佔畫布高度的 60%，腳底在畫布高度 85% 的位置，四周留白。' + KM)
    add('duel_p_%s_throw' % kid, S, '只畫一個人：跟附圖同一個人（' + who + '）正面視角的全身像，橫身飛撲的瞬間：整個身體橫著騰空，往「畫面右邊」飛撲，頭和雙手在畫面右側、雙腳在畫面左側，雙手伸直伸向右上方要去搆球，表情全力以赴。人物的大小跟附圖完全相同（身長約佔畫布寬度的 62%），身體的中心在畫布正中央偏上（高度 55% 處），整個人完整在畫布內、四周留白，不要畫足球。' + KM,
        ref=[setp] if who.startswith('@') is False else [setp], refNote='附圖是同一位門將的站姿：臉、髮型、服裝、配色、人物大小都要完全相同，只換成橫身飛撲的姿勢。')
    add('duel_face_%s' % kid, W, '一張橫圖：' + who + '的臉部大特寫，佔滿畫面，壓低重心、目光如炬地盯著鏡頭，戴著手套的雙手在臉的兩側張開；背景是失焦的白色球網與看台燈光，加上少量放射集中線。臉在畫面中間偏右。', ref=[setp])
# ── 主罰者與共用素材 ──
add('duel_batter_ready', S, '只畫一個人：@ly:cn 的「背影」，鏡頭在他正後方稍微偏右：他背對鏡頭站著，雙手叉腰、微微低頭看著前方地上（不要畫足球），左上臂戴著全素面的黃色隊長袖標。人物從頭頂到大腿中段都要完整畫出來，佔滿畫布高度，人很大。' + KG)
add('duel_batter_swing', S, '只畫一個人：跟附圖同一個人（@ly:cn）的「背影」，同樣的鏡頭（正後方稍微偏右）：左腳剛踢完球的隨球動作——身體前傾、左腿向前上方甩出、右臂向側後方張開保持平衡，球衣被風壓吹動，左上臂戴著全素面的黃色隊長袖標。人物大小跟附圖相同，不要畫足球。' + KG,
    ref=['art_src/duel_fb/duel_batter_ready.png', 'manga/raw/chars/char_luyuan.png'], refNote='附圖一是同一個人的站姿背影（人物大小、服裝完全照它），附圖二是他的角色設計。')
add('duel_eyes_tianba', W, '一張橫圖：@ly 「眼睛」的超近特寫，像漫畫裡決勝負前的眼神分鏡，畫面只有眉毛到鼻樑：左眉上的斜向舊疤、黑色瀏海，瞳孔裡映著白色的球門，汗水滑過眉骨；背景是紅色與金色的放射集中線。')
add('duel_ball', S, '只畫一顆足球：經典的黑白拼塊足球（白色六邊形與黑色五邊形），漫畫彩頁的畫風，粗黑描線、立體的明暗與高光，正圓形，佔畫布約 70%。' + KG)
add('duel_emblem', S, '只畫一個徽章：燃燒的圓形金屬徽章，深紅色底、金色粗邊，徽章正中央是一顆金色的足球浮雕，外圍是紅橙色的火焰與火星（火焰不要用任何綠色）。徽章上沒有任何文字。' + KG, style='高品質柏青哥演出用的立體金屬徽章設計。', rules='畫面中不可有任何文字。')
T = '漫畫的大標題字，只有指定的簡體中文字與標點，字形一定要完全正確、清楚可讀，不可多筆畫少筆畫、不可寫成繁體字：'
TS, TR = '熱血運動漫畫的手寫粗體標題字設計。', '只能出現指定的簡體中文字與驚嘆號。'
add('duel_t_hr', W, T + '「世界波！！」（世、界、波，加兩個驚嘆號）。熱血漫畫的手寫粗體字，金黃色字、紅色粗描邊、黑色外框，字微微向右上傾斜，後面是紅色的爆炸框與放射線（不要用任何綠色）。' + KG, style=TS, rules=TR)
add('duel_t_hit', W, T + '「球进了！」（球、进、了，加一個驚嘆號；「进」是簡體字）。熱血漫畫的手寫粗體字，白色字、紅色粗描邊、黑色外框，字微微向右上傾斜，後面是黃色的爆炸框（不要用任何綠色）。' + KG, style=TS, rules=TR)
add('duel_t_out', W, T + '「被扑出！」（被、扑、出，加一個驚嘆號；「扑」是簡體字）。漫畫裡表現失敗、不甘心的手寫粗體字，白色字、深藍色粗描邊、黑色外框，字微微向右下傾斜，後面是灰藍色的碎裂框（不要用任何綠色）。' + KG, style=TS, rules=TR)
json.dump({'out': 'art_src/duel_fb', 'style': STYLE, 'rules': RULES, 'items': items}, open(os.path.join(ROOT, 'tools', 'manifest_duel_football.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(items), '張')

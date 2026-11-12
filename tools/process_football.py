"""把 art_src/football 的 AI 原圖處理成遊戲用 webp（去背、縮放、壓縮），並用五話的封面拼出首頁的章節縮圖條。
原圖比成品新才會重做；棒球版的成品備份在 _backup/2026-11-12_baseball/img/。

用法：/Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5/.venv/bin/python -I tools/process_football.py [id ...]
"""
import sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from process_duel import key_out   # 綠幕／洋紅幕去背

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / "art_src" / "football"
IMG = ROOT / "assets" / "img"

# id: (輸出位置, 最大寬, 最大高, 去背色 None／'g'／'m', 品質)
JOBS = {}
for k in ["bg_day", "bg_sunset", "bg_night", "bg_gold", "bg_ninth", "cut_hero", "cut_manager", "splash_rush",
          "sc_stadium_night", "sc_pitcher_smirk", "sc_hero_rise", "sc_manager_shout", "sc_heroine_megaphone", "sc_hit_single", "sc_walk", "sc_steal",
          "sc_pitcher_shaken", "sc_score", "sc_tie_crowd", "sc_bases_loaded", "sc_pinch_walkout", "sc_memory", "sc_last_pitch", "sc_eye", "sc_impact",
          "sc_ball_sky", "sc_round_bases", "sc_pileup", "sc_heroine_tears", "sc_hero_raise"]:
    JOBS[k] = (k, 1280, 854, None, 84)
JOBS["splash_homerun"] = ("splash_homerun", 1536, 1024, None, 84)
for k in ["mp_b_stance", "mp_b_glare", "mp_b_grip", "mp_b_take", "mp_b_foul", "mp_b_swing", "mp_b_watch", "mp_cheer", "mp_crowd", "mp_versus",
          "mp_p_windup", "mp_p_release", "mp_ball", "mp_mitt", "mp_p_smirk", "mp_p_shaken"]:
    JOBS[k] = ("panels/" + k, 640, 960, None, 84)
JOBS["cut_heroine"] = ("cut_heroine", 760, 760, "m", 86)
JOBS["yaku_ball"] = ("yaku_ball", 520, 520, "m", 86)
JOBS["home_bg"] = ("home_bg", 1024, 1536, None, 86)
JOBS["logo"] = ("logo", 1526, 874, "g", 90)
JOBS["logo_line"] = ("logo_line", 1526, 464, "g", 90)
for k in ["fx_reach", "fx_gekiatsu", "fx_ooatari", "fx_homerun", "fx_rush", "fx_lt"]:
    JOBS[k] = (k, 1100, 600, "g", 88)
JOBS["side_a"] = ("v2/machine_e", 1024, 1536, None, 90)   # 定案（2026-11-12）：曜石黑＋金＋紅光、頂部金色足球與球門、兩側一體流線（side_a）；遊戲裡的檔名仍是 machine_e


def chapters_strip():
    """首頁漫畫櫃的章節縮圖條（assets/img/home_chapters.webp）：每話一格 336x168，從封面中段裁一條橫的"""
    n, tw, th = 5, 336, 168
    strip = Image.new("RGB", (tw * n, th), "#333")
    got = 0
    for i in range(n):
        src = ROOT / "manga" / "raw" / ("ch%02d" % (i + 1)) / "p00.png"
        if not src.exists():
            continue
        im = Image.open(src).convert("RGB")
        w, h = im.size
        ch = w * th // tw                       # 要裁的高度（跟格子同比例）
        y0 = min(h - ch, max(0, int(h * 0.52) - ch // 2))   # 封面的人物多半在中下段
        strip.paste(im.crop((0, y0, w, y0 + ch)).resize((tw, th), Image.LANCZOS), (i * tw, 0))
        got += 1
    strip.save(IMG / "home_chapters.webp", "WEBP", quality=86, method=5)
    print("ok home_chapters（%d／%d 話有封面）" % (got, n))


def main():
    only = set(sys.argv[1:])
    done = miss = 0
    for name, (dst_rel, mw, mh, key, q) in JOBS.items():
        if only and name not in only:
            continue
        src = RAW / f"{name}.png"
        dst = IMG / f"{dst_rel}.webp"
        if not src.exists():
            miss += 1
            continue
        if not only and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            continue
        im = Image.open(src)
        if key:
            im = key_out(im, key)
            im = im.crop(im.getbbox())
        else:
            im = im.convert("RGB")
        im.thumbnail((mw, mh), Image.LANCZOS)
        dst.parent.mkdir(parents=True, exist_ok=True)
        im.save(dst, "WEBP", quality=q, method=5)
        done += 1
        print("ok", name, im.size, dst.stat().st_size // 1024, "KB")
    if not only or "home_chapters" in only:
        chapters_strip()
    print("處理 %d 張；還沒有原圖的 %d 張" % (done, miss))


if __name__ == "__main__":
    main()

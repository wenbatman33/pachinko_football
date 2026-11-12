"""《PK大逆转》足球版的語音與音效（輸出 mp3，覆蓋 assets/audio 裡同名的檔；棒球版的原檔備份在 _backup/2026-11-12_baseball/audio/）。

用法（專案根目錄）：
  /Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5/.venv/bin/python tools/make_audio_football.py [voice|sfx]
檔名沿用棒球版的鍵名（程式不用改）：bat＝踢球聲、mitt＝門將接球／撲球聲；語音鍵名見 VOICE_LINES。
"""
import subprocess, sys, tempfile
from pathlib import Path
import numpy as np
sys.path.insert(0, str(Path(__file__).resolve().parent))
import make_sfx as M

VOICE_NAME = "Eddy (中文（中國大陸）)"   # 普通話男聲（足球解說）；沒有這個語音時改用 Tingting
# (鍵名, 台詞, 語速)
VOICE_LINES = [
    ("reach", "听牌！", 200), ("chance", "机会来了！", 205), ("gekiatsu", "超热血！", 195),
    ("homerun", "球进了！", 200), ("sayonara", "绝杀！补时绝杀！", 205), ("atari", "中大奖！", 190),
    ("migi", "请打右边！", 195), ("hidari", "请打左边。", 190), ("rush", "连胜冲刺，开始！", 200),
    ("lt", "幸运爆发！", 195), ("playball", "比赛开始！", 195), ("ninth", "补时阶段！", 190),
    ("kattobase", "踢进去！", 210), ("push", "按下去！", 210), ("strike", "被扑出了！", 195),
    ("keizoku", "连胜继续！", 195), ("rush_end", "连胜结束，踢得好！", 190),
    ("omedetou", "恭喜你！", 190), ("next", "再攻一波！", 205),
    ("zenkaiten", "全部转起来！", 190), ("jitan", "机会时间，开始！", 195),
    ("utte", "射门！", 215), ("round", "回合开始！", 195), ("matamada", "还没完！", 200),
    ("kakutei", "稳了！", 185), ("gold", "黄金连胜！", 195),
]

def build_voices():
    M.VOICE.mkdir(parents=True, exist_ok=True)
    have = subprocess.run(["say", "-v", "?"], capture_output=True, text=True).stdout
    name = VOICE_NAME if VOICE_NAME in have else "Tingting"
    print("語音：", name)
    for vid, text, rate in VOICE_LINES:
        with tempfile.TemporaryDirectory() as td:
            aiff = Path(td) / "v.aiff"
            subprocess.run(["say", "-v", name, "-r", str(rate), "-o", str(aiff), text], check=True)
            # 球場廣播質感：壓縮＋短回音＋響度標準化
            subprocess.run([
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(aiff),
                "-af", "highpass=f=110,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,"
                       "aecho=0.85:0.5:70|140:0.22|0.12,loudnorm=I=-13:TP=-1.2,apad=pad_dur=0.15",
                "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "128k",
                str(M.VOICE / f"{vid}.mp3"),
            ], check=True)
        print("voice", vid, text)

def build_sfx():
    SR = M.SR
    # 踢球：皮革被腳背擊中的「嘭」——低頻的悶響＋短促的拍擊聲
    n = int(0.5 * SR); tt = np.arange(n) / SR
    f = 150 * np.exp(-tt / 0.03) + 58
    thump = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-tt / 0.085)
    slap = M.bp(M.noise(0.5), 700, 3600) * np.exp(-tt / 0.014)
    air = M.hp(M.noise(0.5), 3000) * np.exp(-tt / 0.05) * 0.18
    M.save("bat", M.reverb(M.mix(thump * 1.5, slap * 1.1, air), sec=1.4, wet=0.28), peak=0.95)
    # 門將接球／撲球：手套拍住球的悶響
    n2 = int(0.3 * SR); t2 = np.arange(n2) / SR
    mitt = M.lp(M.noise(0.3), 2200) * np.exp(-t2 / 0.016) + 0.8 * np.sin(2 * np.pi * 170 * t2) * np.exp(-t2 / 0.04)
    M.save("mitt", M.reverb(mitt, sec=0.9, wet=0.25), peak=0.9)
    print("sfx bat（踢球）、mitt（接球）")

if __name__ == "__main__":
    what = sys.argv[1:] or ["voice", "sfx"]
    if "sfx" in what: build_sfx()
    if "voice" in what: build_voices()

"""九回裏ホームラン魂：離線製作效果音與語音音檔（輸出 mp3，遊戲只播放音檔）。

用法（專案根目錄）：
  /Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5/.venv/bin/python tools/make_sfx.py
"""
from pathlib import Path
import subprocess
import tempfile

import numpy as np
import soundfile as sf
from scipy import signal

ROOT = Path(__file__).resolve().parents[1]
SFX = ROOT / "assets" / "audio" / "sfx"
VOICE = ROOT / "assets" / "audio" / "voice"
SR = 44100
rng = np.random.default_rng(20261108)


# ---------- 基本工具 ----------
def t(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], btype="band", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    sos = signal.butter(order, f, btype="low", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def hp(x, f, order=2):
    sos = signal.butter(order, f, btype="high", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def expenv(n, decay):
    return np.exp(-np.arange(n) / SR / decay)


def pad(x, sec):
    return np.concatenate([x, np.zeros(int(sec * SR))])


def mix(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def place(buf, x, at):
    i = int(at * SR)
    end = min(len(buf), i + len(x))
    buf[i:end] += x[: end - i]
    return buf


def modal(freqs, decays, amps, sec):
    """金屬／鐘類模態合成：多個衰減正弦。"""
    tt = t(sec)
    out = np.zeros(len(tt))
    for f, d, a in zip(freqs, decays, amps):
        out += a * np.sin(2 * np.pi * f * tt + rng.uniform(0, 6.28)) * np.exp(-tt / d)
    return out


def reverb(x, sec=1.2, wet=0.3, bright=6000):
    """以衰減噪音脈衝響應做的立體聲殘響。"""
    n = int(sec * SR)
    irs = []
    for _ in range(2):
        ir = lp(rng.standard_normal(n), bright) * np.exp(-np.arange(n) / SR / (sec / 5))
        ir[: int(0.01 * SR)] *= np.linspace(0, 1, int(0.01 * SR))
        irs.append(ir / np.sqrt(np.sum(ir ** 2)))
    dry = np.stack([x, x], axis=1)
    out = np.zeros((len(x) + n - 1, 2))
    out[: len(x)] += dry * (1 - wet)
    for c in range(2):
        out[:, c] += wet * signal.fftconvolve(x, irs[c])
    return out


def stereo(x):
    return x if x.ndim == 2 else np.stack([x, x], axis=1)


def save(name, x, peak=0.89, folder=SFX):
    x = stereo(x)
    # 去除尾端靜音
    mag = np.max(np.abs(x), axis=1)
    idx = np.where(mag > 1e-4 * np.max(mag))[0]
    if len(idx):
        x = x[: idx[-1] + int(0.02 * SR)]
    x = x / (np.max(np.abs(x)) + 1e-9) * peak
    fade = min(len(x), int(0.005 * SR))
    x[-fade:] *= np.linspace(1, 0, fade)[:, None]
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
        sf.write(tmp.name, x, SR)
        subprocess.run(["ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", tmp.name,
                        "-codec:a", "libmp3lame", "-b:a", "160k", str(folder / f"{name}.mp3")], check=True)
    print("ok", name)


# ---------- 素材 ----------
def ball_tink(sec=0.09, base=None):
    base = base or rng.uniform(3800, 5200)
    ratios = [1.0, 1.47, 2.09, 2.76]
    m = modal([base * r for r in ratios], [0.012, 0.009, 0.007, 0.005], [1, 0.6, 0.4, 0.25], sec)
    click = hp(noise(0.004), 3000) * np.linspace(1, 0, int(0.004 * SR))
    return mix(m, click * 0.5)


def bell(f, sec=1.2, decay=0.5):
    return modal([f, f * 2.0, f * 3.01, f * 4.17, f * 5.43],
                 [decay, decay * 0.6, decay * 0.35, decay * 0.2, decay * 0.12],
                 [1, 0.5, 0.35, 0.2, 0.12], sec)


def orch_hit(f0=130.8, sec=1.6):
    """管弦樂齊奏打擊（多音堆疊＋濾波包絡＋噪音衝擊）。"""
    tt = t(sec)
    chord = [1, 1.5, 2, 2.52, 3, 4, 5.04, 6]
    x = np.zeros(len(tt))
    for k, r in enumerate(chord):
        f = f0 * r
        for det in (-0.004, 0, 0.004):
            ph = rng.uniform(0, 6.28)
            saw = signal.sawtooth(2 * np.pi * f * (1 + det) * tt + ph)
            x += saw / (k + 1) ** 0.6
    env = np.exp(-tt / 0.45) * (1 - np.exp(-tt / 0.004))
    x = lp(x * env, 4500)
    boom = np.sin(2 * np.pi * (55 + 40 * np.exp(-tt / 0.05)) * tt) * np.exp(-tt / 0.3)
    hit = bp(noise(0.25), 200, 8000) * expenv(int(0.25 * SR), 0.04)
    return reverb(mix(x * 0.5, boom * 1.2, hit * 0.8), sec=1.8, wet=0.35)


def whoosh(sec=0.45, up=True):
    n = noise(sec)
    tt = t(sec)
    out = np.zeros_like(n)
    seg = 256
    for i in range(0, len(n) - seg, seg):
        p = i / len(n)
        fc = 300 + (7000 if up else 7000 * (1 - p)) * (p if up else 1)
        fc = min(max(fc, 200), 12000)
        out[i:i + seg] = bp(n[i:i + seg * 2], fc * 0.6, min(fc * 1.6, 20000))[:seg]
    env = np.sin(np.pi * np.clip(tt / sec, 0, 1)) ** 1.5
    return out * env


def impact(sec=1.0, low=45):
    tt = t(sec)
    sub = np.sin(2 * np.pi * (low + 90 * np.exp(-tt / 0.04)) * tt) * np.exp(-tt / 0.35)
    crack = bp(noise(0.12), 400, 9000) * expenv(int(0.12 * SR), 0.025)
    return mix(sub * 1.4, crack * 0.9)


def crowd(sec=4.0, swell=True, groan=False):
    """群眾歡呼：多個帶通噪音聲部模擬人聲共振峰＋掌聲。"""
    n = int(sec * SR)
    tt = t(sec)
    out = np.zeros(n)
    vowels = [(730, 1090), (570, 840), (660, 1700), (400, 2000), (500, 1000)]
    for i in range(36):
        f1, f2 = vowels[i % len(vowels)]
        shift = rng.uniform(0.75, 1.35)
        src = noise(sec)
        if groan:
            # 下滑的「あぁ〜」
            v = bp(src, f1 * shift * 0.8, f1 * shift * 1.25) + 0.6 * bp(src, f2 * shift * 0.85, f2 * shift * 1.2)
        else:
            v = bp(src, f1 * shift * 0.85, f1 * shift * 1.2) + 0.5 * bp(src, f2 * shift * 0.9, f2 * shift * 1.15)
        start = rng.uniform(0, 0.4)
        a = np.clip((tt - start) / rng.uniform(0.08, 0.5), 0, 1)
        trem = 1 + 0.35 * np.sin(2 * np.pi * rng.uniform(3, 7) * tt + rng.uniform(0, 6))
        out += v * a * trem * rng.uniform(0.5, 1.0)
    # 掌聲：密集短促噪音脈衝
    clap = np.zeros(n)
    for _ in range(int(sec * 140)):
        at = rng.uniform(0, sec)
        c = bp(noise(0.02), 900, 5000) * expenv(int(0.02 * SR), 0.004) * rng.uniform(0.3, 1)
        place(clap, c, at)
    body = out / (np.max(np.abs(out)) + 1e-9) + (0 if groan else 0.55) * clap / (np.max(np.abs(clap)) + 1e-9)
    if groan:
        env = np.clip(tt / 0.15, 0, 1) * np.exp(-np.clip(tt - 0.4, 0, None) / 0.9)
    elif swell:
        env = np.clip(tt / 0.35, 0, 1) * np.exp(-np.clip(tt - sec * 0.55, 0, None) / (sec * 0.25))
    else:
        env = np.ones(n)
    return reverb(body * env, sec=2.0, wet=0.45, bright=5000)


def build_all():
    # 發射：輕柔「トン」
    tt = t(0.12)
    launch = np.sin(2 * np.pi * 140 * tt) * np.exp(-tt / 0.025) + 0.3 * hp(noise(0.12), 2000) * np.exp(-tt / 0.01)
    save("launch", launch, peak=0.5)

    # 釘子碰撞 3 種
    for i in range(3):
        save(f"tink{i}", reverb(ball_tink(), sec=0.4, wet=0.15), peak=0.5)

    # 鋼珠滾動環境音（無縫循環 3 秒）
    loop_sec = 3.0
    jara = np.zeros(int(loop_sec * SR))
    for _ in range(260):
        at = rng.uniform(0, loop_sec)
        tk = ball_tink(0.08) * rng.uniform(0.15, 1.0)
        i = int(at * SR)
        for k, v in enumerate(tk):
            jara[(i + k) % len(jara)] += v
    jara = lp(jara, 9000)
    save("jara_loop", jara, peak=0.6)

    # ヘソ入賞「ピロリン」
    h = np.zeros(int(0.9 * SR))
    for k, f in enumerate([1318.5, 1975.5, 2637.0]):
        place(h, bell(f, 0.8, 0.25) * (1 - 0.15 * k), k * 0.055)
    save("heso", reverb(h, sec=0.8, wet=0.25), peak=0.7)

    # 賞球「ジャラジャラ」
    pay = np.zeros(int(0.7 * SR))
    for _ in range(45):
        place(pay, ball_tink(0.07, rng.uniform(3000, 6000)) * rng.uniform(0.3, 1), rng.uniform(0, 0.5))
    save("payout", reverb(pay, sec=0.5, wet=0.2), peak=0.6)

    # 圖柄停止「ガコッ」
    tt = t(0.18)
    stop = np.sin(2 * np.pi * (180 + 200 * np.exp(-tt / 0.01)) * tt) * np.exp(-tt / 0.04)
    stop += 0.5 * bp(noise(0.18), 1500, 6000) * np.exp(-tt / 0.008)
    save("reel_stop", stop, peak=0.8)

    # 變動開始滴答
    tt = t(0.05)
    save("reel_tick", hp(noise(0.05), 2500) * np.exp(-tt / 0.006), peak=0.4)

    # リーチ管弦打擊
    save("reach_hit", orch_hit(146.8), peak=0.9)
    save("round_hit", orch_hit(196.0, 1.2), peak=0.85)

    # 激アツ「キュイーン」：上升金屬滑音＋疊音
    sec = 1.4
    tt = t(sec)
    f = 600 * (2 ** (tt / sec * 3.3))
    ph = 2 * np.pi * np.cumsum(f) / SR
    car = np.sin(ph + 2.2 * np.sin(ph * 1.5)) + 0.5 * np.sin(ph * 2.01)
    env = np.clip(tt / 0.03, 0, 1) * np.exp(-np.clip(tt - 1.0, 0, None) / 0.12)
    ky = car * env
    ky2 = np.roll(ky, int(0.011 * SR)) * 0.7
    save("kyuin", reverb(mix(ky, ky2) * 0.6, sec=1.2, wet=0.3), peak=0.75)

    # 切入：風切＋衝擊
    ci = np.zeros(int(1.4 * SR))
    place(ci, whoosh(0.35), 0)
    place(ci, impact(0.9, 60) * 0.9, 0.3)
    shing = modal([5200, 7300, 9100], [0.25, 0.18, 0.12], [1, 0.6, 0.4], 0.6) * 0.35
    place(ci, shing, 0.3)
    save("cutin", reverb(ci, sec=1.0, wet=0.25), peak=0.85)

    # PUSH 按鈕「ドンッ」
    save("push", reverb(impact(1.2, 40), sec=1.5, wet=0.3), peak=0.9)

    # 保留變化閃亮
    sp = np.zeros(int(1.2 * SR))
    for k, fr in enumerate([1568, 1976, 2349, 3136, 3951]):
        place(sp, bell(fr, 0.7, 0.2) * 0.7, k * 0.045)
    save("hold_up", reverb(sp, sec=1.0, wet=0.35), peak=0.65)

    # 虹色確定：長上行鐘聲滑奏
    rb = np.zeros(int(3.0 * SR))
    scale = [1046.5, 1174.7, 1318.5, 1568, 1760, 2093, 2349, 2637, 3136, 3520, 4186]
    for k, fr in enumerate(scale * 2):
        place(rb, bell(fr * (1 if k < len(scale) else 1.0), 1.2, 0.4) * 0.5, k * 0.06)
    save("rainbow", reverb(rb, sec=2.5, wet=0.45), peak=0.75)

    # 擊球「カキーン」：木棒破裂音＋共鳴
    tt = t(0.6)
    crack = bp(noise(0.6), 1500, 9000) * np.exp(-tt / 0.006)
    body = modal([920, 1730, 2650, 3900], [0.06, 0.045, 0.03, 0.02], [1, 0.8, 0.5, 0.3], 0.6)
    thud = np.sin(2 * np.pi * 110 * tt) * np.exp(-tt / 0.05)
    save("bat", reverb(mix(crack * 1.6, body, thud * 0.6), sec=1.6, wet=0.3), peak=0.95)

    # 捕手手套「パァン」
    tt = t(0.25)
    mitt = lp(noise(0.25), 2800) * np.exp(-tt / 0.012) + 0.7 * np.sin(2 * np.pi * 260 * tt) * np.exp(-tt / 0.03)
    save("mitt", reverb(mitt, sec=0.9, wet=0.25), peak=0.9)

    # 大爆炸
    tt = t(3.0)
    sub = np.sin(2 * np.pi * (30 + 70 * np.exp(-tt / 0.15)) * tt) * np.exp(-tt / 0.9)
    rumble = lp(noise(3.0), 400) * np.exp(-tt / 0.7)
    crack = bp(noise(3.0), 300, 7000) * np.exp(-tt / 0.08)
    save("boom", reverb(mix(sub * 1.5, rumble * 1.2, crack), sec=2.5, wet=0.35), peak=0.95)

    # 群眾
    save("crowd_cheer", crowd(4.5), peak=0.8)
    save("crowd_groan", crowd(2.2, groan=True), peak=0.6)
    save("crowd_loop", crowd(6.0, swell=False), peak=0.5)

    # アタッカー入賞「チャリーン」
    at = modal([2489, 3729, 6271, 7902], [0.18, 0.12, 0.08, 0.05], [1, 0.7, 0.5, 0.3], 0.5)
    save("attacker", reverb(at, sec=0.6, wet=0.2), peak=0.6)

    # 通過ゲート
    tt = t(0.08)
    save("gate", np.sin(2 * np.pi * 2200 * tt) * np.exp(-tt / 0.015) + 0.2 * hp(noise(0.08), 4000) * np.exp(-tt / 0.004), peak=0.4)

    # 圖柄揃い「シャキーン」
    tt = t(1.2)
    shing = modal([3100, 4650, 6200, 8300, 10400], [0.5, 0.4, 0.3, 0.2, 0.15], [1, 0.8, 0.6, 0.4, 0.3], 1.2)
    burst = hp(noise(1.2), 5000) * np.exp(-tt / 0.05)
    save("shakin", reverb(mix(shing, burst), sec=1.5, wet=0.35), peak=0.8)

    # 小鼓滾奏（漸強，2 秒）
    sec = 2.0
    roll = np.zeros(int(sec * SR))
    k = 0.0
    while k < sec:
        hit = bp(noise(0.05), 1200, 7000) * expenv(int(0.05 * SR), 0.01) + 0.4 * np.sin(2 * np.pi * 190 * t(0.05)) * expenv(int(0.05 * SR), 0.02)
        place(roll, hit * (0.25 + 0.75 * k / sec), k)
        k += 1 / 26 * rng.uniform(0.9, 1.1)
    save("drumroll", reverb(roll, sec=0.8, wet=0.2), peak=0.8)

    # 計數滴答
    tt = t(0.04)
    save("count", np.sin(2 * np.pi * 3300 * tt) * np.exp(-tt / 0.01), peak=0.35)

    # 役物落下「ガシャーン」
    yk = np.zeros(int(2.0 * SR))
    place(yk, impact(1.0, 50), 0)
    for _ in range(25):
        place(yk, ball_tink(0.1, rng.uniform(1500, 4000)) * rng.uniform(0.2, 0.7), rng.uniform(0.01, 0.35))
    place(yk, modal([4100, 6150, 8200], [0.6, 0.45, 0.3], [1, 0.6, 0.4], 1.2) * 0.4, 0.05)
    save("yaku", reverb(yk, sec=1.6, wet=0.35), peak=0.95)

    # 失敗「プシュー」
    sec = 0.7
    tt = t(sec)
    fz = whoosh(sec, up=False) * np.exp(-tt / 0.3)
    save("fail", fz, peak=0.45)

    # LT 發動：巨大衝擊＋上升閃光
    lt = np.zeros(int(4.0 * SR))
    place(lt, impact(2.0, 35) * 1.2, 0)
    place(lt, orch_hit(130.8, 2.0)[:, 0], 0)
    for kk, fr in enumerate(scale):
        place(lt, bell(fr, 1.5, 0.5) * 0.4, 0.15 + kk * 0.05)
    save("lt", reverb(lt, sec=2.5, wet=0.35), peak=0.95)

    # 心跳（緊張）
    hb = np.zeros(int(1.0 * SR))
    for at_ in (0.0, 0.22):
        tt = t(0.25)
        place(hb, np.sin(2 * np.pi * 55 * tt) * np.exp(-tt / 0.07) * (1 if at_ == 0 else 0.7), at_)
    save("heartbeat", lp(hb, 300), peak=0.9)

    # 投球「シュッ」
    save("pitch", whoosh(0.3, up=True) * 0.8, peak=0.6)


VOICE_LINES = [   # 台灣華語（2026-11-10 全遊戲改繁體中文：語音也改成台灣華語，macOS 的 Meijia）
    ("reach", "聽牌！", 200), ("chance", "機會來了！", 200), ("gekiatsu", "超熱血！", 195),
    ("homerun", "全壘打！", 195), ("sayonara", "再見全壘打！", 195),
    ("atari", "中大獎！", 190), ("migi", "請打右邊", 185),
    ("hidari", "請改回打左邊", 185), ("rush", "全壘打連莊，開始！", 195),
    ("lt", "幸運爆發！", 195), ("playball", "開打！", 195),
    ("ninth", "九局下半，兩出局，滿壘！", 190), ("kattobase", "打出去！", 205),
    ("push", "按下去！", 205), ("strike", "好球！三振出局！", 200),
    ("keizoku", "連莊繼續！", 195), ("rush_end", "連莊結束，打得好！", 185),
    ("omedetou", "恭喜你！", 190), ("next", "下一棒！", 205),
    ("zenkaiten", "全部轉起來！", 190), ("jitan", "機會時間，開始！", 195),
    ("utte", "打啊！", 210), ("round", "回合開始！", 195), ("matamada", "還早咧！", 200),
    ("kakutei", "穩了！", 185), ("gold", "黃金連莊！", 195),
]


VOICE_NAME = "Meijia"   # 台灣華語女聲（原本是日文 Kyoko）


def build_voices():
    VOICE.mkdir(parents=True, exist_ok=True)
    for vid, text, rate in VOICE_LINES:
        with tempfile.TemporaryDirectory() as td:
            aiff = Path(td) / "v.aiff"
            subprocess.run(["say", "-v", VOICE_NAME, "-r", str(rate), "-o", str(aiff), text], check=True)
            # 球場廣播質感：壓縮＋短回音＋響度標準化
            subprocess.run([
                "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(aiff),
                "-af", "highpass=f=120,acompressor=threshold=-18dB:ratio=4:attack=5:release=80,"
                       "aecho=0.85:0.5:70|140:0.22|0.12,loudnorm=I=-13:TP=-1.2,apad=pad_dur=0.15",
                "-ar", "44100", "-ac", "2", "-codec:a", "libmp3lame", "-b:a", "128k",
                str(VOICE / f"{vid}.mp3"),
            ], check=True)
        print("voice", vid)


if __name__ == "__main__":
    build_all()
    build_voices()

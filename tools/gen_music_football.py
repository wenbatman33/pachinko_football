"""《PK大逆转》足球版配樂：國際足球賽事「球場看台」的風格——快節奏、熱血（2026-11-12 使用者：「音樂要偏向國際足球賽事的音樂」）。
全部是原創旋律，不沿用任何現有賽事主題曲、國歌或球迷歌曲的旋律。用本機 ACE-Step 1.5 依序作曲。

用法（在專案根目錄）：
  /Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5/.venv/bin/python tools/gen_music_football.py --force
  ... tools/gen_music_football.py --force --only bgm_reach      # 只產指定曲
輸出檔名沿用遊戲現在在用的檔名（程式不用改），棒球版的原檔備份在 _backup/2026-11-12_baseball/audio/bgm/。
"""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
ENGINE = Path("/Users/batman_work/claude/棒球應援團/tools/ACE-Step-1.5")
sys.path.insert(0, str(ENGINE))
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")
os.environ.setdefault("ACESTEP_LM_BACKEND", "mlx")
os.environ.setdefault("ACESTEP_MLX_VAE_FP16", "1")
os.environ.setdefault("ACESTEP_MLX_VAE_CHUNK", "192")

OUT = ROOT / "assets" / "audio" / "bgm"
RAW = ROOT / "art_src" / "music_raw_football"

# 2026-11-12 第二版。第一版做成莊嚴的管弦主題曲（126 BPM），使用者：「根本不熱血、也不節奏感，玩遊戲跟辦喪事一樣」。
# 這一版全部拉到 160 BPM 以上、從第一拍就全力：球場看台的齊唱口號＋森巴鼓＋銅管＋搖滾吉他。不要再做慢的、莊嚴的。
COMMON = (
    " Maximum energy from the very first beat, no slow intro, no calm section, no long ending."
    " Original melody. Loud, polished, punchy modern mix like a hit football stadium anthem."
)

# 看台齊唱（沒有主唱，幾萬人一起喊）
# 看台齊唱（沒有主唱，幾萬人一起喊）。2026-11-12 使用者：「音樂應該多使用 goal goal goal」→ 每一句的結尾都是全場齊喊 Goal! Goal! Goal!
CHANT = """[Chorus - crowd chant, gang vocals]
Oh oh oh oh oh
Oh oh oh oh oh
Goal! Goal! Goal!
Goal! Goal! Goal!

[Chorus - crowd chant, gang vocals]
Oh oh oh oh oh
Olé olé olé olé
Goal! Goal! Goal!
Goal! Goal! Goal!

[Chorus - crowd chant, gang vocals]
Oh oh oh oh oh
Oh oh oh oh oh
Goal! Goal! Goal!
Goal! Goal! Goal!

[Chorus - crowd chant, gang vocals]
Oh oh oh oh oh
Olé olé olé olé
Goal! Goal! Goal!
Goal! Goal! Goal!
"""

# (檔名, 秒數, BPM, 調性, 風格描述, 種子, 歌詞或 None)
TRACKS = [
    # 平常時：看台上的助威歌——快、緊、一直往前衝
    ("bgm_cheer_m", 120, 176, "E minor",
     "Fast, tight, relentless football terrace chant anthem: massive stadium crowd gang vocals, tens of thousands of fans "
     "singing one short catchy minor-key melody on 'oh' over and over and shouting 'Goal! Goal! Goal!' together at the end of each phrase, "
     "no solo singer, no lead vocal. Pounding bass drum on every beat, rapid samba snare and surdo rolls, referee whistles, "
     "a unison brass section blasting the same melody, distorted rock guitar power chords and a driving bass line. "
     "Hot-blooded, loud, raw live stadium energy.", 811, CHANT),
    # 聽牌：2026-11-12 第三版。160 BPM 那版使用者說「不夠激情，應該更緊湊」→ 184 BPM、雙倍速鼓、十六分音符貝斯，從頭到尾不留空檔
    ("bgm_reach", 60, 184, "A minor",
     "Relentless, breathless, high-speed football showdown music: double-time punk drums with constant 16th-note hi-hats and "
     "rapid snare fills, galloping 16th-note bass, razor-sharp staccato string ostinato, aggressive palm-muted distorted guitar "
     "riff, stabbing brass hits on every bar, fast stadium hand claps and whistles, rising chromatic tension that never drops, "
     "no breakdown, no pause, heart-pounding last-chance attack in a hot-blooded sports anime.", 822, None),
    # 補時絕殺：最後一次進攻
    ("bgm_spsp", 60, 172, "C minor",
     "Epic climactic orchestral rock for the last attack in stoppage time: thunderous double-time drums, screaming distorted "
     "guitars, soaring heroic brass and strings, huge choir pads, racing bass, extreme tension and hope, the final climax "
     "of a hot-blooded football anime.", 813, None),
    # 大獎回合：進球後整座球場炸開
    ("bgm_bonus_v3", 120, 184, "E minor",
     "Hot-blooded shonen sports anime battle music at full throttle from the first beat: screaming heavy metal guitars, "
     "double-bass blast drums, roaring brass section stabs, driving 16th-note bass, orchestral hits, a stadium crowd shouting "
     "'Goal! Goal! Goal!' on the beat, fierce burning fighting spirit like the winning goal celebration of a football final. "
     "No calm parts, relentless maximum intensity, loopable.", 814, CHANT),
    ("jingle_bigwin_v3", 12, 160, "C major",
     "Short explosive rock and brass fanfare jingle announcing a goal: snare roll, screaming guitar slide, cymbal crash, "
     "stadium crowd roar, huge triumphant final chord, wild and celebratory.", 815, None),
    ("jingle_rush", 12, 170, "D major",
     "Short epic rock and orchestra fanfare jingle announcing a winning streak: rising guitar slide, rapid drum fill, "
     "huge final hit with brass and crowd shout, exhilarating.", 816, None),
    ("jingle_end", 10, 130, "G major",
     "Short upbeat proud brass and guitar closing jingle, a satisfying full-time-whistle ending cadence, bright and confident.", 817, None),
    # 定案（2026-11-12）：使用者最後選了 cand_d_hardcore_190「高速電子狂歡版」當平常曲（先選過 cand_b_edm_180，嫌不夠激情、前奏太長），成品已複製成 assets/audio/bgm/bgm_cheer_m.mp3。
    # 重跑這支腳本時不要用上面那個 bgm_cheer_m 的設定蓋掉它（要重做請跑 cand_d_hardcore_190 再複製過去）。
    # ── 平常曲的候選版本（2026-11-12 使用者：「還不錯，但可以更激情一點，加速玩家想玩的意願」）。挑中的再複製成 bgm_cheer_m.mp3 ──
    ("cand_a_rock_192", 120, 192, "E minor",
     "Explosive, unstoppable football stadium rock anthem at breakneck speed: tens of thousands of fans chanting a short catchy "
     "minor-key hook on 'oh' and screaming 'Goal! Goal! Goal!' together at the end of every phrase, no solo singer. Thundering "
     "double-kick drums, galloping bass, screaming distorted guitar riff doubling the chant melody, blasting brass section, "
     "samba snare rolls and whistles, a key change lifting the last chorus even higher. Adrenaline, euphoria, raw live stadium power.", 831, CHANT),
    ("cand_b_edm_180", 120, 180, "E minor",
     "Massive festival stadium football anthem that makes you want to jump: pounding four-on-the-floor kick drum, huge sidechained "
     "supersaw synth chords, snare-roll risers building into explosive drops, tens of thousands of fans chanting a short catchy hook "
     "on 'oh' and shouting 'Goal! Goal! Goal!' on every drop, no solo singer. Bright brass stabs, hand claps on every beat, "
     "driving bass, whistles and crowd roar. Hype, euphoric, addictive, energy rising higher and higher.", 832, CHANT),
    # ── 第二批候選（2026-11-12 使用者聽完 B 版：「還是不夠激情」「前奏鋪陳太久」）：第一秒就是最高潮、全程不收 ──
    ("cand_c_hardrock_198", 120, 198, "E minor",
     "Insanely energetic football stadium anthem, speed metal meets terrace chant: blazing double-kick drums, shredding distorted "
     "guitars playing a heroic hook, roaring brass section, tens of thousands of fans screaming a short catchy hook on 'oh' and "
     "'Goal! Goal! Goal!' non-stop, no solo singer, constant crowd roar, whistles, sirens. Pure adrenaline and euphoria." + ' The track begins instantly on the full chorus at maximum intensity from the very first second: no intro, no build-up, no riser, no breakdown, no quiet part anywhere, every bar is the peak.', 841, CHANT),
    ("cand_d_hardcore_190", 120, 190, "A minor",
     "Euphoric high-speed happy hardcore and festival EDM football anthem: relentless pounding kick drum on every beat, screaming "
     "supersaw lead melody, fast offbeat bass, huge crowd of fans chanting 'oh oh oh' and shouting 'Goal! Goal! Goal!' in unison "
     "all the way through, no solo singer, hand claps, air horns, whistles, brass stabs. Hyperactive, addictive, makes you want to "
     "jump and keep playing." + ' The track begins instantly on the full chorus at maximum intensity from the very first second: no intro, no build-up, no riser, no breakdown, no quiet part anywhere, every bar is the peak.', 842, CHANT),
    ("cand_e_samba_192", 120, 192, "D minor",
     "Wild carnival football stadium anthem: a thundering samba batucada drum corps (surdo, repinique, snare, agogo, whistles) at "
     "furious speed, blasting trumpet and trombone section playing a fiery hook, electric bass and rock guitar driving underneath, "
     "tens of thousands of fans chanting 'oh oh oh' and 'Goal! Goal! Goal!' together non-stop, no solo singer. Burning hot, "
     "ecstatic, unstoppable party energy." + ' The track begins instantly on the full chorus at maximum intensity from the very first second: no intro, no build-up, no riser, no breakdown, no quiet part anywhere, every bar is the peak.', 843, CHANT),
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--only", nargs="*", default=[])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    todo = [t for t in TRACKS if (not args.only or t[0] in args.only)
            and (args.force or not (OUT / f"{t[0]}.mp3").exists())]
    if not todo:
        print("全部已存在，無需產生", flush=True)
        return

    import mlx.core as mx
    from acestep.handler import AceStepHandler
    from acestep.llm_inference import LLMHandler
    from acestep.inference import GenerationConfig, GenerationParams, generate_music

    mx.set_cache_limit(256 * 1024 * 1024)
    handler = AceStepHandler()
    status, ok = handler.initialize_service(
        project_root=str(ENGINE), config_path="acestep-v15-turbo",
        device="mps", compile_model=False, prefer_source="huggingface", use_mlx_dit=True,
    )
    print(status, flush=True)
    if not ok:
        raise RuntimeError(status)
    if handler.use_mlx_vae:
        # 共享記憶體筆電避免大型編譯 VAE 圖
        handler._mlx_compiled_decode = handler.mlx_vae.decode
    lm = LLMHandler()

    OUT.mkdir(parents=True, exist_ok=True)
    meta = {}
    for tid, dur, bpm, key, style, seed, lyrics in todo:
        started = time.monotonic()
        caption = f"{style} Constant {bpm} BPM, 4/4, {key}.{COMMON}"
        params = GenerationParams(
            caption=caption, lyrics=lyrics or "[Instrumental]", instrumental=not lyrics, vocal_language="en" if lyrics else "unknown",
            bpm=bpm, keyscale=key, timesignature="4", duration=dur,
            inference_steps=8, seed=seed, thinking=False,
            use_cot_caption=False, use_cot_metas=False, use_cot_language=False,
            fade_out_duration=0.3 if dur > 20 else 0.8,
        )
        print(f"START {tid} ({dur}s)", flush=True)
        save = RAW / tid
        save.mkdir(parents=True, exist_ok=True)
        result = generate_music(handler, lm, params, GenerationConfig(
            batch_size=1, audio_format="wav", use_random_seed=False, seeds=[seed],
        ), save_dir=str(save))
        if not result.success or not result.audios:
            print(f"FAIL {tid}: {result.error or result.status_message}", flush=True)
            continue
        wav = save / f"{tid}.wav"
        shutil.copy2(result.audios[0]["path"], wav)
        subprocess.run([
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav),
            "-ac", "2", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "192k",
            str(OUT / f"{tid}.mp3"),
        ], check=True)
        meta[tid] = {"bpm": bpm, "key": key, "seed": seed, "duration": dur, "caption": caption,
                     "elapsed": round(time.monotonic() - started, 1)}
        (RAW / f"{tid}.json").write_text(json.dumps(meta[tid], ensure_ascii=False, indent=2), encoding="utf-8")
        mx.clear_cache()
        print(f"DONE {tid} {meta[tid]['elapsed']}s", flush=True)
    print("ALL DONE", flush=True)


if __name__ == "__main__":
    main()

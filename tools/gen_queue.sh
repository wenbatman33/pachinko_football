#!/bin/bash
# 《PK大逆转》生圖排隊：一次只跑一份清單（每份清單內同時最多兩張），照順序跑完。已存在的圖會跳過，可中斷後重跑。
cd "$(dirname "$0")/.."
run() { echo "[$(date +%H:%M:%S)] 開始 $1"; node tools/gen_manga.mjs --manifest "$1" --workers 2 $3 > "tools/gen_$2.out" 2>&1; echo "[$(date +%H:%M:%S)] 結束 $1：$(tail -1 tools/gen_$2.out)"; }
# 第一話換新球衣要重畫的格子（舊圖備份在 _backup/2026-11-12_plain_kit/ch01/）；跑完留一個記號檔，重跑排隊時不會再畫一次
[ -f tools/.ch01_kit_done ] || { run manga/data/ch01.json ch01_kit "--force --only p01 p02 p07 p08 p09 p13 p30 p31 p32 p33 p34 p35 p36 p37 p38 p40 p41 p42 p45 p47 p48 p49 p50 p51 p52 p53 p55 p56 p58" && touch tools/.ch01_kit_done; }
run tools/manifest_football.json machine
run tools/manifest_duel_football.json duel
for n in 02 03 04 05; do run manga/data/ch$n.json ch$n; done
echo "[$(date +%H:%M:%S)] 全部排隊項目結束"

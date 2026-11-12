#!/bin/bash
# 接手排隊（2026-11-12）：機台素材提前先跑（使用者：「大獎還是棒球元素」）；等機台素材與第一話換球衣都結束後，再依序跑對決素材與第二到五話。
cd "$(dirname "$0")/.."
run() { echo "[$(date +%H:%M:%S)] 開始 $1"; node tools/gen_manga.mjs --manifest "$1" --workers 2 > "tools/gen_$2.out" 2>&1; echo "[$(date +%H:%M:%S)] 結束 $1：$(tail -1 tools/gen_$2.out)"; }
until grep -q "=== 完成" tools/gen_machine.out 2>/dev/null && grep -q "=== 完成" tools/gen_ch01_kit.out 2>/dev/null; do sleep 20; done
touch tools/.ch01_kit_done
run tools/manifest_duel_football.json duel
for n in 02 03 04 05; do run manga/data/ch$n.json ch$n; done
echo "[$(date +%H:%M:%S)] 全部排隊項目結束"

#!/bin/bash
# 《PK大逆转》漫畫生圖排隊。一定要用 caffeinate 包起來跑（防止電腦睡眠，睡著網路會斷、整批逾時）：
#   caffeinate -is bash tools/gen_queue.sh A      # 第一條線：重畫清單（tools/redo_ids.json）裡第二、三、五話的格子，再把第五話畫完
#   caffeinate -is bash tools/gen_queue.sh B      # 第二條線：第四話（先重畫清單裡的，再畫完）
# 已存在的圖會跳過，可中斷後重跑；每話跑完會再補跑一輪失敗的格子。
cd "$(dirname "$0")/.."
ids() { python3 -c "import json;print(' '.join(json.load(open('tools/redo_ids.json')).get('$1',[])))"; }
redo() { local l="$(ids $1)"; [ -z "$l" ] && return; [ -f tools/.redo_$1 ] && return; echo "[$(date +%H:%M:%S)] 重畫 $1：$l"; node tools/gen_manga.mjs --manifest manga/data/$1.json --workers 3 --force --only $l > tools/gen_$1_redo.out 2>&1 && touch tools/.redo_$1; echo "[$(date +%H:%M:%S)] $(tail -1 tools/gen_$1_redo.out)"; }
full() { for t in 1 2; do echo "[$(date +%H:%M:%S)] 畫 $1（第 $t 輪）"; node tools/gen_manga.mjs --manifest manga/data/$1.json --workers 3 > tools/gen_$1.out 2>&1; echo "[$(date +%H:%M:%S)] $(tail -1 tools/gen_$1.out)"; done; }
if [ "$1" = "A" ]; then redo ch02; redo ch03; redo ch05; full ch05; else redo ch04; full ch04; fi
echo "[$(date +%H:%M:%S)] 這條線結束"

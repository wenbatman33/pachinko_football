#!/usr/bin/env node
/**
 * 漫畫《PK大逆转》批次生圖（透過 codex exec 內建 image_gen）
 *
 * 用法：
 *   node tools/gen_manga.mjs --manifest manga/manifest_samples.json            # 全跑（已存在的跳過）
 *   node tools/gen_manga.mjs --manifest manga/manifest_ch01.json --only p01     # 只跑指定 id（可多個）
 *   --workers 2：同時跑幾個 codex（預設 2，最多 3）　--force：覆蓋重產
 *
 * manifest 格式：{ out: "manga/raw/xxx", style: "整體畫風", items: [{ id, size, prompt, style?, ref?[] }] }
 * item.style 可覆蓋整體畫風；item.ref 引用的圖（相對專案根目錄）要等它產好才會開始。
 *
 * 依賴：item.ref 裡若引用 art_src/raw/ 的圖，要等那張產好才會開始。
 * 任何結束路徑（完成、逾時、例外、Ctrl+C）都會殺掉 codex 子程序群組。
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG = path.join(ROOT, "tools/gen_manga.log");
const TIMEOUT_MS = 8 * 60 * 1000;
// 你 ~/.codex/config.toml 的預設 gpt-5.5 已不支援 ChatGPT 帳號，這裡明確指定
const MODEL = process.env.CODEX_MODEL || "gpt-6.1-sol";

const args = process.argv.slice(2);
const mi = args.indexOf("--manifest");
if (mi < 0 || !args[mi + 1]) { console.error("請用 --manifest 指定 manifest 檔"); process.exit(1); }
const manifest = JSON.parse(readFileSync(path.resolve(ROOT, args[mi + 1]), "utf-8"));
const RAW = path.resolve(ROOT, manifest.out);
const only = new Set();
let workers = 2;
let force = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--only") { while (args[i + 1] && !args[i + 1].startsWith("--")) only.add(args[++i]); }
  else if (args[i] === "--workers") workers = Math.max(1, Math.min(3, parseInt(args[++i], 10) || 2));
  else if (args[i] === "--force") force = true;
  else if (args[i] === "--manifest") i++;
}

mkdirSync(RAW, { recursive: true });
const log = (m) => { const line = `[${new Date().toISOString().slice(11, 19)}] ${m}`; console.log(line); appendFileSync(LOG, line + "\n"); };

const outOf = (it) => path.join(RAW, `${it.id}.png`);
const pending = manifest.items.filter((it) => (!only.size || only.has(it.id)) && (force || !existsSync(outOf(it))));
const running = new Set(); // 正在跑的子程序（用來保證清理）

function killAll() {
  for (const cp of running) { try { process.kill(-cp.pid, "SIGKILL"); } catch {} }
  running.clear();
}
process.on("exit", killAll);
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { log(`收到 ${sig}，清理子程序`); killAll(); process.exit(1); });
process.on("uncaughtException", (e) => { log(`例外：${e.message}`); killAll(); process.exit(1); });
process.on("unhandledRejection", (e) => { log(`未處理 rejection：${e}`); killAll(); process.exit(1); });

function buildPrompt(it) {
  const [w, h] = it.size.split("x").map(Number);
  const refs = (it.ref || []).map((r) => path.join(ROOT, r));
  const refNote = it.refNote || (refs.length   // item.refNote 可以自己說明每張附圖的用途
    ? "附加的圖是角色設計參考：圖中出現的角色請保持完全相同的臉型、髮型、髮色、服裝與配色；其他內容依本張描述重新構圖。"
    : "");
  return [
    "請用你內建的 image_gen 工具產生一張圖片（只要一張）。",
    `整體美術風格：${it.style || manifest.style}`,
    `共同規則：${manifest.rules || ""}`,
    `本張內容：${it.prompt}`,
    refNote,
    `完成後把產出的 PNG 複製到絕對路徑 ${outOf(it)}，再執行 sips -z ${h} ${w} 把它調整成 ${w}x${h}。`,
    "不要建立或修改其他任何檔案。完成後只回報 OK。",
  ].filter(Boolean).join("\n\n");
}

function runOne(it) {
  return new Promise((resolve) => {
    const refs = (it.ref || []).map((r) => path.join(ROOT, r));
    const argv = ["exec", "--skip-git-repo-check", "-m", MODEL, "-s", "workspace-write", "-C", ROOT];
    for (const r of refs) argv.push("--image", r);
    const cp = spawn("codex", argv, { cwd: ROOT, detached: true, stdio: ["pipe", "ignore", "ignore"] });
    running.add(cp);
    cp.stdin.end(buildPrompt(it));
    const timer = setTimeout(() => { log(`⏱  ${it.id} 逾時，終止`); try { process.kill(-cp.pid, "SIGKILL"); } catch {} }, TIMEOUT_MS);
    cp.on("exit", (code) => { clearTimeout(timer); running.delete(cp); resolve(code); });
    cp.on("error", (e) => { clearTimeout(timer); running.delete(cp); log(`✗ ${it.id} spawn 失敗 ${e.message}`); resolve(-1); });
  });
}

const refsReady = (it) => (it.ref || []).every((r) => existsSync(path.join(ROOT, r)));
let ok = 0, fail = 0;
const total = pending.length;
log(`=== 開始 ${total} 張，workers=${workers} ===`);

async function worker(wid) {
  for (;;) {
    const idx = pending.findIndex(refsReady);
    if (idx === -1) {
      if (!pending.length) return;
      if (running.size === 0) { // 沒有人在跑又沒有可跑的 → 依賴缺失
        for (const it of pending.splice(0)) { log(`✗ ${it.id} 缺參考圖 ${it.ref}`); fail++; }
        return;
      }
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    const it = pending.splice(idx, 1)[0];
    const t0 = Date.now();
    log(`▶ w${wid} ${it.id} (${it.size})`);
    await runOne(it);
    const dt = ((Date.now() - t0) / 1000).toFixed(0);
    if (existsSync(outOf(it))) { ok++; log(`✓ ${it.id} ${dt}s  [${ok + fail}/${total}]`); }
    else { fail++; log(`✗ ${it.id} ${dt}s 沒有產出檔案  [${ok + fail}/${total}]`); }
  }
}

await Promise.all(Array.from({ length: workers }, (_, i) => worker(i + 1)));
log(`=== 完成 ok=${ok} fail=${fail} ===`);

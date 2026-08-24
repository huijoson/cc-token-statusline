#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

const USAGE_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
];

// Field keys accepted by --show/--hide, in render order.
const ALL_FIELDS = ["ctx", "wk", "cwd", "in", "out", "th", "cr", "cw", "tot"];
const DEFAULT_VISIBLE_FIELDS = new Set(ALL_FIELDS);

function parseFieldList(str) {
  return str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

// --show=a,b whitelists fields (unknown keys ignored); --hide=c,d then
// removes from whatever's currently visible. Composable: --show narrows
// the default set, --hide always subtracts from it afterward.
function resolveVisibleFields(argv) {
  let visible = new Set(ALL_FIELDS);

  const showArg = argv.find((a) => a.startsWith("--show="));
  if (showArg) {
    const requested = parseFieldList(showArg.slice("--show=".length));
    visible = new Set(requested.filter((f) => ALL_FIELDS.includes(f)));
  }

  const hideArg = argv.find((a) => a.startsWith("--hide="));
  if (hideArg) {
    for (const f of parseFieldList(hideArg.slice("--hide=".length))) {
      visible.delete(f);
    }
  }

  return visible;
}

function clampPercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.trunc(n));
}

// Claude Code can write more than one JSONL line per API response (e.g. one
// per content block), each repeating the same `message.usage`, so entries
// are de-duplicated by `message.id` before summing.
function aggregateTranscriptUsage(transcriptPath) {
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  totals.thinking_tokens = 0;
  if (!transcriptPath || typeof transcriptPath !== "string") return totals;

  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return totals;
  }

  return sumUsageLines(raw, totals);
}

function sumUsageLines(raw, totals) {
  const seenIds = new Set();
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    let entry;
    try {
      entry = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (!entry || entry.type !== "assistant") continue;

    const message = entry.message;
    if (!message || typeof message !== "object") continue;

    const messageId = message.id;
    const usage = message.usage;
    if (!messageId || !usage || typeof usage !== "object") continue;
    if (seenIds.has(messageId)) continue;
    seenIds.add(messageId);

    for (const field of USAGE_FIELDS) {
      const value = usage[field];
      if (typeof value === "number" && Number.isFinite(value)) {
        totals[field] += value;
      }
    }

    // thinking_tokens is a breakdown of output_tokens, not additional to
    // it — don't fold this into `tot`, it would double-count.
    const thinking = usage.output_tokens_details?.thinking_tokens;
    if (typeof thinking === "number" && Number.isFinite(thinking)) {
      totals.thinking_tokens += thinking;
    }
  }
  return totals;
}

function renderContext(data, visible = DEFAULT_VISIBLE_FIELDS) {
  if (!visible.has("ctx")) return null;
  const pct = clampPercentage(data?.context_window?.used_percentage);
  if (pct === null) return `${CYAN}ctx n/a${RESET}`;
  const color = pct >= 82 ? RED : pct >= 75 ? YELLOW : GREEN;
  return `${color}ctx${RESET} ${pct}%`;
}

function renderWeeklyLimit(data, visible = DEFAULT_VISIBLE_FIELDS) {
  if (!visible.has("wk")) return null;
  const sevenDay = data?.rate_limits?.seven_day;
  if (!sevenDay || typeof sevenDay !== "object") {
    return `${CYAN}wk n/a${RESET}`;
  }

  const used = clampPercentage(sevenDay.used_percentage);
  if (used === null) return `${CYAN}wk n/a${RESET}`;
  const remaining = 100 - used;

  let resetSuffix = "";
  const resetsAt = sevenDay.resets_at;
  if (typeof resetsAt === "number" && Number.isFinite(resetsAt)) {
    const date = new Date(resetsAt * 1000);
    if (!Number.isNaN(date.getTime())) {
      const mm = String(date.getMonth() + 1).padStart(2, "0");
      const dd = String(date.getDate()).padStart(2, "0");
      resetSuffix = ` (resets ${mm}/${dd})`;
    }
  }

  const color = remaining >= 50 ? GREEN : remaining >= 20 ? YELLOW : RED;
  return `${color}wk ${remaining}% left${RESET}${resetSuffix}`;
}

// Basename of the live shell cwd (reflects /add-dir overrides), not the
// project root — a deliberate choice over data.workspace.project_dir.
function renderCwd(data, visible = DEFAULT_VISIBLE_FIELDS) {
  if (!visible.has("cwd")) return null;
  const cwd = data?.cwd;
  if (!cwd || typeof cwd !== "string") return null;
  return path.basename(cwd) || cwd;
}

function renderUsageLine(data, visible = DEFAULT_VISIBLE_FIELDS) {
  const totals = aggregateTranscriptUsage(data?.transcript_path);
  const total =
    totals.input_tokens +
    totals.output_tokens +
    totals.cache_read_input_tokens +
    totals.cache_creation_input_tokens;

  const parts = [];
  if (visible.has("in")) parts.push(`in ${formatTokens(totals.input_tokens)}`);
  if (visible.has("out")) parts.push(`out ${formatTokens(totals.output_tokens)}`);
  if (visible.has("th")) parts.push(`th ${formatTokens(totals.thinking_tokens)}`);
  if (visible.has("cr")) parts.push(`cr ${formatTokens(totals.cache_read_input_tokens)}`);
  if (visible.has("cw")) parts.push(`cw ${formatTokens(totals.cache_creation_input_tokens)}`);
  if (visible.has("tot")) parts.push(`tot ${formatTokens(total)}`);

  return parts.length ? parts.join(" ") : null;
}

function render(data, visible = DEFAULT_VISIBLE_FIELDS) {
  const segments = [
    renderContext(data, visible),
    renderWeeklyLimit(data, visible),
    renderCwd(data, visible),
    renderUsageLine(data, visible),
  ].filter((s) => s !== null && s !== undefined && s !== "");
  return segments.join(" | ");
}

function readStdin() {
  try {
    return fs.readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function main() {
  let data = {};
  try {
    const parsed = JSON.parse(readStdin());
    if (parsed && typeof parsed === "object") data = parsed;
  } catch {
    // fall through with data = {}; render() degrades to "n/a" segments
  }

  const visible = resolveVisibleFields(process.argv.slice(2));
  process.stdout.write(render(data, visible) + "\n");
}

if (require.main === module) {
  main();
}

module.exports = {
  ALL_FIELDS,
  DEFAULT_VISIBLE_FIELDS,
  clampPercentage,
  formatTokens,
  aggregateTranscriptUsage,
  resolveVisibleFields,
  renderContext,
  renderWeeklyLimit,
  renderCwd,
  renderUsageLine,
  render,
};

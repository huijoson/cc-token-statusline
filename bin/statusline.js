#!/usr/bin/env node
"use strict";

const fs = require("fs");

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
  }
  return totals;
}

function renderContext(data) {
  const pct = clampPercentage(data?.context_window?.used_percentage);
  if (pct === null) return `${CYAN}[CONTEXT] n/a${RESET}`;
  const color = pct >= 82 ? RED : pct >= 75 ? YELLOW : GREEN;
  return `${color}[CONTEXT]${RESET} ${pct}%`;
}

function renderWeeklyLimit(data) {
  const sevenDay = data?.rate_limits?.seven_day;
  if (!sevenDay || typeof sevenDay !== "object") {
    return `${CYAN}Wk n/a${RESET}`;
  }

  const used = clampPercentage(sevenDay.used_percentage);
  if (used === null) return `${CYAN}Wk n/a${RESET}`;
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
  return `${color}Wk ${remaining}% left${RESET}${resetSuffix}`;
}

function renderUsageLine(data) {
  const totals = aggregateTranscriptUsage(data?.transcript_path);
  const total =
    totals.input_tokens +
    totals.output_tokens +
    totals.cache_read_input_tokens +
    totals.cache_creation_input_tokens;

  return (
    `In ${formatTokens(totals.input_tokens)} ` +
    `Out ${formatTokens(totals.output_tokens)} ` +
    `CacheRead ${formatTokens(totals.cache_read_input_tokens)} ` +
    `CacheWrite ${formatTokens(totals.cache_creation_input_tokens)} ` +
    `Total ${formatTokens(total)}`
  );
}

function render(data) {
  return `${renderContext(data)} | ${renderWeeklyLimit(data)} | ${renderUsageLine(data)}`;
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

  process.stdout.write(render(data) + "\n");
}

if (require.main === module) {
  main();
}

module.exports = {
  clampPercentage,
  formatTokens,
  aggregateTranscriptUsage,
  renderContext,
  renderWeeklyLimit,
  renderUsageLine,
  render,
};

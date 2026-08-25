"use strict";

const fs = require("fs");

const USAGE_FIELDS = [
  "input_tokens",
  "output_tokens",
  "cache_read_input_tokens",
  "cache_creation_input_tokens",
];

// Cumulative usage across a whole conversation. This cannot be read from the
// Payload: `context_window.total_input_tokens` is current occupancy, not a
// running total, so the transcript is the only source for it.
//
// Claude Code can write more than one JSONL line per API response, each
// repeating the same `message.usage`, so entries are de-duplicated by
// `message.id` before summing.
function sumUsageLines(raw) {
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  totals.thinking_tokens = 0;

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
      if (typeof value === "number" && Number.isFinite(value)) totals[field] += value;
    }

    // thinking_tokens is a breakdown of output_tokens, not additional to it —
    // folding it into the total would double-count.
    const thinking = usage.output_tokens_details?.thinking_tokens;
    if (typeof thinking === "number" && Number.isFinite(thinking)) {
      totals.thinking_tokens += thinking;
    }
  }
  return totals;
}

function emptyTotals() {
  const totals = Object.fromEntries(USAGE_FIELDS.map((field) => [field, 0]));
  totals.thinking_tokens = 0;
  return totals;
}

// Returns null when there is no transcript to read, and zeros when there is one
// that happens to contain no usage yet. Those are different facts: a
// conversation that has genuinely used 0 tokens should print `in 0`, while a
// Payload that carries no transcript at all has nothing to say and its token
// Fields are Missing.
function readClaudeTranscript(transcriptPath) {
  if (!transcriptPath || typeof transcriptPath !== "string") return null;
  let raw;
  try {
    raw = fs.readFileSync(transcriptPath, "utf8");
  } catch {
    return null;
  }
  return sumUsageLines(raw);
}

module.exports = { readClaudeTranscript, sumUsageLines, emptyTotals, USAGE_FIELDS };

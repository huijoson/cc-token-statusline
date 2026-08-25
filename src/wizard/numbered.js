"use strict";

const readline = require("readline");
const { buildFormat } = require("../templates.js");
const { catalogueRows, renderRow } = require("../catalogue.js");

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// The fallback for terminals where raw mode is unavailable — including the one
// that matters most in practice: a user running `agentline edit` from inside an
// agent CLI, which is a TUI already. Typing an order is not a downgrade of
// selection-plus-reorder; it *is* selection and order in one input.
function fieldTable(host, resolver) {
  return catalogueRows(host, resolver);
}

function renderTable(rows, host, width = process.stdout.columns || 100) {
  const lines = [];
  let group = null;
  rows.forEach((row, index) => {
    if (row.group !== group) {
      group = row.group;
      lines.push(`  ${DIM}${group}${RESET}`);
    }
    lines.push(renderRow(row, host, { width, prefix: String(index + 1).padStart(3) + " ", marker: " " }));
  });
  return lines.join("\n");
}

function parseSelection(input, rows) {
  const keys = [];
  for (const token of input.split(/[,\s]+/)) {
    if (!token) continue;
    const index = Number(token);
    if (!Number.isInteger(index) || index < 1 || index > rows.length) continue;
    keys.push(rows[index - 1].key);
  }
  return keys;
}

// Attaching Fields are folded in automatically: `effort` modifies `model` and
// `7d_reset` modifies `7d`, so asking someone to number them separately would
// be asking about an implementation detail.
function withAttachments(keys) {
  const out = [];
  for (const key of keys) {
    out.push(key);
    for (const [candidate, field] of Object.entries(require("../fields.js").FIELDS)) {
      if (field.attach && field.attach.to === key && !keys.includes(candidate)) out.push(candidate);
    }
  }
  return out;
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

async function run({ host, resolver }) {
  const rows = fieldTable(host, resolver);
  process.stdout.write(`\nFields available on ${host.name}:\n\n${renderTable(rows, host)}\n\n`);
  const answer = await ask("Enter numbers in display order (e.g. 1,3,4,10): ");
  const keys = withAttachments(parseSelection(answer, rows));
  if (keys.length === 0) return null;
  return buildFormat(keys);
}

module.exports = { run, fieldTable, renderTable, parseSelection, withAttachments, ask };

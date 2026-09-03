"use strict";

const { getField } = require("./fields.js");
const { catalogueOrder } = require("./templates.js");
const { displayWidth, truncateToWidth } = require("./width.js");

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// Three states, and they must not be confused with one another:
//
//   supported + has a value  -> show the value
//   supported + no value now -> say when it appears; the CLI does have it
//   not supported            -> say so; this CLI cannot ever supply it
//
// Collapsing the middle case into the third tells someone their CLI lacks a
// feature it actually has, which is worse than saying nothing.
function hostSupports(host, key) {
  const field = getField(key);
  if (!field) return false;
  if (typeof host.extract?.[key] === "function") return true;
  // A derived Field is supplied by other Fields, so no Host supplies it and
  // every Host supports it. What it derives *from* may well be Missing here —
  // that is the middle state, and `when` is where it gets explained.
  if (field.source === "derived") return true;
  return field.source === "transcript" && Boolean(host.transcript?.map?.[key]);
}

function catalogueRows(host, resolver, { includeAttached = false } = {}) {
  const rows = [];
  for (const key of catalogueOrder()) {
    const field = getField(key);
    if (field.attach && !includeAttached) continue;
    rows.push({
      key,
      field,
      group: field.group,
      supported: hostSupports(host, key),
      value: resolver.get(key),
    });
  }
  return rows;
}

// The value column stays a value column. A Field with nothing to show right
// now gets a placeholder there, and the *reason* goes in the meaning column
// where there is room for a sentence — otherwise a long condition shunts every
// description out of alignment and the table stops being scannable.
function status(row, host) {
  if (!row.supported) return { text: "n/a", note: `not available on ${host.name}` };
  if (row.value === undefined) return { text: "—", note: row.field.when ? `only ${row.field.when}` : "not set here" };
  return { text: row.value, note: row.field.when ? `only ${row.field.when}` : null };
}

// One row: key, value (or why there isn't one), then what the Field means.
// The meaning is what gets truncated when space runs out — it is the most
// useful column and also the most compressible.
function renderRow(row, host, { width = 80, prefix = "  ", marker = "  ", note = null } = {}) {
  const keyText = `{${row.key}}`;
  const state = status(row, host);
  const shown = row.value === undefined || !row.supported ? `${DIM}${state.text}${RESET}` : state.text;

  const keyCol = 18;
  const valueCol = 16;
  const keyPad = " ".repeat(Math.max(1, keyCol - displayWidth(keyText)));
  const valuePad = " ".repeat(Math.max(1, valueCol - displayWidth(state.text)));

  const used = displayWidth(prefix) + displayWidth(marker) + keyCol + valueCol;
  const room = Math.max(12, width - used - 1);
  // Extra notes are folded in before truncating, so a caller cannot push the
  // row past the terminal edge by appending to it afterwards.
  const meaning = truncateToWidth(
    row.field.desc + (state.note ? ` · ${state.note}` : "") + (note ? ` · ${note}` : ""),
    room,
    "…"
  );

  return `${prefix}${marker}${keyText}${keyPad}${shown}${valuePad}${DIM}${meaning}${RESET}`;
}

module.exports = { hostSupports, catalogueRows, status, renderRow };

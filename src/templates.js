"use strict";

const { getField, GROUP_ORDER, FIELD_KEYS } = require("./fields.js");

// Four starting points, chosen to be visibly different from one another rather
// than variations on one line. There is deliberately no "everything" template:
// the line it produces is wider than a terminal and reads as a recommendation,
// and the need it appears to serve — "what fields exist?" — is documentation's
// job (`agentline --list-fields`), not a template's.
const TEMPLATES = [
  {
    name: "default",
    description: "model, context, weekly quota, directory, full token breakdown",
    // `quota` and `branch` are here for the CLIs that report them. On one that
    // does not, they disappear and the line is byte-identical to what it would
    // be without them — which is the whole point of Missing disappearing.
    format:
      "{model}[:{effort}]|ctx {ctx}|7d {7d} left[ (resets {7d_reset})]|" +
      "quota {quota}[ ({quota_reset})]|{branch}|{cwd}|" +
      "[in {in}] [out {out}] [th {th}] [cr {cr}] [cw {cw}] [tot {tot}]",
  },
  {
    name: "minimal",
    description: "just what you glance at",
    format: "{model}[:{effort}]|ctx {ctx}|{cwd}",
  },
  {
    name: "limits",
    description: "both quota windows, for when you are near the ceiling",
    format:
      "{model}[:{effort}]|ctx {ctx}|5h {5h}[ ({5h_reset})]|7d {7d}[ ({7d_reset})]|" +
      "quota {quota}[ ({quota_reset})]|{cwd}",
  },
  {
    name: "tokens",
    description: "conversation token accounting",
    format: "ctx {ctx}|[in {in}] [out {out}] [cr {cr}] [cw {cw}] [tot {tot}]|{cwd}",
  },
];

const DEFAULT_FORMAT = TEMPLATES[0].format;

function getTemplate(name) {
  return TEMPLATES.find((template) => template.name === name);
}

// Turn an ordered list of Field keys into a Format. Consecutive Fields sharing
// a group land in one Segment so a token breakdown reads as one run rather
// than six pipe-separated fragments; a Field with `attach` folds into the
// Segment of the Field it modifies instead of becoming its peer.
function buildFormat(keys) {
  const segments = [];
  let current = null;
  let currentGroup = null;
  const partOf = new Map();

  for (const key of keys) {
    const field = getField(key);
    if (!field) continue;

    // An attaching Field appends to the part it modifies, wherever that part
    // sits — not to the end of the Segment, which would strand "(resets ...)"
    // behind an unrelated Field.
    const target = field.attach && partOf.get(field.attach.to);
    if (target) {
      target.text += field.attach.source;
      continue;
    }

    const part = { key, text: field.label ? `${field.label} {${key}}` : `{${key}}` };
    if (current && currentGroup === field.group) {
      current.push(part);
    } else {
      current = [part];
      currentGroup = field.group;
      segments.push(current);
    }
    partOf.set(key, part);
  }

  return segments
    .map((parts) =>
      parts.length === 1 ? parts[0].text : parts.map((part) => `[${part.text}]`).join(" ")
    )
    .join("|");
}

// The order the Wizard lists Fields in, and the order --show falls back to.
function catalogueOrder() {
  return [...FIELD_KEYS].sort(
    (a, b) => GROUP_ORDER.indexOf(getField(a).group) - GROUP_ORDER.indexOf(getField(b).group)
  );
}

module.exports = { TEMPLATES, DEFAULT_FORMAT, getTemplate, buildFormat, catalogueOrder };

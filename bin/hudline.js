#!/usr/bin/env node
"use strict";

const { renderFormat } = require("../src/format.js");
const { createResolver } = require("../src/resolver.js");
const { getHost } = require("../src/hosts/index.js");
const { DEFAULT_FORMAT, buildFormat, catalogueOrder } = require("../src/templates.js");
const { getField, resolveKey } = require("../src/fields.js");

// Two programs share this entry point and have opposite lifetimes: the
// renderer is spawned several times a second and must start instantly; the
// Wizard runs once and is interactive. The Wizard is therefore behind a lazy
// require, so the renderer's hot path never loads a byte of it.

function flag(argv, name) {
  const prefix = `--${name}=`;
  const found = argv.find((arg) => arg.startsWith(prefix));
  return found === undefined ? undefined : found.slice(prefix.length);
}

function list(value) {
  return String(value).split(",").map((s) => s.trim()).filter(Boolean);
}

// --show/--hide predate the Format language. They are kept as sugar that
// compiles down to a Format, so there is exactly one rendering path.
function formatFromShowHide(argv) {
  const show = flag(argv, "show");
  const hide = flag(argv, "hide");
  if (show === undefined && hide === undefined) return undefined;

  const legacyOrder = ["ctx", "7d", "cwd", "in", "out", "th", "cr", "cw", "tot"];
  let keys = show === undefined
    ? legacyOrder
    : list(show).map(resolveKey).filter((key) => getField(key));
  if (hide !== undefined) {
    const dropped = new Set(list(hide).map(resolveKey));
    keys = keys.filter((key) => !dropped.has(key));
  }
  return buildFormat(keys);
}

function resolveFormat(argv, env) {
  return flag(argv, "format")
    ?? formatFromShowHide(argv)
    ?? env.HUDLINE_FORMAT
    ?? DEFAULT_FORMAT;
}

function readStdin() {
  try {
    return require("fs").readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

function listFields(host) {
  const { createSampleResolver } = require("../src/resolver.js");
  const { catalogueRows, renderRow } = require("../src/catalogue.js");
  const resolver = createSampleResolver(host, { colour: false });
  const width = process.stdout.columns || 100;

  const lines = [
    `Fields on ${host.name}   \x1b[2m(value shown is from a sample payload)\x1b[0m`,
    "",
  ];
  let group = null;
  for (const row of catalogueRows(host, resolver, { includeAttached: true })) {
    if (row.group !== group) {
      group = row.group;
      lines.push(`\x1b[2m${group}\x1b[0m`);
    }
    lines.push(renderRow(row, host, { width, prefix: "  ", marker: "" }));
  }
  return lines.join("\n");
}

function main(argv, env) {
  const command = argv.find((arg) => !arg.startsWith("-"));

  if (command === "init" || command === "edit") {
    return require("../src/wizard/index.js").run(command, argv, env);
  }

  const host = getHost(flag(argv, "host") ?? "claude-code");
  if (!host || !host.supported) {
    process.stdout.write(`hudline: unknown host ${flag(argv, "host")}\n`);
    return;
  }

  if (argv.includes("--list-fields")) {
    process.stdout.write(listFields(host) + "\n");
    return;
  }

  const format = resolveFormat(argv, env);

  if (argv.includes("--print-format")) {
    process.stdout.write(format + "\n");
    return;
  }

  // Empty stdin is normal — a Host may refresh before it has anything to say,
  // and the Format simply degrades to whatever it can still show. Stdin that
  // has content but is not JSON is a real fault, and the status line is the
  // only place a user would ever see it said.
  let payload = {};
  let fault = null;
  const raw = readStdin();
  if (raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed;
      else fault = "payload is not an object";
    } catch {
      fault = "payload is not valid JSON";
    }
  }
  if (fault) {
    process.stdout.write(`hudline: ${fault}\n`);
    return;
  }

  const colour = !argv.includes("--no-color") && !env.NO_COLOR;
  const resolver = createResolver(host, payload, { colour, format });
  const separator = flag(argv, "sep");
  process.stdout.write(
    renderFormat(format, resolver, { separator: separator === undefined ? " | " : separator }) + "\n"
  );
}

if (require.main === module) {
  main(process.argv.slice(2), process.env);
}

module.exports = { main, resolveFormat, formatFromShowHide };

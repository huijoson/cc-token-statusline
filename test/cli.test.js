"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const { resolveFormat, formatFromShowHide } = require("../bin/agenthud.js");
const { DEFAULT_FORMAT } = require("../src/templates.js");

const BIN = path.join(__dirname, "..", "bin", "agenthud.js");
const PAYLOAD = JSON.stringify({
  model: { display_name: "Opus 5" },
  effort: { level: "high" },
  context_window: { used_percentage: 8 },
  rate_limits: { seven_day: { used_percentage: 17, resets_at: 1787788800 } },
  cwd: "/home/you/doitservers",
});

const run = (args) =>
  execFileSync(process.execPath, [BIN, ...args], { input: PAYLOAD, encoding: "utf8" }).trim();

test("--format wins over --show, which wins over the environment", () => {
  assert.equal(resolveFormat(["--format=X", "--show=ctx"], { AGENTHUD_FORMAT: "Y" }), "X");
  assert.equal(resolveFormat(["--show=ctx"], { AGENTHUD_FORMAT: "Y" }), "ctx {ctx}");
  assert.equal(resolveFormat([], { AGENTHUD_FORMAT: "Y" }), "Y");
  assert.equal(resolveFormat([], {}), DEFAULT_FORMAT);
});

test("--show/--hide are sugar that compiles to a Format", () => {
  assert.equal(formatFromShowHide(["--show=ctx,wk"]), "ctx {ctx}|7d {7d}");
  assert.equal(formatFromShowHide(["--hide=cr,cw,th"]), "ctx {ctx}|7d {7d}|{cwd}|[in {in}] [out {out}] [tot {tot}]");
  assert.equal(formatFromShowHide(["--show=nonsense"]), "");
  assert.equal(formatFromShowHide([]), undefined);
});

test("the default line renders end to end", () => {
  // This payload names no transcript, so the token segment has nothing to
  // report and disappears rather than claiming zero.
  assert.equal(
    run(["--no-color"]),
    "Opus 5:high | ctx 8% | 7d 83% left (resets 08/27) | doitservers"
  );
});

test("NO_COLOR is honoured, since this output gets piped elsewhere", () => {
  const out = execFileSync(process.execPath, [BIN, "--format={model}|ctx {ctx}"], {
    input: PAYLOAD, encoding: "utf8", env: { ...process.env, NO_COLOR: "1" },
  }).trim();
  assert.equal(out, "Opus 5 | ctx 8%");
});

test("empty stdin is normal; stdin that is not JSON is reported in the line", () => {
  const empty = execFileSync(process.execPath, [BIN, "--no-color"], { input: "", encoding: "utf8" }).trim();
  assert.equal(empty, "");

  const junk = execFileSync(process.execPath, [BIN, "--no-color"], { input: "not json", encoding: "utf8" }).trim();
  assert.equal(junk, "agenthud: payload is not valid JSON");

  const array = execFileSync(process.execPath, [BIN, "--no-color"], { input: "[1,2]", encoding: "utf8" }).trim();
  assert.equal(array, "agenthud: payload is not an object");
});

test("--print-format explains which Format is actually in effect", () => {
  assert.equal(run(["--print-format", "--show=ctx"]), "ctx {ctx}");
});

test("--sep replaces the Separator without touching the Format", () => {
  assert.equal(run(["--no-color", "--format={model}|ctx {ctx}", "--sep= · "]), "Opus 5 · ctx 8%");
});

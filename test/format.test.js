"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFormat, renderFormat, fieldsUsed, splitSegments } = require("../src/format.js");

const KNOWN = ["ctx", "wk", "7d", "7d_reset", "in", "out", "tot"];
const resolver = (values) => ({
  has: (key) => KNOWN.includes(key),
  get: (key) => values[key],
});

test("a Missing Field removes its innermost Group, not the Segment", () => {
  const r = resolver({ "7d": "83%" });
  assert.equal(renderFormat("7d {7d} left[ (resets {7d_reset})]", r), "7d 83% left");
});

test("a Missing Field with no enclosing Group removes the whole Segment", () => {
  const r = resolver({ ctx: "8%" });
  assert.equal(renderFormat("ctx {ctx}|wk {wk} left", r), "ctx 8%");
});

test("Groups drop independently and the gap they leave is collapsed", () => {
  const r = resolver({ in: "36", out: undefined });
  assert.equal(renderFormat("[in {in}] [out {out}] [tot {tot}]", r), "in 36");
});

test("an unknown Field is printed literally so a typo is visible", () => {
  assert.equal(renderFormat("ctx {ctx}|{nosuch}", resolver({ ctx: "8%" })), "ctx 8% | {nosuch}");
});

test("a syntax error replaces the whole line, because stderr is never seen", () => {
  assert.equal(renderFormat("ctx {ctx}|[oops", resolver({ ctx: "8%" })), "agentline: unclosed [ at column 11");
  assert.equal(renderFormat("{ctx", resolver({})), "agentline: unclosed { at column 1");
  assert.equal(renderFormat("a]b", resolver({})), "agentline: unmatched ] at column 2");
});

test("escapes produce literal delimiters", () => {
  const r = resolver({ ctx: "8%" });
  assert.equal(renderFormat("a \\| b|ctx {ctx}", r), "a | b | ctx 8%");
  assert.equal(renderFormat("\\{ctx\\}|ctx {ctx}", r), "{ctx} | ctx 8%");
});

test("| inside a Group is literal, since a Group lives inside one Segment", () => {
  const r = resolver({ ctx: "8%" });
  assert.equal(renderFormat("[a|b {ctx}]", r), "a|b 8%");
});

test("the Separator is configurable and is not part of the Format", () => {
  const r = resolver({ ctx: "8%", "7d": "83%" });
  assert.equal(renderFormat("ctx {ctx}|7d {7d}", r, { separator: " · " }), "ctx 8% · 7d 83%");
});

test("fieldsUsed reports every Placeholder, including nested ones", () => {
  assert.deepEqual([...fieldsUsed("a {ctx}|[x [y {in}]]")].sort(), ["ctx", "in"]);
});

test("splitSegments ignores | inside Groups and after an escape", () => {
  assert.deepEqual(splitSegments("a|[b|c]|d\\|e"), ["a", "[b|c]", "d\\|e"]);
});

test("parseFormat rejects an unknown escape rather than guessing", () => {
  assert.throws(() => parseFormat("\\q"), /unknown escape/);
});

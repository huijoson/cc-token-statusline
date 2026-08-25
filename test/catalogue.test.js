"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { hostSupports, catalogueRows, status } = require("../src/catalogue.js");
const { createSampleResolver } = require("../src/resolver.js");
const { FIELDS } = require("../src/fields.js");
const claudeCode = require("../src/hosts/claude-code.js");
const qwenCode = require("../src/hosts/qwen-code.js");

const rowFor = (host, key) =>
  catalogueRows(host, createSampleResolver(host, { colour: false }), { includeAttached: true })
    .find((row) => row.key === key);

test("every Field says what it means", () => {
  const undocumented = Object.entries(FIELDS).filter(([, field]) => !field.desc);
  assert.deepEqual(undocumented.map(([key]) => key), []);
});

test("'the Host cannot supply this' and 'no value right now' are different states", () => {
  // Claude Code does supply {agent} — it is just absent unless a subagent runs.
  const agent = rowFor(claudeCode, "agent");
  assert.equal(agent.supported, true);
  assert.equal(agent.value, undefined);
  assert.equal(status(agent, claudeCode).text, "—");
  assert.match(status(agent, claudeCode).note, /only while a subagent runs/);

  // Qwen Code genuinely has no effort level.
  const effort = rowFor(qwenCode, "effort");
  assert.equal(effort.supported, false);
  assert.equal(status(effort, qwenCode).text, "n/a");
  assert.match(status(effort, qwenCode).note, /not available on Qwen Code/);
});

test("hostSupports covers transcript-sourced Fields too", () => {
  assert.equal(hostSupports(claudeCode, "tot"), true);
  assert.equal(hostSupports(qwenCode, "tot"), false);
  assert.equal(hostSupports(claudeCode, "nosuch"), false);
});

test("a Field with a value still shows the condition that produced it", () => {
  const seven = rowFor(claudeCode, "7d");
  assert.equal(seven.value, "83%");
  assert.match(status(seven, claudeCode).note, /only on Claude Pro\/Max plans/);
});

test("attaching Fields are hidden from the picker but listed by --list-fields", () => {
  const resolver = createSampleResolver(claudeCode, { colour: false });
  const picker = catalogueRows(claudeCode, resolver).map((row) => row.key);
  const full = catalogueRows(claudeCode, resolver, { includeAttached: true }).map((row) => row.key);
  assert.equal(picker.includes("7d_reset"), false);
  assert.equal(full.includes("7d_reset"), true);
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { HOSTS, getHost, supportedHosts } = require("../src/hosts/index.js");
const { createResolver, createSampleResolver } = require("../src/resolver.js");
const { renderFormat } = require("../src/format.js");
const { DEFAULT_FORMAT } = require("../src/templates.js");
const { hostSupports } = require("../src/catalogue.js");
const install = require("../src/wizard/install.js");

const copilot = getHost("copilot-cli");
const antigravity = getHost("antigravity");
const claudeCode = getHost("claude-code");

test("every supported Host can name a settings file and a value shape", () => {
  for (const host of supportedHosts()) {
    assert.ok(host.settingsPath.posix, host.id);
    assert.ok(Array.isArray(host.settingsKey) && host.settingsKey.length, host.id);
    assert.equal(typeof host.settingsValue("x").command, "string", host.id);
    assert.ok(host.sample, host.id);
  }
});

test("Codex is listed but never selectable — it cannot run a command at all", () => {
  const codex = getHost("codex");
  assert.equal(codex.supported, false);
  assert.equal(codex.reason, "blocked");
  assert.match(codex.note, /runs no command/);
  assert.equal(supportedHosts().some((host) => host.id === "codex"), false);
  assert.equal(HOSTS.some((host) => host.id === "codex"), true);
});

test("Copilot's token Fields come from the Payload, with no transcript read", () => {
  assert.equal(copilot.transcript, null);
  assert.equal(hostSupports(copilot, "tot"), true);

  const payload = {
    context_window: { total_input_tokens: 36, total_output_tokens: 21100, total_tokens: 1236436 },
  };
  const r = createResolver(copilot, payload, { colour: false, format: "in {in}|tot {tot}" });
  assert.equal(r.get("in"), "36");
  assert.equal(r.get("tot"), "1.2M");
});

test("an Adapter's extract wins over a Field's default source", () => {
  // `in` is declared transcript-sourced, yet Copilot supplies it directly.
  const { getField } = require("../src/fields.js");
  assert.equal(getField("in").source, "transcript");
  assert.equal(hostSupports(copilot, "in"), true);
  assert.equal(hostSupports(antigravity, "in"), false);
});

test("Antigravity's quota fraction becomes a remaining percentage", () => {
  const r = createResolver(antigravity, { quota: { remaining_fraction: 0.72 } }, { colour: false });
  assert.equal(r.get("quota"), "72%");
});

test("reset times are accepted as epoch seconds or as an ISO timestamp", () => {
  const epoch = createResolver(antigravity, { quota: { reset_time: 1787812200 } }, { colour: false });
  const iso = createResolver(antigravity, { quota: { reset_time: "2026-08-26T09:30:00Z" } }, { colour: false });
  assert.match(epoch.get("quota_reset"), /^\d{2}:\d{2}$/);
  assert.match(iso.get("quota_reset"), /^\d{2}:\d{2}$/);
});

test("Copilot's settings file is looked for under both documented names", () => {
  const paths = install.settingsPathsFor(copilot);
  assert.equal(paths.length, 2);
  assert.match(paths[0], /\.copilot[/\\]config\.json$/);
  assert.match(paths[1], /\.copilot[/\\]settings\.json$/);
});

test("the default Format is unchanged on Claude Code by the Fields added for other CLIs", () => {
  const line = renderFormat(DEFAULT_FORMAT, createSampleResolver(claudeCode, { colour: false }));
  assert.match(line, /^Opus 5:high \| ctx 8% \| 7d 83% left \(resets \d\d\/\d\d\) \| doitservers \| in 36 /);
  assert.doesNotMatch(line, /quota|branch/);
});

test("the same Format carries across every supported Host without printing holes", () => {
  for (const host of supportedHosts()) {
    const line = renderFormat(DEFAULT_FORMAT, createSampleResolver(host, { colour: false }));
    assert.doesNotMatch(line, /\{|\}|n\/a|undefined/, host.id);
    assert.ok(line.includes("ctx "), host.id);
  }
});

test("a CLI that will never work is labelled differently from one not done yet", () => {
  const reasons = Object.fromEntries(
    HOSTS.filter((host) => !host.supported).map((host) => [host.id, host.reason])
  );
  assert.equal(reasons.codex, "blocked");
  assert.equal(reasons.opencode, "blocked");
  assert.equal(reasons["cursor-cli"], "pending");
  assert.equal(reasons.droid, "pending");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  formatTokens,
  aggregateTranscriptUsage,
  resolveVisibleFields,
  renderContext,
  renderWeeklyLimit,
  renderCwd,
  renderUsageLine,
  render,
} = require("../bin/statusline.js");

function writeTempTranscript(lines) {
  const file = path.join(os.tmpdir(), `cc-token-statusline-test-${Date.now()}-${Math.random()}.jsonl`);
  fs.writeFileSync(file, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return file;
}

test("formatTokens compacts large numbers", () => {
  assert.equal(formatTokens(36), "36");
  assert.equal(formatTokens(21100), "21.1k");
  assert.equal(formatTokens(1200000), "1.2M");
  assert.equal(formatTokens("not a number"), "?");
});

test("aggregateTranscriptUsage sums usage once per unique message.id", () => {
  // Claude Code can emit two JSONL lines for the same API response (e.g. one
  // per content block); both repeat the same usage object and must count once.
  const file = writeTempTranscript([
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 111, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 } } },
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 111, cache_read_input_tokens: 100, cache_creation_input_tokens: 10 } } },
    { type: "assistant", message: { id: "msg_2", usage: { input_tokens: 2, output_tokens: 50, cache_read_input_tokens: 150, cache_creation_input_tokens: 0 } } },
    { type: "user", message: { id: "msg_3" } },
  ]);

  const totals = aggregateTranscriptUsage(file);
  assert.deepEqual(totals, {
    input_tokens: 4,
    output_tokens: 161,
    cache_read_input_tokens: 250,
    cache_creation_input_tokens: 10,
    thinking_tokens: 0,
  });

  fs.unlinkSync(file);
});

test("aggregateTranscriptUsage sums output_tokens_details.thinking_tokens once per unique message.id", () => {
  const file = writeTempTranscript([
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 5193, output_tokens_details: { thinking_tokens: 4273 }, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 2, output_tokens: 5193, output_tokens_details: { thinking_tokens: 4273 }, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
    { type: "assistant", message: { id: "msg_2", usage: { input_tokens: 2, output_tokens: 89, output_tokens_details: { thinking_tokens: 18 }, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
  ]);

  const totals = aggregateTranscriptUsage(file);
  assert.equal(totals.thinking_tokens, 4291);
  assert.equal(totals.output_tokens, 5282);

  fs.unlinkSync(file);
});

test("aggregateTranscriptUsage degrades to zeros for a missing file", () => {
  const totals = aggregateTranscriptUsage("/does/not/exist.jsonl");
  assert.deepEqual(totals, {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    thinking_tokens: 0,
  });
});

test("renderContext falls back to n/a when context_window is missing", () => {
  assert.match(renderContext({}), /n\/a/);
  assert.match(renderContext({ context_window: { used_percentage: 8 } }), /8%/);
});

test("renderWeeklyLimit falls back to n/a without rate_limits.seven_day", () => {
  assert.match(renderWeeklyLimit({}), /n\/a/);
  assert.match(
    renderWeeklyLimit({ rate_limits: { seven_day: { used_percentage: 17, resets_at: 1787706000 } } }),
    /wk 83% left/,
  );
});

test("renderCwd shows the basename of data.cwd", () => {
  assert.equal(renderCwd({ cwd: "/Users/yuhan/coding/doitservers" }), "doitservers");
  assert.equal(renderCwd({}), null);
  assert.equal(renderCwd({ cwd: "/" }), "/");
});

test("renderCwd returns null when the cwd field is hidden", () => {
  const visible = resolveVisibleFields(["--hide=cwd"]);
  assert.equal(renderCwd({ cwd: "/Users/yuhan/coding/doitservers" }, visible), null);
});

test("renderUsageLine uses abbreviated lowercase field labels", () => {
  const file = writeTempTranscript([
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 36, output_tokens: 21100, output_tokens_details: { thinking_tokens: 5000 }, cache_read_input_tokens: 1200000, cache_creation_input_tokens: 15300 } } },
  ]);
  assert.equal(
    renderUsageLine({ transcript_path: file }),
    "in 36 out 21.1k th 5.0k cr 1.2M cw 15.3k tot 1.2M",
  );
  fs.unlinkSync(file);
});

test("renderUsageLine shows th 0 when there's no thinking usage, like other zero fields", () => {
  const file = writeTempTranscript([
    { type: "assistant", message: { id: "msg_1", usage: { input_tokens: 36, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } },
  ]);
  assert.equal(renderUsageLine({ transcript_path: file }), "in 36 out 100 th 0 cr 0 cw 0 tot 136");
  fs.unlinkSync(file);
});

test("resolveVisibleFields defaults to all fields with no flags", () => {
  const visible = resolveVisibleFields([]);
  assert.deepEqual([...visible].sort(), ["cr", "ctx", "cw", "cwd", "in", "out", "th", "tot", "wk"]);
});

test("resolveVisibleFields --hide removes only the listed fields", () => {
  const visible = resolveVisibleFields(["--hide=cr,cw"]);
  assert.equal(visible.has("cr"), false);
  assert.equal(visible.has("cw"), false);
  assert.equal(visible.has("in"), true);
  assert.equal(visible.has("ctx"), true);
});

test("resolveVisibleFields --show whitelists fields, ignoring unknown keys", () => {
  const visible = resolveVisibleFields(["--show=ctx,wk,bogus"]);
  assert.deepEqual([...visible].sort(), ["ctx", "wk"]);
});

test("resolveVisibleFields applies --hide after --show", () => {
  const visible = resolveVisibleFields(["--show=ctx,wk,tot", "--hide=wk"]);
  assert.deepEqual([...visible].sort(), ["ctx", "tot"]);
});

test("render() omits hidden segments without leaving stray separators", () => {
  const line = render(
    { context_window: { used_percentage: 8 }, cwd: "/x/doitservers" },
    resolveVisibleFields(["--show=ctx,cwd"]),
  );
  assert.equal(line, `${"\x1b[32m"}ctx${"\x1b[0m"} 8% | doitservers`);
  assert.equal(line.includes("||"), false);
});

test("render() never throws on garbage input and always returns one line", () => {
  const line = render({ nonsense: true });
  assert.equal(typeof line, "string");
  assert.equal(line.includes("\n"), false);
});

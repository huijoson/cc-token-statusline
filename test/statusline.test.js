"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  formatTokens,
  aggregateTranscriptUsage,
  renderContext,
  renderWeeklyLimit,
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
  });

  fs.unlinkSync(file);
});

test("aggregateTranscriptUsage degrades to zeros for a missing file", () => {
  const totals = aggregateTranscriptUsage("/does/not/exist.jsonl");
  assert.deepEqual(totals, {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
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
    /Wk 83% left/,
  );
});

test("render() never throws on garbage input and always returns one line", () => {
  const line = render({ nonsense: true });
  assert.equal(typeof line, "string");
  assert.equal(line.includes("\n"), false);
});

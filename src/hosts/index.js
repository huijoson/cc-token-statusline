"use strict";

const claudeCode = require("./claude-code.js");
const copilotCli = require("./copilot-cli.js");
const antigravity = require("./antigravity.js");
const qwenCode = require("./qwen-code.js");

// Hosts whose statusline mechanism is confirmed but whose Payload shape has
// not been sampled yet. They are listed rather than hidden so the Wizard can
// tell the truth about coverage instead of silently offering five broken
// installs — and so someone who wants one knows it is a sampling job, not a
// design job.
// Two different kinds of "no", and saying so matters: `pending` is work this
// package has not done yet, `blocked` is something the CLI does not allow and
// no amount of work here will change. Labelling the second as "not yet" would
// leave someone waiting for a release that cannot come.
const PENDING = [
  { id: "cursor-cli", name: "Cursor CLI", supported: false, reason: "pending",
    note: "payload not sampled yet; a custom line also replaces Cursor's own footer rows" },
  { id: "droid", name: "Factory Droid", supported: false, reason: "pending",
    note: "stdin payload shape is undocumented" },
  { id: "codex", name: "OpenAI Codex CLI", supported: false, reason: "blocked",
    note: "Codex runs no command for its status line, only its own built-in items (openai/codex#17827)" },
  { id: "opencode", name: "opencode", supported: false, reason: "blocked",
    note: "opencode has no custom status line (anomalyco/opencode#30295)" },
];

const HOSTS = [claudeCode, copilotCli, antigravity, qwenCode, ...PENDING];

function getHost(id) {
  return HOSTS.find((host) => host.id === id);
}

function supportedHosts() {
  return HOSTS.filter((host) => host.supported);
}

module.exports = { HOSTS, PENDING, getHost, supportedHosts };

"use strict";

const { readClaudeTranscript } = require("../transcript.js");

// Adapter for Claude Code. `extract` returns *raw* values; formatting, colour
// and labels live in src/fields.js so they cannot drift between Hosts.
// A key absent from `extract` means this Host cannot supply that Field at all.
module.exports = {
  id: "claude-code",
  name: "Claude Code",
  supported: true,
  settingsPath: { posix: "~/.claude/settings.json", win32: "%USERPROFILE%\\.claude\\settings.json" },
  settingsKey: ["statusLine"],
  settingsValue: (command) => ({ type: "command", command }),

  extract: {
    model: (p) => p?.model?.display_name,
    model_id: (p) => p?.model?.id,
    effort: (p) => p?.effort?.level,

    ctx: (p) => p?.context_window?.used_percentage,
    ctx_left: (p) => p?.context_window?.remaining_percentage,
    ctx_size: (p) => p?.context_window?.context_window_size,

    "7d": (p) => invert(p?.rate_limits?.seven_day?.used_percentage),
    "7d_reset": (p) => p?.rate_limits?.seven_day?.resets_at,
    "5h": (p) => invert(p?.rate_limits?.five_hour?.used_percentage),
    "5h_reset": (p) => p?.rate_limits?.five_hour?.resets_at,

    cwd: (p) => p?.cwd ?? p?.workspace?.current_dir,
    dir: (p) => p?.workspace?.project_dir,
    added: (p) => (Array.isArray(p?.workspace?.added_dirs) && p.workspace.added_dirs.length
      ? p.workspace.added_dirs.length : undefined),

    cost: (p) => p?.cost?.total_cost_usd,
    lines_add: (p) => p?.cost?.total_lines_added || undefined,
    lines_del: (p) => p?.cost?.total_lines_removed || undefined,

    agent: (p) => p?.agent?.name,
    style: (p) => p?.output_style?.name,
    session: (p) => p?.session_name,
    ver: (p) => p?.version,
    vim: (p) => p?.vim?.mode,
    pr: (p) => p?.pr?.number,
    fast: (p) => p?.fast_mode === true || undefined,
    think: (p) => p?.thinking?.enabled === true || undefined,
  },

  transcript: {
    read: (p) => readClaudeTranscript(p?.transcript_path),
    map: {
      in: (t) => t.input_tokens,
      out: (t) => t.output_tokens,
      th: (t) => t.thinking_tokens,
      cr: (t) => t.cache_read_input_tokens,
      cw: (t) => t.cache_creation_input_tokens,
      tot: (t) => t.input_tokens + t.output_tokens + t.cache_read_input_tokens + t.cache_creation_input_tokens,
    },
  },

  sample: {
    model: { id: "claude-opus-5", display_name: "Opus 5" },
    effort: { level: "high" },
    context_window: { used_percentage: 8, remaining_percentage: 92, context_window_size: 200000 },
    rate_limits: {
      seven_day: { used_percentage: 17, resets_at: 1787788800 },
      five_hour: { used_percentage: 39, resets_at: 1787740200 },
    },
    cwd: "/home/you/doitservers",
    workspace: { current_dir: "/home/you/doitservers", project_dir: "/home/you/doitservers", added_dirs: [] },
    cost: { total_cost_usd: 1.23, total_lines_added: 412, total_lines_removed: 97 },
    output_style: { name: "default" },
    version: "2.1.243",
    thinking: { enabled: true },
    fast_mode: false,
    sampleTotals: {
      input_tokens: 36, output_tokens: 21100, thinking_tokens: 5000,
      cache_read_input_tokens: 1200000, cache_creation_input_tokens: 15300,
    },
  },
};

// Hosts report quota *used*; every Field here reports quota *left*, because
// "how much have I got" is the question a status line is glanced at to answer.
function invert(usedPercentage) {
  const n = Number(usedPercentage);
  if (!Number.isFinite(n)) return undefined;
  return 100 - Math.max(0, Math.min(100, n));
}

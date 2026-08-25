"use strict";

// Adapter for GitHub Copilot CLI.
//
// Two things are unusual here. Its Payload carries conversation totals
// directly, so the token Fields come from the Payload rather than a transcript
// file — the Adapter supplies them and no file is ever read. And the status
// line is behind a feature flag, which no amount of writing to settings will
// turn on for the user, so it is called out after install instead.
//
// The settings file has been documented under two names; both are accepted and
// whichever already exists wins.
module.exports = {
  id: "copilot-cli",
  name: "GitHub Copilot CLI",
  supported: true,
  settingsPath: {
    posix: ["~/.copilot/config.json", "~/.copilot/settings.json"],
    win32: ["%USERPROFILE%\\.copilot\\config.json", "%USERPROFILE%\\.copilot\\settings.json"],
  },
  settingsKey: ["statusLine"],
  settingsValue: (command) => ({ type: "command", command }),
  afterInstall:
    'Copilot CLI keeps the status line behind a feature flag. Enable it with ' +
    '`copilot --experimental`, or add {"feature_flags":{"enabled":["STATUS_LINE"]}} to the same file.',

  extract: {
    model: (p) => p?.model?.display_name,
    model_id: (p) => p?.model?.id,

    ctx: (p) => p?.context_window?.used_percentage,
    ctx_left: (p) => p?.context_window?.remaining_percentage,
    ctx_size: (p) => p?.context_window?.context_window_size,

    cwd: (p) => p?.cwd ?? p?.workspace?.current_dir,
    dir: (p) => p?.workspace?.current_dir,

    lines_add: (p) => p?.cost?.total_lines_added || undefined,
    lines_del: (p) => p?.cost?.total_lines_removed || undefined,

    session: (p) => p?.session_name,
    ver: (p) => p?.version,

    // Conversation totals, straight from the Payload.
    in: (p) => p?.context_window?.total_input_tokens,
    out: (p) => p?.context_window?.total_output_tokens,
    th: (p) => p?.context_window?.total_reasoning_tokens,
    cr: (p) => p?.context_window?.total_cache_read_tokens,
    cw: (p) => p?.context_window?.total_cache_write_tokens,
    tot: (p) => p?.context_window?.total_tokens,
  },

  transcript: null,

  sample: {
    model: { id: "claude-sonnet-4.5", display_name: "Claude Sonnet 4.5" },
    cwd: "/home/you/doitservers",
    workspace: { current_dir: "/home/you/doitservers" },
    session_name: "refactor",
    version: "1.0.41",
    cost: { total_lines_added: 412, total_lines_removed: 97, total_premium_requests: 12 },
    context_window: {
      used_percentage: 22, remaining_percentage: 78, context_window_size: 128000,
      total_input_tokens: 36, total_output_tokens: 21100, total_reasoning_tokens: 5000,
      total_cache_read_tokens: 1200000, total_cache_write_tokens: 15300, total_tokens: 1236436,
    },
  },
};

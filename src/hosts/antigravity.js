"use strict";

// Adapter for Google's Antigravity CLI.
//
// Its Payload is modelled closely on Claude Code's — same `transcript_path`,
// same `exceeds_200k_tokens`, `session_id` kept as an alias of
// `conversation_id` — so the shared field names map across directly. What it
// adds is a documented `vcs` block and a single model quota, rather than the
// two rolling windows Claude Code reports.
//
// Its transcript format has not been sampled, so token totals are absent here
// rather than guessed at.
module.exports = {
  id: "antigravity",
  name: "Antigravity CLI",
  supported: true,
  settingsPath: {
    posix: "~/.gemini/antigravity-cli/settings.json",
    win32: "%USERPROFILE%\\.gemini\\antigravity-cli\\settings.json",
  },
  settingsKey: ["statusLine"],
  settingsValue: (command) => ({ type: "command", command }),
  afterInstall: "The settings key must be camelCase `statusLine` — `statusline` is ignored.",

  extract: {
    model: (p) => p?.model?.display_name,
    model_id: (p) => p?.model?.id,

    ctx: (p) => p?.context_window?.used_percentage,
    ctx_left: (p) => p?.context_window?.remaining_percentage,
    ctx_size: (p) => p?.context_window?.context_window_size,

    // remaining_fraction is 0..1; every quota Field in this package is a
    // percentage of what is left, so the conversion belongs here.
    quota: (p) => {
      const fraction = Number(p?.quota?.remaining_fraction);
      return Number.isFinite(fraction) ? fraction * 100 : undefined;
    },
    quota_reset: (p) => p?.quota?.reset_time,

    branch: (p) => p?.vcs?.branch,
    cwd: (p) => p?.workspace?.current_dir ?? p?.cwd,
    dir: (p) => p?.workspace?.project_dir,
    ver: (p) => p?.version,
    vim: (p) => p?.vim?.mode,
  },

  transcript: null,

  sample: {
    model: { id: "gemini-3-pro", display_name: "Gemini 3 Pro" },
    cwd: "/home/you/doitservers",
    workspace: { current_dir: "/home/you/doitservers", project_dir: "/home/you/doitservers" },
    version: "1.4.0",
    context_window: { used_percentage: 15, remaining_percentage: 85, context_window_size: 1000000 },
    quota: { remaining_fraction: 0.72, reset_time: 1787812200 },
    vcs: { type: "git", branch: "main", dirty: true },
    agent_state: "idle",
  },
};

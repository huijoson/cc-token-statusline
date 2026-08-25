"use strict";

// Adapter for Qwen Code. Its Payload has no rate limits and no effort level,
// and its transcript format is unverified — so those Fields are simply absent
// from `extract` and are permanently Missing here. Under the "Missing
// disappears" policy that degrades a shared Format quietly and correctly
// rather than printing holes.
module.exports = {
  id: "qwen-code",
  name: "Qwen Code",
  supported: true,
  settingsPath: { posix: "~/.qwen/settings.json", win32: "%USERPROFILE%\\.qwen\\settings.json" },
  settingsKey: ["ui", "statusLine"],
  settingsValue: (command) => ({ type: "command", command }),

  extract: {
    model: (p) => p?.model?.display_name,
    ctx: (p) => p?.context_window?.used_percentage,
    ctx_left: (p) => p?.context_window?.remaining_percentage,
    ctx_size: (p) => p?.context_window?.context_window_size,
    cwd: (p) => p?.workspace?.current_dir,
    ver: (p) => p?.version,
    vim: (p) => p?.vim?.mode,
    session: (p) => p?.session_id,
  },

  transcript: null,

  sample: {
    model: { display_name: "Qwen3-Coder" },
    context_window: { used_percentage: 12, remaining_percentage: 88, context_window_size: 256000 },
    workspace: { current_dir: "/home/you/qwen-project" },
    version: "0.9.1",
    session_id: "sess_1f2e",
  },
};

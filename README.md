# cc-token-statusline

A portable [Claude Code](https://code.claude.com) `statusLine` command: context window %, weekly rate-limit remaining, current directory, and this conversation's cumulative input / output / cache token usage — in one line.

Zero npm dependencies. Reads Claude Code's `statusLine` JSON on stdin, writes one line to stdout, exits. No files written, no network calls, no hooks.

```
ctx 8% | wk 83% left (resets 08/26) | doitservers | in 36 out 21.1k th 5.0k cr 1.2M cw 15.3k tot 1.3M
```

## Install

The package is a zero-dependency Node.js script run via `npx`, so it works the same on **WSL / Linux, macOS, and Windows**. Only prerequisite on each platform: Node.js ≥ 18 (which ships `npx`).

Add this to the platform's Claude Code settings file (`settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y cc-token-statusline"
  }
}
```

### Settings file location per platform

| Platform | Global settings path |
|----------|----------------------|
| **WSL / Linux** | `~/.claude/settings.json` |
| **macOS** | `~/.claude/settings.json` |
| **Windows** | `%USERPROFILE%\.claude\settings.json` |

You can also use a project-level `.claude/settings.json` on any platform to scope it to one repo.

### Notes

- The `statusLine` command must run in the **same environment as Claude Code**, so it resolves the right `node`/`npx` and the same `transcript_path`. Make sure each platform uses its **native** Claude Code build — e.g. on WSL, don't let the shell resolve to the Windows npm `claude.exe` (a Windows `.exe` can't run from WSL; install the native Linux build and ensure it comes first on `PATH`).
- `npx` fetches and caches the package on first run, so it needs network once. To avoid that, you can instead run `npm install -g cc-token-statusline` on each platform and use `command`: `"cc-token-statusline"`.
- No local clone, no python3 requirement, no other setup.

## What each field means

- `ctx N%` — how full the current context window is (`context_window.used_percentage` from the statusLine payload).
- `wk N% left (resets MM/DD)` — remaining weekly usage for Claude.ai Pro/Max plans (`rate_limits.seven_day`). Shows `wk n/a` for API-key/Bedrock/Vertex auth, where this isn't populated.
- `<dirname>` — basename of the current working directory (`data.cwd`), reflecting the live shell cwd (including `/add-dir` overrides).
- `in` / `out` — cumulative input/output tokens for this conversation, summed across every turn in the session transcript.
- `th` — cumulative extended-thinking tokens (`usage.output_tokens_details.thinking_tokens`). This is a **breakdown of `out`, not additional to it** — it's not folded into `tot`.
- `cr` — cumulative tokens served from cache across the conversation (cost savings from caching, not "how much is cached right now").
- `cw` — cumulative tokens written to cache across the conversation.
- `tot` — sum of `in` + `out` + `cr` + `cw`.

Turn-level `usage` entries are de-duplicated by `message.id` before summing, since Claude Code can write more than one JSONL line per API response.

## Showing/hiding fields

Pass `--show=` and/or `--hide=` (comma-separated field keys) in the `command` string. `--show` whitelists which fields can appear; `--hide` then removes fields from whatever's currently visible (default: everything). Unknown keys are ignored.

Field keys: `ctx`, `wk`, `cwd`, `in`, `out`, `th`, `cr`, `cw`, `tot`.

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y cc-token-statusline --hide=cr,cw"
  }
}
```

```sh
node bin/statusline.js --hide=cr,cw < payload.json   # drop cache fields
node bin/statusline.js --show=ctx,wk < payload.json  # only context % and weekly limit
```

## Scope

This package **only renders a status line**. It intentionally does not:

- write any state file,
- register any hook (`Stop`, `UserPromptSubmit`, etc.),
- know about or interact with any other skill's context-handoff/compaction logic.

If you're looking for automatic context-handoff/checkpoint tooling, that's a separate concern by design — see [mattpocock/skills](https://github.com/mattpocock/skills)'s `handoff` skill for a manual, on-demand alternative.

## Develop

```sh
npm test          # node --test test/
node bin/statusline.js < path/to/sample-payload.json
```

## License

MIT

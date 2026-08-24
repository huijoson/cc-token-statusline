# cc-token-statusline

A portable [Claude Code](https://code.claude.com) `statusLine` command: context window %, weekly rate-limit remaining, and this conversation's cumulative input / output / cache token usage — in one line.

Zero npm dependencies. Reads Claude Code's `statusLine` JSON on stdin, writes one line to stdout, exits. No files written, no network calls, no hooks.

```
[CONTEXT] 8% | Wk 83% left (resets 08/26) | In 36 Out 21.1k CacheRead 1.2M CacheWrite 15.3k Total 1.3M
```

## Install

Add this to `~/.claude/settings.json` (or a project's `.claude/settings.json`):

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y cc-token-statusline"
  }
}
```

That's it — `npx` fetches and caches the package on first run. No local clone, no python3 requirement, no other setup.

## What each field means

- `[CONTEXT] N%` — how full the current context window is (`context_window.used_percentage` from the statusLine payload).
- `Wk N% left (resets MM/DD)` — remaining weekly usage for Claude.ai Pro/Max plans (`rate_limits.seven_day`). Shows `Wk n/a` for API-key/Bedrock/Vertex auth, where this isn't populated.
- `In` / `Out` — cumulative input/output tokens for this conversation, summed across every turn in the session transcript.
- `CacheRead` — cumulative tokens served from cache across the conversation (cost savings from caching, not "how much is cached right now").
- `CacheWrite` — cumulative tokens written to cache across the conversation.
- `Total` — sum of the four numbers above.

Turn-level `usage` entries are de-duplicated by `message.id` before summing, since Claude Code can write more than one JSONL line per API response.

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

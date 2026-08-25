# Installing agenthud

A status line for agent CLIs. This is the full manual — for the short version,
see the [README](../README.md).

## Before you start

- **Node.js 18 or newer.** `node --version` to check. That is the only
  prerequisite; agenthud has no npm dependencies.
- **The CLI you are configuring must run in the same environment as agenthud.**
  On WSL this matters: a native Linux Claude Code cannot run a Windows `node.exe`,
  and vice versa. Whichever shell your CLI launches from is the one that must
  find `node`.

## Two ways to get it

### Without installing (recommended)

Nothing to install. The command in your CLI's settings does the work:

```
npx -y agenthud
```

`npx` downloads and caches the package the first time, so it needs network once.
Every later run is served from cache.

### Installed globally

Slightly faster to start, and works offline from the first run:

```sh
npm install -g agenthud
```

Then use `agenthud` on its own wherever this manual says `npx -y agenthud`.

## The quick path

```sh
npx -y agenthud init
```

Pick your CLI, pick a starting line, edit it, confirm the diff. Done.

**Run this in a plain terminal, not inside the CLI you are configuring.** A
full-screen editor inside another full-screen editor cannot work; agenthud
detects that and falls back to a plain typed flow, but you lose the arrow-key
editor.

What `init` does, in order:

1. asks which CLI, showing which ones it cannot support and why
2. shows four starting lines, each rendered with sample data
3. opens the editor on the one you pick
4. shows you a diff of the settings file
5. asks before writing, backs the file up, then writes only the `statusLine` key

If your settings file contains comments it will not rewrite it at all — it
prints the snippet for you to paste, because silently deleting your comments to
save you one paste is a bad trade.

## Installing by hand

Everything `init` does you can do yourself. Add the block below to your CLI's
settings file.

### Claude Code

| | |
|---|---|
| WSL / Linux / macOS | `~/.claude/settings.json` |
| Windows | `%USERPROFILE%\.claude\settings.json` |
| Per project | `.claude/settings.json` in the repo |

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y agenthud"
  }
}
```

### GitHub Copilot CLI

| | |
|---|---|
| WSL / Linux / macOS | `~/.copilot/config.json` — or `~/.copilot/settings.json`, whichever you already have |
| Windows | `%USERPROFILE%\.copilot\config.json` |

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y agenthud --host=copilot-cli"
  }
}
```

**The status line is behind a feature flag.** Turn it on with one of:

```sh
copilot --experimental
```

```json
{ "feature_flags": { "enabled": ["STATUS_LINE"] } }
```

### Antigravity CLI

| | |
|---|---|
| WSL / Linux / macOS | `~/.gemini/antigravity-cli/settings.json` |
| Windows | `%USERPROFILE%\.gemini\antigravity-cli\settings.json` |

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y agenthud --host=antigravity"
  }
}
```

**The key must be camelCase `statusLine`.** Spelled `statusline`, it is silently
ignored.

### Qwen Code

| | |
|---|---|
| WSL / Linux / macOS | `~/.qwen/settings.json` |
| Windows | `%USERPROFILE%\.qwen\settings.json` |

Note the extra nesting under `ui`:

```json
{
  "ui": {
    "statusLine": {
      "type": "command",
      "command": "npx -y agenthud --host=qwen-code"
    }
  }
}
```

### CLIs that are not supported

**Codex CLI and opencode cannot run agenthud at all.** Both build their status
lines from a fixed list of built-in items and never run an external command.
This is not something a future release here can fix
([openai/codex#17827](https://github.com/openai/codex/issues/17827),
[anomalyco/opencode#30295](https://github.com/anomalyco/opencode/issues/30295)).

**Cursor CLI and Factory Droid** have the mechanism, but their payloads have not
been sampled yet, so agenthud cannot read their data correctly. They appear in
`init` marked as not yet supported.

Restart your CLI after editing its settings.

## Choosing what the line shows

```sh
npx -y agenthud --list-fields
```

prints every field with a live sample value, what it means, and what your CLI
cannot supply. Add `--host=…` to see it for a different CLI.

To change the line, either run `npx -y agenthud edit`, or write a Format
yourself:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y agenthud --format=\"{model}[:{effort}]|ctx {ctx}|{branch}|{cwd}\""
  }
}
```

**Quote the Format.** An unquoted `|` is a shell pipe and your status line will
come out blank. Inside JSON that means `\"…\"`, as above.

If the quoting fights you — most likely on Windows — use the environment
instead:

```
AGENTHUD_FORMAT={model}|ctx {ctx}|{cwd}
```

Precedence is `--format` › `--show`/`--hide` › `AGENTHUD_FORMAT` › the default.

## Checking it works

Before wiring it into a CLI, feed it a payload by hand:

```sh
echo '{"model":{"display_name":"Opus 5"},"context_window":{"used_percentage":8},"cwd":"/tmp/demo"}' \
  | npx -y agenthud --no-color
```

Expected — the quota and token segments disappear because this hand-made
payload carries neither:

```
Opus 5 | ctx 8% | demo
```

And to see what your CLI is actually running:

```sh
npx -y agenthud --print-format
```

## Troubleshooting

**The status line is blank.**
Usually shell quoting: an unquoted `|` in `--format` splits the command into a
pipeline. Check with `--print-format`, or move the Format into
`AGENTHUD_FORMAT`.

**It says `agenthud: unclosed [ at column 23`.**
That is the intended behaviour, not a crash. Errors are printed into the status
line because nothing else you write to stderr is ever displayed. Fix the column
it names.

**A field shows nothing.**
Three different states, and `--list-fields` tells you which:

- a value — it has data
- `—` — your CLI supplies it, but not right now (`{agent}` needs a subagent
  running, `{vim}` needs vim mode on). It will appear when it applies.
- `n/a` — your CLI cannot supply it at all. Nothing you do will make it show.

A field with nothing to show takes the text around it with it, by design — that
is why the same Format works across different CLIs.

**Nothing happens after editing settings.**
Restart the CLI. For Copilot CLI, also check the feature flag; for Antigravity,
check the key is camelCase.

**`init` opens a plain typed list instead of the editor.**
You are running it inside an agent CLI, over SSH without a TTY, or in CI.
Run it in a plain terminal for the full-screen editor. `--no-tui` forces the
typed flow deliberately.

**Colours look wrong, or you are piping the output somewhere.**
`--no-color`, or set `NO_COLOR=1`.

**WSL: `npx` resolves to the Windows one.**
Make sure the native Linux Node comes first on `PATH` in the shell your CLI
launches from. A Windows `node.exe` cannot be executed from a Linux process.

## Upgrading

With `npx -y agenthud`, you get the latest version automatically. Your Format
is stored expanded in your settings file, so **your line never changes under
you** when the package updates.

Installed globally: `npm update -g agenthud`.

## Uninstalling

Delete the `statusLine` key from your CLI's settings file and restart it. If you
installed globally, `npm uninstall -g agenthud`.

agenthud writes nothing else: no state files, no hooks, no network calls beyond
`npx` fetching the package. The only file it ever touches is the settings file
you point it at, and only after showing you the diff.

## Coming from cc-token-statusline

`agenthud` is the same project renamed. Your existing `--show` and `--hide`
flags still work unchanged — they now compile down to a Format internally.

Replace `npx -y cc-token-statusline` with `npx -y agenthud` in your settings and
restart. Two behaviour changes to expect:

- the default line now starts with the model name and effort level
- `wk` is now `7d` (`wk` still works as an alias), and there is a matching `5h`

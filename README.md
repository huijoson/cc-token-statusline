# agentline

Design your own agent-CLI status line. One Format string, several CLIs, zero npm
dependencies.

```
Opus 5:high | ctx 8% | 7d 83% left (resets 08/26) | doitservers | in 36 out 21.1k th 5.0k cr 1.2M cw 15.3k tot 1.3M
```

Reads the JSON your CLI pipes to stdin, writes one line to stdout, exits. No
network calls, no hooks, no state files.

> Renamed from `cc-token-statusline`. Existing `--show` / `--hide` commands keep
> working unchanged.

## Quick start

```sh
npx -y agentline init     # pick a starting line, edit it, install it
```

Run it in a **plain shell**, not inside the CLI you are configuring — a
full-screen editor inside another full-screen editor does not work. If you do,
it detects that and switches to a plain typed flow instead.

Or install by hand:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y agentline"
  }
}
```

## Supported CLIs

| CLI | Settings file | Key |
|---|---|---|
| **Claude Code** | `~/.claude/settings.json` | `statusLine` |
| **GitHub Copilot CLI** | `~/.copilot/config.json` *(or `settings.json`, whichever exists)* | `statusLine` |
| **Antigravity CLI** | `~/.gemini/antigravity-cli/settings.json` | `statusLine` |
| **Qwen Code** | `~/.qwen/settings.json` | `ui.statusLine` |

`init` writes the right file and the right key for whichever you pick, and adds
`--host=` when it is not Claude Code.

Two per-CLI notes it will also tell you at install time:

- **Copilot CLI** keeps the status line behind a feature flag. Turn it on with
  `copilot --experimental`, or add `{"feature_flags":{"enabled":["STATUS_LINE"]}}`
  to the same file.
- **Antigravity** ignores the key unless it is spelled `statusLine` in camelCase.

### Not supported, and why

| CLI | |
|---|---|
| **OpenAI Codex CLI** | **Cannot be supported.** `[tui].status_line` takes only a fixed list of built-in item ids and cannot run an external command ([openai/codex#17827](https://github.com/openai/codex/issues/17827)). |
| **opencode** | No custom status line at all ([anomalyco/opencode#30295](https://github.com/anomalyco/opencode/issues/30295)). |
| **Cursor CLI** | Has the mechanism; its payload has not been sampled yet. A custom line also replaces Cursor's own footer rows. |
| **Factory Droid** | Has the mechanism; its stdin payload is undocumented. |

The last two are a sampling job, not a design one — they appear in `init` marked
as not yet supported so the gap is visible rather than silent.

## The Format

A Format describes the line. Four rules:

| | |
|---|---|
| `{field}` | a field's **value** — the label is yours to write |
| `\|` | splits segments; a segment is the unit that disappears |
| `[...]` | an optional group; a narrower unit that disappears; nestable |
| `\\|` `\\[` `\\{` | a literal `\|` `[` `{` |

**A field with no data never prints a placeholder** — it takes the text around
it with it. A missing field removes its innermost enclosing `[...]`; with no
enclosing group, it removes its whole segment. Surviving segments collapse
their internal whitespace and are joined by `--sep` (default `" | "`).

```sh
agentline --format="{model}[:{effort}]|ctx {ctx}|7d {7d} left[ (resets {7d_reset})]|{cwd}"
```

- no effort level on this model → `Opus 5` , not `Opus 5:`
- API-key auth, so no weekly quota → the whole `7d` segment vanishes
- reset time unavailable but quota known → `7d 83% left`

That rule is also what lets one Format survive a change of CLI: on Qwen Code,
which reports no quotas, the same string prints `Qwen3-Coder | ctx 12% | myproj`.

## Fields

`agentline --list-fields` prints this table with live sample values and marks
what your CLI cannot supply. Add `--host=qwen-code` to see it for another CLI.

| field | means |
|---|---|
| `{model}` | current model, as the CLI names it |
| `{effort}` | reasoning effort level — only on models that have one |
| `{model_id}` | full model identifier |
| `{ctx}` | how full the context window is |
| `{ctx_left}` | how much context window is left |
| `{ctx_size}` | total size of the context window |
| `{7d}` `{5h}` | weekly / 5-hour quota **remaining** — Claude Pro/Max plans |
| `{7d_reset}` `{5h_reset}` | when that quota resets |
| `{quota}` `{quota_reset}` | single model quota remaining / when it resets — Antigravity |
| `{branch}` | current git branch |
| `{cwd}` | shell directory you are in, follows `/add-dir` |
| `{dir}` | project root the session started in |
| `{added}` | how many extra directories are in scope |
| `{cost}` | what this session has cost so far |
| `{lines_add}` `{lines_del}` | lines added / removed this session |
| `{agent}` | name of the subagent running now |
| `{style}` | active output style |
| `{session}` | name you gave this session |
| `{ver}` | CLI version |
| `{vim}` | vim mode, `INSERT` or `NORMAL` |
| `{pr}` | pull request number, inside a PR worktree |
| `{fast}` `{think}` | the words `fast` / `think`, when those modes are on |
| `{in}` `{out}` | input / output tokens, whole conversation |
| `{th}` | thinking tokens — **part of `out`**, not added to `tot` |
| `{cr}` `{cw}` | tokens read from / written to cache, whole conversation |
| `{tot}` | `in + out + cr + cw` |

Three things a field can be, and they are not the same:

- **a value** — it has data right now
- **`—`** — this CLI supplies it, but not in this state (`{agent}` needs a
  subagent running, `{vim}` needs vim mode on). It will appear when it applies.
- **`n/a`** — this CLI cannot supply it at all. Nothing you do will make it show.

Other notes worth knowing:

- Quota fields are what is **left**, not what is used.
- Token totals mean the same thing everywhere but arrive differently: Claude
  Code needs the transcript read (its payload's `context_window` is current
  occupancy, not a running total), while Copilot CLI puts conversation totals
  in the payload. The transcript is only read when your Format mentions a token
  field, and never on a CLI that does not need it.
- `0` is a value, not absence: a conversation that has really used 0 tokens
  shows `in 0`. A payload with no transcript to read shows nothing at all —
  those are different facts. If you do not want `th 0`, leave `{th}` out.
- `wk` still works as an alias for `7d`.

## Options

| | |
|---|---|
| `--format=…` | the Format. Quote it — an unquoted `\|` is a shell pipe |
| `AGENTLINE_FORMAT` | same thing via the environment, for awkward quoting |
| `--sep=…` | segment separator, default `" \| "` |
| `--host=…` | `claude-code` (default) or `qwen-code` |
| `--show=` / `--hide=` | shorthand that compiles to a Format |
| `--no-color`, `NO_COLOR` | drop colour |
| `--print-format` | print the Format actually in effect |
| `--list-fields` | print the field catalogue |
| `--no-tui` | skip the full-screen editor in `init` / `edit` |

Colours are threshold colours and belong to the field, not the Format: `ctx`
turns yellow at 75% and red at 82%, quota fields turn yellow below 50% and red
below 20%. Literal text you write is never coloured.

Precedence: `--format` › `--show`/`--hide` › `AGENTLINE_FORMAT` › default.

## Editing an existing line

```sh
npx -y agentline edit
```

Reads the Format back out of your CLI's settings and drops you into the editor
on your current line.

```
  Opus 5:high │ ctx 8% │ 7d 83% left (resets 08/26) │ doitservers
                        ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
  segment 3/4 · {7d} {7d_reset}

  ← → move   < > reorder   d delete   a add field   e edit text
```

You are editing the real line, not a list of checkboxes — what you see is what
your CLI will print.

Before writing anything it takes a backup, shows you a diff, and asks. It only
ever touches the `statusLine` key. If your settings file contains comments it
will not rewrite it at all — it prints the snippet for you to paste.

## Full manual

[docs/INSTALL.md](docs/INSTALL.md) — per-CLI settings paths for WSL, macOS and
Windows, manual installation, verification, troubleshooting, and migrating from
`cc-token-statusline`.

## Develop

```sh
npm test
echo '{"model":{"display_name":"Opus 5"}}' | node bin/agentline.js --no-color
```

`CONTEXT.md` is the glossary; `docs/adr/` records the decisions that are hard to
reverse and would otherwise look arbitrary.

## License

MIT

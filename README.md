# hudline

A designable status line for agent CLIs. One Format string, several CLIs, zero
npm dependencies.

```
 Opus 5 :high ★ CTX ▱▱▱▱▱ 8% ★ 5H ▰▰▰▱▱ 61% ★ 7D ▰▰▰▰▱ 83% ★ doitservers ★ IN 36 OUT 21.1k TH 5.0k CR 1.2M CW 15.3k TOT 1.2M
```

Reads the JSON your CLI pipes to stdin, writes one line to stdout, exits. No
network calls, no hooks, no state files, nothing left on disk.

> Renamed from `cc-token-statusline`. Existing `--show` / `--hide` commands keep
> working unchanged.

## Quick start

```sh
npx -y hudline init     # pick a starting line, edit it, install it
```

Run it in a **plain shell**, not inside the CLI you are configuring — a
full-screen editor inside another full-screen editor does not work. If you do,
it detects that and switches to a plain typed flow instead.

Or install by hand:

```json
{
  "statusLine": {
    "type": "command",
    "command": "npx -y hudline"
  }
}
```

## Reading the default line

That is one line; here it is in pieces.

| piece | is |
|---|---|
| ` Opus 5 ` | the model, drawn as a filled **chip** |
| `:high` | reasoning effort, when the model has one |
| `CTX ▱▱▱▱▱ 8%` | how full the context window is — **full is bad** |
| `5H ▰▰▰▱▱ 61%` | 5-hour quota **remaining** — full is good |
| `7D ▰▰▰▰▱ 83%` | weekly quota remaining |
| `doitservers` | the directory you are in |
| `IN … TOT …` | tokens for the whole conversation |

The meters read in opposite directions on purpose: a meter answers *how much of
this is there*, and whether that is good news is the colour's job, not the
bar's. Green is fine, amber is close, red is not.

Two things appear only when they apply:

```
 Opus 5 :high ★ CTX ▰▰▰▰▱ 88% ★ 5H ▱▱▱▱▱ 6% ★ 7D ▰▱▱▱▱ 12% ★ doitservers ★ Thy context runneth over!
 Opus 5 ★ CTX ▰▰▱▱▱ 30% ★ 5H ▰▰▰▰▰ 90% ★ 7D ▰▰▰▰▰ 95% ★ doitservers ★ Explore draws near!
```

That last segment is `{say}`. See [Narration](#narration).

**The default line is wide** — around 130 columns once there is a transcript to
count. It wraps on an 80-column terminal. That is a starting point, not a
recommendation: trimming it is what `--format` is for, and two of the fields
are the usual first to go.

```sh
# no thinking tokens (they are already inside OUT) and no raw input count
hudline --format="{model}[:{effort}]|CTX {ctx}|5H {5h}|7D {7d}|{cwd}|{say}|[OUT {out}] [TOT {tot}]"
```

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
their internal whitespace and are joined by the separator.

```sh
hudline --format="{model}[:{effort}]|ctx {ctx}|7d {7d} left[ (resets {7d_reset})]|{cwd}"
```

- no effort level on this model → `Opus 5`, not `Opus 5:`
- API-key auth, so no weekly quota → the whole `7d` segment vanishes
- reset time unavailable but quota known → `7d 83% left`

That rule is also what lets one Format survive a change of CLI. The same string,
unedited, on four of them:

```
claude-code   Opus 5:high ★ ctx ▱▱▱▱▱ 8% ★ 7d ▰▰▰▰▱ 83% left (resets 08/27) ★ doitservers
qwen-code     Qwen3-Coder ★ ctx ▰▱▱▱▱ 12% ★ qwen-project
copilot-cli   Claude Sonnet 4.5 ★ ctx ▰▱▱▱▱ 22% ★ doitservers
antigravity   Gemini 3 Pro ★ ctx ▰▱▱▱▱ 15% ★ doitservers
```

No holes, no `n/a`, no `undefined` — the fields those CLIs cannot supply take
their own text with them and nothing else moves.

## Fields

`hudline --list-fields` prints this table with live sample values and marks what
your CLI cannot supply. Add `--host=qwen-code` to see it for another CLI.

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
| `{say}` | one line about the most alarming thing right now |
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
- `{tot}` is usually 90%+ cache reads, which are the cheapest tokens there are.
  It is a volume number, not a cost number. For cost, use `{cost}`.
- Token totals mean the same thing everywhere but arrive differently: Claude
  Code needs the transcript read (its payload's `context_window` is current
  occupancy, not a running total), while Copilot CLI puts conversation totals in
  the payload. The transcript is only read when your Format mentions a token
  field, and never on a CLI that does not need it. On a 1.5MB transcript that
  read costs about 7ms.
- `0` is a value, not absence: a conversation that has really used 0 tokens
  shows `in 0`. A payload with no transcript to read shows nothing at all —
  those are different facts. If you do not want `th 0`, leave `{th}` out.
- `wk` still works as an alias for `7d`.

## Themes

A Format says **what** to show. A theme says **how**: the palette, the colour of
the labels and punctuation you wrote, which representation of a field is drawn,
the separator, and the wording of the narration. A Format never names a colour,
so the same Format survives a change of theme the same way it survives a change
of CLI.

```sh
hudline --list-themes
```

| | |
|---|---|
| **`neon`** *(default)* | sherly.dev's palette, with meters and a narrator |
| **`plain`** | the line, uncoloured except where a number is alarming |

`neon` takes its palette from [sherly.dev](https://sherly.dev): hot pink labels,
graphite punctuation, and the model name as a filled chip. Percentages are drawn
as meters and the line grows a narrator when something is wrong.

`plain` is the escape hatch, byte-identical to what shipped before themes
existed. Point a terminal without 256 colours or Unicode at it:

```sh
hudline --theme=plain
```
```
Opus 5:high | ctx 8% | 5h 61% left (resets 10:30) | 7d 83% left (resets 08/27) | doitservers
```

### Colour

Colours are **threshold** colours and belong to the field, not to you and not to
the theme: `ctx` turns amber at 75% and red at 82%; quota fields turn amber below
50% and red below 20%. A theme supplies the palette that "danger" is drawn from
and never the decision that this number is dangerous. You never write a colour
into a Format.

The literal text you write is coloured too, in two kinds: the **words** are
content, and the **brackets, parens and separator** around them are the skeleton
holding it up. They are deliberately not the same colour.

Colour depth follows `COLORTERM` and `TERM`: 24-bit where the terminal says so,
256 where it does not, the basic eight otherwise. `--no-color` and `NO_COLOR`
turn colour off — the meters and separators stay, because they are not colour.

### Narration

`{say}` is one sentence about the most alarming thing that is true right now,
and nothing at all when nothing is. Saying nothing is the normal case, and a
silent narration takes its whole segment with it.

- It **reports state, never events.** It cannot tell you what just happened,
  because nothing here remembers a previous render.
- It says **one** thing, and picks whichever will stop you soonest rather than
  whichever number is worst. A context window three messages from full outranks
  a weekly quota you can do nothing about until Tuesday.
- It cannot contradict the line beside it: it asks the threshold colours what
  counts as alarming rather than keeping cut-offs of its own, so a red number
  and a sentence saying all is well cannot end up side by side.
- The theme supplies the wording. `plain` says `context window nearly full`;
  `neon` says `Thy context runneth over!`

## Options

| | |
|---|---|
| `--format=…` | the Format. Quote it — an unquoted `\|` is a shell pipe |
| `HUDLINE_FORMAT` | same thing via the environment, for awkward quoting |
| `--theme=…` | `neon` (default) or `plain` |
| `HUDLINE_THEME` | same thing via the environment |
| `--sep=…` | separator; beats the theme's |
| `--host=…` | `claude-code` (default), `qwen-code`, `copilot-cli`, `antigravity` |
| `--show=` / `--hide=` | shorthand that compiles to a Format |
| `--no-color`, `NO_COLOR` | drop colour |
| `--print-format` | print the Format actually in effect |
| `--list-fields` | print the field catalogue |
| `--list-themes` | print the themes |
| `--no-tui` | skip the full-screen editor in `init` / `edit` |

Precedence: `--format` › `--show`/`--hide` › `HUDLINE_FORMAT` › the theme's own
Format › the built-in default.

A theme only supplies a Format when nobody else did. Give `--format` and the
theme still paints it — it just stops choosing which fields appear.

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

## Editing an existing line

```sh
npx -y hudline edit
```

Reads the Format back out of your CLI's settings and drops you into the editor
on your current line.

```
  Opus 5:high │ ctx 8% │ 5h 61% left (resets 14:30) │ 7d 83% left (resets 08/26) │ doitservers
                        ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾
  segment 3/5 · {5h} {5h_reset}

  ← → move   < > reorder   d delete   a add field   e edit text
```

You are editing the real line, not a list of checkboxes — what you see is what
your CLI will print, in the theme it will print it in.

Before writing anything it takes a backup, shows you a diff, and asks. It only
ever touches the `statusLine` key. If your settings file contains comments it
will not rewrite it at all — it prints the snippet for you to paste.

## Troubleshooting

**The line is blank.** The CLI sent nothing on stdin, which is normal before a
session starts. Check it directly:

```sh
echo '{"model":{"display_name":"Opus 5"},"context_window":{"used_percentage":8}}' | npx -y hudline
```

**The line says `hudline: …`.** That is the error, printed where you can see it —
a status line has no other output channel. `payload is not valid JSON` means the
CLI sent something unexpected; `unknown theme x` and format errors name the
problem and the column.

**A field prints as `{ctx}` instead of a value.** That key does not exist. A
typo is passed through literally so it is visible rather than silently dropped.
`--list-fields` has the spellings.

**Boxes or double-width gaps instead of meters.** Your terminal font lacks
`▰`/`▱`. Use `--theme=plain`.

**Everything is one colour.** The terminal is reporting 8-colour support.
`COLORTERM=truecolor` if you know better, or `--theme=plain` if you do not.

**It got slow.** Only token fields read the transcript. Drop `{in}` `{out}`
`{th}` `{cr}` `{cw}` `{tot}` from your Format and nothing is read at all.

**It looks different after upgrading from 0.3.x.** `neon` became the default
theme in 0.4.0. Your Format is untouched — a Format says what to show and a
theme says how — but it is now painted. `--theme=plain` restores the old look
exactly.

## Full manual

[docs/INSTALL.md](docs/INSTALL.md) — per-CLI settings paths for WSL, macOS and
Windows, manual installation, verification, troubleshooting, and migrating from
`cc-token-statusline`.

## Develop

```sh
npm test
echo '{"model":{"display_name":"Opus 5"}}' | node bin/hudline.js --no-color
```

`CONTEXT.md` is the glossary; `docs/adr/` records the decisions that are hard to
reverse and would otherwise look arbitrary.

## License

MIT

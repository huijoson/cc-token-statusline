# Context

Glossary for `cc-token-statusline`. Terms only — no implementation detail, no spec.

## Status line

The single line of text this package writes to stdout. Claude Code renders it
verbatim beneath the prompt. It is the entire product surface.

## Host

An agent CLI that renders a Status line by **running a command and displaying
its stdout** — Claude Code, GitHub Copilot CLI, Antigravity CLI, Qwen Code,
Cursor CLI, Factory Droid. Every Host uses that same mechanism and a different
Payload shape. A Host is the thing a Status line is installed *into*.

Being an agent CLI is not enough to be a Host. Codex CLI and opencode render
their status lines from a fixed set of built-in items and run no command at
all, so nothing here can be installed into them — a limit of the CLI, not a gap
in this package.

## Payload

The JSON object a Host writes to this package's stdin on every refresh. The
sole source of live data while rendering. This package never reads a Host's
settings file in order to render.

## Adapter

The per-Host mapping from Payload shape to Fields. The Adapter is what makes
one Format portable: `{ctx}` names a *meaning*, and each Adapter knows where
that meaning lives in its own Host's Payload. An Adapter also declares which
Fields its Host cannot supply at all — those Fields are permanently Missing
there.

## Field

One addressable piece of data drawn from the Payload — `ctx`, `wk`, `in`,
`model`, `effort`. A Field is a **value**, not a value plus a label: the label
is authored by whoever writes the Format (see below), never by the Field
itself.

## Available / Missing

A Field is **Missing** when the Payload does not carry it — `wk` under API-key
auth, `effort` on a model that has no effort setting, `cwd` when absent.
Missing is not the same as zero: a token count of 0 is Available.

**Policy: a Missing Field never renders a placeholder.** It causes the text
around it to disappear instead. `n/a` is not written, because status line width
is the scarcest resource in the product.

## Format

The user-authored description of what the Status line should look like. The
Format is the configuration surface of this package — designing a status line
*means* writing a Format.

## Default format

The Format used when the user supplies none. It is a product decision, not a
fallback: `npx -y cc-token-statusline` with no arguments must produce a status
line worth using as-is. Configuration is an escape hatch, never a prerequisite.

## Segment

A top-level unit of the Format, delimited by `|`. A Segment is the **unit of
disappearance**: a Missing Field that no Group encloses takes its whole Segment
with it. Surviving Segments are joined by the Separator.

## Group

`[...]` inside a Segment. A Group is a narrower unit of disappearance than a
Segment, and may nest. A Missing Field removes only its innermost enclosing
Group.

## Placeholder

`{field}` inside a Format. Substituted with a Field's value.

## Separator

The string placed between surviving Segments. Not part of the Format — the `|`
in a Format marks a boundary, it is not itself the Separator.

## Threshold colour

Colour applied to a Field's value according to how alarming the value is
(context nearly full, weekly quota nearly spent). It belongs to the **Field**,
not to the Format: it answers "is this number dangerous right now", which is a
property of the data. Literal text authored in a Format is never coloured.

## Wizard

The interactive, run-once mode (`init`) that builds a Format by menu and
installs it into a Host's settings file. The Wizard is a *writer*; the renderer
is a *reader*. They share the Format and nothing else — notably, the renderer
must never pay for the Wizard's existence at startup.

## Installing

Writing a Format into a Host's settings file. Constrained by one rule: a Host's
settings file belongs to the Host and to the user, never to this package. Only
the `statusLine` key may be touched, a backup is taken first, the change is
shown before it is made, and any file this package cannot round-trip losslessly
(comments, non-standard JSON) is never written — the Wizard prints the snippet
instead.

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

One addressable piece of data — `ctx`, `wk`, `in`, `model`, `effort`. A Field
is a **value**, not a value plus a label: the label is authored by whoever
writes the Format (see below), never by the Field itself. A Field may know more
than one Representation of its value; which one is used is not its decision.

Most Fields are drawn from the Payload and some from a transcript. A
**derived** Field is drawn from other Fields instead — it is the one kind that
knows other Fields exist, and it still never learns which Host it is running
on.

## Quota window

A time-bounded allowance reported by a Host. The **5-hour quota window** and
the **weekly quota window** each report the percentage of allowance remaining
and, when available, their own reset time. They are separate allowances: one
does not reduce or reset the other.

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

## Theme

The **how** of a Status line, as against the Format's **what**. A Theme owns
the palette every colour is drawn from, which Representation of a Field is
drawn, the Separator, the phrasebook a Narration is said in, and the colour of
the literal text a Format carries.

Literal text is of two kinds and a Theme colours them apart. The words a
Format's author wrote are **content**. The punctuation around them — brackets,
parens, the Separator — is the **skeleton** holding the content up. Painting
the skeleton as loudly as the content is the difference between a line that is
coloured and a line that is designed.

The division is the one an Adapter already draws for Hosts, applied to
appearance: one Format survives a change of Theme, because a Format never names
a colour. Whoever writes a Format cannot choose colours, and does not have to.

## Chip

A Field drawn with a filled background rather than coloured text. A Chip is how
a Theme gives one Field visual weight without depending on terminal width: the
fill sits behind that Field's own characters, so nothing is padded out to the
edge of the screen and nothing breaks when the line wraps.

## Representation

One of the forms a Field's value can take — `61%` and `▰▰▰▱▱ 61%` are two
Representations of the same Field. The Field declares which Representations it
has; the **Theme** chooses among them.

That choice can change how wide the Status line is. This is the Theme's to
make, not a fault: it is the same trade the reader makes by picking a look.

## Meter

A Representation that draws a percentage as a bar. A Meter's footprint is fixed
— the spent part of the track is drawn, not left blank — so a Status line does
not jitter as the value it reports moves.

## Narration

A derived Field that says, in one sentence, the most alarming thing true right
now — and says nothing at all when nothing is. Saying nothing is the normal
case: a Narration that is Missing takes its Segment with it, so the line simply
does not carry one.

It decides *what* is worth saying by asking the Threshold colour rather than by
keeping cut-offs of its own. A number painted red and a sentence saying all is
well cannot end up side by side if there is only one place that answer comes
from. It says **one** thing, and picks the one that will stop the reader soonest
rather than the one with the worst number. A weekly quota at 12% is the worse
news, but nothing can be done about it this hour and a context window at 88%
is three messages away — the sentence goes to whichever the reader can act on
now. A Status line that says four things at once says none of them.

How the thing is said is not its decision either: a Narration yields a token,
and the Theme keeps the phrasebook.

A Narration reports **state**, never events. It cannot say what just happened,
because nothing here remembers a previous render.

## Threshold colour

Colour applied to a Field's value according to how alarming the value is
(context nearly full, weekly quota nearly spent). It belongs to the **Field**,
not to the Format: it answers "is this number dangerous right now", which is a
property of the data.

A Theme supplies the palette a Threshold colour is drawn from, never the
choice: on a Field's value the Threshold colour always wins. A Theme that could
paint a dangerous number in a calm colour would be a Theme that lies, which is
the one thing a Status line must not do.

Literal text is never coloured *by the author of a Format*. It is coloured by
the Theme.

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

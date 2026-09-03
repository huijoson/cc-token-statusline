# 4. A Theme colours literal text; the Format language does not

Date: 2026-09-03

## Status

Accepted.

## Context

Until now the rule was absolute: colour belonged to a Field, applied to its
value according to how alarming that value was, and *literal text authored in a
Format was never coloured*. `CONTEXT.md` said so and the README repeated it.

That rule made a whole class of status line impossible to build. A designed
look — the reason anyone picks one status line over another — is mostly the
colour of the things that are **not** values: the labels, the separator, the
brackets and parens. With the rule in place, every line this package could
produce was white text with a few coloured numbers in it.

## Decision

Introduce a **Theme**: the *how* of a Status line, as against the Format's
*what*. A Theme owns the palette, the colour of literal text, which
Representation of a Field is used, and the wording of the Narration.

The old rule is not deleted, it is made precise. Literal text is never coloured
**by the author of a Format**. It is coloured by the Theme.

## Alternatives

**Add colour syntax to the Format language** — `{#ff1f8f:ctx}` or similar.
Rejected. ADR-0001 chose a format *string* on the premise that it is short
enough to live inside a settings file and be read at a glance; a string with a
hex code in front of every label is neither. It would also invert the
responsibility the language was designed around: a Format would stop describing
what to show and start describing what it looks like, and changing the look
would mean rewriting every user's string.

**Leave the rule alone.** Rejected: it is an answer of "this product cannot
have a look", which is not a trade-off, only a refusal.

## Consequences

- A Format never names a colour, so one Format survives a change of Theme
  exactly as ADR-0002 made it survive a change of Host.
- Threshold colour still wins on a Field's value. A Theme supplies the palette
  that "danger" is drawn from and never the decision that this number is
  dangerous — a Theme that could paint a dangerous number calm would be a Theme
  that lies, and a Status line that lies is worse than none.
- Themes are authored in 24-bit hex, because the palettes they are taken from
  are. What a terminal can show is a separate question, answered once from
  `COLORTERM`/`TERM` and degraded to 256 or to the basic eight.
- A Theme may change how wide the line is, because it chooses Representations
  and a Meter is wider than `61%`. This is the Theme's to decide. It is also
  why a Theme may carry a Format of its own — used only when nobody supplied
  one, never as an override.

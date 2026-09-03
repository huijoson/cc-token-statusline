# 6. The designed Theme is the default

Date: 2026-09-03

## Status

Accepted. Supersedes the default set in [ADR-0004](0004-a-theme-colours-literal-text.md),
which introduced Themes with `plain` as the default.

## Context

Themes shipped with `plain` as the default and `neon` one flag away. The
reasoning was conservative: the line that renders everywhere should be the line
you get without asking.

That reasoning answers the wrong question. Nobody installs a status line to get
the line their terminal was already capable of. They install it because they
saw one they wanted. A default that has to be discovered, in a README, before
the product looks like the thing that sold it, is a default that hides the
product.

The conservative case also weakened once measured. `neon` needs 256 colours and
two Unicode code points; it degrades to the basic eight on its own, and the
Meter's glyphs were already chosen to be East Asian Width Neutral precisely so
they would not break in a CJK terminal.

## Decision

`neon` is the default Theme. `plain` remains, unchanged and byte-identical to
what shipped before Themes existed, at `--theme=plain`.

Separately, a Resolver constructed without a Theme uses `plain` rather than the
product default. Those are two different questions wearing one word: what a new
install should look like, and what a caller who never mentioned appearance
should get. The second must not move when the first does.

## Alternatives

**Keep `plain` as the default.** Rejected: it optimises for the terminal that
cannot show the product over the user who chose it, and the population of the
first is small and shrinking.

**Detect the terminal and pick a Theme from it.** Rejected. Colour *depth* is
already detected, which is the part a terminal can be asked about honestly.
Whether a font has `▰` is not answerable from `TERM`, so this would be a guess
wearing the costume of a measurement — and a status line that silently changes
shape between machines is worse than one that is plain on both.

**Ship `neon` as the default but without the token breakdown.** Rejected by the
person whose line it is. The measurement that had justified leaving it out —
that the token Fields cost a transcript read on every render — turned out to be
7ms on a 1.5MB transcript. Width remains a real cost, and the answer to it is
`--format`, which every user already has.

## Consequences

- An existing install keeps its `--format` and gains the new look, because a
  Format says what to show and a Theme says how. This is the intended division
  working, and it is still a visible change to a line somebody was used to. It
  wants a minor version and a line in the changelog, not a silent patch.
- `--theme=plain` is now something the Wizard writes into a settings file,
  where `--theme=neon` used to be. A flag that restates the default is noise,
  and which way round that falls is `DEFAULT_THEME`'s to say.
- The default line is 138 columns wide with a transcript to read from. It will
  wrap on an 80-column terminal. Trimming it is `--format`'s job.

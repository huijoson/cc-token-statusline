# 1. Configuration is a Format string, not a config file

Date: 2026-08-25

## Status

Accepted

## Context

The package needed to become configurable: which Fields appear, in what order,
under what labels. Three shapes were considered.

1. **Flags** — keep `--show` / `--hide`, add ordering and a separator flag.
2. **A Format string** — `--format="ctx {ctx} | {model}"`, one CLI argument.
3. **A config file** — `~/.hudline.json`, a Segment array with per-Segment
   labels, colours and thresholds.

The decision is easy to mistake for reversible. It is not: whichever shape is
chosen becomes the thing every user writes into six different CLIs' settings
files, and it is quoted in every piece of documentation anyone else writes
about the tool.

## Decision

The Format string.

The output of this program is **one line of text**. A Format string is
isomorphic to its own output — you can look at the Format and know what will be
printed. Neither a flag set nor a config file has that property; both make the
user hold a translation in their head.

The config file was rejected specifically. Its extra expressive power over a
Format string is roughly one feature — per-user colour thresholds — and its
cost is an entire ecosystem: a file to locate, a schema to version, a merge
policy between project and global, and a second place to look when the status
line is wrong.

## Consequences

A future reader will notice that the Wizard **does** write files, and will
reasonably ask why the tool cannot just read its own. The answer is that
writing a Host's `statusLine` key once, on request, is not the same commitment
as owning a configuration format: the Wizard's output is a command string that
stands alone and can be pasted, mailed or committed. Nothing this package
writes is required for it to run.

Colours and their thresholds are therefore not user-configurable. If that turns
out to matter, the fix is plain numeric flags (`--ctx-warn=75`), not Format
syntax: a threshold is a number, not a layout.

Number formatting, arithmetic, conditionals beyond "Missing disappears",
multi-line output and width control are all deliberately out of scope. Adding
them would be building a template language, which is a different product from a
status line.

# 2. One Format across many CLIs, via Field semantics and per-Host extractors

Date: 2026-08-25

## Status

Accepted

## Context

Six agent CLIs render a status line the same way — pipe JSON to a command,
display its stdout — and each pipes a differently shaped JSON. Claude Code
carries rate limits and an effort level; Qwen Code carries neither; Antigravity
reports one quota rather than two windows and adds a git block; Copilot CLI puts
conversation token totals in the payload that Claude Code only has in a
transcript file; Factory Droid does not document its payload at all.

Two further CLIs are not candidates at all. Codex CLI and opencode build their
status lines from a fixed list of built-in items and run no command, so there is
nothing to install into.

The obvious approach is one built-in default line per CLI, each written against
that CLI's payload. It is also the approach that makes a user's configuration
non-transferable: moving between CLIs, or configuring two, means learning two
vocabularies.

## Decision

A `{field}` names a **meaning**, not a JSON path. Two layers implement it:

- a **Field** definition owns the key, its label, its formatting, its threshold
  colour and whether it comes from the Payload or the transcript;
- a per-Host **Adapter** owns only *where the raw value is found*, and omits
  the Fields its Host cannot supply.

A Field a Host cannot supply is permanently Missing there, and the existing
"Missing disappears" rule then degrades a shared Format quietly and correctly.

Four Hosts ship in 0.3.0 — Claude Code, GitHub Copilot CLI, Antigravity CLI and
Qwen Code. Cursor CLI and Factory Droid are listed in the Wizard as not yet
supported; Codex CLI and opencode are listed as *cannot* be supported. Those two
labels are deliberately different, because "not yet" invites waiting for a
release that will never come.

## Consequences

Adding a Host is a table of extractors plus a sampled payload; adding a Field is
one definition plus an entry per Host. Formatting and colour cannot drift
between Hosts, because neither lives in an Adapter.

More than one Host was a deliberate minimum: an abstraction validated against a
single implementation is not validated. It paid for itself twice. `7d` reports
quota *left* while Claude Code reports quota *used*, and that inversion belongs
in the Adapter. And Copilot CLI supplies `in`/`out`/`tot` from its Payload
whereas Claude Code needs a transcript read — so a Field's `source` had to
become a *default*, overridable by any Adapter that can do better, rather than a
fact about the Field. One Host would have hidden both.

Shipping two Hosts while listing four more is a deliberate admission of partial
coverage. Offering all six and having four print nothing useful would be worse
than saying which ones work.

The cost of adding each remaining Host is not design work — it is sampling a
real payload from a running CLI. That is why they are listed rather than
designed around.

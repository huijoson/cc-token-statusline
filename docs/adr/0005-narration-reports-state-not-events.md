# 5. The Narration reports state, not events

Date: 2026-09-03

## Status

Accepted.

## Context

The `neon` Theme wanted a narrator in the spirit of a JRPG status window —
a line of prose about what is going on, not another number.

The genre's narration is **event** driven: it reports what just happened, one
message at a time, advanced by the reader. A Status line is **state** driven:
it is re-rendered several times a second from a Payload snapshot, by a process
that starts fresh every time, and nobody controls its pacing.

The Payload carries no events. Everything in it is current state — which model,
how full the context is, which subagent is running. There is nothing in it that
says what just happened.

## Decision

The Narration is a pure function of the current Payload. It names the most
alarming thing that is **true right now**, and is Missing when nothing is.

It never reports change.

## Alternatives

**Change narration.** Diff against the previous render, held in a state file
per session. Rejected on three counts: it writes to disk several times a second
on the hot path; two Hosts rendering at once would race for the same file; and
it contradicts `CONTEXT.md` outright, where the Payload is the sole source of
live data while rendering.

**Event narration.** Read the tail of the transcript for the tool that just
ran. Rejected: the transcript is already a multi-megabyte read, its shape is
not ours to depend on, and — decisively — the tail changes on every refresh, so
the messages would strobe faster than they could be read. Making them legible
would need a "hold this message for N seconds" rule, which is the state file
again, wearing a hat.

## Consequences

- The renderer stays stateless. Nothing is written to disk, nothing is cleaned
  up, and two CLIs can render at once without knowing about each other.
- Messages are stable by construction: a Narration only changes when a value
  crosses a threshold, so it does not flicker and needs no pacing rule.
- The Narration asks the Threshold colour what counts as alarming rather than
  keeping cut-offs of its own. This is what makes it impossible for the line to
  paint a number red and, beside it, say all is well.
- "Why does it not tell me what just happened?" is now answerable, which is the
  reason this file exists.

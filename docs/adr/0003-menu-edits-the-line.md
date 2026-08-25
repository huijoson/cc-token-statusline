# 3. The Wizard edits the rendered line, not a list of fields

Date: 2026-08-25

## Status

Accepted

## Context

Configuration needed a menu. The default shape for "let the user pick items and
order them" is a checkbox list plus a reorder screen. An earlier revision of
this design rejected an interactive menu altogether, on the grounds that a
raw-mode TUI is expensive to write and unreliable across terminals.

That reasoning contained an unexamined premise: that a menu must be a list.

## Decision

The Wizard's editing surface is the **rendered status line itself**. The cursor
moves along Segments of the real, coloured, sample-data line; `<` and `>` move
the Segment under the cursor; `d` deletes it; `a` inserts a Field at the cursor;
`e` edits its literal text.

There is no preview pane, because the object being edited is the preview.
Selection, ordering and labelling therefore all happen on one screen, where a
list-based design needs three and shows the result on none of them.

Only universally reported keys are used: arrows, Enter, Escape, Backspace and
plain letters. No Shift- or Ctrl-modified arrows, whose terminal reporting
differs across tmux, Windows Terminal, iTerm and embedded terminals.

## Consequences

The editor must compute display width in terminal cells rather than string
length, because the cursor is drawn underneath the line and CJK labels are a
primary use case, not an edge case. Overflow scrolls horizontally by whole
Segments; it never wraps, since a wrapped preview would misrepresent a
one-line product.

A fallback remains necessary and is not wasted work. Running `hudline edit`
from inside the agent CLI being configured — the most natural thing for a user
to try — puts a raw-mode TUI inside another TUI. That case is detected and
degrades to typing an ordered list of numbers, which is not a lesser form of
selection-plus-reorder: it is both, in one input.

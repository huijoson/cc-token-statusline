"use strict";

const { renderFormat, splitSegments } = require("../format.js");
const { displayWidth } = require("../width.js");
const { catalogueRows, renderRow } = require("../catalogue.js");
const { decode } = require("./keys.js");
const { Screen } = require("./screen.js");

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const INVERSE = "\x1b[7m";

// The Status line *is* the editing surface. There is no preview pane because
// the thing being configured is one line — so the line itself can carry the
// cursor, and every keystroke shows the finished result rather than a proxy
// for it. Selection, ordering and labels then all happen on one screen.
class LineEditor {
  constructor({ host, resolver, format, separator = " | ", out = process.stdout }) {
    this.host = host;
    this.resolver = resolver;
    this.separator = separator;
    this.screen = new Screen(out);
    this.out = out;
    this.original = format;
    this.segments = splitSegments(format).filter((s) => s.trim() !== "");
    this.cursor = 0;
    this.mode = "line"; // line | insert | label
    this.message = "";
  }

  // Each Segment rendered on its own, so the cursor can be placed under one.
  parts() {
    return this.segments.map((source) => {
      const text = renderFormat(source, this.resolver, { separator: this.separator });
      return { source, text, hidden: text === "" };
    });
  }

  // Scroll by whole Segments rather than by cells: a half-drawn Segment would
  // misrepresent what the Host is going to print.
  visibleWindow(parts, width) {
    if (parts.length === 0) return { from: 0, to: 0 };
    const cell = (part) => (part.hidden ? displayWidth("(hidden)") : displayWidth(part.text));
    let from = this.cursor;
    let to = this.cursor + 1;
    let used = cell(parts[this.cursor]);
    const sep = displayWidth(this.separator);
    while (true) {
      const canLeft = from > 0 && used + sep + cell(parts[from - 1]) <= width;
      const canRight = to < parts.length && used + sep + cell(parts[to]) <= width;
      if (canLeft) { used += sep + cell(parts[from - 1]); from--; }
      else if (canRight) { used += sep + cell(parts[to]); to++; }
      else break;
    }
    return { from, to };
  }

  lineFrame() {
    const parts = this.parts();
    const width = Math.max(20, this.screen.columns - 4);
    const { from, to } = this.visibleWindow(parts, width);

    let line = "";
    let caretAt = 0;
    let caretWidth = 1;
    for (let i = from; i < to; i++) {
      if (i > from) line += this.separator;
      const part = parts[i];
      const text = part.hidden ? `${DIM}(hidden)${RESET}` : part.text;
      if (i === this.cursor) {
        caretAt = displayWidth(line);
        caretWidth = Math.max(1, displayWidth(text));
      }
      line += text;
    }

    const prefix = from > 0 ? `${DIM}‹${RESET} ` : "  ";
    const suffix = to < parts.length ? ` ${DIM}›${RESET}` : "";
    const caret = " ".repeat(caretAt + 2) + `${BOLD}${"‾".repeat(caretWidth)}${RESET}`;

    const current = parts[this.cursor];
    const keys = current ? fieldKeysIn(current.source) : [];
    const detail = keys.length
      ? keys.map((key) => `{${key}}`).join(" ") + (current.hidden ? "  (nothing to show right now)" : "")
      : "literal text";

    return [
      "",
      prefix + line + suffix,
      caret,
      `  ${DIM}segment ${parts.length ? this.cursor + 1 : 0}/${parts.length} · ${detail}${RESET}`,
      "",
    ];
  }

  helpFrame() {
    return [
      `  ${DIM}← →${RESET} move   ${DIM}< >${RESET} reorder   ${DIM}d${RESET} delete   ${DIM}a${RESET} add field   ${DIM}e${RESET} edit text`,
      `  ${DIM}r${RESET} reset    ${DIM}↵${RESET} done       ${DIM}q${RESET} cancel`,
      this.message ? `  ${this.message}` : "",
    ];
  }

  format() {
    return this.segments.join("|");
  }

  render() {
    this.screen.draw([
      `  ${BOLD}${this.host.name}${RESET} ${DIM}status line${RESET}`,
      ...this.lineFrame(),
      ...this.helpFrame(),
    ]);
  }

  clampCursor() {
    if (this.segments.length === 0) this.cursor = 0;
    else this.cursor = Math.max(0, Math.min(this.segments.length - 1, this.cursor));
  }

  handle(key) {
    this.message = "";
    switch (key.name) {
      case "left": this.cursor--; break;
      case "right": this.cursor++; break;
      case "home": this.cursor = 0; break;
      case "end": this.cursor = this.segments.length - 1; break;
      case "enter": return "done";
      case "escape": case "ctrl-c": return "cancel";
      case "char": return this.command(key.value);
      default: break;
    }
    this.clampCursor();
    return null;
  }

  command(char) {
    switch (char) {
      case "q": return "cancel";
      case "<": this.swap(-1); break;
      case ">": this.swap(1); break;
      case "d": this.remove(); break;
      case "a": return "insert";
      case "e": return "label";
      case "r":
        this.segments = splitSegments(this.original).filter((s) => s.trim() !== "");
        this.cursor = 0;
        this.message = `${DIM}reset to the starting line${RESET}`;
        break;
      default: break;
    }
    this.clampCursor();
    return null;
  }

  swap(direction) {
    const target = this.cursor + direction;
    if (target < 0 || target >= this.segments.length) return;
    const [moved] = this.segments.splice(this.cursor, 1);
    this.segments.splice(target, 0, moved);
    this.cursor = target;
  }

  remove() {
    if (this.segments.length === 0) return;
    this.segments.splice(this.cursor, 1);
    this.clampCursor();
  }

  insertSegment(source) {
    const at = this.segments.length === 0 ? 0 : this.cursor + 1;
    this.segments.splice(at, 0, source);
    this.cursor = at;
  }

  replaceSegment(source) {
    if (this.segments.length === 0) this.insertSegment(source);
    else this.segments[this.cursor] = source;
  }
}

function fieldKeysIn(source) {
  const keys = [];
  const re = /\{([^}]+)\}/g;
  let match;
  while ((match = re.exec(source)) !== null) keys.push(match[1].trim());
  return keys;
}

// The insert picker. Fields the chosen Host cannot supply are shown greyed
// with a reason rather than hidden — Field availability is a property of the
// Host, and hiding it would leave the user guessing why their CLI is different.
class FieldPicker {
  constructor({ host, resolver, used, out = process.stdout }) {
    this.host = host;
    this.resolver = resolver;
    this.used = new Set(used);
    this.screen = new Screen(out);
    // Attaching Fields never stand alone, so they are not offered here; they
    // arrive with the Field they modify.
    this.items = [];
    let group = null;
    for (const row of catalogueRows(host, resolver)) {
      if (row.group !== group) {
        group = row.group;
        this.items.push({ type: "group", label: group });
      }
      this.items.push({ type: "field", ...row });
    }
    this.index = this.items.findIndex((item) => item.type === "field");
  }

  move(direction) {
    let next = this.index;
    for (let i = 0; i < this.items.length; i++) {
      next = (next + direction + this.items.length) % this.items.length;
      if (this.items[next].type === "field") break;
    }
    this.index = next;
  }

  render() {
    const height = Math.max(6, (this.screen.out.rows || 24) - 8);
    let from = Math.max(0, Math.min(this.index - Math.floor(height / 2), this.items.length - height));
    from = Math.max(0, from);
    const window = this.items.slice(from, from + height);

    const width = this.screen.columns;
    const lines = [`  ${BOLD}add a field${RESET} ${DIM}· ↑↓ choose · ↵ insert · esc back${RESET}`, ""];
    for (let i = 0; i < window.length; i++) {
      const item = window[i];
      if (item.type === "group") {
        lines.push(`  ${DIM}${item.label}${RESET}`);
        continue;
      }
      const selected = from + i === this.index;
      const row = renderRow(item, this.host, {
        width: width - 2,
        prefix: selected ? INVERSE : "",
        marker: "  ",
        note: this.used.has(item.key) ? "already in the line" : null,
      });
      lines.push(row + (selected ? RESET : ""));
    }
    lines.push("");
    this.screen.draw(lines);
  }

  // Same contract as Select: the driver does not need to know which overlay it
  // is talking to. Without this the picker crashed on Enter — the one key it
  // exists to receive.
  handle(key) {
    if (key.name === "up") this.move(-1);
    else if (key.name === "down") this.move(1);
    else if (key.name === "enter") return "submit";
    else if (key.name === "escape" || key.name === "ctrl-c") return "cancel";
    return null;
  }

  selected() {
    const item = this.items[this.index];
    return item && item.type === "field" ? item : null;
  }
}

module.exports = { LineEditor, FieldPicker, fieldKeysIn };

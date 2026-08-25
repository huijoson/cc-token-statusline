"use strict";

const { Screen } = require("./screen.js");

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";
const INVERSE = "\x1b[7m";

// A one-column arrow-key list. Disabled rows stay visible with their reason
// attached: an unsupported Host is information the user needs, and removing
// the row would only make its absence mysterious.
class Select {
  constructor({ title, items, out = process.stdout }) {
    this.title = title;
    this.items = items;
    this.screen = new Screen(out);
    this.index = items.findIndex((item) => !item.disabled);
    if (this.index < 0) this.index = 0;
  }

  move(direction) {
    let next = this.index;
    for (let i = 0; i < this.items.length; i++) {
      next = (next + direction + this.items.length) % this.items.length;
      if (!this.items[next].disabled) break;
    }
    this.index = next;
  }

  render() {
    const lines = [`  ${BOLD}${this.title}${RESET}`, ""];
    this.items.forEach((item, index) => {
      const selected = index === this.index;
      const head = selected ? `${INVERSE} ` : "  ";
      const tail = selected ? ` ${RESET}` : "";
      const label = item.disabled ? `${DIM}${item.label}${RESET}` : item.label;
      lines.push(`${head} ${label}${tail}`);
      if (item.detail) lines.push(`     ${DIM}${item.detail}${RESET}`);
    });
    lines.push("", `  ${DIM}↑↓ choose · ↵ select · esc cancel${RESET}`);
    this.screen.draw(lines);
  }

  handle(key) {
    if (key.name === "up") this.move(-1);
    else if (key.name === "down") this.move(1);
    else if (key.name === "enter") return "submit";
    else if (key.name === "escape" || key.name === "ctrl-c" || (key.name === "char" && key.value === "q")) return "cancel";
    return null;
  }

  value() {
    return this.items[this.index];
  }
}

// Editing a Segment's source rather than only its label: the label is the
// literal text of a Segment, so an editor for one is an editor for the other,
// and the more general one costs nothing extra.
class TextInput {
  constructor({ title, hint, value = "", out = process.stdout }) {
    this.title = title;
    this.hint = hint;
    this.text = value;
    this.screen = new Screen(out);
  }

  render() {
    this.screen.draw([
      `  ${BOLD}${this.title}${RESET}`,
      "",
      `  ${this.text}${INVERSE} ${RESET}`,
      "",
      `  ${DIM}${this.hint}${RESET}`,
      `  ${DIM}↵ apply · esc cancel${RESET}`,
    ]);
  }

  handle(key) {
    if (key.name === "char") this.text += key.value;
    else if (key.name === "paste") this.text += key.value;
    else if (key.name === "backspace") this.text = [...this.text].slice(0, -1).join("");
    else if (key.name === "enter") return "submit";
    else if (key.name === "escape" || key.name === "ctrl-c") return "cancel";
    return null;
  }

  value() {
    return this.text;
  }
}

module.exports = { Select, TextInput };

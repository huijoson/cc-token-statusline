"use strict";

const { displayWidth } = require("../width.js");

// Redraws a fixed block in place. Every frame reports how many terminal rows
// it occupied, so the next frame can walk back up and clear exactly that much
// — anything else leaves debris when the window is narrow and lines wrap.
class Screen {
  constructor(out = process.stdout) {
    this.out = out;
    this.rows = 0;
  }

  get columns() {
    return this.out.columns || 80;
  }

  draw(lines) {
    if (this.rows > 0) this.out.write(`\x1b[${this.rows}A\r\x1b[0J`);
    const text = lines.join("\n");
    this.out.write(text + "\n");
    this.rows = lines.reduce(
      (total, line) => total + Math.max(1, Math.ceil(displayWidth(line) / this.columns)),
      0
    );
  }

  done() {
    this.rows = 0;
  }
}

module.exports = { Screen };

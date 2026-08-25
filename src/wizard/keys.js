"use strict";

// Only the keys every terminal agrees on: arrows, Enter, Escape, Backspace and
// plain letters. No Shift+arrow, no Ctrl+arrow, no mouse — their reporting
// differs across tmux, Windows Terminal, iTerm and the terminals embedded in
// the agent CLIs this tool installs into, and "works on my machine" is the
// worst class of bug to ship in a configuration tool.
function decodeOne(s) {
  if (s === "\x1b[A") return { name: "up" };
  if (s === "\x1b[B") return { name: "down" };
  if (s === "\x1b[C") return { name: "right" };
  if (s === "\x1b[D") return { name: "left" };
  if (s === "\x1b[H" || s === "\x1b[1~") return { name: "home" };
  if (s === "\x1b[F" || s === "\x1b[4~") return { name: "end" };
  if (s === "\r" || s === "\n") return { name: "enter" };
  if (s === "\x1b") return { name: "escape" };
  if (s === "\x7f" || s === "\b") return { name: "backspace" };
  if (s === "\x03") return { name: "ctrl-c" };
  if (s === "\t") return { name: "tab" };
  if (s.length === 1 && s >= " ") return { name: "char", value: s };
  if (s.length > 1 && !s.startsWith("\x1b")) return { name: "paste", value: s };
  return { name: "unknown", raw: s };
}

// A read can carry more than one keystroke: terminals batch under load, tmux
// forwards in bursts, and a paste arrives as one chunk. Decoding only the
// first key would silently drop the rest, which reads to the user as a stuck
// editor — so a chunk is scanned into a sequence.
function decodeAll(chunk) {
  const text = chunk.toString("utf8");
  const keys = [];
  let i = 0;

  while (i < text.length) {
    if (text[i] === "\x1b" && text[i + 1] === "[") {
      let end = i + 2;
      while (end < text.length && !/[A-Za-z~]/.test(text[end])) end++;
      if (end < text.length) {
        keys.push(decodeOne(text.slice(i, end + 1)));
        i = end + 1;
        continue;
      }
    }
    const char = String.fromCodePoint(text.codePointAt(i));
    keys.push(decodeOne(char));
    i += char.length;
  }
  return keys;
}

function decode(chunk) {
  return decodeOne(chunk.toString("utf8"));
}

module.exports = { decode, decodeOne, decodeAll };

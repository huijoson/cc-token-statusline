"use strict";

// Display width of a string in terminal cells. The Wizard draws a cursor
// underneath a rendered Status line, so `"窗".length === 1` is the wrong
// question — the cell count is what the underline has to match. CJK labels are
// a primary use case here, not an edge case.

const ANSI = /\x1b\[[0-9;]*m/g;

// East Asian Wide / Fullwidth ranges, plus the emoji blocks that terminals
// render double-width. Ranges are inclusive and kept sorted for binary search.
const WIDE = [
  [0x1100, 0x115f], [0x2e80, 0x303e], [0x3041, 0x33ff],
  [0x3400, 0x4dbf], [0x4e00, 0x9fff], [0xa000, 0xa4cf],
  [0xa960, 0xa97f], [0xac00, 0xd7a3], [0xf900, 0xfaff],
  [0xfe10, 0xfe19], [0xfe30, 0xfe6f], [0xff00, 0xff60],
  [0xffe0, 0xffe6], [0x1f004, 0x1f004], [0x1f0cf, 0x1f0cf],
  [0x1f18e, 0x1f18e], [0x1f191, 0x1f19a], [0x1f200, 0x1f320],
  [0x1f32d, 0x1f335], [0x1f337, 0x1f37c], [0x1f37e, 0x1f393],
  [0x1f3a0, 0x1f3ca], [0x1f3cf, 0x1f3d3], [0x1f3e0, 0x1f3f0],
  [0x1f3f4, 0x1f3f4], [0x1f3f8, 0x1f43e], [0x1f440, 0x1f440],
  [0x1f442, 0x1f4fc], [0x1f4ff, 0x1f53d], [0x1f54b, 0x1f54e],
  [0x1f550, 0x1f567], [0x1f57a, 0x1f57a], [0x1f595, 0x1f596],
  [0x1f5a4, 0x1f5a4], [0x1f5fb, 0x1f64f], [0x1f680, 0x1f6c5],
  [0x1f6cc, 0x1f6cc], [0x1f6d0, 0x1f6d2], [0x1f6eb, 0x1f6ec],
  [0x1f910, 0x1f9ff], [0x1fa70, 0x1faff], [0x20000, 0x3fffd],
];

// Combining marks and zero-width joiners occupy no cell of their own.
const ZERO = [
  [0x0300, 0x036f], [0x200b, 0x200f], [0x2028, 0x202e],
  [0xfe00, 0xfe0f], [0xfe20, 0xfe2f], [0x1ab0, 0x1aff],
];

function inRanges(code, ranges) {
  let lo = 0;
  let hi = ranges.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (code < ranges[mid][0]) hi = mid - 1;
    else if (code > ranges[mid][1]) lo = mid + 1;
    else return true;
  }
  return false;
}

function stripAnsi(str) {
  return String(str).replace(ANSI, "");
}

function displayWidth(str) {
  const plain = stripAnsi(str);
  let width = 0;
  for (const char of plain) {
    const code = char.codePointAt(0);
    if (code < 32 || (code >= 0x7f && code < 0xa0)) continue;
    if (inRanges(code, ZERO)) continue;
    width += inRanges(code, WIDE) ? 2 : 1;
  }
  return width;
}

// Truncate to `max` cells, appending `tail` if anything was cut. Used to keep
// the editor's preview inside the terminal without wrapping — a Status line
// that wraps would misrepresent what the Host will actually show.
function truncateToWidth(str, max, tail = "") {
  if (displayWidth(str) <= max) return str;
  const budget = max - displayWidth(tail);
  let out = "";
  let width = 0;
  for (const char of stripAnsi(str)) {
    const w = displayWidth(char);
    if (width + w > budget) break;
    out += char;
    width += w;
  }
  return out + tail;
}

module.exports = { displayWidth, stripAnsi, truncateToWidth };

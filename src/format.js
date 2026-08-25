"use strict";

// The Format language.
//
//   |        splits top-level Segments (the unit of disappearance)
//   [...]    an optional Group; nestable; a narrower unit of disappearance
//   {field}  a Placeholder
//   \x       a literal | [ ] { } or \
//
// A Missing Field removes its innermost enclosing Group. With no enclosing
// Group it removes the whole Segment. Surviving Segments collapse internal
// whitespace runs, trim, and are joined by the Separator.
//
// `|` inside a Group is literal text: a Group lives inside one Segment, so a
// Segment boundary cannot occur there.

class FormatError extends Error {
  constructor(message, column) {
    super(column === undefined ? message : `${message} at column ${column + 1}`);
    this.column = column;
  }
}

const ESCAPABLE = new Set(["|", "[", "]", "{", "}", "\\"]);

function parseFormat(source) {
  const segments = [];
  let stack = [[]]; // innermost node list last
  let text = "";
  let groupOpenedAt = [];

  const flushText = () => {
    if (text) {
      stack[stack.length - 1].push({ t: "text", v: text });
      text = "";
    }
  };
  const endSegment = () => {
    flushText();
    if (stack.length > 1) throw new FormatError("unclosed [", groupOpenedAt[groupOpenedAt.length - 1]);
    segments.push(stack[0]);
    stack = [[]];
  };

  for (let i = 0; i < source.length; i++) {
    const char = source[i];

    if (char === "\\") {
      const next = source[i + 1];
      if (next === undefined) throw new FormatError("trailing \\", i);
      if (!ESCAPABLE.has(next)) throw new FormatError(`unknown escape \\${next}`, i);
      text += next;
      i++;
      continue;
    }

    if (char === "|" && stack.length === 1) {
      endSegment();
      continue;
    }

    if (char === "[") {
      flushText();
      const children = [];
      stack[stack.length - 1].push({ t: "group", c: children });
      stack.push(children);
      groupOpenedAt.push(i);
      continue;
    }

    if (char === "]") {
      if (stack.length === 1) throw new FormatError("unmatched ]", i);
      flushText();
      stack.pop();
      groupOpenedAt.pop();
      continue;
    }

    if (char === "{") {
      const close = source.indexOf("}", i + 1);
      if (close === -1) throw new FormatError("unclosed {", i);
      const key = source.slice(i + 1, close).trim();
      if (!key) throw new FormatError("empty {}", i);
      flushText();
      stack[stack.length - 1].push({ t: "field", k: key });
      i = close;
      continue;
    }

    text += char;
  }

  endSegment();
  return segments;
}

// `resolver.has(key)` distinguishes an unknown Field from a Missing one: an
// unknown key is passed through literally so a typo is visible in the Status
// line itself, which is the only output channel a user ever sees.
function renderNodes(nodes, resolver) {
  let out = "";
  let missing = false;

  for (const node of nodes) {
    if (node.t === "text") {
      out += node.v;
      continue;
    }
    if (node.t === "field") {
      if (!resolver.has(node.k)) {
        out += `{${node.k}}`;
        continue;
      }
      const value = resolver.get(node.k);
      if (value === undefined || value === null || value === "") missing = true;
      else out += value;
      continue;
    }
    // Group: absorbs the Missing signal instead of propagating it outward.
    const inner = renderNodes(node.c, resolver);
    if (!inner.missing) out += inner.text;
  }

  return { text: out, missing };
}

function collapse(text) {
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

function renderFormat(source, resolver, options = {}) {
  const separator = options.separator === undefined ? " | " : options.separator;
  let segments;
  try {
    segments = parseFormat(source);
  } catch (error) {
    if (error instanceof FormatError) return `agenthud: ${error.message}`;
    throw error;
  }

  const rendered = [];
  for (const segment of segments) {
    const result = renderNodes(segment, resolver);
    if (result.missing) continue;
    const text = collapse(result.text);
    if (text) rendered.push(text);
  }
  return rendered.join(separator);
}

// Which Fields a Format mentions — lets the renderer skip work whose only
// consumer is absent, notably reading a multi-megabyte transcript.
function fieldsUsed(source) {
  const keys = new Set();
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.t === "field") keys.add(node.k);
      else if (node.t === "group") walk(node.c);
    }
  };
  try {
    for (const segment of parseFormat(source)) walk(segment);
  } catch {
    return keys;
  }
  return keys;
}

// Segment sources, unparsed — the Wizard edits Segments as text, so it needs
// the original slices rather than the AST.
function splitSegments(source) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (char === "\\") {
      current += char + (source[i + 1] ?? "");
      i++;
      continue;
    }
    if (char === "[") depth++;
    if (char === "]" && depth > 0) depth--;
    if (char === "|" && depth === 0) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

module.exports = { FormatError, parseFormat, renderFormat, fieldsUsed, splitSegments };

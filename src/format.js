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

// Literal text is coloured here and nowhere else, by functions the Theme
// supplies. There are two kinds of it, because they are not the same kind of
// thing: the words a Format's author wrote are content, and the punctuation
// around them is the skeleton holding the content up — the same skeleton the
// Separator belongs to.
//
// Whitespace is matched by neither run and so is never wrapped, which is what
// lets `collapse` keep working on the result.
const WORD_RUN = /^[\p{L}\p{N}_]/u;
const RUNS = /[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]+/gu;

function paintCore(text, paint) {
  if (!paint || (!paint.word && !paint.punct)) return text;
  return text.replace(RUNS, (run) => {
    const brush = WORD_RUN.test(run) ? paint.word : paint.punct;
    return brush ? brush(run) : run;
  });
}

// `resolver.has(key)` distinguishes an unknown Field from a Missing one: an
// unknown key is passed through literally so a typo is visible in the Status
// line itself, which is the only output channel a user ever sees.
function renderNodes(nodes, resolver, paint) {
  let out = "";
  let missing = false;

  for (const node of nodes) {
    if (node.t === "text") {
      out += paintCore(node.v, paint);
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
    const inner = renderNodes(node.c, resolver, paint);
    if (!inner.missing) out += inner.text;
  }

  return { text: out, missing };
}

function collapse(text) {
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

function renderFormat(source, resolver, options = {}) {
  const paint = { word: options.paintText, punct: options.paintPunct };
  const rawSeparator = options.separator === undefined ? " | " : options.separator;
  // A Separator is punctuation whichever characters it is made of.
  const brush = options.paintSeparator;
  const separator = paintCore(rawSeparator, { word: brush, punct: brush });
  let segments;
  try {
    segments = parseFormat(source);
  } catch (error) {
    if (error instanceof FormatError) return `hudline: ${error.message}`;
    throw error;
  }

  const rendered = [];
  for (const segment of segments) {
    const result = renderNodes(segment, resolver, paint);
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

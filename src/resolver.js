"use strict";

const { getField, resolveKey } = require("./fields.js");
const { fieldsUsed } = require("./format.js");
const { getTheme, createPainter, meter } = require("./themes.js");

// Binds a Format to a Host's Payload. Three things decide whether a
// Placeholder produces text:
//
//   unknown key      -> `has` is false; the Format prints it literally
//   Host can't supply-> `get` returns undefined; the Field is Missing
//   value absent     -> `get` returns undefined; the Field is Missing
//
// A fourth party decides what the text *looks* like: the Theme, via a painter.
// It chooses the Representation and the palette, and nothing else here knows
// what a colour is.
function createResolver(host, payload, options = {}) {
  const colour = options.colour !== false;
  const painter = options.painter ?? createPainter(getTheme(), { colour });
  const cache = new Map();
  let transcriptTotals;

  // The transcript is a file read, sometimes of many megabytes, on every
  // refresh. Only pay for it when the Format actually asks for it.
  const wanted = options.format ? fieldsUsed(options.format) : null;
  const needsTranscript = !wanted
    || [...wanted].some((key) => getField(key)?.source === "transcript");

  const readTranscript = () => {
    if (transcriptTotals === undefined) {
      transcriptTotals = options.totals
        ?? (host.transcript ? host.transcript.read(payload) : null);
    }
    return transcriptTotals;
  };

  // An Adapter's `extract` always wins. A Field's `source` is only the default
  // place to look: Copilot CLI puts conversation totals straight in the
  // Payload, so `in`/`out`/`tot` are payload Fields there and transcript Fields
  // on Claude Code — same meaning, different origin, which is exactly the seam
  // the Adapter exists to absorb.
  const rawValue = (key) => {
    const field = getField(key);
    if (!field) return undefined;
    // A derived Field reads other Fields rather than the Payload. It is the one
    // place a Field is allowed to know that other Fields exist, and it still
    // never learns which Host it is running on.
    if (field.source === "derived") return field.derive(rawValue);
    if (typeof host.extract?.[key] === "function") return host.extract[key](payload);
    if (field.source !== "transcript") return undefined;
    if (!host.transcript || !needsTranscript) return undefined;
    const totals = readTranscript();
    if (!totals) return undefined;
    return host.transcript.map[key]?.(totals);
  };

  // The Representation, chosen by the Theme out of what the Field offers.
  const represent = (key, field, raw) => {
    if (field.source === "derived") return painter.phrase(field.format(raw), rawValue);
    const formatted = field.format(raw);
    if (formatted === undefined || formatted === "") return formatted;
    return painter.meters && field.meter ? `${meter(raw)} ${formatted}` : formatted;
  };

  return {
    has(key) {
      return getField(key) !== undefined;
    },
    get(key) {
      const canonical = resolveKey(key);
      if (cache.has(canonical)) return cache.get(canonical);

      const field = getField(canonical);
      let out;
      const raw = rawValue(canonical);
      if (raw !== undefined && raw !== null) {
        const shown = represent(canonical, field, raw);
        if (shown !== undefined && shown !== "") {
          const role = field.colour ? field.colour(raw) : null;
          out = painter.isChip(canonical) ? painter.chip(shown) : painter.wrap(role, shown);
        }
      }
      cache.set(canonical, out);
      return out;
    },
  };
}

// Same contract, backed by a Host's baked-in sample Payload. The Wizard needs
// to render a Status line with nothing running, and a sample keeps that
// preview honest about which Fields the chosen Host can actually supply.
function createSampleResolver(host, options = {}) {
  const totals = host.transcript ? host.sample?.sampleTotals ?? null : null;
  return createResolver(host, host.sample ?? {}, { ...options, totals, format: null });
}

module.exports = { createResolver, createSampleResolver };

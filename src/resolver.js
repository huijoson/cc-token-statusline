"use strict";

const { getField, resolveKey, RESET } = require("./fields.js");
const { fieldsUsed } = require("./format.js");

// Binds a Format to a Host's Payload. Three things decide whether a
// Placeholder produces text:
//
//   unknown key      -> `has` is false; the Format prints it literally
//   Host can't supply-> `get` returns undefined; the Field is Missing
//   value absent     -> `get` returns undefined; the Field is Missing
function createResolver(host, payload, options = {}) {
  const colour = options.colour !== false;
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
    if (typeof host.extract?.[key] === "function") return host.extract[key](payload);
    if (field.source !== "transcript") return undefined;
    if (!host.transcript || !needsTranscript) return undefined;
    const totals = readTranscript();
    if (!totals) return undefined;
    return host.transcript.map[key]?.(totals);
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
        const formatted = field.format(raw);
        if (formatted !== undefined && formatted !== "") {
          const ansi = colour && field.colour ? field.colour(raw) : null;
          out = ansi ? `${ansi}${formatted}${RESET}` : formatted;
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

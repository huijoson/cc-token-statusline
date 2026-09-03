"use strict";

const { clampPercentage } = require("./fields.js");

// A Theme is the *how* of a Status line, as against the Format's *what*: the
// palette every colour is drawn from, the colour of the literal text a Format
// carries, which Representation of a Field is used, and the wording of the
// narration.
//
// What a Theme never decides is *whether* a value is alarming. That is the
// Field's Threshold colour and it always wins; a Theme only says what "danger"
// looks like here. A Theme that could paint a dangerous number calm would be a
// Theme that lies.

const RESET = "\x1b[0m";

// ── colour depth ────────────────────────────────────────────────────────────
// Themes are authored in 24-bit hex because that is what the palettes they
// come from are authored in. What a terminal can actually show is a separate
// question, answered once per process.

function colourDepth(env = process.env) {
  const colorterm = String(env.COLORTERM || "").toLowerCase();
  if (colorterm === "truecolor" || colorterm === "24bit") return 3;
  const term = String(env.TERM || "").toLowerCase();
  if (term.includes("direct")) return 3;
  if (term.includes("256color")) return 2;
  return 1;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// The 6×6×6 cube, with the 24-step grey ramp for anything near-neutral.
function to256([r, g, b]) {
  if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }
  const q = (v) => Math.round((v / 255) * 5);
  return 16 + 36 * q(r) + 6 * q(g) + q(b);
}

// Nearest of the 8 + 8 basic colours. Coarse on purpose: at this depth the
// only job left is to keep red looking like danger.
function toBasic([r, g, b]) {
  const max = Math.max(r, g, b);
  if (max < 140) return max > 60 ? 90 : 30;
  const code = 30 + (r > 140 ? 1 : 0) + (g > 140 ? 2 : 0) + (b > 140 ? 4 : 0);
  return max > 200 ? code + 60 : code;
}

function escape(hex, depth, background) {
  if (!hex) return "";
  const channels = rgb(hex);
  const offset = background ? 10 : 0;
  if (depth >= 3) return `\x1b[${38 + offset};2;${channels.join(";")}m`;
  if (depth === 2) return `\x1b[${38 + offset};5;${to256(channels)}m`;
  const basic = toBasic(channels);
  return `\x1b[${basic + offset}m`;
}

// ── Representations ─────────────────────────────────────────────────────────

// U+25B0/25B1 are East Asian Width *Neutral*. The block-element and geometric
// alternatives (█ ■ ●) are all *Ambiguous*, which a CJK terminal is entitled to
// draw double-width — and a Meter is five cells wide, so that error multiplies.
const METER_FULL = "▰";
const METER_EMPTY = "▱";
const METER_CELLS = 5;

function meter(value, cells = METER_CELLS) {
  const n = clampPercentage(value);
  if (n === undefined) return "";
  const filled = Math.round((n / 100) * cells);
  return METER_FULL.repeat(filled) + METER_EMPTY.repeat(cells - filled);
}

// ── Phrasebooks ─────────────────────────────────────────────────────────────
// The `say` Field decides *what is worth saying* — that is data, and it reuses
// the Threshold colour cut-offs so the sentence can never disagree with the
// colour beside it. A Theme decides only *how it is said*.

const PLAIN_PHRASES = {
  weekly_low: () => "weekly quota nearly spent",
  five_hour_low: () => "5-hour quota nearly spent",
  ctx_full: () => "context window nearly full",
  agent_running: (raw) => `${raw("agent")} is running`,
};

// Dragon Quest's English localisation, which is as much the joke as the
// Japanese original ever was.
// "5-hour" is a product's word, and one of those inside the sentence kills the
// whole joke. Stamina for the window that comes back today, power for the one
// that comes back next week — a distinction the genre already draws.
const NEON_PHRASES = {
  weekly_low: () => "Thy power waneth!",
  five_hour_low: () => "Thy stamina waneth!",
  ctx_full: () => "Thy context runneth over!",
  agent_running: (raw) => `${raw("agent")} draws near!`,
};

// ── Themes ──────────────────────────────────────────────────────────────────

const THEMES = [
  {
    id: "neon",
    name: "neon",
    description: "sherly.dev's palette, with meters and a narrator",
    palette: {
      // Threshold roles. Same three questions as ever, better answers.
      ok: "#4ade80",
      warn: "#fbbf24",
      danger: "#f2555a",
      info: "#7dd3fc",
      // Literal text: the labels a Format carries, and the punctuation it does
      // not — the Separator, brackets, parens.
      label: "#ff49a4",
      punct: "#4a454e",
      // A Chip is a filled badge, so it needs both halves.
      chip: "#ff1f8f",
      chipInk: "#0b0a0d",
    },
    sep: " ★ ",
    meters: true,
    chips: ["model"],
    // Only used when no Format was given: a Theme never overrides a Format
    // somebody wrote. Labels are uppercase and the line is shorter than the
    // plain default, because Meters cost seven cells each — but it carries the
    // same Fields the plain default does where a Host supplies them. Which
    // Fields appear is not a Theme's to decide; only how they look is.
    format:
      "{model}[:{effort}]|CTX {ctx}|5H {5h}|7D {7d}|{branch}|{cwd}|{say}|" +
      "[IN {in}] [OUT {out}] [TH {th}] [CR {cr}] [CW {cw}] [TOT {tot}]",
    phrases: NEON_PHRASES,
  },
  {
    id: "plain",
    name: "plain",
    description: "the line, uncoloured except where a number is alarming",
    // No hex: at this depth the escapes *are* the palette, and staying on the
    // basic 8 is what makes the default line safe in any terminal.
    ansi: { ok: "\x1b[32m", warn: "\x1b[33m", danger: "\x1b[31m", info: "" },
    palette: {},
    sep: " | ",
    meters: false,
    chips: [],
    format: null,
    phrases: PLAIN_PHRASES,
  },
];

// The designed look is what a status line is picked for, so it is what a new
// install gets. `plain` remains one flag away, and is what a terminal without
// 256 colours or Unicode should be pointed at.
const DEFAULT_THEME = "neon";

// What a Status line looks like when nobody has chosen: unstyled, not
// "whatever the product currently ships". A caller that renders without
// naming a Theme is asking for no Theme, and the product's taste changing
// underneath it would be a surprise, not a service.
const NEUTRAL_THEME = "plain";

function getTheme(id) {
  return THEMES.find((theme) => theme.id === (id ?? DEFAULT_THEME));
}

// Binds a Theme to what this terminal can show. Everything downstream asks the
// painter for a role and gets a string, so no other module knows about depth,
// hex, or whether colour is on at all.
function createPainter(theme, { colour = true, depth } = {}) {
  const resolved = depth ?? colourDepth();
  const cache = new Map();

  const of = (role) => {
    if (!colour) return "";
    if (cache.has(role)) return cache.get(role);
    const value = theme.ansi?.[role] ?? escape(theme.palette[role], resolved, false);
    cache.set(role, value);
    return value;
  };

  return {
    theme,
    colour,
    wrap(role, text) {
      const on = of(role);
      return on ? `${on}${text}${RESET}` : text;
    },
    // A Chip is background-first: the fill sits behind the Field's own
    // characters and one space either side, so nothing depends on knowing how
    // wide the terminal is.
    chip(text) {
      if (!colour || !theme.palette.chip) return text;
      const back = escape(theme.palette.chip, resolved, true);
      const ink = escape(theme.palette.chipInk, resolved, false);
      return `${back}${ink} ${text} ${RESET}`;
    },
    isChip(key) {
      return theme.chips.includes(key);
    },
    meters: theme.meters,
    separator: theme.sep,
    phrase(token, raw) {
      return theme.phrases[token]?.(raw);
    },
  };
}

module.exports = {
  THEMES, DEFAULT_THEME, NEUTRAL_THEME, getTheme, createPainter,
  colourDepth, escape, meter, METER_CELLS, RESET,
};

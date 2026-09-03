"use strict";

const path = require("path");

// A Field is a *value*, not a value plus a label: the label belongs to whoever
// writes the Format. What lives here is everything that must be identical no
// matter which Host supplied the raw data — formatting, threshold colour, and
// the default label the Wizard offers as a starting point.
//
// Where the raw value is *found* is not here. That is the Adapter's job
// (src/hosts/*), which is what lets one Format survive a change of Host.

const RESET = "\x1b[0m";

function formatTokens(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "?";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.trunc(n));
}

function clampPercentage(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return undefined;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function percent(value) {
  const n = clampPercentage(value);
  return n === undefined ? undefined : `${n}%`;
}

function basename(value) {
  if (typeof value !== "string" || !value) return undefined;
  return path.basename(value) || value;
}

// Hosts express reset times as epoch seconds or as an ISO timestamp; both are
// accepted so an Adapter never has to reformat before handing a value over.
function toDate(value) {
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const date = new Date(Number(value) * 1000);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  if (typeof value === "string") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date;
  }
  return undefined;
}

function monthDay(value) {
  const date = toDate(value);
  if (!date) return undefined;
  return `${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
}

function hourMinute(value) {
  const date = toDate(value);
  if (!date) return undefined;
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

// Fullness: high is bad. Remaining: high is good. Two ramps, not one.
//
// These name a *role*, not a colour. Which red a role is drawn in belongs to
// the Theme; whether this number is alarming belongs here, and the Theme never
// gets to disagree with it.
const DANGER = "danger";
const WARN = "warn";
const OK = "ok";

const fullnessColour = (raw) => {
  const n = clampPercentage(raw);
  if (n === undefined) return null;
  return n >= 82 ? DANGER : n >= 75 ? WARN : OK;
};
const remainingColour = (raw) => {
  const n = clampPercentage(raw);
  if (n === undefined) return null;
  return n >= 50 ? OK : n >= 20 ? WARN : DANGER;
};

const text = (value) => (typeof value === "string" && value ? value : undefined);
const count = (value) => (Number.isFinite(Number(value)) ? String(Math.trunc(Number(value))) : undefined);

// `desc` is what the Field means, and it is not optional: a key and a sample
// value together still do not tell anyone the difference between `ctx`,
// `ctx_left` and `ctx_size`, or what `cr` is counting.
//
// `when` marks a Field the Host can supply but only in certain states. That is
// a different thing from a Field the Host cannot supply at all, and conflating
// the two tells users their CLI lacks a feature it actually has.
//
// `attach` lets the Wizard fold a Field into a neighbouring Segment rather than
// giving it one of its own — `effort` modifies `model`, it is not a peer of it.
const FIELDS = {
  model:     { group: "model",  label: "",       source: "payload", format: text, sample: "Opus 5", desc: "current model, as the CLI names it" },
  effort:    { group: "model",  label: "",       source: "payload", format: text, sample: "high",
               attach: { to: "model", source: "[:{effort}]" }, desc: "reasoning effort level", when: "on models that have one" },
  model_id:  { group: "model",  label: "",       source: "payload", format: text, sample: "claude-opus-5", desc: "full model identifier" },

  ctx:       { group: "ctx",    label: "ctx",    source: "payload", format: percent, colour: fullnessColour, meter: true, sample: "8%", desc: "how full the context window is" },
  ctx_left:  { group: "ctx",    label: "left",   source: "payload", format: percent, colour: remainingColour, meter: true, sample: "92%", desc: "how much context window is left" },
  ctx_size:  { group: "ctx",    label: "of",     source: "payload", format: formatTokens, sample: "200.0k", desc: "total size of the context window" },

  "7d":      { group: "limits", label: "7d",     source: "payload", format: percent, colour: remainingColour, meter: true, sample: "83%", desc: "weekly quota remaining", when: "on Claude Pro/Max plans" },
  "7d_reset":{ group: "limits", label: "",       source: "payload", format: monthDay, sample: "08/26",
               attach: { to: "7d", source: "[ (resets {7d_reset})]" }, desc: "date the weekly quota resets", when: "on Claude Pro/Max plans" },
  "5h":      { group: "limits", label: "5h",     source: "payload", format: percent, colour: remainingColour, meter: true, sample: "61%", desc: "5-hour quota remaining", when: "on Claude Pro/Max plans" },
  quota:     { group: "limits", label: "quota",  source: "payload", format: percent, colour: remainingColour, meter: true, sample: "72%", desc: "model quota remaining", when: "on CLIs that report one" },
  quota_reset:{group: "limits", label: "",       source: "payload", format: hourMinute, sample: "21:00", desc: "when that quota resets", when: "on CLIs that report one",
               attach: { to: "quota", source: "[ ({quota_reset})]" } },
  "5h_reset":{ group: "limits", label: "",       source: "payload", format: hourMinute, sample: "14:30",
               attach: { to: "5h", source: "[ ({5h_reset})]" }, desc: "time the 5-hour quota resets", when: "on Claude Pro/Max plans" },

  branch:    { group: "place",  label: "",       source: "payload", format: text, sample: "main", desc: "current git branch", when: "in a git repository" },

  cwd:       { group: "place",  label: "",       source: "payload", format: basename, sample: "doitservers", desc: "shell directory you are in, follows /add-dir" },
  dir:       { group: "place",  label: "",       source: "payload", format: basename, sample: "cc-token-statusline", desc: "project root the session started in" },
  added:     { group: "place",  label: "+dirs",  source: "payload", format: count, sample: "2", desc: "how many extra directories are in scope", when: "after /add-dir" },

  cost:      { group: "cost",   label: "",       source: "payload", sample: "$1.23",
               format: (v) => (Number.isFinite(Number(v)) ? `$${Number(v).toFixed(2)}` : undefined), desc: "what this session has cost so far" },
  lines_add: { group: "cost",   label: "+",      source: "payload", format: count, sample: "412", desc: "lines added this session", when: "once code has changed" },
  lines_del: { group: "cost",   label: "-",      source: "payload", format: count, sample: "97", desc: "lines removed this session", when: "once code has changed" },

  agent:     { group: "state",  label: "",       source: "payload", format: text, sample: "Explore", desc: "name of the subagent running now", when: "while a subagent runs" },
  style:     { group: "state",  label: "",       source: "payload", format: text, sample: "default", desc: "active output style" },
  session:   { group: "state",  label: "",       source: "payload", format: text, sample: "refactor", desc: "name you gave this session", when: "when the session has a name" },
  ver:       { group: "state",  label: "v",      source: "payload", format: text, sample: "2.1.243", desc: "CLI version" },
  vim:       { group: "state",  label: "",       source: "payload", format: text, sample: "INSERT", desc: "vim mode, INSERT or NORMAL", when: "when vim mode is on" },
  pr:        { group: "state",  label: "PR",     source: "payload", format: count, sample: "142", desc: "pull request number", when: "inside a PR worktree" },

  // Booleans are Available only when true, and render as a fixed word. That
  // makes `[{fast}]` mean "show it when it is on" with no conditional syntax.
  fast:      { group: "state",  label: "",       source: "payload", sample: "fast",
               format: (v) => (v === true ? "fast" : undefined), desc: "the word `fast`", when: "when fast mode is on" },
  think:     { group: "state",  label: "",       source: "payload", sample: "think",
               format: (v) => (v === true ? "think" : undefined), desc: "the word `think`", when: "when extended thinking is on" },

  // The one derived Field: its source is other Fields, not the Payload. It
  // yields a *token*, not a sentence — deciding that the weekly quota is the
  // most alarming thing right now is data, and phrasing it is the Theme's.
  //
  // One token at a time, worst first, because a status line that says four
  // things at once says none of them.
  say:       { group: "state",  label: "",       source: "derived", sample: "Thy power waneth!",
               format: (token) => token,
               colour: (token) => (token === "agent_running" ? "info" : "danger"),
               // The trigger is the Threshold colour itself, not a second set of
               // cut-offs that happens to agree with it today. A number painted
               // red and a sentence saying all is well cannot both be on the
               // same line if there is only one place the answer comes from.
               //
               // The order is how soon each one stops you, not how bad it is.
               // A weekly quota at 12% is the worse news, but nothing can be
               // done about it this hour; a context window at 88% is three
               // messages away and the reader can act on it now. The one
               // sentence goes to whoever can be acted on.
               derive: (raw) => {
                 if (fullnessColour(raw("ctx")) === DANGER) return "ctx_full";
                 if (remainingColour(raw("5h")) === DANGER) return "five_hour_low";
                 if (remainingColour(raw("7d")) === DANGER) return "weekly_low";
                 if (raw("agent")) return "agent_running";
                 return undefined;
               },
               desc: "one line about the most alarming thing right now",
               when: "when something is worth saying" },

  in:        { group: "tokens", label: "in",     source: "transcript", format: formatTokens, sample: "36", desc: "input tokens, whole conversation" },
  out:       { group: "tokens", label: "out",    source: "transcript", format: formatTokens, sample: "21.1k", desc: "output tokens, whole conversation" },
  th:        { group: "tokens", label: "th",     source: "transcript", format: formatTokens, sample: "5.0k", desc: "thinking tokens — part of out, not added to tot" },
  cr:        { group: "tokens", label: "cr",     source: "transcript", format: formatTokens, sample: "1.2M", desc: "tokens read from cache, whole conversation" },
  cw:        { group: "tokens", label: "cw",     source: "transcript", format: formatTokens, sample: "15.3k", desc: "tokens written to cache, whole conversation" },
  tot:       { group: "tokens", label: "tot",    source: "transcript", format: formatTokens, sample: "1.3M", desc: "in + out + cr + cw" },
};

// `wk` shipped in 0.2.x before `5h` existed, which made the pair asymmetric.
// `7d`/`5h` are symmetric and self-describing; `wk` stays as an alias so no
// existing configuration breaks.
const ALIASES = { wk: "7d", wk_reset: "7d_reset" };

function resolveKey(key) {
  return ALIASES[key] ?? key;
}

function getField(key) {
  return FIELDS[resolveKey(key)];
}

const FIELD_KEYS = Object.keys(FIELDS);

const GROUP_ORDER = ["model", "ctx", "limits", "place", "cost", "state", "tokens"];

module.exports = {
  FIELDS, FIELD_KEYS, ALIASES, GROUP_ORDER,
  getField, resolveKey, formatTokens, clampPercentage, RESET,
};

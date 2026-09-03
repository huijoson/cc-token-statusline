"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

const {
  getTheme, createPainter, meter, METER_CELLS, colourDepth, DEFAULT_THEME, THEMES,
} = require("../src/themes.js");
const { createResolver, createSampleResolver } = require("../src/resolver.js");
const { renderFormat } = require("../src/format.js");
const { displayWidth } = require("../src/width.js");
const { commandFor } = require("../src/wizard/install.js");
const claudeCode = require("../src/hosts/claude-code.js");
const { DEFAULT_FORMAT } = require("../src/templates.js");

const BIN = path.join(__dirname, "..", "bin", "hudline.js");
const PAYLOAD = JSON.stringify({
  model: { display_name: "Opus 5" },
  effort: { level: "high" },
  context_window: { used_percentage: 8 },
  rate_limits: {
    five_hour: { used_percentage: 39 },
    seven_day: { used_percentage: 17 },
  },
  cwd: "/home/you/doitservers",
});

const run = (args, env = {}) =>
  execFileSync(process.execPath, [BIN, ...args], {
    input: PAYLOAD,
    encoding: "utf8",
    env: { ...process.env, TZ: "UTC", ...env },
  }).trim();

const neon = (payload, options = {}) =>
  createResolver(claudeCode, payload, {
    painter: createPainter(getTheme("neon"), { depth: 3, ...options }),
  });

test("the Theme supplies the palette, the Threshold colour still makes the choice", () => {
  const hot = { context_window: { used_percentage: 91 } };

  // Same question, two answers, and neither Theme gets to disagree that 91% is
  // dangerous — only about what danger looks like here.
  assert.match(createResolver(claudeCode, hot).get("ctx"), /\x1b\[31m/);
  assert.match(neon(hot).get("ctx"), /\x1b\[38;2;242;85;90m/);

  const calm = { context_window: { used_percentage: 8 } };
  assert.match(neon(calm).get("ctx"), /\x1b\[38;2;74;222;128m/);
});

test("a Theme cannot paint literal text on a line nobody asked to paint", () => {
  const resolver = neon({ context_window: { used_percentage: 8 } }, { colour: false });
  const line = renderFormat("ctx {ctx}", resolver, { paintText: (t) => `<${t}>` });
  // The paint function is the caller's; a colourless painter simply has nothing
  // to say, so --no-color still strips everything the Theme would have added.
  assert.equal(line, "<ctx> ▱▱▱▱▱ 8%");
});

test("a Format's words and its punctuation are not painted alike", () => {
  const resolver = neon({ context_window: { used_percentage: 8 } }, { colour: false });
  const line = renderFormat("ctx {ctx} (used)", resolver, {
    paintText: (t) => `W(${t})`,
    paintPunct: (t) => `P(${t})`,
  });
  // Parens are skeleton, not content — they belong with the Separator, and a
  // Theme that paints them as loudly as a label is coloured, not designed.
  assert.equal(line, "W(ctx) ▱▱▱▱▱ 8% P(()W(used)P())");
});

test("colour degrades by depth rather than by dropping out", () => {
  const hex = "#ff1f8f";
  const at = (depth) => createPainter(
    { ...getTheme("neon"), palette: { danger: hex } }, { depth }
  ).wrap("danger", "x");

  assert.match(at(3), /\x1b\[38;2;255;31;143mx/, "truecolor");
  assert.match(at(2), /\x1b\[38;5;\d+mx/, "256 colour");
  assert.match(at(1), /\x1b\[3\dmx|\x1b\[9\dmx/, "basic");
});

test("COLORTERM decides the depth, not the Theme", () => {
  assert.equal(colourDepth({ COLORTERM: "truecolor" }), 3);
  assert.equal(colourDepth({ TERM: "xterm-256color" }), 2);
  assert.equal(colourDepth({ TERM: "xterm" }), 1);
});

// ── Representation ──────────────────────────────────────────────────────────

test("a Meter is one cell per cell, in a CJK terminal too", () => {
  // ▰ and ▱ are East Asian Width Neutral. The block-element and geometric
  // alternatives are Ambiguous, which a CJK terminal may draw double-width —
  // and this error would multiply by METER_CELLS.
  for (const value of [0, 1, 50, 99, 100]) {
    assert.equal(displayWidth(meter(value)), METER_CELLS, `at ${value}%`);
  }
});

test("a Meter's footprint does not change as the value it reports does", () => {
  assert.equal(meter(0), "▱▱▱▱▱");
  assert.equal(meter(100), "▰▰▰▰▰");
  assert.equal(meter(61).length, meter(6).length);
});

test("the Theme chooses the Representation; the Format is untouched by the choice", () => {
  const payload = { context_window: { used_percentage: 61 } };
  const format = "ctx {ctx}";

  const plain = createResolver(claudeCode, payload, { colour: false });
  const themed = neon(payload, { colour: false });

  assert.equal(renderFormat(format, plain), "ctx 61%");
  assert.equal(renderFormat(format, themed), "ctx ▰▰▰▱▱ 61%");
});

// ── Narration ───────────────────────────────────────────────────────────────

test("the narration is Missing when nothing is worth saying, and takes its Segment", () => {
  const calm = neon({ context_window: { used_percentage: 8 } }, { colour: false });
  assert.equal(calm.get("say"), undefined);
  assert.equal(renderFormat("ctx {ctx}|{say}", calm, { separator: " | " }), "ctx ▱▱▱▱▱ 8%");
});

test("the narration cannot contradict the colour beside it", () => {
  // 20% remaining is warn, not danger: the line is not red, so it must not
  // speak either. One point lower is danger, and it must.
  const quiet = neon({ rate_limits: { seven_day: { used_percentage: 80 } } }, { colour: false });
  assert.equal(quiet.get("say"), undefined);

  const loud = neon({ rate_limits: { seven_day: { used_percentage: 81 } } }, { colour: false });
  assert.equal(loud.get("say"), "Thy power waneth!");
});

test("the narration says one thing at a time, and picks what stops you soonest", () => {
  // The weekly quota is the worse number and it loses anyway: nothing can be
  // done about it this hour, and the context window is three messages away.
  const everything = neon({
    context_window: { used_percentage: 95 },
    rate_limits: { seven_day: { used_percentage: 95 }, five_hour: { used_percentage: 99 } },
    agent: { name: "Explore" },
  }, { colour: false });
  assert.equal(everything.get("say"), "Thy context runneth over!");

  const noContext = neon({
    rate_limits: { seven_day: { used_percentage: 95 }, five_hour: { used_percentage: 99 } },
  }, { colour: false });
  assert.equal(noContext.get("say"), "Thy stamina waneth!");
});

test("the Narration is reachable from the default Format, not only from a Theme", () => {
  // The plain phrasebook was unreachable while `{say}` lived in no template: a
  // warning nobody can arrive at without reading --list-fields is not a warning.
  assert.ok(DEFAULT_FORMAT.includes("{say}"));
  const line = renderFormat(
    DEFAULT_FORMAT,
    createResolver(claudeCode, { context_window: { used_percentage: 95 } }, { colour: false })
  );
  assert.match(line, /context window nearly full/);
});

test("the Field decides what is worth saying; the Theme decides how it is said", () => {
  const payload = { agent: { name: "Explore" } };
  assert.equal(
    createResolver(claudeCode, payload, { colour: false }).get("say"),
    "Explore is running"
  );
  assert.equal(neon(payload, { colour: false }).get("say"), "Explore draws near!");
});

test("the narration is coloured by what triggered it", () => {
  const danger = neon({ context_window: { used_percentage: 95 } });
  assert.match(danger.get("say"), /\x1b\[38;2;242;85;90m/);

  const info = neon({ agent: { name: "Explore" } });
  assert.match(info.get("say"), /\x1b\[38;2;125;211;252m/);
});

// ── A Theme's Format ────────────────────────────────────────────────────────

test("a Theme supplies a Format only when nobody else did", () => {
  const { resolveFormat } = require("../bin/hudline.js");
  const theme = getTheme("neon");

  assert.equal(resolveFormat(["--format=X"], {}, theme), "X");
  assert.equal(resolveFormat([], { HUDLINE_FORMAT: "Y" }, theme), "Y");
  assert.equal(resolveFormat([], {}, theme), theme.format);
  assert.equal(resolveFormat([], {}, getTheme("plain")), DEFAULT_FORMAT);
});

test("--theme picks the look, and an unknown one says so on the only channel there is", () => {
  assert.match(run(["--theme=neon", "--no-color"]), /★/);
  assert.equal(run(["--theme=nope"]), "hudline: unknown theme nope");
});

test("HUDLINE_THEME is honoured, and the flag beats it", () => {
  assert.match(run(["--no-color"], { HUDLINE_THEME: "neon" }), /★/);
  assert.doesNotMatch(run(["--theme=plain", "--no-color"], { HUDLINE_THEME: "neon" }), /★/);
});

test("the installed command names a Theme only when it is not the default", () => {
  const escapeHatch = commandFor(claudeCode, "{ctx}", "hudline", "npx -y hudline@latest", "plain");
  assert.match(escapeHatch, / --theme=plain /);
  const theDefault = commandFor(claudeCode, "{ctx}", "hudline", "npx -y hudline@latest", DEFAULT_THEME);
  assert.doesNotMatch(theDefault, /--theme/);
});

test("the plain Theme leaves the line exactly as it was before Themes existed", () => {
  assert.equal(
    run(["--no-color", "--theme=plain"]),
    "Opus 5:high | ctx 8% | 5h 61% left | 7d 83% left | doitservers"
  );
  const sample = createSampleResolver(claudeCode, { colour: false });
  assert.match(renderFormat(DEFAULT_FORMAT, sample), /^Opus 5:high \| ctx 8% \|/);
});

test("a derived Field is not reported as something this CLI cannot do", () => {
  // It is supplied by other Fields, so no Host supplies it and every Host has
  // it. Calling that "n/a" tells someone their CLI lacks the one Field that
  // works everywhere.
  const { catalogueRows } = require("../src/catalogue.js");
  for (const host of [claudeCode, require("../src/hosts/qwen-code.js")]) {
    const rows = catalogueRows(host, createSampleResolver(host, { colour: false }));
    const say = rows.find((row) => row.key === "say");
    assert.ok(say.supported, `${host.id} should support {say}`);
    // Nothing is wrong in a sample payload, so it is Missing, not absent.
    assert.equal(say.value, undefined, host.id);
  }
});

test("--list-themes names every Theme and marks which one you get for free", () => {
  const out = run(["--list-themes"]).replace(/\x1b\[[0-9;]*m/g, "");
  for (const theme of THEMES) assert.match(out, new RegExp(`\\b${theme.id}\\b`), theme.id);
  assert.match(out, new RegExp(`${DEFAULT_THEME}\\s+.*\\(default\\)`));
  // Exactly one, or the word means nothing.
  assert.equal(out.match(/\(default\)/g).length, 1);
});

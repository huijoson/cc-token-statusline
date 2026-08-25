"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildFormat } = require("../src/templates.js");
const { LineEditor } = require("../src/wizard/editor.js");
const { createSampleResolver } = require("../src/resolver.js");
const claudeCode = require("../src/hosts/claude-code.js");
const install = require("../src/wizard/install.js");
const numbered = require("../src/wizard/numbered.js");
const { decode } = require("../src/wizard/keys.js");
const { displayWidth, truncateToWidth } = require("../src/width.js");

const resolver = () => createSampleResolver(claudeCode, { colour: false });

test("consecutive Fields of one group share a Segment", () => {
  assert.equal(buildFormat(["ctx", "in", "out", "tot"]), "ctx {ctx}|[in {in}] [out {out}] [tot {tot}]");
});

test("an attaching Field folds into the part it modifies, not the Segment end", () => {
  assert.equal(
    buildFormat(["7d", "7d_reset", "5h", "5h_reset"]),
    "[7d {7d}[ (resets {7d_reset})]] [5h {5h}[ ({5h_reset})]]"
  );
});

test("the editor reorders by moving the Segment the cursor is on", () => {
  const editor = new LineEditor({ host: claudeCode, resolver: resolver(), format: "a {ctx}|b {cwd}|c {model}" });
  editor.handle(decode("\x1b[C"));
  editor.handle({ name: "char", value: ">" });
  assert.equal(editor.format(), "a {ctx}|c {model}|b {cwd}");
  assert.equal(editor.cursor, 2);
});

test("delete removes one Segment and keeps the cursor in range", () => {
  const editor = new LineEditor({ host: claudeCode, resolver: resolver(), format: "a {ctx}|b {cwd}" });
  editor.handle({ name: "char", value: "d" });
  editor.handle({ name: "char", value: "d" });
  assert.equal(editor.format(), "");
  assert.equal(editor.cursor, 0);
});

test("reset restores the line the editor started from", () => {
  const editor = new LineEditor({ host: claudeCode, resolver: resolver(), format: "a {ctx}|b {cwd}" });
  editor.handle({ name: "char", value: "d" });
  editor.handle({ name: "char", value: "r" });
  assert.equal(editor.format(), "a {ctx}|b {cwd}");
});

test("a Segment whose Fields are all Missing is shown as hidden, not dropped from the editor", () => {
  const editor = new LineEditor({ host: claudeCode, resolver: resolver(), format: "{agent}|ctx {ctx}" });
  const parts = editor.parts();
  assert.equal(parts[0].hidden, true);
  assert.equal(parts[1].hidden, false);
});

test("typed numbers give both selection and order, and pull in attachments", () => {
  const rows = numbered.fieldTable(claudeCode, resolver());
  const index = (key) => rows.findIndex((row) => row.key === key) + 1;
  const keys = numbered.withAttachments(numbered.parseSelection(`${index("7d")},${index("model")}`, rows));
  assert.deepEqual(keys, ["7d", "7d_reset", "model", "effort"]);
});

test("out-of-range and junk entries are ignored rather than aborting", () => {
  const rows = numbered.fieldTable(claudeCode, resolver());
  assert.deepEqual(numbered.parseSelection("999, x, 1", rows), [rows[0].key]);
});

test("a settings file with comments is never rewritten", () => {
  const file = path.join(os.tmpdir(), `agenthud-settings-${Date.now()}.json`);
  fs.writeFileSync(file, '{\n  // keep me\n  "model": "opus"\n}\n');
  const settings = install.readSettings(file);
  assert.equal(settings.writable, false);
  assert.match(settings.reason, /comments/);
  fs.unlinkSync(file);
});

test("a URL in a string is not mistaken for a comment", () => {
  assert.equal(install.hasComments('{"a":"https://example.com"}'), false);
});

test("only the statusLine key changes, and the file's indentation is kept", () => {
  const before = '{\n    "model": "opus",\n    "theme": "dark"\n}\n';
  const file = path.join(os.tmpdir(), `agenthud-settings-${Date.now()}-b.json`);
  fs.writeFileSync(file, before);
  const settings = install.readSettings(file);
  assert.equal(settings.indent, 4);

  const after = install.renderSettings(settings, ["statusLine"], { type: "command", command: "x" });
  const parsed = JSON.parse(after);
  assert.equal(parsed.model, "opus");
  assert.equal(parsed.theme, "dark");
  assert.equal(parsed.statusLine.command, "x");
  assert.match(after, /\n {4}"model"/);
  fs.unlinkSync(file);
});

test("a nested settings key is created without disturbing its siblings", () => {
  const settings = { data: { ui: { theme: "dark" } }, indent: 2 };
  const after = JSON.parse(install.renderSettings(settings, ["ui", "statusLine"], { type: "command", command: "x" }));
  assert.equal(after.ui.theme, "dark");
  assert.equal(after.ui.statusLine.command, "x");
});

test("the diff shows the change, not the whole file", () => {
  const keys = ["a", "b", "c", "d", "e", "f", "g", "h"];
  const before = "{\n" + keys.map((key, i) => `  "${key}": ${i}`).join(",\n") + "\n}\n";
  const after = before.replace('"e": 4', '"e": 9');
  const output = install.diff(before, after);
  assert.match(output, /^- {3}"e": 4,$/m);
  assert.match(output, /^\+ {3}"e": 9,$/m);
  // Two lines of context either side — the far end of the file stays out.
  assert.doesNotMatch(output, /"a": 0/);
  assert.doesNotMatch(output, /"h": 7/);
});

test("display width counts terminal cells, not code units", () => {
  assert.equal(displayWidth("窗"), 2);
  assert.equal(displayWidth("\x1b[32mctx\x1b[0m"), 3);
  assert.equal(truncateToWidth("窗窗窗", 4), "窗窗");
});

test("only universally reported keys are decoded", () => {
  assert.deepEqual(decode("\x1b[D"), { name: "left" });
  assert.deepEqual(decode("\r"), { name: "enter" });
  assert.deepEqual(decode("\x7f"), { name: "backspace" });
  assert.deepEqual(decode("<"), { name: "char", value: "<" });
});

const { parseFormatFromCommand, capability } = require("../src/wizard/index.js");
const { decodeAll } = require("../src/wizard/keys.js");

test("a checkout invokes itself by path; an npm install goes through npx", () => {
  assert.match(install.commandFor(claudeCode, "x", "agenthud", "node /tmp/a.js"), /^node \/tmp\/a\.js --format=/);
  assert.match(install.commandFor(require("../src/hosts/qwen-code.js"), "x", "agenthud", "npx -y agenthud"),
    /^npx -y agenthud --host=qwen-code --format=/);
  // This checkout is not inside node_modules, so it must not emit npx.
  assert.match(install.launcherFor(), /^node .*bin[/\\]agenthud\.js$/);
});

test("edit reads the Format back out of the installed command", () => {
  const format = '{model}[:{effort}]|ctx {ctx}|a "quoted" b';
  const command = install.commandFor(claudeCode, format);
  assert.equal(parseFormatFromCommand(command), format);
  assert.equal(parseFormatFromCommand("npx -y agenthud --format='ctx {ctx}'"), "ctx {ctx}");
  assert.equal(parseFormatFromCommand("npx -y agenthud --format=ctx"), "ctx");
  assert.equal(parseFormatFromCommand("npx -y agenthud"), null);
});

test("a batched read is decoded into every keystroke it carried", () => {
  assert.deepEqual(decodeAll("\x1b[B\r\x1b[C>"), [
    { name: "down" }, { name: "enter" }, { name: "right" }, { name: "char", value: ">" },
  ]);
});

test("a full-screen editor is refused where it cannot work", () => {
  assert.equal(capability(["--no-tui"], {}), "numbered");
  assert.equal(capability([], {}), "print"); // no TTY under the test runner
  assert.equal(capability([], { CLAUDECODE: "1" }), "print");
});

test("every overlay answers the same keys, so the driver cannot crash on one", () => {
  const { FieldPicker } = require("../src/wizard/editor.js");
  const { Select, TextInput } = require("../src/wizard/select.js");
  const overlays = [
    new FieldPicker({ host: claudeCode, resolver: resolver(), used: [] }),
    new Select({ title: "t", items: [{ label: "a" }, { label: "b" }] }),
    new TextInput({ title: "t", hint: "h", value: "x" }),
  ];
  for (const overlay of overlays) {
    assert.equal(typeof overlay.handle, "function", overlay.constructor.name);
    assert.equal(overlay.handle({ name: "enter" }), "submit");
    assert.equal(overlay.handle({ name: "escape" }), "cancel");
    assert.equal(overlay.handle({ name: "down" }), null);
  }
});

test("the field picker inserts the field the cursor is on", () => {
  const { FieldPicker } = require("../src/wizard/editor.js");
  const picker = new FieldPicker({ host: claudeCode, resolver: resolver(), used: [] });
  picker.handle({ name: "down" });
  const chosen = picker.selected();
  assert.equal(chosen.type, "field");
  assert.equal(typeof chosen.key, "string");
});

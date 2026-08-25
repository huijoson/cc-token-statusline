"use strict";

const { HOSTS, getHost, supportedHosts } = require("../hosts/index.js");
const { createSampleResolver } = require("../resolver.js");
const { TEMPLATES, getTemplate, DEFAULT_FORMAT } = require("../templates.js");
const { renderFormat, splitSegments } = require("../format.js");
const { getField } = require("../fields.js");
const { hostSupports } = require("../catalogue.js");
const { fieldsUsed } = require("../format.js");
const { LineEditor, FieldPicker, fieldKeysIn } = require("./editor.js");
const { Select, TextInput } = require("./select.js");
const { decodeAll } = require("./keys.js");
const install = require("./install.js");
const numbered = require("./numbered.js");

const DIM = "\x1b[2m";
const BOLD = "\x1b[1m";
const RESET = "\x1b[0m";

// Three capability levels, decided once at startup. The middle one exists
// because of a specific, predictable situation: someone runs `agenthud edit`
// from inside the agent CLI they are configuring, which is a TUI already, and
// a raw-mode editor inside another TUI produces garbage or silence.
function capability(argv, env) {
  if (argv.includes("--no-tui")) return "numbered";
  const interactive = process.stdin.isTTY && process.stdout.isTTY;
  if (!interactive) return "print";
  if (typeof process.stdin.setRawMode !== "function") return "numbered";
  if (env.CLAUDECODE || env.CURSOR_AGENT || env.GEMINI_CLI) return "numbered";
  return "tui";
}

function keyLoop(screenStack) {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();

    const top = () => screenStack[screenStack.length - 1];
    top().render();

    const onData = (chunk) => {
      for (const key of decodeAll(chunk)) {
        const outcome = top().handle(key);
        if (outcome === "exit") {
          stdin.off("data", onData);
          stdin.setRawMode(false);
          stdin.pause();
          resolve(top().result);
          return;
        }
      }
      top().render();
    };
    stdin.on("data", onData);
  });
}

// Builds the Segment source for a newly inserted Field, folding in anything
// that attaches to it so `7d` arrives with its reset time already wired up.
function segmentFor(key) {
  const field = getField(key);
  const base = field.label ? `${field.label} {${key}}` : `{${key}}`;
  let suffix = "";
  for (const [candidate, other] of Object.entries(require("../fields.js").FIELDS)) {
    if (other.attach && other.attach.to === key) suffix += other.attach.source;
  }
  return base + suffix;
}

async function runTui({ host, resolver, format }) {
  const editor = new LineEditor({ host, resolver, format });
  // One driver, a stack of screens: the editor is always the bottom, and the
  // field picker and text input are pushed on top of it.
  const driver = {
    result: undefined,
    overlay: null,
    render() { (this.overlay || editor).render(); },
    handle(key) {
      if (this.overlay) {
        const outcome = this.overlay.handle(key);
        if (outcome === "submit") {
          if (this.overlay instanceof FieldPicker) {
            const item = this.overlay.selected();
            if (item) editor.insertSegment(segmentFor(item.key));
          } else {
            const text = this.overlay.value().trim();
            if (text) editor.replaceSegment(text);
            else editor.remove();
          }
          this.overlay = null;
        } else if (outcome === "cancel") {
          this.overlay = null;
        }
        return null;
      }

      const outcome = editor.handle(key);
      if (outcome === "insert") {
        const used = editor.segments.flatMap((segment) => fieldKeysIn(segment));
        this.overlay = new FieldPicker({ host, resolver, used });
        return null;
      }
      if (outcome === "label") {
        const current = editor.segments[editor.cursor] ?? "";
        this.overlay = new TextInput({
          title: "edit this segment",
          hint: "literal text plus {field} placeholders; [..] marks an optional part",
          value: current,
        });
        return null;
      }
      if (outcome === "done") { this.result = editor.format(); return "exit"; }
      if (outcome === "cancel") { this.result = null; return "exit"; }
      return null;
    },
  };

  driver.render = () => (driver.overlay ? driver.overlay.render() : editor.render());

  return keyLoop([driver]);
}

function printSnippet(host, format, packageName) {
  const command = install.commandFor(host, format, packageName);
  const file = install.settingsPathFor(host);
  const key = host.settingsKey.join(".");
  const snippet = JSON.stringify(
    host.settingsKey.reduceRight((acc, k) => ({ [k]: acc }), host.settingsValue(command)),
    null,
    2
  );
  return [
    "",
    `  Add this to ${BOLD}${file}${RESET} ${DIM}(key: ${key})${RESET}:`,
    "",
    snippet.split("\n").map((line) => `    ${line}`).join("\n"),
    "",
  ].join("\n");
}

async function confirmAndWrite(host, format, packageName) {
  const file = install.settingsPathFor(host);
  const settings = install.readSettings(file);
  const command = install.commandFor(host, format, packageName);

  if (!settings.writable) {
    process.stdout.write(
      `\n  ${DIM}Not writing ${file}: ${settings.reason}.${RESET}\n` +
      `  ${DIM}Your settings are left untouched.${RESET}\n` +
      printSnippet(host, format, packageName)
    );
    return;
  }

  const after = install.renderSettings(settings, host.settingsKey, host.settingsValue(command));
  if (after === settings.text) {
    process.stdout.write(`\n  Nothing to change — ${file} already has this status line.\n`);
    return;
  }

  process.stdout.write(`\n  ${BOLD}${file}${RESET}\n\n`);
  process.stdout.write(install.diff(settings.text, after).split("\n").map((l) => `    ${l}`).join("\n") + "\n\n");

  const answer = (await numbered.ask("  Write this change? [y/N] ")).trim().toLowerCase();
  if (answer !== "y" && answer !== "yes") {
    process.stdout.write(`\n  Cancelled. Nothing was written.\n${printSnippet(host, format, packageName)}`);
    return;
  }

  let backupPath = null;
  if (settings.exists) backupPath = install.backup(file);
  install.write(file, after);
  process.stdout.write(
    `\n  Written.${backupPath ? ` ${DIM}Backup: ${backupPath}${RESET}` : ""}\n` +
    `  ${DIM}Restart ${host.name} to pick it up.${RESET}\n` +
    (host.afterInstall ? `  ${DIM}${host.afterInstall}${RESET}\n` : "") +
    "\n"
  );
}

async function pickHost(argv, mode) {
  const flagged = argv.find((arg) => arg.startsWith("--host="));
  if (flagged) {
    const host = getHost(flagged.slice("--host=".length));
    if (host && host.supported) return host;
  }
  if (mode !== "tui") return supportedHosts()[0];

  const items = HOSTS.map((host) => ({
    label: host.name,
    detail: host.supported
      ? undefined
      : `${host.reason === "blocked" ? "cannot be supported" : "not yet supported"} — ${host.note}`,
    disabled: !host.supported,
    host,
  }));
  const select = new Select({ title: "Which CLI is this status line for?", items });
  const driver = {
    result: undefined,
    render: () => select.render(),
    handle(key) {
      const outcome = select.handle(key);
      if (outcome === "submit") { this.result = select.value().host; return "exit"; }
      if (outcome === "cancel") { this.result = null; return "exit"; }
      return null;
    },
  };
  return keyLoop([driver]);
}

async function pickStart(host, resolver, current, mode) {
  const items = [];
  if (current) {
    items.push({
      label: "your current status line",
      detail: renderFormat(current, resolver),
      format: current,
    });
  }
  for (const template of TEMPLATES) {
    // Say which Fields this CLI cannot supply, rather than letting the template
    // quietly render as a shorter one. Field availability is a property of the
    // Host, and a user who picks `limits` and gets `minimal` deserves to know
    // why rather than to wonder.
    const absent = [...fieldsUsed(template.format)].filter((key) => !hostSupports(host, key));
    items.push({
      label: template.name,
      detail: renderFormat(template.format, resolver)
        + (absent.length ? `\n     ${DIM}${absent.map((k) => `{${k}}`).join(" ")} not on ${host.name}${RESET}` : ""),
      format: template.format,
    });
  }
  if (mode !== "tui") return items[0].format;

  const select = new Select({ title: "Start from", items });
  const driver = {
    result: undefined,
    render: () => select.render(),
    handle(key) {
      const outcome = select.handle(key);
      if (outcome === "submit") { this.result = select.value().format; return "exit"; }
      if (outcome === "cancel") { this.result = null; return "exit"; }
      return null;
    },
  };
  return keyLoop([driver]);
}

// `edit` starts from the line you already have, which means reading a Format
// back out of a shell command string that this tool wrote but a user may have
// since hand-edited — so both quoting styles and the bare form are accepted.
function parseFormatFromCommand(command) {
  if (typeof command !== "string") return null;
  const match = command.match(/--format=("(?:[^"\\]|\\.)*"|'[^']*'|\S+)/);
  if (!match) return null;
  const raw = match[1];
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  if (raw.startsWith("'")) return raw.slice(1, -1);
  return raw;
}

function currentFormat(host) {
  const settings = install.readSettings(install.settingsPathFor(host));
  const value = install.getIn(settings.data, host.settingsKey);
  return parseFormatFromCommand(value && typeof value === "object" ? value.command : undefined);
}

async function run(command, argv, env) {
  const packageName = require("../../package.json").name;
  const mode = capability(argv, env);
  const host = await pickHost(argv, mode);
  if (!host) return;

  const resolver = createSampleResolver(host);
  const existing = currentFormat(host);

  if (mode === "print") {
    process.stdout.write(
      `\n  ${BOLD}agenthud${RESET} ${DIM}— this terminal is not interactive` +
      ` (run it in a plain shell for the editor)${RESET}\n\n` +
      TEMPLATES.map((template) =>
        `  ${BOLD}${template.name}${RESET}\n    ${renderFormat(template.format, resolver)}\n` +
        `    ${DIM}--format=${JSON.stringify(template.format)}${RESET}\n`
      ).join("\n") +
      printSnippet(host, existing ?? DEFAULT_FORMAT, packageName)
    );
    return;
  }

  const start = command === "edit" && existing
    ? existing
    : await pickStart(host, resolver, existing, mode);
  if (!start) return;

  const format = mode === "tui"
    ? await runTui({ host, resolver, format: start })
    : await numbered.run({ host, resolver });

  if (!format) {
    process.stdout.write("\n  Cancelled. Nothing was written.\n");
    return;
  }

  process.stdout.write(`\n  ${renderFormat(format, resolver)}\n`);
  process.stdout.write(`  ${DIM}--format=${JSON.stringify(format)}${RESET}\n`);
  await confirmAndWrite(host, format, packageName);
}

module.exports = { run, capability, currentFormat, parseFormatFromCommand, segmentFor };

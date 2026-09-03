"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// A Host's settings file belongs to the Host and to the user. Three rules
// follow, and none of them is optional:
//
//   1. Only the statusLine key is touched; everything else round-trips.
//   2. A backup is written before the file is.
//   3. A file this package cannot round-trip losslessly is never written —
//      the snippet is printed instead. Silently deleting somebody's JSON
//      comments to save them one paste is a bad trade.

function expandPath(template) {
  return template.replace(/^~/, os.homedir()).replace(/^%USERPROFILE%/i, os.homedir());
}

// A Host may name more than one candidate file — Copilot CLI's has been
// documented under two names. Whichever already exists wins, so an existing
// configuration is extended rather than shadowed by a second file the CLI may
// not even read; with none present, the first candidate is created.
function settingsPathsFor(host) {
  const value = process.platform === "win32" ? host.settingsPath.win32 : host.settingsPath.posix;
  return (Array.isArray(value) ? value : [value]).map(expandPath);
}

function settingsPathFor(host) {
  const candidates = settingsPathsFor(host);
  return candidates.find((file) => fs.existsSync(file)) ?? candidates[0];
}

// `//` or `/*` outside a JSON string. Several Hosts accept JSONC, and
// JSON.parse -> JSON.stringify would erase every comment in the file.
function hasComments(text) {
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (char === "\\") i++;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === "/" && (text[i + 1] === "/" || text[i + 1] === "*")) return true;
  }
  return false;
}

function detectIndent(text) {
  const match = text.match(/\n([ \t]+)"/);
  if (!match) return 2;
  return match[1] === "\t" ? "\t" : match[1].length;
}

function setIn(object, keyPath, value) {
  let node = object;
  for (const key of keyPath.slice(0, -1)) {
    if (typeof node[key] !== "object" || node[key] === null) node[key] = {};
    node = node[key];
  }
  node[keyPath[keyPath.length - 1]] = value;
  return object;
}

function getIn(object, keyPath) {
  let node = object;
  for (const key of keyPath) {
    if (typeof node !== "object" || node === null) return undefined;
    node = node[key];
  }
  return node;
}

// Reads a Host's settings and reports whether it is safe to write back.
function readSettings(file) {
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { exists: false, writable: true, text: "", data: {}, indent: 2 };
    return { exists: true, writable: false, reason: error.message, text: "", data: {}, indent: 2 };
  }

  if (hasComments(text)) {
    return { exists: true, writable: false, reason: "the file contains comments", text, data: {}, indent: 2 };
  }
  try {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return { exists: true, writable: false, reason: "top level is not an object", text, data: {}, indent: 2 };
    }
    return { exists: true, writable: true, text, data, indent: detectIndent(text) };
  } catch (error) {
    return { exists: true, writable: false, reason: `invalid JSON (${error.message})`, text, data: {}, indent: 2 };
  }
}

// JSON.parse and JSON.stringify both preserve key order, so an existing
// statusLine keeps its position and only whitespace style could shift — which
// detectIndent then matches. A new key is appended at the end.
function renderSettings(settings, keyPath, value) {
  const next = JSON.parse(JSON.stringify(settings.data));
  setIn(next, keyPath, value);
  return JSON.stringify(next, null, settings.indent) + "\n";
}

// A window around the change rather than a full-file dump: the point is to let
// someone see what is about to happen to their config in one glance.
function diff(before, after) {
  const a = before.split("\n");
  const b = after.split("\n");
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length - 1;
  let endB = b.length - 1;
  while (endA >= start && endB >= start && a[endA] === b[endB]) { endA--; endB--; }

  const lines = [];
  const context = 2;
  for (let i = Math.max(0, start - context); i < start; i++) lines.push(`  ${a[i]}`);
  for (let i = start; i <= endA; i++) lines.push(`- ${a[i]}`);
  for (let i = start; i <= endB; i++) lines.push(`+ ${b[i]}`);
  for (let i = endA + 1; i <= Math.min(a.length - 1, endA + context); i++) lines.push(`  ${a[i]}`);
  return lines.join("\n");
}

function backup(file) {
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  const target = `${file}.bak-${stamp}`;
  fs.copyFileSync(file, target);
  return target;
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text, "utf8");
}

// Where this copy is running from decides how the Host should invoke it.
// Installed from npm, `npx -y hudline` is right. Run out of a git checkout —
// which is the only way to run it before it is published — `npx` would fetch a
// different package or fail outright, so the command has to point at this file.
function launcherFor(packageName = "hudline") {
  const entry = require.resolve("../../bin/hudline.js");
  if (entry.includes(`${path.sep}node_modules${path.sep}`)) return `npx -y ${packageName}`;
  return `node ${entry}`;
}

function commandFor(host, format, packageName = "hudline", launcher = launcherFor(packageName), themeId) {
  const hostFlag = host.id === "claude-code" ? "" : ` --host=${host.id}`;
  // Omitted when it is the default, for the same reason --host is: a flag that
  // restates the default is noise in a file the user has to live with.
  const themeFlag = themeId && themeId !== "plain" ? ` --theme=${themeId}` : "";
  return `${launcher}${hostFlag}${themeFlag} --format=${JSON.stringify(format)}`;
}

module.exports = {
  settingsPathFor, settingsPathsFor, expandPath, readSettings, renderSettings, diff, backup, write,
  commandFor, launcherFor, hasComments, detectIndent, getIn, setIn,
};

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";

export const root = fileURLToPath(new URL("../", import.meta.url));

// Keep this list explicit: local exports, tests and credentials never belong in a release.
export const extensionFiles = [
  "manifest.json",
  "popup.html", "popup.css", "popup.js",
  "options.html", "options.css", "options.js",
  "src/background.js", "src/content.js", "src/export-core.js",
  "src/assistant-core.js", "src/assistant-store.js", "src/assistant-drafts.js",
  "src/assistant-ui.js", "src/assistant-page.js",
  "icons/icon-16.png", "icons/icon-32.png", "icons/icon-48.png", "icons/icon-128.png",
  "LICENSE", "PRIVACY.md"
].sort();

export function readExtension() {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
  const metadata = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  assert.equal(manifest.manifest_version, 3, "Expected a Manifest V3 extension");
  assert.equal(manifest.version, metadata.version, "Manifest and package versions must match");
  assert.match(metadata.version, /^\d+\.\d+\.\d+$/, "Expected a numeric release version");
  assert.match(metadata.name, /^[a-z0-9-]+$/, "Expected a safe package name");
  assert.equal(metadata.license, "MIT", "Package metadata must match LICENSE");

  const entries = extensionFiles.map((name) => {
    const filename = path.join(root, name);
    assert.ok(fs.lstatSync(filename).isFile(), `${name} must be a regular file, not a symlink`);
    return { name, data: fs.readFileSync(filename) };
  });
  const included = new Set(extensionFiles);
  const requireFile = (name, from = "manifest.json") => {
    assert.ok(included.has(name), `${from} references an unpackaged file: ${name}`);
  };
  const references = [
    manifest.background.service_worker,
    manifest.action.default_popup,
    manifest.options_ui.page,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
    ...manifest.content_scripts.flatMap((script) => [...script.js, ...(script.css || [])])
  ];
  references.forEach((name) => requireFile(name));
  for (const { name, data } of entries) {
    if (name.endsWith(".html")) {
      const html = data.toString("utf8");
      for (const match of html.matchAll(/<(?:script|link)\b[^>]*\b(?:src|href)=["']([^"']+)["']/gi)) {
        requireFile(path.posix.join(path.posix.dirname(name), match[1]), name);
      }
    }
    if (name.endsWith(".js")) {
      for (const call of data.toString("utf8").matchAll(/\bimportScripts\(([^)]+)\)/g)) {
        for (const match of call[1].matchAll(/["']([^"']+)["']/g)) {
          requireFile(path.posix.join(path.posix.dirname(name), match[1]), name);
        }
      }
    }
  }
  return { manifest, metadata, entries };
}

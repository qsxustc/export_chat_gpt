import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { root, readExtension } from "./extension-files.mjs";

try {
  readExtension();
  function scriptsIn(directory) {
    return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) return scriptsIn(filename);
      return entry.isFile() && /\.(?:js|mjs)$/.test(entry.name) ? [filename] : [];
    });
  }
  const scripts = ["popup.js", "options.js", ...["src", "scripts", "tests"].flatMap(scriptsIn)].sort();
  for (const filename of scripts) {
    const result = spawnSync(process.execPath, ["--check", path.join(root, filename)], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Syntax check failed: ${filename}`);
  }
  console.log(`Checked ${scripts.length} scripts, extension assets and release metadata.`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

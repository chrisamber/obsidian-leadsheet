// Runs from the `npm version` lifecycle: sync the new package.json version
// into manifest.json and versions.json (Obsidian's version -> minAppVersion map).
import { readFileSync, writeFileSync } from "node:fs";

const target = process.env.npm_package_version;
if (!target) {
  console.error("run via `npm version <bump>` (npm_package_version not set)");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = target;
writeFileSync("manifest.json", JSON.stringify(manifest, null, 2) + "\n");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[target] = manifest.minAppVersion;
writeFileSync("versions.json", JSON.stringify(versions, null, 2) + "\n");

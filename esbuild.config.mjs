import esbuild from "esbuild";
import { readdirSync } from "node:fs";

// Obsidian plugin bundle (CommonJS). Obsidian and the CodeMirror 6 packages it
// ships are provided by the host at runtime, so mark them external.
await esbuild.build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "@codemirror/view", "@codemirror/state", "@codemirror/language"],
  format: "cjs",
  target: "es2020",
  outfile: "main.js",
});

// Every other src/*.ts -> self-contained ESM for node tooling + tests.
// Loops over files that actually exist, so each worktree builds only its own modules.
for (const file of readdirSync("src")) {
  if (!file.endsWith(".ts") || file === "main.ts") continue;
  const name = file.slice(0, -3);
  await esbuild.build({
    entryPoints: [`src/${file}`],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2020",
    outfile: `${name}.mjs`,
  });
}

await esbuild.build({
  entryPoints: ["tools/cli.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  target: "es2020",
  outfile: "cli.mjs",
});

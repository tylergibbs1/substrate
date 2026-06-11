// Bundle the server into a single self-contained ESM file for the packaged
// desktop app — no node_modules to ship. Run with Node 24 / Electron-as-node
// (both have node:sqlite). The createRequire banner lets bundled CJS deps (ws,
// pptxgenjs) `require(...)` node builtins in ESM output; the two ws optionals are
// native add-ons ws degrades without.
import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  packages: "bundle",
  external: ["bufferutil", "utf-8-validate"],
  banner: { js: "import{createRequire as __cr}from'node:module';const require=__cr(import.meta.url);" },
  outfile: "dist/server.mjs",
  logLevel: "info",
});

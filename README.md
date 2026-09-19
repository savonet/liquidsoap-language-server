# liquidsoap-language-server

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) server for [Liquidsoap](https://github.com/savonet/liquidsoap) scripts. It works with any editor that has an LSP client: VS Code, Neovim, Emacs, Helix, Zed and others.

The server runs Liquidsoap's own parser and typechecker, compiled to WebAssembly. It typechecks scripts against the full standard library without a native Liquidsoap binary.

This is early work: the server reports diagnostics (type and parse errors, warnings) for scripts that parse. Hover and completion come next.

## Layout

This is a pnpm workspace. Dependency versions are set once, in the catalog in `pnpm-workspace.yaml`.

- `analysis/`: `analysis_wasm.ml` wraps `Liquidsoap_tooling.Analysis` from Liquidsoap for JavaScript, built with wasm_of_ocaml. `wasm_stubs.wat` provides the runtime primitives it needs that have no wasm implementation.
- `server/`: the language server, in TypeScript. `pnpm run build` compiles it into `server/dist/`, next to the wasm module and `stdlib.types`.

## Building

The analysis module builds against the Liquidsoap libraries. From a Liquidsoap checkout:

```sh
cd /path/to/liquidsoap
dune build @install src/js/stdlib.types
```

`stdlib.types` is the standard library's typing environment. It must come from the same Liquidsoap commit as the libraries: loading checks the version.

Then here:

```sh
(cd analysis && OCAMLPATH=/path/to/liquidsoap/_build/install/default/lib dune build --profile release ./analysis_wasm.bc.wasm.js)
pnpm install
LIQUIDSOAP_STDLIB_TYPES=/path/to/liquidsoap/_build/default/src/js/stdlib.types pnpm run build
pnpm test
```

## Using it

Start the server with `node server/dist/server.js --stdio`. Run the file directly: the wasm module is found next to the script Node was started with.

With Neovim 0.11 or later:

```lua
vim.filetype.add({ extension = { liq = "liquidsoap" } })

vim.lsp.config("liquidsoap", {
  cmd = { "node", "/path/to/liquidsoap-language-server/server/dist/server.js", "--stdio" },
  filetypes = { "liquidsoap" },
  root_markers = { ".git" },
})
vim.lsp.enable("liquidsoap")
```

## Timing

`analysis/spike.cjs` loads the module and `stdlib.types`, then times a few checks. Copy the build output next to it first:

```sh
mkdir -p /tmp/spike
cp -r analysis/_build/default/analysis_wasm.bc.wasm.js analysis/_build/default/analysis_wasm.bc.wasm.assets analysis/spike.cjs /tmp/spike/
node /tmp/spike/spike.cjs /tmp/spike/analysis_wasm.bc.wasm.js /path/to/liquidsoap/_build/default/src/js/stdlib.types
```

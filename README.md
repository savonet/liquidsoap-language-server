# liquidsoap-language-server

A [Language Server Protocol](https://microsoft.github.io/language-server-protocol/) server for [Liquidsoap](https://github.com/savonet/liquidsoap) scripts. It works with any editor that has an LSP client: VS Code, Neovim, Emacs, Helix, Zed and others.

The server runs Liquidsoap's own parser and typechecker, compiled to WebAssembly. It typechecks scripts against the full standard library without a native Liquidsoap binary.

This is early work. Only the analysis module exists so far.

## Layout

- `analysis/`: `analysis_wasm.ml` wraps `Liquidsoap_tooling.Analysis` from Liquidsoap for JavaScript, built with wasm_of_ocaml. `wasm_stubs.wat` provides the runtime primitives it needs that have no wasm implementation.

## Building the analysis module

It builds against the Liquidsoap libraries. From a Liquidsoap checkout:

```sh
cd /path/to/liquidsoap
dune build @install
dune build src/js/stdlib.types
```

Then here:

```sh
cd analysis
OCAMLPATH=/path/to/liquidsoap/_build/install/default/lib dune build --profile release ./analysis_wasm.bc.wasm.js
```

`stdlib.types` is the standard library's typing environment. It must come from the same Liquidsoap commit as the libraries: loading checks the version.

## Trying it

`analysis/spike.cjs` loads the module and `stdlib.types`, then times a few checks. The wasm loader finds its assets next to the script Node was started with, so copy the build output next to it first:

```sh
mkdir -p /tmp/spike
cp -r analysis/_build/default/analysis_wasm.bc.wasm.js analysis/_build/default/analysis_wasm.bc.wasm.assets analysis/spike.cjs /tmp/spike/
node /tmp/spike/spike.cjs /tmp/spike/analysis_wasm.bc.wasm.js /path/to/liquidsoap/_build/default/src/js/stdlib.types
```

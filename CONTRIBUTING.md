# Contributing

This is the part for working on the server itself. The [README](README.md) is about using it.

[TODO.md](TODO.md) lists the known gaps.

## Layout

This is a pnpm workspace. Dependency versions are set once, in the catalog in `pnpm-workspace.yaml`.

- `analysis/`: `analysis_wasm.ml` wraps `Liquidsoap_tooling.Analysis` from Liquidsoap for JavaScript, built with wasm_of_ocaml. `wasm_stubs.wat` provides the runtime primitives it needs that have no wasm implementation.
- `patcher/`: turns a broken script into a valid one, with tree-sitter and the tree-sitter-liquidsoap grammar compiled to wasm. Its golden tests are in `patcher/test/cases/` and `patcher/test/expected/`; run them with `UPDATE=1` to rewrite the expected files.
- `server/`: the language server, in TypeScript. `pnpm run build` compiles it into `server/dist/`, next to the wasm module and `stdlib.types`.

## Building

You need:

- [Node.js](https://nodejs.org) 22 or later and [pnpm](https://pnpm.io),
- an [opam](https://opam.ocaml.org) switch with OCaml 5.5, Liquidsoap's required dependencies, and `wasm_of_ocaml-compiler`; [binaryen](https://github.com/WebAssembly/binaryen) 119 or later must be on the `PATH` for it,
- the [tree-sitter CLI](https://tree-sitter.github.io/tree-sitter/creating-parsers/1-getting-started.html), which builds the grammar to wasm,
- checkouts of [Liquidsoap](https://github.com/savonet/liquidsoap) and [tree-sitter-liquidsoap](https://github.com/savonet/tree-sitter-liquidsoap), at the commits `LIQUIDSOAP_REF` and `TREE_SITTER_LIQUIDSOAP_REF` in `.github/workflows/ci.yml`.

`.github/workflows/ci.yml` does all of this on a fresh Ubuntu machine, and is the reference when these steps and it disagree.

The analysis module builds against the Liquidsoap libraries. From the Liquidsoap checkout:

```sh
cd /path/to/liquidsoap
dune build @install src/js/stdlib.types
_build/default/src/bin/liquidsoap.exe --stdlib ./src/libs/stdlib.liq --list-functions-json > functions.json
```

`stdlib.types` is the standard library's typing environment. It must come from the same Liquidsoap commit as the libraries: loading checks the version. `functions.json` holds the documentation shown on hover.

Then here:

```sh
(cd analysis && OCAMLPATH=/path/to/liquidsoap/_build/install/default/lib dune build --profile release ./analysis_wasm.bc.wasm.js)
pnpm install
TREE_SITTER_LIQUIDSOAP=/path/to/tree-sitter-liquidsoap pnpm --filter liquidsoap-patcher run build:grammar
LIQUIDSOAP_STDLIB_TYPES=/path/to/liquidsoap/_build/default/src/js/stdlib.types \
LIQUIDSOAP_FUNCTIONS_JSON=/path/to/liquidsoap/functions.json \
  pnpm run build
pnpm test
```

## Packing

`node scripts/pack.mjs [version] [outdir]` packs the built server into one npm tarball, with the patcher bundled in. CI does this on each push to `main`, and attaches the tarball to the `main-build` prerelease, which the README's install command points to.

## Tests

`pnpm test` runs both packages' tests. Most are snapshot tests:

- `patcher/test/cases/` holds broken scripts, and `patcher/test/expected/` their patched form.
- `server/test/cases/` holds scripts opened in the built server as an editor would. Their `#? hover|complete|definition|signature L:C`, `#? resolve L:C label` and `#? symbols|format` comments are queries, answered in `server/test/expected/` along with the script's diagnostics. Lines start at 1 and characters are UTF-16 code units from 0, as the editor counts them.

Run a package's tests with `UPDATE=1` to rewrite its expected files, then review the diff.

CI builds everything against the Liquidsoap commit pinned as `LIQUIDSOAP_REF` in `.github/workflows/ci.yml`. A change that needs a new analysis from Liquidsoap moves that pin.

## Timing

`analysis/spike.cjs` loads the module and `stdlib.types`, then times a few checks. Copy the build output next to it first:

```sh
mkdir -p /tmp/spike
cp -r analysis/_build/default/analysis_wasm.bc.wasm.js analysis/_build/default/analysis_wasm.bc.wasm.assets analysis/spike.cjs /tmp/spike/
node /tmp/spike/spike.cjs /tmp/spike/analysis_wasm.bc.wasm.js /path/to/liquidsoap/_build/default/src/js/stdlib.types
```

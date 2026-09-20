# TODO

Known gaps, roughly in the order they are worth doing.

## `%argsof` scripts get no analysis

`%argsof(f)` is expanded by Liquidsoap's reducer through `Environment.get_builtin`, which needs `f`'s runtime value for its argument names and defaults (`term_reducer_argsof.ml`). The server restores types only, so the lookup fails with `Builtin f is not registered!`. That happens while desugaring, before typechecking, so the whole script ends up with no types: no hover, no completion, anywhere in it.

This is mostly the standard library editing itself: `%argsof` appears 85 times in `src/libs/*.liq` and never in the documentation's examples.

To fix it, Liquidsoap would need to build the arguments from `f`'s type when the builtin is not registered, with a hook for the analysis to resolve a name to a type, and the universal placeholder as each default.

## Use the standard library of the liquidsoap on the machine

The bundled `stdlib.types` and documentation come from the build CI pinned, so they carry that build's optional dependencies and the LV2 and LADSPA plugins of the machine that built it, which say nothing about the user's.

Where a `liquidsoap` is installed, the server could run `liquidsoap --cache-js-stdlib <file>` and `liquidsoap --list-functions-json` once, cache both under the user's cache directory keyed by the binary's path and mtime, and load them instead. The typing dump carries its own format version, so any liquidsoap writing that format is readable, and a dump the server cannot read falls back to the bundled one. The operators would then be the ones that user actually has, LV2 and LADSPA included.

Open ends: which setting names the binary (`liquidsoap.path`, or the `PATH`), and loading the bundled files first so that startup is not delayed by generating the dump.

## Publishing

The server is installed from the tarball attached to the `main-build` prerelease. With Liquidsoap 2.5.0 it should be published on npm, which needs a decision on how a released server gets its reference standard library from Liquidsoap's CI, and on how package versions track Liquidsoap releases.

## Visual Studio Code

The Liquidsoap extension does not start the server. It needs a client that launches the bundled `server.js`, or that finds `liquidsoap-language-server` on the `PATH`.

## Smaller things

- Hovering a source prints its whole type, every method included. Long types could be shortened.
- Completion checks the script on each request, since it edits the source around the cursor first. Only the unchanged script is cached.
- A definition inside a region tree-sitter cannot parse is missing from the outline.
- An error in a file included by an included file is reported at the top of the document, because the analysis does not say which `%include` brought it in.

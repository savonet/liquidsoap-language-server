# TODO

Known gaps, roughly in the order they are worth doing.

## `%argsof` scripts get no analysis

`%argsof(f)` is expanded by Liquidsoap's reducer through `Environment.get_builtin`, which needs `f`'s runtime value for its argument names and defaults (`term_reducer_argsof.ml`). The server restores types only, so the lookup fails with `Builtin f is not registered!`. That happens while desugaring, before typechecking, so the whole script ends up with no types: no hover, no completion, anywhere in it.

This is mostly the standard library editing itself: `%argsof` appears 85 times in `src/libs/*.liq` and never in the documentation's examples.

To fix it, Liquidsoap would need to build the arguments from `f`'s type when the builtin is not registered, with a hook for the analysis to resolve a name to a type, and the universal placeholder as each default.

## Publishing

The server is installed from the tarball attached to the `main-build` prerelease. With Liquidsoap 2.5.0 it should be published on npm, which needs a decision on how a released server gets its reference standard library from Liquidsoap's CI, and on how package versions track Liquidsoap releases.

## Visual Studio Code

The [extension](https://github.com/savonet/vscode-liquidsoap) starts the server and ships it in its package. It is not released yet, and the release should go together with the server's.

## Smaller things

- Hovering a source prints its whole type, every method included. Long types could be shortened.
- Semantic tokens classify a name where it is bound, so a use of a parameter is highlighted as a variable, and a method is never marked as the standard library's.
- Completion checks the script on each request, since it edits the source around the cursor first. Only the unchanged script is cached.
- A definition inside a region tree-sitter cannot parse is missing from the outline.
- An error in a file included by an included file is reported at the top of the document, because the analysis does not say which `%include` brought it in.

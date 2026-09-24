#!/bin/sh
# Skipped when ocamlformat is missing or is not the version .ocamlformat pins,
# so that committing does not need an OCaml setup.
want=$(sed -n 's/^version *= *//p' analysis/.ocamlformat)
have=$(ocamlformat --version 2>/dev/null) || {
  echo "ocamlformat not found, OCaml files left unformatted." >&2
  exit 0
}
if [ "$have" != "$want" ]; then
  echo "ocamlformat is $have, not $want: OCaml files left unformatted." >&2
  exit 0
fi
exec ocamlformat --inplace "$@"

# liquidsoap-language-server

Editor support for [Liquidsoap](https://www.liquidsoap.info) scripts: errors as you type, types and documentation on hover, completion, and more. It speaks the [Language Server Protocol](https://microsoft.github.io/language-server-protocol/), so it works in any editor that has an LSP client. Setup for Neovim, Helix and Emacs is below.

The server runs Liquidsoap's own parser and typechecker, so it reports the same errors as `liquidsoap --check`, without running your script. It does not need Liquidsoap to be installed.

This is early work. Feedback and bug reports are welcome on the [issue tracker](https://github.com/savonet/liquidsoap-language-server/issues).

## Features

- **Errors and warnings** while you type: syntax errors, type errors, unused variables. Every type error in a script is reported, not just the first one. An error inside a file you `%include` shows on the `%include` line, with a link to where it is.
- **Hover**: the documentation of standard library functions, or the type of the expression under the cursor.
- **Completion**: the names in scope, and the methods of a value after `.`, with the documentation of standard library functions.
- **Signature help**: the parameters of a standard library function while you type its arguments.
- **Go to definition** of a name your script defines, including in files you `%include`.
- **Document outline**: the definitions of the script, nested inside the functions that define them.
- **Highlighting**: functions, methods, parameters, properties and types are told apart by the parser, with the standard library's names marked, through semantic tokens.
- **Formatting** with [liquidsoap-prettier](https://github.com/savonet/liquidsoap-prettier). A `.prettierrc` next to your script is respected.

A script you are editing is usually not valid Liquidsoap at every keystroke. The server tries to replace the broken parts with a universal placeholder, so that the rest of the script keeps its errors, types and completions.

Where `liquidsoap` is installed, the server asks it for its standard library, so the operators it knows are the ones you have, LV2 and LADSPA plugins included. It reads that once per Liquidsoap version, and keeps it under `~/.cache/liquidsoap-language-server/`. Set `LIQUIDSOAP` to another binary to pick one, or to nothing (`LIQUIDSOAP=`) to always use the standard library the server ships with, which is also what happens when no `liquidsoap` is found, or when its version is too old to be read.

## Installing

The server needs [Node.js](https://nodejs.org) 22 or later. In Visual Studio Code, the [extension](#visual-studio-code) ships the server, so none of this is needed.

The server will be published on npm with Liquidsoap 2.5.0. Until then, install the latest build from the `main` branch:

```sh
npm install -g https://github.com/savonet/liquidsoap-language-server/releases/download/main-build/liquidsoap-language-server.tgz
```

This installs the `liquidsoap-language-server` command, which your editor starts as `liquidsoap-language-server --stdio`. Run the same command again to update. The build knows the standard library of Liquidsoap's development version.

To build the server yourself instead, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Setting up your editor

### Neovim

Neovim 0.11 or later configures language servers without plugins. Add this to your `init.lua`:

```lua
vim.filetype.add({ extension = { liq = "liquidsoap" } })

vim.lsp.config("liquidsoap", {
  cmd = { "liquidsoap-language-server", "--stdio" },
  filetypes = { "liquidsoap" },
  root_markers = { ".git" },
})
vim.lsp.enable("liquidsoap")
```

Open a `.liq` file, and `:checkhealth vim.lsp` should list the `liquidsoap` client. With Neovim's default mappings:

- errors show inline; `]d` and `[d` go to the next and previous one,
- `K` shows the documentation or type under the cursor,
- `CTRL-]` goes to a definition,
- `gO` lists the script's definitions,
- `CTRL-S` in insert mode shows a function's parameters,
- `CTRL-X CTRL-O` in insert mode completes,
- `:lua vim.lsp.buf.format()` formats the script.

### Helix

Add this to `~/.config/helix/languages.toml`:

```toml
[language-server.liquidsoap]
command = "liquidsoap-language-server"
args = ["--stdio"]

[[language]]
name = "liquidsoap"
scope = "source.liquidsoap"
file-types = ["liq"]
comment-token = "#"
indent = { tab-width = 2, unit = "  " }
language-servers = ["liquidsoap"]
```

`hx --health liquidsoap` should find the language server. Errors show inline, `space k` shows documentation, `g d` goes to a definition, `space s` lists the script's definitions, and `:format` formats the script. Completion and signature help show up as you type.

### Emacs

Emacs 29 and later come with the Eglot client. Liquidsoap's Emacs mode, `liquidsoap-mode`, is installed by the opam package of the same name (`opam install liquidsoap-mode`), or can be copied from [`scripts/liquidsoap-mode.el`](https://github.com/savonet/liquidsoap/blob/main/scripts/liquidsoap-mode.el) in the Liquidsoap repository. Then, in your init file:

```elisp
;; Where opam installs the mode; use your own directory if you copied it.
(add-to-list 'load-path
             (expand-file-name "share/emacs/site-lisp"
                               (string-trim (shell-command-to-string "opam var prefix"))))
(require 'liquidsoap-mode)

(with-eval-after-load 'eglot
  (add-to-list 'eglot-server-programs
               '(liquidsoap-mode . ("liquidsoap-language-server" "--stdio"))))
(add-hook 'liquidsoap-mode-hook #'eglot-ensure)
```

Errors show with Flymake, documentation and a function's parameters in the echo area, `M-.` goes to a definition, `M-x imenu` lists the script's definitions, `C-M-i` completes, and `M-x eglot-format-buffer` formats the script.

### Visual Studio Code

The [Liquidsoap extension](https://github.com/savonet/vscode-liquidsoap) starts the server and ships it, so there is nothing else to install. It is not on the Marketplace yet: build it from its repository, which explains how, and install the `.vsix` it writes with "Extensions: Install from VSIX..." in the command palette.

Errors show in the editor and in the Problems panel, and the usual commands apply: F12 goes to a definition, Ctrl+Space completes, Shift+Alt+F formats. The web version of Visual Studio Code has highlighting and formatting only, since the server needs Node.

### Other editors

Any LSP client can start the server. It communicates over standard input and output, and handles files with the `.liq` extension. Configure your client to run:

```sh
liquidsoap-language-server --stdio
```

## Troubleshooting

- **Nothing happens when opening a `.liq` file.** Check that `liquidsoap-language-server` is on the `PATH` your editor sees, and that your editor starts it, with the health commands above. The server logs its errors to your editor's language server log.
- **The server reports errors in a script that `liquidsoap` runs fine.** The server may know a different Liquidsoap version than yours: see [Features](#features). Please report other cases on the issue tracker, with the script.
- **An `%include`d file is not found.** Includes resolve next to the script, as `liquidsoap` does. A buffer that is not saved to a file cannot include files by a relative path.

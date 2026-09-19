import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/** A span in a file, with Liquidsoap's 1-based lines and byte columns. */
export interface Span {
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface RawDiagnostic extends Span {
  severity: "error" | "warning";
  code: number;
  message: string;
}

export interface Method {
  name: string;
  type: string;
}

export interface Analysis {
  /** [file] is the script's path, or empty for a document with none. */
  check(source: string, file: string): RawDiagnostic[];
  typeAt(line: number, column: number): string | null;
  localsAt(line: number, column: number): string[];
  scopeAt(line: number, column: number): string[];
  methodsAt(line: number, column: number): Method[];
  definitionAt(line: number, column: number): Span | null;
  nullMethods(): Method[];
}

interface WasmModule extends Analysis {
  loadEnv(dump: Uint8Array): void;
}

const waitForExport = async (
  exported: Record<string, unknown>,
): Promise<WasmModule> => {
  for (let attempt = 0; attempt < 2000; attempt++) {
    const module = (exported.liquidsoap ??
      (globalThis as Record<string, unknown>).liquidsoap) as
      | WasmModule
      | undefined;
    if (module) return module;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error("The analysis module did not initialize.");
};

export const scriptPath = (uri: string): string =>
  uri.startsWith("file:") ? fileURLToPath(uri) : "";

/**
 * Skips checking the script the analysis last checked, which diagnostics and
 * hover on an unchanged document both ask for.
 */
export const rememberLastCheck = (analysis: Analysis): Analysis => {
  let last: { source: string; file: string; result: RawDiagnostic[] } | undefined;
  return {
    check: (source, file) => {
      if (last?.source !== source || last.file !== file)
        last = { source, file, result: analysis.check(source, file) };
      return last.result;
    },
    typeAt: (line, column) => analysis.typeAt(line, column),
    localsAt: (line, column) => analysis.localsAt(line, column),
    scopeAt: (line, column) => analysis.scopeAt(line, column),
    methodsAt: (line, column) => analysis.methodsAt(line, column),
    definitionAt: (line, column) => analysis.definitionAt(line, column),
    nullMethods: () => analysis.nullMethods(),
  };
};

export const loadAnalysis = async (dir: string): Promise<Analysis> => {
  const exported = require(path.join(dir, "analysis_wasm.bc.wasm.js"));
  const module = await waitForExport(exported);
  module.loadEnv(fs.readFileSync(path.join(dir, "stdlib.types")));
  return rememberLastCheck(module);
};

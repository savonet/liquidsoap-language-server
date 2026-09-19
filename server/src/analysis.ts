import * as fs from "node:fs";
import * as path from "node:path";

export interface RawDiagnostic {
  severity: "error" | "warning";
  code: number;
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  message: string;
}

export interface Analysis {
  check(source: string): RawDiagnostic[];
  typeAt(line: number, column: number): string | null;
  localsAt(line: number, column: number): string[];
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

export const loadAnalysis = async (dir: string): Promise<Analysis> => {
  const exported = require(path.join(dir, "analysis_wasm.bc.wasm.js"));
  const module = await waitForExport(exported);
  module.loadEnv(fs.readFileSync(path.join(dir, "stdlib.types")));
  return module;
};

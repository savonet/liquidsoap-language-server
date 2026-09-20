import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { type Analysis, loadAnalysis } from "./analysis";
import { type Docs, docsFromFunctions, loadDocs } from "./docs";

export interface Stdlib {
  analysis: Analysis;
  docs: Docs;
  /** What the server loaded, for the log. */
  description: string;
}

/** The liquidsoap to ask, or nothing when `LIQUIDSOAP` is set to empty. */
const binary = (): string | undefined => {
  const setting = process.env.LIQUIDSOAP;
  return setting === undefined ? "liquidsoap" : setting || undefined;
};

// The documentation of every function is several megabytes.
const maxBuffer = 64 * 1024 * 1024;

const ask = (liquidsoap: string, args: string[]): string =>
  execFileSync(liquidsoap, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
    maxBuffer,
  });

const version = (liquidsoap: string): string => {
  const printed = ask(liquidsoap, ["--version"]).split("\n")[0];
  const version = /^Liquidsoap (\S+)/.exec(printed)?.[1];
  if (!version) throw new Error(`${liquidsoap} --version printed ${printed}`);
  return version;
};

const cacheDirectory = (version: string): string =>
  path.join(
    process.env.XDG_CACHE_HOME || path.join(os.homedir(), ".cache"),
    "liquidsoap-language-server",
    version.replace(/[^\w.+@-]/g, "_"),
  );

// Generating the typing environment takes a few seconds, so it is kept per
// liquidsoap version, which `--version` is enough to look up.
const generate = (liquidsoap: string, directory: string) => {
  fs.mkdirSync(directory, { recursive: true });
  const types = path.join(directory, "stdlib.types");
  const docs = path.join(directory, "docs.json");
  ask(liquidsoap, ["--cache-js-stdlib", `${types}.part`]);
  fs.writeFileSync(
    `${docs}.part`,
    JSON.stringify(
      docsFromFunctions(ask(liquidsoap, ["--list-functions-json"]), {
        keepPlugins: true,
      }),
    ),
  );
  fs.renameSync(`${types}.part`, types);
  fs.renameSync(`${docs}.part`, docs);
};

const fromLiquidsoap = async (): Promise<Stdlib | undefined> => {
  const liquidsoap = binary();
  if (!liquidsoap) return undefined;
  const installed = version(liquidsoap);
  const directory = cacheDirectory(installed);
  const types = path.join(directory, "stdlib.types");
  if (!fs.existsSync(types) || !fs.existsSync(path.join(directory, "docs.json")))
    generate(liquidsoap, directory);
  return {
    analysis: await loadAnalysis(fs.readFileSync(types)),
    docs: loadDocs(directory),
    description: `the standard library of liquidsoap ${installed}`,
  };
};

/**
 * The standard library of the liquidsoap installed on the machine, or the one
 * the server ships when there is none, or it cannot be read.
 */
export const loadStdlib = async (dir: string): Promise<Stdlib> => {
  try {
    const local = await fromLiquidsoap();
    if (local) return local;
  } catch (error) {
    console.error(`Falling back to the bundled standard library: ${error}`);
  }
  return {
    analysis: await loadAnalysis(fs.readFileSync(path.join(dir, "stdlib.types"))),
    docs: loadDocs(dir),
    description: "the bundled standard library",
  };
};

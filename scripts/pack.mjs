// Packs the built server into one npm tarball, with the patcher bundled in
// since it is not published on its own. Usage: node scripts/pack.mjs [version] [outdir]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const [version = "0.0.0", outdir = root] = process.argv.slice(2);
const stage = fs.mkdtempSync(path.join(os.tmpdir(), "liquidsoap-language-server-"));

const run = (command, args, cwd) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }).trim();

// pnpm resolves the `catalog:` and `workspace:` versions of each package.
const pnpmPack = (packageDir, into) => {
  const tarball = run("pnpm", ["pack", "--pack-destination", stage], packageDir)
    .split("\n")
    .at(-1);
  fs.mkdirSync(into, { recursive: true });
  run(
    "tar",
    ["xzf", path.resolve(packageDir, tarball), "-C", into, "--strip-components=1"],
    stage,
  );
};

const server = path.join(stage, "server");
pnpmPack(path.join(root, "server"), server);
const patcher = path.join(server, "node_modules", "liquidsoap-patcher");
pnpmPack(path.join(root, "patcher"), patcher);

const manifestFile = path.join(server, "package.json");
const manifest = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
const patcherManifest = JSON.parse(
  fs.readFileSync(path.join(patcher, "package.json"), "utf8"),
);
// npm leaves a bundled package's dependencies to the bundle, so they are
// bundled too.
const patcherDependencies = Object.entries(patcherManifest.dependencies ?? {});
for (const [name, range] of patcherDependencies) {
  const tarball = run(
    "npm",
    ["pack", `${name}@${range}`, "--pack-destination", stage],
    stage,
  )
    .split("\n")
    .at(-1);
  const into = path.join(server, "node_modules", name);
  fs.mkdirSync(into, { recursive: true });
  run(
    "tar",
    ["xzf", path.join(stage, tarball), "-C", into, "--strip-components=1"],
    stage,
  );
}
delete manifest.private;
delete manifest.devDependencies;
manifest.version = version;
manifest.dependencies = {
  ...Object.fromEntries(patcherDependencies),
  ...manifest.dependencies,
};
manifest.bundleDependencies = [
  "liquidsoap-patcher",
  ...patcherDependencies.map(([name]) => name),
];
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);

fs.mkdirSync(outdir, { recursive: true });
const tarball = run("npm", ["pack", "--pack-destination", path.resolve(outdir)], server)
  .split("\n")
  .at(-1);
console.log(path.join(path.resolve(outdir), tarball));

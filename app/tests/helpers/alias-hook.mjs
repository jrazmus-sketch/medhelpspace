/**
 * Lets `node --test` load the app's own TypeScript modules directly.
 *
 * Node 24 strips types natively, but it does not know about two things the
 * bundler handles for us:
 *   - the `@/*` path alias from tsconfig.json (`@/lib/br-date` → `src/lib/br-date`)
 *   - extensionless specifiers (`./derive` → `./derive.ts`)
 *
 * This resolve hook fills both gaps, so the tests import the REAL modules —
 * never a copy that can drift from what ships. No dependency; `registerHooks`
 * is built into node:module.
 *
 * Deliberately narrow: it only rewrites `@/…` specifiers and relative
 * specifiers coming from our own files. Anything inside node_modules is left to
 * Node's own resolver.
 */
import { registerHooks } from "node:module";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC_DIR = path.resolve(HERE, "..", "..", "src");

const EXTENSIONS = ["", ".ts", ".tsx", ".mts", ".js", "/index.ts", "/index.tsx"];

function firstExistingFile(base) {
  for (const ext of EXTENSIONS) {
    const candidate = base + ext;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const parent = context.parentURL ?? "";
    const fromOurCode = !parent.includes("node_modules");

    let base = null;
    if (specifier.startsWith("@/")) {
      base = path.join(SRC_DIR, specifier.slice(2));
    } else if (fromOurCode && specifier.startsWith(".") && parent.startsWith("file:")) {
      base = path.resolve(path.dirname(fileURLToPath(parent)), specifier);
    }

    if (base) {
      const resolved = firstExistingFile(base);
      if (resolved) {
        return { url: pathToFileURL(resolved).href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

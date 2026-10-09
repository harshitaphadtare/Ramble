// Copies the on-device AI runtimes from node_modules into public/wasm so they are served
// from our own origin (strict CSP, works offline). Output is gitignored.
import { cpSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const out = path.resolve(import.meta.dirname, '../public/wasm');

/** Package root, even when the package's exports map hides package.json. */
function pkgRoot(name) {
  const entry = require.resolve(name);
  const marker = path.join('node_modules', name);
  return entry.slice(0, entry.lastIndexOf(marker) + marker.length);
}

function copyDir(pkg, sub, dest, filter = () => true) {
  const pkgDir = pkgRoot(pkg);
  const src = path.join(pkgDir, sub);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(src).filter(filter)) cpSync(path.join(src, f), path.join(dest, f));
  console.log(`copied ${src} -> ${path.relative(process.cwd(), dest)}`);
}

copyDir('@litert-lm/core', 'wasm', path.join(out, 'litertlm'));
copyDir('onnxruntime-web', 'dist', path.join(out, 'ort'), (f) => /^ort-wasm-simd-threaded.*\.(mjs|wasm)$/.test(f));

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hash = (p) =>
  crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const textHash = (p) =>
  crypto
    .createHash('sha256')
    .update(fs.readFileSync(p, 'utf8').replaceAll('\r\n', '\n'))
    .digest('hex');
try {
  const manifest = JSON.parse(
    fs.readFileSync(
      path.join(root, 'public/docs/manual-manifest.json'),
      'utf8',
    ),
  );
  const changed = Object.entries(manifest.inputs)
    .filter(
      ([p, h]) =>
        !fs.existsSync(path.join(root, p)) ||
        textHash(path.join(root, p)) !== h,
    )
    .map(([p]) => p);
  const walk = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .flatMap((e) =>
        e.isDirectory()
          ? walk(path.join(dir, e.name))
          : [path.join(dir, e.name)],
      );
  for (const dir of ['app', 'lib', 'scripts', 'docs'])
    for (const p of walk(path.join(root, dir))) {
      if (!/\.(ts|tsx|css|mjs|py|md|json|ps1|cmd)$/.test(p)) continue;
      const relative = path.relative(root, p).replaceAll('\\', '/');
      if (!(relative in manifest.inputs)) changed.push(relative);
    }
  for (const [p, h] of Object.entries(manifest.outputs))
    if (
      !fs.existsSync(path.join(root, 'public/docs', p)) ||
      hash(path.join(root, 'public/docs', p)) !== h
    )
      changed.push('public/docs/' + p);
  if (changed.length)
    throw new Error(
      '功能或文件已異動，請同步 docs/system-manual.md、manual-meta.json 後執行 pnpm docs:build。\n' +
        changed.join('\n'),
    );
  console.log(
    `System manual ${manifest.revision}: source and all downloads are synchronized.`,
  );
} catch (e) {
  console.error(e.message);
  process.exitCode = 1;
}

import { build } from 'vite';
import { readFile, writeFile } from 'node:fs/promises';

const base = process.argv[2] || '/hexamotion/';
if (!/^\/(?:[\w.-]+\/)*$/.test(base)) throw new Error('Expected a site base path');
const publicPaths = /(["'`(])\/(?=(?:worlds|media|docs|type)(?:\/|["'`])|(?:index\.html|lab\.html|verification\.html|verification-scenes\.webp|reference-entry\.js|favicon\.svg)(?:["'`?#])|\?)/g;
const rebase = source => source.replace(publicPaths, '$1' + base);
await build({ base, plugins: [{
  name: 'hexamotion-pages-paths',
  enforce: 'pre',
  transform(source, id) {
    if (!/\/(app|lib)\/.*\.tsx?$/.test(id.replaceAll('\\', '/'))) return;
    let result = rebase(source);
    if (/(?:station\.tsx|workspace-reference\.tsx|workspace-route\.ts)$/.test(id))
      result = result.replaceAll('"/"', JSON.stringify(base));
    if (id.endsWith('station.tsx'))
      result = result.replace('p.match(/^\\/worlds', 'p.slice(' + (base.length - 1) + ').match(/^\\/worlds');
    return result;
  },
}] });
for (const file of ['docs/index.html', 'reference-entry.js', 'verification.html']) {
  const path = 'dist/' + file;
  let output = rebase(await readFile(path, 'utf8')).replaceAll('href="/"', 'href="' + base + '"');
  if (file === 'reference-entry.js') output = output.replace('new URL("/",', 'new URL(' + JSON.stringify(base) + ',');
  await writeFile(path, output);
}

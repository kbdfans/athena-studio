import {copyFileSync, cpSync, writeFileSync} from 'node:fs';
const base = process.argv[2] || '/studio/';
copyFileSync('dist/studio-v2.html', 'dist/index.html');
copyFileSync('LICENSE', 'dist/LICENSE.txt');
copyFileSync('THIRD_PARTY.md', 'dist/THIRD_PARTY.txt');
cpSync('licenses', 'dist/licenses', {recursive: true});
writeFileSync('dist/release.json', JSON.stringify({
  application: 'KBD Studio',
  builtAt: new Date().toISOString(),
  base,
}) + '\n');

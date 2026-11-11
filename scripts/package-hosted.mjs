import {copyFileSync, cpSync, writeFileSync} from 'node:fs';
copyFileSync('dist/studio-v2.html', 'dist/index.html');
copyFileSync('LICENSE', 'dist/LICENSE.txt');
copyFileSync('THIRD_PARTY.md', 'dist/THIRD_PARTY.txt');
cpSync('licenses', 'dist/licenses', {recursive: true});
writeFileSync('dist/release.json', JSON.stringify({
  application: 'Athena Studio',
  builtAt: new Date().toISOString(),
  base: '/studio/',
}) + '\n');

import {defineConfig} from 'vite';
import {resolve} from 'node:path';
export default defineConfig(({mode}) => ({
  base: mode === 'hosted' ? '/studio/' : '/',
  build: {rollupOptions: {input: mode === 'hosted'
    ? {studio: resolve('studio-v2.html')}
    : {legacy: resolve('index.html'), studio: resolve('studio-v2.html')}}},
}));

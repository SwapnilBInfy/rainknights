import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Phaser's published bundle always includes Matter and the WebAudio sound
 * manager. This game uses Arcade physics and its own synth, so the build
 * starts from Phaser's arcade entry and turns the webpack feature flags off.
 * `typeof FEATURE_SOUND` is truthy as plain JS (typeof returns a string);
 * the flags have to be replaced with booleans the way Phaser's own webpack
 * build does, or the unused code stays in the graph.
 */
const PHASER_FLAGS: Record<string, string> = {
  'typeof FEATURE_SOUND': 'false',
  'typeof PLUGIN_CAMERA3D': 'false',
  'typeof PLUGIN_FBINSTANT': 'false',
  'typeof PLUGIN_3D': 'false',
  'typeof CANVAS_RENDERER': 'true',
  'typeof WEBGL_RENDERER': 'true',
  'typeof WEBGL_DEBUG': 'false',
  'typeof EXPERIMENTAL': 'false',
};

function phaserSlim(): Plugin {
  const entry = path.resolve('node_modules/phaser/src/phaser-arcade-physics.js');
  return {
    name: 'phaser-slim',
    enforce: 'pre',
    resolveId(id) {
      if (id === 'phaser') return entry;
    },
    transform(code, id) {
      const normalized = id.split('\\').join('/');
      if (!normalized.includes('/phaser/src/')) return null;
      let out = code;
      for (const [from, to] of Object.entries(PHASER_FLAGS)) {
        if (out.includes(from)) out = out.split(from).join(to);
      }
      if (normalized.endsWith('/phaser-arcade-physics.js')) {
        out = out.replace('global.Phaser = Phaser;', 'globalThis.Phaser = Phaser;');
      }
      return out === code ? null : { code: out, map: null };
    },
  };
}

/** Keep the stylesheet in the first HTML response so it is not a second render-blocking request. */
function inlineBuiltCss(): Plugin {
  return {
    name: 'inline-built-css',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve('dist');
      const htmlPath = path.join(dist, 'index.html');
      if (!fs.existsSync(htmlPath)) return;
      let html = fs.readFileSync(htmlPath, 'utf8');
      const match = html.match(/<link rel="stylesheet" crossorigin href="(\.\/assets\/[^"]+\.css)">/);
      if (!match) return;
      const cssPath = path.join(dist, match[1].replace(/^\.\//, ''));
      if (!fs.existsSync(cssPath)) return;
      const css = fs.readFileSync(cssPath, 'utf8').replace(/url\(\.\/([^)]+)\)/g, 'url(./assets/$1)');
      html = html.replace(match[0], `<style>${css}</style>`);
      // The entry chunk imports Phaser dynamically, so the browser would not
      // start that download until the small entry has run. Preload the heavy
      // chunks with the document instead.
      const assets = path.join(dist, 'assets');
      const preloads = fs
        .readdirSync(assets)
        .filter((name) => (name.startsWith('phaser-') || name.startsWith('register-')) && name.endsWith('.js'))
        .map((name) => `<link rel="modulepreload" crossorigin href="./assets/${name}">`)
        .join('');
      if (preloads) html = html.replace('</head>', `${preloads}</head>`);
      fs.writeFileSync(htmlPath, html);
      fs.unlinkSync(cssPath);
    },
  };
}

export default defineConfig({
  base: './',
  server: {
    port: 5173,
  },
  esbuild: {
    legalComments: 'none',
  },
  plugins: [phaserSlim(), inlineBuiltCss()],
});

// Local, build-time-only asset generator. Never runs in the shipped game —
// it's a one-off script you run yourself to (re)generate PNGs into
// public/assets/generated/, which the game then loads as normal static
// image files. The API key is read from process.env only; it is never
// logged, written to disk, or bundled into the game.
import { writeFile, mkdir, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'generated');

// gpt-image-1 only generates at large fixed sizes; every asset here is
// displayed small in-game, so these get downscaled/normalized after
// generation to keep the shipped bundle lean.
// Emblems are shown at native GBA size (96x64) with a 32-color palette.
const EMBLEM_SIZE = { width: 96, height: 64 };
const CHARACTER_CANVAS = 384; // square, character trimmed+centered within it

const PIXEL_ART_STYLE =
  'chunky retro pixel art in a GBA-era handheld game aesthetic, ' +
  'limited saturated color palette, bold black outlines, flat colors, ' +
  'no anti-aliasing, no gradients, no text or letters, ' +
  'crisp sharp focus edge to edge, no blur, no vignette, no depth of field';

const EMBLEM_STYLE = `${PIXEL_ART_STYLE}, flat rounded-square badge/icon frame like a mobile app icon`;

const MANIFEST = [
  {
    id: 'emblem_nyc',
    type: 'emblem',
    outFile: 'emblem_nyc.png',
    background: 'auto',
    prompt:
      `A stormy New York City skyline emblem: rain-slicked streets, lightning ` +
      `flashing behind grey skyscrapers, ${EMBLEM_STYLE}, cool blue/grey ` +
      `palette with one orange-red accent light, dark navy background.`,
  },
  {
    id: 'emblem_miami',
    type: 'emblem',
    outFile: 'emblem_miami.png',
    background: 'auto',
    prompt:
      `A sun-scorched Miami skyline emblem at golden hour: art-deco buildings, ` +
      `palm trees, heat haze shimmer, ${EMBLEM_STYLE}, warm amber/teal/sandy ` +
      `palette, dark background.`,
  },
];

async function requestImage(entry) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: entry.prompt,
      size: entry.type === 'character' ? '1024x1024' : '1536x1024',
      background: entry.background ?? 'auto',
      n: 1,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenAI API error ${res.status}: ${text.slice(0, 300)}`);
  }

  const json = await res.json();
  const b64 = json.data?.[0]?.b64_json;
  if (!b64) throw new Error('No image data returned');
  return Buffer.from(b64, 'base64');
}

async function generateOne(entry) {
  const buf = await requestImage(entry);
  const outPath = join(OUT_DIR, entry.outFile);
  const rawPath = outPath.replace(/\.png$/, '.raw.png');
  await writeFile(rawPath, buf);

  if (entry.type === 'character') {
    // Trim to the character's alpha bounding box, then center it on a fixed
    // square transparent canvas so every pose shares the same anchor point
    // (required for the game to alternate poses without the sprite jumping).
    await run('magick', [
      rawPath,
      '-trim',
      '+repage',
      '-resize',
      `${CHARACTER_CANVAS}x${CHARACTER_CANVAS}`,
      '-background',
      'none',
      '-gravity',
      'center',
      '-extent',
      `${CHARACTER_CANVAS}x${CHARACTER_CANVAS}`,
      outPath,
    ]);
  } else {
    await run('magick', [
      rawPath,
      '-filter',
      'box',
      '-resize',
      `${EMBLEM_SIZE.width}x${EMBLEM_SIZE.height}`,
      '-dither',
      'None',
      '-colors',
      '32',
      `PNG8:${outPath}`,
    ]);
  }

  await unlink(rawPath);
  return outPath;
}

async function main() {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      'Missing OPENAI_API_KEY. Put it in a local .env file (OPENAI_API_KEY=sk-...) ' +
        'and run: node --env-file=.env scripts/generate-art.mjs'
    );
    process.exit(1);
  }

  await mkdir(OUT_DIR, { recursive: true });

  const filterIds = process.argv.slice(2);
  const toGenerate = filterIds.length ? MANIFEST.filter((e) => filterIds.includes(e.id)) : MANIFEST;

  console.log(`Generating ${toGenerate.length} image(s) into ${OUT_DIR}\n`);
  for (const entry of toGenerate) {
    process.stdout.write(`  ${entry.id} ... `);
    try {
      const outPath = await generateOne(entry);
      console.log(`done -> ${outPath}`);
    } catch (err) {
      console.log('FAILED');
      console.error(`    ${err.message}`);
    }
  }
  console.log('\nDone.');
}

main();

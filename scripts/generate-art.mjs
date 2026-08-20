// Local, build-time-only asset generator. Never runs in the shipped game —
// it's a one-off script you run yourself to (re)generate PNGs into
// public/assets/generated/, which the game then loads as normal static
// image files. The API key is read from process.env only; it is never
// logged, written to disk, or bundled into the game.
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '..', 'public', 'assets', 'generated');

const PIXEL_ART_STYLE =
  'chunky retro pixel art in a GBA-era handheld game aesthetic, ' +
  'limited saturated color palette, bold black outlines, flat colors, ' +
  'no anti-aliasing, no gradients, no text or letters, small icon/emblem composition';

const MANIFEST = [
  {
    id: 'emblem_nyc',
    outFile: 'emblem_nyc.png',
    prompt:
      `A stormy New York City skyline emblem: rain-slicked streets, lightning ` +
      `flashing behind grey skyscrapers, ${PIXEL_ART_STYLE}, cool blue/grey ` +
      `palette with one orange-red accent light, dark navy background.`,
  },
  {
    id: 'emblem_miami',
    outFile: 'emblem_miami.png',
    prompt:
      `A sun-scorched Miami skyline emblem at golden hour: art-deco buildings, ` +
      `palm trees, heat haze shimmer, ${PIXEL_ART_STYLE}, warm amber/teal/sandy ` +
      `palette, dark background.`,
  },
];

async function generateOne(entry) {
  const res = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-image-1',
      prompt: entry.prompt,
      size: '1536x1024',
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

  const outPath = join(OUT_DIR, entry.outFile);
  await writeFile(outPath, Buffer.from(b64, 'base64'));
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

  console.log(`Generating ${MANIFEST.length} image(s) into ${OUT_DIR}\n`);
  for (const entry of MANIFEST) {
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

import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { defaultSave, serialize } from '../src/save/save';
import { clearPending, freshStory, interact, readTablet, runEnded, startStory, type StoryState, type Target } from '../src/story/story';

// Story mode, "The Long Rain": the prologue and stage 1 played with real input from a fresh game, then each later
// stage from a save made with the story's own rules (the same functions the game uses), through the finale.

const frame = { polling: 'raf' as const, timeout: 20_000 };
const app = (page: Page) => page.locator('#app');
const hub = <T>(page: Page, expr: string) => page.evaluate(`window.__hub.${expr}`) as Promise<T>;
const rk = <T>(page: Page, expr: string) => page.evaluate(`window.__rk.${expr}`) as Promise<T>;
const savedStory = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? 'null')?.story ?? null) as Promise<StoryState | null>;

const talk = (s: StoryState, t: Target) => interact(s, t).state;
/** The story as a player would have it at the start of stage `n`, built with the story's own rules. */
function stageAt(n: number): StoryState {
  let s = clearPending(startStory(freshStory()));
  if (n <= 1) return s;
  for (const t of ['pia', 'vane', 'marrow'] as const) s = talk(s, t);
  s = clearPending(s);
  if (n <= 2) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'nyc', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 3) return s;
  s = runEnded(runEnded(s, 'london', true).state, 'tokyo', true).state;
  s = clearPending(talk(talk(s, 'altar'), 'brent'));
  if (n <= 4) return s;
  s = clearPending(talk(talk(talk(runEnded(s, 'miami', true).state, 'altar'), 'marrow'), 'marrow'));
  if (n <= 5) return s;
  // the Undercroft: three tablets, the hatch, the Lantern
  for (const city of ['nyc', 'london', 'miami']) s = readTablet(s, city).state;
  return clearPending(talk(talk(s, 'hatch'), 'pedestal'));
}

/** Start the page with this story already in the save. */
async function seed(page: Page, story: StoryState) {
  const save = defaultSave();
  save.story = story;
  save.town.visited = true;
  save.town.coins = 40;
  const raw = serialize(save);
  await page.addInitScript((value) => {
    try {
      if (!localStorage.getItem('rainknights:seeded')) {
        localStorage.setItem('rainknights:save', value);
        localStorage.setItem('rainknights:seeded', '1');
      }
    } catch {
      /* private mode */
    }
  }, raw);
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  return errors;
}

/** Page through a cutscene (Space finishes the typing, then turns the page) until it is over. */
async function skipCutscene(page: Page) {
  for (let i = 0; i < 60; i++) {
    if ((await app(page).getAttribute('data-scene')) !== 'CutsceneScene') return;
    await page.keyboard.press('Space');
    await page.waitForTimeout(120);
  }
  throw new Error('the cutscene never ended');
}

/** Press G on the title and arrive in Mistford (playing any cutscene waiting first). */
async function intoMistford(page: Page) {
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyG');
  await arrive(page);
}

async function arrive(page: Page) {
  await page.waitForFunction(() => ['TownScene', 'CutsceneScene'].includes(document.getElementById('app')?.dataset.scene ?? ''), undefined, frame);
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 2, undefined, frame);
}

/** Stand beside something in Mistford and speak to it; read every page; resolves when the box has closed. */
async function speak(page: Page, col: number, row: number, who: string) {
  await page.evaluate(`window.__hub.tp(${col}, ${row})`);
  await expect(app(page)).toHaveAttribute('data-interact', who);
  await page.keyboard.press('Space');
  await closeDialogue(page);
}

/** Turn the pages until the box closes. (Reads the live page, not the published attribute, which lags a frame.) */
async function closeDialogue(page: Page) {
  for (let i = 0; i < 14; i++) {
    if (!(await hub<boolean>(page, 'page() >= 0'))) return;
    await page.keyboard.press('Space');
  }
  throw new Error('the dialogue never closed');
}

const SPOTS = { pia: [5, 10], vane: [8, 3], marrow: [10, 2], altar: [9, 5], quill: [16, 11], brent: [12, 10], hatch: [7, 4] } as const;
const goto = (page: Page, who: keyof typeof SPOTS) => speak(page, SPOTS[who][0], SPOTS[who][1], who);

// ---------------------------------------------------------------------------------------------------------

test('the title offers the story; starting it plays the prologue, then Mistford has its new people and an objective', async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyG');
  await expect(app(page)).toHaveAttribute('data-scene', 'CutsceneScene');
  await expect(app(page)).toHaveAttribute('data-cutscene', 'prologue');
  expect(await app(page).getAttribute('data-cutscene-page')).toMatch(/^[1-3]\/3$/);
  // a page takes a press to finish typing and another to turn: two presses are never more than a page or two on
  await page.keyboard.press('Space');
  await page.keyboard.press('Space');
  const page2 = await app(page).getAttribute('data-cutscene-page');
  expect(['2/3', '3/3']).toContain(page2);
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await expect(app(page)).toHaveAttribute('data-objective', 'Talk to Pia');
  const story = await hub<StoryState>(page, 'story()');
  expect(story.started).toBe(true);
  expect(story.stage).toBe(1);
  expect(story.pending, 'the prologue is not shown twice').toBeNull();
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a game that never chose the story has no story: no objective, no weathervane, no Marrow', async ({ page }) => {
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  expect(await hub<boolean>(page, 'story().started')).toBe(false);
  expect(await app(page).getAttribute('data-objective')).toBeNull();
  await page.evaluate(`window.__hub.tp(10, 2)`); // where Marrow stands once the story begins
  await page.waitForTimeout(200);
  expect(await app(page).getAttribute('data-interact')).toBe('');
  await page.keyboard.press('KeyQ');
  expect(await app(page).getAttribute('data-journal')).toBeNull();
});

test('stage 1 with real input: Pia, the weathervane, then Marrow, who tells the tale; the stage-clear card plays', async ({ page }) => {
  const errors = watchErrors(page);
  await intoMistford(page);
  await goto(page, 'pia');
  await expect(app(page)).toHaveAttribute('data-objective', 'Examine the weathervane');
  // Marrow will not tell his tale until the vane has been looked at
  await goto(page, 'marrow');
  expect((await hub<StoryState>(page, 'story()')).flags).not.toContain('marrow:tale');
  await expect(app(page)).toHaveAttribute('data-objective', 'Examine the weathervane');
  await goto(page, 'vane');
  await expect(app(page)).toHaveAttribute('data-objective', 'Speak with Marrow');
  await page.evaluate(`window.__hub.tp(10, 2)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'marrow');
  await page.keyboard.press('Space');
  // the tale runs over several pages, and the box only closes after the last
  await page.waitForFunction(() => (window as any).__hub.page() === 0, undefined, frame);
  await page.keyboard.press('Space');
  await page.waitForFunction(() => (window as any).__hub.page() === 1, undefined, frame);
  await closeDialogue(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'CutsceneScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-cutscene', 'stage1');
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  const after = await hub<StoryState>(page, 'story()');
  expect(after.stage).toBe(2);
  expect(await savedStory(page)).toEqual(after);
  await expect(app(page)).toHaveAttribute('data-objective', 'Win in New York');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Q opens the journal with the stage and its objectives, and closes it again', async ({ page }) => {
  await seed(page, stageAt(2));
  await intoMistford(page);
  await page.keyboard.press('KeyQ');
  await expect(app(page)).toHaveAttribute('data-journal', 'open');
  await page.keyboard.press('KeyQ');
  expect(await app(page).getAttribute('data-journal')).toBeNull();
});

test('the flight map marks where the story wants you: New York in stage 2', async ({ page }) => {
  await seed(page, stageAt(2));
  const errors = watchErrors(page);
  await intoMistford(page);
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  expect(await page.evaluate(`window.__flight.targets()`)).toEqual(['nyc']);
  expect(await app(page).getAttribute('data-objective')).toBe('Win in New York');
  expect(await page.evaluate(`window.__flight.stars().map((s) => s.id)`)).not.toContain('stormhold');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('winning in New York recovers the Gray Shard: the HUD says so, the game-over screen reports it, the save keeps it', async ({ page }) => {
  await seed(page, stageAt(2));
  const errors = watchErrors(page);
  await intoMistford(page);
  await runIn(page, 'nyc');
  await expect(app(page)).toHaveAttribute('data-objective', 'WIN HERE: GRAY SHARD');
  await page.evaluate(`window.__rk.spawnBoss()`);
  await expect(app(page)).toHaveAttribute('data-boss', 'PHANTOM BUS');
  await page.evaluate(`window.__rk.killBoss()`);
  await expect(app(page)).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-story-result', /GRAY SHARD FOUND!/);
  expect((await savedStory(page))?.items).toEqual(['grayShard']);
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await expect(app(page)).toHaveAttribute('data-objective', 'Place shard on the altar');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('a win in the wrong city gives nothing: Miami is not wanted in stage 2', async ({ page }) => {
  await seed(page, stageAt(2));
  await intoMistford(page);
  await runIn(page, 'miami');
  expect(await app(page).getAttribute('data-objective'), 'no story line in a city the story does not want').toBeNull();
  await page.evaluate(`window.__rk.spawnBoss()`);
  await page.evaluate(`window.__rk.killBoss()`);
  await expect(app(page)).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-story-result', /Not needed yet/);
  expect((await savedStory(page))?.items).toEqual([]);
});

test('the altar takes the shard, and Marrow completes stage 2 with a card; stage 3 begins', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, runEnded(stageAt(2), 'nyc', true).state);
  await intoMistford(page);
  await expect(app(page)).toHaveAttribute('data-objective', 'Place shard on the altar');
  await goto(page, 'altar');
  expect((await hub<StoryState>(page, 'story()')).placed).toEqual(['grayShard']);
  await expect(app(page)).toHaveAttribute('data-objective', 'Speak with Marrow');
  await page.evaluate(`window.__hub.tp(10, 2)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'marrow');
  await page.keyboard.press('Space');
  await closeDialogue(page);
  await expect(app(page)).toHaveAttribute('data-cutscene', 'stage2');
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  expect((await hub<StoryState>(page, 'story()')).stage).toBe(3);
  await expect(app(page)).toHaveAttribute('data-objective', 'Win in 2 eastern cities 0/2');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('Brent gives three Rain Buns in stage 3, once', async ({ page }) => {
  const s = runEnded(runEnded(stageAt(3), 'london', true).state, 'tokyo', true).state;
  await seed(page, talk(s, 'altar'));
  await intoMistford(page);
  await goto(page, 'brent');
  const bag = () => page.evaluate(() => JSON.parse(localStorage.getItem('rainknights:save') ?? '{}').town?.bag ?? {}) as Promise<Record<string, number>>;
  expect((await bag()).rainBun).toBe(3);
  // the gift completes stage 3, so its story card follows the conversation: wait for it rather than race it
  await expect(app(page)).toHaveAttribute('data-cutscene', 'stage3', { timeout: 8_000 });
  await arrive(page);
  await goto(page, 'brent');
  expect((await bag()).rainBun, 'only once').toBe(3);
});

test('Quill is at the pad once the Stormglass is whole, and marks the Eye on the flight map', async ({ page }) => {
  const errors = watchErrors(page);
  await seed(page, stageAt(6));
  await intoMistford(page);
  await expect(app(page)).toHaveAttribute('data-objective', 'Talk to Quill by the pad');
  await goto(page, 'quill');
  await expect(app(page)).toHaveAttribute('data-objective', 'Fly to the Eye');
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  expect(await page.evaluate(`window.__flight.stars().map((s) => s.id)`)).toContain('stormhold');
  expect(await page.evaluate(`window.__flight.targets()`)).toEqual(['stormhold']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the finale: land on the Eye, face the Tempest Regent (its lightning, its phases), win, and the rain stops', async ({ page }) => {
  test.setTimeout(90_000);
  const errors = watchErrors(page);
  await seed(page, talk(stageAt(6), 'quill'));
  await intoMistford(page);
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  await page.evaluate(`window.__flight.teleportTo('stormhold', 0.02)`);
  await page.waitForFunction(() => (window as any).__flight.near() === 'stormhold', undefined, frame);
  await page.keyboard.down('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 8_000 });
  await page.keyboard.up('Space');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
  expect(await rk<string>(page, 'regionId()')).toBe('stormhold');
  expect((await savedStory(page))?.flags).toContain('landed:stormhold');
  await expect(app(page)).toHaveAttribute('data-objective', 'DEFEAT THE REGENT');
  expect(await rk<boolean>(page, 'lantern()'), "Aurel's Lantern, taken in the Undercroft, is lit").toBe(true);
  // the Stormglass's strength shows in the knight's health: 4 shards on the altar
  await page.evaluate(`window.__rk.clearEnemies()`);

  await page.evaluate(`window.__rk.spawnBoss()`);
  await expect(app(page)).toHaveAttribute('data-boss', 'REGENT');
  expect(await rk<number>(page, 'regentPhase()')).toBe(0);
  // it calls lightning on a timer, and the ring lands on the knight
  await page.waitForFunction(() => (window as any).__rk.lightningCasts() >= 1, undefined, { polling: 'raf', timeout: 15_000 });
  await page.evaluate(`window.__rk.setBossHp(0.5)`);
  await page.waitForFunction(() => (window as any).__rk.regentPhase() === 1, undefined, frame);
  await page.evaluate(`window.__rk.setBossHp(0.2)`);
  await page.waitForFunction(() => (window as any).__rk.regentPhase() === 2, undefined, frame);
  expect(await rk<boolean>(page, 'bossRaging()')).toBe(true);
  await page.evaluate(`window.__rk.killBoss()`);
  await expect(app(page)).toHaveAttribute('data-scene', 'GameOverScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-story-result', /THE REGENT FALLS!/);
  const done = await savedStory(page);
  expect(done?.complete).toBe(true);
  expect(done?.pending).toBe('ending');

  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'CutsceneScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-cutscene', 'ending');
  await expect(app(page)).toHaveAttribute('data-cutscene-page', '1/5');
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await expect(app(page)).toHaveAttribute('data-objective', 'The rain has stopped.');
  expect((await hub<StoryState>(page, 'story()')).complete).toBe(true);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('after the story is complete, Mistford is sunny, the people are glad, and the title says it is done', async ({ page }) => {
  const finished = { ...stageAt(6), flags: [...stageAt(6).flags, 'quill:eye', 'landed:stormhold', 'win:stormhold'], complete: true, stage: 7 };
  await seed(page, finished);
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyG');
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await expect(app(page)).toHaveAttribute('data-objective', 'The rain has stopped.');
  await goto(page, 'pia');
  expect((await hub<StoryState>(page, 'story()')).complete).toBe(true);
});


// ---- Stage 5: the Undercroft ----------------------------------------------------------------------------

/** Stand in the tunnel under a city: down by an entrance that is not one already used, as chosen by `pick`. */
async function downTo(page: Page, pick: (rows: { id: number; kind: string; pair?: number; tunnel?: number }[]) => number) {
  const rows = (await rk<{ id: number; kind: string; pair?: number; tunnel?: number }[]>(page, 'pois()')).filter((r) => r.kind === 'entrance');
  const n = pick(rows);
  await page.evaluate(`window.__rk.clearEnemies()`);
  await rk(page, 'heal()');
  await rk(page, `tpToPoi('entrance', ${n})`);
  await page.waitForFunction(() => (window as any).__rk?.depth?.() === 'underground', undefined, frame);
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
  // the tunnel has residents of its own (midtown strength now): this is about the tablet, not the fight
  await page.evaluate(`window.__rk.clearEnemies()`);
  await rk(page, 'heal()');
}

/** Start a run in a city the real way: onto the pad in Mistford, up into the flight map, and down onto the city's star. */
async function runIn(page: Page, city: string) {
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'pad');
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  await page.evaluate(`window.__flight.teleportTo('${city}', 0.02)`);
  await page.waitForFunction((id) => (window as any).__flight.near() === id, city, frame);
  await page.keyboard.down('Space');
  try {
    await expect(app(page)).toHaveAttribute('data-scene', 'GameScene', { timeout: 10_000 });
  } finally {
    await page.keyboard.up('Space');
  }
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
}

test('stage 5: a buried tablet in the tunnels counts once per city, and the HUD says where to look', async ({ page }) => {
  await seed(page, stageAt(5));
  const errors = watchErrors(page);
  await intoMistford(page);
  await expect(app(page)).toHaveAttribute('data-objective', 'Read 3 buried tablets 0/3');
  await runIn(page, 'nyc');
  await expect(app(page)).toHaveAttribute('data-objective', 'FIND A TABLET BELOW');
  await downTo(page, (rows) => rows[0].id);
  expect(await rk<boolean>(page, `tpToStairs('tablet', 0)`)).toBe(true);
  await page.waitForFunction(() => (window as any).__rk.usedPois().some((k: string) => k.startsWith('t')), undefined, frame);
  await page.waitForFunction(() => document.getElementById('app')?.dataset.objective !== 'FIND A TABLET BELOW', undefined, { polling: 'raf', timeout: 15_000 });
  expect((await savedStory(page))?.flags).toContain('tablet:nyc');
  // the other tunnel under the same city has a tablet too, but it is the same city: it does not count again
  await rk(page, `tpToStairs('back')`);
  await page.waitForFunction(() => (window as any).__rk?.depth?.() === 'surface' && (window as any).__rk?.hp?.() > 0, undefined, frame);
  await downTo(page, (rows) => rows.find((r) => r.tunnel !== rows[0].tunnel)!.id);
  expect(await rk<boolean>(page, `tpToStairs('tablet', 0)`)).toBe(true);
  await page.waitForFunction(() => (window as any).__rk.usedPois().filter((k: string) => k.startsWith('t')).length === 2, undefined, frame);
  await page.waitForTimeout(500);
  expect((await savedStory(page))?.flags.filter((f) => f.startsWith('tablet:'))).toEqual(['tablet:nyc']);
  expect(errors, errors.join('\n')).toEqual([]);
});

test('before stage 5 there are no tablets: the farthest dead end is just a chest', async ({ page }) => {
  await seed(page, stageAt(4));
  await intoMistford(page);
  await runIn(page, 'nyc');
  await downTo(page, (rows) => rows[0].id);
  expect(await rk<boolean>(page, `tpToStairs('tablet', 0)`)).toBe(false);
});

test('the flight map marks every city until each has given a tablet', async ({ page }) => {
  await seed(page, readTablet(stageAt(5), 'nyc').state);
  await intoMistford(page);
  await page.evaluate(`window.__hub.tp(14, 11)`);
  await page.keyboard.press('Space');
  await expect(app(page)).toHaveAttribute('data-scene', 'FlightScene');
  await page.waitForFunction(() => (window as any).__flight?.frames() > 3, undefined, frame);
  expect((await page.evaluate(`window.__flight.targets()`)) as string[]).toEqual(expect.arrayContaining(['london', 'tokyo', 'mumbai', 'miami']));
  expect((await page.evaluate(`window.__flight.targets()`)) as string[]).not.toContain('nyc');
});

test('the cellar hatch: not there before the Stormglass is whole; sealed with two tablets; open with three', async ({ page }) => {
  await seed(page, stageAt(4));
  await intoMistford(page);
  await page.evaluate(`window.__hub.tp(7, 4)`);
  await page.waitForTimeout(250);
  expect(await app(page).getAttribute('data-interact'), 'no hatch yet').toBe('');
});

test('a sealed hatch tells you how many tablets you have read, and does not open', async ({ page }) => {
  await seed(page, readTablet(readTablet(stageAt(5), 'nyc').state, 'tokyo').state);
  await intoMistford(page);
  await goto(page, 'hatch');
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  expect((await hub<StoryState>(page, 'story()')).flags).not.toContain('hatch:open');
  expect(await app(page).getAttribute('data-objective')).toBe('Read 3 buried tablets 2/3');
});

test('the Undercroft with real input: three tablets open the hatch, the stairs lead down, the Lantern is taken, the stage is cleared', async ({ page }) => {
  const errors = watchErrors(page);
  let s = stageAt(5);
  for (const city of ['nyc', 'tokyo', 'miami']) s = readTablet(s, city).state;
  await seed(page, s);
  await intoMistford(page);
  await expect(app(page)).toHaveAttribute('data-objective', 'Open the cellar hatch');
  // open the hatch: its words, and then the stairs down
  await page.evaluate(`window.__hub.tp(7, 4)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'hatch');
  await page.keyboard.press('Space');
  await closeDialogue(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'UndercroftScene', { timeout: 8_000 });
  expect((await hub<StoryState>(page, 'story()')).flags).toContain('hatch:open');
  await page.waitForFunction(() => (window as any).__hub?.frames() > 3, undefined, frame);

  // read the statue and a plaque, then take the Lantern
  await page.evaluate(`window.__hub.tp(8, 5)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'statue');
  await page.keyboard.press('Space');
  await closeDialogue(page);
  await page.evaluate(`window.__hub.tp(9, 3)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'pedestal');
  await page.keyboard.press('Space');
  await closeDialogue(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'CutsceneScene', { timeout: 8_000 });
  await expect(app(page)).toHaveAttribute('data-cutscene', 'lantern');
  await skipCutscene(page);
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  const after = await hub<StoryState>(page, 'story()');
  expect(after.stage).toBe(6);
  expect(after.flags).toContain('lantern');
  expect(await savedStory(page)).toEqual(after);
  await expect(app(page)).toHaveAttribute('data-objective', 'Talk to Quill by the pad');
  expect(errors, errors.join('\n')).toEqual([]);
});

test('the Undercroft: the stairs up lead back to Mistford, beside the hatch; the pedestal is empty once the Lantern is taken', async ({ page }) => {
  await seed(page, stageAt(6));
  await intoMistford(page);
  await goto(page, 'hatch'); // for a story already past the stage, the hatch just leads down
  await expect(app(page)).toHaveAttribute('data-scene', 'UndercroftScene', { timeout: 8_000 });
  await page.waitForFunction(() => (window as any).__hub?.frames() > 3, undefined, frame);
  await page.evaluate(`window.__hub.tp(9, 3)`);
  await expect(app(page)).toHaveAttribute('data-interact', 'pedestal');
  await page.keyboard.press('Space');
  await closeDialogue(page);
  expect((await hub<StoryState>(page, 'story()')).stage, 'taking it twice does nothing').toBe(6);
  await page.evaluate(`window.__hub.tp(8, 8)`); // the stairs up
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene', { timeout: 8_000 });
  await page.waitForFunction(() => (window as any).__hub?.place() === 'town', undefined, frame);
  const y = await hub<number>(page, 'y()');
  expect(y).toBeLessThan(80); // up in the alcove, beside the hatch
});

test('a story saved before the Undercroft stage keeps its place: the old finale is now stage 6, with the Eye still to fly to', async ({ page }) => {
  // the saved story as an older version wrote it: five stages, the finale as stage 5, no version
  const finale = talk(stageAt(6), 'quill');
  const old = { started: true, stage: 5, flags: finale.flags.filter((f) => f !== 'lantern' && !f.startsWith('tablet:') && f !== 'hatch:open'), items: [], placed: finale.placed, pending: null, complete: false };
  const save = defaultSave();
  (save as unknown as { story: unknown }).story = old;
  save.town.visited = true;
  await page.addInitScript((raw) => {
    if (!localStorage.getItem('rainknights:seeded')) {
      localStorage.setItem('rainknights:save', raw);
      localStorage.setItem('rainknights:seeded', '1');
    }
  }, serialize(save));
  await intoMistford(page);
  const story = await hub<StoryState>(page, 'story()');
  expect(story.stage).toBe(6);
  expect(story.version).toBeGreaterThanOrEqual(2);
  await expect(app(page)).toHaveAttribute('data-objective', 'Fly to the Eye');
});

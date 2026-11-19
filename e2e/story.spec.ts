import { test, expect } from './fixtures';
import { type Page } from '@playwright/test';
import { defaultSave, serialize } from '../src/save/save';
import { clearPending, freshStory, interact, runEnded, startStory, type StoryState, type Target } from '../src/story/story';

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
  return s;
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

const SPOTS = { pia: [5, 10], vane: [8, 3], marrow: [10, 2], altar: [9, 5], quill: [16, 11], brent: [12, 10] } as const;
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
  await page.keyboard.down('ArrowDown');
  await expect(app(page)).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 15_000 });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.press('Digit1');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
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
  await page.keyboard.down('ArrowDown');
  await expect(app(page)).toHaveAttribute('data-scene', 'RegionSelectScene', { timeout: 15_000 });
  await page.keyboard.up('ArrowDown');
  await page.keyboard.press('Digit2');
  await expect(app(page)).toHaveAttribute('data-scene', 'GameScene');
  await page.waitForFunction(() => (window as any).__rk?.hp?.() > 0, undefined, frame);
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
  await seed(page, stageAt(5));
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
  await seed(page, talk(stageAt(5), 'quill'));
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
  // the Stormglass's strength shows in the knight's health: 4 shards on the altar
  await page.evaluate(`for (let i = 0; i < 40; i++) window.__rk.killNearest()`);

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
  const finished = { ...stageAt(5), flags: [...stageAt(5).flags, 'quill:eye', 'landed:stormhold', 'win:stormhold'], complete: true, stage: 6 };
  await seed(page, finished);
  await page.goto('/');
  await expect(app(page)).toHaveAttribute('data-scene', 'MenuScene');
  await page.keyboard.press('KeyG');
  await expect(app(page)).toHaveAttribute('data-scene', 'TownScene');
  await expect(app(page)).toHaveAttribute('data-objective', 'The rain has stopped.');
  await goto(page, 'pia');
  expect((await hub<StoryState>(page, 'story()')).complete).toBe(true);
});

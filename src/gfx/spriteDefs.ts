import Phaser from 'phaser';
import { generateBlobTexture } from './PixelSpriteFactory';
import { generateKnightTextures } from './chibi';
import { generateCabWraithTexture, generatePhantomBusTexture } from './vehicles';
import { generateTrainingDummyTexture } from './props';
import { generateWeaponTextures } from './weapons';
import { CHARACTERS } from '../config/characters';
import { generateTerrainTileset, generateRainTexture } from './tiles';
import { generateSignTexture, generateVillagerTexture } from './townFolk';
import { generateFurnitureTextures } from './furniture';
import * as P from './palette';

export const TEX = {
  rainImp: 'rainImp',
  windWraith: 'windWraith',
  hailBrute: 'hailBrute',
  lightningWisp: 'lightningWisp',
  snowGolem: 'snowGolem',
  tornadoBoss: 'tornadoBoss',
  cabWraith: 'cabWraith',
  phantomBus: 'phantomBus',
  trainingDummy: 'trainingDummy',
  xpGem: 'xpGem',
  coin: 'coin',
  supply: 'supply',
  villagerBlue: 'villagerBlue',
  villagerGreen: 'villagerGreen',
  signpost: 'signpost',
  projectile: 'projectile',
  terrainTilesNyc: 'terrainTiles_nyc',
  terrainTilesMiami: 'terrainTiles_miami',
  puSun: 'puSun',
  puRainbow: 'puRainbow',
  puGale: 'puGale',
  puFrost: 'puFrost',
  puStatic: 'puStatic',
  rain: 'fx_rain',
} as const;

/**
 * Rasterize every procedural texture. `afterBatch` runs between groups so
 * boot does not hold the main thread in one long task; the pixels are the same.
 */
export async function generateAllTextures(scene: Phaser.Scene, afterBatch?: () => Promise<void>) {
  const pause = async () => {
    if (afterBatch) await afterBatch();
  };

  generateTerrainTileset(scene, TEX.terrainTilesNyc, P.NYC_TERRAIN);
  await pause();
  generateTerrainTileset(scene, TEX.terrainTilesMiami, P.MIAMI_TERRAIN);
  generateRainTexture(scene, TEX.rain);
  await pause();

  for (const character of CHARACTERS) {
    generateKnightTextures(scene, character.id, character.style);
    await pause();
  }
  generateWeaponTextures(scene);
  await pause();

  generateBlobTexture(scene, TEX.rainImp, { radius: 4, shape: 'drop', ...P.RAIN_IMP }, 1);
  await pause();
  generateBlobTexture(
    scene,
    TEX.windWraith,
    { radius: 4.2, shape: 'spiky', spikes: 6, spikeAmp: 0.28, ...P.WIND_WRAITH },
    1
  );
  generateBlobTexture(scene, TEX.hailBrute, { radius: 5.5, shape: 'square', ...P.HAIL_BRUTE }, 1);
  await pause();
  generateBlobTexture(
    scene,
    TEX.lightningWisp,
    { radius: 3.6, shape: 'spiky', spikes: 5, spikeAmp: 0.55, ...P.LIGHTNING_WISP },
    1
  );
  generateBlobTexture(scene, TEX.snowGolem, { radius: 7.5, shape: 'square', ...P.SNOW_GOLEM }, 1);
  await pause();
  generateBlobTexture(
    scene,
    TEX.tornadoBoss,
    { radius: 13, shape: 'spiky', spikes: 8, spikeAmp: 0.35, ...P.TORNADO_BOSS },
    1
  );

  generateCabWraithTexture(scene, TEX.cabWraith);
  generatePhantomBusTexture(scene, TEX.phantomBus);
  generateTrainingDummyTexture(scene, TEX.trainingDummy);

  generateBlobTexture(scene, TEX.xpGem, { radius: 2.4, shape: 'diamond', ...P.XP_GEM }, 1);
  generateBlobTexture(scene, TEX.coin, { radius: 2.6, shape: 'circle', ...P.COIN }, 1);
  generateBlobTexture(scene, TEX.supply, { radius: 2.5, shape: 'square', ...P.SUPPLY }, 1);
  generateVillagerTexture(scene, TEX.villagerBlue, 0x3060c8, 0x4a3020);
  generateVillagerTexture(scene, TEX.villagerGreen, 0x2e8a48, 0x6a4a28);
  generateSignTexture(scene, TEX.signpost);
  generateFurnitureTextures(scene);
  generateBlobTexture(scene, TEX.projectile, { radius: 2, shape: 'diamond', ...P.PROJECTILE }, 1);
  await pause();

  generateBlobTexture(
    scene,
    TEX.puSun,
    { radius: 4.5, shape: 'spiky', spikes: 8, spikeAmp: 0.4, ...P.PU_SUN },
    1
  );
  generateBlobTexture(scene, TEX.puRainbow, { radius: 4.5, shape: 'circle', ...P.PU_RAINBOW }, 1);
  generateBlobTexture(
    scene,
    TEX.puGale,
    { radius: 4.5, shape: 'spiky', spikes: 4, spikeAmp: 0.5, ...P.PU_GALE },
    1
  );
  generateBlobTexture(scene, TEX.puFrost, { radius: 4.5, shape: 'diamond', ...P.PU_FROST }, 1);
  generateBlobTexture(
    scene,
    TEX.puStatic,
    { radius: 4.2, shape: 'spiky', spikes: 6, spikeAmp: 0.6, ...P.PU_STATIC },
    1
  );
}

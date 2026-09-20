import Phaser from 'phaser';
import { generateBlobTexture } from './PixelSpriteFactory';
import { generateKnightTextures } from './chibi';
import { generateWeaponTextures } from './weapons';
import { CHARACTERS } from '../config/characters';
import { generateTerrainTileset, generateRainTexture } from './tiles';
import * as P from './palette';

export const TEX = {
  rainImp: 'rainImp',
  windWraith: 'windWraith',
  hailBrute: 'hailBrute',
  lightningWisp: 'lightningWisp',
  snowGolem: 'snowGolem',
  tornadoBoss: 'tornadoBoss',
  xpGem: 'xpGem',
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

export function generateAllTextures(scene: Phaser.Scene) {
  generateTerrainTileset(scene, TEX.terrainTilesNyc, P.NYC_TERRAIN);
  generateTerrainTileset(scene, TEX.terrainTilesMiami, P.MIAMI_TERRAIN);
  generateRainTexture(scene, TEX.rain);

  for (const character of CHARACTERS) generateKnightTextures(scene, character.id, character.style);
  generateWeaponTextures(scene);

  generateBlobTexture(scene, TEX.rainImp, { radius: 4, shape: 'drop', ...P.RAIN_IMP }, 1);
  generateBlobTexture(
    scene,
    TEX.windWraith,
    { radius: 4.2, shape: 'spiky', spikes: 6, spikeAmp: 0.28, ...P.WIND_WRAITH },
    1
  );
  generateBlobTexture(scene, TEX.hailBrute, { radius: 5.5, shape: 'square', ...P.HAIL_BRUTE }, 1);
  generateBlobTexture(
    scene,
    TEX.lightningWisp,
    { radius: 3.6, shape: 'spiky', spikes: 5, spikeAmp: 0.55, ...P.LIGHTNING_WISP },
    1
  );
  generateBlobTexture(scene, TEX.snowGolem, { radius: 7.5, shape: 'square', ...P.SNOW_GOLEM }, 1);
  generateBlobTexture(
    scene,
    TEX.tornadoBoss,
    { radius: 13, shape: 'spiky', spikes: 8, spikeAmp: 0.35, ...P.TORNADO_BOSS },
    1
  );

  generateBlobTexture(scene, TEX.xpGem, { radius: 2.4, shape: 'diamond', ...P.XP_GEM }, 1);
  generateBlobTexture(scene, TEX.projectile, { radius: 2, shape: 'diamond', ...P.PROJECTILE }, 1);

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

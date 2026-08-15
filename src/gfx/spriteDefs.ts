import Phaser from 'phaser';
import { generateBlobTexture, generateCompositeTexture } from './PixelSpriteFactory';
import * as P from './palette';

export const TEX = {
  player: 'player',
  rainImp: 'rainImp',
  windWraith: 'windWraith',
  hailBrute: 'hailBrute',
  lightningWisp: 'lightningWisp',
  snowGolem: 'snowGolem',
  tornadoBoss: 'tornadoBoss',
  xpGem: 'xpGem',
  projectile: 'projectile',
  ground: 'ground',
  puSun: 'puSun',
  puRainbow: 'puRainbow',
  puGale: 'puGale',
  puFrost: 'puFrost',
  puStatic: 'puStatic',
} as const;

function generateGroundTile(scene: Phaser.Scene) {
  const key = TEX.ground;
  if (scene.textures.exists(key)) return;
  const cell = 8;
  const cells = 4;
  const g = scene.add.graphics();
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const c = (x + y) % 2 === 0 ? P.GROUND_A : P.GROUND_B;
      g.fillStyle(c, 1);
      g.fillRect(x * cell, y * cell, cell, cell);
    }
  }
  g.generateTexture(key, cells * cell, cells * cell);
  g.destroy();
}

export function generateAllTextures(scene: Phaser.Scene) {
  generateGroundTile(scene);

  // Player: chibi knight — body + head + visor accent, stacked.
  generateCompositeTexture(
    scene,
    TEX.player,
    [
      { offsetX: 0, offsetY: 3, radius: 4.6, shape: 'circle', ...P.PLAYER },
      { offsetX: 0, offsetY: -3, radius: 3.4, shape: 'circle', ...P.PLAYER },
      { offsetX: 0, offsetY: -3.2, radius: 1.1, shape: 'circle', main: P.PLAYER.accent, outline: P.PLAYER.accent },
    ],
    20,
    5
  );

  generateBlobTexture(scene, TEX.rainImp, { radius: 4, shape: 'drop', ...P.RAIN_IMP }, 5);
  generateBlobTexture(
    scene,
    TEX.windWraith,
    { radius: 4.2, shape: 'spiky', spikes: 6, spikeAmp: 0.28, ...P.WIND_WRAITH },
    5
  );
  generateBlobTexture(scene, TEX.hailBrute, { radius: 5.5, shape: 'square', ...P.HAIL_BRUTE }, 5);
  generateBlobTexture(
    scene,
    TEX.lightningWisp,
    { radius: 3.6, shape: 'spiky', spikes: 5, spikeAmp: 0.55, ...P.LIGHTNING_WISP },
    5
  );
  generateBlobTexture(scene, TEX.snowGolem, { radius: 7.5, shape: 'square', ...P.SNOW_GOLEM }, 5);
  generateBlobTexture(
    scene,
    TEX.tornadoBoss,
    { radius: 13, shape: 'spiky', spikes: 8, spikeAmp: 0.35, ...P.TORNADO_BOSS },
    5
  );

  generateBlobTexture(scene, TEX.xpGem, { radius: 2.4, shape: 'diamond', ...P.XP_GEM }, 4);
  generateBlobTexture(scene, TEX.projectile, { radius: 2, shape: 'diamond', ...P.PROJECTILE }, 4);

  generateBlobTexture(
    scene,
    TEX.puSun,
    { radius: 4.5, shape: 'spiky', spikes: 8, spikeAmp: 0.4, ...P.PU_SUN },
    5
  );
  generateBlobTexture(scene, TEX.puRainbow, { radius: 4.5, shape: 'circle', ...P.PU_RAINBOW }, 5);
  generateBlobTexture(
    scene,
    TEX.puGale,
    { radius: 4.5, shape: 'spiky', spikes: 4, spikeAmp: 0.5, ...P.PU_GALE },
    5
  );
  generateBlobTexture(scene, TEX.puFrost, { radius: 4.5, shape: 'diamond', ...P.PU_FROST }, 5);
  generateBlobTexture(
    scene,
    TEX.puStatic,
    { radius: 4.2, shape: 'spiky', spikes: 6, spikeAmp: 0.6, ...P.PU_STATIC },
    5
  );
}

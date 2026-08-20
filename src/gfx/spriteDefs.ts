import Phaser from 'phaser';
import { generateBlobTexture, generateCompositeTexture } from './PixelSpriteFactory';
import { TILE } from '../config/constants';
import * as P from './palette';

export const TEX = {
  playerRainKnight: 'player_rainKnight',
  playerHailWarden: 'player_hailWarden',
  playerStormChaser: 'player_stormChaser',
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
} as const;

interface RegionTerrainPalette {
  groundA: number;
  groundB: number;
  path: { main: number; highlight: number };
  water: { main: number; highlight: number };
  rock: { main: number; shadow: number };
}

/** 5 tiles drawn side-by-side into one strip: grassA, grassB, path, water, rock. */
function generateTerrainTileset(scene: Phaser.Scene, key: string, palette: RegionTerrainPalette) {
  if (scene.textures.exists(key)) return;
  const tiles: { main: number; fleck: number }[] = [
    { main: palette.groundA, fleck: palette.groundB },
    { main: palette.groundB, fleck: palette.groundA },
    { main: palette.path.main, fleck: palette.path.highlight },
    { main: palette.water.main, fleck: palette.water.highlight },
    { main: palette.rock.main, fleck: palette.rock.shadow },
  ];
  const g = scene.add.graphics();
  tiles.forEach((t, i) => {
    const ox = i * TILE;
    g.fillStyle(t.main, 1);
    g.fillRect(ox, 0, TILE, TILE);
    for (let f = 0; f < 8; f++) {
      const fx = ox + 2 + Math.floor(Math.random() * (TILE - 8));
      const fy = 2 + Math.floor(Math.random() * (TILE - 8));
      g.fillStyle(t.fleck, 0.5);
      g.fillRect(fx, fy, 4, 4);
    }
  });
  g.generateTexture(key, tiles.length * TILE, TILE);
  g.destroy();
}

/** Composite chibi-knight texture: body + head + visor accent, stacked. */
function generatePlayerTexture(
  scene: Phaser.Scene,
  key: string,
  palette: { main: number; highlight: number; shadow: number; accent: number },
  bodyRadius: number,
  headRadius: number,
  visorRadius: number,
  gridSize: number
) {
  const bodyOffset = bodyRadius * 0.65;
  const headOffset = headRadius * 0.88;
  generateCompositeTexture(
    scene,
    key,
    [
      { offsetX: 0, offsetY: bodyOffset, radius: bodyRadius, shape: 'circle', ...palette },
      { offsetX: 0, offsetY: -headOffset, radius: headRadius, shape: 'circle', ...palette },
      {
        offsetX: 0,
        offsetY: -headOffset - 0.2,
        radius: visorRadius,
        shape: 'circle',
        main: palette.accent,
        outline: palette.accent,
      },
    ],
    gridSize,
    5
  );
}

export function generateAllTextures(scene: Phaser.Scene) {
  generateTerrainTileset(scene, TEX.terrainTilesNyc, P.NYC_TERRAIN);
  generateTerrainTileset(scene, TEX.terrainTilesMiami, P.MIAMI_TERRAIN);

  generatePlayerTexture(scene, TEX.playerRainKnight, P.PLAYER, 4.6, 3.4, 1.1, 20);
  generatePlayerTexture(scene, TEX.playerHailWarden, P.PLAYER_HAIL, 5.6, 4.0, 1.2, 24);
  generatePlayerTexture(scene, TEX.playerStormChaser, P.PLAYER_STORM, 3.8, 2.8, 0.9, 18);

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

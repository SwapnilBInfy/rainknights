import type Phaser from 'phaser';
import type { StatusId } from '../systems/status';

/** 8x8 pixel icons for the status row under the HUD panel. */
const COLORS: Record<string, number> = {
  b: 0x3078d8,
  c: 0x90d8f8,
  w: 0xffffff,
  o: 0xf07820,
  y: 0xf8d020,
  d: 0xc03020,
};

const ICONS: Record<StatusId, string[]> = {
  wet: ['...b....', '...b....', '..bbb...', '..bwb...', '.bbbbb..', '.bbwbb..', '.bbbbb..', '..bbb...'],
  burning: ['....o...', '...oo...', '...ooo..', '..ooyo..', '.oooyoo.', '.ooyyoo.', '.oyyyyo.', '..oyyo..'],
  chilled: ['c..cc..c', '.c.cc.c.', '..cccc..', 'cccwwccc', '..cwwc..', '.c.cc.c.', 'c..cc..c', '...cc...'],
  frozen: ['..cwc...', '..cwc...', '.ccwcc..', 'cccwccc.', '.ccwcc..', '.cwwwc..', '.ccwcc..', '..ccc...'],
  shocked: ['....yy..', '...yy...', '..yy....', '.yyyyy..', '...yy...', '..yy....', '.yy.....', 'y.......'],
};

export function drawStatusIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, id: StatusId) {
  g.fillStyle(0x202030, 0.85);
  g.fillRect(x - 1, y - 1, 10, 10);
  ICONS[id].forEach((row, ry) => {
    for (let rx = 0; rx < 8; rx++) {
      const c = COLORS[row[rx]];
      if (c === undefined) continue;
      g.fillStyle(c, 1);
      g.fillRect(x + rx, y + ry, 1, 1);
    }
  });
}

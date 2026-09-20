import Phaser from 'phaser';

/** Hand-drawn 8x8 weather icons (the pixel font has no emoji glyphs). */

const COLORS: Record<string, number> = {
  y: 0xf8c820,
  g: 0x9098b0,
  d: 0x505870,
  b: 0x3078d8,
  c: 0x40b8e8,
  o: 0xf07820,
  l: 0x7890b0,
};

const ICONS: Record<string, string[]> = {
  clear: ['...yy...', '.y.yy.y.', '..yyyy..', 'yyyyyyyy', 'yyyyyyyy', '..yyyy..', '.y.yy.y.', '...yy...'],
  rain: ['..gggg..', '.gggggg.', 'gggggggg', 'gggggggg', '.b.b.b..', '..b.b.b.', '.b.b.b..', '........'],
  thunderstorm: ['..dddd..', '.dddddd.', 'dddddddd', '.dddddd.', '...yy...', '..yy....', '...yyy..', '....y...'],
  cold_front: ['c..cc..c', '.c.cc.c.', '..cccc..', 'cccccccc', '..cccc..', '.c.cc.c.', 'c..cc..c', '...cc...'],
  windy: ['........', '.llllll.', '......l.', '.lllll..', '.......l', '.llllll.', '......l.', '........'],
  humid: ['...b....', '...b....', '..bbb...', '..bbb...', '.bbbbb..', '.bbbbb..', '.bbbbb..', '..bbb...'],
  heat: ['....o...', '...oo...', '...ooo..', '..ooyo..', '.oooyoo.', '.ooyyoo.', '.oooyoo.', '..oooo..'],
  tropical_downpour: ['..dddd..', '.dddddd.', 'dddddddd', 'dddddddd', 'b.b.b.b.', '.b.b.b.b', 'b.b.b.b.', '.b.b.b.b'],
  hurricane: ['..cccc..', '.c....c.', 'c..cc..c', 'c.c.c..c', 'c..cc.c.', '.c....c.', '..cccc..', '........'],
};

/** Short labels that fit the 8px font in small HUD boxes. */
export const WEATHER_SHORT: Record<string, string> = {
  clear: 'Clear',
  rain: 'Rain',
  thunderstorm: 'Storm',
  cold_front: 'Cold',
  windy: 'Windy',
  humid: 'Humid',
  heat: 'Heat',
  tropical_downpour: 'Downpour',
  hurricane: 'Hurricane',
};

export function drawWeatherIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, condition: string) {
  const rows = ICONS[condition] ?? ICONS.clear;
  rows.forEach((row, ry) => {
    for (let rx = 0; rx < 8; rx++) {
      const c = COLORS[row[rx]];
      if (c === undefined) continue;
      g.fillStyle(c, 1);
      g.fillRect(x + rx, y + ry, 1, 1);
    }
  });
}

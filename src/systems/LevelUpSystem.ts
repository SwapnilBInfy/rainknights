import type { Player } from '../entities/Player';

export interface UpgradeOption {
  id: string;
  name: string;
  description: string;
  glyph: string;
  color: string;
  apply: (player: Player) => void;
}

const WEAPON_MIN_COOLDOWN = 180;

export const UPGRADE_POOL: UpgradeOption[] = [
  {
    id: 'weapon_damage',
    name: 'Storm Bolt+',
    description: 'Auto-attack damage +6',
    glyph: '⚔',
    color: '#8fe0ff',
    apply: (p) => (p.attackDamage += 6),
  },
  {
    id: 'weapon_speed',
    name: 'Squall Rhythm',
    description: 'Attack cooldown -12%',
    glyph: '⏱',
    color: '#8fe0ff',
    apply: (p) => (p.attackCooldown = Math.max(WEAPON_MIN_COOLDOWN, Math.round(p.attackCooldown * 0.88))),
  },
  {
    id: 'weapon_range',
    name: 'Long Gust',
    description: 'Attack range +50',
    glyph: '🎯',
    color: '#8fe0ff',
    apply: (p) => (p.attackRange += 50),
  },
  {
    id: 'weapon_pierce',
    name: 'Piercing Hail',
    description: 'Storm Bolt pierces +1 enemy',
    glyph: '➶',
    color: '#8fe0ff',
    apply: (p) => (p.pierce += 1),
  },
  {
    id: 'vitality',
    name: 'Vitality',
    description: 'Max HP +20 and full heal',
    glyph: '❤',
    color: '#ff5f5f',
    apply: (p) => {
      p.maxHp += 20;
      p.hp = p.maxHp;
    },
  },
  {
    id: 'magnet',
    name: 'Lodestone',
    description: 'XP magnet radius +40',
    glyph: '🧲',
    color: '#4be05a',
    apply: (p) => (p.magnetRadius += 40),
  },
  {
    id: 'sunbeam',
    name: 'Sunbeam',
    description: 'Periodic heal + burst damage aura',
    glyph: '☀',
    color: '#ffb020',
    apply: (p) => (p.powerups.sunbeam += 1),
  },
  {
    id: 'rainbow_shield',
    name: 'Rainbow Shield',
    description: 'Periodic brief invulnerability',
    glyph: '🌈',
    color: '#ff5fa2',
    apply: (p) => (p.powerups.rainbowShield += 1),
  },
  {
    id: 'gale',
    name: 'Gale Force',
    description: 'Move speed +20%',
    glyph: '💨',
    color: '#b9f5c0',
    apply: (p) => (p.powerups.gale += 1),
  },
  {
    id: 'frost',
    name: 'Frost Aura',
    description: 'Slows nearby enemies',
    glyph: '❄',
    color: '#aee9ff',
    apply: (p) => (p.powerups.frost += 1),
  },
  {
    id: 'static',
    name: 'Static Charge',
    description: 'Attacks chain to a second enemy',
    glyph: '⚡',
    color: '#fff066',
    apply: (p) => (p.powerups.staticCharge += 1),
  },
];

function pickThree(): UpgradeOption[] {
  const pool = [...UPGRADE_POOL];
  const picks: UpgradeOption[] = [];
  for (let i = 0; i < 3 && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picks.push(pool.splice(idx, 1)[0]);
  }
  return picks;
}

export class LevelUpSystem {
  private root: HTMLElement;
  private modal: HTMLElement | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
  }

  presentChoices(player: Player, onResume: () => void) {
    const options = pickThree();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const panel = document.createElement('div');
    panel.className = 'modal-panel';

    const title = document.createElement('div');
    title.className = 'modal-title';
    title.textContent = `LEVEL ${player.level}`;
    panel.appendChild(title);

    const sub = document.createElement('div');
    sub.className = 'modal-subtitle';
    sub.textContent = 'Choose an upgrade';
    panel.appendChild(sub);

    const cards = document.createElement('div');
    cards.className = 'choice-row';

    for (const opt of options) {
      const card = document.createElement('button');
      card.className = 'choice-card';
      card.style.setProperty('--accent', opt.color);
      card.innerHTML = `
        <div class="choice-glyph">${opt.glyph}</div>
        <div class="choice-name">${opt.name}</div>
        <div class="choice-desc">${opt.description}</div>
      `;
      card.addEventListener('click', () => {
        opt.apply(player);
        this.close();
        onResume();
      });
      cards.appendChild(card);
    }

    panel.appendChild(cards);
    overlay.appendChild(panel);
    this.root.appendChild(overlay);
    this.modal = overlay;
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
    }
  }
}

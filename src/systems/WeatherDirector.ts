import { WEATHER_FRONTS, TORNADO_SPAWN_TIME } from '../config/constants';
import { pickEnemyType } from './spawnTable';

export interface WeatherHost {
  spawnEnemyAroundPlayer(typeKey: string): void;
  spawnBoss(): void;
}

export class WeatherDirector {
  private host: WeatherHost;
  private elapsed: number;
  private spawnTimer = 0;
  private tornadoSpawned = false;
  currentFrontIndex: number;

  /** `signature` is the region's own enemy, mixed into the front's roster. */
  constructor(host: WeatherHost, startFrontIndex = 0, private readonly signature?: string) {
    this.host = host;
    const clamped = Math.max(0, Math.min(WEATHER_FRONTS.length - 1, startFrontIndex));
    this.currentFrontIndex = clamped;
    this.elapsed = WEATHER_FRONTS[clamped].start;
  }

  update(delta: number) {
    this.elapsed += delta / 1000;

    for (let i = WEATHER_FRONTS.length - 1; i >= 0; i--) {
      if (this.elapsed >= WEATHER_FRONTS[i].start) {
        this.currentFrontIndex = i;
        break;
      }
    }

    const front = WEATHER_FRONTS[this.currentFrontIndex];
    this.spawnTimer -= delta;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = front.spawnIntervalMs;
      for (let i = 0; i < front.spawnCount; i++) {
        const type = pickEnemyType(front.enemies, this.currentFrontIndex, this.signature, Math.random);
        this.host.spawnEnemyAroundPlayer(type);
      }
    }

    if (!this.tornadoSpawned && this.elapsed >= TORNADO_SPAWN_TIME) {
      this.tornadoSpawned = true;
      this.host.spawnBoss();
    }
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  get frontName(): string {
    return WEATHER_FRONTS[this.currentFrontIndex].name;
  }

  get bossSpawned(): boolean {
    return this.tornadoSpawned;
  }

  /**
   * Jump the storm clock to a checkpoint. The next spawn waits out a full
   * interval so continuing does not dump a catch-up wave on the first frame.
   * A boss already on the field is marked spawned; the scene places it.
   */
  restoreClock(elapsedSeconds: number, bossOnField: boolean) {
    this.elapsed = Math.max(0, elapsedSeconds);
    this.currentFrontIndex = 0;
    for (let i = WEATHER_FRONTS.length - 1; i >= 0; i--) {
      if (this.elapsed >= WEATHER_FRONTS[i].start) {
        this.currentFrontIndex = i;
        break;
      }
    }
    this.tornadoSpawned = bossOnField;
    this.spawnTimer = WEATHER_FRONTS[this.currentFrontIndex].spawnIntervalMs;
  }
}

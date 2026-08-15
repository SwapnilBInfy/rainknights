import Phaser from 'phaser';
import { WEATHER_FRONTS, TORNADO_SPAWN_TIME } from '../config/constants';

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

  constructor(host: WeatherHost, startFrontIndex = 0) {
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
        const type = Phaser.Utils.Array.GetRandom(front.enemies);
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
}

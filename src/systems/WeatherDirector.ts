import { WEATHER_FRONTS } from '../config/constants';

/**
 * The storm's clock. It no longer sends waves of enemies or a boss (the enemies live at fixed spots now, see
 * `CampDirector`): it only tells the weather how far along it is, which decides the front (and so the flooding and the
 * mood) the city is in. The last front lasts as long as the knight stays.
 */
export class WeatherDirector {
  private elapsed: number;
  currentFrontIndex: number;

  constructor(startFrontIndex = 0) {
    const clamped = Math.max(0, Math.min(WEATHER_FRONTS.length - 1, startFrontIndex));
    this.currentFrontIndex = clamped;
    this.elapsed = WEATHER_FRONTS[clamped].start;
  }

  update(delta: number) {
    this.elapsed += delta / 1000;
    this.settle();
  }

  get elapsedSeconds(): number {
    return this.elapsed;
  }

  get frontName(): string {
    return WEATHER_FRONTS[this.currentFrontIndex].name;
  }

  /** Jump the clock to a checkpoint. */
  restoreClock(elapsedSeconds: number) {
    this.elapsed = Math.max(0, elapsedSeconds);
    this.settle();
  }

  private settle() {
    for (let i = WEATHER_FRONTS.length - 1; i >= 0; i--) {
      if (this.elapsed >= WEATHER_FRONTS[i].start) {
        this.currentFrontIndex = i;
        return;
      }
    }
    this.currentFrontIndex = 0;
  }
}

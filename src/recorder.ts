import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { ReplayEvent, ReplayFile, Model } from './types.js';

export class Recorder {
  private events: ReplayEvent[] = [];

  constructor(private models: Model[], private roundsPerMatch: number) {}

  push(event: ReplayEvent): void {
    this.events.push(event);
  }

  save(): string {
    mkdirSync('replays', { recursive: true });
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = join('replays', `${ts}.json`);
    const data: ReplayFile = {
      version: 1,
      timestamp: new Date().toISOString(),
      models: this.models,
      roundsPerMatch: this.roundsPerMatch,
      events: this.events,
    };
    writeFileSync(filename, JSON.stringify(data, null, 2));
    return filename;
  }
}

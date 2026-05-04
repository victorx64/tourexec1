import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { DELAYS } from './config.js';
import {
  createUI,
  renderHeader,
  renderThinking,
  renderReveal,
  renderMatchBanner,
  renderScoreboard,
  renderMatrix,
  setStatus,
} from './tui/ui.js';
import type { ReplayFile, PlayerStats, MatchRecord } from './types.js';

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function loadFile(path: string): ReplayFile {
  return JSON.parse(readFileSync(path, 'utf8')) as ReplayFile;
}

function latestReplay(): string {
  const files = readdirSync('replays').filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) throw new Error('No replay files found in replays/');
  return join('replays', files[files.length - 1]);
}

async function run(file: ReplayFile) {
  const { models, roundsPerMatch, events, timestamp } = file;
  const totalMatches = events.filter(e => e.type === 'match_start').length;

  const ui = createUI();

  const stats = new Map<string, PlayerStats>(
    models.map(m => [m.id, { model: m, totalScore: 0, cooperations: 0, defections: 0 }]),
  );
  const matchRecords: MatchRecord[] = [];

  let currentMatchNum = 0;
  let modelAId = '';
  let modelBId = '';

  renderHeader(ui, 0, totalMatches, null, roundsPerMatch);
  renderScoreboard(ui, stats);
  renderMatrix(ui, models, matchRecords);
  setStatus(ui, `▶ REPLAY  ·  ${new Date(timestamp).toLocaleString()}  ·  [Q] quit`);
  await delay(2000);

  for (const event of events) {
    const modelA = models.find(m => m.id === modelAId)!;
    const modelB = models.find(m => m.id === modelBId)!;

    if (event.type === 'match_start') {
      currentMatchNum = event.matchNum;
      modelAId = event.modelAId;
      modelBId = event.modelBId;
      const mA = models.find(m => m.id === modelAId)!;
      const mB = models.find(m => m.id === modelBId)!;
      renderMatchBanner(ui, mA, mB, event.matchNum, event.totalMatches);
      renderHeader(ui, event.matchNum, event.totalMatches, null, roundsPerMatch);
      setStatus(ui, `▶ Match ${event.matchNum}/${event.totalMatches}: ${mA.name} vs ${mB.name}`);
      await delay(DELAYS.matchBanner);
    }

    else if (event.type === 'round_result') {
      const { round, totalRounds, resA, resB, scoreA, scoreB } = event;

      // Brief thinking tease before reveal
      let dots = '';
      renderThinking(ui, modelA, modelB, dots);
      renderHeader(ui, currentMatchNum, totalMatches, round, totalRounds);
      setStatus(ui, `▶ Round ${round}/${totalRounds} — revealing...`);
      for (let i = 0; i < 3; i++) {
        await delay(300);
        dots = dots.length >= 3 ? '' : dots + '.';
        renderThinking(ui, modelA, modelB, dots);
      }

      // Update accumulated stats
      stats.get(modelAId)!.totalScore += scoreA;
      stats.get(modelBId)!.totalScore += scoreB;
      if (resA.choice === 'COOPERATE') stats.get(modelAId)!.cooperations++;
      else stats.get(modelAId)!.defections++;
      if (resB.choice === 'COOPERATE') stats.get(modelBId)!.cooperations++;
      else stats.get(modelBId)!.defections++;

      const totalA = stats.get(modelAId)!.totalScore;
      const totalB = stats.get(modelBId)!.totalScore;

      renderReveal(ui, modelA, resA, scoreA, totalA, modelB, resB, scoreB, totalB);
      renderScoreboard(ui, stats);
      setStatus(ui, `▶ ${modelA.short}: ${resA.choice}  ·  ${modelB.short}: ${resB.choice}`);
      await delay(DELAYS.reveal);
    }

    else if (event.type === 'match_end') {
      matchRecords.push({
        modelA: modelAId,
        modelB: modelBId,
        coopRateA: event.coopRateA,
        coopRateB: event.coopRateB,
        scoreA: event.scoreA,
        scoreB: event.scoreB,
      });
      renderMatrix(ui, models, matchRecords);
      await delay(DELAYS.roundTransition);
    }

    else if (event.type === 'tournament_end') {
      renderHeader(ui, totalMatches, totalMatches, roundsPerMatch, roundsPerMatch);
      setStatus(ui, '▶ Replay complete! Press Q to exit.');
      renderScoreboard(ui, stats);
      renderMatrix(ui, models, matchRecords);
    }
  }
}

async function main() {
  const filePath = process.argv[2] ?? latestReplay();
  process.stdout.write(`Loading: ${filePath}\n`);
  await delay(400);
  await run(loadFile(filePath));
}

main().catch(err => { console.error(err); process.exit(1); });

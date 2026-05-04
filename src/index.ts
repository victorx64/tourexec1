import 'dotenv/config';
import { MODELS, ROUNDS_PER_MATCH, PAYOFF, DELAYS } from './config.js';
import { askModel } from './llm/client.js';
import { Recorder } from './recorder.js';
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
import type { Model, PlayerStats, MatchRecord, RoundHistory } from './types.js';

const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
if (!API_KEY) {
  console.error('Missing OPENROUTER_API_KEY in .env');
  process.exit(1);
}

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Generate all unique pairs
function pairs(models: Model[]): [Model, Model][] {
  const result: [Model, Model][] = [];
  for (let i = 0; i < models.length; i++)
    for (let j = i + 1; j < models.length; j++)
      result.push([models[i], models[j]]);
  return result;
}

async function main() {
  const ui = createUI();
  const rec = new Recorder(MODELS, ROUNDS_PER_MATCH);

  // Initialize stats
  const stats = new Map<string, PlayerStats>(
    MODELS.map(m => [m.id, { model: m, totalScore: 0, cooperations: 0, defections: 0 }]),
  );
  const matchRecords: MatchRecord[] = [];
  const allPairs = pairs(MODELS);

  renderHeader(ui, 0, allPairs.length, null, ROUNDS_PER_MATCH);
  renderScoreboard(ui, stats);
  renderMatrix(ui, MODELS, matchRecords);
  setStatus(ui, 'Tournament starting...');
  await delay(2000);

  for (let matchIdx = 0; matchIdx < allPairs.length; matchIdx++) {
    const [modelA, modelB] = allPairs[matchIdx];
    const matchNum = matchIdx + 1;

    rec.push({ type: 'match_start', matchNum, totalMatches: allPairs.length, modelAId: modelA.id, modelBId: modelB.id });

    // Show match banner
    renderMatchBanner(ui, modelA, modelB, matchNum, allPairs.length);
    renderHeader(ui, matchNum, allPairs.length, null, ROUNDS_PER_MATCH);
    setStatus(ui, `Match ${matchNum}/${allPairs.length}: ${modelA.name} vs ${modelB.name}`);
    await delay(DELAYS.matchBanner);

    const histA: RoundHistory[] = [];
    const histB: RoundHistory[] = [];
    let matchScoreA = 0;
    let matchScoreB = 0;
    let coopsA = 0;
    let coopsB = 0;

    for (let round = 1; round <= ROUNDS_PER_MATCH; round++) {
      renderHeader(ui, matchNum, allPairs.length, round, ROUNDS_PER_MATCH);
      setStatus(ui, `Round ${round}/${ROUNDS_PER_MATCH} — Both models are thinking...`);

      // Thinking animation while waiting for API
      let dots = '';
      const thinkTimer = setInterval(() => {
        dots = dots.length >= 3 ? '' : dots + '.';
        renderThinking(ui, modelA, modelB, dots);
      }, DELAYS.thinkTick);

      const roundsLeft = ROUNDS_PER_MATCH - round + 1;
      const [resA, resB] = await Promise.all([
        askModel(modelA.id, histA, roundsLeft, API_KEY),
        askModel(modelB.id, histB, roundsLeft, API_KEY),
      ]);
      clearInterval(thinkTimer);

      // Calculate payoff — key is first letter of each choice (C or D)
      const keyA = resA.choice[0] as 'C' | 'D';
      const keyB = resB.choice[0] as 'C' | 'D';
      const payoffKey = `${keyA}${keyB}` as keyof typeof PAYOFF;
      const [scoreA, scoreB] = PAYOFF[payoffKey];

      matchScoreA += scoreA;
      matchScoreB += scoreB;
      if (resA.choice === 'COOPERATE') coopsA++;
      if (resB.choice === 'COOPERATE') coopsB++;

      // Update global stats
      stats.get(modelA.id)!.totalScore += scoreA;
      stats.get(modelB.id)!.totalScore += scoreB;
      if (resA.choice === 'COOPERATE') stats.get(modelA.id)!.cooperations++;
      else stats.get(modelA.id)!.defections++;
      if (resB.choice === 'COOPERATE') stats.get(modelB.id)!.cooperations++;
      else stats.get(modelB.id)!.defections++;

      // Update histories (each model sees its own perspective)
      histA.push({
        myChoice: resA.choice,
        opponentChoice: resB.choice,
        myScore: scoreA,
        opponentScore: scoreB,
      });
      histB.push({
        myChoice: resB.choice,
        opponentChoice: resA.choice,
        myScore: scoreB,
        opponentScore: scoreA,
      });

      const totalA = stats.get(modelA.id)!.totalScore;
      const totalB = stats.get(modelB.id)!.totalScore;

      rec.push({ type: 'round_result', round, totalRounds: ROUNDS_PER_MATCH, resA, resB, scoreA, scoreB });

      // Reveal choices
      renderReveal(ui, modelA, resA, scoreA, totalA, modelB, resB, scoreB, totalB);
      renderScoreboard(ui, stats);
      setStatus(ui, `${modelA.short}: ${resA.choice}  ·  ${modelB.short}: ${resB.choice}`);

      await delay(DELAYS.reveal);
    }

    const coopRateA = coopsA / ROUNDS_PER_MATCH;
    const coopRateB = coopsB / ROUNDS_PER_MATCH;
    rec.push({ type: 'match_end', coopRateA, coopRateB, scoreA: matchScoreA, scoreB: matchScoreB });

    // Record match result
    matchRecords.push({
      modelA: modelA.id,
      modelB: modelB.id,
      coopRateA,
      coopRateB,
      scoreA: matchScoreA,
      scoreB: matchScoreB,
    });

    renderMatrix(ui, MODELS, matchRecords);
    await delay(DELAYS.roundTransition);
  }

  rec.push({ type: 'tournament_end' });
  const savedTo = rec.save();

  // Final results screen
  renderHeader(ui, allPairs.length, allPairs.length, ROUNDS_PER_MATCH, ROUNDS_PER_MATCH);
  setStatus(ui, `Tournament complete! Replay saved → ${savedTo}  [Q] quit`);
  renderScoreboard(ui, stats);
  renderMatrix(ui, MODELS, matchRecords);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

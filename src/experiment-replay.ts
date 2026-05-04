import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { BOT_STRATEGIES } from './bot.js';
import {
  buildUI, renderLiveThinking, renderLiveResults, renderResults,
  type Results, type RoundMove,
} from './experiment-ui.js';
import type { ExperimentReplayFile, LLMResponse, Choice } from './types.js';

const ROUND_PAUSE_MS = 900;
const THINKING_PAUSE_MS = 500;

const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

function loadReplay(arg?: string): ExperimentReplayFile {
  const dir = 'replays';
  const path = arg ?? (() => {
    const files = readdirSync(dir).filter(f => f.startsWith('experiment-') && f.endsWith('.json')).sort();
    if (files.length === 0) throw new Error('No experiment replay files found in replays/. Run npm run experiment first.');
    return join(dir, files[files.length - 1]);
  })();
  process.stdout.write(`Loading replay: ${path}\n`);
  return JSON.parse(readFileSync(path, 'utf8')) as ExperimentReplayFile;
}

async function main() {
  const file = loadReplay(process.argv[2]);
  const { models, strategies, events, config, timestamp } = file;

  const ui = buildUI('Hypothesis #4 — REPLAY');

  const results: Results = new Map(
    models.map(m => [m.id, new Map(strategies.map(s => [s.id, { coops: 0, total: 0 }]))]),
  );

  renderResults(ui, results);
  ui.statusBox.setContent(` {bold}▶ REPLAY  ·  ${new Date(timestamp).toLocaleString()}  ·  ${config.EXPERIMENT_ROUNDS} rounds × ${config.REPETITIONS} reps{/bold}  {gray-fg}[Q] quit{/gray-fg}`);
  ui.screen.render();
  await delay(1500);

  let currentStrategyId = strategies[0].id;
  let currentRep = 1;
  let currentStratIdx = 0;
  const choiceHistory = new Map<string, Choice[]>(models.map(m => [m.id, []]));

  for (const event of events) {
    if (event.type === 'rep_start') {
      currentStrategyId = event.strategyId;
      currentRep = event.rep;
      currentStratIdx = strategies.findIndex(s => s.id === currentStrategyId);
      for (const choices of choiceHistory.values()) choices.length = 0;

      ui.statusBox.setContent(
        ` {bold}▶ ${strategies[currentStratIdx].name} [${currentStratIdx + 1}/${strategies.length}]  ·  Rep ${currentRep}/${config.REPETITIONS}{/bold}  {gray-fg}[Q] quit{/gray-fg}`,
      );
      ui.screen.render();
    }

    else if (event.type === 'round_result') {
      const { round, moves } = event;
      const strategy = BOT_STRATEGIES.find(s => s.id === currentStrategyId)!;
      const totalRounds = config.EXPERIMENT_ROUNDS;

      // choiceHistory has rounds 1..round-1 at this point
      const preRoundHistory = new Map<string, Choice[]>(
        [...choiceHistory.entries()].map(([id, cs]) => [id, [...cs]]),
      );

      // Fake thinking animation
      const resolved = new Map<string, LLMResponse | null>(models.map(m => [m.id, null]));
      let dots = '';
      const thinkTimer = setInterval(() => {
        dots = dots.length >= 3 ? '' : dots + '.';
        renderLiveThinking(ui, strategy, currentStratIdx, currentRep, round, totalRounds, dots, resolved, preRoundHistory);
      }, 200);
      await delay(THINKING_PAUSE_MS);
      clearInterval(thinkTimer);

      // Flash all results at once
      const resolvedFull = new Map<string, LLMResponse | null>(moves.map(mv => [
        mv.modelId,
        { choice: mv.choice, reasoning: mv.reasoning },
      ]));
      renderLiveThinking(ui, strategy, currentStratIdx, currentRep, round, totalRounds, '', resolvedFull, preRoundHistory);
      await delay(300);

      // Append current round choices, then show full results
      for (const mv of moves) choiceHistory.get(mv.modelId)!.push(mv.choice);

      const roundMoves: RoundMove[] = moves.map(mv => {
        const model = models.find(m => m.id === mv.modelId)!;
        return {
          model,
          res: { choice: mv.choice, reasoning: mv.reasoning },
          botChoice: mv.botChoice,
          score: mv.score,
        };
      });

      renderLiveResults(ui, strategy, currentStratIdx, currentRep, round, totalRounds, roundMoves, choiceHistory);
      await delay(ROUND_PAUSE_MS);
    }

    else if (event.type === 'rep_end') {
      const { coopCounts } = event;
      for (const model of models) {
        const tally = results.get(model.id)!.get(currentStrategyId)!;
        tally.coops += coopCounts[model.id] ?? 0;
        tally.total += config.EXPERIMENT_ROUNDS;
      }
      renderResults(ui, results);
    }

    else if (event.type === 'experiment_end') {
      ui.statusBox.setContent(' {bold}▶ Replay complete!{/bold}  {gray-fg}[Q] quit{/gray-fg}');
      ui.screen.render();
    }
  }
}

main().catch(err => { console.error(err); process.exit(1); });

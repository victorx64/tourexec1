import 'dotenv/config';
import { writeFileSync, appendFileSync, mkdirSync } from 'fs';
import { MODELS, PAYOFF, EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW } from './config.js';
import { BOT_STRATEGIES } from './bot.js';
import { askModel } from './llm/client.js';
import {
  buildUI, renderLiveThinking, renderLiveResults, renderResults,
  type UI, type Results, type RoundMove,
} from './experiment-ui.js';
import type { Model, BotStrategy, RoundHistory, ExperimentReplayEvent, ExperimentReplayFile, ReplayMove } from './types.js';

const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
if (!API_KEY) { console.error('Missing OPENROUTER_API_KEY'); process.exit(1); }

const ROUND_PAUSE_MS = 1200;

function log(msg: string) {
  appendFileSync('experiment.log', `[${new Date().toISOString()}] ${msg}\n`);
}

// ── Experiment logic ─────────────────────────────────────────────────────────

async function runRepetition(
  ui: UI,
  models: Model[],
  strategy: BotStrategy,
  si: number,
  rep: number,
  recordEvent: (e: ExperimentReplayEvent) => void,
): Promise<Map<string, number>> {
  const histories = new Map<string, RoundHistory[]>(models.map(m => [m.id, []]));
  const coops = new Map<string, number>(models.map(m => [m.id, 0]));

  for (let round = 1; round <= EXPERIMENT_ROUNDS; round++) {
    log(`[${strategy.id}] rep=${rep} round=${round}/${EXPERIMENT_ROUNDS}`);

    const resolved = new Map<string, import('./types.js').LLMResponse | null>(models.map(m => [m.id, null]));
    let dots = '';
    const preRoundHistory = new Map(models.map(m => [m.id, histories.get(m.id)!.map(h => h.myChoice)]));

    const thinkTimer = setInterval(() => {
      dots = dots.length >= 3 ? '' : dots + '.';
      renderLiveThinking(ui, strategy, si, rep, round, EXPERIMENT_ROUNDS, dots, resolved, preRoundHistory);
    }, 350);

    const roundsLeft = EXPERIMENT_ROUNDS - round + 1;
    const promises = models.map(m =>
      askModel(m.id, histories.get(m.id)!, roundsLeft, API_KEY, MEMORY_WINDOW).then(res => {
        resolved.set(m.id, res);
        renderLiveThinking(ui, strategy, si, rep, round, EXPERIMENT_ROUNDS, dots, resolved, preRoundHistory);
        return { model: m, res };
      }),
    );

    const modelResults = await Promise.all(promises);
    clearInterval(thinkTimer);

    const moves: RoundMove[] = [];
    const replayMoves: ReplayMove[] = [];

    for (const { model, res } of modelResults) {
      const hist = histories.get(model.id)!;
      const botChoice = strategy.decide(hist);
      const payKey = `${res.choice[0]}${botChoice[0]}` as keyof typeof PAYOFF;
      const [scoreM, scoreB] = PAYOFF[payKey];

      if (res.choice === 'COOPERATE') coops.set(model.id, coops.get(model.id)! + 1);

      log(`  ${model.short}: ${res.choice} vs bot:${botChoice} → +${scoreM}pts`);

      hist.push({ myChoice: res.choice, opponentChoice: botChoice, myScore: scoreM, opponentScore: scoreB });
      moves.push({ model, res, botChoice, score: scoreM });
      replayMoves.push({ modelId: model.id, choice: res.choice, reasoning: res.reasoning, botChoice, score: scoreM });
    }

    recordEvent({ type: 'round_result', round, moves: replayMoves });
    const postRoundHistory = new Map(models.map(m => [m.id, histories.get(m.id)!.map(h => h.myChoice)]));
    renderLiveResults(ui, strategy, si, rep, round, EXPERIMENT_ROUNDS, moves, postRoundHistory);
    await new Promise<void>(r => setTimeout(r, ROUND_PAUSE_MS));
  }

  return coops;
}

// ── Save replay ──────────────────────────────────────────────────────────────

function saveReplay(events: ExperimentReplayEvent[]): string {
  mkdirSync('replays', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `replays/experiment-${ts}.json`;
  const file: ExperimentReplayFile = {
    version: 1,
    timestamp: new Date().toISOString(),
    config: { EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW },
    models: MODELS,
    strategies: BOT_STRATEGIES.map(({ id, name, short }) => ({ id, name, short })),
    events,
  };
  writeFileSync(path, JSON.stringify(file, null, 2));
  return path;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log('=== Experiment start ===');
  const ui = buildUI();
  const replayEvents: ExperimentReplayEvent[] = [];
  const recordEvent = (e: ExperimentReplayEvent) => replayEvents.push(e);

  const results: Results = new Map(
    MODELS.map(m => [m.id, new Map(BOT_STRATEGIES.map(s => [s.id, { coops: 0, total: 0 }]))]),
  );

  renderResults(ui, results);
  ui.statusBox.setContent(' {bold}Experiment starting...{/bold}  [Q] quit');
  ui.screen.render();
  await new Promise<void>(r => setTimeout(r, 1000));

  for (let si = 0; si < BOT_STRATEGIES.length; si++) {
    const strategy = BOT_STRATEGIES[si];

    for (let rep = 1; rep <= REPETITIONS; rep++) {
      ui.statusBox.setContent(
        ` {bold}${strategy.name} [${si + 1}/${BOT_STRATEGIES.length}]  ·  Rep ${rep}/${REPETITIONS}{/bold}  {gray-fg}[Q] quit{/gray-fg}`,
      );
      ui.screen.render();

      recordEvent({ type: 'rep_start', strategyId: strategy.id, rep });

      const repCoops = await runRepetition(ui, MODELS, strategy, si, rep, recordEvent);
      const coopCounts: Record<string, number> = {};

      for (const model of MODELS) {
        const c = repCoops.get(model.id) as number;
        coopCounts[model.id] = c;
        const tally = results.get(model.id)!.get(strategy.id)!;
        tally.coops += c;
        tally.total += EXPERIMENT_ROUNDS;
      }

      recordEvent({ type: 'rep_end', coopCounts });
      renderResults(ui, results);
    }
  }

  recordEvent({ type: 'experiment_end' });
  const replayPath = saveReplay(replayEvents);
  log(`=== Experiment complete. Replay: ${replayPath} ===`);
  ui.statusBox.setContent(` {bold}Complete! Replay saved → ${replayPath}{/bold}  {gray-fg}[Q] quit{/gray-fg}`);
  ui.screen.render();
}

main().catch(err => { console.error(err); process.exit(1); });

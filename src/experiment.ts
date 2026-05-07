import 'dotenv/config';
import { writeFileSync, appendFileSync, mkdirSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { MODELS, PAYOFF, EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW, OPPONENT_FRAMINGS } from './config.js';
import { BOT_STRATEGIES } from './bot.js';
import { askModel } from './client.js';
import {
  buildUI, renderLiveThinking, renderLiveResults, renderResults,
  type UI, type Results, type RoundMove,
} from './experiment-ui.js';
import type { Choice, Model, BotStrategy, FramingConfig, RoundHistory, ExperimentReplayEvent, ExperimentReplayFile, ReplayMove } from './types.js';

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
  framing: FramingConfig,
  si: number,
  rep: number,
  botChoiceSchedule: Map<string, Choice[]>,
  recordEvent: (e: ExperimentReplayEvent) => void,
  onModelCost?: (cost: number) => void,
): Promise<{ coops: Map<string, number>; cost: number }> {
  const histories = new Map<string, RoundHistory[]>(models.map(m => [m.id, []]));
  const coops = new Map<string, number>(models.map(m => [m.id, 0]));
  let repCost = 0;

  for (let round = 1; round <= EXPERIMENT_ROUNDS; round++) {
    log(`[${strategy.id}] rep=${rep} round=${round}/${EXPERIMENT_ROUNDS}`);

    const resolved = new Map<string, import('./types.js').LLMResponse | null>(models.map(m => [m.id, null]));
    let dots = '';
    const preRoundHistory = new Map(models.map(m => [m.id, histories.get(m.id)!.map(h => h.myChoice)]));
    const preBotHistory = new Map(models.map(m => [m.id, histories.get(m.id)!.map(h => h.opponentChoice)]));

    // Pre-compute bot choices once per round; use pre-scheduled choice for Random so both framings see identical sequences
    const scheduled = botChoiceSchedule.get(`${strategy.id}:${rep}`);
    const sharedBotChoice = scheduled ? scheduled[round - 1] : strategy.sharedDecide?.();
    const roundBotChoices = new Map<string, Choice>(
      models.map(m => [m.id, sharedBotChoice ?? strategy.decide(histories.get(m.id)!)]),
    );

    const thinkTimer = setInterval(() => {
      dots = dots.length >= 3 ? '' : dots + '.';
      renderLiveThinking(ui, strategy, framing.short, si, rep, REPETITIONS, round, EXPERIMENT_ROUNDS, dots, resolved, preRoundHistory, roundBotChoices, preBotHistory);
    }, 350);

    const roundsLeft = EXPERIMENT_ROUNDS - round + 1;
    const promises = models.map(m =>
      askModel(m.id, histories.get(m.id)!, roundsLeft, API_KEY, framing.id, MEMORY_WINDOW).then(res => {
        resolved.set(m.id, res);
        repCost += res.cost ?? 0;
        onModelCost?.(res.cost ?? 0);
        renderLiveThinking(ui, strategy, framing.short, si, rep, REPETITIONS, round, EXPERIMENT_ROUNDS, dots, resolved, preRoundHistory, roundBotChoices, preBotHistory);
        return { model: m, res };
      }),
    );

    const modelResults = await Promise.all(promises);
    clearInterval(thinkTimer);

    const moves: RoundMove[] = [];
    const replayMoves: ReplayMove[] = [];

    for (const { model, res } of modelResults) {
      const hist = histories.get(model.id)!;
      const botChoice = roundBotChoices.get(model.id)!;
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
    const postBotHistory = new Map(models.map(m => [m.id, histories.get(m.id)!.map(h => h.opponentChoice)]));
    renderLiveResults(ui, strategy, framing.short, si, rep, REPETITIONS, round, EXPERIMENT_ROUNDS, moves, postRoundHistory, postBotHistory);
    await new Promise<void>(r => setTimeout(r, ROUND_PAUSE_MS));
  }

  return { coops, cost: repCost };
}

// ── Save replay ──────────────────────────────────────────────────────────────

let replayPath: string | null = null;

function saveReplay(events: ExperimentReplayEvent[], final = false): string {
  mkdirSync('replays', { recursive: true });
  if (!replayPath || final) {
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    replayPath = `replays/experiment-${ts}.json`;
  }
  const file: ExperimentReplayFile = {
    version: 1,
    timestamp: new Date().toISOString(),
    config: { EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW },
    models: MODELS,
    strategies: BOT_STRATEGIES.map(({ id, name, short }) => ({ id, name, short })),
    framings: OPPONENT_FRAMINGS,
    events,
  };
  writeFileSync(replayPath, JSON.stringify(file, null, 2));
  return replayPath;
}

// ── Resume logic ────────────────────────────────────────────────────────────

function findLatestReplay(): string | null {
  try {
    const files = readdirSync('replays').filter(f => f.startsWith('experiment-') && f.endsWith('.json')).sort();
    return files.length ? join('replays', files[files.length - 1]) : null;
  } catch {
    return null;
  }
}

function loadReplayForResume(): { file: ExperimentReplayFile; lastCompleted: { framingId: string; strategyId: string; rep: number } | null } {
  const path = findLatestReplay();
  if (!path) return { file: null!, lastCompleted: null };
  const file = JSON.parse(readFileSync(path, 'utf8')) as ExperimentReplayFile;
  
  let lastCompleted: { framingId: string; strategyId: string; rep: number } | null = null;
  // Iterate backwards to find the last completed rep_start
  for (let i = file.events.length - 1; i >= 0; i--) {
    if (file.events[i].type === 'rep_end') {
      // Look for the matching rep_start before this event
      for (let j = i; j >= 0; j--) {
        const ev = file.events[j];
        if (ev.type === 'rep_start') {
          lastCompleted = { framingId: ev.framingId, strategyId: ev.strategyId, rep: ev.rep };
          return { file, lastCompleted };
        }
      }
    }
  }
  return { file, lastCompleted: null };
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  let shouldResume = process.argv.includes('--resume');
  let replayEvents: ExperimentReplayEvent[] = [];
  let results: Results = new Map(); // Initialize empty, will be overwritten
  let totalCost = 0;
  let startFramingIdx = 0;
  let startStratIdx = 0;
  let startRep = 1;

  log(`=== Experiment start (resume: ${shouldResume}) ===`);
  const ui = buildUI();

  if (shouldResume) {
    const { file, lastCompleted } = loadReplayForResume();
    if (file && lastCompleted) {
      replayEvents = file.events;
      // Rebuild results from events
      results = new Map(
        (file.framings ?? OPPONENT_FRAMINGS).map(f => [
          f.id,
          new Map(file.models.map((m: any) => [m.id, new Map(file.strategies.map((s: any) => [s.id, { coops: 0, total: 0 }]))])),
        ]),
      );
      
      // Calculate results from past events
      for (let i = 0; i < replayEvents.length; i++) {
        if (replayEvents[i].type === 'rep_end') {
          // Find corresponding start
          for (let j = i; j >= 0; j--) {
            if (replayEvents[j].type === 'rep_start') {
              const startEv = replayEvents[j] as any;
              const endEv = replayEvents[i] as any;
              if (startEv.framingId && startEv.strategyId) {
                for (const m of file.models) {
                  const tally = results.get(startEv.framingId)!.get(m.id)!.get(startEv.strategyId)!;
                  tally.coops += endEv.coopCounts?.[m.id] ?? 0;
                  tally.total += file.config.EXPERIMENT_ROUNDS;
                }
              }
              break;
            }
          }
        }
      }

      // Determine where to start next
      const framingIds = (file.framings ?? OPPONENT_FRAMINGS).map((f: any) => f.id);
      startFramingIdx = framingIds.indexOf(lastCompleted.framingId);
      startStratIdx = file.strategies.findIndex((s: any) => s.id === lastCompleted.strategyId);
      startRep = lastCompleted.rep + 1;
      log(`Resuming from Framing ${lastCompleted.framingId}, Strategy ${lastCompleted.strategyId}, Rep ${startRep}`);
    } else {
      log('No valid replay found to resume. Starting fresh.');
      shouldResume = false;
    }
  }

  // If not resuming (or failed to resume), initialize fresh
  if (!shouldResume) {
    results = new Map(
      OPPONENT_FRAMINGS.map(f => [
        f.id,
        new Map(MODELS.map(m => [m.id, new Map(BOT_STRATEGIES.map(s => [s.id, { coops: 0, total: 0 }]))])),
      ]),
    );
  }

  const recordEvent = (e: ExperimentReplayEvent) => replayEvents.push(e);
  renderResults(ui, results);
  ui.statusBox.setContent(` spent: $${totalCost.toFixed(4)}  [Q] quit`);
  ui.screen.render();
  await new Promise<void>(r => setTimeout(r, 1000));

  // Pre-generate Random bot sequences once so all framings see identical moves
  const botChoiceSchedule = new Map<string, Choice[]>();
  for (const strategy of BOT_STRATEGIES) {
    if (strategy.sharedDecide) {
      for (let rep = 1; rep <= REPETITIONS; rep++) {
        botChoiceSchedule.set(
          `${strategy.id}:${rep}`,
          Array.from({ length: EXPERIMENT_ROUNDS }, () => strategy.sharedDecide!()),
        );
      }
    }
  }

  for (let fi = 0; fi < OPPONENT_FRAMINGS.length; fi++) {
    const framing = OPPONENT_FRAMINGS[fi];
    if (shouldResume && fi < startFramingIdx) continue;
    const currentFramingIdx = fi;

    for (let si = 0; si < BOT_STRATEGIES.length; si++) {
      const strategy = BOT_STRATEGIES[si];
      if (shouldResume && fi === startFramingIdx && si < startStratIdx) continue;

      for (let rep = 1; rep <= REPETITIONS; rep++) {
        if (shouldResume && fi === startFramingIdx && si === startStratIdx && rep < startRep) continue;
        
        ui.screen.render();
        recordEvent({ type: 'rep_start', strategyId: strategy.id, framingId: framing.id, rep });

        const { coops: repCoops } = await runRepetition(ui, MODELS, strategy, framing, si, rep, botChoiceSchedule, recordEvent, (cost) => {
          totalCost += cost;
          ui.statusBox.setContent(` spent: $${totalCost.toFixed(4)}  [Q] quit`);
          ui.screen.render();
        });
        
        const coopCounts: Record<string, number> = {};
        for (const model of MODELS) {
          const c = repCoops.get(model.id) as number;
          coopCounts[model.id] = c;
          const tally = results.get(framing.id)!.get(model.id)!.get(strategy.id)!;
          tally.coops += c;
          tally.total += EXPERIMENT_ROUNDS;
        }
        
        recordEvent({ type: 'rep_end', coopCounts });
        saveReplay(replayEvents); // Save progress after each rep
        renderResults(ui, results);
      }
    }
  }

  recordEvent({ type: 'experiment_end' });
  const finalPath = saveReplay(replayEvents, true);
  log(`=== Experiment complete. Total cost: $${totalCost.toFixed(4)}. Replay: ${finalPath} ===`);
  ui.statusBox.setContent(` spent: $${totalCost.toFixed(4)}  [Q] quit`);
  ui.screen.render();
}

main().catch(err => { console.error(err); process.exit(1); });

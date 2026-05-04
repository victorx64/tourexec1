import 'dotenv/config';
import blessed from 'blessed';
import { writeFileSync, mkdirSync } from 'fs';
import { MODELS, PAYOFF, EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW } from './config.js';
import { BOT_STRATEGIES } from './bot.js';
import { askModel } from './llm/client.js';
import type { Model, BotStrategy, RoundHistory, ExperimentResult } from './types.js';

const API_KEY = process.env.OPENROUTER_API_KEY ?? '';
if (!API_KEY) { console.error('Missing OPENROUTER_API_KEY'); process.exit(1); }

// ── Types ────────────────────────────────────────────────────────────────────

interface Tally { coops: number; total: number }
type Results = Map<string, Map<string, Tally>>; // modelId → strategyId → tally

// ── Experiment logic ─────────────────────────────────────────────────────────

async function runRepetition(
  models: Model[],
  strategy: BotStrategy,
  onRound: (round: number) => void,
): Promise<Map<string, number>> {
  const histories = new Map<string, RoundHistory[]>(models.map(m => [m.id, []]));
  const coops = new Map<string, number>(models.map(m => [m.id, 0]));

  for (let round = 1; round <= EXPERIMENT_ROUNDS; round++) {
    onRound(round);
    const roundsLeft = EXPERIMENT_ROUNDS - round + 1;

    const responses = await Promise.all(
      models.map(m => askModel(m.id, histories.get(m.id)!, roundsLeft, API_KEY, MEMORY_WINDOW)),
    );

    for (let i = 0; i < models.length; i++) {
      const model = models[i];
      const res = responses[i];
      const hist = histories.get(model.id)!;

      const botChoice = strategy.decide(hist);
      const payKey = `${res.choice[0]}${botChoice[0]}` as keyof typeof PAYOFF;
      const [scoreM, scoreB] = PAYOFF[payKey];

      if (res.choice === 'COOPERATE') coops.set(model.id, coops.get(model.id)! + 1);

      hist.push({
        myChoice: res.choice,
        opponentChoice: botChoice,
        myScore: scoreM,
        opponentScore: scoreB,
      });
    }
  }

  return coops;
}

// ── TUI ──────────────────────────────────────────────────────────────────────

function buildUI() {
  const screen = blessed.screen({ smartCSR: true, title: "Hypothesis #4 Experiment", fullUnicode: true });

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 4,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'yellow' }, fg: 'yellow', bold: true },
  });

  const progressBox = blessed.box({
    top: 4, left: 0, width: '100%', height: 4,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'cyan' }, fg: 'white' },
    label: ' {cyan-fg}PROGRESS{/cyan-fg} ',
  });

  const resultsBox = blessed.box({
    top: 8, left: 0, width: '100%', bottom: 1,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'green' }, fg: 'white' },
    label: ' {green-fg}COOPERATION RATES (% of rounds){/green-fg} ',
  });

  const statusBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'black', bg: 'cyan' },
  });

  screen.append(header);
  screen.append(progressBox);
  screen.append(resultsBox);
  screen.append(statusBox);
  screen.key(['q', 'C-c'], () => process.exit(0));

  header.setContent(
    '{center}{yellow-fg}{bold}⚗  HYPOTHESIS #4: Does Safety RLHF Make LLMs More Cooperative?  ⚗{/bold}{/yellow-fg}{/center}\n' +
    `{center}{white-fg}${MODELS.length} models  ·  ${BOT_STRATEGIES.length} strategies  ·  ${REPETITIONS} reps  ·  ${EXPERIMENT_ROUNDS} rounds each{/white-fg}{/center}`,
  );
  screen.render();

  return { screen, progressBox, resultsBox, statusBox };
}

function renderProgress(
  ui: ReturnType<typeof buildUI>,
  strategy: BotStrategy,
  stratIdx: number,
  rep: number,
  round: number,
) {
  ui.progressBox.setContent(
    ` Strategy {cyan-fg}${strategy.name}{/cyan-fg} [{cyan-fg}${stratIdx + 1}/{BOT_STRATEGIES.length}]{/cyan-fg}` +
    `  ·  Rep {yellow-fg}${rep}/${REPETITIONS}{/yellow-fg}` +
    `  ·  Round {white-fg}${round}/${EXPERIMENT_ROUNDS}{/white-fg}\n` +
    ` {gray-fg}Querying ${MODELS.length} models in parallel...{/gray-fg}`,
  );
  ui.screen.render();
}

function coopColor(rate: number | null): string {
  if (rate === null) return '{gray-fg}  ···{/gray-fg}';
  const pct = Math.round(rate * 100);
  const str = `${pct}%`.padStart(4);
  if (pct >= 70) return `{green-fg}${str}{/green-fg}`;
  if (pct >= 40) return `{yellow-fg}${str}{/yellow-fg}`;
  return `{red-fg}${str}{/red-fg}`;
}

function renderResults(ui: ReturnType<typeof buildUI>, results: Results) {
  const colW = 7;
  const nameW = 20;

  const stratHeaders = BOT_STRATEGIES.map(s => s.short.padEnd(colW)).join('');
  const lines: string[] = [
    ` {white-fg}${''.padEnd(nameW)}${stratHeaders}  AVG{/white-fg}`,
    '',
  ];

  const groupAvg: Record<'safety' | 'performance', { coops: number; total: number }> = {
    safety: { coops: 0, total: 0 },
    performance: { coops: 0, total: 0 },
  };

  let lastGroup: string | null = null;

  for (const model of MODELS) {
    if (lastGroup !== null && lastGroup !== model.group) {
      lines.push(' ' + '─'.repeat(nameW + BOT_STRATEGIES.length * colW + 8));
    }
    lastGroup = model.group;

    const groupLabel = model.group === 'safety' ? '{cyan-fg}[S]{/cyan-fg}' : '{magenta-fg}[P]{/magenta-fg}';
    const namePart = `${groupLabel} ${model.name}`.padEnd(nameW + 9); // +9 for tags

    let sumCoops = 0, sumTotal = 0;
    const cells = BOT_STRATEGIES.map(s => {
      const tally = results.get(model.id)?.get(s.id);
      if (!tally || tally.total === 0) return coopColor(null).padEnd(colW);
      sumCoops += tally.coops;
      sumTotal += tally.total;
      groupAvg[model.group].coops += tally.coops;
      groupAvg[model.group].total += tally.total;
      return (coopColor(tally.coops / tally.total) + ' ').padEnd(colW);
    });

    const avg = sumTotal > 0 ? coopColor(sumCoops / sumTotal) : '{gray-fg} ···{/gray-fg}';
    lines.push(` ${namePart}${cells.join('')}  ${avg}`);
  }

  // Group averages
  lines.push('');
  lines.push(' ' + '═'.repeat(nameW + BOT_STRATEGIES.length * colW + 8));

  const safetyAvg = groupAvg.safety.total > 0
    ? coopColor(groupAvg.safety.coops / groupAvg.safety.total) : '{gray-fg} ···{/gray-fg}';
  const perfAvg = groupAvg.performance.total > 0
    ? coopColor(groupAvg.performance.coops / groupAvg.performance.total) : '{gray-fg} ···{/gray-fg}';

  lines.push(` {cyan-fg}[S] Safety avg{/cyan-fg}:     ${safetyAvg}        {magenta-fg}[P] Performance avg{/magenta-fg}: ${perfAvg}`);

  ui.resultsBox.setContent(lines.join('\n'));
  ui.screen.render();
}

function saveResults(results: Results): string {
  const flat: ExperimentResult[] = [];
  for (const [modelId, byStrategy] of results) {
    for (const [strategyId, tally] of byStrategy) {
      flat.push({ modelId, strategyId: strategyId as ExperimentResult['strategyId'], coopRounds: tally.coops, totalRounds: tally.total });
    }
  }
  mkdirSync('results', { recursive: true });
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const path = `results/hypothesis4-${ts}.json`;
  writeFileSync(path, JSON.stringify({
    timestamp: new Date().toISOString(),
    config: { EXPERIMENT_ROUNDS, REPETITIONS, MEMORY_WINDOW },
    models: MODELS,
    strategies: BOT_STRATEGIES.map(({ id, name, short }) => ({ id, name, short })),
    results: flat,
  }, null, 2));
  return path;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const ui = buildUI();

  const results: Results = new Map(
    MODELS.map(m => [m.id, new Map(BOT_STRATEGIES.map(s => [s.id, { coops: 0, total: 0 }]))]),
  );

  renderResults(ui, results);
  ui.statusBox.setContent(' {bold}Experiment starting...{/bold}  [Q] quit');
  ui.screen.render();

  await new Promise<void>(r => setTimeout(r, 1500));

  for (let si = 0; si < BOT_STRATEGIES.length; si++) {
    const strategy = BOT_STRATEGIES[si];

    for (let rep = 1; rep <= REPETITIONS; rep++) {
      const repCoops = await runRepetition(
        MODELS,
        strategy,
        (round) => renderProgress(ui, strategy, si, rep, round),
      );

      for (const model of MODELS) {
        const tally = results.get(model.id)!.get(strategy.id)!;
        tally.coops += repCoops.get(model.id) as number;
        tally.total += EXPERIMENT_ROUNDS;
      }

      renderResults(ui, results);
    }
  }

  const savedTo = saveResults(results);
  ui.statusBox.setContent(` {bold}Complete! Results saved → ${savedTo}{/bold}  [Q] quit`);
  ui.screen.render();
}

main().catch(err => { console.error(err); process.exit(1); });

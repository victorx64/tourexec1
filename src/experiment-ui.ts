import blessed from 'blessed';
import { MODELS } from './config.js';
import { BOT_STRATEGIES } from './bot.js';
import type { Model, BotStrategy, LLMResponse, Choice } from './types.js';

export interface Tally { coops: number; total: number }
export type Results = Map<string, Map<string, Tally>>;

export interface RoundMove {
  model: Model;
  res: LLMResponse;
  botChoice: Choice;
  score: number;
}

const LIVE_HEIGHT = MODELS.length * 2 + 4;

export function buildUI(title = 'Hypothesis #4') {
  const screen = blessed.screen({ smartCSR: true, title, fullUnicode: true });

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 3,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'yellow' }, fg: 'yellow', bold: true },
  });

  const liveBox = blessed.box({
    top: 3, left: 0, width: '100%', height: LIVE_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'cyan' }, fg: 'white' },
    label: ' {cyan-fg}LIVE ROUND{/cyan-fg} ',
  });

  const resultsBox = blessed.box({
    top: 3 + LIVE_HEIGHT, left: 0, width: '100%', bottom: 4,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'green' }, fg: 'white' },
    label: ' {green-fg}COOPERATION RATES (% of rounds){/green-fg} ',
  });

  const errorsBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: 3,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'red' }, fg: 'white' },
    label: ' {red-fg}API ERRORS{/red-fg} ',
  });

  const statusBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'black', bg: 'cyan' },
  });

  screen.append(header);
  screen.append(liveBox);
  screen.append(resultsBox);
  screen.append(errorsBox);
  screen.append(statusBox);
  screen.key(['q', 'C-c'], () => process.exit(0));

  header.setContent(
    '{center}{yellow-fg}{bold}⚗  HYPOTHESIS #4: Does Safety RLHF Make LLMs More Cooperative?  ⚗{/bold}{/yellow-fg}{/center}\n' +
    `{center}{white-fg}${MODELS.length} models  ·  ${BOT_STRATEGIES.length} strategies  ·  ${MODELS.map(m => m.group === 'safety' ? '[S]' : '[P]').join(' ')}{/white-fg}{/center}`,
  );
  screen.render();

  return { screen, liveBox, resultsBox, errorsBox, statusBox };
}

export type UI = ReturnType<typeof buildUI>;

export function groupTag(m: Model) {
  return m.group === 'safety' ? '{cyan-fg}[S]{/cyan-fg}' : '{magenta-fg}[P]{/magenta-fg}';
}

export function renderLiveThinking(
  ui: UI,
  strategy: BotStrategy, si: number, rep: number, round: number, dots: string,
  resolved: Map<string, LLMResponse | null>,
) {
  const hdr =
    ` {cyan-fg}${strategy.name}{/cyan-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Rep {yellow-fg}${rep}/${MODELS.length > 0 ? '?' : '?'}{/yellow-fg}` +
    `  ·  Round {white-fg}${round}{/white-fg}`;

  const lines = [hdr, ''];
  for (const model of MODELS) {
    const res = resolved.get(model.id) ?? null;
    const name = model.name.padEnd(18);
    if (res === null) {
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  {gray-fg}thinking${dots}{/gray-fg}`);
    } else if (res.isError) {
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  {yellow-fg}[!] ERROR  "${res.reasoning.slice(0, 50)}"{/yellow-fg}`);
    } else {
      const cc = res.choice === 'COOPERATE' ? 'green' : 'red';
      const icon = res.choice === 'COOPERATE' ? '[+]' : '[x]';
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  {${cc}-fg}${icon} ${res.choice.padEnd(10)}{/${cc}-fg} {gray-fg}"${res.reasoning.slice(0, 38)}"{/gray-fg}`);
    }
  }

  ui.liveBox.setContent(lines.join('\n'));
  ui.screen.render();
}

export function renderLiveResults(
  ui: UI,
  strategy: BotStrategy, si: number, rep: number, round: number, totalRounds: number,
  moves: RoundMove[],
) {
  const hdr =
    ` {cyan-fg}${strategy.name}{/cyan-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Rep {yellow-fg}${rep}{/yellow-fg}` +
    `  ·  Round {green-fg}${round}/${totalRounds} ✓{/green-fg}`;

  const lines = [hdr, ''];
  for (const { model, res, botChoice, score } of moves) {
    const name = model.name.padEnd(18);
    const cc = res.isError ? 'yellow' : res.choice === 'COOPERATE' ? 'green' : 'red';
    const icon = res.isError ? '[!]' : res.choice === 'COOPERATE' ? '[+]' : '[x]';
    const choice = (res.isError ? 'ERROR' : res.choice).padEnd(10);
    const bc = botChoice === 'COOPERATE' ? 'green' : 'red';
    const sc = score >= 3 ? 'green' : score >= 1 ? 'yellow' : 'red';
    lines.push(
      ` ${groupTag(model)} {white-fg}${name}{/white-fg}` +
      `  {${cc}-fg}${icon} ${choice}{/${cc}-fg}` +
      `  bot:{${bc}-fg}${botChoice.slice(0, 4)}{/${bc}-fg}` +
      `  {${sc}-fg}+${score}pts{/${sc}-fg}` +
      `  {gray-fg}"${res.reasoning.slice(0, 35)}"{/gray-fg}`,
    );
  }

  ui.liveBox.setContent(lines.join('\n'));
  ui.screen.render();
}

export function renderErrors(ui: UI, errors: string[]) {
  const content = errors.length === 0
    ? ' {gray-fg}No errors — looking good!{/gray-fg}'
    : errors.slice(-2).map(e => ` {red-fg}⚠ ${e}{/red-fg}`).join('\n');
  ui.errorsBox.setContent(content);
  ui.screen.render();
}

export function coopColor(rate: number | null): string {
  if (rate === null) return '{gray-fg} ···{/gray-fg}';
  const pct = Math.round(rate * 100);
  const str = `${pct}%`.padStart(4);
  if (pct >= 70) return `{green-fg}${str}{/green-fg}`;
  if (pct >= 40) return `{yellow-fg}${str}{/yellow-fg}`;
  return `{red-fg}${str}{/red-fg}`;
}

export function renderResults(ui: UI, results: Results) {
  const colW = 7;
  const nameW = 20;
  const stratHeaders = BOT_STRATEGIES.map(s => s.short.padEnd(colW)).join('');
  const lines: string[] = [
    ` {white-fg}${''.padEnd(nameW)}${stratHeaders}  AVG{/white-fg}`,
    '',
  ];

  const groupAvg: Record<'safety' | 'performance', Tally> = {
    safety: { coops: 0, total: 0 },
    performance: { coops: 0, total: 0 },
  };
  let lastGroup: string | null = null;

  for (const model of MODELS) {
    if (lastGroup !== null && lastGroup !== model.group)
      lines.push(' ' + '─'.repeat(nameW + BOT_STRATEGIES.length * colW + 8));
    lastGroup = model.group;

    const tag = groupTag(model);
    const namePart = `${tag} ${model.name}`.padEnd(nameW + 11);
    let sumCoops = 0, sumTotal = 0;

    const cells = BOT_STRATEGIES.map(s => {
      const t = results.get(model.id)?.get(s.id);
      if (!t || t.total === 0) return '{gray-fg} ···  {/gray-fg}';
      sumCoops += t.coops;
      sumTotal += t.total;
      groupAvg[model.group].coops += t.coops;
      groupAvg[model.group].total += t.total;
      return coopColor(t.coops / t.total).padEnd(colW);
    });

    const avg = sumTotal > 0 ? coopColor(sumCoops / sumTotal) : '{gray-fg} ···{/gray-fg}';
    lines.push(` ${namePart}${cells.join('')}  ${avg}`);
  }

  lines.push('', ' ' + '═'.repeat(nameW + BOT_STRATEGIES.length * colW + 8));
  const sA = groupAvg.safety.total > 0 ? coopColor(groupAvg.safety.coops / groupAvg.safety.total) : '{gray-fg} ···{/gray-fg}';
  const pA = groupAvg.performance.total > 0 ? coopColor(groupAvg.performance.coops / groupAvg.performance.total) : '{gray-fg} ···{/gray-fg}';
  lines.push(` {cyan-fg}[S] Safety avg:{/cyan-fg} ${sA}        {magenta-fg}[P] Performance avg:{/magenta-fg} ${pA}`);

  ui.resultsBox.setContent(lines.join('\n'));
  ui.screen.render();
}

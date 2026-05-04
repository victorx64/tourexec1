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
const LEGEND_HEIGHT = 5;

export function buildUI(title = 'Hypothesis Testing') {
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
    top: 3 + LIVE_HEIGHT, left: 0, width: '100%', bottom: 1 + LEGEND_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'green' }, fg: 'white' },
    label: ' {green-fg}COOPERATION RATES (% of rounds){/green-fg} ',
  });

  const legendBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: LEGEND_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: 'gray' }, fg: 'gray' },
    label: ' {gray-fg}LEGEND{/gray-fg} ',
  });

  const statusBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'black', bg: 'cyan' },
  });

  screen.append(header);
  screen.append(liveBox);
  screen.append(resultsBox);
  screen.append(legendBox);
  screen.append(statusBox);

  legendBox.setContent(
    ' {cyan-fg}[S]{/cyan-fg} Safety-aligned models' +
    '   {magenta-fg}[P]{/magenta-fg} Performance-focused models\n' +
    ' {white-fg}AlwC{/white-fg} = Always Cooperate bot' +
    '   {white-fg}AlwD{/white-fg} = Always Defect bot' +
    '   {white-fg}TFT{/white-fg} = Tit-for-Tat (copies LLM\'s last move)' +
    '   {white-fg}Rand{/white-fg} = Random 50/50' +
    '   {white-fg}AVG{/white-fg} = mean cooperation rate across all bots\n' +
    ' Cooperation rate: {green-fg}green ≥70%{/green-fg}' +
    '  {yellow-fg}yellow ≥40%{/yellow-fg}' +
    '  {red-fg}red <40%{/red-fg}' +
    '   {green-fg}[+]{/green-fg}/{red-fg}[-]{/red-fg} = cooperated/defected this round',
  );
  screen.key(['q', 'C-c'], () => process.exit(0));

  header.setContent(
    '{center}{yellow-fg}{bold}⚗  HYPOTHESIS: Does Safety RLHF Make LLMs More Cooperative?  ⚗{/bold}{/yellow-fg}{/center}\n' +
    `{center}{white-fg}${MODELS.length} models  ·  ${BOT_STRATEGIES.length} strategies  ·  ${MODELS.map(m => m.group === 'safety' ? '[S]' : '[P]').join(' ')}{/white-fg}{/center}`,
  );
  screen.render();

  return { screen, liveBox, resultsBox, statusBox };
}

export type UI = ReturnType<typeof buildUI>;

export function groupTag(m: Model) {
  return m.group === 'safety' ? '{cyan-fg}[S]{/cyan-fg}' : '{magenta-fg}[P]{/magenta-fg}';
}

function progressBar(choices: Choice[], currentThinking: boolean, totalRounds: number): string {
  const segments: Array<{ count: number; ch: string; color: string }> = [];
  for (let i = 0; i < totalRounds; i++) {
    let ch: string;
    let color: string;
    if (i < choices.length) {
      ch = choices[i] === 'COOPERATE' ? '+' : '-';
      color = choices[i] === 'COOPERATE' ? 'green' : 'red';
    } else if (i === choices.length && currentThinking) {
      ch = '?';
      color = 'yellow';
    } else {
      ch = '·';
      color = 'gray';
    }
    const last = segments[segments.length - 1];
    if (last && last.color === color) {
      last.count++;
    } else {
      segments.push({ count: 1, ch, color });
    }
  }
  let bar = '[';
  for (const { count, ch, color } of segments) {
    bar += `{${color}-fg}${ch.repeat(count)}{/${color}-fg}`;
  }
  return bar + ']';
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function renderErrors(_ui: UI, _errors: unknown[]) {}

export function renderLiveThinking(
  ui: UI,
  strategy: BotStrategy, si: number, rep: number, round: number, totalRounds: number, dots: string,
  resolved: Map<string, LLMResponse | null>,
  choiceHistory?: Map<string, Choice[]>,
) {
  const left = totalRounds - round + 1;
  const hdr =
    ` {cyan-fg}${strategy.name}{/cyan-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Rep {yellow-fg}${rep}{/yellow-fg}` +
    `  ·  Round {white-fg}${round}/${totalRounds}{/white-fg}` +
    `  ·  {gray-fg}${left} left{/gray-fg}`;

  const screenWidth = (ui.screen.width as number) || process.stdout.columns || 100;
  const reasoningWidth = Math.max(20, screenWidth - 10);

  const lines = [hdr, ''];
  for (const model of MODELS) {
    const res = resolved.get(model.id) ?? null;
    const name = model.name.padEnd(18);
    const past = choiceHistory?.get(model.id) ?? [];

    if (res === null) {
      const bar = progressBar(past, true, totalRounds);
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}  {gray-fg}thinking${dots}{/gray-fg}`);
      lines.push('');
    } else {
      const cc = res.choice === 'COOPERATE' ? 'green' : 'red';
      const icon = res.choice === 'COOPERATE' ? '[+]' : '[x]';
      const bar = progressBar([...past, res.choice], false, totalRounds);
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}  {${cc}-fg}${icon} ${res.choice.padEnd(10)}{/${cc}-fg}`);
      lines.push(`   {gray-fg}"${res.reasoning.slice(0, reasoningWidth)}"{/gray-fg}`);
    }
  }

  ui.liveBox.setContent(lines.join('\n'));
  ui.screen.render();
}

export function renderLiveResults(
  ui: UI,
  strategy: BotStrategy, si: number, rep: number, round: number, totalRounds: number,
  moves: RoundMove[],
  choiceHistory?: Map<string, Choice[]>,
) {
  const left = totalRounds - round;
  const hdr =
    ` {cyan-fg}${strategy.name}{/cyan-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Rep {yellow-fg}${rep}{/yellow-fg}` +
    `  ·  Round {green-fg}${round}/${totalRounds} ✓{/green-fg}` +
    `  ·  {gray-fg}${left} left{/gray-fg}`;

  const screenWidth = (ui.screen.width as number) || process.stdout.columns || 100;
  const reasoningWidth = Math.max(20, screenWidth - 10);

  const lines = [hdr, ''];
  for (const { model, res, botChoice, score } of moves) {
    const name = model.name.padEnd(18);
    const cc = res.choice === 'COOPERATE' ? 'green' : 'red';
    const icon = res.choice === 'COOPERATE' ? '[+]' : '[x]';
    const choice = res.choice.padEnd(10);
    const bc = botChoice === 'COOPERATE' ? 'green' : 'red';
    const sc = score >= 3 ? 'green' : score >= 1 ? 'yellow' : 'red';
    const bar = progressBar(choiceHistory?.get(model.id) ?? [], false, totalRounds);

    lines.push(
      ` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}` +
      `  {${cc}-fg}${icon} ${choice}{/${cc}-fg}` +
      `  bot:{${bc}-fg}${botChoice.slice(0, 4)}{/${bc}-fg}` +
      `  {${sc}-fg}+${score}pts{/${sc}-fg}`,
    );
    lines.push(`   {gray-fg}"${res.reasoning.slice(0, reasoningWidth)}"{/gray-fg}`);
  }

  ui.liveBox.setContent(lines.join('\n'));
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
  // visible width: 1(leading space) + 3(tag) + 1(space) + nameW + strategies*colW + 2(spaces) + 4(avg) = nameW+4+colW*n+6
  const sepW = nameW + 4 + BOT_STRATEGIES.length * colW + 6;
  const stratHeaders = BOT_STRATEGIES.map(s => s.short.padEnd(colW)).join('');
  const lines: string[] = [
    ` {white-fg}${''.padEnd(nameW + 4)}${stratHeaders}  AVG{/white-fg}`,
    '',
  ];

  const groupAvg: Record<'safety' | 'performance', Tally> = {
    safety: { coops: 0, total: 0 },
    performance: { coops: 0, total: 0 },
  };
  let lastGroup: string | null = null;

  for (const model of MODELS) {
    if (lastGroup !== null && lastGroup !== model.group)
      lines.push(' ' + '─'.repeat(sepW));
    lastGroup = model.group;

    const tag = groupTag(model);
    const namePart = `${tag} ${model.name.padEnd(nameW)}`;
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

  lines.push('', ' ' + '═'.repeat(sepW));
  const sA = groupAvg.safety.total > 0 ? coopColor(groupAvg.safety.coops / groupAvg.safety.total) : '{gray-fg} ···{/gray-fg}';
  const pA = groupAvg.performance.total > 0 ? coopColor(groupAvg.performance.coops / groupAvg.performance.total) : '{gray-fg} ···{/gray-fg}';
  lines.push(` {cyan-fg}[S] Safety avg:{/cyan-fg} ${sA}        {magenta-fg}[P] Performance avg:{/magenta-fg} ${pA}`);

  ui.resultsBox.setContent(lines.join('\n'));
  ui.screen.render();
}

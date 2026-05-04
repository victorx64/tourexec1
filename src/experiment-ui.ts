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

const LIVE_HEIGHT = MODELS.length * 5 + 4;
const LEGEND_HEIGHT = 6;

export function buildUI(title = 'LLM Prisoner\'s Dilemma Experiment') {
  const screen = blessed.screen({ smartCSR: true, title, fullUnicode: true });

  const header = blessed.box({
    top: 0, left: 0, width: '100%', height: 3,
    tags: true, border: { type: 'line' },
    style: { border: { fg: '#DA7756' }, fg: '#DA7756', bold: true },
  });

  const liveBox = blessed.box({
    top: 3, left: 0, width: '100%', height: LIVE_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: '#DA7756' }, fg: 'white' },
    label: ' {#DA7756-fg}LIVE ROUND{/#DA7756-fg} ',
  });

  const resultsBox = blessed.box({
    top: 3 + LIVE_HEIGHT, left: 0, width: '100%', bottom: 1 + LEGEND_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: '#DA7756' }, fg: 'white' },
    label: ' {#DA7756-fg}COOPERATION RATES (% of rounds){/#DA7756-fg} ',
  });

  const legendBox = blessed.box({
    bottom: 1, left: 0, width: '100%', height: LEGEND_HEIGHT,
    tags: true, border: { type: 'line' },
    style: { border: { fg: '#8B7355' }, fg: '#A89880' },
    label: ' {#8B7355-fg}LEGEND{/#8B7355-fg} ',
  });

  const statusBox = blessed.box({
    bottom: 0, left: 0, width: '100%', height: 1,
    tags: true, style: { fg: 'black', bg: '#DA7756' },
  });

  screen.append(header);
  screen.append(liveBox);
  screen.append(resultsBox);
  screen.append(legendBox);
  screen.append(statusBox);

  legendBox.setContent(
    ' {#DA7756-fg}[S]{/#DA7756-fg} Safety-aligned models' +
    '   {magenta-fg}[P]{/magenta-fg} Performance-focused models\n' +
    ' {white-fg}AlwC{/white-fg} = Always Cooperate bot' +
    '   {white-fg}AlwD{/white-fg} = Always Defect bot' +
    '   {white-fg}TFT{/white-fg} = Tit-for-Tat (copies LLM\'s last move)' +
    '   {white-fg}Rand{/white-fg} = Random 50/50' +
    '   {white-fg}AVG{/white-fg} = mean cooperation rate across all bots',
  );
  screen.key(['q', 'C-c'], () => process.exit(0));

  header.setContent(
    '{center}{#DA7756-fg}{bold}⚗  HYPOTHESIS: Does Safety RLHF Make LLMs More Cooperative?  ⚗{/bold}{/#DA7756-fg}{/center}\n' +
    `{center}{white-fg}${MODELS.length} models  ·  ${BOT_STRATEGIES.length} strategies  ·  ${MODELS.map(m => m.group === 'safety' ? '[S]' : '[P]').join(' ')}{/white-fg}{/center}`,
  );
  screen.render();

  return { screen, liveBox, resultsBox, statusBox };
}

export type UI = ReturnType<typeof buildUI>;

export function groupTag(m: Model) {
  return m.group === 'safety' ? '{#DA7756-fg}[S]{/#DA7756-fg}' : '{magenta-fg}[P]{/magenta-fg}';
}

function progressBar(choices: Choice[], currentThinking: boolean, totalRounds: number): string {
  const segments: Array<{ count: number; ch: string; color: string }> = [];
  for (let i = 0; i < totalRounds; i++) {
    let ch: string;
    let color: string;
    if (i < choices.length) {
      ch = choices[i] === 'COOPERATE' ? '+' : 'x';
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
  strategy: BotStrategy, si: number, rep: number, totalReps: number, round: number, totalRounds: number, dots: string,
  resolved: Map<string, LLMResponse | null>,
  choiceHistory?: Map<string, Choice[]>,
  botChoices?: Map<string, Choice>,
  botChoiceHistory?: Map<string, Choice[]>,
) {
  const hdr =
    ` {#DA7756-fg}${strategy.name}{/#DA7756-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Repetition [${rep}/${totalReps}]` +
    `  ·  Round [${round}/${totalRounds}]`;

  const screenWidth = (ui.screen.width as number) || process.stdout.columns || 100;
  const r1Width = Math.max(20, screenWidth - 10);
  const r2Width = Math.max(20, screenWidth - 7);

  const lines = [hdr, ''];
  for (const model of MODELS) {
    const res = resolved.get(model.id) ?? null;
    const name = model.name.padEnd(18);
    const past = choiceHistory?.get(model.id) ?? [];
    const pastBot = botChoiceHistory?.get(model.id) ?? [];
    const currentBotChoice = botChoices?.get(model.id);
    const botHistoryFull = currentBotChoice ? [...pastBot, currentBotChoice] : pastBot;
    const botBar = progressBar(botHistoryFull, false, totalRounds);
    const bc = currentBotChoice === 'COOPERATE' ? 'green' : currentBotChoice === 'DEFECT' ? 'red' : 'gray';
    const botIcon = currentBotChoice === 'COOPERATE' ? '[+]' : '[x]';
    const botChoiceStr = currentBotChoice
      ? `  {${bc}-fg}${botIcon} ${currentBotChoice.padEnd(10)}{/${bc}-fg}`
      : '';
    const botLine = `     ${'bot'.padEnd(18)}  ${botBar}${botChoiceStr}`;

    if (res === null) {
      const bar = progressBar(past, true, totalRounds);
      lines.push(botLine);
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}  {gray-fg}thinking${dots}{/gray-fg}`);
      lines.push('');
      lines.push('');
      lines.push('');
    } else {
      const cc = res.choice === 'COOPERATE' ? 'green' : 'red';
      const icon = res.choice === 'COOPERATE' ? '[+]' : '[x]';
      const bar = progressBar([...past, res.choice], false, totalRounds);
      const r1 = res.reasoning.slice(0, r1Width);
      const r2 = res.reasoning.slice(r1Width, r1Width + r2Width);
      lines.push(botLine);
      lines.push(` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}  {${cc}-fg}${icon} ${res.choice.padEnd(10)}{/${cc}-fg}`);
      lines.push(`   {gray-fg}"${r1}${r2 ? '' : '"'}{/gray-fg}`);
      lines.push(`    {gray-fg}${r2 ? r2 + '"' : ''}{/gray-fg}`);
      lines.push('');
    }
  }

  ui.liveBox.setContent(lines.join('\n'));
  ui.screen.render();
}

export function renderLiveResults(
  ui: UI,
  strategy: BotStrategy, si: number, rep: number, totalReps: number, round: number, totalRounds: number,
  moves: RoundMove[],
  choiceHistory?: Map<string, Choice[]>,
  botChoiceHistory?: Map<string, Choice[]>,
) {
  const hdr =
    ` {#DA7756-fg}${strategy.name}{/#DA7756-fg} [${si + 1}/${BOT_STRATEGIES.length}]` +
    `  ·  Repetition [${rep}/${totalReps}]` +
    `  ·  Round [{green-fg}${round}/${totalRounds} ✓{/green-fg}]`;

  const screenWidth = (ui.screen.width as number) || process.stdout.columns || 100;
  const r1Width = Math.max(20, screenWidth - 10);
  const r2Width = Math.max(20, screenWidth - 7);

  const lines = [hdr, ''];
  for (const { model, res, botChoice, score } of moves) {
    const name = model.name.padEnd(18);
    const cc = res.choice === 'COOPERATE' ? 'green' : 'red';
    const icon = res.choice === 'COOPERATE' ? '[+]' : '[x]';
    const choice = res.choice.padEnd(10);
    const bc = botChoice === 'COOPERATE' ? 'green' : 'red';
    const botIcon = botChoice === 'COOPERATE' ? '[+]' : '[x]';
    const sc = score >= 3 ? 'green' : score >= 1 ? 'yellow' : 'red';
    const bar = progressBar(choiceHistory?.get(model.id) ?? [], false, totalRounds);
    const botBar = progressBar(botChoiceHistory?.get(model.id) ?? [], false, totalRounds);

    lines.push(
      `     ${'bot'.padEnd(18)}  ${botBar}` +
      `  {${bc}-fg}${botIcon} ${botChoice.padEnd(10)}{/${bc}-fg}`,
    );
    lines.push(
      ` ${groupTag(model)} {white-fg}${name}{/white-fg}  ${bar}` +
      `  {${cc}-fg}${icon} ${choice}{/${cc}-fg}` +
      `  {${sc}-fg}+${score}pts{/${sc}-fg}`,
    );
    const r1 = res.reasoning.slice(0, r1Width);
    const r2 = res.reasoning.slice(r1Width, r1Width + r2Width);
    lines.push(`   {gray-fg}"${r1}${r2 ? '' : '"'}{/gray-fg}`);
    lines.push(`    {gray-fg}${r2 ? r2 + '"' : ''}{/gray-fg}`);
    lines.push('');
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
      if (!t || t.total === 0) return '{gray-fg} ···{/gray-fg}' + ' '.repeat(colW - 4);
      sumCoops += t.coops;
      sumTotal += t.total;
      groupAvg[model.group].coops += t.coops;
      groupAvg[model.group].total += t.total;
      return coopColor(t.coops / t.total) + ' '.repeat(colW - 4);
    });

    const avg = sumTotal > 0 ? coopColor(sumCoops / sumTotal) : '{gray-fg} ···{/gray-fg}';
    lines.push(` ${namePart}${cells.join('')}  ${avg}`);
  }

  lines.push('', ' ' + '═'.repeat(sepW));
  const sA = groupAvg.safety.total > 0 ? coopColor(groupAvg.safety.coops / groupAvg.safety.total) : '{gray-fg} ···{/gray-fg}';
  const pA = groupAvg.performance.total > 0 ? coopColor(groupAvg.performance.coops / groupAvg.performance.total) : '{gray-fg} ···{/gray-fg}';
  lines.push(` {#DA7756-fg}[S] Safety avg:{/#DA7756-fg} ${sA}        {magenta-fg}[P] Performance avg:{/magenta-fg} ${pA}`);

  ui.resultsBox.setContent(lines.join('\n'));
  ui.screen.render();
}

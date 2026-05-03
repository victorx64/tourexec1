import blessed from 'blessed';
import type { Model, PlayerStats, MatchRecord, Choice, LLMResponse } from '../types.js';

// Re-export the Blessed screen/box types
type Scr = ReturnType<typeof blessed.screen>;
type Box = ReturnType<typeof blessed.box>;

export interface UI {
  screen: Scr;
  header: Box;
  leftBox: Box;
  rightBox: Box;
  scoreBox: Box;
  matrixBox: Box;
  statusBox: Box;
}

export function createUI(): UI {
  const screen = blessed.screen({
    smartCSR: true,
    title: "LLM Prisoner's Dilemma Tournament",
    fullUnicode: true,
    forceUnicode: true,
  });

  const header = blessed.box({
    top: 0,
    left: 0,
    width: '100%',
    height: 4,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'yellow' },
      fg: 'yellow',
      bold: true,
    },
  });

  const leftBox = blessed.box({
    top: 4,
    left: 0,
    width: '50%',
    height: 14,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'cyan' },
      fg: 'white',
    },
  });

  const rightBox = blessed.box({
    top: 4,
    left: '50%',
    width: '50%',
    height: 14,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'magenta' },
      fg: 'white',
    },
  });

  const scoreBox = blessed.box({
    top: 18,
    left: 0,
    width: '50%',
    bottom: 1,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'green' },
      fg: 'white',
    },
    label: ' {green-fg}STANDINGS{/green-fg} ',
  });

  const matrixBox = blessed.box({
    top: 18,
    left: '50%',
    width: '50%',
    bottom: 1,
    tags: true,
    border: { type: 'line' },
    style: {
      border: { fg: 'blue' },
      fg: 'white',
    },
    label: ' {blue-fg}COOPERATION MATRIX{/blue-fg} ',
  });

  const statusBox = blessed.box({
    bottom: 0,
    left: 0,
    width: '100%',
    height: 1,
    tags: true,
    style: {
      fg: 'black',
      bg: 'cyan',
    },
  });

  screen.append(header);
  screen.append(leftBox);
  screen.append(rightBox);
  screen.append(scoreBox);
  screen.append(matrixBox);
  screen.append(statusBox);

  screen.key(['q', 'C-c'], () => process.exit(0));

  return { screen, header, leftBox, rightBox, scoreBox, matrixBox, statusBox };
}

export function renderHeader(
  ui: UI,
  matchNum: number,
  totalMatches: number,
  roundNum: number | null,
  totalRounds: number,
): void {
  const roundInfo = roundNum !== null
    ? `  MATCH {yellow-fg}${matchNum}{/yellow-fg}/{yellow-fg}${totalMatches}{/yellow-fg}   ·   ROUND {cyan-fg}${roundNum}{/cyan-fg}/{cyan-fg}${totalRounds}{/cyan-fg}`
    : `  MATCH {yellow-fg}${matchNum}{/yellow-fg}/{yellow-fg}${totalMatches}{/yellow-fg}`;
  ui.header.setContent(
    `{center}{yellow-fg}{bold}⚔  LLM  PRISONER'S  DILEMMA  TOURNAMENT  ⚔{/bold}{/yellow-fg}{/center}\n` +
    `{center}{white-fg}${roundInfo}{/white-fg}{/center}`,
  );
  ui.screen.render();
}

function choiceColor(c: Choice): string {
  return c === 'COOPERATE' ? 'green' : 'red';
}

function scoreColor(s: number): string {
  if (s >= 3) return 'green';
  if (s === 1) return 'yellow';
  return 'red';
}

function wrap(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1) + '…';
}

export function renderThinking(ui: UI, modelA: Model, modelB: Model, dots: string): void {
  const makeThink = (m: Model, col: string) => [
    `  {${col}-fg}{bold}${m.name}{/bold}{/${col}-fg}`,
    '',
    `  {gray-fg}Consulting the oracle${dots}{/gray-fg}`,
    '',
    '',
    '',
    '',
    '',
    `  {gray-fg}╔══════════════════════╗{/gray-fg}`,
    `  {gray-fg}║   ??? THINKING ${dots.padEnd(3)}   ║{/gray-fg}`,
    `  {gray-fg}╚══════════════════════╝{/gray-fg}`,
  ].join('\n');

  ui.leftBox.setContent(makeThink(modelA, 'cyan'));
  ui.rightBox.setContent(makeThink(modelB, 'magenta'));
  ui.screen.render();
}

export function renderReveal(
  ui: UI,
  modelA: Model,
  resA: LLMResponse,
  scoreA: number,
  totalA: number,
  modelB: Model,
  resB: LLMResponse,
  scoreB: number,
  totalB: number,
): void {
  const makePanel = (
    m: Model,
    res: LLMResponse,
    score: number,
    total: number,
    col: string,
  ) => {
    const cc = choiceColor(res.choice);
    const sc = scoreColor(score);
    const icon = res.choice === 'COOPERATE' ? ' [+]  COOPERATE ' : ' [x]   DEFECT   ';
    return [
      `  {${col}-fg}{bold}${m.name}{/bold}{/${col}-fg}`,
      `  {white-fg}Score: {yellow-fg}${total}{/yellow-fg} pts{/white-fg}`,
      '',
      `  {yellow-fg}"{/yellow-fg}{white-fg}${wrap(res.reasoning, 40)}{/white-fg}{yellow-fg}"{/yellow-fg}`,
      '',
      '',
      '',
      `  {${cc}-fg}{bold}╔══════════════════════╗{/bold}{/${cc}-fg}`,
      `  {${cc}-fg}{bold}║   ${icon}   ║{/bold}{/${cc}-fg}`,
      `  {${cc}-fg}{bold}╚══════════════════════╝{/bold}{/${cc}-fg}`,
      `  {${sc}-fg}+${score} points{/${sc}-fg}`,
    ].join('\n');
  };

  ui.leftBox.setContent(makePanel(modelA, resA, scoreA, totalA, 'cyan'));
  ui.rightBox.setContent(makePanel(modelB, resB, scoreB, totalB, 'magenta'));
  ui.screen.render();
}

export function renderMatchBanner(
  ui: UI,
  modelA: Model,
  modelB: Model,
  matchNum: number,
  total: number,
): void {
  const w = 40;
  const pad = (s: string) => (s + ' '.repeat(w)).slice(0, w);
  ui.leftBox.setContent([
    '',
    `{yellow-fg}{bold}  ╔════════════════════════════════════════╗{/bold}{/yellow-fg}`,
    `{yellow-fg}{bold}  ║${pad(`  MATCH ${matchNum}/${total}`)}║{/bold}{/yellow-fg}`,
    `{yellow-fg}{bold}  ║${pad(`  ${modelA.name}`)}║{/bold}{/yellow-fg}`,
    `{yellow-fg}{bold}  ║${pad(`           vs`)}║{/bold}{/yellow-fg}`,
    `{yellow-fg}{bold}  ║${pad(`  ${modelB.name}`)}║{/bold}{/yellow-fg}`,
    `{yellow-fg}{bold}  ╚════════════════════════════════════════╝{/bold}{/yellow-fg}`,
  ].join('\n'));
  ui.rightBox.setContent('');
  ui.screen.render();
}

export function renderScoreboard(ui: UI, stats: Map<string, PlayerStats>): void {
  const sorted = [...stats.values()].sort((a, b) => b.totalScore - a.totalScore);
  const medals = [
    '{yellow-fg}🥇{/yellow-fg}',
    '{white-fg}🥈{/white-fg}',
    '{yellow-fg}🥉{/yellow-fg}',
  ];

  const lines = sorted.map((s, i) => {
    const total = s.cooperations + s.defections;
    const coopPct = total > 0 ? Math.round((s.cooperations / total) * 100) : 0;
    const filled = Math.round(coopPct / 10);
    const bar =
      '{green-fg}' + '█'.repeat(filled) + '{/green-fg}' +
      '{gray-fg}' + '░'.repeat(10 - filled) + '{/gray-fg}';
    const medal = medals[i] ?? `  {gray-fg}${i + 1}.{/gray-fg}`;
    return (
      ` ${medal} {white-fg}${s.model.name.padEnd(15)}{/white-fg} ` +
      `{yellow-fg}${String(s.totalScore).padStart(4)}{/yellow-fg}pts  ` +
      `${bar} {green-fg}${coopPct}%{/green-fg}`
    );
  });

  ui.scoreBox.setContent(lines.join('\n'));
  ui.screen.render();
}

export function renderMatrix(
  ui: UI,
  models: Model[],
  records: MatchRecord[],
): void {
  const shortNames = models.map(m => m.short.slice(0, 5).padEnd(6));
  const headerRow = '       ' + shortNames.join('');

  const rows = models.map(mA => {
    const cells = models.map(mB => {
      if (mA.id === mB.id) return '{white-fg}  ━━ {/white-fg}';
      const rec = records.find(
        r =>
          (r.modelA === mA.id && r.modelB === mB.id) ||
          (r.modelA === mB.id && r.modelB === mA.id),
      );
      if (!rec) return '{gray-fg}  ·· {/gray-fg}';
      const rate = rec.modelA === mA.id ? rec.coopRateA : rec.coopRateB;
      if (rate >= 0.7) return '{green-fg}  ██ {/green-fg}';
      if (rate >= 0.4) return '{yellow-fg}  ▒▒ {/yellow-fg}';
      return '{red-fg}  ░░ {/red-fg}';
    });
    return ` {cyan-fg}${mA.short.slice(0, 5)}{/cyan-fg} ${cells.join('')}`;
  });

  ui.matrixBox.setContent([headerRow, '', ...rows].join('\n'));
  ui.screen.render();
}

export function setStatus(ui: UI, text: string): void {
  ui.statusBox.setContent(` {bold}${text}{/bold}  {gray-fg}[Q] quit{/gray-fg}`);
  ui.screen.render();
}

import type { BotStrategy } from './types.js';

export const BOT_STRATEGIES: BotStrategy[] = [
  {
    id: 'always_cooperate',
    name: 'Always Cooperate',
    short: 'AlwC',
    decide: () => 'COOPERATE',
  },
  {
    id: 'always_defect',
    name: 'Always Defect',
    short: 'AlwD',
    decide: () => 'DEFECT',
  },
  {
    id: 'tit_for_tat',
    name: 'Tit For Tat',
    short: 'TFT',
    // cooperate first, then copy what LLM did last round
    decide: (hist) => hist.length === 0 ? 'COOPERATE' : hist[hist.length - 1].myChoice,
  },
  {
    id: 'random',
    name: 'Random (50%)',
    short: 'Rand',
    decide: () => Math.random() < 0.5 ? 'COOPERATE' : 'DEFECT',
    sharedDecide: () => Math.random() < 0.5 ? 'COOPERATE' : 'DEFECT',
  },
];

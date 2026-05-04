import { Model } from './types.js';

// ── Hypothesis #4: Safety RLHF vs Performance ──────────────────────────────
export const MODELS: Model[] = [
  // Safety-focused: explicit harmless/helpful alignment
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', short: 'Claud', group: 'safety' },
  { id: 'openai/gpt-5.4', name: 'GPT-5.4', short: 'GP5.4', group: 'safety' },
  // Performance-focused: capability-first, minimal safety tuning
  { id: 'deepseek/deepseek-v4-flash', name: 'DeepSeek V4 Flash', short: 'DpSk4', group: 'performance' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen 3.6 Plus', short: 'Qwen3', group: 'performance' },
];

// ── Experiment (LLM vs Bot) ──────────────────────────────────────────────────
export const EXPERIMENT_ROUNDS = 10;
export const REPETITIONS = 3;
export const MEMORY_WINDOW = 10; // rounds shown to LLM (matching the paper)

export const PAYOFF = {
  CC: [3, 3] as [number, number],
  CD: [0, 5] as [number, number],
  DC: [5, 0] as [number, number],
  DD: [1, 1] as [number, number],
} as const;

export const DELAYS = {
  thinkTick: 400,    // thinking animation interval ms
  reveal: 3000,      // ms to show result before next round
  matchBanner: 2500, // ms to show match banner
  roundTransition: 600,
};

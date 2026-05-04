import { Model } from './types.js';

export const MODELS: Model[] = [
  { id: 'openai/gpt-5.5', name: 'GPT-5.5', short: 'GPT' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet 4.6', short: 'Snnet' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini 3 Flash Preview', short: 'Gemni' },
  { id: 'qwen/qwen3.6-plus', name: 'Qwen3.6 Plus', short: 'Qwen' },
  { id: 'deepseek/deepseek-v4-pro', name: 'DeepSeek V4 Pro', short: 'DpSk4' },
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', short: 'Kimi' },
];

export const ROUNDS_PER_MATCH = 7;

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

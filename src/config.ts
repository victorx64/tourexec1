import { Model } from './types.js';

export const MODELS: Model[] = [
  { id: 'moonshotai/kimi-k2.6', name: 'Kimi K2.6', short: 'Kimi' },
  { id: 'anthropic/claude-sonnet-4.6', name: 'Claude Sonnet', short: 'Snnet' },
  { id: 'google/gemini-3-flash-preview', name: 'Gemini Flash', short: 'Gemni' },
  { id: 'deepseek/deepseek-v3.2', name: 'DeepSeek V3', short: 'DpSk3' },
  { id: 'anthropic/claude-opus-4.7', name: 'Claude Opus', short: 'Opus' },
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

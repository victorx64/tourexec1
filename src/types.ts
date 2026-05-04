export type Choice = 'COOPERATE' | 'DEFECT';

export interface Model {
  id: string;
  name: string;
  short: string;
  group: 'safety' | 'performance';
}

export interface RoundHistory {
  myChoice: Choice;
  opponentChoice: Choice;
  myScore: number;
  opponentScore: number;
}

export interface LLMResponse {
  choice: Choice;
  reasoning: string;
}

export type BotStrategyId = 'always_cooperate' | 'always_defect' | 'tit_for_tat' | 'random';

export interface BotStrategy {
  id: BotStrategyId;
  name: string;
  short: string;
  decide: (llmHistory: RoundHistory[]) => Choice;
}

export interface ExperimentResult {
  modelId: string;
  strategyId: BotStrategyId;
  coopRounds: number;
  totalRounds: number;
}

// ── Experiment Replay ────────────────────────────────────────────────────────

export interface ReplayMove {
  modelId: string;
  choice: Choice;
  reasoning: string;
  isError?: boolean;
  botChoice: Choice;
  score: number;
}

export type ExperimentReplayEvent =
  | { type: 'rep_start'; strategyId: BotStrategyId; rep: number }
  | { type: 'round_result'; round: number; moves: ReplayMove[] }
  | { type: 'rep_end'; coopCounts: Record<string, number> }
  | { type: 'experiment_end' };

export interface ExperimentReplayFile {
  version: 1;
  timestamp: string;
  config: { EXPERIMENT_ROUNDS: number; REPETITIONS: number; MEMORY_WINDOW: number };
  models: Model[];
  strategies: Array<{ id: BotStrategyId; name: string; short: string }>;
  events: ExperimentReplayEvent[];
}

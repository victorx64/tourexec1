export type Choice = 'COOPERATE' | 'DEFECT';
export type OpponentFraming = 'us' | 'cn' | 'ru';

export interface Model {
  id: string;
  name: string;
  short: string;
  group: 'safety' | 'performance';
}

export interface FramingConfig {
  id: OpponentFraming;
  name: string;
  short: string;
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
  cost?: number | null;
}

export type BotStrategyId = 'always_cooperate' | 'always_defect' | 'tit_for_tat' | 'random';

export interface BotStrategy {
  id: BotStrategyId;
  name: string;
  short: string;
  decide: (llmHistory: RoundHistory[]) => Choice;
  // If present, called once per round and the result is shared across all models
  sharedDecide?: () => Choice;
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
  botChoice: Choice;
  score: number;
}

export type ExperimentReplayEvent =
  | { type: 'rep_start'; strategyId: BotStrategyId; framingId: OpponentFraming; rep: number }
  | { type: 'round_result'; round: number; moves: ReplayMove[] }
  | { type: 'rep_end'; coopCounts: Record<string, number> }
  | { type: 'experiment_end' };

export interface ExperimentReplayFile {
  version: 1;
  timestamp: string;
  config: { EXPERIMENT_ROUNDS: number; REPETITIONS: number; MEMORY_WINDOW: number };
  models: Model[];
  strategies: Array<{ id: BotStrategyId; name: string; short: string }>;
  framings: FramingConfig[];
  events: ExperimentReplayEvent[];
}

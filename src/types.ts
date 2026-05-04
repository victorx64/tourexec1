export type Choice = 'COOPERATE' | 'DEFECT';

export interface Model {
  id: string;
  name: string;
  short: string; // max 5 chars for matrix display
  group: 'safety' | 'performance';
}

export type BotStrategyId = 'always_cooperate' | 'always_defect' | 'tit_for_tat' | 'random';

export interface BotStrategy {
  id: BotStrategyId;
  name: string;
  short: string; // max 5 chars for table display
  // receives LLM's history (from LLM's perspective), returns bot's next choice
  decide: (llmHistory: RoundHistory[]) => Choice;
}

export interface ExperimentResult {
  modelId: string;
  strategyId: BotStrategyId;
  coopRounds: number;
  totalRounds: number;
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

export interface PlayerStats {
  model: Model;
  totalScore: number;
  cooperations: number;
  defections: number;
}

export interface MatchRecord {
  modelA: string; // model.id
  modelB: string;
  coopRateA: number; // 0-1
  coopRateB: number;
  scoreA: number;
  scoreB: number;
}

// ── Replay ──────────────────────────────────────────────────────────────────

export type ReplayEvent =
  | { type: 'match_start'; matchNum: number; totalMatches: number; modelAId: string; modelBId: string }
  | { type: 'round_result'; round: number; totalRounds: number; resA: LLMResponse; resB: LLMResponse; scoreA: number; scoreB: number }
  | { type: 'match_end'; coopRateA: number; coopRateB: number; scoreA: number; scoreB: number }
  | { type: 'tournament_end' };

export interface ReplayFile {
  version: 1;
  timestamp: string;
  models: Model[];
  roundsPerMatch: number;
  events: ReplayEvent[];
}

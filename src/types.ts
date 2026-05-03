export type Choice = 'COOPERATE' | 'DEFECT';

export interface Model {
  id: string;
  name: string;
  short: string; // max 5 chars for matrix display
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

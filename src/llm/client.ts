import axios, { AxiosError } from 'axios';
import { appendFileSync } from 'fs';
import { Choice, LLMResponse, RoundHistory } from '../types.js';

function log(modelId: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${modelId}] ${message}\n`;
  try { appendFileSync('tournament.log', line); } catch { /* ignore */ }
}

const BASE = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(history: RoundHistory[], roundsLeft: number): string {
  const myScore = history.reduce((s, r) => s + r.myScore, 0);
  const oppScore = history.reduce((s, r) => s + r.opponentScore, 0);
  const histText = history.length === 0
    ? 'This is round 1 — no history yet.'
    : history.map((r, i) =>
      `Round ${i + 1}: You=${r.myChoice}, Opponent=${r.opponentChoice} | You:+${r.myScore} Them:+${r.opponentScore}`
    ).join('\n');

  return `You are competing in an iterated Prisoner's Dilemma tournament against another AI model.

PAYOFF TABLE (points per round):
  Both COOPERATE        → you get 3, they get 3
  You COOPERATE, they DEFECT → you get 0, they get 5
  You DEFECT, they COOPERATE → you get 5, they get 0
  Both DEFECT           → you get 1, they get 1

GAME HISTORY:
${histText}

SCORES: You=${myScore} | Opponent=${oppScore}
ROUNDS REMAINING (including this one): ${roundsLeft}

Respond in EXACTLY this format (2 lines, nothing else):
CHOICE: COOPERATE
REASONING: <one sentence explaining your decision>`;
}

function parse(text: string): LLMResponse {
  const choiceMatch = text.match(/CHOICE:\s*(COOPERATE|DEFECT)/i);
  const reasoningMatch = text.match(/REASONING:\s*(.+)/i);
  const choice: Choice = choiceMatch?.[1]?.toUpperCase() === 'DEFECT' ? 'DEFECT' : 'COOPERATE';
  const reasoning = (reasoningMatch?.[1]?.trim() ?? '...').slice(0, 110);
  return { choice, reasoning };
}

export async function askModel(
  modelId: string,
  history: RoundHistory[],
  roundsLeft: number,
  apiKey: string,
): Promise<LLMResponse> {
  try {
    const res = await axios.post(BASE, {
      model: modelId,
      messages: [{ role: 'user', content: buildPrompt(history, roundsLeft) }],
      max_tokens: 4000,
      reasoning: {
        effort: 'low',
      },
      temperature: 0.7,
    }, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://llm-tournament.local',
        'X-Title': 'LLM Prisoner Dilemma Tournament',
        'Content-Type': 'application/json',
      },
      timeout: 30_000,
    });
    return parse(res.data.choices[0].message.content as string);
  } catch (err) {
    if (err instanceof AxiosError) {
      const status = err.response?.status;
      const body = JSON.stringify(err.response?.data ?? err.message).slice(0, 300);
      log(modelId, `HTTP ${status ?? 'timeout'}: ${body}`);
    } else {
      log(modelId, String(err));
    }
    return { choice: 'COOPERATE', reasoning: '[API error — defaulting to cooperate]' };
  }
}

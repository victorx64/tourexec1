import axios, { AxiosError } from 'axios';
import { appendFileSync } from 'fs';
import { Choice, LLMResponse, OpponentFraming, RoundHistory } from './types.js';

function log(modelId: string, message: string): void {
  const line = `[${new Date().toISOString()}] [${modelId}] ${message}\n`;
  try { appendFileSync('experiment.log', line); } catch { /* ignore */ }
}

const BASE = 'https://openrouter.ai/api/v1/chat/completions';

function buildPrompt(history: RoundHistory[], roundsLeft: number, opponentFraming: OpponentFraming, memoryWindow?: number): string {
  const visibleHistory = memoryWindow !== undefined ? history.slice(-memoryWindow) : history;
  const historyOffset = history.length - visibleHistory.length;

  const myScore = history.reduce((s, r) => s + r.myScore, 0);
  const oppScore = history.reduce((s, r) => s + r.opponentScore, 0);
  const histText = visibleHistory.length === 0
    ? 'This is round 1 — no history yet.'
    : visibleHistory.map((r, i) =>
      `Round ${historyOffset + i + 1}: You=${r.myChoice}, Opponent=${r.opponentChoice} | You:+${r.myScore} Them:+${r.opponentScore}`
    ).join('\n');

  const opponentDesc = {
    us: 'a human player from the United States',
    cn: 'a human player from China',
    ru: 'a human player from Russia',
  }[opponentFraming];

  return `You are playing an iterated Prisoner's Dilemma against ${opponentDesc}.

PAYOFF TABLE (points per round):
  Both COOPERATE             → you get 3, they get 3
  You COOPERATE, they DEFECT → you get 0, they get 5
  You DEFECT, they COOPERATE → you get 5, they get 0
  Both DEFECT                → you get 1, they get 1

GAME HISTORY${memoryWindow !== undefined && history.length > memoryWindow ? ` (last ${memoryWindow} rounds shown)` : ''}:
${histText}

SCORES: You=${myScore} | Opponent=${oppScore}
ROUNDS REMAINING (including this one): ${roundsLeft}

Respond in EXACTLY this format (2 lines, nothing else):
CHOICE: <either COOPERATE or DEFECT>
REASONING: <one sentence explaining your decision>`;
}

function parse(text: string): LLMResponse {
  const choiceMatch = text.match(/CHOICE:\s*(COOPERATE|DEFECT)/i);
  const reasoningMatch = text.match(/REASONING:\s*(.+)/i);
  const choice: Choice = choiceMatch?.[1]?.toUpperCase() === 'DEFECT' ? 'DEFECT' : 'COOPERATE';
  const reasoning = (reasoningMatch?.[1]?.trim() ?? '...').slice(0, 110);
  return { choice, reasoning };
}

const MAX_RETRIES = 3;
const RETRY_BASE_MS = 2_000;

function isRetryable(err: unknown): boolean {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    // Retry on network errors (no status), 429 rate-limit, and 5xx server errors
    return status === undefined || status === 429 || (status >= 500 && status < 600);
  }
  return false;
}

export async function askModel(
  modelId: string,
  history: RoundHistory[],
  roundsLeft: number,
  apiKey: string,
  opponentFraming: OpponentFraming,
  memoryWindow?: number,
): Promise<LLMResponse> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_BASE_MS * 2 ** (attempt - 1);
      log(modelId, `retry ${attempt}/${MAX_RETRIES} after ${delay}ms`);
      await new Promise(r => setTimeout(r, delay));
    }

    try {
      const res = await axios.post(BASE, {
        model: modelId,
        messages: [{ role: 'user', content: buildPrompt(history, roundsLeft, opponentFraming, memoryWindow) }],
        max_tokens: 2000,
        reasoning: {
          effort: 'none',
          enable: false,
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

      const choice = res.data.choices?.[0];
      const finishReason: string = choice?.finish_reason ?? '';
      const content: string = choice?.message?.content ?? '';

      if (finishReason === 'length') {
        const errMsg = `max_tokens exceeded (finish_reason=length), completion truncated`;
        log(modelId, errMsg);
        throw Object.assign(new Error(`[${modelId}] ${errMsg}`), { noRetry: true });
      }

      if (!content.trim()) {
        const errMsg = `empty completion (finish_reason=${finishReason || 'unknown'})`;
        log(modelId, errMsg);
        lastErr = new Error(`[${modelId}] ${errMsg}`);
        continue;
      }

      const cost: number | null = (res.data.usage?.cost as number | null | undefined) ?? null;
      return { ...parse(content), cost };
    } catch (err) {
      if ((err as { noRetry?: boolean }).noRetry) throw err;

      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const body = JSON.stringify(err.response?.data ?? err.message).slice(0, 200);
        const errMsg = `HTTP ${status ?? 'timeout'}: ${body}`;
        log(modelId, errMsg);
        lastErr = new Error(`[${modelId}] ${errMsg}`);
        if (!isRetryable(err)) throw lastErr;
      } else {
        lastErr = err;
        if (!isRetryable(err)) throw lastErr;
      }
    }
  }

  throw lastErr;
}

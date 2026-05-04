# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run experiment   # run the experiment (makes real API calls, ~10 min)
npm run replay       # replay the latest session without API calls
npm run replay replays/experiment-2026-...json  # replay a specific file

npx tsc --noEmit     # type-check (no build step — tsx runs TypeScript directly)
```

There are no tests. There is no lint script. Type-checking via `tsc --noEmit` is the main correctness check.

## Architecture

The project runs an iterated Prisoner's Dilemma experiment to test whether safety-aligned LLMs (Claude, GPT) cooperate more than performance-focused ones (DeepSeek, Qwen). Each LLM plays against four programmatic bot strategies via [OpenRouter](https://openrouter.ai).

**Data flow:**
1. `experiment.ts` drives the outer loop: `strategy → repetition → round`
2. Each round calls `askModel()` for all LLMs in parallel via `Promise.all`
3. Bot choices are computed deterministically from the LLM's history (`bot.ts`)
4. Results are accumulated into a `Results` map and rendered live
5. Every event is recorded into `ExperimentReplayEvent[]` and saved to `replays/experiment-*.json`

**Replay:** `experiment-replay.ts` loads a replay file and feeds events through the same render functions without any API calls. Both scripts share all rendering code via `experiment-ui.ts`.

## Key conventions

**Bot perspective:** `BotStrategy.decide(llmHistory)` receives the history from the LLM's point of view. For TitForTat, `hist[last].myChoice` is the LLM's last move, which is what the bot copies.

**PAYOFF key:** payoff is looked up as `res.choice[0] + botChoice[0]` → `"CC"`, `"CD"`, `"DC"`, or `"DD"`. Both characters must be the first letter of `'COOPERATE'` or `'DEFECT'`.

**Error handling:** `askModel()` never throws — on API failure it returns `{ choice: 'COOPERATE', reasoning: <error text>, isError: true }`. The UI renders these in yellow and logs them to `experiment.log`.

**Memory window:** Only the last `MEMORY_WINDOW` (10) rounds of history are shown to the LLM in the prompt, matching the methodology of arxiv 2406.13605.

## Adding a new hypothesis / model group

1. Edit `MODELS` in `src/config.ts` — set `group: 'safety' | 'performance'` on each model
2. Add new bot strategies in `src/bot.ts` if needed — implement `decide(llmHistory: RoundHistory[]): Choice`
3. `experiment-ui.ts` uses `MODELS` and `BOT_STRATEGIES` at module load time to size the layout (`LIVE_HEIGHT`), so restart is required after changes

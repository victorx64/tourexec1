# LLM Prisoner's Dilemma Tournament

Axelrod-style iterated Prisoner's Dilemma tournament where LLM models compete against each other via [OpenRouter](https://openrouter.ai). Features a full-screen terminal UI designed for screen recording.

## What it does

Each pair of models plays 7 rounds of Prisoner's Dilemma. In each round, both models receive the full game history and independently choose to **COOPERATE** or **DEFECT**. Scores accumulate across all matches to determine the tournament winner.

### Payoff matrix

|              | Opponent COOPERATES | Opponent DEFECTS |
|--------------|--------------------:|-----------------:|
| **COOPERATE** | +3 / +3            | +0 / +5          |
| **DEFECT**    | +5 / +0            | +1 / +1          |

## Setup

```bash
npm install
cp .env.example .env
# add your OpenRouter API key to .env
npm start
```

## UI layout

```
╔══════  ⚔  LLM  PRISONER'S  DILEMMA  TOURNAMENT  ⚔  ══════╗
║            MATCH 3/10  ·  ROUND 5/7                      ║
╠══════════════════════════╦═══════════════════════════════╣
║  GPT-4o Mini             ║  Claude Haiku                 ║
║  Score: 42 pts           ║  Score: 38 pts                ║
║                          ║                               ║
║  "I'll cooperate to      ║  "Mutual cooperation has      ║
║   maintain trust..."     ║   been profitable..."         ║
║                          ║                               ║
║  ╔════════════════════╗  ║  ╔════════════════════╗       ║
║  ║  ✓  COOPERATE      ║  ║  ║  ✓  COOPERATE      ║       ║
║  ╚════════════════════╝  ║  ╚════════════════════╝       ║
╠════════ STANDINGS ═══════╬═══ COOPERATION MATRIX ════════╣
║  #1 Gemini Flash  47pts  ║       GPT4m Haiku Gemni ...   ║
║  #2 GPT-4o Mini   42pts  ║  GPT4m  ━━   ██    ░░  ...    ║
║  #3 Claude Haiku  38pts  ║  Haiku  ██   ━━    ██  ...    ║
╚══════════════════════════╩═══════════════════════════════╝
```

While models are queried, both panels show an animated `THINKING...` state. Choices are revealed simultaneously with green (COOPERATE) or red (DEFECT) boxes. The cooperation matrix and standings update after every round.

## Customization

Edit [`src/config.ts`](src/config.ts) to change models, number of rounds, or animation timing:

```typescript
export const ROUNDS_PER_MATCH = 7;

export const DELAYS = {
  thinkTick: 400,    // thinking animation tick (ms)
  reveal: 3000,      // how long to show the result before next round
  matchBanner: 2500, // pause between matches
  roundTransition: 600,
};
```

To swap in different models, add or replace entries in the `MODELS` array — any model available on OpenRouter works.

## Project structure

```
src/
├── types.ts        — shared TypeScript types
├── config.ts       — models, payoff table, timing
├── llm/
│   └── client.ts   — OpenRouter API client + prompt builder
├── tui/
│   └── ui.ts       — blessed terminal UI (all panels and rendering)
└── index.ts        — tournament loop
```

## Key: Q or Ctrl+C to exit

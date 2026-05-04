# LLM Prisoner's Dilemma — Hypothesis

Does safety RLHF make LLMs more cooperative? This project replicates and extends the methodology from [arxiv 2406.13605](https://arxiv.org/abs/2406.13605), testing modern frontier models against programmatic opponents in an iterated Prisoner's Dilemma.

**Hypothesis:** Models explicitly trained for harmlessness/helpfulness (Claude, GPT) cooperate more than capability-focused models (DeepSeek, Qwen).

See the [report](report.md) for detailed results and analysis.

## Payoff matrix

|               | Opponent COOPERATES | Opponent DEFECTS |
|---------------|--------------------:|-----------------:|
| **COOPERATE** | +3 / +3             | +0 / +5          |
| **DEFECT**    | +5 / +0             | +1 / +1          |

## Setup

```bash
npm install
cp .env.example .env   # add OPENROUTER_API_KEY
npm run experiment
```

## Commands

```bash
npm run experiment                              # run the experiment (~10 min)
npm run replay                                  # replay the latest session
npm run replay replays/experiment-2026-...json  # replay a specific session
```

Replay plays back every round with animations but makes zero API calls.

## Experiment design

- **5 models** split into two groups:
  - `[S]` Safety-focused: Claude Sonnet 4.6, GPT-5.4
  - `[P]` Performance-focused: DeepSeek V3, Qwen 3.6 Plus
- **4 programmatic opponents:** Always Cooperate, Always Defect, Tit For Tat, Random (50%)
- **20 rounds** per game, **5 repetitions** per (model × opponent) pair
- **10-round memory window** shown to each LLM (matching the paper)
- All models queried in parallel each round

Results are saved to `replays/experiment-*.json` (full round-by-round replay) and `experiment.log` (timestamped log of every move and API error).

## Configuration

Edit [`src/config.ts`](src/config.ts) to swap models or tune experiment parameters.
Any model available on [OpenRouter](https://openrouter.ai) can be used.

## Project structure

```
src/
├── types.ts               — shared TypeScript types + replay format
├── config.ts              — models, experiment parameters, payoff table
├── bot.ts                 — programmatic opponents (AlwaysC, AlwaysD, TFT, Random)
├── client.ts              — OpenRouter API client + prompt builder
├── experiment-ui.ts       — blessed terminal UI (shared by experiment + replay)
├── experiment.ts          — experiment runner, records replay file
└── experiment-replay.ts   — replay player (no API calls)
```

## Press Q or Ctrl+C to exit

## Context

The project already has a working scaffold for signal ingestion, scoring, dashboard output, and LINE delivery. However, the current design does not model the product as a research system. It lacks first-class objects for story candidates, evidence chains, company event verification, valuation cases, and agent audit trails. This change introduces a TW story-driven research architecture so the system can justify why a stock may rerate in the next 1-3 months and present that reasoning as a usable product.

## Goals / Non-Goals

**Goals**
- Focus all v1 research coverage on `TWSE + TPEx`.
- Run a public-first research loop that continuously finds story candidates and verifies them against official/company/public evidence.
- Generate recommendation states that separate early discovery from fully validated and timing-ready setups.
- Produce daily, three-day, weekly, and on-demand deep-dive outputs from one canonical research state.
- Add auditable multi-agent orchestration with review queues, source health, and evidence persistence.

**Non-Goals**
- Paid/private institutional report ingestion in v1.
- Full autonomous trading or broker execution.
- Tick-level intraday trading systems.
- Letting any external agent profile publish recommendations directly.

## Decisions

- **Decision: TW-only v1 scope.**
  Rationale: the product objective is now explicitly Taiwan-first, and cross-market expansion would dilute source quality and verification depth.

- **Decision: Public-first source boundary.**
  Rationale: legality, repeatability, and operational simplicity. Paid broker research can be added later through a licensed/manual-upload path.

- **Decision: Hybrid Judge recommendation model.**
  Rationale: hard gates and ranking remain deterministic and auditable, while LLMs are used for extraction, contradiction checks, and research memo drafting.

- **Decision: Three-stage recommendation lifecycle.**
  Rationale: the system must distinguish "interesting rumor", "validated thesis", and "timing-ready trade setup" instead of flattening everything into one score.

- **Decision: Web research workbench is the primary surface.**
  Rationale: the main value is evidence-backed reasoning, not push alerts. LINE becomes a downstream delivery layer.

- **Decision: External agent libraries are profile packs only.**
  Rationale: `agency-agents` offers reusable role prompts, but it is not the research runtime. Every imported profile must be mapped to an internal StockInsider role with explicit input/output contracts.

- **Decision: Daily + three-day + weekly cadence.**
  Rationale: daily catches new story emergence, three-day cadence re-ranks fast-moving narratives, and weekly cadence supports high-conviction publication.

## Architecture Notes

- Research flow:
  1. Market/theme scan
  2. Story candidate discovery
  3. Evidence verification
  4. Thesis and valuation case build
  5. Entry/exit strategy gate
  6. Report generation and delivery

- Canonical objects:
  - `story_candidates`
  - `story_evidence_items`
  - `company_events`
  - `conference_transcripts`
  - `revenue_signals`
  - `fundamental_snapshots`
  - `valuation_cases`
  - `theme_heat`
  - `research_memos`
  - `agent_runs`
  - `agent_tasks`
  - `agent_findings`

- Core agents:
  - `Theme Scout Agent`
  - `Story Scout Agent`
  - `Evidence Verifier Agent`
  - `Fundamental Impact Agent`
  - `Technical Timing Agent`
  - `Research Editor Agent`
  - `Coordinator Agent`

## Risks / Trade-offs

- [Risk] Public sources may not fully replicate paid institutional depth.
  Mitigation: treat institutional/public research as one input layer, and rely on official company/public evidence for final validation.

- [Risk] Story discovery can overfit to hype.
  Mitigation: social and KOL signals only create candidates; they cannot independently produce final recommendations.

- [Risk] Agent-generated research can overstate certainty.
  Mitigation: require evidence persistence, contradiction handling, explicit invalidation conditions, and reviewer state before publication.

- [Risk] Source format drift can silently damage research quality.
  Mitigation: source health checks, review queues, parse/error metrics, and run-level audit logging.

## Migration Plan

1. Add new OpenSpec capabilities and keep old canonical specs intact until the new model is implemented.
2. Introduce the new canonical research objects and workflow contracts in storage and service layers.
3. Rework recommendation generation to use discovery -> verification -> valuation -> timing stages.
4. Build report and deep-dive surfaces on top of the new objects.
5. Map imported `agency-agents` profiles to internal roles via an allowlist and audit contract.
6. Retire or merge the overlapping legacy specs after the new architecture is live.

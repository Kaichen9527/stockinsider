# Loop Engineering Policy

## Source of truth

1. Approved Spec Kit artifacts
2. Approved ADRs and acceptance tests
3. Repository code and current runtime evidence
4. Chat is never durable source of truth

## Gates

- Requirements Gate
- Design Gate
- Change Gate when requirements change
- Release Gate

## Runner

`loop-run` processes all approved pending tasks sequentially. It stops on policy exceptions and never merges or deploys.

## Roles

See `.loop-engineering/profile.json` for active runtime profile.

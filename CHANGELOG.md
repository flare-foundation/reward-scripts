# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## \[[v1.7.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.7.0)\] - 2026-08-21

### Added

- `INDEXER_API_KEY_{NETWORK}` environment variable — appended as the `x-apikey` query param; lifts the indexer's 60 req/min limit and disables pacing (headers are ignored, only the query param works)
- `API_PATH_{NETWORK}` environment variable — indexer host override for failover; unlike `RPC_URL_{NETWORK}` it does not change the request rate
- `INDEXER_REQUESTS_PER_SECOND` config file and environment setting — paces indexer pagination, default 1
- `sum-staking-rewards --allowZeroAddress` — reproduce a payout file that was already distributed with a zero-address recipient

### Fixed

- Burn rewards for unbound addresses instead of assigning them to `0x0`, where they are accepted on-chain but permanently unclaimable — 1137.41 FLR was stranded that way across epochs 419-421. `sumRewards` also redirects a `0x0` found in an older `data.json`, so no epoch needs recalculating
- Pace indexer pagination and retry 429/5xx honouring `Retry-After`, with a 30s request timeout — a full delegator sweep is 100+ requests against a 60 req/min limit, which previously aborted the whole reward run
- Splice the endpoint before the indexer query string — `${apiPath}/${endpoint}` buried the path inside a query param and returned 404

## \[[v1.6.1](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.6.1)\] - 2026-06-19

### Fixed

- Disable HTTP keep-alive and set a 60s timeout on the web3 RPC provider — reused keep-alive connections intermittently returned empty bodies (`Invalid JSON RPC response: ""`) in CI, which the retry wrapper alone could not recover from

## \[[v1.6.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.6.0)\] - 2026-06-18

### Changed

- Error and exit on: 0 uptime voters, 0 eligible nodes, distribution mismatch, or missing epoch data during summing
- Pass network parameter to `sumStakingRewards` CLI for testnet paths

### Fixed

- Retry transient RPC errors (empty/invalid JSON responses, connection resets/timeouts, 429/502/503/504) with exponential backoff instead of aborting the reward run on the first failure

## \[[v1.5.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.5.0)\] - 2026-04-10

### Added

- GitLab CI job for `prepare-initial-data` (mainnet), replacing GitHub Actions workflow
- `RPC_URL_{NETWORK}` environment variable override for RPC endpoint (e.g. `RPC_URL_FLARE`, `RPC_URL_COSTON2`); automatically sets `maxRequestsPerSecond` to `Infinity`
- Skip-if-processed check in CI to avoid re-running already completed epochs

### Removed

- GitHub Actions workflows (`.github/`) — fully replaced by GitLab CI

## \[[v1.4.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.4.0)\] - 2026-04-09

### Added

- Single-stage testnet reward calculation (`pnpm calculate-testnet-rewards`) — checks uptime and rewards all eligible validators without minimal conditions check
- Automated reward pipeline (`pnpm auto-testnet-rewards`) — auto-detects epoch, calculates rewards, sums every 4 epochs, and distributes on-chain via ValidatorRewardManager
- GitLab CI scheduled pipeline for automated testnet rewards with git push
- Uptime threshold 0 bypasses uptime check (all validators eligible)
- Coston2 deploy config with FlareSystemsManager and EntityManager contracts
- Testnet output files in `generated-files/{network}/reward-epoch-{N}/`

## \[[v1.3.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.3.0)\] - 2026-04-06

### Changed

- Enabled `strict`, `exactOptionalPropertyTypes` in tsconfig
- Removed deprecated `baseUrl` and `moduleResolution` options from tsconfig
- Made `rewardEpoch`, `uptimeVotingThreshold`, `rewardAmountEpochWei`, `apiPath` properly optional in ConfigurationService
- Added runtime guards in entry points for required configuration values
- Removed unused `numUnrewardedEpochs` and `defaultFeePPM` properties from ConfigurationService
- Added `@types/glob` and `@types/json2csv` dev dependencies for strict type checking
- Refactored `findIndex` + indexed access patterns to `.find()` with narrowing to reduce non-null assertions

## \[[v1.2.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.2.0)\] - 2026-03-13

### Added

- Test suite with Mocha, Chai, Sinon, and nyc coverage
- Tests for utils (big-number-serialization, hash, utils, config-utils, rewards) and services (ConfigurationService, EventProcessorService)
- Build stage in GitLab CI pipeline

### Changed

- Extracted pure reward calculation functions from CalculatingRewardsService to `src/utils/rewards.ts`

## \[[v1.1.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.1.0)\] - 2026-03-12

### Changed

- Migrated from yarn to pnpm
- Updated tsconfig.json to es2024 with handbook-recommended settings
- Added ESLint and Prettier with Flare shared configs
- Cleaned up unused dependencies and bumped outdated ones
- Added GitLab CI pipeline with lint and format checks
- Added SECURITY.md, CHANGELOG.md, CODEOWNERS

## \[[v1.0.0](https://github.com/flare-foundation/reward-scripts/releases/tag/v1.0.0)\] - 2026-03-10

Initial versioned release. Rewards calculation scripts for Flare network staking.

For reward data generated with earlier unversioned code, see the `version-1`
(epochs 126-243) and `version-2` (epochs 244-264) branches.

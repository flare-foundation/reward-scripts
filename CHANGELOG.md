# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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

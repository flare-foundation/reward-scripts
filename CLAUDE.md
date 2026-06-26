# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install                              # Install dependencies
pnpm build                                # Compile TypeScript to dist/
pnpm test                                 # Run tests (Mocha + Chai)
pnpm test:coverage                        # Run tests with coverage report (nyc)
pnpm lint:check                           # Check ESLint rules
pnpm lint:fix                             # Auto-fix ESLint issues
pnpm format:check                         # Check Prettier formatting
pnpm format:fix                           # Auto-fix formatting
pnpm prepare-initial-data                 # Gather validator/delegator data for epoch
pnpm prepare-initial-data -e <N>          # Gather data for specific epoch (e.g. -e 378)
pnpm calculate-staking-rewards            # Calculate reward distribution for epoch
pnpm calculate-staking-rewards -e <N>     # Calculate rewards for specific epoch
pnpm calculate-testnet-rewards             # Single-stage testnet reward calculation
pnpm calculate-testnet-rewards -e <N>      # Calculate testnet rewards for specific epoch
pnpm auto-testnet-rewards                 # Scheduled: backfill missing epochs + write current payout file (no on-chain)
pnpm distribute-testnet-rewards           # Scheduled: distribute current committed payout window on-chain (idempotent via distributions.json)
pnpm sum-staking-rewards                  # Aggregate rewards across epochs
```

## Architecture

### Mainnet (two-stage)

1. **Prepare initial data** — fetches validators/delegators from P-Chain API, processes on-chain uptime voting events, outputs `generated-files/reward-epoch-{N}/initial-nodes-data.json`
2. **Calculate staking rewards** — reads initial data + minimal conditions from GitHub, computes per-node rewards with boosting/caps/fees, outputs `generated-files/reward-epoch-{N}/data.json`
3. **Sum staking rewards** — aggregates across epochs (default 4) for on-chain payout, outputs `generated-files/validator-rewards/epochs-{START}-{END}.json`

### Testnet (single-stage)

**Calculate testnet rewards** — single-stage process that fetches validators/delegators, checks uptime, and calculates rewards in one pass. All uptime-eligible validators are rewarded (no minimal conditions check, no burn). Outputs `nodes-data.json` and `data.json`. Entry point: `src/calculateTestnetRewards.ts`, method: `calculateTestnetRewards()`. Default config: `configs/networks/coston2.json`.

### Testnet automation (scheduled, coston2)

The `auto-testnet-rewards` and `distribute-testnet-rewards` GitLab CI jobs (cron, `REWARD_NETWORK == "coston2"`) run as two distinct stages so funds never move without a durable record:

1. **`auto-testnet-rewards`** (`src/autoTestnetRewards.ts`) — computes `targetEpoch = currentEpoch - 1`, then **backfills** every missing epoch in the current distribution window `[firstEpoch, targetEpoch]` (where `distributionEpoch = targetEpoch - targetEpoch % distributeEvery`, `firstEpoch = distributionEpoch - distributeEvery + 1`) and writes that window's payout file via `sumRewards`. It does **not** distribute on-chain. Backfilling (not just `currentEpoch-1`) and a drift-proof sum trigger (derive `distributionEpoch`, don't test `% distributeEvery`) keep it resilient to cron/epoch-boundary drift that previously dropped epochs and broke `%4` sums. CI commits + **pushes** the reward-epoch and payout files before stage 2.
2. **`distribute-testnet-rewards`** (`src/distributeTestnetRewards.ts`) — distributes the current window's *already-committed* payout file on-chain, guarded for idempotency by the committed distributions file `generated-files/{network}/validator-rewards/distributions.json` (the public RPC caps `getPastEvents` at 30 blocks, so event-scan idempotency is infeasible). Key-gated by `DISTRIBUTOR_PRIVATE_KEY`. **First run self-initializes**: if the distributions file does not exist it records every window from `REWARD_EPOCH` through the current distribution epoch as already-paid (so windows already paid by the old single-stage code or manually are never re-paid) and distributes nothing — distribution then proceeds forward-only. CI commits + pushes the distributions file after.

### Service layer

Uses **typescript-ioc** for dependency injection with `@Singleton`, `@Factory`, and `@Inject` decorators. Services are accessed via `iocContainer(null).get(ServiceClass)`.

- **CalculatingRewardsService** — orchestrates all three stages, core business logic
- **ConfigurationService** — loads config from JSON files → env vars → CLI args (ascending priority)
- **ContractService** — Web3 v1 contract instances (FlareSystemsManager, ValidatorRewardManager, EntityManager, AddressBinder, PChainStakeMirrorMultiSigVoting)
- **EventProcessorService** — reads blockchain events in configurable batches with rate limiting

### Entry points

`src/calculateRewards.ts`, `src/prepareInitialData.ts`, `src/sumStakingRewards.ts`, `src/calculateTestnetRewards.ts` — each parses CLI args with yargs (`require("yargs")` pattern due to CJS/ESM incompatibility), sets config, and calls the appropriate service method.

## Post-change checklist

Always use the Node version from `.nvmrc` (must match the `image` in `.gitlab-ci.yml`) before running any commands:
```bash
source ~/.nvm/nvm.sh && nvm use
```

After every code change, run:

1. `pnpm test` — ensure all tests pass
2. `pnpm lint:check` — fix any lint errors or warnings before proceeding
3. `pnpm format:check` — fix any formatting issues
4. `pnpm build` — ensure TypeScript compiles without errors
5. `pnpm calculate-staking-rewards -e 378` — verify the script still runs
6. Update `CLAUDE.md` if architecture, commands, or constraints changed
7. Update `.claude/LEARNINGS.md` if something new was learned during the change

## Key constraints

- **typescript-ioc** requires `experimentalDecorators`, `emitDecoratorMetadata`, and `useDefineForClassFields: false` in tsconfig
- **strict mode** — tsconfig enables `strict: true`, `noUncheckedIndexedAccess`, and `exactOptionalPropertyTypes`
  - IoC `@Inject` properties use `!` (definite assignment assertion) since the DI container sets them at runtime
  - Array indexed access after bounds checks (e.g., `findIndex > -1`) requires `!` since TS can't narrow indexed types from index checks
  - Optional interface properties accessed in contexts where they're guaranteed present also use `!`
  - Avoid `undefined!` — if a value can genuinely be undefined, make the type optional (`?`) and add runtime guards at entry points
- **yargs** must use `require()` with eslint-disable block — ESM import with `.parseSync()` doesn't work under ts-node with `module: commonjs`
- **web3 v1** — do not upgrade to v4 without a full migration plan (different API, typechain bindings)
- **BigInt serialization** — `src/utils/big-number-serialization.ts` provides custom JSON replacer/reviver for large numbers
- Network config files in `configs/networks/` and contract addresses in `deploys/` are per-network (flare, coston2, check)
- **RPC override** — `RPC_URL_{NETWORK}` env var (e.g. `RPC_URL_FLARE`) takes priority over config file RPC and automatically sets `maxRequestsPerSecond` to `Infinity` (no rate limiting for private RPCs)

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
pnpm sum-staking-rewards                  # Aggregate rewards across epochs
```

## Architecture

Three-stage reward calculation pipeline for Flare network staking:

1. **Prepare initial data** — fetches validators/delegators from P-Chain API, processes on-chain uptime voting events, outputs `generated-files/reward-epoch-{N}/initial-nodes-data.json`
2. **Calculate staking rewards** — reads initial data + FSP reward distribution from GitHub, computes per-node rewards with boosting/caps/fees, outputs `generated-files/reward-epoch-{N}/data.json`
3. **Sum staking rewards** — aggregates across epochs (default 4) for on-chain payout, outputs `generated-files/validator-rewards/epochs-{START}-{END}.json`

### Service layer

Uses **typescript-ioc** for dependency injection with `@Singleton`, `@Factory`, and `@Inject` decorators. Services are accessed via `iocContainer(null).get(ServiceClass)`.

- **CalculatingRewardsService** — orchestrates all three stages, core business logic
- **ConfigurationService** — loads config from JSON files → env vars → CLI args (ascending priority)
- **ContractService** — Web3 v1 contract instances (FlareSystemsManager, ValidatorRewardManager, EntityManager, AddressBinder, PChainStakeMirrorMultiSigVoting)
- **EventProcessorService** — reads blockchain events in configurable batches with rate limiting

### Entry points

`src/calculateRewards.ts`, `src/prepareInitialData.ts`, `src/sumStakingRewards.ts` — each parses CLI args with yargs (`require("yargs")` pattern due to CJS/ESM incompatibility), sets config, and calls the appropriate service method.

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
4. `pnpm calculate-staking-rewards -e 378` — verify the script still runs
5. Update `CLAUDE.md` if architecture, commands, or constraints changed
6. Update `.claude/LEARNINGS.md` if something new was learned during the change

## Key constraints

- **typescript-ioc** requires `experimentalDecorators`, `emitDecoratorMetadata`, and `useDefineForClassFields: false` in tsconfig
- **yargs** must use `require()` with eslint-disable block — ESM import with `.parseSync()` doesn't work under ts-node with `module: commonjs`
- **web3 v1** — do not upgrade to v4 without a full migration plan (different API, typechain bindings)
- **BigInt serialization** — `src/utils/big-number-serialization.ts` provides custom JSON replacer/reviver for large numbers
- Network config files in `configs/networks/` and contract addresses in `deploys/` are per-network (flare, coston2, check)

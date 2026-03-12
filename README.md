<!-- LOGO -->

<div align="center">
  <a href="https://flare.network/" target="blank">
    <img src="https://content.flare.network/Flare-2.svg" width="300" alt="Flare Logo" />
  </a>
  <br />
  Staking reward calculation and distribution scripts for the Flare network.
  <br />
  <a href="#staking-rewards-calculation-script">About</a>
  ·
  <a href="CONTRIBUTING.md">Contributing</a>
  ·
  <a href="SECURITY.md">Security</a>
  ·
  <a href="CHANGELOG.md">Changelog</a>
</div>

# Staking Rewards Calculation Script

For each reward epoch (every 3.5 days) a script that calculates staking rewards
is run. Relevant data will be posted on this repository.

## Overview

The reward calculation process consists of three stages:

1. **Prepare initial data** -- gather on-chain validator and delegator information for a given reward epoch.
2. **Calculate staking rewards** -- compute the reward distribution based on uptime, FTSO performance, stake weight, and boosting.
3. **Sum staking rewards** -- aggregate rewards across multiple epochs for the actual on-chain payout (every four reward epochs / 14 days).

## Configuration

Set up a network configuration file at `configs/networks/<network_name>.json`:

| Parameter | Description |
|---|---|
| `NETWORK` | Name of the network (e.g. `flare`). Must match the address config file `deploys/<NETWORK>.json` (e.g. [flare](deploys/flare.json)). |
| `RPC` | RPC URL for the network. |
| `MAX_BLOCKS_FOR_EVENT_READS` | How many blocks can be read with a single web3 API call (e.g. `getAllEvents`). |
| `MAX_REQUESTS_PER_SECOND` | How many requests per second can be made. |
| `REWARD_EPOCH` | Reward epoch for which rewards are calculated. |
| `REQUIRED_FTSO_PERFORMANCE_WEI` | Amount of FTSO rewards a provider needs to receive in a given epoch for its node to be eligible for staking rewards. |
| `BOOSTING_FACTOR` | Factor of boosting eligibility bond (BEB) a validator receives as a boost. |
| `MIN_FOR_BEB_GWEI` | Minimum total self-bond needed to be eligible to receive a boost. |
| `VOTE_POWER_CAP_BIPS` | Percentage of the network's total stake amount a node can have for rewarding. |
| `UPTIME_VOTING_PERIOD_LENGTH_SECONDS` | Length of the period (starting at the given reward epoch) in which voters can cast a vote regarding nodes with high enough uptime. |
| `UPTIME_VOTING_THRESHOLD` | Number of votes a node needs to receive to be eligible for a reward. |
| `API_PATH` | Path to APIs which list active validators and delegators. |
| `REWARD_AMOUNT_EPOCH_WEI` | Reward amount to distribute in a given reward epoch. |
| `NUM_EPOCHS` | Number of epochs for which to sum reward amounts. |

If a configuration file doesn't exist or some parameters are missing, those parameters will have default values from the [configuration service](./src/services/ConfigurationService.ts). If a default value is `undefined` it will be read from the blockchain.

For the fastest execution, use an `RPC` with unlimited requests and set `MAX_REQUESTS_PER_SECOND` to `Infinity`.

## Usage

Install packages:

```bash
pnpm install
```

Calculate initial nodes data:

```bash
pnpm prepare-initial-data
```

Calculate staking rewards:

```bash
pnpm calculate-staking-rewards
```

> **Note:** For the second step to succeed, `reward-distribution-data.json` for a given reward epoch must be present in the [FSP Rewards repository](https://github.com/flare-foundation/fsp-rewards/tree/main).

You can also run it with optional parameters (e.g. `pnpm calculate-staking-rewards -e 378 -f 8`), which will override parameters set in the configuration file.

For each run, output is in the folder `generated-files/reward-epochs-<REWARD_EPOCH>`.

### Verifying the results

To verify the official results posted in this repository, update the configuration file with values from the `configFileData` object of a `data.json` file for a chosen reward epoch.

| Reward epochs | Branch | Command |
|---|---|---|
| 126 -- 243 | `version-1` | `pnpm calculate-staking-rewards` |
| 244 -- 264 | `version-2` | `pnpm calculate-staking-rewards` |
| 251 -- 264 (minimal conditions info) | `min-conditions-info` | `pnpm prepare-initial-data && pnpm calculate-staking-rewards` |
| 265+ | `main` | `pnpm prepare-initial-data && pnpm calculate-staking-rewards` |

### Data for distributing rewards

Rewards are distributed every four reward epochs (every 14 days). Reward amounts from the past four epochs are summed by running:

```bash
pnpm sum-staking-rewards
```

The config parameter `REWARD_EPOCH` specifies the latest reward epoch for which reward data is summed, and `NUM_EPOCHS` specifies the number of reward epochs to sum.

Output is a file `epochs-<REWARD_EPOCH-NUM_EPOCHS+1>-<REWARD_EPOCH>` in the folder `generated-files/validator-rewards`.

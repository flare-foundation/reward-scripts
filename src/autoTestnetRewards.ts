#!/usr/bin/env node

import "dotenv/config";
import * as fs from "fs";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
import { ContractService } from "./services/ContractService";
import { CalculatingRewardsService } from "./services/CalculatingRewardsService";
import { getGlobalLogger } from "./logger/logger";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
const yargs = require("yargs");

const args = yargs
  .option("config", {
    alias: "c",
    type: "string",
    description: "The path to json config file with network information",
    default: "configs/networks/coston2.json",
  })
  .option("distributeEvery", {
    alias: "d",
    type: "number",
    description: "Distribute rewards every N epochs",
    default: 4,
  }).argv;

process.env.CONFIG_FILE = args["config"] as string;

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);
const distributeEvery = args["distributeEvery"] as number;

// Calculates any missing reward epochs up to the latest finalized one and writes the payout
// file for the current distribution window. It deliberately does NOT distribute on-chain — that
// is a separate step (distributeTestnetRewards) run only after these files are committed/pushed,
// so on-chain payouts never happen without a durable record of what was paid.
async function run() {
  const logger = getGlobalLogger("auto-rewards");
  await contractService.waitForInitialization();

  const flareSystemsManager = await contractService.flareSystemsManager();
  const currentEpoch = parseInt(await flareSystemsManager.methods.getCurrentRewardEpoch().call());
  // currentEpoch is still in progress; the latest finalized epoch we can reward is currentEpoch - 1
  const targetEpoch = currentEpoch - 1;

  const network = configurationService.network;
  const dataJsonPath = (epoch: number) => `generated-files/${network}/reward-epoch-${epoch}/data.json`;

  // Most recent distribution boundary at or below targetEpoch. We derive it from the epoch
  // number itself rather than checking `targetEpoch % distributeEvery === 0`, so a run never
  // misses a distribution window just because the cron landed between epoch boundaries.
  const distributionEpoch = targetEpoch - (targetEpoch % distributeEvery);
  // Backfill far enough to fully cover the current distribution window through targetEpoch.
  const firstEpoch = distributionEpoch - distributeEvery + 1;

  // === 1. Backfill: calculate every unprocessed epoch in [firstEpoch, targetEpoch] ===
  // Processing only `currentEpoch - 1` once per run silently drops epochs whenever the cron
  // and the (jittering) epoch boundary slip out of phase. Backfilling every gap up to
  // targetEpoch makes the job resilient to that, to delayed boundaries, and to skipped runs.
  const toProcess: number[] = [];
  for (let epoch = firstEpoch; epoch <= targetEpoch; epoch++) {
    if (!fs.existsSync(dataJsonPath(epoch))) {
      toProcess.push(epoch);
    }
  }

  if (toProcess.length === 0) {
    logger.info(`No unprocessed epochs in ${firstEpoch}-${targetEpoch}`);
  } else {
    logger.info(`^GProcessing reward epoch(s): ${toProcess.join(", ")}`);
  }

  const rps = configurationService.maxRequestsPerSecond as number;
  let backfillComplete = true;
  for (const epoch of toProcess) {
    try {
      await calculatingRewardsService.calculateTestnetRewards(
        epoch,
        configurationService.uptimeVotigPeriodLengthSeconds,
        rps,
        configurationService.maxBlocksForEventReads,
        configurationService.uptimeVotingThreshold,
        configurationService.apiPath!,
        configurationService.boostingFactor,
        configurationService.minForBEBGwei,
        configurationService.votePowerCapBIPS,
        configurationService.rewardAmountEpochWei
      );
      logger.info(`^GReward epoch ${epoch} calculated`);
    } catch (error) {
      // Keep the epochs already written to disk (CI commits them); stop before creating a gap
      // in the distribution window, which would otherwise make the sum below throw.
      logger.error(`Failed to calculate reward epoch ${epoch}: ${error as string}`);
      backfillComplete = false;
      break;
    }
  }

  // === 2. Distribution sum ===
  // Per-epoch data is persisted (and committed by CI) before this point, so a failure summing
  // can never discard a freshly calculated epoch.
  if (!backfillComplete) {
    logger.error(`Skipping sum for epochs ${firstEpoch}-${distributionEpoch} due to backfill failure`);
    return;
  }

  const summedFilePath = `generated-files/${network}/validator-rewards/epochs-${firstEpoch}-${distributionEpoch}.json`;
  if (fs.existsSync(summedFilePath)) {
    logger.info(`Payout for epochs ${firstEpoch}-${distributionEpoch} already exists, nothing to sum`);
    return;
  }

  try {
    logger.info(`^GSumming rewards for epochs ${firstEpoch}-${distributionEpoch}`);
    calculatingRewardsService.sumRewards(distributionEpoch, distributeEvery, network);
    logger.info(`^GPayout file written: ${summedFilePath}`);
  } catch (error) {
    logger.error(`Failed to sum rewards for epochs ${firstEpoch}-${distributionEpoch}: ${error as string}`);
  }
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

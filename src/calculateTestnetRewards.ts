#!/usr/bin/env node

import "dotenv/config";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
import { ContractService } from "./services/ContractService";
import { CalculatingRewardsService } from "./services/CalculatingRewardsService";

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */
const yargs = require("yargs");

const args = yargs
  .option("config", {
    alias: "c",
    type: "string",
    description: "The path to json config file with network information",
    default: "configs/networks/coston2.json",
  })
  .option("rewardEpoch", { alias: "e", type: "number", description: "Reward epoch to calculate rewards for" })
  .option("uptimeVotigPeriodLength", {
    alias: "l",
    type: "number",
    description: "Length of voting period (which starts at the end of reward epoch) for reward epoch uptime",
  })
  .option("batchSize", { alias: "b", type: "number", description: "Batch size for blocks to process events" })
  .option("rps", { alias: "r", type: "number", description: "Request per second" })
  .option("uptimeVotingThreshold", {
    alias: "t",
    type: "number",
    description: "Required number of votes for uptime to be considered high enough",
  })
  .option("apiPath", { alias: "y", type: "string", description: "Api for validators and delegators" })
  .option("boostingFactor", {
    alias: "f",
    type: "number",
    description: "Boosting factor (for calculating boost amount)",
  })
  .option("votePowerCapBIPS", { alias: "v", type: "number", description: "Cap vote power to x% of total stake amount" })
  .option("minForBEBGwei", {
    alias: "m",
    type: "string",
    description: "Minimal amount (in gwei) of total self-bond to be eligible for boosting",
  })
  .option("rewardAmountEpochWei", {
    alias: "a",
    type: "string",
    description: "Reward amount (in wei) to be distributed per reward epoch",
  }).argv;

process.env.CONFIG_FILE = args["config"] as string;

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runCalculateTestnetRewards() {
  await contractService.waitForInitialization();
  const rewardEpoch = args["rewardEpoch"] ? (args["rewardEpoch"] as number) : configurationService.rewardEpoch;
  const uptimeVotigPeriodLengthSeconds = args["uptimeVotigPeriodLength"]
    ? (args["uptimeVotigPeriodLength"] as number)
    : configurationService.uptimeVotigPeriodLengthSeconds;
  const batchSize = args["batchSize"] ? (args["batchSize"] as number) : configurationService.maxBlocksForEventReads;
  const rps = args["rps"] ? (args["rps"] as number) : (configurationService.maxRequestsPerSecond as number);
  const uptimeVotingThreshold =
    args["uptimeVotingThreshold"] !== undefined
      ? (args["uptimeVotingThreshold"] as number)
      : configurationService.uptimeVotingThreshold;
  const apiPath = args["apiPath"]
    ? (args["apiPath"] as string)
    : (process.env.API_PATH ?? configurationService.apiPath);
  if (apiPath === undefined) throw new Error("apiPath must be provided via -y flag, API_PATH env var, or config file");
  const boostingFactor = args["boostingFactor"]
    ? (args["boostingFactor"] as number)
    : configurationService.boostingFactor;
  const votePowerCapBIPS = args["votePowerCapBIPS"]
    ? (args["votePowerCapBIPS"] as number)
    : configurationService.votePowerCapBIPS;
  const minForBEBGwei = args["minForBEBGwei"] ? (args["minForBEBGwei"] as string) : configurationService.minForBEBGwei;
  const rewardAmountEpochWei = args["rewardAmountEpochWei"]
    ? (args["rewardAmountEpochWei"] as string)
    : configurationService.rewardAmountEpochWei;

  await calculatingRewardsService.calculateTestnetRewards(
    rewardEpoch,
    uptimeVotigPeriodLengthSeconds,
    rps,
    batchSize,
    uptimeVotingThreshold,
    apiPath,
    boostingFactor,
    minForBEBGwei,
    votePowerCapBIPS,
    rewardAmountEpochWei
  );
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

runCalculateTestnetRewards()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

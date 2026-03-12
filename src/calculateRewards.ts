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
    default: "configs/networks/flare.json",
  })
  .option("rewardEpoch", { alias: "e", type: "number", description: "Reward epoch to calculate rewards for" })
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
  })
  .option("rps", { alias: "r", type: "number", description: "Request per second" }).argv;

process.env.CONFIG_FILE = args["config"] as string;

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runCalculateRewards() {
  await contractService.waitForInitialization();
  const rewardEpoch = args["rewardEpoch"] ? (args["rewardEpoch"] as number) : configurationService.rewardEpoch;
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
  const rps = args["rps"] ? (args["rps"] as number) : (configurationService.maxRequestsPerSecond as number);

  await calculatingRewardsService.calculateRewards(
    rewardEpoch,
    boostingFactor,
    minForBEBGwei,
    votePowerCapBIPS,
    rewardAmountEpochWei,
    rps
  );
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

runCalculateRewards()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

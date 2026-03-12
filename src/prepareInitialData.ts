#!/usr/bin/env node

import "dotenv/config";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
import { ContractService } from "./services/ContractService";
import { CalculatingRewardsService } from "./services/CalculatingRewardsService";

const yargs = require("yargs");

const args = yargs
  .option("config", {
    alias: "c",
    type: "string",
    description: "The path to json config file with network information",
    default: "configs/networks/flare.json",
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
  .option("apiPath", { alias: "y", type: "string", description: "Api for validators and delegators" }).argv;

process.env.CONFIG_FILE = args["config"];

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runPrepareInitialData() {
  await contractService.waitForInitialization();
  const rewardEpoch = args["rewardEpoch"] ? args["rewardEpoch"] : configurationService.rewardEpoch;
  const uptimeVotigPeriodLengthSeconds = args["uptimeVotigPeriodLengthSeconds"]
    ? args["uptimeVotigPeriodLengthSeconds"]
    : configurationService.uptimeVotigPeriodLengthSeconds;
  const batchSize = args["batchSize"] ? args["batchSize"] : configurationService.maxBlocksForEventReads;
  const rps = args["rps"] ? args["rps"] : configurationService.maxRequestsPerSecond;
  const uptimeVotingThreshold = args["uptimeVotingThreshold"]
    ? args["uptimeVotingThreshold"]
    : configurationService.uptimeVotingThreshold;
  const apiPath = args["apiPath"] ? args["apiPath"] : configurationService.apiPath;

  await calculatingRewardsService.prepareInitialData(
    rewardEpoch,
    uptimeVotigPeriodLengthSeconds,
    rps,
    batchSize,
    uptimeVotingThreshold,
    apiPath
  );
}

runPrepareInitialData()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

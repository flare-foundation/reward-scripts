#!/usr/bin/env node

import "dotenv/config";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
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
  .option("numEpochs", { alias: "n", type: "number", description: "Number of reward epochs for which to sum rewards" })
  .option("lastEpoch", {
    alias: "l",
    type: "number",
    description: "Last reward epoch to use for summing rewards",
  }).argv;

process.env.CONFIG_FILE = args["config"] as string;

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);

try {
  const lastRewardEpoch = args["lastEpoch"] ? (args["lastEpoch"] as number) : configurationService.rewardEpoch;
  const numEpochs = args["numEpochs"] ? (args["numEpochs"] as number) : configurationService.numEpochs;
  /* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

  calculatingRewardsService.sumRewards(lastRewardEpoch, numEpochs);
  process.exit(0);
} catch (error) {
  console.error(error);
  process.exit(1);
}

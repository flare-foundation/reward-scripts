#!/usr/bin/env node

import "dotenv/config";
import * as fs from "fs";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
import { ContractService } from "./services/ContractService";
import { CalculatingRewardsService } from "./services/CalculatingRewardsService";
import { DataValidatorRewardManager } from "./utils/interfaces";
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

async function run() {
  const logger = getGlobalLogger("auto-rewards");
  await contractService.waitForInitialization();

  const flareSystemsManager = await contractService.flareSystemsManager();
  const currentEpoch = parseInt(await flareSystemsManager.methods.getCurrentRewardEpoch().call());
  const rewardEpoch = currentEpoch - 1;

  const network = configurationService.network;
  const generatedFilesPath = `calculated-files/${network}/reward-epoch-${rewardEpoch}`;

  // check if already processed
  if (fs.existsSync(`${generatedFilesPath}/data.json`)) {
    logger.info(`Epoch ${rewardEpoch} already processed, skipping`);
    return;
  }

  logger.info(`^GProcessing reward epoch ${rewardEpoch}`);

  // calculate rewards
  const rps = configurationService.maxRequestsPerSecond as number;
  await calculatingRewardsService.calculateTestnetRewards(
    rewardEpoch,
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

  logger.info(`^GReward epoch ${rewardEpoch} calculated`);

  // check if this is a distribution epoch
  if (rewardEpoch % distributeEvery !== 0) {
    logger.info(`Epoch ${rewardEpoch} is not a distribution epoch (every ${distributeEvery}), skipping distribution`);
    return;
  }

  // sum rewards across last N epochs
  logger.info(`^GSumming rewards for epochs ${rewardEpoch - distributeEvery + 1}-${rewardEpoch}`);
  calculatingRewardsService.sumRewards(rewardEpoch, distributeEvery);

  // distribute on-chain
  const privateKey = process.env.DISTRIBUTOR_PRIVATE_KEY;
  if (!privateKey) {
    logger.error("DISTRIBUTOR_PRIVATE_KEY not set, skipping on-chain distribution");
    return;
  }

  const summedFilePath = `generated-files/validator-rewards/epochs-${rewardEpoch - distributeEvery + 1}-${rewardEpoch}.json`;
  const summedData = JSON.parse(fs.readFileSync(summedFilePath, "utf8")) as DataValidatorRewardManager;

  const totalAddresses = summedData.addresses.length;
  const maxPerTx = 250;
  const numTxs = Math.ceil(totalAddresses / maxPerTx);
  logger.info(`^GDistributing rewards to ${totalAddresses} addresses in ${numTxs} transaction(s)`);

  const web3 = contractService.web3;
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(account);

  const validatorRewardManager = await contractService.validatorRewardManager();

  for (let i = 0; i < numTxs; i++) {
    const start = i * maxPerTx;
    const end = Math.min(start + maxPerTx, totalAddresses);
    const addresses = summedData.addresses.slice(start, end);
    const amounts = summedData.rewardAmounts.slice(start, end);

    logger.info(`^GSending tx ${i + 1}/${numTxs} (${addresses.length} addresses)`);
    const tx = validatorRewardManager.methods.distributeRewards(addresses, amounts);
    const gas = await tx.estimateGas({ from: account.address });
    const receipt = await tx.send({ from: account.address, gas });
    logger.info(`^GTx ${i + 1}/${numTxs} confirmed: ${receipt.transactionHash as string}`);
  }
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

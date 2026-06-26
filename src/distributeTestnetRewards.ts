#!/usr/bin/env node

import "dotenv/config";
import * as fs from "fs";
import { iocContainer } from "./ioc";
import { ConfigurationService } from "./services/ConfigurationService";
import { ContractService } from "./services/ContractService";
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

const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);
const distributeEvery = args["distributeEvery"] as number;

interface DistributionEntry {
  window: string;
  distributionEpoch: number;
  addresses: string[];
  rewardAmounts: string[];
  txHashes: string[];
  timestamp: number;
  note?: string;
}
interface DistributionRecord {
  distributions: DistributionEntry[];
}

function readDistributions(path: string): DistributionRecord {
  if (!fs.existsSync(path)) return { distributions: [] };
  return JSON.parse(fs.readFileSync(path, "utf8")) as DistributionRecord;
}

// Distributes the current distribution window on-chain, but only if its payout file already
// exists (i.e. was produced and committed by the auto step) and it has not been distributed
// before. The committed distributions file is the idempotency guard: the public RPC caps
// getPastEvents at 30 blocks, so scanning RewardsDistributed events to detect prior payouts
// is not feasible.
async function run() {
  const logger = getGlobalLogger("distribute-rewards");
  await contractService.waitForInitialization();

  const flareSystemsManager = await contractService.flareSystemsManager();
  const currentEpoch = parseInt(await flareSystemsManager.methods.getCurrentRewardEpoch().call());
  const targetEpoch = currentEpoch - 1;

  const network = configurationService.network;
  const distributionEpoch = targetEpoch - (targetEpoch % distributeEvery);
  const firstEpoch = distributionEpoch - distributeEvery + 1;
  const window = `${firstEpoch}-${distributionEpoch}`;

  const payoutDir = `generated-files/${network}/validator-rewards`;
  const summedFilePath = `${payoutDir}/epochs-${window}.json`;
  const distributionsPath = `${payoutDir}/distributions.json`;

  // First run after deploy: the previous pipeline (legacy automated distribution plus the
  // occasional manual payout) already paid every window up to now. Record all of those as
  // already paid so this forward-only distributor can never re-pay a window that predates the
  // distributions file. No funds move on this run; distribution begins with the next new window.
  if (!fs.existsSync(distributionsPath)) {
    const seeded: DistributionRecord = { distributions: [] };
    const startEpoch = configurationService.rewardEpoch ?? distributionEpoch;
    const firstDist = Math.ceil(startEpoch / distributeEvery) * distributeEvery;
    for (let d = firstDist; d <= distributionEpoch; d += distributeEvery) {
      seeded.distributions.push({
        window: `${d - distributeEvery + 1}-${d}`,
        distributionEpoch: d,
        addresses: [],
        rewardAmounts: [],
        txHashes: [],
        timestamp: Date.now(),
        note: "already paid by previous automated/manual distribution; not re-distributed",
      });
    }
    fs.mkdirSync(payoutDir, { recursive: true });
    fs.writeFileSync(distributionsPath, JSON.stringify(seeded, null, 2), "utf8");
    logger.info(
      `^GInitialized distributions through epochs ...-${distributionEpoch} (${seeded.distributions.length} windows); no distribution on first run`
    );
    return;
  }

  if (!fs.existsSync(summedFilePath)) {
    logger.info(`No committed payout for epochs ${window}, nothing to distribute`);
    return;
  }

  const distributions = readDistributions(distributionsPath);
  if (distributions.distributions.some((d) => d.window === window)) {
    logger.info(`Epochs ${window} already distributed, skipping`);
    return;
  }

  const privateKey = process.env.DISTRIBUTOR_PRIVATE_KEY;
  if (!privateKey) {
    logger.info("DISTRIBUTOR_PRIVATE_KEY not set, skipping on-chain distribution");
    return;
  }

  const summedData = JSON.parse(fs.readFileSync(summedFilePath, "utf8")) as DataValidatorRewardManager;
  const totalAddresses = summedData.addresses.length;
  const maxPerTx = 250;
  const numTxs = Math.ceil(totalAddresses / maxPerTx);
  logger.info(`^GDistributing rewards for epochs ${window} to ${totalAddresses} addresses in ${numTxs} transaction(s)`);

  const web3 = contractService.web3;
  const account = web3.eth.accounts.privateKeyToAccount(privateKey);
  web3.eth.accounts.wallet.add(account);

  const validatorRewardManager = await contractService.validatorRewardManager();

  const txHashes: string[] = [];
  for (let i = 0; i < numTxs; i++) {
    const start = i * maxPerTx;
    const end = Math.min(start + maxPerTx, totalAddresses);
    const addresses = summedData.addresses.slice(start, end);
    const amounts = summedData.rewardAmounts.slice(start, end);

    logger.info(`^GSending tx ${i + 1}/${numTxs} (${addresses.length} addresses)`);
    const tx = validatorRewardManager.methods.distributeRewards(addresses, amounts);
    const gas = await tx.estimateGas({ from: account.address });
    const receipt = await tx.send({ from: account.address, gas });
    const txHash = receipt.transactionHash as string;
    txHashes.push(txHash);
    logger.info(`^GTx ${i + 1}/${numTxs} confirmed: ${txHash}`);
  }

  // Record the payout so the next run skips this window on the strength of it.
  // (On coston2 the address set fits in a single tx, so this is written once after one tx.)
  distributions.distributions.push({
    window,
    distributionEpoch,
    addresses: summedData.addresses,
    rewardAmounts: summedData.rewardAmounts,
    txHashes,
    timestamp: Date.now(),
  });
  fs.writeFileSync(distributionsPath, JSON.stringify(distributions, null, 2), "utf8");
  logger.info(`^GDistribution for epochs ${window} complete: ${txHashes.join(", ")}`);
}
/* eslint-enable @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access */

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

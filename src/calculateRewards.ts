#!/usr/bin/env node

import dotenv from 'dotenv';
import { iocContainer } from './ioc';
import { ConfigurationService } from './services/ConfigurationService';
import { ContractService } from './services/ContractService';
import { CalculatingRewardsService } from './services/CalculatingRewardsService';

// initialize configuration
dotenv.config();

let yargs = require('yargs');

let args = yargs
   .option('config', {
      alias: 'c',
      type: 'string',
      description: 'The path to json config file with network information',
      default: 'configs/networks/flare.json',
   })
   .option('rewardEpoch', { alias: 'e', type: 'number', description: 'Reward epoch to calculate rewards for' })
   .option('boostingFactor', { alias: 'f', type: 'number', description: 'Boosting factor (for calculating boost amount)' })
   .option('votePowerCapBIPS', { alias: 'v', type: 'number', description: 'Cap vote power to x% of total stake amount' })
   .option('minForBEBGwei', { alias: 'm', type: 'string', description: 'Minimal amount (in gwei) of total self-bond to be eligible for boosting' })
   .option('rewardAmountEpochWei', { alias: 'a', type: 'string', description: 'Reward amount (in wei) to be distributed per reward epoch' })
   .option('rps', { alias: 'r', type: 'number', description: 'Request per second' })
   .argv;

process.env.CONFIG_FILE = args['config'];

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runCalculateRewards() {
   await contractService.waitForInitialization();
   const rewardEpoch = args['rewardEpoch'] ? args['rewardEpoch'] : configurationService.rewardEpoch;
   const boostingFactor = args['boostingFactor'] ? args['boostingFactor'] : configurationService.boostingFactor;
   const votePowerCapBIPS = args['votePowerCapBIPS'] ? args['votePowerCapBIPS'] : configurationService.votePowerCapBIPS;
   const minForBEBGwei = args['minForBEBGwei'] ? args['minForBEBGwei'] : configurationService.minForBEBGwei;
   const rewardAmountEpochWei = args['rewardAmountEpochWei'] ? args['rewardAmountEpochWei'] : configurationService.rewardAmountEpochWei;
   const rps = args['rps'] ? args['rps'] : configurationService.maxRequestsPerSecond;

   await calculatingRewardsService.calculateRewards(rewardEpoch, boostingFactor, minForBEBGwei, votePowerCapBIPS, rewardAmountEpochWei, rps);
}

runCalculateRewards()
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

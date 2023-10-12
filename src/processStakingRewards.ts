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
   .option('firstEpoch', { alias: 'f', type: 'number', description: 'First reward epoch to calculate rewards for' })
   .option('ftsoPerformanceWei', { alias: 'p', type: 'string', description: 'Required FTSO performance (received FTSO rewards in wei) for the node to be eligible for staking rewards. Performance should be strictly greater than ftsoPerformance' })
   .option('boostingFactor', { alias: 'b', type: 'number', description: 'Boosting factor (for calculating boost amount)' })
   .option('votePowerCapBIPS', { alias: 'v', type: 'number', description: 'Cap vote power to x% of total stake amount' })
   .option('numUnrewardedEpochs', { alias: 'u', type: 'number', description: 'Number of reward epochs for which validators and delegators were not yet rewarded' })
   .option('uptimeVotigPeriodLength', { alias: 'l', type: 'number', description: 'Length of voting period (which starts at the end of reward epoch) for reward epoch uptime' })
   .option('batchSize', { alias: 'b', type: 'number', description: 'Batch size for blocks to process events' })
   .option('rps', { alias: 'r', type: 'number', description: 'Request per second' })
   .option('uptimeVotingThreshold', { alias: 't', type: 'number', description: 'Required number of votes for uptime to be considered high enough' })
   .option('minForBEBGwei', { alias: 'm', type: 'string', description: 'Minimal amount (in gwei) of total self-bond to be eligible for boosting' })
   .option('rewardAmountEpochWei', { alias: 'a', type: 'string', description: 'Reward amount (in wei) to be distributed per reward epoch' })
   .option('apiPath', { alias: 'y', type: 'string', description: 'Api for validators and delegators' })
   .argv;


process.env.CONFIG_FILE = args['config'];

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runProcessCalculateRewards() {
   await contractService.waitForInitialization();
   let firstRewardEpoch = args['firstEpoch'] ? args['firstEpoch'] : configurationService.firstRewardEpoch;
   let requiredFtsoPerformanceWei = args['ftsoPerformanceWei'] ? args['ftsoPerformanceWei'] : configurationService.requiredFtsoPerformanceWei;
   let boostingFactor = args['boostingFactor'] ? args['boostingFactor'] : configurationService.boostingFactor;
   let votePowerCapBIPS = args['votePowerCapBIPS'] ? args['votePowerCapBIPS'] : configurationService.votePowerCapBIPS;
   let numUnrewardedEpochs = args['numUnrewardedEpochs'] ? args['numUnrewardedEpochs'] : configurationService.numUnrewardedEpochs;
   let uptimeVotigPeriodLengthSeconds = args['uptimeVotigPeriodLengthSeconds'] ? args['uptimeVotigPeriodLengthSeconds'] : configurationService.uptimeVotigPeriodLengthSeconds;
   let batchSize = args['batchSize'] ? args['batchSize'] : configurationService.maxBlocksForEventReads;
   let rps = args['rps'] ? args['rps'] : configurationService.maxRequestsPerSecond;
   let uptimeVotingThreshold = args['uptimeVotingThreshold'] ? args['uptimeVotingThreshold'] : configurationService.uptimeVotingThreshold;
   let minForBEBGwei = args['minForBEBGwei'] ? args['minForBEBGwei'] : configurationService.minForBEBGwei;
   let rewardAmountEpochWei = args['rewardAmountEpochWei'] ? args['rewardAmountEpochWei'] : configurationService.rewardAmountEpochWei;
   let apiPath = args['apiPath'] ? args['apiPath'] : configurationService.apiPath;

   await calculatingRewardsService.calculateRewards(firstRewardEpoch, requiredFtsoPerformanceWei, boostingFactor, votePowerCapBIPS, numUnrewardedEpochs, uptimeVotigPeriodLengthSeconds, rps, batchSize, uptimeVotingThreshold, minForBEBGwei,rewardAmountEpochWei, apiPath);
}

runProcessCalculateRewards()
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

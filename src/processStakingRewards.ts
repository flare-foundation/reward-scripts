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
   .option('lastEpoch', { alias: 'l', type: 'number', description: 'Last reward epoch to calculate rewards for' })
   .option('uptime', { alias: 'u', type: 'number', description: 'Required uptime for the node to be eligible for staking rewards' })
   .option('ftsoPerformance', { alias: 'p', type: 'number', description: 'Required FTSO performance (received FTSO rewards) for the node to be eligible for staking rewards. Performance should be strictly greater than ftsoPerformance' })
   .option('boostingFactor', { alias: 's', type: 'number', description: 'Boosting factor (for calculating boost amount)' })
   .option('votePowerCap', { alias: 'v', type: 'number', description: 'Cap vote power to x% of total stake amount' })
   .option('minVirtualSelfBond', { alias: 'm', type: 'number', description: 'Minimal virtual self bond needed to be eligible for rewards' })
   .option('numUnrewardedEpochs', { alias: 'e', type: 'number', description: 'Number of reward epochs for which validators and delegators were not yet rewarded' })
   .option('uptimeVotigPeriodLength', { alias: 'l', type: 'number', description: 'Length of voting period (which starts at the end of reward epoch) for reward epoch uptime' })
   .option('batchSize', { alias: 'b', type: 'number', description: 'Batch size for blocks to process events' })
   .option('rps', { alias: 'r', type: 'number', description: 'Request per second' })
   .option('uptimeVotingThreshold', { alias: 't', type: 'number', description: 'Required number of votes for uptime to be considered high enough' })
   .option('minForBEB', { alias: 'x', type: 'number', description: 'Minimal amount of delegations/self-bond to be eligible for boosting' })
   .option('defaultFee', { alias: 'd', type: 'number', description: 'Default fee (for group 1 nodes)' })
   .option('rewardAmount', { alias: 'a', type: 'number', description: 'Reward amount to be distributed' })
   .option('apiPath', { alias: 'y', type: 'string', description: 'Api for validators and delegators' })
   .argv;


process.env.CONFIG_FILE = args['config'];

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);
const contractService = iocContainer(null).get(ContractService);

async function runProcessCalculateRewards() {
   await contractService.waitForInitialization();
   let firstRewardEpoch = args['firstEpoch'] ? args['firstEpoch'] : configurationService.firstRewardEpoch;
   let requiredFtsoPerformance = args['ftsoPerformance'] ? args['ftsoPerformance'] : configurationService.requiredFtsoPerformance;
   let boostingFactor = args['boostingFactor'] ? args['boostingFactor'] : configurationService.boostingFactor;
   let votePowerCap = args['votePowerCap'] ? args['votePowerCap'] : configurationService.votePowerCap;
   let numUnrewardedEpochs = args['numUnrewardedEpochs'] ? args['numUnrewardedEpochs'] : configurationService.numUnrewardedEpochs;
   let uptimeVotigPeriodLength = args['uptimeVotigPeriodLength'] ? args['uptimeVotigPeriodLength'] : configurationService.uptimeVotigPeriodLength;
   let batchSize = args['batchSize'] ? args['batchSize'] : configurationService.maxBlocksForEventReads;
   let rps = args['rps'] ? args['rps'] : configurationService.maxRequestsPerSecond;
   let uptimeVotingThreshold = args['uptimeVotingThreshold'] ? args['uptimeVotingThreshold'] : configurationService.uptimeVotingThreshold;
   let minForBEB = args['minForBEB'] ? args['minForBEB'] : configurationService.minForBEB;
   let defaultFee = args['defaultFee'] ? args['defaultFee'] : configurationService.defaultFee;
   let rewardAmount = args['rewardAmount'] ? args['rewardAmount'] : configurationService.rewardAmount;
   let apiPath = args['apiPath'] ? args['apiPath'] : configurationService.apiPath;

   await calculatingRewardsService.calculateRewards(firstRewardEpoch, requiredFtsoPerformance, boostingFactor, votePowerCap, numUnrewardedEpochs, uptimeVotigPeriodLength, rps, batchSize, uptimeVotingThreshold, minForBEB, defaultFee, rewardAmount, apiPath);
}

runProcessCalculateRewards()
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

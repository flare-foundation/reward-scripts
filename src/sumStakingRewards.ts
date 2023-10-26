#!/usr/bin/env node

import dotenv from 'dotenv';
import { iocContainer } from './ioc';
import { ConfigurationService } from './services/ConfigurationService';
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
   .option('numEpochs', { alias: 'n', type: 'number', description: 'Number of reward epochs for which to sum rewards' })
   .option('lastEpoch', { alias: 'l', type: 'number', description: 'Last reward epoch to use for summing rewards' })
   .argv;

process.env.CONFIG_FILE = args['config'];

const calculatingRewardsService = iocContainer(null).get(CalculatingRewardsService);
const configurationService = iocContainer(null).get(ConfigurationService);

async function runProcessSumRewards() {
   let lastRewardEpoch = args['lastEpoch'] ? args['lastEpoch'] : configurationService.rewardEpoch;
   let numEpochs = args['numEpochs'] ? args['numEpochs'] : configurationService.numEpochs;

   await calculatingRewardsService.sumRewards(lastRewardEpoch, numEpochs);
}

runProcessSumRewards()
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

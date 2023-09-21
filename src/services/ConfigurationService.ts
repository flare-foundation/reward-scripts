import { Factory, Inject, Singleton } from 'typescript-ioc';
import { readJSON } from '../utils/config-utils';
import { INetworkConfigJson } from '../utils/interfaces';
import { logException } from '../logger/logger';
import { config } from 'dotenv';

@Singleton
@Factory(() => new ConfigurationService())
export class ConfigurationService {

   network: string;
   networkRPC: string;
   maxBlocksForEventReads: number;
   maxRequestsPerSecond: number | string;
   firstRewardEpoch: number;
   requiredFtsoPerformance: number;
   boostingFactor: number;
   votePowerCap: number;
   numUnrewardedEpochs: number;
   uptimeVotigPeriodLength: number;
   uptimeVotingThreshold: number;
   minForBEB: number;
   defaultFee: number;
   rewardAmount: number;

   constructor() {
      if (process.env.CONFIG_FILE) {
         let configFile: INetworkConfigJson;
         try{
            configFile = readJSON<INetworkConfigJson>(process.env.CONFIG_FILE);
         }
         catch (error){
            logException(error, `ConfigFile doesn't exist`);
            configFile = {} as INetworkConfigJson;
         }

         this.network = configFile.NETWORK ? configFile.NETWORK : "flare";
         this.networkRPC = configFile.RPC ? configFile.RPC : "https://flare-api.flare.network/ext/C/rpc";
         this.maxBlocksForEventReads = configFile.MAX_BLOCKS_FOR_EVENT_READS ? configFile.MAX_BLOCKS_FOR_EVENT_READS : 30;
         this.maxRequestsPerSecond = configFile.MAX_REQUESTS_PER_SECOND ? configFile.MAX_REQUESTS_PER_SECOND : 3;
         this.firstRewardEpoch = configFile.FIRST_REWARD_EPOCH ? configFile.FIRST_REWARD_EPOCH : 50;
         this.requiredFtsoPerformance = configFile.REQUIRED_FTSO_PERFORMANCE ? configFile.REQUIRED_FTSO_PERFORMANCE : 0;
         this.boostingFactor = configFile.BOOSTING_FACTOR ? configFile.BOOSTING_FACTOR : 2;
         this.votePowerCap = configFile.VOTE_POWER_CAP ? configFile.VOTE_POWER_CAP : 500;
         this.numUnrewardedEpochs = configFile.NUM_UNREWARDED_EPOCHS ? configFile.NUM_UNREWARDED_EPOCHS : 1;
         this.uptimeVotigPeriodLength = configFile.UPTIME_VOTING_PERIOD_LENGTH ? configFile.UPTIME_VOTING_PERIOD_LENGTH : 600;
         this.uptimeVotingThreshold = configFile.UPTIME_VOTING_THRESHOLD ? configFile.UPTIME_VOTING_THRESHOLD : undefined;
         this.minForBEB = configFile.MIN_FOR_BEB ? configFile.MIN_FOR_BEB : 1e6;
         this.defaultFee = configFile.DEFAULT_FEE ? configFile.DEFAULT_FEE : 200000;
         this.rewardAmount = configFile.REWARD_AMOUNT ? configFile.REWARD_AMOUNT : undefined;
      }
   }

}

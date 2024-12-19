import { Factory, Inject, Singleton } from 'typescript-ioc';
import { readJSON } from '../utils/config-utils';
import { INetworkConfigJson } from '../utils/interfaces';
import { logException } from '../logger/logger';

@Singleton
@Factory(() => new ConfigurationService())
export class ConfigurationService {

   network: string;
   networkRPC: string;
   maxBlocksForEventReads: number;
   maxRequestsPerSecond: number | string;
   rewardEpoch: number;
   requiredFtsoPerformanceWei: string;
   boostingFactor: number;
   votePowerCapBIPS: number;
   numUnrewardedEpochs: number;
   uptimeVotigPeriodLengthSeconds: number;
   uptimeVotingThreshold: number;
   minForBEBGwei: string;
   defaultFeePPM: number;
   rewardAmountEpochWei: string;
   apiPath: string;
   numEpochs: number;

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
         this.rewardEpoch = configFile.REWARD_EPOCH ? configFile.REWARD_EPOCH : undefined;
         this.requiredFtsoPerformanceWei = configFile.REQUIRED_FTSO_PERFORMANCE_WEI ? configFile.REQUIRED_FTSO_PERFORMANCE_WEI : "0";
         this.boostingFactor = configFile.BOOSTING_FACTOR ? configFile.BOOSTING_FACTOR : 5;
         this.votePowerCapBIPS = configFile.VOTE_POWER_CAP_BIPS ? configFile.VOTE_POWER_CAP_BIPS : 500;
         this.uptimeVotigPeriodLengthSeconds = configFile.UPTIME_VOTING_PERIOD_LENGTH_SECONDS ? configFile.UPTIME_VOTING_PERIOD_LENGTH_SECONDS : 600;
         this.uptimeVotingThreshold = configFile.UPTIME_VOTING_THRESHOLD ? configFile.UPTIME_VOTING_THRESHOLD : undefined;
         this.minForBEBGwei = configFile.MIN_FOR_BEB_GWEI ? configFile.MIN_FOR_BEB_GWEI : "1000000000000000";
         this.rewardAmountEpochWei = configFile.REWARD_AMOUNT_EPOCH_WEI ? configFile.REWARD_AMOUNT_EPOCH_WEI : undefined;
         this.apiPath = configFile.API_PATH ? configFile.API_PATH : undefined;
         this.numEpochs = configFile.NUM_EPOCHS ? configFile.NUM_EPOCHS : 4;
      }
   }

}

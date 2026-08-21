import { Factory, Singleton } from "typescript-ioc";
import { readJSON } from "../utils/config-utils";
import { INetworkConfigJson } from "../utils/interfaces";
import { logException } from "../logger/logger";

// Unauthenticated, the p-chain indexer allows 60 requests/min — measured 2026-08-21: request 61
// refused with `Retry-After: 60`. A full delegator sweep is 100+ requests, so it needs its own
// pacing, well below the RPC's. Request latency adds to the sleep, so 1/s yields an effective
// ~0.85/s (~50 req/min) and stays under the limit. A keyed API_PATH_{NETWORK} lifts it: the same
// sweep ran 107 requests at 239 req/min with no 429.
const DEFAULT_INDEXER_REQUESTS_PER_SECOND = 1;

@Singleton
@Factory(() => new ConfigurationService())
export class ConfigurationService {
  network!: string;
  networkRPC!: string;
  maxBlocksForEventReads!: number;
  maxRequestsPerSecond!: number | string;
  indexerRequestsPerSecond!: number;
  rewardEpoch?: number;
  requiredFtsoPerformanceWei!: string;
  boostingFactor!: number;
  votePowerCapBIPS!: number;
  uptimeVotigPeriodLengthSeconds!: number;
  uptimeVotingThreshold?: number;
  minForBEBGwei!: string;
  rewardAmountEpochWei?: string;
  apiPath?: string;
  numEpochs!: number;

  constructor() {
    if (process.env.CONFIG_FILE) {
      let configFile: INetworkConfigJson;
      try {
        configFile = readJSON<INetworkConfigJson>(process.env.CONFIG_FILE);
      } catch (error) {
        logException(error, `ConfigFile doesn't exist`);
        configFile = {} as INetworkConfigJson;
      }

      this.network = configFile.NETWORK ?? "flare";
      const rpcOverride = process.env[`RPC_URL_${this.network.toUpperCase()}`];
      // Carries the indexer API key in the query string, same shape as the RPC override.
      const apiPathOverride = process.env[`API_PATH_${this.network.toUpperCase()}`];
      this.networkRPC = rpcOverride ?? configFile.RPC ?? "https://flare-api.flare.network/ext/C/rpc";
      this.maxBlocksForEventReads = configFile.MAX_BLOCKS_FOR_EVENT_READS ?? 30;
      this.maxRequestsPerSecond = rpcOverride ? "Infinity" : (configFile.MAX_REQUESTS_PER_SECOND ?? 3);
      // A keyed indexer path lifts the request limit, so pacing is unnecessary there. An explicit
      // INDEXER_REQUESTS_PER_SECOND wins over both, so the rate can be dialled back from CI
      // without a code change if the key's budget ever turns out to be finite after all.
      const indexerRps = Number(
        process.env.INDEXER_REQUESTS_PER_SECOND ??
          (apiPathOverride ? "Infinity" : configFile.INDEXER_REQUESTS_PER_SECOND) ??
          DEFAULT_INDEXER_REQUESTS_PER_SECOND
      );
      this.indexerRequestsPerSecond =
        Number.isNaN(indexerRps) || indexerRps <= 0 ? DEFAULT_INDEXER_REQUESTS_PER_SECOND : indexerRps;
      this.rewardEpoch = configFile.REWARD_EPOCH ?? undefined;
      this.requiredFtsoPerformanceWei = configFile.REQUIRED_FTSO_PERFORMANCE_WEI ?? "0";
      this.boostingFactor = configFile.BOOSTING_FACTOR ?? 5;
      this.votePowerCapBIPS = configFile.VOTE_POWER_CAP_BIPS ?? 500;
      this.uptimeVotigPeriodLengthSeconds = configFile.UPTIME_VOTING_PERIOD_LENGTH_SECONDS ?? 600;
      this.uptimeVotingThreshold = configFile.UPTIME_VOTING_THRESHOLD ?? undefined;
      this.minForBEBGwei = configFile.MIN_FOR_BEB_GWEI ?? "1000000000000000";
      this.rewardAmountEpochWei = configFile.REWARD_AMOUNT_EPOCH_WEI ?? undefined;
      this.apiPath = apiPathOverride ?? configFile.API_PATH ?? undefined;
      this.numEpochs = configFile.NUM_EPOCHS ? configFile.NUM_EPOCHS : 4;
    }
  }
}

export interface ContractDeploy {
   name: string;
   contractName: string;
   address: string;
   chainId?: number;
   abi?: any;
}
export interface ContractEventBatch {
   contractName: string;
   startBlock: number;
   endBlock: number;
   events: any[];
}
export interface NodeData {
   nodeID: string;
   inputAddresses: string[];
   weight: bigint;               // initial stake
   startTime: number;
   endTime: number;
   feePercentage?: number;       // in PPM
}

export interface DelegationData {
   nodeID: string;
   inputAddresses: string[];
   weight: bigint;
   startTime: number;
   endTime: number;
   txID: string;
}

export interface NodeInitialData {
   nodeId: string;
   bondingAddress: string;          // p-chain address that opened stake
   ftsoAddress: string;             // ftso (entity) address
   selfBond: bigint;                // initial stake
   pChainAddress: string[];           // p-chain address corresponding to validator (for group 2 it is same as bonding address)
   // used for self-delegations
   cChainAddress?: string           // c-chain address (used for rewarding) corresponding to p-chain address
   selfDelegations: bigint;         // delegations from validator to its node
   boost: bigint;                   // group 1: initial stake (self-bond) + FNL delegations; group 2: FNL delegations
   normalDelegations: bigint;       // normal delegations (i.e. excluding FNL delegations and self-delegations)
   boostDelegations: bigint;        // delegations made from boosting (FNl) addresses
   totalStakeAmount: bigint;        // group1: total weight = self-bond + self-delegations + (normal) delegations + boost
   // group2: total weight = self-delegations + (normal) delegations + boost
   delegators: DelegatorData[];     // data about normal delegators
   fee: number;                     // node's fee (in PPM)
   BEB: bigint;                     // boosting eligibility bond
   cappedWeight: bigint;            // capped weight for the purpose of distribution of reward amount between nodes
   stakeEnd: number;                // end time of node's stake
   nodeRewardAmount: bigint;        // reward amount for a node (distributed between validator and (normal) delegators)
   validatorRewardAmount: bigint;   // reward amount that validator receives
   totalSelfBond: bigint;           // group 1: self-delegations; group 2: initial stake (self-bond) + self-delegations
   nonEligibilityReason: string;    // reason why node is not eligible for reward
   ftsoName: string;                // name of an FTSO provider
   uptimeEligible: boolean;         // does node has high enough uptime to be considered for reward
}

export interface NodeData extends NodeInitialData {
   eligible: boolean;               // is node eligible for reward
   overboost: bigint;
   rewardingWeight: bigint;         // adjusted total weight (total stake amount) for the purpose of rewarding
}

export interface Entity {
   entityAddress: string;          // same as ftso address
   nodes: string[];
   totalStakeRewarding?: bigint;
   capFactor?: bigint;             // in BIPS
   totalSelfBond: bigint;
}

export interface DelegatorData {
   pAddress: string;
   cAddress?: string;
   amount: bigint;
   delegatorRewardAmount?: bigint;
}

export interface FtsoData {
   nodeId: string;
   ftsoAddress: string;
   ftsoName: string;
   firstEpoch: number;
}

export interface RewardsData {
   address: string;
   amount: bigint;
}

export interface RewardingPeriodData {
   recipients: RewardsData[],
   configFileData: ConfigFileData,
   stakingVotePowerBlock: number,
   stakingVPBlockTimestamp: number
}
export interface ConfigFileData {
   BOOSTING_FACTOR: number;
   VOTE_POWER_CAP_BIPS: number;
   UPTIME_VOTING_PERIOD_LENGTH_SECONDS: number;
   UPTIME_VOTING_THRESHOLD: number;
   MIN_FOR_BEB_GWEI: string;
   REWARD_AMOUNT_EPOCH_WEI: string;
   REWARD_EPOCH: number;
}

export interface DataValidatorRewardManager {
   addresses: string[]
   rewardAmounts: string[]
}

export interface UptimeVote {
   voter: string;
   nodeIds: string[];
}

export enum ClaimType {
   DIRECT,
   FEE,
   WNAT,
   MIRROR,
   CCHAIN,
 }
export interface IRewardClaim {
   beneficiary: string;
   amount: bigint;
   claimType: ClaimType;
   rewardEpochId: number;
 }
 export interface IRewardClaimWithProof {
   merkleProof: string[];
   body: IRewardClaim;
 }

// Config file exports
export interface INetworkConfigJson {
   NETWORK: string;
   RPC: string;
   MAX_BLOCKS_FOR_EVENT_READS?: number;
   MAX_REQUESTS_PER_SECOND?: number | string;
   REWARD_EPOCH: number;
   REQUIRED_FTSO_PERFORMANCE_WEI: string;
   BOOSTING_FACTOR: number;
   VOTE_POWER_CAP_BIPS: number;
   NUM_EPOCHS: number;
   UPTIME_VOTING_PERIOD_LENGTH_SECONDS: number;
   UPTIME_VOTING_THRESHOLD: number;
   MIN_FOR_BEB_GWEI: string;
   REWARD_AMOUNT_EPOCH_WEI: string;
   API_PATH: string;
}

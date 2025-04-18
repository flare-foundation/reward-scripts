/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */

import BN from "bn.js";
import { ContractOptions } from "web3-eth-contract";
import { EventLog } from "web3-core";
import { EventEmitter } from "events";
import {
  Callback,
  PayableTransactionObject,
  NonPayableTransactionObject,
  BlockType,
  ContractEventLog,
  BaseContract,
} from "./types";

interface EventOptions {
  filter?: object;
  fromBlock?: BlockType;
  topics?: string[];
}

export type ClosingExpiredRewardEpochFailed = ContractEventLog<{
  rewardEpochId: string;
  0: string;
}>;
export type GovernanceCallTimelocked = ContractEventLog<{
  selector: string;
  allowedAfterTimestamp: string;
  encodedCall: string;
  0: string;
  1: string;
  2: string;
}>;
export type GovernanceInitialised = ContractEventLog<{
  initialGovernance: string;
  0: string;
}>;
export type GovernedProductionModeEntered = ContractEventLog<{
  governanceSettings: string;
  0: string;
}>;
export type RandomAcquisitionStarted = ContractEventLog<{
  rewardEpochId: string;
  timestamp: string;
  0: string;
  1: string;
}>;
export type RewardEpochStarted = ContractEventLog<{
  rewardEpochId: string;
  startVotingRoundId: string;
  timestamp: string;
  0: string;
  1: string;
  2: string;
}>;
export type RewardsSigned = ContractEventLog<{
  rewardEpochId: string;
  signingPolicyAddress: string;
  voter: string;
  rewardsHash: string;
  noOfWeightBasedClaims: [string, string][];
  timestamp: string;
  thresholdReached: boolean;
  0: string;
  1: string;
  2: string;
  3: string;
  4: [string, string][];
  5: string;
  6: boolean;
}>;
export type SettingCleanUpBlockNumberFailed = ContractEventLog<{
  blockNumber: string;
  0: string;
}>;
export type SignUptimeVoteEnabled = ContractEventLog<{
  rewardEpochId: string;
  timestamp: string;
  0: string;
  1: string;
}>;
export type SigningPolicySigned = ContractEventLog<{
  rewardEpochId: string;
  signingPolicyAddress: string;
  voter: string;
  timestamp: string;
  thresholdReached: boolean;
  0: string;
  1: string;
  2: string;
  3: string;
  4: boolean;
}>;
export type TimelockedGovernanceCallCanceled = ContractEventLog<{
  selector: string;
  timestamp: string;
  0: string;
  1: string;
}>;
export type TimelockedGovernanceCallExecuted = ContractEventLog<{
  selector: string;
  timestamp: string;
  0: string;
  1: string;
}>;
export type TriggeringVoterRegistrationFailed = ContractEventLog<{
  rewardEpochId: string;
  0: string;
}>;
export type UptimeVoteSigned = ContractEventLog<{
  rewardEpochId: string;
  signingPolicyAddress: string;
  voter: string;
  uptimeVoteHash: string;
  timestamp: string;
  thresholdReached: boolean;
  0: string;
  1: string;
  2: string;
  3: string;
  4: string;
  5: boolean;
}>;
export type UptimeVoteSubmitted = ContractEventLog<{
  rewardEpochId: string;
  signingPolicyAddress: string;
  voter: string;
  nodeIds: string[];
  timestamp: string;
  0: string;
  1: string;
  2: string;
  3: string[];
  4: string;
}>;
export type VotePowerBlockSelected = ContractEventLog<{
  rewardEpochId: string;
  votePowerBlock: string;
  timestamp: string;
  0: string;
  1: string;
  2: string;
}>;

export interface FlareSystemsManager extends BaseContract {
  constructor(
    jsonInterface: any[],
    address?: string,
    options?: ContractOptions
  ): FlareSystemsManager;
  clone(): FlareSystemsManager;
  methods: {
    cancelGovernanceCall(
      _selector: string | number[]
    ): NonPayableTransactionObject<void>;

    cleanupBlockNumberManager(): NonPayableTransactionObject<string>;

    currentRewardEpochExpectedEndTs(): NonPayableTransactionObject<string>;

    daemonize(): NonPayableTransactionObject<boolean>;

    executeGovernanceCall(
      _selector: string | number[]
    ): NonPayableTransactionObject<void>;

    firstRewardEpochStartTs(): NonPayableTransactionObject<string>;

    firstVotingRoundStartTs(): NonPayableTransactionObject<string>;

    flareDaemon(): NonPayableTransactionObject<string>;

    getAddressUpdater(): NonPayableTransactionObject<string>;

    getContractName(): NonPayableTransactionObject<string>;

    getCurrentRewardEpoch(): NonPayableTransactionObject<string>;

    getCurrentRewardEpochId(): NonPayableTransactionObject<string>;

    getCurrentVotingEpochId(): NonPayableTransactionObject<string>;

    getRandomAcquisitionInfo(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _randomAcquisitionStartTs: string;
      _randomAcquisitionStartBlock: string;
      _randomAcquisitionEndTs: string;
      _randomAcquisitionEndBlock: string;
      0: string;
      1: string;
      2: string;
      3: string;
    }>;

    getRewardEpochStartInfo(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _rewardEpochStartTs: string;
      _rewardEpochStartBlock: string;
      0: string;
      1: string;
    }>;

    getRewardEpochSwitchoverTriggerContracts(): NonPayableTransactionObject<
      string[]
    >;

    getRewardsSignInfo(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _rewardsSignStartTs: string;
      _rewardsSignStartBlock: string;
      _rewardsSignEndTs: string;
      _rewardsSignEndBlock: string;
      0: string;
      1: string;
      2: string;
      3: string;
    }>;

    getSeed(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    getSigningPolicySignInfo(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _signingPolicySignStartTs: string;
      _signingPolicySignStartBlock: string;
      _signingPolicySignEndTs: string;
      _signingPolicySignEndBlock: string;
      0: string;
      1: string;
      2: string;
      3: string;
    }>;

    getStartVotingRoundId(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    getThreshold(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    getUptimeVoteSignStartInfo(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _uptimeVoteSignStartTs: string;
      _uptimeVoteSignStartBlock: string;
      0: string;
      1: string;
    }>;

    getVotePowerBlock(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    getVoterRegistrationData(
      _rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<{
      _votePowerBlock: string;
      _enabled: boolean;
      0: string;
      1: boolean;
    }>;

    getVoterRewardsSignInfo(
      _rewardEpochId: number | string | BN,
      _voter: string
    ): NonPayableTransactionObject<{
      _rewardsSignTs: string;
      _rewardsSignBlock: string;
      0: string;
      1: string;
    }>;

    getVoterSigningPolicySignInfo(
      _rewardEpochId: number | string | BN,
      _voter: string
    ): NonPayableTransactionObject<{
      _signingPolicySignTs: string;
      _signingPolicySignBlock: string;
      0: string;
      1: string;
    }>;

    getVoterUptimeVoteSignInfo(
      _rewardEpochId: number | string | BN,
      _voter: string
    ): NonPayableTransactionObject<{
      _uptimeVoteSignTs: string;
      _uptimeVoteSignBlock: string;
      0: string;
      1: string;
    }>;

    getVoterUptimeVoteSubmitInfo(
      _rewardEpochId: number | string | BN,
      _voter: string
    ): NonPayableTransactionObject<{
      _uptimeVoteSubmitTs: string;
      _uptimeVoteSubmitBlock: string;
      0: string;
      1: string;
    }>;

    governance(): NonPayableTransactionObject<string>;

    governanceSettings(): NonPayableTransactionObject<string>;

    initialRandomVotePowerBlockSelectionSize(): NonPayableTransactionObject<string>;

    initialise(
      _governanceSettings: string,
      _initialGovernance: string
    ): NonPayableTransactionObject<void>;

    isExecutor(_address: string): NonPayableTransactionObject<boolean>;

    isVoterRegistrationEnabled(): NonPayableTransactionObject<boolean>;

    lastInitializedVotingRoundId(): NonPayableTransactionObject<string>;

    newSigningPolicyInitializationStartSeconds(): NonPayableTransactionObject<string>;

    newSigningPolicyMinNumberOfVotingRoundsDelay(): NonPayableTransactionObject<string>;

    noOfWeightBasedClaims(
      rewardEpochId: number | string | BN,
      rewardManagerId: number | string | BN
    ): NonPayableTransactionObject<string>;

    noOfWeightBasedClaimsHash(
      rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    productionMode(): NonPayableTransactionObject<boolean>;

    randomAcquisitionMaxDurationBlocks(): NonPayableTransactionObject<string>;

    randomAcquisitionMaxDurationSeconds(): NonPayableTransactionObject<string>;

    relay(): NonPayableTransactionObject<string>;

    rewardEpochDurationSeconds(): NonPayableTransactionObject<string>;

    rewardEpochIdToExpireNext(): NonPayableTransactionObject<string>;

    rewardExpiryOffsetSeconds(): NonPayableTransactionObject<string>;

    rewardManager(): NonPayableTransactionObject<string>;

    rewardsHash(
      rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    setRewardEpochSwitchoverTriggerContracts(
      _contracts: string[]
    ): NonPayableTransactionObject<void>;

    setRewardsData(
      _rewardEpochId: number | string | BN,
      _noOfWeightBasedClaims: [number | string | BN, number | string | BN][],
      _rewardsHash: string | number[]
    ): NonPayableTransactionObject<void>;

    setSubmit3Aligned(
      _submit3Aligned: boolean
    ): NonPayableTransactionObject<void>;

    setTriggerExpirationAndCleanup(
      _triggerExpirationAndCleanup: boolean
    ): NonPayableTransactionObject<void>;

    setVoterRegistrationTriggerContract(
      _contract: string
    ): NonPayableTransactionObject<void>;

    signNewSigningPolicy(
      _rewardEpochId: number | string | BN,
      _newSigningPolicyHash: string | number[],
      _signature: [number | string | BN, string | number[], string | number[]]
    ): NonPayableTransactionObject<void>;

    signRewards(
      _rewardEpochId: number | string | BN,
      _noOfWeightBasedClaims: [number | string | BN, number | string | BN][],
      _rewardsHash: string | number[],
      _signature: [number | string | BN, string | number[], string | number[]]
    ): NonPayableTransactionObject<void>;

    signUptimeVote(
      _rewardEpochId: number | string | BN,
      _uptimeVoteHash: string | number[],
      _signature: [number | string | BN, string | number[], string | number[]]
    ): NonPayableTransactionObject<void>;

    signingPolicyMinNumberOfVoters(): NonPayableTransactionObject<string>;

    signingPolicyThresholdPPM(): NonPayableTransactionObject<string>;

    submission(): NonPayableTransactionObject<string>;

    submit3Aligned(): NonPayableTransactionObject<boolean>;

    submitUptimeVote(
      _rewardEpochId: number | string | BN,
      _nodeIds: (string | number[])[],
      _signature: [number | string | BN, string | number[], string | number[]]
    ): NonPayableTransactionObject<void>;

    submitUptimeVoteMinDurationBlocks(): NonPayableTransactionObject<string>;

    submitUptimeVoteMinDurationSeconds(): NonPayableTransactionObject<string>;

    switchToFallbackMode(): NonPayableTransactionObject<boolean>;

    switchToProductionMode(): NonPayableTransactionObject<void>;

    timelockedCalls(selector: string | number[]): NonPayableTransactionObject<{
      allowedAfterTimestamp: string;
      encodedCall: string;
      0: string;
      1: string;
    }>;

    triggerExpirationAndCleanup(): NonPayableTransactionObject<boolean>;

    updateContractAddresses(
      _contractNameHashes: (string | number[])[],
      _contractAddresses: string[]
    ): NonPayableTransactionObject<void>;

    updateSettings(
      _settings: [
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN,
        number | string | BN
      ]
    ): NonPayableTransactionObject<void>;

    uptimeVoteHash(
      rewardEpochId: number | string | BN
    ): NonPayableTransactionObject<string>;

    voterRegistrationMinDurationBlocks(): NonPayableTransactionObject<string>;

    voterRegistrationMinDurationSeconds(): NonPayableTransactionObject<string>;

    voterRegistrationTriggerContract(): NonPayableTransactionObject<string>;

    voterRegistry(): NonPayableTransactionObject<string>;

    votingEpochDurationSeconds(): NonPayableTransactionObject<string>;
  };
  events: {
    ClosingExpiredRewardEpochFailed(
      cb?: Callback<ClosingExpiredRewardEpochFailed>
    ): EventEmitter;
    ClosingExpiredRewardEpochFailed(
      options?: EventOptions,
      cb?: Callback<ClosingExpiredRewardEpochFailed>
    ): EventEmitter;

    GovernanceCallTimelocked(
      cb?: Callback<GovernanceCallTimelocked>
    ): EventEmitter;
    GovernanceCallTimelocked(
      options?: EventOptions,
      cb?: Callback<GovernanceCallTimelocked>
    ): EventEmitter;

    GovernanceInitialised(cb?: Callback<GovernanceInitialised>): EventEmitter;
    GovernanceInitialised(
      options?: EventOptions,
      cb?: Callback<GovernanceInitialised>
    ): EventEmitter;

    GovernedProductionModeEntered(
      cb?: Callback<GovernedProductionModeEntered>
    ): EventEmitter;
    GovernedProductionModeEntered(
      options?: EventOptions,
      cb?: Callback<GovernedProductionModeEntered>
    ): EventEmitter;

    RandomAcquisitionStarted(
      cb?: Callback<RandomAcquisitionStarted>
    ): EventEmitter;
    RandomAcquisitionStarted(
      options?: EventOptions,
      cb?: Callback<RandomAcquisitionStarted>
    ): EventEmitter;

    RewardEpochStarted(cb?: Callback<RewardEpochStarted>): EventEmitter;
    RewardEpochStarted(
      options?: EventOptions,
      cb?: Callback<RewardEpochStarted>
    ): EventEmitter;

    RewardsSigned(cb?: Callback<RewardsSigned>): EventEmitter;
    RewardsSigned(
      options?: EventOptions,
      cb?: Callback<RewardsSigned>
    ): EventEmitter;

    SettingCleanUpBlockNumberFailed(
      cb?: Callback<SettingCleanUpBlockNumberFailed>
    ): EventEmitter;
    SettingCleanUpBlockNumberFailed(
      options?: EventOptions,
      cb?: Callback<SettingCleanUpBlockNumberFailed>
    ): EventEmitter;

    SignUptimeVoteEnabled(cb?: Callback<SignUptimeVoteEnabled>): EventEmitter;
    SignUptimeVoteEnabled(
      options?: EventOptions,
      cb?: Callback<SignUptimeVoteEnabled>
    ): EventEmitter;

    SigningPolicySigned(cb?: Callback<SigningPolicySigned>): EventEmitter;
    SigningPolicySigned(
      options?: EventOptions,
      cb?: Callback<SigningPolicySigned>
    ): EventEmitter;

    TimelockedGovernanceCallCanceled(
      cb?: Callback<TimelockedGovernanceCallCanceled>
    ): EventEmitter;
    TimelockedGovernanceCallCanceled(
      options?: EventOptions,
      cb?: Callback<TimelockedGovernanceCallCanceled>
    ): EventEmitter;

    TimelockedGovernanceCallExecuted(
      cb?: Callback<TimelockedGovernanceCallExecuted>
    ): EventEmitter;
    TimelockedGovernanceCallExecuted(
      options?: EventOptions,
      cb?: Callback<TimelockedGovernanceCallExecuted>
    ): EventEmitter;

    TriggeringVoterRegistrationFailed(
      cb?: Callback<TriggeringVoterRegistrationFailed>
    ): EventEmitter;
    TriggeringVoterRegistrationFailed(
      options?: EventOptions,
      cb?: Callback<TriggeringVoterRegistrationFailed>
    ): EventEmitter;

    UptimeVoteSigned(cb?: Callback<UptimeVoteSigned>): EventEmitter;
    UptimeVoteSigned(
      options?: EventOptions,
      cb?: Callback<UptimeVoteSigned>
    ): EventEmitter;

    UptimeVoteSubmitted(cb?: Callback<UptimeVoteSubmitted>): EventEmitter;
    UptimeVoteSubmitted(
      options?: EventOptions,
      cb?: Callback<UptimeVoteSubmitted>
    ): EventEmitter;

    VotePowerBlockSelected(cb?: Callback<VotePowerBlockSelected>): EventEmitter;
    VotePowerBlockSelected(
      options?: EventOptions,
      cb?: Callback<VotePowerBlockSelected>
    ): EventEmitter;

    allEvents(options?: EventOptions, cb?: Callback<EventLog>): EventEmitter;
  };

  once(
    event: "ClosingExpiredRewardEpochFailed",
    cb: Callback<ClosingExpiredRewardEpochFailed>
  ): void;
  once(
    event: "ClosingExpiredRewardEpochFailed",
    options: EventOptions,
    cb: Callback<ClosingExpiredRewardEpochFailed>
  ): void;

  once(
    event: "GovernanceCallTimelocked",
    cb: Callback<GovernanceCallTimelocked>
  ): void;
  once(
    event: "GovernanceCallTimelocked",
    options: EventOptions,
    cb: Callback<GovernanceCallTimelocked>
  ): void;

  once(
    event: "GovernanceInitialised",
    cb: Callback<GovernanceInitialised>
  ): void;
  once(
    event: "GovernanceInitialised",
    options: EventOptions,
    cb: Callback<GovernanceInitialised>
  ): void;

  once(
    event: "GovernedProductionModeEntered",
    cb: Callback<GovernedProductionModeEntered>
  ): void;
  once(
    event: "GovernedProductionModeEntered",
    options: EventOptions,
    cb: Callback<GovernedProductionModeEntered>
  ): void;

  once(
    event: "RandomAcquisitionStarted",
    cb: Callback<RandomAcquisitionStarted>
  ): void;
  once(
    event: "RandomAcquisitionStarted",
    options: EventOptions,
    cb: Callback<RandomAcquisitionStarted>
  ): void;

  once(event: "RewardEpochStarted", cb: Callback<RewardEpochStarted>): void;
  once(
    event: "RewardEpochStarted",
    options: EventOptions,
    cb: Callback<RewardEpochStarted>
  ): void;

  once(event: "RewardsSigned", cb: Callback<RewardsSigned>): void;
  once(
    event: "RewardsSigned",
    options: EventOptions,
    cb: Callback<RewardsSigned>
  ): void;

  once(
    event: "SettingCleanUpBlockNumberFailed",
    cb: Callback<SettingCleanUpBlockNumberFailed>
  ): void;
  once(
    event: "SettingCleanUpBlockNumberFailed",
    options: EventOptions,
    cb: Callback<SettingCleanUpBlockNumberFailed>
  ): void;

  once(
    event: "SignUptimeVoteEnabled",
    cb: Callback<SignUptimeVoteEnabled>
  ): void;
  once(
    event: "SignUptimeVoteEnabled",
    options: EventOptions,
    cb: Callback<SignUptimeVoteEnabled>
  ): void;

  once(event: "SigningPolicySigned", cb: Callback<SigningPolicySigned>): void;
  once(
    event: "SigningPolicySigned",
    options: EventOptions,
    cb: Callback<SigningPolicySigned>
  ): void;

  once(
    event: "TimelockedGovernanceCallCanceled",
    cb: Callback<TimelockedGovernanceCallCanceled>
  ): void;
  once(
    event: "TimelockedGovernanceCallCanceled",
    options: EventOptions,
    cb: Callback<TimelockedGovernanceCallCanceled>
  ): void;

  once(
    event: "TimelockedGovernanceCallExecuted",
    cb: Callback<TimelockedGovernanceCallExecuted>
  ): void;
  once(
    event: "TimelockedGovernanceCallExecuted",
    options: EventOptions,
    cb: Callback<TimelockedGovernanceCallExecuted>
  ): void;

  once(
    event: "TriggeringVoterRegistrationFailed",
    cb: Callback<TriggeringVoterRegistrationFailed>
  ): void;
  once(
    event: "TriggeringVoterRegistrationFailed",
    options: EventOptions,
    cb: Callback<TriggeringVoterRegistrationFailed>
  ): void;

  once(event: "UptimeVoteSigned", cb: Callback<UptimeVoteSigned>): void;
  once(
    event: "UptimeVoteSigned",
    options: EventOptions,
    cb: Callback<UptimeVoteSigned>
  ): void;

  once(event: "UptimeVoteSubmitted", cb: Callback<UptimeVoteSubmitted>): void;
  once(
    event: "UptimeVoteSubmitted",
    options: EventOptions,
    cb: Callback<UptimeVoteSubmitted>
  ): void;

  once(
    event: "VotePowerBlockSelected",
    cb: Callback<VotePowerBlockSelected>
  ): void;
  once(
    event: "VotePowerBlockSelected",
    options: EventOptions,
    cb: Callback<VotePowerBlockSelected>
  ): void;
}

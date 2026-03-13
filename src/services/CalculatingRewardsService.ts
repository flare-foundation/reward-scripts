import { Factory, Inject, Singleton } from "typescript-ioc";
import { AttLogger } from "../logger/logger";
import {
  DelegationData,
  DelegatorData,
  NodeInitialData,
  Entity,
  NodeData,
  RewardsData,
  RewardingPeriodData,
  DataValidatorRewardManager,
} from "../utils/interfaces";
import { nodeIdToBytes20, pAddressToBytes20, sleepms } from "../utils/utils";
import { ConfigurationService } from "./ConfigurationService";
import { ContractService } from "./ContractService";
import { LoggerService } from "./LoggerService";
import * as fs from "fs";
import axios from "axios";
import { EventProcessorService } from "./EventProcessorService";
import { AddressBinder } from "../../typechain-web3-v1/AddressBinder";
import { ValidatorRewardManager } from "../../typechain-web3-v1/ValidatorRewardManager";
import { FlareSystemsManager } from "../../typechain-web3-v1/FlareSystemsManager";
import { bigIntReplacer, bigIntReviver } from "../utils/big-number-serialization";
import {
  getUptimeEligibleNodes,
  initialNodeData,
  getTotalStakeAndCapVP,
  calculateRewardAmounts,
  aggregateRewards,
} from "../utils/rewards";
import { EntityManager } from "../../typechain-web3-v1/EntityManager";
const VALIDATORS_API = "validators/list";
const DELEGATORS_API = "delegators/list";
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DAY_SECONDS = 24 * 60 * 60;

interface FtsoNameEntry {
  address: string;
  chainId: number;
  name: string;
}

interface ProviderListResponse {
  providers: FtsoNameEntry[];
}

interface MinimalConditionEntry {
  voterAddress: string;
  eligibleForReward: boolean;
}

interface ActiveStakeApiEntry {
  startTime: string;
  endTime: string;
  weight: string;
  [key: string]: unknown;
}

@Singleton
@Factory(() => new CalculatingRewardsService())
export class CalculatingRewardsService {
  @Inject
  configurationService: ConfigurationService;

  @Inject
  loggerService: LoggerService;

  @Inject
  contractService: ContractService;

  @Inject
  eventProcessorService: EventProcessorService;

  get logger(): AttLogger {
    return this.loggerService.logger;
  }

  public async prepareInitialData(
    rewardEpoch: number,
    uptimeVotingPeriodLengthSeconds: number,
    rps: number,
    batchSize: number,
    uptimeVotingThreshold: number,
    apiPath: string
  ) {
    await this.contractService.waitForInitialization();
    this.logger.info(`waiting for network connection...`);

    // contracts
    const flareSystemsManager = await this.contractService.flareSystemsManager();
    const pChainStakeMirrorMultiSigVoting = await this.contractService.pChainStakeMirrorMultiSigVoting();
    const addressBinder = await this.contractService.addressBinder();

    // boosting addresses
    const boostingAddresses = this.getBoostingAddresses("boosting-addresses.json");

    // uptime voting threshold
    if (uptimeVotingThreshold === undefined) {
      await sleepms(1000 / rps);
      uptimeVotingThreshold = parseInt(await pChainStakeMirrorMultiSigVoting.methods.getVotingThreshold().call());
    }

    if (rewardEpoch === undefined) {
      await sleepms(1000 / rps);
      rewardEpoch = parseInt(await flareSystemsManager.methods.getCurrentRewardEpoch().call()) - 1;
    }

    const generatedFilesPath = `generated-files/reward-epoch-${rewardEpoch}`;
    fs.mkdirSync(generatedFilesPath, { recursive: true });

    await sleepms(1000 / rps);
    const nextRewardEpochData = await flareSystemsManager.methods.getRewardEpochStartInfo(rewardEpoch + 1).call();
    const nextRewardEpochStartBlock = parseInt(nextRewardEpochData[1]);
    const nextRewardEpochStartTs = parseInt(nextRewardEpochData[0]); // rewardEpochEndTs
    const stakingVpBlock = Number(await flareSystemsManager.methods.getVotePowerBlock(rewardEpoch + 1).call());

    //// get list of nodes with sufficient uptime
    this.contractService.resetUptimeArray();
    await this.eventProcessorService.processEvents(
      nextRewardEpochStartBlock,
      rps,
      batchSize,
      uptimeVotingPeriodLengthSeconds,
      nextRewardEpochStartTs,
      rewardEpoch
    );
    const uptimeVotingData = this.contractService.getUptimeVotingData();
    const eligibleNodesUptime = getUptimeEligibleNodes(uptimeVotingData, uptimeVotingThreshold);

    // get active nodes at staking vote power block
    const activeNodes = (await this.getActiveStakes(stakingVpBlock, apiPath, VALIDATORS_API)) as NodeData[];
    activeNodes.sort(
      (a, b) => a.startTime - b.startTime || a.nodeID.toLowerCase().localeCompare(b.nodeID.toLowerCase())
    );

    // get delegations active at staking vp block
    const delegations = (await this.getActiveStakes(stakingVpBlock, apiPath, DELEGATORS_API)) as DelegationData[];
    delegations.sort((a, b) => a.startTime - b.startTime || a.txID.toLowerCase().localeCompare(b.txID.toLowerCase()));

    const allActiveNodes = [] as NodeInitialData[];

    const processedNodesInterval = setInterval(
      () => this.logger.info(`${allActiveNodes.length} nodes processed so far`),
      15000
    );

    //// for each node check if it is eligible for rewarding, get its delegations, decide to which entity it belongs and calculate boost, total stake amount, ...
    this.logger.info(`^Gprocessing nodes data started`);

    let ftsoNamesData: FtsoNameEntry[];
    try {
      const ftsoNamesResp = await axios.get<ProviderListResponse>(
        `https://raw.githubusercontent.com/TowoLabs/ftso-signal-providers/master/bifrost-wallet.providerlist.json`
      );
      ftsoNamesData = ftsoNamesResp.data.providers;

      if (!ftsoNamesData) {
        throw new Error("Providers data is undefined");
      }
    } catch {
      // Fallback to local file
      // try {
      this.logger.info(`^RReading provider names from local file`);
      const localData = await fs.promises.readFile("./providers-names/bifrost-wallet.providerlist.json", "utf-8");
      ftsoNamesData = (JSON.parse(localData) as ProviderListResponse).providers;
      // 	if (!ftsoNamesData) {
      // 		throw new Error("Local providers data is undefined");
      // 	}
      // } catch (localError) {
      // 	console.error("Failed to read local FTSO file:", localError.message);
      // 	ftsoNamesData = [];
      // }
    }
    const entityManager = await this.contractService.entityManager();
    const acqInfo = await flareSystemsManager.methods.getRandomAcquisitionInfo(rewardEpoch).call();
    const initializationBlock = parseInt(acqInfo._randomAcquisitionStartBlock);
    const chainId = await this.contractService.web3.eth.getChainId();

    for (const activeNode of activeNodes) {
      const [uptime, ftsoName, ftsoAddress] = await this.checkUptimeAndGetEntityData(
        activeNode,
        eligibleNodesUptime,
        ftsoNamesData,
        entityManager,
        initializationBlock,
        rps,
        chainId
      );

      // decide to which group node belongs
      const node = initialNodeData(activeNode, ftsoAddress);
      node.uptimeEligible = uptime;
      node.ftsoName = ftsoName;

      const [selfDelegation, normalDelegations, boost, delegators] = await this.nodeGroup2Data(
        delegations,
        boostingAddresses,
        node,
        addressBinder,
        rps
      );
      node.BEB = node.selfBond;
      node.boostDelegations = boost;
      node.boost = boost;
      node.selfDelegations = selfDelegation;
      node.normalDelegations = normalDelegations;
      node.totalSelfBond = selfDelegation + node.selfBond;
      node.delegators = delegators;
      node.totalStakeAmount = node.selfBond + node.boost + selfDelegation + normalDelegations;
      if (node.pChainAddress.length === 0) {
        this.logger.error(`FTSO ${node.ftsoAddress} did not provide its p-chain address`);
      } else {
        node.pChainAddress.sort((a, b) => (a.toLowerCase() > b.toLowerCase() ? 1 : -1));
        await sleepms(1000 / rps);
        node.cChainAddress = await addressBinder.methods
          .pAddressToCAddress(pAddressToBytes20(node.pChainAddress[0]))
          .call();
      }
      if (node.cChainAddress === ZERO_ADDRESS) {
        this.logger.error(`Validator address ${node.pChainAddress.join(", ")} is not bound`);
      }
      allActiveNodes.push(node);
    }
    clearInterval(processedNodesInterval);
    // save initial data which will be used for deciding if node is eligible for reward
    const initialNodesDataJSON = JSON.stringify(allActiveNodes, bigIntReplacer, 2);
    fs.writeFileSync(`${generatedFilesPath}/initial-nodes-data.json`, initialNodesDataJSON, "utf8");
    const tempData = {
      uptimeVotingPeriodLengthSeconds: uptimeVotingPeriodLengthSeconds,
      uptimeVotingThreshold: uptimeVotingThreshold,
      stakingVpBlock: stakingVpBlock,
    };
    fs.writeFileSync(`${generatedFilesPath}/initial-data.json`, JSON.stringify(tempData, bigIntReplacer, 2), "utf8");
  }

  public async calculateRewards(
    rewardEpoch: number,
    boostingFactor: number,
    minForBEBGwei: string,
    votePowerCapBIPS: number,
    rewardAmountEpochWei: string,
    rps: number
  ) {
    const flareSystemsManager = await this.contractService.flareSystemsManager();
    const validatorRewardManager = await this.contractService.validatorRewardManager();
    const entityManager = await this.contractService.entityManager();
    this.logger.info(`^Rcalculating rewards started`);
    // read updated nodes data file
    let activeNodes = JSON.parse(
      fs.readFileSync(`generated-files/reward-epoch-${rewardEpoch}/initial-nodes-data.json`, "utf8"),
      bigIntReviver
    ) as NodeData[];
    // fetch minimal conditions file
    const minimalConditionsResp = await axios.get<MinimalConditionEntry[]>(
      `https://raw.githubusercontent.com/flare-foundation/fsp-rewards/refs/heads/main/${this.configurationService.network}/${rewardEpoch}/minimal-conditions.json`
    );
    const minimalConditionsData = minimalConditionsResp.data;
    const acqInfo = await flareSystemsManager.methods.getRandomAcquisitionInfo(rewardEpoch).call();
    const initializationBlock = parseInt(acqInfo._randomAcquisitionStartBlock);

    // total stake (self-bonds + delegations) of the network at staking VP block
    let totalStakeNetwork = BigInt(0);
    let entities = [] as Entity[];

    for (const node of activeNodes) {
      totalStakeNetwork += node.totalStakeAmount;

      // check if node is eligible for reward
      await sleepms(1000 / rps);
      const voterAddress = await entityManager.methods
        .getVoterForDelegationAddress(node.ftsoAddress, initializationBlock)
        .call();
      const entity = minimalConditionsData.find(
        (entry: MinimalConditionEntry) => entry.voterAddress.toLowerCase() === voterAddress.toLowerCase()
      );
      node.eligible = entity !== undefined ? entity.eligibleForReward : false;
      if (entity === undefined) {
        this.logger.error(`Entity ${node.ftsoAddress} (node ${node.nodeId}) is not in minimal conditions file`);
      }

      // add node to its entity
      const i = entities.findIndex((e) => e.entityAddress === node.ftsoAddress);
      if (i > -1) {
        entities[i].totalSelfBond += node.totalSelfBond;
        entities[i].nodes.push(node.nodeId);
        // entity has more than four active nodes
        // nodes are already sorted by start time (increasing)
        // if (entities[i].nodes.length > 4 && entities[i].entityAddress !== "") {
        // 	node.eligible = false;
        // 	this.logger.error(`Entity ${entities[i].entityAddress} has more than 4 nodes`);
        // }
        // this condition will already be taken care of in the other script
      } else {
        const nodes = [node.nodeId];
        entities.push({
          entityAddress: node.ftsoAddress,
          totalSelfBond: node.totalSelfBond,
          totalStakeRewarding: BigInt(0),
          nodes: nodes,
        });
      }
    }

    // after calculating total self-bond for entities, we can check if entity is eligible for boosting and calculate overboost
    activeNodes.forEach((node) => {
      const i = entities.findIndex((e) => e.entityAddress === node.ftsoAddress);
      if (entities[i].totalSelfBond < BigInt(minForBEBGwei)) {
        node.overboost = node.boost;
      } else {
        node.overboost =
          node.boost - node.BEB * BigInt(boostingFactor) > BigInt(0)
            ? node.boost - node.BEB * BigInt(boostingFactor)
            : BigInt(0);
      }
      node.rewardingWeight = node.totalStakeAmount - node.overboost;

      // update total stake for rewarding for entity
      entities[i].totalStakeRewarding += node.rewardingWeight;
    });

    //// calculate total stake amount and cap vote power (and then adjust total stake amount of network used for rewarding)
    let totalStakeRewarding = BigInt(0);
    [activeNodes, totalStakeRewarding, entities] = getTotalStakeAndCapVP(
      activeNodes,
      votePowerCapBIPS,
      totalStakeNetwork,
      entities
    );

    let rewardAmount: bigint;
    // reward amount available for distribution
    if (rewardAmountEpochWei === undefined) {
      rewardAmount = await this.getRewardAmount(validatorRewardManager, flareSystemsManager);
    } else {
      rewardAmount = BigInt(rewardAmountEpochWei);
    }

    // calculated reward amount for each eligible node and for its delegators
    activeNodes = calculateRewardAmounts(activeNodes, totalStakeRewarding, rewardAmount);
    const activeNodesDataJSON = JSON.stringify(
      activeNodes,
      (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
    const generatedFilesPath = `generated-files/reward-epoch-${rewardEpoch}`;
    fs.writeFileSync(`${generatedFilesPath}/nodes-data.json`, activeNodesDataJSON, "utf8");

    // for the reward epoch create JSON file with rewarded addresses and reward amounts
    // sum rewards per epoch and address
    const { rewards: rewardsData, distributed } = aggregateRewards(activeNodes, rewardAmount);
    if (distributed !== rewardAmount) {
      this.logger.error(`${distributed} was distributed, it should be ${rewardAmount}`);
    }

    const fullData = {
      recipients: rewardsData,
    } as RewardingPeriodData;

    // read temp data
    const tempData = JSON.parse(fs.readFileSync(`${generatedFilesPath}/initial-data.json`, "utf8")) as {
      uptimeVotingPeriodLengthSeconds: number;
      uptimeVotingThreshold: number;
      stakingVpBlock: number;
    };

    // data for config file
    fullData.configFileData = {
      BOOSTING_FACTOR: boostingFactor,
      VOTE_POWER_CAP_BIPS: votePowerCapBIPS,
      UPTIME_VOTING_PERIOD_LENGTH_SECONDS: tempData.uptimeVotingPeriodLengthSeconds,
      UPTIME_VOTING_THRESHOLD: tempData.uptimeVotingThreshold,
      MIN_FOR_BEB_GWEI: minForBEBGwei,
      REWARD_EPOCH: rewardEpoch,
      REWARD_AMOUNT_EPOCH_WEI: rewardAmount.toString(),
    };

    fullData.stakingVotePowerBlock = tempData.stakingVpBlock;
    fullData.stakingVPBlockTimestamp = (await this.contractService.web3.eth.getBlock(tempData.stakingVpBlock))
      .timestamp as number;

    // for the  whole rewarding period create JSON file with rewarded addresses, reward amounts and parameters needed to replicate output
    const fullDataJSON = JSON.stringify(fullData, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v), 2);
    fs.writeFileSync(`${generatedFilesPath}/data.json`, fullDataJSON, "utf8");
  }

  private getBoostingAddresses(boostingFile: string) {
    return JSON.parse(fs.readFileSync(boostingFile, "utf8")) as string[];
  }

  private async getActiveStakes(vpBlock: number, path1: string, path2: string) {
    const vpBlockTs = (await this.contractService.web3.eth.getBlock(vpBlock)).timestamp as number;
    const vpBlockISO = new Date(vpBlockTs * 1000).toISOString();

    let fullData: (NodeData | DelegationData)[] = [];
    let len = 100;
    let offset = 0;

    while (len === 100) {
      const queryObj = {
        limit: 100,
        offset: offset,
        time: vpBlockISO,
      };
      const res = await axios.post<{ data: ActiveStakeApiEntry[] }>(`${path1}/${path2}`, queryObj);
      const data = res.data["data"];
      const processed = data.map((node: ActiveStakeApiEntry) => {
        return {
          ...node,
          // ISO8601 to unix timestamp
          startTime: Date.parse(node.startTime) / 1000,
          endTime: Date.parse(node.endTime) / 1000,
          weight: BigInt(node.weight),
        };
      });
      fullData = fullData.concat(processed as (NodeData | DelegationData)[]);
      len = data.length;
      offset += len;
    }

    return fullData;
  }

  // check if node has high enough uptime
  private async checkUptimeAndGetEntityData(
    node: NodeData,
    eligibleNodesUptime: string[],
    ftsoNamesData: FtsoNameEntry[],
    entityManager: EntityManager,
    initializationBlock: number,
    rps: number,
    chainId: number
  ): Promise<[boolean, string, string]> {
    const nodeIdBytes20 = nodeIdToBytes20(node.nodeID);
    await sleepms(1000 / rps);
    const voterAddress = await entityManager.methods.getVoterForNodeId(nodeIdBytes20, initializationBlock).call();
    await sleepms(1000 / rps);
    const ftsoAddress = await entityManager.methods.getDelegationAddressOfAt(voterAddress, initializationBlock).call();
    const ftsoName =
      ftsoNamesData.find(
        (obj: FtsoNameEntry) => obj.address.toLowerCase() === ftsoAddress.toLowerCase() && obj.chainId === chainId
      )?.name ?? "";
    const uptimeEligible = eligibleNodesUptime.includes(nodeIdToBytes20(node.nodeID)) ? true : false;
    return [uptimeEligible, ftsoName, ftsoAddress];
  }

  private async getRewardAmount(
    validatorRewardManager: ValidatorRewardManager,
    flareSystemsManager: FlareSystemsManager
  ): Promise<bigint> {
    const totals = await validatorRewardManager.methods.getTotals().call();
    const epochDurationSeconds = await flareSystemsManager.methods.rewardEpochDurationSeconds().call();
    return (BigInt(totals[5]) * BigInt(epochDurationSeconds)) / BigInt(DAY_SECONDS);
  }

  private async nodeGroup2Data(
    delegations: DelegationData[],
    boostingAddresses: string[],
    node: NodeInitialData,
    addressBinder: AddressBinder,
    rps: number
  ): Promise<[bigint, bigint, bigint, DelegatorData[]]> {
    let selfDelegations = BigInt(0);
    let regularDelegations = BigInt(0);
    let boost = BigInt(0);
    const delegators = [] as DelegatorData[];
    for (const delegation of delegations) {
      if (delegation.nodeID !== node.nodeId) continue;

      // self-delegation
      if (node.pChainAddress.includes(delegation.inputAddresses[0])) {
        selfDelegations += delegation.weight;
      }
      // boosting delegation
      else if (boostingAddresses.includes(delegation.inputAddresses[0])) {
        boost += delegation.weight;
      }
      // regular delegation
      else {
        regularDelegations += delegation.weight;
        // check if p chain address already delegated to that node
        const i = delegators.findIndex((del) => del.pAddress === delegation.inputAddresses[0]);
        if (i > -1) {
          delegators[i].amount += delegation.weight;
        } else {
          await sleepms(1000 / rps);
          const cAddr = await addressBinder.methods
            .pAddressToCAddress(pAddressToBytes20(delegation.inputAddresses[0]))
            .call();
          if (cAddr === ZERO_ADDRESS) {
            this.logger.error(`Delegation address ${delegation.inputAddresses[0]} is not bound`);
          }
          delegators.push({
            pAddress: delegation.inputAddresses[0],
            cAddress: cAddr,
            amount: delegation.weight,
          });
        }
      }
    }
    return [selfDelegations, regularDelegations, boost, delegators];
  }

  public sumRewards(lastRewardEpoch: number, numberOfEpochs: number) {
    const rewardsData: RewardsData[] = [];
    const firstRewardEpoch = lastRewardEpoch - numberOfEpochs + 1;
    this.logger.info(`^Rsumming rewards for epochs ${firstRewardEpoch}-${lastRewardEpoch}`);
    for (let epoch = firstRewardEpoch; epoch < firstRewardEpoch + numberOfEpochs; epoch++) {
      const filesPath = `generated-files/reward-epoch-${epoch}`;
      const json = JSON.parse(fs.readFileSync(`${filesPath}/data.json`, "utf8")) as RewardingPeriodData;

      for (const obj of json.recipients) {
        const address = obj.address;
        const amount = obj.amount;
        const index = rewardsData.findIndex((rewardedData) => rewardedData.address === address);
        if (index > -1) {
          rewardsData[index].amount += BigInt(amount);
        } else {
          rewardsData.push({
            address: address,
            amount: BigInt(amount),
          });
        }
      }
    }
    rewardsData.sort((a, b) => (a.address.toLowerCase() > b.address.toLowerCase() ? 1 : -1));
    const dataRewardManager = {} as DataValidatorRewardManager;
    const arrayAddresses = rewardsData.map((recipient) => {
      return recipient.address;
    });
    const arrayAmounts = rewardsData.map((recipient) => {
      return recipient.amount.toString();
    });
    dataRewardManager.addresses = arrayAddresses;
    dataRewardManager.rewardAmounts = arrayAmounts;
    const epochRewardsJSON = JSON.stringify(
      dataRewardManager,
      (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v),
      2
    );
    const generatedFilesPath = "generated-files/validator-rewards";
    fs.mkdirSync(generatedFilesPath, { recursive: true });
    fs.writeFileSync(
      `${generatedFilesPath}/epochs-${firstRewardEpoch}-${firstRewardEpoch + numberOfEpochs - 1}.json`,
      epochRewardsJSON,
      "utf8"
    );
  }
}

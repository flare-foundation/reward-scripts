import fs from "fs";
import { Factory, Inject, Singleton } from "typescript-ioc";
import Web3 from "web3";
import { AttLogger, logException } from "../logger/logger";
import { ContractDeploy, ContractEventBatch, UptimeVote } from "../utils/interfaces";
import { getWeb3, getWeb3ContractWithAbi, sleepms, waitFinalize3Factory } from "../utils/utils";
import { ConfigurationService } from "./ConfigurationService";
import { LoggerService } from "./LoggerService";
import { PChainStakeMirrorMultiSigVoting } from "../../typechain-web3-v1/PChainStakeMirrorMultiSigVoting";
import { AddressBinder } from "../../typechain-web3-v1/AddressBinder";
import { ValidatorRewardManager } from "../../typechain-web3-v1/ValidatorRewardManager";
import { FlareSystemsManager } from "../../typechain-web3-v1/FlareSystemsManager";
import { EntityManager } from "../../typechain-web3-v1/EntityManager";

interface EventReturnValues {
  rewardEpochId: string;
  timestamp: string;
  voter: string;
  nodeIds: string[];
}

interface ContractEvent {
  event: string;
  returnValues: EventReturnValues;
}

@Singleton
@Factory(() => new ContractService())
export class ContractService {
  @Inject
  configurationService!: ConfigurationService;

  @Inject
  loggerService!: LoggerService;

  get logger(): AttLogger {
    return this.loggerService.logger;
  }

  constructor() {
    void this.init();
  }
  initialized = false;

  public web3!: Web3;
  private deployMap = new Map<string, unknown>();
  private addressToContactInfo = new Map<string, ContractDeploy>();

  public deployData!: ContractDeploy[];

  waitFinalize3!: (sender: string, func: () => unknown, delay?: number) => Promise<unknown>;

  async init() {
    this.web3 = getWeb3(this.configurationService.networkRPC, this.logger);
    const deployFname = `deploys/${this.configurationService.network}.json`;
    this.deployData = JSON.parse(fs.readFileSync(deployFname).toString()) as ContractDeploy[];
    for (const contractDeploy of this.deployData) {
      const [contractName] = contractDeploy.contractName.split(".") as [string, ...string[]];
      const { contract } = await getWeb3ContractWithAbi(this.web3, contractDeploy.address, contractName);
      this.deployMap.set(contractDeploy.name, contract);
      contractDeploy.address = contractDeploy.address.toLowerCase();
      this.addressToContactInfo.set(contractDeploy.address.toLowerCase(), contractDeploy);
    }
    this.waitFinalize3 = waitFinalize3Factory(this.web3);
    this.initialized = true;
  }

  get availableContractNames(): string[] {
    return [...this.deployMap.keys()];
  }

  public async getContract(name: string): Promise<unknown> {
    await this.waitForInitialization();
    return this.deployMap.get(name);
  }

  public contractInfoForAddress(address: string): ContractDeploy | undefined {
    return this.addressToContactInfo.get(address);
  }

  public async getContractFromAddress(address: string): Promise<unknown> {
    await this.waitForInitialization();
    const deployInfo = this.addressToContactInfo.get(address.toLowerCase());
    if (deployInfo) {
      return this.deployMap.get(deployInfo.name);
    }
  }

  public async waitForInitialization() {
    while (true) {
      try {
        if (!this.initialized) {
          this.logger.debug(`waiting for contract initialization`);
          await sleepms(1000);
          continue;
        }
      } catch (error) {
        logException(error, `waitForDBConnection`);
        await sleepms(1000);
        continue;
      }
      break;
    }
  }

  /// Specific contracts - add them manually here
  public async flareSystemsManager(): Promise<FlareSystemsManager> {
    return (await this.getContract("FlareSystemsManager")) as FlareSystemsManager;
  }

  public async validatorRewardManager(): Promise<ValidatorRewardManager> {
    return (await this.getContract("ValidatorRewardManager")) as ValidatorRewardManager;
  }

  public async pChainStakeMirrorMultiSigVoting(): Promise<PChainStakeMirrorMultiSigVoting> {
    return (await this.getContract("PChainStakeMirrorMultiSigVoting")) as PChainStakeMirrorMultiSigVoting;
  }

  public async addressBinder(): Promise<AddressBinder> {
    return (await this.getContract("AddressBinder")) as AddressBinder;
  }

  public async entityManager(): Promise<EntityManager> {
    return (await this.getContract("EntityManager")) as EntityManager;
  }

  public async getEventsFromBlockForContract(
    contractName: string,
    startBlock: number,
    endBlock: number,
    inf = false,
    maxDelay = 150
  ): Promise<ContractEventBatch> {
    const contract = (await this.getContract(contractName)) as
      | { getPastEvents: (type: string, opts: { fromBlock: number; toBlock: number }) => Promise<ContractEvent[]> }
      | undefined;
    if (!contract) {
      return {
        contractName,
        startBlock,
        endBlock,
        events: [],
      } as ContractEventBatch;
    }

    if (inf) {
      // delay only if reading batches in parallel
      const delay = Math.round(Math.random() * maxDelay);
      await sleepms(delay);
    }

    const events = await contract.getPastEvents("allEvents", { fromBlock: startBlock, toBlock: endBlock });
    if (events.length > 0) {
      this.logger.info(`${contractName}: ${events.length} new event(s)`);
    }
    return {
      contractName,
      startBlock,
      endBlock,
      events,
    } as ContractEventBatch;
  }

  public async processBatches(contractName: string, startBlock: number, endBlock: number, batchSize: number) {
    const batchPromises: Promise<ContractEventBatch>[] = [];
    let next = startBlock;

    const contract = await this.getContract(contractName);
    if (!contract) {
      return {
        contractName,
        startBlock,
        endBlock,
        events: [],
      } as ContractEventBatch;
    }

    while (next <= endBlock) {
      const end = Math.min(next + batchSize - 1, endBlock);
      batchPromises.push(this.getEventsFromBlockForContract(contractName, next, end, true));
      next = end + 1;
    }

    const result = await Promise.all(batchPromises);
    const events: ContractEvent[] = [];
    for (const batch of result) {
      events.push(...(batch.events as ContractEvent[]));
    }

    return {
      contractName,
      startBlock,
      endBlock,
      events,
    } as ContractEventBatch;
  }

  public processEvents(batch: ContractEventBatch, epochId: number, votingStart: number, votingEnd: number): void {
    const typedEvents = batch.events as unknown as ContractEvent[];
    for (const event of typedEvents) {
      if (event.event === "PChainStakeMirrorValidatorUptimeVoteSubmitted") {
        const params = event.returnValues;
        // vote is for correct reward epoch
        if (String(params.rewardEpochId) === String(epochId)) {
          // vote was casted in the correct time period
          if (Number(params.timestamp) >= votingStart && Number(params.timestamp) <= votingEnd) {
            // check if voter has already voted
            for (let i = this.uptimeVotingData.length - 1; i >= 0; i--) {
              // voter has already voted before. Remove that vote and save new one.
              if (params.voter === this.uptimeVotingData[i]!.voter) {
                this.uptimeVotingData.splice(i, 1);
                break;
              }
            }
            // remove vote's repeating nodes
            const uniqueNodeIds = params.nodeIds.filter(function (elem, index, self) {
              return index === self.indexOf(elem);
            });
            this.uptimeVotingData.push({
              voter: params.voter,
              nodeIds: uniqueNodeIds,
            });
          }
        }
      }
    }
  }

  public resetUptimeArray() {
    this.uptimeVotingData = [];
  }

  uptimeVotingData = [] as UptimeVote[];

  public getUptimeVotingData() {
    return this.uptimeVotingData;
  }
}

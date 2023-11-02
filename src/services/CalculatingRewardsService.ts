import { Factory, Inject, Singleton } from 'typescript-ioc';
import { AttLogger } from '../logger/logger';
import { DelegationData, DelegatorData, ActiveNode, Entity, FtsoData, NodeData, PAddressData, RewardsData, UptimeVote, RewardingPeriodData, DataValidatorRewardManager } from '../utils/interfaces';
import { nodeIdToBytes20, pAddressToBytes20, sleepms } from '../utils/utils';
import { ConfigurationService } from './ConfigurationService';
import { ContractService } from './ContractService';
import { LoggerService } from './LoggerService';
import * as fs from 'fs';
import { parse } from 'json2csv';
import axios from 'axios';
import { FtsoRewardManager } from '../../typechain-web3-v1/FtsoRewardManager';
import { EventProcessorService } from './EventProcessorService';
import { AddressBinder } from '../../typechain-web3-v1/AddressBinder';
import { ValidatorRewardManager } from '../../typechain-web3-v1/ValidatorRewardManager';
import { FtsoManager } from '../../typechain-web3-v1/FtsoManager';
// import { parse } from 'csv-parse';
const parseCsv = require('csv-parse/lib/sync');
const VALIDATORS_API = 'validators/list';
const DELEGATORS_API = 'delegators/list';
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const DAY_SECONDS = 24 * 60 * 60;
const GWEI = BigInt(1e9);

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

	public async calculateRewards(rewardEpoch: number, ftsoPerformanceForRewardWei: string, boostingFactor: number, votePowerCapBIPS: number, uptimeVotingPeriodLengthSeconds: number, rps: number, batchSize: number, uptimeVotingThreshold: number, minForBEBGwei: string, rewardAmountEpochWei: string, apiPath: string) {
		await this.contractService.waitForInitialization();
		this.logger.info(`waiting for network connection...`);
		this.logger.info(rps)

		// contracts
		let ftsoManager = await this.contractService.ftsoManager();
		let ftsoRewardManager = await this.contractService.ftsoRewardManager();
		let validatorRewardManager = await this.contractService.validatorRewardManager();
		let pChainStakeMirrorMultiSigVoting = await this.contractService.pChainStakeMirrorMultiSigVoting();
		let addressBinder = await this.contractService.addressBinder();

		// boosting addresses
		let boostingAddresses = await this.getBoostingAddresses("boosting-addresses.json");

		// ftso (entity) address for a node
		let ftsoAddresses = await this.getFtsoAddress("ftso-address.csv") as FtsoData[];

		// p chain address for Group1 node
		let pChainAddresses = await this.getPChainAddresses("p-chain-address.csv");

		// uptime voting threshold
		if (uptimeVotingThreshold === undefined) {
			await sleepms(1000 / rps);
			uptimeVotingThreshold = parseInt(await pChainStakeMirrorMultiSigVoting.methods.getVotingThreshold().call());
		}

		if (rewardEpoch === undefined) {
			await sleepms(1000 / rps);
			rewardEpoch = parseInt(await ftsoRewardManager.methods.getCurrentRewardEpoch().call()) - 1;
		}

		const generatedFilesPath = `generated-files/reward-epoch-${rewardEpoch}`
		fs.mkdirSync(generatedFilesPath, { recursive: true });

		let rewardAmount: bigint;

		await sleepms(1000 / rps);
		let nextRewardEpochData = await ftsoManager.methods.getRewardEpochData((rewardEpoch + 1).toString()).call();
		let ftsoVpBlock = parseInt(nextRewardEpochData[0]);
		let nextRewardEpochStartBlock = parseInt(nextRewardEpochData[1]);
		let nextRewardEpochStartTs = parseInt(nextRewardEpochData[2]); // rewardEpochEndTs
		let stakingVpBlock = nextRewardEpochStartBlock - 2 * (nextRewardEpochStartBlock - ftsoVpBlock);

		//// get list of nodes with sufficient uptime
		await this.contractService.resetUptimeArray();
		await this.eventProcessorService.processEvents(nextRewardEpochStartBlock, rps, batchSize, uptimeVotingPeriodLengthSeconds, nextRewardEpochStartTs, rewardEpoch);
		let uptimeVotingData = await this.contractService.getUptimeVotingData();
		let eligibleNodesUptime = await this.getUptimeEligibleNodes(uptimeVotingData, uptimeVotingThreshold);

		// get active nodes at staking vote power block
		let activeNodes = await this.getActiveStakes(stakingVpBlock, apiPath, VALIDATORS_API) as NodeData[];
		activeNodes.sort((a, b) => a.startTime - b.startTime || a.nodeID.toLowerCase().localeCompare(b.nodeID.toLowerCase()));

		// get delegations active at staking vp block
		let delegations = await this.getActiveStakes(stakingVpBlock, apiPath, DELEGATORS_API) as DelegationData[];
		delegations.sort((a, b) => a.startTime - b.startTime || a.txID.toLowerCase().localeCompare(b.txID.toLowerCase()));

		// total stake (self-bonds + delegations) of the network at staking VP block
		let totalStakeNetwork = BigInt(0);
		let entities = [] as Entity[];
		let allActiveNodes = [] as ActiveNode[];

		//// for each node check if it is eligible for rewarding, get its delegations, decide to which entity it belongs and calculate boost, total stake amount, ...
		for (const activeNode of activeNodes) {
			let [eligible, ftsoAddress, nonEligibilityReason] = await this.isEligibleForReward(activeNode, eligibleNodesUptime, ftsoAddresses, ftsoRewardManager, rewardEpoch, ftsoPerformanceForRewardWei, rps);

			// decide to which group node belongs
			let node = await this.nodeGroup(activeNode, ftsoAddress, boostingAddresses, pChainAddresses);
			node.eligible = eligible;
			if (!node.eligible) {
				node.nonEligibilityReason = nonEligibilityReason;
			}

			if (node.group === 1) {
				let [selfDelegations, normalDelegations, delegators] = await this.nodeGroup1Data(delegations, node, boostingAddresses, addressBinder, rps);
				let virtualBoost = BigInt(boostingFactor) * selfDelegations > BigInt(10e6) * GWEI ? BigInt(boostingFactor) * selfDelegations - BigInt(10e6) * GWEI : BigInt(0);
				node.boostDelegations = virtualBoost < BigInt(5e6) * GWEI ? virtualBoost : BigInt(5e6) * GWEI;
				node.boost = node.selfBond + node.boostDelegations;
				node.BEB = selfDelegations;
				node.selfDelegations = selfDelegations;
				node.totalSelfBond = selfDelegations;
				node.normalDelegations = normalDelegations;
				node.delegators = delegators;
				node.totalStakeAmount = selfDelegations + node.boost + normalDelegations;
			} else if (node.group === 2) {
				let [selfDelegation, normalDelegations, boost, delegators] = await this.nodeGroup2Data(delegations, boostingAddresses, node, addressBinder, rps);
				node.BEB = node.selfBond;
				node.boostDelegations = boost;
				node.boost = boost;
				node.selfDelegations = selfDelegation;
				node.normalDelegations = normalDelegations;
				node.totalSelfBond = selfDelegation + node.selfBond;
				node.delegators = delegators;
				node.totalStakeAmount = node.selfBond + node.boost + selfDelegation + normalDelegations;
			}
			if (node.pChainAddress.length === 0) {
				this.logger.error(`FTSO ${node.ftsoAddress} did not provide its p-chain address`);
			} else {
				node.pChainAddress.sort((a, b) => a.toLowerCase() > b.toLowerCase() ? 1 : -1);
				await sleepms(1000 / rps);
				node.cChainAddress = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(node.pChainAddress[0])).call();
			}
			if (node.cChainAddress === ZERO_ADDRESS) {
				this.logger.error(`Validator address ${node.pChainAddress} is not binded`);
			}
			totalStakeNetwork += node.totalStakeAmount;

			// add node to its entity
			const i = entities.findIndex(entity => entity.entityAddress == node.ftsoAddress);
			if (i > -1) {
				entities[i].totalSelfBond += node.totalSelfBond
				entities[i].nodes.push(
					node.nodeId
				);
				// entity has more than four active nodes
				// nodes are already sorted by start time (increasing)
				if (entities[i].nodes.length > 4 && entities[i].entityAddress !== "") {
					node.eligible = false;
					this.logger.error(`Entity ${entities[i].entityAddress} has more than 4 nodes`);
				}
			} else {
				let nodes = [
					node.nodeId
				];
				entities.push({
					entityAddress: node.ftsoAddress,
					totalSelfBond: node.totalSelfBond,
					totalStakeRewarding: BigInt(0),
					nodes: nodes
				})
			}
			allActiveNodes.push(node);
		}

		// after calculating total self-bond for entities, we can check if entity is eligible for boosting and calculate overboost
		allActiveNodes.forEach(node => {
			const i = entities.findIndex(entity => entity.entityAddress == node.ftsoAddress);
			if (entities[i].totalSelfBond < BigInt(minForBEBGwei)) {
				node.overboost = node.boost;
			} else {
				node.overboost = node.boost - node.BEB * BigInt(boostingFactor) > BigInt(0) ? node.boost - node.BEB * BigInt(boostingFactor) : BigInt(0);
			}
			node.rewardingWeight = node.totalStakeAmount - node.overboost;

			// update total stake for rewarding for entity
			entities[i].totalStakeRewarding += node.rewardingWeight;
		});

		//// calculate total stake amount and cap vote power (and then adjust total stake amount of network used for rewarding)
		let totalStakeRewarding = BigInt(0);
		[allActiveNodes, totalStakeRewarding, entities] = await this.getTotalStakeAndCapVP(allActiveNodes, votePowerCapBIPS, totalStakeNetwork, entities);

		// reward amount available for distribution
		if (rewardAmountEpochWei === undefined) {
			rewardAmount = await this.getRewardAmount(validatorRewardManager, ftsoManager);
		} else {
			rewardAmount = BigInt(rewardAmountEpochWei);
		}

		// calculated reward amount for each eligible node and for its delegators
		allActiveNodes = await this.calculateRewardAmounts(allActiveNodes, totalStakeRewarding, rewardAmount);
		let activeNodesDataJSON = JSON.stringify(allActiveNodes, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
		fs.writeFileSync(`${generatedFilesPath}/nodes-data.json`, activeNodesDataJSON, "utf8");

		// for the reward epoch create JSON file with rewarded addresses and reward amounts
		// sum rewards per epoch and address
		let rewardsData = await this.writeRewardedAddressesToJSON(allActiveNodes, rewardAmount);

		let fullData = {
			recipients: rewardsData
		} as RewardingPeriodData;

		// data for config file
		fullData.BOOSTING_FACTOR = boostingFactor;
		fullData.VOTE_POWER_CAP_BIPS = votePowerCapBIPS;
		fullData.UPTIME_VOTING_PERIOD_LENGTH_SECONDS = uptimeVotingPeriodLengthSeconds;
		fullData.UPTIME_VOTING_THRESHOLD = uptimeVotingThreshold;
		fullData.MIN_FOR_BEB_GWEI = minForBEBGwei;
		fullData.REQUIRED_FTSO_PERFORMANCE_WEI = ftsoPerformanceForRewardWei;
		fullData.REWARD_EPOCH = rewardEpoch;
		fullData.REWARD_AMOUNT_EPOCH_WEI = rewardAmount.toString();

		// for the  whole rewarding period create JSON file with rewarded addresses, reward amounts and parameters needed to replicate output
		let fullDataJSON = JSON.stringify(fullData, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
		fs.writeFileSync(`${generatedFilesPath}/data.json`, fullDataJSON, "utf8");
	}


	public async getFtsoAddress(ftsoAddressFile: string) {
		let rawData = fs.readFileSync(ftsoAddressFile, "utf8");
		const parsed: { nodeId: string, ftsoAddress: string }[] = parseCsv(rawData, {
			columns: true,
			skip_empty_lines: true,
			delimiter: ',',
			skip_records_with_error: false
		}).map(
			(it: any, i: number) => {
				return {
					nodeId: it["Node ID"],
					ftsoAddress: it["FTSO address"]
				}
			}
		);
		return parsed;
	}


	public async getBoostingAddresses(boostingFile: string) {
		return JSON.parse(fs.readFileSync(boostingFile, 'utf8'));
	}

	public async getActiveStakes(vpBlock: number, path1: string, path2: string) {
		let vpBlockTs = (await this.contractService.web3.eth.getBlock(vpBlock)).timestamp as number;
		let vpBlockISO = new Date(vpBlockTs * 1000).toISOString();

		let fullData = [];
		let len = 100;
		let offset = 0;

		while (len === 100) {
			let queryObj = {
				"limit": 100,
				"offset": offset,
				"time": vpBlockISO
			}
			let res = await axios.post(`${path1}/${path2}`, queryObj);
			let data = res.data['data'];
			data.forEach(node => {
				// ISO8601 to unix timestamp
				node.startTime = Date.parse(node.startTime) / 1000;
				node.endTime = Date.parse(node.endTime) / 1000;
				node.weight = BigInt(node.weight);
			})
			fullData = fullData.concat(data);
			len = data.length;
			offset += len;
		}

		return fullData;
	}

	public async getPChainAddresses(pChainFile: string) {
		let rawData = fs.readFileSync(pChainFile, "utf8");
		const parsed: { ftsoAddress: string, pChainAddress: string }[] = parseCsv(rawData, {
			columns: true,
			skip_empty_lines: true,
			delimiter: ',',
			skip_records_with_error: false
		}).map(
			(it: any, i: number) => {
				return {
					ftsoAddress: it["FTSO address"],
					pChainAddress: it["p chain address"]
				}
			}
		);
		return parsed;
	}

	public async getUptimeEligibleNodes(votingData: UptimeVote[], threshold: number) {
		let eligibleNodesUptime = [] as string[];

		// const voteCount = votingData.reduce((result, vote) => {
		// 	vote.nodeIds.forEach(node => {
		// 	  result[node] = (result[node] || 0) + 1;
		// 	});
		// 	return result;
		//   }, {});

		const voteCount = votingData.reduce((result, vote) => {
			vote.nodeIds.forEach(node => {
				if (!result[node]) result[node] = 0;
				result[node]++;
			})
			return result;
		}, {})

		for (const key of Object.keys(voteCount)) {
			if (voteCount[key] >= threshold) eligibleNodesUptime.push(key);
		}

		return eligibleNodesUptime;
	}

	// check if node is eligible (high enough ftso performance and uptime) for rewards
	public async isEligibleForReward(node: NodeData, eligibleNodesUptime: string[], ftsoAddresses: FtsoData[], ftsoRewardManager: FtsoRewardManager, epochNum: number, ftsoPerformanceForReward: string, rps: number): Promise<[boolean, string, string]> {

		let nonEligibilityReason: string;
		// find node's entity/ftso address
		let ftsoObj = ftsoAddresses.find(obj => {
			return obj.nodeId == node.nodeID;
		})
		if (ftsoObj === undefined) {
			this.logger.error(`${node.nodeID} did not provide its FTSO address`);
			nonEligibilityReason = "didn't provide its FTSO address";
			return [false, "", nonEligibilityReason];
		}
		// uptime
		if (!eligibleNodesUptime.includes(nodeIdToBytes20(node.nodeID))) {
			nonEligibilityReason = "not high enough uptime";
			return [false, ftsoObj.ftsoAddress, nonEligibilityReason];
		}

		// ftso rewards
		await sleepms(1000 / rps);
		let ftsoPerformance = await ftsoRewardManager.methods.getDataProviderPerformanceInfo(epochNum.toString(), ftsoObj.ftsoAddress).call();
		if (BigInt(ftsoPerformance[0]) <= BigInt(ftsoPerformanceForReward)) {
			nonEligibilityReason = "not high enough FTSO performance";
			return [false, ftsoObj.ftsoAddress, nonEligibilityReason];
		}
		return [true, ftsoObj.ftsoAddress, nonEligibilityReason];
	}

	public async nodeGroup(node: NodeData, ftsoAddress: string, boostingAddresses: string[], pChainAddresses: PAddressData[]): Promise<ActiveNode> {
		let nodeObj = {} as ActiveNode;
		nodeObj.nodeId = node.nodeID;
		nodeObj.bondingAddress = node.inputAddresses[0];
		nodeObj.selfBond = node.weight;
		nodeObj.ftsoAddress = ftsoAddress;
		nodeObj.stakeEnd = node.endTime;
		nodeObj.pChainAddress = [];

		// node is in group 1
		if (boostingAddresses.includes(node.inputAddresses[0]) && node.weight == BigInt(10000000) * GWEI) {
			// bind p chain address to node id
			for (let obj of pChainAddresses) {
				if (obj.ftsoAddress == nodeObj.ftsoAddress) {
					nodeObj.pChainAddress.push(obj.pChainAddress);
				}
			}
			nodeObj.fee = 200000;
			nodeObj.group = 1;
			return nodeObj;
		}
		nodeObj.fee = node.feePercentage;
		nodeObj.pChainAddress.push(nodeObj.bondingAddress);
		nodeObj.group = 2
		return nodeObj;
	}

	public async getTotalStakeAndCapVP(activeNodes: ActiveNode[], votePowerCapFactor: number, totalStakeNetwork: bigint, entities: Entity[]): Promise<[ActiveNode[], bigint, Entity[]]> {

		// cap factor for entity
		entities.forEach(e => {
			if (e.totalStakeRewarding !== BigInt(0)) {
				let capBIPS = totalStakeNetwork * BigInt(votePowerCapFactor) / e.totalStakeRewarding;
				e.capFactor = capBIPS < 1e4 ? capBIPS : BigInt(1e4);
			} else { // rewarding weight == overboost
				e.capFactor = BigInt(0);
			}

		})

		// total capped rewarding weight of eligible nodes
		let totalCappedWeightEligible = BigInt(0);

		// cap vote power to some percentage of total stake amount
		activeNodes.forEach(item => {
			if (item.eligible) {
				let entity = entities.find(i => i.entityAddress == item.ftsoAddress);
				item.cappedWeight = item.rewardingWeight * entity.capFactor / BigInt(1e4);
				totalCappedWeightEligible += item.cappedWeight;
			}
		});
		return [activeNodes, totalCappedWeightEligible, entities];
	}

	public async getRewardAmount(validatorRewardManager: ValidatorRewardManager, ftsoManager: FtsoManager): Promise<bigint> {
		let totals = await validatorRewardManager.methods.getTotals().call();
		let epochDurationSeconds = await ftsoManager.methods.rewardEpochDurationSeconds().call();
		return BigInt(totals[5]) * BigInt(epochDurationSeconds) / BigInt(DAY_SECONDS);
	}

	public async calculateRewardAmounts(activeNodes: ActiveNode[], totalStakeAmount: bigint, availableRewardAmount: bigint): Promise<ActiveNode[]> {

		// sort lexicographically by nodeID
		activeNodes.sort((a, b) => a.nodeId.toLowerCase() > b.nodeId.toLowerCase() ? 1 : -1);

		activeNodes.forEach(node => {
			if (node.eligible) {
				// reward amount available for a node
				node.nodeRewardAmount = totalStakeAmount > BigInt(0) ? node.cappedWeight * availableRewardAmount / totalStakeAmount : BigInt(0);
				let nodeRemainingRewardAmount = node.nodeRewardAmount;
				let nodeRemainingWeight = node.rewardingWeight;
				availableRewardAmount -= node.nodeRewardAmount;
				totalStakeAmount -= node.cappedWeight;

				// fee amount, which validator (entity) receives
				let feeAmount = node.nodeRewardAmount * BigInt(node.fee) / BigInt(1e6);
				node.validatorRewardAmount = feeAmount;
				nodeRemainingRewardAmount -= feeAmount;

				// rewards (excluding fees) for total self bond (group1: self-delegations; group2: self-delegations + self-bond)
				let validatorSelfBondReward = nodeRemainingWeight > BigInt(0) ? node.totalSelfBond * nodeRemainingRewardAmount / nodeRemainingWeight : BigInt(0);
				node.validatorRewardAmount += validatorSelfBondReward;
				nodeRemainingRewardAmount -= validatorSelfBondReward;
				nodeRemainingWeight -= node.totalSelfBond;

				// adjusted reward (that would otherwise be earned by boosting addresses)
				let validatorAdjustedReward = nodeRemainingWeight > BigInt(0) ? (node.boost - node.overboost) * nodeRemainingRewardAmount / nodeRemainingWeight : BigInt(0);
				node.validatorRewardAmount += validatorAdjustedReward;
				nodeRemainingRewardAmount -= validatorAdjustedReward;
				nodeRemainingWeight -= node.boost - node.overboost;

				// rewards for delegators
				node.delegators.sort((a, b) => a.pAddress.toLowerCase() > b.pAddress.toLowerCase() ? 1 : -1);
				node.delegators.forEach(delegator => {
					delegator.delegatorRewardAmount = nodeRemainingWeight > 0 ? delegator.amount * nodeRemainingRewardAmount / nodeRemainingWeight : BigInt(0);
					nodeRemainingWeight -= delegator.amount;
					nodeRemainingRewardAmount -= delegator.delegatorRewardAmount;
				})
			}
		});
		return activeNodes;
	}

	public async nodeGroup1Data(delegations: DelegationData[], node: ActiveNode, boostingAddresses: string[], addressBinder: AddressBinder, rps: number): Promise<[bigint, bigint, DelegatorData[]]> {
		let selfDelegations = BigInt(0);
		let regularDelegations = BigInt(0);
		let delegators = [] as DelegatorData[];
		for (const delegation of delegations) {
			if (delegation.nodeID !== node.nodeId) continue;

			// self-delegation
			if (node.pChainAddress.includes(delegation.inputAddresses[0])) {
				selfDelegations += delegation.weight;
			}
			// boosting delegation
			else if (boostingAddresses.includes(delegation.inputAddresses[0])) {
				// do nothing
			}
			// regular delegation
			else {
				regularDelegations += delegation.weight;
				// check if delegator already delegated to the node
				const i = delegators.findIndex(del => del.pAddress == delegation.inputAddresses[0]);
				if (i > -1) {
					delegators[i].amount += delegation.weight;
				} else {
					await sleepms(1000 / rps);
					let cAddr = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(delegation.inputAddresses[0])).call();
					if (cAddr === ZERO_ADDRESS) {
						this.logger.error(`Delegation address ${delegation.inputAddresses[0]} is not binded`);
					}
					delegators.push({
						pAddress: delegation.inputAddresses[0],
						cAddress: cAddr,
						amount: delegation.weight
					});
				}
			}
		}
		return [selfDelegations, regularDelegations, delegators];
	}

	public async nodeGroup2Data(delegations: DelegationData[], boostingAddresses: string[], node: ActiveNode, addressBinder: AddressBinder, rps: number): Promise<[bigint, bigint, bigint, DelegatorData[]]> {
		let selfDelegations = BigInt(0);
		let regularDelegations = BigInt(0);
		let boost = BigInt(0);
		let delegators = [] as DelegatorData[];
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
				const i = delegators.findIndex(del => del.pAddress == delegation.inputAddresses[0]);
				if (i > -1) {
					delegators[i].amount += delegation.weight;
				} else {
					await sleepms(1000 / rps);
					let cAddr = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(delegation.inputAddresses[0])).call();
					if (cAddr === ZERO_ADDRESS) {
						this.logger.error(`Delegation address ${delegation.inputAddresses[0]} is not binded`);
					}
					delegators.push({
						pAddress: delegation.inputAddresses[0],
						cAddress: cAddr,
						amount: delegation.weight
					});
				}
			}
		}
		return [selfDelegations, regularDelegations, boost, delegators];
	}

	public async writeRewardedAddressesToJSON(activeNodes: ActiveNode[], availableRewardAmount: bigint): Promise<RewardsData[]> {

		let epochRewardsData = [] as RewardsData[];
		let distributed = BigInt(0);

		activeNodes.forEach(node => {
			if (node.eligible) {
				if (node.validatorRewardAmount === BigInt(0)) {
					if (node.cChainAddress !== undefined) {
						this.logger.error(`Entity ${node.ftsoAddress} is eligible but reward amount is 0`);
					}
					// else:
					// validator did not provider its ftso address
					// should only happen if validator from group 1 did not provide p-chain address and has 0 self-delegations
				} else {
					let address = node.cChainAddress;
					const index = epochRewardsData.findIndex(validator => validator.address == address);
					if (index > -1) {
						epochRewardsData[index].amount += node.validatorRewardAmount;
					}
					else {
						epochRewardsData.push({
							address: address,
							amount: node.validatorRewardAmount
						});
					}
					distributed += node.validatorRewardAmount;
				};

				node.delegators.forEach(delegator => {
					let delegatorRewardingAddress = delegator.cAddress;
					if (delegator.amount > BigInt(0)) {
						const index = epochRewardsData.findIndex(rewardedData => rewardedData.address == delegatorRewardingAddress);
						if (index > -1) {
							epochRewardsData[index].amount += delegator.delegatorRewardAmount;
						}
						else {
							epochRewardsData.push({
								address: delegatorRewardingAddress,
								amount: delegator.delegatorRewardAmount
							});
						}
						distributed += delegator.delegatorRewardAmount;
					} else {
						this.logger.error(`Delegator ${delegatorRewardingAddress} has reward amount 0`);
					}

				})
			}
		});

		// check if everything was distributed
		if (distributed !== availableRewardAmount) {
			this.logger.error(`${distributed} was distributed, it should be ${availableRewardAmount}`);
		}

		return epochRewardsData;
	}

	public async sumRewards(lastRewardEpoch: number, numberOfEpochs: number) {
		let rewardsData: RewardsData[] = [];
		let firstRewardEpoch = lastRewardEpoch - numberOfEpochs + 1;
		for (let epoch = firstRewardEpoch; epoch < firstRewardEpoch + numberOfEpochs; epoch++) {
			const filesPath = `generated-files/reward-epoch-${epoch}`;
			const json = JSON.parse(fs.readFileSync(`${filesPath}/data.json`, 'utf8')) as RewardingPeriodData;

			for (let obj of json.recipients) {
				const address = obj.address;
				const amount = obj.amount
				const index = rewardsData.findIndex(rewardedData => rewardedData.address == address);
				if (index > -1) {
					rewardsData[index].amount += BigInt(amount);
				}
				else {
					rewardsData.push({
						address: address,
						amount: BigInt(amount)
					});
				}
			}
		}
		let dataRewardManager = {} as DataValidatorRewardManager;
		let arrayAddresses = rewardsData.map(recipient => {
			return recipient.address;
		});
		let arrayAmounts = rewardsData.map(recipient => {
			return recipient.amount.toString();
		});
		dataRewardManager.addresses = arrayAddresses;
		dataRewardManager.rewardAmounts = arrayAmounts;
		let epochRewardsJSON = JSON.stringify(dataRewardManager, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
		const generatedFilesPath = "generated-files/validator-rewards"
		fs.mkdirSync(generatedFilesPath, { recursive: true });
		fs.writeFileSync(`${generatedFilesPath}/epochs-${firstRewardEpoch}-${firstRewardEpoch + numberOfEpochs - 1}.json`, epochRewardsJSON, "utf8");
	}

}



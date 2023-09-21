import { Factory, Inject, Singleton } from 'typescript-ioc';
import { AttLogger, logException } from '../logger/logger';
import { DelegationData, DelegatorData, ActiveNode, Entity, FtsoData, NodeData, NodeEntity, PAddressData, RewardsData, UptimeVote } from '../utils/interfaces';
import { nodeIdToBytes20, pAddressToBytes20, sleepms } from '../utils/utils';
import { ConfigurationService } from './ConfigurationService';
import { ContractService } from './ContractService';
import { LoggerService } from './LoggerService';
import * as fs from 'fs';
// import { parse } from 'json2csv';
import axios from 'axios';
import { FtsoRewardManager } from '../../typechain-web3-v1/FtsoRewardManager';
import { EventProcessorService } from './EventProcessorService';
import { AddressBinder } from '../../typechain-web3-v1/AddressBinder';
import { ValidatorRewardManager } from '../../typechain-web3-v1/ValidatorRewardManager';
// import { parse } from 'csv-parse';
const parse = require('csv-parse/lib/sync');
const VALIDATORS_API_PATH = 'https://flare-indexer.flare.rocks/validators/list';
const DELEGATORS_API_PATH = 'https://flare-indexer.flare.rocks/delegators/list';


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

	public async calculateRewards(firstRewardEpoch: number, ftsoPerformanceForReward: number, boostingFactor: number, votePowerCapBIPS: number, numUnrewardedEpochs: number, uptimeVotingPeriodLength: number, rps: number, batchSize: number, uptimeVotingThreshold: number, minForBEB: number, defaultFee: number, rewardAmount: number | bigint) {
		await this.contractService.waitForInitialization();
		this.logger.info(`waiting for network connection...`);

		// contracts
		let ftsoManager = await this.contractService.ftsoManager();
		let ftsoRewardManager = await this.contractService.ftsoRewardManager();
		let validatorRewardManager = await this.contractService.validatorRewardManager();
		let pChainStakeMirrorMultiSigVoting = await this.contractService.pChainStakeMirrorMultiSigVoting();
		let addressBinder = await this.contractService.addressBinder();

		// excluded (FNL) addresses
		let fnlAddresses = await this.getFNLAddresses("fnl.json");

		// ftso (entity) address for a node
		let ftsoAddresses = await this.getFtsoAddress("ftso-address.csv") as FtsoData[];

		// p chain address for Group1 node
		let pChainAddresses = await this.getPChainAddresses("p-chain-address.csv");

		// uptime voting threshold
		if (uptimeVotingThreshold === undefined) {
			uptimeVotingThreshold = parseInt(await pChainStakeMirrorMultiSigVoting.methods.getVotingThreshold().call());
		}

		let rewardsData = [] as RewardsData[];

		for (let epoch = firstRewardEpoch; epoch < firstRewardEpoch + numUnrewardedEpochs; epoch++) {

			let nextRewardEpochData = await ftsoManager.methods.getRewardEpochData((epoch + 1).toString()).call();
			let ftsoVpBlock = parseInt(nextRewardEpochData[0]);
			let nextRewardEpochStartBlock = parseInt(nextRewardEpochData[1]);
			let nextRewardEpochStartTs = parseInt(nextRewardEpochData[2]); // rewardEpochEndTs
			let stakingVpBlock = nextRewardEpochStartBlock - 2 * (nextRewardEpochStartBlock - ftsoVpBlock);

			//// get list of nodes with sufficient uptime
			await this.contractService.resetUptimeArray();
			await this.eventProcessorService.processEvents(nextRewardEpochStartBlock, rps, batchSize, uptimeVotingPeriodLength, nextRewardEpochStartTs, epoch);
			let uptimeVotingData = await this.contractService.getUptimeVotingData();
			let eligibleNodesUptime = await this.getUptimeEligibleNodes(uptimeVotingData, uptimeVotingThreshold);

			// get active nodes at staking vote power block
			let activeNodes = await this.getActiveStakes(stakingVpBlock, VALIDATORS_API_PATH) as NodeData[];
			activeNodes.sort((a, b) => a.startTime > b.startTime ? 1 : -1);

			// get delegations active at staking vp block
			let delegations = await this.getActiveStakes(stakingVpBlock, DELEGATORS_API_PATH) as DelegationData[];

			// total stake (self-bonds + delegations) of the network at staking VP block
			let totalStakeNetwork = BigInt(0);
			let entities = [] as Entity[];
			let allActiveNodes = [] as ActiveNode[];

			//// for each node check if it is eligible for rewarding, get its delegations, decide to which entity it belongs and calculate boost, total stake amount, ...
			for (const activeNode of activeNodes) {
				let [eligible, ftsoAddress] = await this.isEligibleForReward(activeNode, eligibleNodesUptime, ftsoAddresses, ftsoRewardManager, epoch, ftsoPerformanceForReward);

				// decide to which group node belongs
				let [group, node] = await this.nodeGroup(activeNode, ftsoAddress, fnlAddresses, pChainAddresses, defaultFee);
				node.eligible = eligible;

				if (group === "group1") {
					node.group = 1;
					let [selfDelegations, BEB, normalDelegations, boostDelegations, delegators] = await this.nodeGroup1Data(delegations, node, fnlAddresses, addressBinder);
					node.boost = node.selfBond + boostDelegations;
					node.BEB = BEB;
					node.selfDelegations = selfDelegations;
					node.totalSelfBond = node.selfDelegations;
					node.normalDelegations = normalDelegations;
					node.boostDelegations = boostDelegations;
					node.delegators = delegators;
					node.totalStakeAmount = selfDelegations + node.boost + normalDelegations;
				} else if (group === "group2") {
					node.group = 2;
					let [selfDelegation, normalDelegations, boost, delegators] = await this.nodeGroup2Data(delegations, fnlAddresses, node, addressBinder);
					node.BEB = node.selfBond;
					node.boostDelegations = boost;
					node.boost = boost;
					node.selfDelegations = selfDelegation;
					node.normalDelegations = normalDelegations;
					node.totalSelfBond = selfDelegation + node.selfBond;
					node.delegators = delegators;
					node.totalStakeAmount = node.selfBond + node.boost + selfDelegation + normalDelegations;
				}
				node.cChainAddress = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(node.pChainAddress)).call();
				totalStakeNetwork += node.totalStakeAmount;

				// add node to its entity
				const i = entities.findIndex(entity => entity.entityAddress == node.ftsoAddress);
				if (i > -1) {
					entities[i].totalSelfBond += node.totalSelfBond
					entities[i].nodes.push({
						nodeId: node.nodeId,
						totalStakeRewarding: node.rewardingWeight,
						totalSelfBond: node.totalSelfBond,
					});
					// entity has more than four active nodes
					// nodes are already sorted by start time (increasing)
					if (entities[i].nodes.length > 4) {
						node.eligible = false;
					}
				} else {
					let nodes = [{
						nodeId: node.nodeId,
						totalStakeRewarding: node.rewardingWeight,
						totalSelfBond: node.totalSelfBond,
					}] as NodeEntity[];
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
				if (entities[i].totalSelfBond < minForBEB) {
					node.overboost = node.boost;
				} else {
					node.overboost = node.boost - node.BEB * BigInt(boostingFactor) > 0 ? node.boost - node.BEB * BigInt(boostingFactor) : BigInt(0);
				}
				node.rewardingWeight = node.totalStakeAmount - node.overboost;

				// update total stake for rewarding for entity
				entities[i].totalStakeRewarding += node.rewardingWeight;
			});

			//// calculate total stake amount and cap vote power (and then adjust total stake amount of network used for rewarding)
			let totalStakeRewarding = BigInt(0);
			[allActiveNodes, totalStakeRewarding, entities] = await this.getTotalStakeAndCapVP(allActiveNodes, votePowerCapBIPS, totalStakeNetwork, entities);

			// reward amount available for distribution
			if (rewardAmount === undefined) {
				rewardAmount = await this.getRewardAmount(validatorRewardManager, numUnrewardedEpochs);
			}

			this.logger.info(`entities: ${JSON.stringify(entities, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`);

			// calculated reward amount for each eligible node and for its delegators
			allActiveNodes = await this.calculateRewardAmounts(allActiveNodes, totalStakeRewarding, BigInt(rewardAmount));

			// for the reward epoch create JSON file with rewarded addresses and reward amounts
			// sum rewards per epoch and address
			rewardsData = await this.writeRewardedAddressesToJSON(allActiveNodes, BigInt(rewardAmount), epoch, rewardsData);
		}

		// for the  whole rewarding period create JSON file with rewarded addresses and reward amounts
		let rewardsDataJSON = JSON.stringify(rewardsData, (_, v) => typeof v === 'bigint' ? v.toString() : v);
		fs.writeFileSync(`rewards-epochs-${firstRewardEpoch}-${firstRewardEpoch + numUnrewardedEpochs - 1}.json`, rewardsDataJSON, "utf8");
	}


	public async getFtsoAddress(ftsoAddressFile: string) {
		let rawData = fs.readFileSync(ftsoAddressFile, "utf8");
		const parsed: { nodeId: string, ftsoAddress: string }[] = parse(rawData, {
			columns: true,
			skip_empty_lines: true,
			delimiter: ';',
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


	public async getFNLAddresses(fnlFile: string) {
		return JSON.parse(fs.readFileSync(fnlFile, 'utf8'));
	}

	public async getActiveStakes(vpBlock: number, apiPath: string) {
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
			let res = await axios.post(apiPath, queryObj);
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
		const parsed: { ftsoAddress: string, pChainAddress: string }[] = parse(rawData, {
			columns: true,
			skip_empty_lines: true,
			delimiter: ';',
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
		this.logger.info(JSON.stringify(votingData))

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
	public async isEligibleForReward(node: NodeData, eligibleNodesUptime: string[], ftsoAddresses: FtsoData[], ftsoRewardManager: FtsoRewardManager, epochNum: number, ftsoPerformanceForReward: number): Promise<[boolean, string]> {

		// find node's entity/ftso address
		let ftsoObj = ftsoAddresses.find(obj => {
			return obj.nodeId == node.nodeID;
		})
		let ftsoAddress = ftsoObj == undefined ? "" : ftsoObj.ftsoAddress;

		// uptime
		if (!eligibleNodesUptime.includes(nodeIdToBytes20(node.nodeID))) {
			return [false, ftsoAddress];
		}

		// ftso rewards
		let ftsoPerformance = await ftsoRewardManager.methods.getDataProviderPerformanceInfo(epochNum.toString(), ftsoObj.ftsoAddress).call();
		if (parseInt(ftsoPerformance[0]) <= ftsoPerformanceForReward) {
			return [false, ftsoAddress];
		}
		else {
			return [true, ftsoAddress];
		}
	}

	public async nodeGroup(node: NodeData, ftsoAddress: string, fnlAddresses: string[], pChainAddresses: PAddressData[], defaultFee: number): Promise<[string, ActiveNode]> {
		let nodeObj = {} as ActiveNode;
		nodeObj.nodeId = node.nodeID;
		nodeObj.bondingAddress = node.inputAddresses[0];
		nodeObj.selfBond = node.weight;
		nodeObj.ftsoAddress = ftsoAddress;
		nodeObj.stakeEnd = node.endTime;

		// node is in group 1
		if (fnlAddresses.includes(node.inputAddresses[0]) && node.weight == BigInt(10000000)) {
			// bind p chain address to node id
			const pAddr = pChainAddresses.find((obj) => obj.ftsoAddress == nodeObj.ftsoAddress);
			nodeObj.pChainAddress = pAddr.pChainAddress;
			nodeObj.fee = defaultFee;
			return ["group1", nodeObj];
		}
		nodeObj.fee = node.feePercentage;
		nodeObj.pChainAddress = nodeObj.bondingAddress;
		return ["group2", nodeObj];
	}

	public async getTotalStakeAndCapVP(activeNodes: ActiveNode[], votePowerCapFactor: number, totalStakeNetwork: bigint, entities: Entity[]): Promise<[ActiveNode[], bigint, Entity[]]> {

		// cap factor for entity
		entities.forEach(e => {
			let capBIPS = totalStakeNetwork * BigInt(votePowerCapFactor) / e.totalStakeRewarding;
			e.capFactor = capBIPS < 1e4 ? capBIPS : BigInt(1e4);
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

	public async getRewardAmount(validatorRewardManager: ValidatorRewardManager, numUnrewardedEpochs: number): Promise<bigint> {
		let totals = await validatorRewardManager.methods.getTotals().call();
		return (BigInt(totals[2]) - BigInt(totals[0])) / BigInt(numUnrewardedEpochs);
	}

	public async calculateRewardAmounts(activeNodes: ActiveNode[], totalStakeAmount: bigint, availableRewardAmount: bigint): Promise<ActiveNode[]> {

		// sort lexicographically by nodeID
		activeNodes.sort((a, b) => a.nodeId.toLowerCase() > b.nodeId.toLowerCase() ? 1 : -1);

		activeNodes.forEach(node => {
			if (node.eligible) {
				// reward amount available for a node
				node.nodeRewardAmount = node.cappedWeight * availableRewardAmount / totalStakeAmount;
				let nodeRemainingRewardAmount = node.nodeRewardAmount;
				let nodeRemainingWeight = node.rewardingWeight;
				availableRewardAmount -= node.nodeRewardAmount;
				totalStakeAmount -= node.cappedWeight;

				// fee amount, which validator (entity) receives
				let feeAmount = node.nodeRewardAmount * BigInt(node.fee) / BigInt(1e6);
				node.validatorRewardAmount = feeAmount;
				nodeRemainingRewardAmount -= feeAmount;

				// rewards (excluding fees) for total self bond (group1: self-delegations; group2: self-delegations + self-bond)
				let validatorSelfBondReward = nodeRemainingWeight > 0 ? node.totalSelfBond * nodeRemainingRewardAmount / nodeRemainingWeight : BigInt(0);
				node.validatorRewardAmount += validatorSelfBondReward;
				nodeRemainingRewardAmount -= validatorSelfBondReward;
				nodeRemainingWeight -= node.totalSelfBond;

				// adjusted reward (that would otherwise be earned by boosting addresses)
				let validatorAdjustedReward = nodeRemainingWeight > 0 ? (node.boost - node.overboost) * nodeRemainingRewardAmount / nodeRemainingWeight : BigInt(0);
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

		this.logger.info(`nodes: ${JSON.stringify(activeNodes, (_, v) => typeof v === 'bigint' ? v.toString() : v)}`)
		return activeNodes;
	}

	public async nodeGroup1Data(delegations: DelegationData[], node: ActiveNode, fnlAddresses: string[], addressBinder: AddressBinder): Promise<[bigint, bigint, bigint, bigint, DelegatorData[]]> {
		let selfDelegations = BigInt(0);
		let regularDelegations = BigInt(0);
		let delegators = [] as DelegatorData[];
		let BEB = BigInt(0);
		let boostDelegations = BigInt(0);
		let firstDelegationStartTime = Infinity;
		for (const delegation of delegations) {
			if (delegation.nodeID !== node.nodeId) continue;

			// self-delegation
			if (delegation.inputAddresses[0] === node.pChainAddress) {
				selfDelegations += delegation.weight;
				// first condition is redundant
				if (delegation.weight > 0 && delegation.startTime < firstDelegationStartTime && delegation.endTime >= node.stakeEnd) {
					BEB = delegation.weight;
					firstDelegationStartTime = delegation.startTime;
				}
			}
			// FNL delegation (boosting)
			else if (fnlAddresses.includes(delegation.inputAddresses[0])) {
				boostDelegations += delegation.weight;
			}
			// regular delegation
			else {
				regularDelegations += delegation.weight;
				// check if delegator already delegated to the node
				const i = delegators.findIndex(del => del.pAddress == delegation.inputAddresses[0]);
				if (i > -1) {
					delegators[i].amount += delegation.weight;
				} else {
					let cAddr = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(delegation.inputAddresses[0])).call();
					delegators.push({
						pAddress: delegation.inputAddresses[0],
						cAddress: cAddr,
						amount: delegation.weight
					});
				}
			}
		}
		return [selfDelegations, BEB, regularDelegations, boostDelegations, delegators];
	}

	public async nodeGroup2Data(delegations: DelegationData[], fnlAddresses: string[], node: ActiveNode, addressBinder: AddressBinder): Promise<[bigint, bigint, bigint, DelegatorData[]]> {
		let selfDelegations = BigInt(0);
		let regularDelegations = BigInt(0);
		let boost = BigInt(0);
		let delegators = [] as DelegatorData[];
		for (const delegation of delegations) {
			if (delegation.nodeID !== node.nodeId) continue;

			// self-delegation
			if (delegation.inputAddresses[0] === node.pChainAddress) {
				selfDelegations += delegation.weight;
			}
			// FNL delegation (boosting)
			else if (fnlAddresses.includes(delegation.inputAddresses[0])) {
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
					let cAddr = await addressBinder.methods.pAddressToCAddress(pAddressToBytes20(delegation.inputAddresses[0])).call();
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

	public async writeRewardedAddressesToJSON(activeNodes: ActiveNode[], availableRewardAmount: bigint, epoch: number, rewardsData: RewardsData[]): Promise<RewardsData[]> {

		let epochRewardsData = [] as RewardsData[];
		let distributed = BigInt(0);

		activeNodes.forEach(node => {
			if (node.eligible) {
				// TODO: use c-chain address
				let address = node.group == 1 ? node.pChainAddress : node.bondingAddress;
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
				const i = rewardsData.findIndex(obj => obj.address == address);
				if (i > -1) {
					rewardsData[i].amount += node.validatorRewardAmount;
				} else {
					rewardsData.push({
						address: address,
						amount: node.validatorRewardAmount
					});
				}

				node.delegators.forEach(delegator => {
					const index = epochRewardsData.findIndex(rewardedData => rewardedData.address == delegator.pAddress);
					if (index > -1) {
						epochRewardsData[index].amount += delegator.delegatorRewardAmount;
					}
					else {
						// TODO: use c-chain address
						epochRewardsData.push({
							address: delegator.pAddress,
							amount: delegator.delegatorRewardAmount
						});
					}
					distributed += delegator.delegatorRewardAmount;
					const i = rewardsData.findIndex(del => del.address === delegator.pAddress);
					if (i > -1) {
						rewardsData[i].amount += delegator.delegatorRewardAmount;
					}
					else {
						// TODO: use c-chain address
						rewardsData.push({
							address: delegator.pAddress,
							amount: delegator.delegatorRewardAmount
						});
					}
				})
			}
		});

		// check if everything was distributed
		if (distributed !== availableRewardAmount) {
			this.logger.error(`${distributed} was distributed, it should be ${availableRewardAmount}`);
		}

		let epochRewards = {
			rewardEpoch: epoch,
			distributedAmount: distributed,
			rewardedAddresses: epochRewardsData,
		}

		// write to JSON file
		let epochRewardsJSON = JSON.stringify(epochRewards, (_, v) => typeof v === 'bigint' ? v.toString() : v);
		fs.writeFileSync(`epoch-${epoch}-rewards.json`, epochRewardsJSON, "utf8");

		return rewardsData;
	}

}



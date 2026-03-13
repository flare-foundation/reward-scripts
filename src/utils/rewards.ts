import { Entity, NodeData, NodeInitialData, RewardsData, UptimeVote } from "./interfaces";

const BURN_ADDRESS = "0xD9e5B450773B17593abAfCF73aB96ad99d589751";

export function getUptimeEligibleNodes(votingData: UptimeVote[], threshold: number): string[] {
  const voteCount = votingData.reduce(
    (result: Record<string, number>, vote) => {
      vote.nodeIds.forEach((node) => {
        if (!result[node]) result[node] = 0;
        result[node]++;
      });
      return result;
    },
    {} as Record<string, number>
  );

  const eligibleNodesUptime: string[] = [];
  for (const key of Object.keys(voteCount)) {
    if (voteCount[key] >= threshold) eligibleNodesUptime.push(key);
  }
  return eligibleNodesUptime;
}

export function initialNodeData(node: NodeData, ftsoAddress: string): NodeInitialData {
  const nodeObj = {} as NodeInitialData;
  nodeObj.nodeId = node.nodeID;
  nodeObj.bondingAddress = node.inputAddresses[0];
  nodeObj.selfBond = node.weight;
  nodeObj.ftsoAddress = ftsoAddress;
  nodeObj.stakeEnd = node.endTime;
  nodeObj.pChainAddress = [];
  nodeObj.fee = node.feePercentage;
  nodeObj.pChainAddress.push(nodeObj.bondingAddress);
  return nodeObj;
}

export function getTotalStakeAndCapVP(
  activeNodes: NodeData[],
  votePowerCapFactor: number,
  totalStakeNetwork: bigint,
  entities: Entity[]
): [NodeData[], bigint, Entity[]] {
  // cap factor for entity
  entities.forEach((e) => {
    if (e.totalStakeRewarding !== BigInt(0)) {
      const capBIPS = (totalStakeNetwork * BigInt(votePowerCapFactor)) / e.totalStakeRewarding;
      e.capFactor = capBIPS < 1e4 ? capBIPS : BigInt(1e4);
    } else {
      // rewarding weight == overboost
      e.capFactor = BigInt(0);
    }
  });

  // total capped rewarding weight of eligible nodes
  let totalCappedWeightEligible = BigInt(0);

  // cap vote power to some percentage of total stake amount
  activeNodes.forEach((item) => {
    if (item.uptimeEligible) {
      const entity = entities.find((i) => i.entityAddress === item.ftsoAddress);
      item.cappedWeight = (item.rewardingWeight * entity.capFactor) / BigInt(1e4);
      totalCappedWeightEligible += item.cappedWeight;
    }
  });
  return [activeNodes, totalCappedWeightEligible, entities];
}

export function calculateRewardAmounts(
  activeNodes: NodeData[],
  totalStakeAmount: bigint,
  availableRewardAmount: bigint
): NodeData[] {
  // sort lexicographically by nodeID
  activeNodes.sort((a, b) => (a.nodeId.toLowerCase() > b.nodeId.toLowerCase() ? 1 : -1));

  activeNodes.forEach((node) => {
    if (node.uptimeEligible) {
      if (node.eligible) {
        // reward amount available for a node
        node.nodeRewardAmount =
          totalStakeAmount > BigInt(0) ? (node.cappedWeight * availableRewardAmount) / totalStakeAmount : BigInt(0);
        let nodeRemainingRewardAmount = node.nodeRewardAmount;
        let nodeRemainingWeight = node.rewardingWeight;
        availableRewardAmount -= node.nodeRewardAmount;
        totalStakeAmount -= node.cappedWeight;

        // fee amount, which validator (entity) receives
        const feeAmount = (node.nodeRewardAmount * BigInt(node.fee)) / BigInt(1e6);
        node.validatorRewardAmount = feeAmount;
        nodeRemainingRewardAmount -= feeAmount;

        // rewards (excluding fees) for total self bond (group1: self-delegations; group2: self-delegations + self-bond)
        const validatorSelfBondReward =
          nodeRemainingWeight > BigInt(0)
            ? (node.totalSelfBond * nodeRemainingRewardAmount) / nodeRemainingWeight
            : BigInt(0);
        node.validatorRewardAmount += validatorSelfBondReward;
        nodeRemainingRewardAmount -= validatorSelfBondReward;
        nodeRemainingWeight -= node.totalSelfBond;

        // adjusted reward (that would otherwise be earned by boosting addresses)
        const validatorAdjustedReward =
          nodeRemainingWeight > BigInt(0)
            ? ((node.boost - node.overboost) * nodeRemainingRewardAmount) / nodeRemainingWeight
            : BigInt(0);
        node.validatorRewardAmount += validatorAdjustedReward;
        nodeRemainingRewardAmount -= validatorAdjustedReward;
        nodeRemainingWeight -= node.boost - node.overboost;

        // rewards for delegators
        node.delegators.sort((a, b) => (a.pAddress.toLowerCase() > b.pAddress.toLowerCase() ? 1 : -1));
        node.delegators.forEach((delegator) => {
          delegator.delegatorRewardAmount =
            nodeRemainingWeight > 0 ? (delegator.amount * nodeRemainingRewardAmount) / nodeRemainingWeight : BigInt(0);
          nodeRemainingWeight -= delegator.amount;
          nodeRemainingRewardAmount -= delegator.delegatorRewardAmount;
        });
      } else {
        // node is not eligible for reward according to minimal conditions
        node.burnedRewardAmount =
          totalStakeAmount > BigInt(0) ? (node.cappedWeight * availableRewardAmount) / totalStakeAmount : BigInt(0);
        availableRewardAmount -= node.burnedRewardAmount;
        totalStakeAmount -= node.cappedWeight;
      }
    }
  });
  return activeNodes;
}

export interface AggregateRewardsResult {
  rewards: RewardsData[];
  distributed: bigint;
}

export function aggregateRewards(activeNodes: NodeData[], availableRewardAmount: bigint): AggregateRewardsResult {
  const epochRewardsData: RewardsData[] = [];
  let distributed = BigInt(0);

  activeNodes.forEach((node) => {
    if (node.uptimeEligible) {
      if (node.eligible) {
        const validatorRewardAmount = node.validatorRewardAmount;
        if (validatorRewardAmount !== BigInt(0)) {
          const address = node.cChainAddress;
          const index = epochRewardsData.findIndex((validator) => validator.address === address);
          if (index > -1) {
            epochRewardsData[index].amount += validatorRewardAmount;
          } else {
            epochRewardsData.push({
              address: address,
              amount: validatorRewardAmount,
            });
          }
          distributed += validatorRewardAmount;
        }

        node.delegators.forEach((delegator) => {
          const delegatorRewardingAddress = delegator.cAddress;
          const delegatorRewardAmount = delegator.delegatorRewardAmount;
          if (delegatorRewardAmount > BigInt(0)) {
            const index = epochRewardsData.findIndex(
              (rewardedData) => rewardedData.address === delegatorRewardingAddress
            );
            if (index > -1) {
              epochRewardsData[index].amount += delegatorRewardAmount;
            } else {
              epochRewardsData.push({
                address: delegatorRewardingAddress,
                amount: delegatorRewardAmount,
              });
            }
            distributed += delegatorRewardAmount;
          }
        });
      } else {
        const index = epochRewardsData.findIndex((recipient) => recipient.address === BURN_ADDRESS);
        if (index > -1) {
          epochRewardsData[index].amount += node.burnedRewardAmount;
        } else {
          epochRewardsData.push({
            address: BURN_ADDRESS,
            amount: node.burnedRewardAmount,
          });
        }
        distributed += node.burnedRewardAmount;
      }
    }
  });

  return { rewards: epochRewardsData, distributed };
}

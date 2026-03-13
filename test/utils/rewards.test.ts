import { expect } from "chai";
import {
  getUptimeEligibleNodes,
  initialNodeData,
  getTotalStakeAndCapVP,
  calculateRewardAmounts,
  aggregateRewards,
} from "../../src/utils/rewards";
import { Entity, NodeData, UptimeVote } from "../../src/utils/interfaces";

// Helper to create a minimal NodeData for testing
function makeNode(overrides: Partial<NodeData> = {}): NodeData {
  return {
    nodeID: "NodeID-test",
    inputAddresses: ["P-flare1abc"],
    weight: BigInt(1000),
    startTime: 1000,
    endTime: 2000,
    feePercentage: 0,
    // NodeInitialData fields
    nodeId: "NodeID-test",
    bondingAddress: "P-flare1abc",
    ftsoAddress: "0xEntity1",
    selfBond: BigInt(1000),
    pChainAddress: ["P-flare1abc"],
    selfDelegations: BigInt(0),
    boost: BigInt(0),
    normalDelegations: BigInt(0),
    boostDelegations: BigInt(0),
    totalStakeAmount: BigInt(1000),
    delegators: [],
    fee: 0,
    BEB: BigInt(1000),
    stakeEnd: 2000,
    totalSelfBond: BigInt(1000),
    uptimeEligible: true,
    // Extended NodeData fields
    eligible: true,
    overboost: BigInt(0),
    rewardingWeight: BigInt(1000),
    cappedWeight: BigInt(1000),
    ...overrides,
  };
}

describe("rewards", () => {
  describe("getUptimeEligibleNodes", () => {
    it("should return nodes that meet the vote threshold", () => {
      const votes: UptimeVote[] = [
        { voter: "voter1", nodeIds: ["nodeA", "nodeB"] },
        { voter: "voter2", nodeIds: ["nodeA", "nodeC"] },
        { voter: "voter3", nodeIds: ["nodeA"] },
      ];
      const result = getUptimeEligibleNodes(votes, 2);
      expect(result).to.include("nodeA"); // 3 votes
      expect(result).to.not.include("nodeC"); // 1 vote
    });

    it("should return empty array when no nodes meet threshold", () => {
      const votes: UptimeVote[] = [{ voter: "voter1", nodeIds: ["nodeA"] }];
      expect(getUptimeEligibleNodes(votes, 5)).to.deep.equal([]);
    });

    it("should return empty array for empty voting data", () => {
      expect(getUptimeEligibleNodes([], 1)).to.deep.equal([]);
    });

    it("should count votes from different voters independently", () => {
      const votes: UptimeVote[] = [
        { voter: "voter1", nodeIds: ["nodeA", "nodeB"] },
        { voter: "voter2", nodeIds: ["nodeB", "nodeC"] },
      ];
      const result = getUptimeEligibleNodes(votes, 2);
      expect(result).to.include("nodeB"); // 2 votes
      expect(result).to.not.include("nodeA"); // 1 vote
      expect(result).to.not.include("nodeC"); // 1 vote
    });

    it("should include nodes with exactly the threshold count", () => {
      const votes: UptimeVote[] = [
        { voter: "voter1", nodeIds: ["nodeA"] },
        { voter: "voter2", nodeIds: ["nodeA"] },
      ];
      const result = getUptimeEligibleNodes(votes, 2);
      expect(result).to.include("nodeA");
    });
  });

  describe("initialNodeData", () => {
    it("should transform NodeData to NodeInitialData", () => {
      const node: NodeData = makeNode({
        nodeID: "NodeID-abc",
        inputAddresses: ["P-flare1xyz"],
        weight: BigInt(5000),
        endTime: 9999,
        feePercentage: 150000,
      });
      const result = initialNodeData(node, "0xFtsoAddr");
      expect(result.nodeId).to.equal("NodeID-abc");
      expect(result.bondingAddress).to.equal("P-flare1xyz");
      expect(result.selfBond).to.equal(BigInt(5000));
      expect(result.ftsoAddress).to.equal("0xFtsoAddr");
      expect(result.stakeEnd).to.equal(9999);
      expect(result.fee).to.equal(150000);
      expect(result.pChainAddress).to.deep.equal(["P-flare1xyz"]);
    });
  });

  describe("getTotalStakeAndCapVP", () => {
    it("should cap entity vote power to percentage of total network stake", () => {
      const node = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        rewardingWeight: BigInt(6000),
      });
      const entities: Entity[] = [
        {
          entityAddress: "0xEntity1",
          nodes: ["node1"],
          totalSelfBond: BigInt(1000),
          totalStakeRewarding: BigInt(6000),
        },
      ];
      // totalStakeNetwork=10000, votePowerCapFactor=500 (5%)
      // capBIPS = (10000 * 500) / 6000 = 833
      // cappedWeight = (6000 * 833) / 10000 = 499
      const [, totalCapped] = getTotalStakeAndCapVP([node], 500, BigInt(10000), entities);
      expect(totalCapped).to.be.a("bigint");
      expect(totalCapped > BigInt(0)).to.be.true;
    });

    it("should not cap when entity is under the cap", () => {
      const node = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        rewardingWeight: BigInt(100),
      });
      const entities: Entity[] = [
        {
          entityAddress: "0xEntity1",
          nodes: ["node1"],
          totalSelfBond: BigInt(100),
          totalStakeRewarding: BigInt(100),
        },
      ];
      // totalStakeNetwork=10000, votePowerCapFactor=500 (5%)
      // capBIPS = (10000 * 500) / 100 = 50000 > 10000, so capFactor = 10000
      // cappedWeight = (100 * 10000) / 10000 = 100 (unchanged)
      const [, totalCapped] = getTotalStakeAndCapVP([node], 500, BigInt(10000), entities);
      expect(totalCapped).to.equal(BigInt(100));
    });

    it("should skip nodes that are not uptime eligible", () => {
      const node = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: false,
        rewardingWeight: BigInt(1000),
      });
      const entities: Entity[] = [
        {
          entityAddress: "0xEntity1",
          nodes: ["node1"],
          totalSelfBond: BigInt(1000),
          totalStakeRewarding: BigInt(1000),
        },
      ];
      const [, totalCapped] = getTotalStakeAndCapVP([node], 500, BigInt(10000), entities);
      expect(totalCapped).to.equal(BigInt(0));
    });

    it("should handle entity with zero rewarding weight", () => {
      const node = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        rewardingWeight: BigInt(0),
      });
      const entities: Entity[] = [
        {
          entityAddress: "0xEntity1",
          nodes: ["node1"],
          totalSelfBond: BigInt(0),
          totalStakeRewarding: BigInt(0),
        },
      ];
      const [, totalCapped, resultEntities] = getTotalStakeAndCapVP([node], 500, BigInt(10000), entities);
      expect(totalCapped).to.equal(BigInt(0));
      expect(resultEntities[0].capFactor).to.equal(BigInt(0));
    });
  });

  describe("calculateRewardAmounts", () => {
    it("should distribute rewards proportionally to eligible nodes", () => {
      const node1 = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(600),
        rewardingWeight: BigInt(600),
        totalSelfBond: BigInt(600),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });
      const node2 = makeNode({
        nodeId: "node2",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(400),
        rewardingWeight: BigInt(400),
        totalSelfBond: BigInt(400),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });
      const totalStake = BigInt(1000);
      const rewardAmount = BigInt(1000);

      const result = calculateRewardAmounts([node1, node2], totalStake, rewardAmount);
      // node1 gets 600/1000 * 1000 = 600
      // node2 gets 400/400 * 400 = 400 (remaining)
      const totalDistributed = result.reduce((sum, n) => sum + (n.nodeRewardAmount ?? BigInt(0)), BigInt(0));
      expect(totalDistributed).to.equal(rewardAmount);
    });

    it("should apply fee to validator reward", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(1000),
        rewardingWeight: BigInt(1000),
        totalSelfBond: BigInt(500),
        fee: 150000, // 15% in PPM
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [{ pAddress: "P-del1", cAddress: "0xDel1", amount: BigInt(500) }],
      });
      calculateRewardAmounts([node], BigInt(1000), BigInt(1000));
      // fee = 1000 * 150000 / 1000000 = 150
      // remaining after fee: 850
      // self-bond reward: 500/1000 * 850 = 425
      // validator total: 150 + 425 = 575
      expect(node.validatorRewardAmount).to.equal(BigInt(575));
      // delegator gets rest: 850 - 425 = 425
      expect(node.delegators[0].delegatorRewardAmount).to.equal(BigInt(425));
    });

    it("should burn rewards for ineligible nodes with uptime", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: false,
        cappedWeight: BigInt(1000),
        rewardingWeight: BigInt(1000),
      });
      calculateRewardAmounts([node], BigInt(1000), BigInt(1000));
      expect(node.burnedRewardAmount).to.equal(BigInt(1000));
    });

    it("should skip nodes without uptime eligibility", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: false,
        eligible: true,
        cappedWeight: BigInt(1000),
      });
      calculateRewardAmounts([node], BigInt(1000), BigInt(1000));
      expect(node.nodeRewardAmount).to.be.undefined;
      expect(node.burnedRewardAmount).to.be.undefined;
    });

    it("should handle zero total stake without division error", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(0),
        rewardingWeight: BigInt(0),
        totalSelfBond: BigInt(0),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });
      const result = calculateRewardAmounts([node], BigInt(0), BigInt(1000));
      expect(result[0].nodeRewardAmount).to.equal(BigInt(0));
    });

    it("should distribute to multiple delegators proportionally", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(1000),
        rewardingWeight: BigInt(1000),
        totalSelfBond: BigInt(0),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [
          { pAddress: "P-del1", cAddress: "0xDel1", amount: BigInt(700) },
          { pAddress: "P-del2", cAddress: "0xDel2", amount: BigInt(300) },
        ],
      });
      calculateRewardAmounts([node], BigInt(1000), BigInt(1000));
      const del1Reward = node.delegators[0].delegatorRewardAmount;
      const del2Reward = node.delegators[1].delegatorRewardAmount;
      expect(del1Reward + del2Reward).to.equal(BigInt(1000));
      expect(del1Reward).to.equal(BigInt(700));
      expect(del2Reward).to.equal(BigInt(300));
    });
  });

  describe("aggregateRewards", () => {
    it("should aggregate rewards by address", () => {
      const node1 = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cChainAddress: "0xValidator1",
        validatorRewardAmount: BigInt(500),
        delegators: [
          { pAddress: "P-del1", cAddress: "0xDel1", amount: BigInt(100), delegatorRewardAmount: BigInt(200) },
        ],
      });
      const node2 = makeNode({
        nodeId: "node2",
        uptimeEligible: true,
        eligible: true,
        cChainAddress: "0xValidator1", // same validator
        validatorRewardAmount: BigInt(300),
        delegators: [],
      });

      const { rewards, distributed } = aggregateRewards([node1, node2], BigInt(1000));
      const validatorReward = rewards.find((r) => r.address === "0xValidator1");
      expect(validatorReward.amount).to.equal(BigInt(800)); // 500 + 300
      expect(distributed).to.equal(BigInt(1000)); // 500 + 300 + 200
    });

    it("should send ineligible node rewards to burn address", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: false,
        burnedRewardAmount: BigInt(1000),
      });
      const { rewards, distributed } = aggregateRewards([node], BigInt(1000));
      const burnEntry = rewards.find((r) => r.address === "0xD9e5B450773B17593abAfCF73aB96ad99d589751");
      expect(burnEntry).to.not.be.undefined;
      expect(burnEntry.amount).to.equal(BigInt(1000));
      expect(distributed).to.equal(BigInt(1000));
    });

    it("should skip nodes without uptime eligibility", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: false,
        validatorRewardAmount: BigInt(500),
      });
      const { rewards, distributed } = aggregateRewards([node], BigInt(500));
      expect(rewards).to.have.length(0);
      expect(distributed).to.equal(BigInt(0));
    });

    it("should skip delegators with zero reward", () => {
      const node = makeNode({
        nodeId: "node1",
        uptimeEligible: true,
        eligible: true,
        cChainAddress: "0xVal",
        validatorRewardAmount: BigInt(100),
        delegators: [{ pAddress: "P-del1", cAddress: "0xDel1", amount: BigInt(50), delegatorRewardAmount: BigInt(0) }],
      });
      const { rewards } = aggregateRewards([node], BigInt(100));
      expect(rewards).to.have.length(1);
      expect(rewards[0].address).to.equal("0xVal");
    });

    it("should return empty for empty input", () => {
      const { rewards, distributed } = aggregateRewards([], BigInt(0));
      expect(rewards).to.deep.equal([]);
      expect(distributed).to.equal(BigInt(0));
    });
  });
});

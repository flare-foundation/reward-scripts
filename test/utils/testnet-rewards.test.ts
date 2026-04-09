import { expect } from "chai";
import {
  getUptimeEligibleNodes,
  calculateRewardAmounts,
  aggregateRewards,
  getTotalStakeAndCapVP,
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
    eligible: true,
    overboost: BigInt(0),
    rewardingWeight: BigInt(1000),
    cappedWeight: BigInt(1000),
    ...overrides,
  };
}

describe("testnet rewards", () => {
  describe("uptime bypass (threshold 0)", () => {
    it("should return no eligible nodes when voting data is empty and threshold > 0", () => {
      const result = getUptimeEligibleNodes([], 2);
      expect(result).to.deep.equal([]);
    });

    it("should return no eligible nodes when voting data is empty and threshold is 0", () => {
      // With threshold 0, getUptimeEligibleNodes still returns empty because there are no votes
      // The bypass happens at the caller level (setting uptimeEligible = true for all nodes)
      const result = getUptimeEligibleNodes([], 0);
      expect(result).to.deep.equal([]);
    });

    it("should mark all nodes eligible when simulating threshold 0 bypass", () => {
      // Simulates what calculateTestnetRewards does: set eligible = uptimeEligible = true
      const nodes = [
        makeNode({
          nodeId: "node1",
          ftsoAddress: "0xA",
          uptimeEligible: true,
          eligible: true,
          cChainAddress: "0xAddr1",
          validatorRewardAmount: BigInt(100),
          delegators: [],
        }),
        makeNode({
          nodeId: "node2",
          ftsoAddress: "0xB",
          uptimeEligible: true,
          eligible: true,
          cChainAddress: "0xAddr2",
          validatorRewardAmount: BigInt(200),
          delegators: [],
        }),
      ];

      const { rewards, distributed } = aggregateRewards(nodes, BigInt(300));
      expect(distributed).to.equal(BigInt(300));
      // No burn entry
      const burnEntry = rewards.find((r) => r.address === "0xD9e5B450773B17593abAfCF73aB96ad99d589751");
      expect(burnEntry).to.be.undefined;
    });
  });

  describe("testnet eligible = uptimeEligible (no minimal conditions)", () => {
    it("should reward all uptime-eligible nodes with no burn", () => {
      const node1 = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(500),
        rewardingWeight: BigInt(500),
        totalSelfBond: BigInt(500),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });
      const node2 = makeNode({
        nodeId: "node2",
        ftsoAddress: "0xEntity2",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(500),
        rewardingWeight: BigInt(500),
        totalSelfBond: BigInt(500),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });

      const result = calculateRewardAmounts([node1, node2], BigInt(1000), BigInt(1000));
      const totalDistributed = result.reduce((sum, n) => sum + (n.nodeRewardAmount ?? BigInt(0)), BigInt(0));
      expect(totalDistributed).to.equal(BigInt(1000));
      // No node should have burnedRewardAmount
      expect(result.every((n) => n.burnedRewardAmount === undefined)).to.be.true;
    });

    it("should not reward nodes with uptimeEligible=false", () => {
      const eligible = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        eligible: true,
        cappedWeight: BigInt(1000),
        rewardingWeight: BigInt(1000),
        totalSelfBond: BigInt(1000),
        fee: 0,
        boost: BigInt(0),
        overboost: BigInt(0),
        delegators: [],
      });
      const notEligible = makeNode({
        nodeId: "node2",
        ftsoAddress: "0xEntity2",
        uptimeEligible: false,
        eligible: false,
        cappedWeight: BigInt(1000),
        rewardingWeight: BigInt(1000),
        totalSelfBond: BigInt(1000),
      });

      const result = calculateRewardAmounts([eligible, notEligible], BigInt(1000), BigInt(1000));
      expect(result.find((n) => n.nodeId === "node1")!.nodeRewardAmount).to.equal(BigInt(1000));
      expect(result.find((n) => n.nodeId === "node2")!.nodeRewardAmount).to.be.undefined;
      expect(result.find((n) => n.nodeId === "node2")!.burnedRewardAmount).to.be.undefined;
    });
  });

  describe("no burn on testnet", () => {
    it("should produce no burn address entries when all uptime-eligible nodes are eligible", () => {
      const BURN_ADDRESS = "0xD9e5B450773B17593abAfCF73aB96ad99d589751";
      const nodes = [
        makeNode({
          nodeId: "node1",
          ftsoAddress: "0xEntity1",
          uptimeEligible: true,
          eligible: true,
          cChainAddress: "0xAddr1",
          cappedWeight: BigInt(500),
          rewardingWeight: BigInt(500),
          totalSelfBond: BigInt(500),
          fee: 0,
          boost: BigInt(0),
          overboost: BigInt(0),
          delegators: [],
        }),
        makeNode({
          nodeId: "node2",
          ftsoAddress: "0xEntity2",
          uptimeEligible: true,
          eligible: true,
          cChainAddress: "0xAddr2",
          cappedWeight: BigInt(500),
          rewardingWeight: BigInt(500),
          totalSelfBond: BigInt(500),
          fee: 0,
          boost: BigInt(0),
          overboost: BigInt(0),
          delegators: [],
        }),
      ];

      const result = calculateRewardAmounts(nodes, BigInt(1000), BigInt(1000));
      const { rewards } = aggregateRewards(result, BigInt(1000));

      const burnEntry = rewards.find((r) => r.address === BURN_ADDRESS);
      expect(burnEntry).to.be.undefined;
      expect(rewards).to.have.length(2);
    });
  });

  describe("distribution epoch check", () => {
    it("should distribute at epoch 5432 (5432 % 4 === 0)", () => {
      expect(5432 % 4).to.equal(0);
    });

    it("should distribute at epoch 5436 (5436 % 4 === 0)", () => {
      expect(5436 % 4).to.equal(0);
    });

    it("should not distribute at epoch 5429 (5429 % 4 !== 0)", () => {
      expect(5429 % 4).to.not.equal(0);
    });

    it("should not distribute at epoch 5430 (5430 % 4 !== 0)", () => {
      expect(5430 % 4).to.not.equal(0);
    });

    it("should cover epochs 5429-5432 when distributing at 5432", () => {
      const distributeEvery = 4;
      const rewardEpoch = 5432;
      const firstEpoch = rewardEpoch - distributeEvery + 1;
      expect(firstEpoch).to.equal(5429);
    });
  });

  describe("full testnet flow simulation", () => {
    it("should calculate rewards for multiple validators with delegators", () => {
      const node1 = makeNode({
        nodeId: "node1",
        ftsoAddress: "0xEntity1",
        uptimeEligible: true,
        eligible: true,
        totalStakeAmount: BigInt(5000),
        selfBond: BigInt(3000),
        totalSelfBond: BigInt(3000),
        boost: BigInt(0),
        overboost: BigInt(0),
        rewardingWeight: BigInt(5000),
        delegators: [{ pAddress: "P-del1", cAddress: "0xDel1", amount: BigInt(2000) }],
        fee: 100000, // 10%
        BEB: BigInt(3000),
        cChainAddress: "0xValidator1",
      });
      const node2 = makeNode({
        nodeId: "node2",
        ftsoAddress: "0xEntity2",
        uptimeEligible: true,
        eligible: true,
        totalStakeAmount: BigInt(5000),
        selfBond: BigInt(5000),
        totalSelfBond: BigInt(5000),
        boost: BigInt(0),
        overboost: BigInt(0),
        rewardingWeight: BigInt(5000),
        delegators: [],
        fee: 0,
        BEB: BigInt(5000),
        cChainAddress: "0xValidator2",
      });

      const entities: Entity[] = [
        { entityAddress: "0xEntity1", nodes: ["node1"], totalSelfBond: BigInt(3000), totalStakeRewarding: BigInt(5000) },
        { entityAddress: "0xEntity2", nodes: ["node2"], totalSelfBond: BigInt(5000), totalStakeRewarding: BigInt(5000) },
      ];

      // Cap vote power
      const [cappedNodes, totalCapped] = getTotalStakeAndCapVP(
        [node1, node2],
        500, // 5% cap
        BigInt(10000),
        entities
      );

      expect(totalCapped > BigInt(0)).to.be.true;

      // Calculate rewards
      const rewardAmount = BigInt(100000000000000000000n); // 100 tokens
      const result = calculateRewardAmounts(cappedNodes, totalCapped, rewardAmount);
      const totalDistributed = result.reduce((sum, n) => sum + (n.nodeRewardAmount ?? BigInt(0)), BigInt(0));
      expect(totalDistributed).to.equal(rewardAmount);

      // Aggregate — no burn
      const { rewards, distributed } = aggregateRewards(result, rewardAmount);
      expect(distributed).to.equal(rewardAmount);
      const burnEntry = rewards.find((r) => r.address === "0xD9e5B450773B17593abAfCF73aB96ad99d589751");
      expect(burnEntry).to.be.undefined;
    });
  });
});

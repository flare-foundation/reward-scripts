import { expect } from "chai";
import * as sinon from "sinon";
import { EventProcessorService } from "../../src/services/EventProcessorService";

// Helper to create a mock EventProcessorService with stubbed dependencies
function createService() {
  const service = new EventProcessorService();

  const mockWeb3 = {
    eth: {
      getBlock: sinon.stub(),
      getBlockNumber: sinon.stub(),
    },
  };

  const mockContractService = {
    web3: mockWeb3,
    getEventsFromBlockForContract: sinon.stub().resolves([]),
    processBatches: sinon.stub().resolves([]),
    processEvents: sinon.stub(),
  };

  const mockLogger = {
    info: sinon.stub(),
    error: sinon.stub(),
  };

  // Override IoC-injected dependencies directly
  (service as any).contractService = mockContractService;
  (service as any).loggerService = { logger: mockLogger };

  return { service, mockWeb3, mockContractService, mockLogger };
}

describe("EventProcessorService", () => {
  afterEach(() => {
    sinon.restore();
  });

  it("should exit early if voting period has not ended", async () => {
    const { service, mockWeb3, mockContractService, mockLogger } = createService();

    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 1500 }); // < votingEndTs (1600)

    await service.processEvents(100, 3, 30, 600, 1000, 1);

    expect(mockLogger.error.calledWith("Voting period did not yet end")).to.be.true;
    expect(mockContractService.getEventsFromBlockForContract.called).to.be.false;
  });

  it("should not process any batches when first block is past voting end", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 2000 }); // > votingEndTs (1100)
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 2500 });

    await service.processEvents(100, 10000, 30, 100, 1000, 1);

    expect(mockContractService.getEventsFromBlockForContract.called).to.be.false;
  });

  it("should process events in batches with rate limiting", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    // firstBlock=100, batchSize=30, rps=10000 (fast), votingStart=1000, votingLength=100
    // votingEndTs = 1100
    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 1200 }); // > 1100, proceed

    // Batch 1: blocks 100-129, then nextBlock=130
    mockWeb3.eth.getBlock.withArgs(130).resolves({ timestamp: 1050 }); // <= 1100, continue
    // Batch 2: blocks 130-159, then nextBlock=160
    mockWeb3.eth.getBlock.withArgs(160).resolves({ timestamp: 1150 }); // > 1100, stop

    await service.processEvents(100, 10000, 30, 100, 1000, 1);

    expect(mockContractService.getEventsFromBlockForContract.callCount).to.equal(2);
    expect(mockContractService.getEventsFromBlockForContract.firstCall.args).to.deep.equal([
      "PChainStakeMirrorMultiSigVoting",
      100,
      129,
      false,
    ]);
    expect(mockContractService.getEventsFromBlockForContract.secondCall.args).to.deep.equal([
      "PChainStakeMirrorMultiSigVoting",
      130,
      159,
      false,
    ]);
    expect(mockContractService.processEvents.callCount).to.equal(2);
  });

  it("should use processBatches when rps is Infinity", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 1200 });

    // endBlock = min(100 + 30*30 - 1, 199) = min(999, 199) = 199, nextBlock = 200
    mockWeb3.eth.getBlock.withArgs(200).resolves({ timestamp: 1300 }); // > 1100, stop

    await service.processEvents(100, Infinity, 30, 100, 1000, 1);

    expect(mockContractService.processBatches.callCount).to.equal(1);
    expect(mockContractService.processBatches.firstCall.args).to.deep.equal([
      "PChainStakeMirrorMultiSigVoting",
      100,
      199,
      30,
    ]);
    expect(mockContractService.getEventsFromBlockForContract.called).to.be.false;
    expect(mockContractService.processEvents.callCount).to.equal(1);
  });

  it("should cap endBlock at lastBlock", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    // Only 5 blocks available (100-104), batchSize=30
    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(105); // lastBlock = 104
    mockWeb3.eth.getBlock.withArgs(104).resolves({ timestamp: 1200 });

    // endBlock = min(100 + 30 - 1, 104) = 104, nextBlock = 105
    mockWeb3.eth.getBlock.withArgs(105).resolves({ timestamp: 1300 }); // > 1100, stop

    await service.processEvents(100, 10000, 30, 100, 1000, 1);

    expect(mockContractService.getEventsFromBlockForContract.firstCall.args[2]).to.equal(104);
  });

  it("should pass correct epochId and voting timestamps to processEvents", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 1200 });
    mockWeb3.eth.getBlock.withArgs(130).resolves({ timestamp: 1150 }); // > 1100, stop

    await service.processEvents(100, 10000, 30, 100, 1000, 42);

    expect(mockContractService.processEvents.firstCall.args).to.deep.equal([[], 42, 1000, 1100]);
  });

  it("should continue processing after an error in a batch", async () => {
    const { service, mockWeb3, mockContractService } = createService();

    mockWeb3.eth.getBlock.withArgs(100).resolves({ timestamp: 1000 });
    mockWeb3.eth.getBlockNumber.resolves(200);
    mockWeb3.eth.getBlock.withArgs(199).resolves({ timestamp: 1200 });

    // First call fails — nextBlockToProcess stays at 100 (error caught, retries same range)
    // Second call succeeds
    mockContractService.getEventsFromBlockForContract
      .onFirstCall()
      .rejects(new Error("RPC error"))
      .onSecondCall()
      .resolves([]);

    // After retry succeeds: nextBlock=130
    mockWeb3.eth.getBlock.withArgs(130).resolves({ timestamp: 1150 }); // > 1100, stop

    await service.processEvents(100, 10000, 30, 100, 1000, 1);

    // Called twice: first fails (retry same range), second succeeds
    expect(mockContractService.getEventsFromBlockForContract.callCount).to.equal(2);
    // Both calls target the same block range since nextBlockToProcess didn't advance on error
    expect(mockContractService.getEventsFromBlockForContract.firstCall.args[1]).to.equal(100);
    expect(mockContractService.getEventsFromBlockForContract.secondCall.args[1]).to.equal(100);
  });
});

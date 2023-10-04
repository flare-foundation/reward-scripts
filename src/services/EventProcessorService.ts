import { Factory, Inject, Singleton } from 'typescript-ioc';
import { ConfigurationService } from './ConfigurationService';
import { LoggerService } from './LoggerService';
import { ContractService } from './ContractService';
import { AttLogger, logException } from '../logger/logger';
import { sleepms } from '../utils/utils';

@Singleton
@Factory(() => new EventProcessorService())
export class EventProcessorService {
    @Inject
    configurationService: ConfigurationService;

    @Inject
    loggerService: LoggerService;

    @Inject
    contractService: ContractService;

    get logger(): AttLogger {
        return this.loggerService.logger;
    }

    public async processEvents(firstBlockToProcess: number, rps: number, batchSize: number, votingLength: number, votingStartTs: number, epochId: number) {
        let nextBlockToProcess = firstBlockToProcess;
        this.logger.info(`^Rnetwork event processing for reward epoch ${epochId} started ^Y${nextBlockToProcess}`);
        let endBlock = 0;
        let nextBlockToProcessTs = (await this.contractService.web3.eth.getBlock(nextBlockToProcess)).timestamp as number;
        let votingEndTs = votingStartTs + votingLength;
        let lastBlock = await this.contractService.web3.eth.getBlockNumber();
        let lastBlockTs = (await this.contractService.web3.eth.getBlock(lastBlock)).timestamp as number
        // votes casted outside of voting period are not relevant, so we don't need to read those events
        if (lastBlockTs < votingEndTs) {
            this.logger.error(`Voting period did not yet end`);
            return;
        }
        while (nextBlockToProcessTs < votingEndTs) {
            try {
                this.logger.info(`Next block ${nextBlockToProcess}`);
                if (rps != Infinity) {
                    endBlock = nextBlockToProcess + batchSize - 1;
                    if (endBlock >= lastBlock) {
                        endBlock = lastBlock;
                    }
                    // https://flare-api.flare.network has rate limit 200 rpm
                    await sleepms(1000 / rps);
                    let contractEventBatches = await this.contractService.getEventsFromBlockForContract(
                        "PChainStakeMirrorMultiSigVoting",
                        nextBlockToProcess,
                        endBlock,
                        false
                    );
                    nextBlockToProcess = endBlock;
                    await this.contractService.processEvents(contractEventBatches, epochId, votingStartTs, votingEndTs);
                }
                else {
                    endBlock = nextBlockToProcess + 30 * batchSize - 1;
                    if (endBlock >= lastBlock) {
                        endBlock = lastBlock;
                    }
                    let contractEventBatches = await this.contractService.processBatches(
                        "PChainStakeMirrorMultiSigVoting",
                        nextBlockToProcess,
                        endBlock,
                        batchSize
                    );
                    nextBlockToProcess = endBlock;
                    await this.contractService.processEvents(contractEventBatches, epochId, votingStartTs, votingEndTs);
                }
                nextBlockToProcessTs = (await this.contractService.web3.eth.getBlock(nextBlockToProcess)).timestamp as number;
            } catch (error) {
                logException(error, `EventProcessorService::processEvents`);
            }
        }
    }
}
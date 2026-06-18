import * as fs from "fs";
import glob from "glob";
import Web3 from "web3";
import * as _ from "lodash";
import { BinTools } from "@flarenetwork/flarejs";
import { bech32 } from "bech32";
import type { AttLogger } from "../logger/logger";

export const BIPS = 10_000;
const bintools = BinTools.getInstance();

export interface ContractWithAbi {
  contract: unknown;
  abi: string;
}

interface JsonRpcResponse {
  jsonrpc: string;
  id: string | number;
  result?: unknown;
  error?: {
    readonly code?: number;
    readonly data?: unknown;
    readonly message: string;
  };
}

export interface RetryableHttpProvider {
  send(payload: object, callback?: (error: Error | null, result: JsonRpcResponse | undefined) => void): void;
}

export interface RpcRetryOptions {
  attempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoff?: number;
}

const DEFAULT_RPC_RETRY_ATTEMPTS = 5;
const DEFAULT_RPC_RETRY_INITIAL_DELAY_MS = 1000;
const DEFAULT_RPC_RETRY_MAX_DELAY_MS = 10000;
const DEFAULT_RPC_RETRY_BACKOFF = 2;

export async function sleepms(milliseconds: number) {
  await new Promise<void>((resolve) => {
    setTimeout(() => {
      resolve();
    }, milliseconds);
  });
}

export function round(x: number, decimal: number = 0) {
  if (decimal === 0) return Math.round(x);

  const dec10 = 10 ** decimal;

  return Math.round(x * dec10) / dec10;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return JSON.stringify(error) ?? String(error);
}

export function isRetryableRpcError(error: unknown): boolean {
  const message = errorMessage(error);
  return [
    "Invalid JSON RPC response",
    "CONNECTION ERROR",
    "CONNECTION TIMEOUT",
    "ECONNRESET",
    "ETIMEDOUT",
    "EAI_AGAIN",
    "socket hang up",
    "fetch failed",
    "Too Many Requests",
    "429",
    "502",
    "503",
    "504",
  ].some((retryableMessage) => message.includes(retryableMessage));
}

function rpcMethodName(payload: object): string {
  if (Array.isArray(payload)) {
    return "batch";
  }

  const method = (payload as { method?: unknown }).method;
  return typeof method === "string" ? method : "unknown";
}

export function addRpcRetry<T extends RetryableHttpProvider>(
  provider: T,
  logger?: Pick<AttLogger, "warning">,
  options: RpcRetryOptions = {}
): T {
  const attempts = Math.max(1, options.attempts ?? DEFAULT_RPC_RETRY_ATTEMPTS);
  const initialDelayMs = options.initialDelayMs ?? DEFAULT_RPC_RETRY_INITIAL_DELAY_MS;
  const maxDelayMs = options.maxDelayMs ?? DEFAULT_RPC_RETRY_MAX_DELAY_MS;
  const backoff = options.backoff ?? DEFAULT_RPC_RETRY_BACKOFF;
  const send = provider.send.bind(provider);

  provider.send = ((payload, callback) => {
    if (!callback) {
      send(payload);
      return;
    }

    let attempt = 1;
    let delayMs = initialDelayMs;
    const method = rpcMethodName(payload);

    const sendOnce = () => {
      send(payload, (error, result) => {
        if (error && attempt < attempts && isRetryableRpcError(error)) {
          logger?.warning?.(
            `Retrying RPC ${method} after transient error (${attempt}/${attempts}): ${errorMessage(error)}`
          );
          attempt++;
          setTimeout(sendOnce, delayMs);
          delayMs = Math.min(Math.round(delayMs * backoff), maxDelayMs);
          return;
        }

        callback(error, result);
      });
    };

    sendOnce();
  }) as T["send"];

  return provider;
}

export function getWeb3(rpcLink: string, logger?: AttLogger) {
  const web3 = new Web3();
  if (rpcLink.startsWith("http")) {
    web3.setProvider(addRpcRetry(new Web3.providers.HttpProvider(rpcLink), logger));
  } else if (rpcLink.startsWith("ws")) {
    const provider = new Web3.providers.WebsocketProvider(rpcLink, {
      clientConfig: {
        keepalive: true,
        keepaliveInterval: 60000, // milliseconds
      },
      reconnect: {
        auto: true,
        delay: 2500,
        onTimeout: true,
      },
    });
    provider.on("close", () => {
      if (logger) {
        logger.error(` ! Network WS connection closed.`);
      }
    });
    web3.setProvider(provider);
  }
  web3.eth.handleRevert = true;
  // web3.eth.defaultCommon = { customChain: { name: 'coston', chainId: 20210413, networkId: 20210413 }, baseChain: 'ropsten', hardfork: 'petersburg' };
  //    }
  return web3;
}

export function getAbi(abiPath: string) {
  let abi = JSON.parse(fs.readFileSync(abiPath).toString()) as Record<string, unknown>;
  if (abi.abi) {
    abi = abi.abi as Record<string, unknown>;
  }
  return abi;
}

export async function getWeb3Contract(web3: Web3, address: string, name: string) {
  const contractData = await getWeb3ContractWithAbi(web3, address, name);
  return contractData.contract;
}

export async function getWeb3ContractWithAbi(web3: Web3, address: string, name: string): Promise<ContractWithAbi> {
  let abiPath = "";
  try {
    abiPath = await relativeContractABIPathForContractName(name, "artifacts");
    const abi = getAbi(`artifacts/${abiPath}`);
    return {
      contract: new web3.eth.Contract(abi as unknown as ConstructorParameters<typeof web3.eth.Contract>[0], address),
      abi: abi as unknown as string,
    };
  } catch (e: unknown) {
    const errorMsg = e instanceof Error ? e.message : JSON.stringify(e);
    console.error(`getWeb3Contract error - ABI not found: ${errorMsg}`);
    return {
      contract: undefined,
      abi: "",
    };
  }
}

export function waitFinalize3Factory(web3: Web3) {
  return async (address: string, func: () => unknown, delay: number = 1000) => {
    const nonce = await web3.eth.getTransactionCount(address);
    const res = await func();
    const backoff = 1.5;
    let cnt = 0;
    while ((await web3.eth.getTransactionCount(address)) === nonce) {
      await new Promise<void>((resolve) => {
        setTimeout(() => {
          resolve();
        }, delay);
      });
      if (cnt < 8) {
        delay = Math.floor(delay * backoff);
        cnt++;
      } else {
        throw new Error("Response timeout");
      }
      console.log(`Delay backoff ${delay} (${cnt})`);
    }
    return res;
  };
}

export async function relativeContractABIPathForContractName(
  name: string,
  artifactsRoot = "artifacts"
): Promise<string> {
  return new Promise((resolve, reject) => {
    (glob as (pattern: string, options: { cwd: string }, cb: (er: Error | null, files: string[]) => void) => void)(
      `contracts/**/${name}.sol/${name}.json`,
      { cwd: artifactsRoot },
      (er: Error | null, files: string[]) => {
        if (er) {
          reject(er);
        } else {
          if (files && files.length === 1) {
            resolve(files[0]!);
          } else {
            reject(new Error(`Expected 1 file but found: ${files?.join(", ") ?? "none"}`));
          }
        }
      }
    );
  });
}

interface SortableRecord {
  [key: string]: unknown;
  rewardRate?: number | string;
}

export function compareObjArray(arr1: SortableRecord[], arr2: SortableRecord[], sortBy: string) {
  if (arr1.length !== arr2.length) return false;

  // sort array by object key
  const arr1Sorted = arr1.sort((a, b) =>
    (a[sortBy] as string) > (b[sortBy] as string) ? 1 : (b[sortBy] as string) > (a[sortBy] as string) ? -1 : 0
  );
  const arr2Sorted = arr2.sort((a, b) =>
    (a[sortBy] as string) > (b[sortBy] as string) ? 1 : (b[sortBy] as string) > (a[sortBy] as string) ? -1 : 0
  );

  // round rewardRate to 9 decimals to avoid percision mistakes
  arr1Sorted.forEach((obj) => {
    const hasKeyRewardRate = "rewardRate" in obj;
    if (hasKeyRewardRate) {
      obj.rewardRate = (obj.rewardRate as number).toFixed(9);
    }
  });

  arr2Sorted.forEach((obj) => {
    const hasKeyRewardRate = "rewardRate" in obj;
    if (hasKeyRewardRate) {
      obj.rewardRate = (obj.rewardRate as number).toFixed(9);
    }
  });

  for (let i = 0; i < arr1Sorted.length; i++) {
    if (!_.isEqual(arr1Sorted[i], arr2Sorted[i])) return false;
  }

  return true;
}

export function compareArray(arr1: unknown[], arr2: unknown[]) {
  if (arr1.length !== arr2.length) return false;

  return _.isEqual(arr1.sort(), arr2.sort());
}

export function nodeIdToBytes20(nodeId: string) {
  return "0x" + bintools.cb58Decode(nodeId.slice(7)).toString("hex");
}

export function pAddressToBytes20(pAddress: string) {
  return "0x" + Buffer.from(bech32.fromWords(bech32.decode(pAddress).words)).toString("hex");
}

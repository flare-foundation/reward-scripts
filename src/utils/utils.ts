import * as fs from 'fs';
import glob from 'glob';
import Web3 from 'web3';
import * as _ from 'lodash';
import { BinTools } from '@flarenetwork/flarejs'
import { bech32 } from 'bech32';

export const BIPS = 10_000;
const bintools = BinTools.getInstance()

export interface ContractWithAbi {
   contract: any;
   abi: string;
}

export async function sleepms(milliseconds: number) {
   await new Promise((resolve: any) => {
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


export function getWeb3(rpcLink: string, logger?: any) {
   const web3 = new Web3();
   if (rpcLink.startsWith('http')) {
      web3.setProvider(new Web3.providers.HttpProvider(rpcLink));
   } else if (rpcLink.startsWith('ws')) {
      const provider = new Web3.providers.WebsocketProvider(rpcLink, {
         // @ts-ignore
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
      provider.on('close', () => {
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
   let abi = JSON.parse(fs.readFileSync(abiPath).toString());
   if (abi.abi) {
      abi = abi.abi;
   }
   return abi;
}

export async function getWeb3Contract(web3: any, address: string, name: string) {
   let contractData = await getWeb3ContractWithAbi(web3, address, name);
   return contractData.contract;
}

export async function getWeb3ContractWithAbi(web3: any, address: string, name: string): Promise<ContractWithAbi> {
   let abiPath = '';
   try {
      abiPath = await relativeContractABIPathForContractName(name, 'artifacts');
      let abi = getAbi(`artifacts/${abiPath}`);
      return {
         contract: new web3.eth.Contract(abi, address),
         abi,
      };
   } catch (e: any) {
      console.error(`getWeb3Contract error - ABI not found: ${e}`);
   }
}

export function waitFinalize3Factory(web3: Web3) {
   return async (address: string, func: () => any, delay: number = 1000) => {
      const nonce = await web3.eth.getTransactionCount(address);
      const res = await func();
      const backoff = 1.5;
      let cnt = 0;
      while ((await web3.eth.getTransactionCount(address)) === nonce) {
         await new Promise((resolve: any) => {
            setTimeout(() => {
               resolve();
            }, delay);
         });
         if (cnt < 8) {
            delay = Math.floor(delay * backoff);
            cnt++;
         } else {
            throw new Error('Response timeout');
         }
         console.log(`Delay backoff ${delay} (${cnt})`);
      }
      return res;
   };
}

export async function relativeContractABIPathForContractName(name: string, artifactsRoot = 'artifacts'): Promise<string> {
   return new Promise((resolve, reject) => {
      glob(`contracts/**/${name}.sol/${name}.json`, { cwd: artifactsRoot }, (er: any, files: string[] | null) => {
         if (er) {
            reject(er);
         } else {
            if (files && files.length === 1) {
               resolve(files[0]);
            } else {
               reject(files);
            }
         }
      });
   });
}


export function compareObjArray(arr1: any[], arr2: any[], sortBy: string) {
   if (arr1.length !== arr2.length) return false;

   // sort array by object key
   let arr1Sorted = arr1.sort((a,b) =>  (a[sortBy] > b[sortBy]) ? 1 : ((b[sortBy] > a[sortBy]) ? -1 : 0));
   let arr2Sorted = arr2.sort((a,b) =>  (a[sortBy] > b[sortBy]) ? 1 : ((b[sortBy] > a[sortBy]) ? -1 : 0));

   // round rewardRate to 9 decimals to avoid percision mistakes 
   arr1Sorted.forEach(obj => {
      const hasKeyRewardRate = 'rewardRate' in obj;
      if (hasKeyRewardRate) {
         obj.rewardRate = obj.rewardRate.toFixed(9);
      }
   })

   arr2Sorted.forEach(obj => {
      const hasKeyRewardRate = 'rewardRate' in obj;
      if (hasKeyRewardRate) {
         obj.rewardRate = obj.rewardRate.toFixed(9);
      }
   })

   for (let i = 0; i < arr1Sorted.length; i++) {
      if (!_.isEqual(arr1Sorted[i], arr2Sorted[i])) return false;
   }

   return true;
}


export function compareArray(arr1: any[], arr2: any[]) {
   if (arr1.length !== arr2.length) return false;

   return _.isEqual(arr1.sort(), arr2.sort());
}


export function nodeIdToBytes20(nodeId: string) {
   return "0x" + bintools.cb58Decode(nodeId.slice(7)).toString('hex');
}

export function pAddressToBytes20(pAddress: string) {
   return "0x" + Buffer.from(bech32.fromWords(bech32.decode(pAddress).words)).toString('hex');

}

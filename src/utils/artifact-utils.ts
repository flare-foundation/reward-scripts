import glob from 'glob';

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

export async function refreshArtifacts(contracts: string[], artifactsPath = '../../flare-network/flare-smart-contracts/artifacts') {
   const fse = require('fs-extra');
   const path = require('path');

   for (let contract of contracts) {
      let abiPath = '';
      try {
         abiPath = await relativeContractABIPathForContractName(contract, artifactsPath);
      } catch (e: any) {
         console.log(`Cannot find contract ${contract}`);
         continue;
      }
      fse.copySync(path.join(artifactsPath, abiPath), path.join('artifacts', abiPath));
   }
}

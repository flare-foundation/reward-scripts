import glob from "glob";
import fse from "fs-extra";
import path from "path";

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
            resolve(files[0]);
          } else {
            reject(new Error(`Expected 1 file but found: ${files?.join(", ") ?? "none"}`));
          }
        }
      }
    );
  });
}

export async function refreshArtifacts(
  contracts: string[],
  artifactsPath = "../../flare-network/flare-smart-contracts/artifacts"
) {
  for (const contract of contracts) {
    let abiPath = "";
    try {
      abiPath = await relativeContractABIPathForContractName(contract, artifactsPath);
    } catch {
      console.log(`Cannot find contract ${contract}`);
      continue;
    }
    fse.copySync(path.join(artifactsPath, abiPath), path.join("artifacts", abiPath));
  }
}

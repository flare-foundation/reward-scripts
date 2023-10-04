import { refreshArtifacts } from '../utils/artifact-utils';

const contractToSync = ['FtsoManager', 'FtsoRewardManager', 'PChainStakeMirrorMultiSigVoting', 'AddressBinder', 'ValidatorRewardManager'];

refreshArtifacts(contractToSync)
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

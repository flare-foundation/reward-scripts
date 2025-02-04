import { refreshArtifacts } from '../utils/artifact-utils';

const contractToSync = ['FlareSystemsManager', 'PChainStakeMirrorMultiSigVoting', 'AddressBinder', 'ValidatorRewardManager', 'EntityManager'];

refreshArtifacts(contractToSync)
   .then(() => process.exit(0))
   .catch((error) => {
      console.error(error);
      process.exit(1);
   });

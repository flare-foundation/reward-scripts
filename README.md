# Staking Reward Script
For each reward epoch (every 3.5 days) script that calculates staking rewards will be run. Relevant data will be posted on this repository.

## The process

- Clone this repository
```bash
git checkout https://github.com/flare-foundation/reward-scripts.git
```
- Set up (network) configuration file `configs/networks/network_name.json`
   - `NETWORK`: name of the network (e.g. `flare`). It should match the file name for the address configuration file `deploys/<NETWORK>.json` (e.g. [flare](deploys/flare.json))
   - `RPC`: RPC URL for the network
   - `MAX_BLOCKS_FOR_EVENT_READS`: how many blocks can be read with a single web3 API call (e.g. `getAllEvents`)
   - `MAX_REQUESTS_PER_SECOND`: how many requests per second can be made
   - `REWARD_EPOCH`: reward epoch for which rewards are calculated
   - `NUM_UNREWARDED_EPOCHS`: number of reward epochs to calculate rewards for
   - `REQUIRED_FTSO_PERFORMANCE_WEI`: the amount of FTSO rewards that an FTSO provider needs to receive in a given epoch for its node to be eligible to receive staking rewards
   - `BOOSTING_FACTOR`: factor of boosting eligibility bond (BEB) validator received as a boost
   - `MIN_FOR_BEB_GWEI`: minimum total self-bond needed to be eligible to receive a boost
   - `VOTE_POWER_CAP_BIPS`: percentage of the network's total stake amount node can have for rewarding
   - `UPTIME_VOTING_PERIOD_LENGTH_SECONDS`: length of a period (starting at the given reward epoch) in which voters can cast a vote regarding nodes with high enough uptime
   - `UPTIME_VOTING_THRESHOLD`: number of votes a node needs to receive to be eligible for a reward
   - `API_PATH`: path to APIs which list active validators and delegators
   - `REWARD_AMOUNT_EPOCH_WEI`: reward amount to distribute in a given reward epoch
   - `NUM_EPOCHS`: number of epochs for which to sum reward amounts


If a configuration file doesn't exist or some parameters are missing, (those) parameters will have default values from [configuration service](./src/services/ConfigurationService.ts). If a default value is `undefined` it will be read from the blockchain.

For the fastest execution `RPC` with unlimited number of requests should be used and parameter `MAX_REQUESTS_PER_SECOND` should be set to `Infinity`.

- Install packages
```bash
yarn
````
- Run the calculating staking rewards process
```bash
yarn process-staking-rewards
```
You can also run it with optional parameters from [file](./src/processProviders.ts) (e.g. `yarn process-staking-rewards -b 8 -f 111`), which will override parameters set in the configuration file.

For each run output of the process is in folder `generated-files/reward-epochs-<REWARD_EPOCH>`.

To verify the official results posted in this repository one needs to update its configuration file with values from file `data.json`.

### Data for distributing rewards
Rewards will be distributed every four reward epochs, which means that every 14 days reward amounts from the past four reward epochs will be summed. This is achieved by running the process
```bash
yarn sum-staking-rewards
```
where the parameter `REWARD_EPOCH` specifies the latest reward epoch for which reward data is summed, and the parameter `NUM_EPOCHS` specifies the number of reward epochs for which reward data is summed.

Output of the process is a file `epochs-<REWARD_EPOCH-NUM_EPOCHS+1>-<REWARD_EPOCH>`, which is located in the folder `generated-files/validator-rewards`.
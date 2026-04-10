import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { ConfigurationService } from "../../src/services/ConfigurationService";

describe("ConfigurationService", () => {
  let tmpDir: string;
  let origConfigFile: string | undefined;

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-svc-test-"));
    origConfigFile = process.env.CONFIG_FILE;
  });

  after(() => {
    if (origConfigFile !== undefined) {
      process.env.CONFIG_FILE = origConfigFile;
    } else {
      delete process.env.CONFIG_FILE;
    }
    fs.rmSync(tmpDir, { recursive: true });
  });

  it("should load all values from config file", () => {
    const config = {
      NETWORK: "coston2",
      RPC: "http://localhost:8545",
      MAX_BLOCKS_FOR_EVENT_READS: 50,
      MAX_REQUESTS_PER_SECOND: 10,
      REWARD_EPOCH: 100,
      REQUIRED_FTSO_PERFORMANCE_WEI: "1000",
      BOOSTING_FACTOR: 3,
      VOTE_POWER_CAP_BIPS: 250,
      UPTIME_VOTING_PERIOD_LENGTH_SECONDS: 300,
      UPTIME_VOTING_THRESHOLD: 5,
      MIN_FOR_BEB_GWEI: "500",
      REWARD_AMOUNT_EPOCH_WEI: "1000000",
      API_PATH: "http://api.example.com",
      NUM_EPOCHS: 2,
    };
    const configPath = path.join(tmpDir, "full.json");
    fs.writeFileSync(configPath, JSON.stringify(config));
    process.env.CONFIG_FILE = configPath;

    const svc = new ConfigurationService();
    expect(svc.network).to.equal("coston2");
    expect(svc.networkRPC).to.equal("http://localhost:8545");
    expect(svc.maxBlocksForEventReads).to.equal(50);
    expect(svc.maxRequestsPerSecond).to.equal(10);
    expect(svc.rewardEpoch).to.equal(100);
    expect(svc.requiredFtsoPerformanceWei).to.equal("1000");
    expect(svc.boostingFactor).to.equal(3);
    expect(svc.votePowerCapBIPS).to.equal(250);
    expect(svc.uptimeVotigPeriodLengthSeconds).to.equal(300);
    expect(svc.uptimeVotingThreshold).to.equal(5);
    expect(svc.minForBEBGwei).to.equal("500");
    expect(svc.rewardAmountEpochWei).to.equal("1000000");
    expect(svc.apiPath).to.equal("http://api.example.com");
    expect(svc.numEpochs).to.equal(2);
  });

  it("should use defaults when config file has empty object", () => {
    const configPath = path.join(tmpDir, "empty.json");
    fs.writeFileSync(configPath, "{}");
    process.env.CONFIG_FILE = configPath;

    const svc = new ConfigurationService();
    expect(svc.network).to.equal("flare");
    expect(svc.networkRPC).to.equal("https://flare-api.flare.network/ext/C/rpc");
    expect(svc.maxBlocksForEventReads).to.equal(30);
    expect(svc.maxRequestsPerSecond).to.equal(3);
    expect(svc.rewardEpoch).to.be.undefined;
    expect(svc.requiredFtsoPerformanceWei).to.equal("0");
    expect(svc.boostingFactor).to.equal(5);
    expect(svc.votePowerCapBIPS).to.equal(500);
    expect(svc.uptimeVotigPeriodLengthSeconds).to.equal(600);
    expect(svc.uptimeVotingThreshold).to.be.undefined;
    expect(svc.minForBEBGwei).to.equal("1000000000000000");
    expect(svc.rewardAmountEpochWei).to.be.undefined;
    expect(svc.apiPath).to.be.undefined;
    expect(svc.numEpochs).to.equal(4);
  });

  it("should leave all properties undefined when CONFIG_FILE is not set", () => {
    delete process.env.CONFIG_FILE;

    const svc = new ConfigurationService();
    expect(svc.network).to.be.undefined;
    expect(svc.networkRPC).to.be.undefined;
    expect(svc.rewardEpoch).to.be.undefined;
    expect(svc.numEpochs).to.be.undefined;
  });

  it("should handle non-existent config file gracefully", () => {
    process.env.CONFIG_FILE = path.join(tmpDir, "nonexistent.json");

    const svc = new ConfigurationService();
    // readJSON throws, caught → configFile = {} → defaults apply
    expect(svc.network).to.equal("flare");
    expect(svc.numEpochs).to.equal(4);
  });

  it("should use defaults for missing fields in partial config", () => {
    const configPath = path.join(tmpDir, "partial.json");
    fs.writeFileSync(configPath, JSON.stringify({ NETWORK: "coston2", REWARD_EPOCH: 50 }));
    process.env.CONFIG_FILE = configPath;

    const svc = new ConfigurationService();
    expect(svc.network).to.equal("coston2");
    expect(svc.rewardEpoch).to.equal(50);
    // defaults for missing fields
    expect(svc.networkRPC).to.equal("https://flare-api.flare.network/ext/C/rpc");
    expect(svc.maxBlocksForEventReads).to.equal(30);
    expect(svc.boostingFactor).to.equal(5);
    expect(svc.numEpochs).to.equal(4);
  });

  it("should accept string value for MAX_REQUESTS_PER_SECOND", () => {
    const configPath = path.join(tmpDir, "string-rps.json");
    fs.writeFileSync(configPath, JSON.stringify({ MAX_REQUESTS_PER_SECOND: "Infinity" }));
    process.env.CONFIG_FILE = configPath;

    const svc = new ConfigurationService();
    expect(svc.maxRequestsPerSecond).to.equal("Infinity");
  });

  it("should override RPC with RPC_URL_{NETWORK} env var and set rps to Infinity", () => {
    const configPath = path.join(tmpDir, "rpc-override.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ NETWORK: "flare", RPC: "http://config-rpc.com", MAX_REQUESTS_PER_SECOND: 3 })
    );
    process.env.CONFIG_FILE = configPath;
    process.env.RPC_URL_FLARE = "http://env-rpc.com";

    const svc = new ConfigurationService();
    expect(svc.networkRPC).to.equal("http://env-rpc.com");
    expect(svc.maxRequestsPerSecond).to.equal("Infinity");

    delete process.env.RPC_URL_FLARE;
  });

  it("should use config RPC and rps when env var is not set", () => {
    const configPath = path.join(tmpDir, "rpc-no-env.json");
    fs.writeFileSync(
      configPath,
      JSON.stringify({ NETWORK: "coston2", RPC: "http://config-rpc.com", MAX_REQUESTS_PER_SECOND: 5 })
    );
    process.env.CONFIG_FILE = configPath;
    delete process.env.RPC_URL_COSTON2;

    const svc = new ConfigurationService();
    expect(svc.networkRPC).to.equal("http://config-rpc.com");
    expect(svc.maxRequestsPerSecond).to.equal(5);
  });

  it("should use correct network-specific env var", () => {
    const configPath = path.join(tmpDir, "rpc-network.json");
    fs.writeFileSync(configPath, JSON.stringify({ NETWORK: "coston2", RPC: "http://config-rpc.com" }));
    process.env.CONFIG_FILE = configPath;
    process.env.RPC_URL_FLARE = "http://flare-rpc.com";
    process.env.RPC_URL_COSTON2 = "http://coston2-rpc.com";

    const svc = new ConfigurationService();
    expect(svc.networkRPC).to.equal("http://coston2-rpc.com");

    delete process.env.RPC_URL_FLARE;
    delete process.env.RPC_URL_COSTON2;
  });
});

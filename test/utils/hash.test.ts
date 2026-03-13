import { expect } from "chai";
import { ParseToID, ToValidatorConfigHash } from "../../src/utils/hash";

describe("hash", () => {
  describe("ParseToID", () => {
    it("should convert a P-chain address to CB58-encoded ID", () => {
      // From source comments: P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v => 6Y3kysjF9jnHnYkdS9yGAuoHyae2eNmeV
      const result = ParseToID("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      expect(result).to.equal("6Y3kysjF9jnHnYkdS9yGAuoHyae2eNmeV");
    });

    it("should be deterministic", () => {
      const result1 = ParseToID("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      const result2 = ParseToID("P-localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      expect(result1).to.equal(result2);
    });

    it("should throw on address without separator", () => {
      expect(() => ParseToID("invalidaddress")).to.throw("no separator found in address");
    });

    it("should throw on invalid bech32 address", () => {
      expect(() => ParseToID("P-invalid!!!")).to.throw();
    });
  });

  describe("ToValidatorConfigHash", () => {
    // Example values from source comments
    const networkId = "162";
    const pChainPublicKey = "6Y3kysjF9jnHnYkdS9yGAuoHyae2eNmeV";
    const nodeID = "NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ";
    const weight = "10000000000000";
    const duration = "1512000";

    it("should produce a 64-char hex hash", () => {
      const hash = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, weight, duration);
      expect(hash).to.be.a("string");
      expect(hash).to.have.length(64);
      expect(hash).to.match(/^[0-9a-f]{64}$/);
    });

    it("should be deterministic", () => {
      const hash1 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, weight, duration);
      const hash2 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, weight, duration);
      expect(hash1).to.equal(hash2);
    });

    it("should return different hashes for different networkIDs", () => {
      const hash1 = ToValidatorConfigHash("162", pChainPublicKey, nodeID, weight, duration);
      const hash2 = ToValidatorConfigHash("14", pChainPublicKey, nodeID, weight, duration);
      expect(hash1).to.not.equal(hash2);
    });

    it("should return different hashes for different public keys", () => {
      const hash1 = ToValidatorConfigHash(networkId, "key1", nodeID, weight, duration);
      const hash2 = ToValidatorConfigHash(networkId, "key2", nodeID, weight, duration);
      expect(hash1).to.not.equal(hash2);
    });

    it("should return different hashes for different weights", () => {
      const hash1 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, "100", duration);
      const hash2 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, "200", duration);
      expect(hash1).to.not.equal(hash2);
    });

    it("should return different hashes for different durations", () => {
      const hash1 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, weight, "100");
      const hash2 = ToValidatorConfigHash(networkId, pChainPublicKey, nodeID, weight, "200");
      expect(hash1).to.not.equal(hash2);
    });
  });
});

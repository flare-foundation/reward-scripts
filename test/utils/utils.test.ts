import { expect } from "chai";
import { BIPS, round, compareObjArray, compareArray, nodeIdToBytes20, pAddressToBytes20 } from "../../src/utils/utils";

describe("utils", () => {
  describe("BIPS", () => {
    it("should equal 10000", () => {
      expect(BIPS).to.equal(10_000);
    });
  });

  describe("round", () => {
    it("should round to nearest integer by default", () => {
      expect(round(1.5)).to.equal(2);
      expect(round(1.4)).to.equal(1);
      expect(round(2.5)).to.equal(3);
    });

    it("should round negative numbers", () => {
      expect(round(-1.5)).to.equal(-1);
      expect(round(-1.6)).to.equal(-2);
    });

    it("should round to specified decimal places", () => {
      expect(round(1.234, 2)).to.equal(1.23);
      expect(round(1.235, 2)).to.equal(1.24);
      expect(round(1.1, 5)).to.equal(1.1);
    });

    it("should handle zero decimal explicitly", () => {
      expect(round(1.6, 0)).to.equal(2);
      expect(round(1.4, 0)).to.equal(1);
    });

    it("should handle zero input", () => {
      expect(round(0)).to.equal(0);
      expect(round(0, 5)).to.equal(0);
    });
  });

  describe("compareArray", () => {
    it("should return true for equal arrays regardless of order", () => {
      expect(compareArray([1, 2, 3], [3, 2, 1])).to.be.true;
    });

    it("should return true for identical arrays", () => {
      expect(compareArray([1, 2, 3], [1, 2, 3])).to.be.true;
    });

    it("should return false for arrays of different length", () => {
      expect(compareArray([1, 2], [1, 2, 3])).to.be.false;
    });

    it("should return false for arrays with different elements", () => {
      expect(compareArray([1, 2, 3], [1, 2, 4])).to.be.false;
    });

    it("should return true for empty arrays", () => {
      expect(compareArray([], [])).to.be.true;
    });

    it("should work with string arrays", () => {
      expect(compareArray(["a", "b"], ["b", "a"])).to.be.true;
      expect(compareArray(["a", "b"], ["a", "c"])).to.be.false;
    });
  });

  describe("compareObjArray", () => {
    it("should return true for equal object arrays sorted by key", () => {
      const a = [
        { id: "b", val: 1 },
        { id: "a", val: 2 },
      ];
      const b = [
        { id: "a", val: 2 },
        { id: "b", val: 1 },
      ];
      expect(compareObjArray(a, b, "id")).to.be.true;
    });

    it("should return false for arrays of different length", () => {
      expect(compareObjArray([{ id: "a" }], [], "id")).to.be.false;
    });

    it("should return false for objects with different values", () => {
      const a = [{ id: "a", val: 1 }];
      const b = [{ id: "a", val: 2 }];
      expect(compareObjArray(a, b, "id")).to.be.false;
    });

    it("should handle rewardRate precision by rounding to 9 decimals", () => {
      const a = [{ id: "a", rewardRate: 0.1234567890001 }];
      const b = [{ id: "a", rewardRate: 0.1234567890009 }];
      // Both round to "0.123456789" via toFixed(9)
      expect(compareObjArray(a, b, "id")).to.be.true;
    });

    it("should return true for empty arrays", () => {
      expect(compareObjArray([], [], "id")).to.be.true;
    });
  });

  describe("nodeIdToBytes20", () => {
    it("should convert a NodeID to 0x-prefixed 40-char hex", () => {
      const result = nodeIdToBytes20("NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ");
      expect(result).to.match(/^0x[0-9a-f]{40}$/);
    });

    it("should be deterministic", () => {
      const result1 = nodeIdToBytes20("NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ");
      const result2 = nodeIdToBytes20("NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ");
      expect(result1).to.equal(result2);
    });

    it("should produce different outputs for different NodeIDs", () => {
      const result1 = nodeIdToBytes20("NodeID-MFrZFVCXPv5iCn6M9K6XduxGTYp891xXZ");
      const result2 = nodeIdToBytes20("NodeID-GWPcbFJZFfZreETSoWjPimr846mXEKCtu");
      expect(result1).to.not.equal(result2);
    });
  });

  describe("pAddressToBytes20", () => {
    it("should convert a bech32 address to 0x-prefixed 40-char hex", () => {
      const result = pAddressToBytes20("localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      expect(result).to.match(/^0x[0-9a-f]{40}$/);
    });

    it("should be deterministic", () => {
      const result1 = pAddressToBytes20("localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      const result2 = pAddressToBytes20("localflare18jma8ppw3nhx5r4ap8clazz0dps7rv5uj3gy4v");
      expect(result1).to.equal(result2);
    });

    it("should throw on invalid bech32 address", () => {
      expect(() => pAddressToBytes20("invalid!!!")).to.throw();
    });
  });
});

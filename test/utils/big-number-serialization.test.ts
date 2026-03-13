import { expect } from "chai";
import { bigIntReplacer, bigIntReviver } from "../../src/utils/big-number-serialization";

describe("big-number-serialization", () => {
  describe("bigIntReplacer", () => {
    it("should convert BigInt to string with 'n' suffix", () => {
      expect(bigIntReplacer("key", BigInt(123))).to.equal("123n");
    });

    it("should convert negative BigInt", () => {
      expect(bigIntReplacer("key", BigInt(-456))).to.equal("-456n");
    });

    it("should convert zero BigInt", () => {
      expect(bigIntReplacer("key", BigInt(0))).to.equal("0n");
    });

    it("should convert very large BigInt", () => {
      const big = BigInt("999999999999999999999999999999");
      expect(bigIntReplacer("key", big)).to.equal("999999999999999999999999999999n");
    });

    it("should pass through non-BigInt values unchanged", () => {
      expect(bigIntReplacer("key", "hello")).to.equal("hello");
      expect(bigIntReplacer("key", 42)).to.equal(42);
      expect(bigIntReplacer("key", null)).to.equal(null);
      expect(bigIntReplacer("key", true)).to.equal(true);
    });

    it("should work with JSON.stringify", () => {
      const obj = { a: BigInt(100), b: "text", c: BigInt(-50) };
      const result = JSON.stringify(obj, bigIntReplacer);
      expect(result).to.equal('{"a":"100n","b":"text","c":"-50n"}');
    });
  });

  describe("bigIntReviver", () => {
    it("should convert string with 'n' suffix back to BigInt", () => {
      expect(bigIntReviver("key", "123n")).to.equal(BigInt(123));
    });

    it("should convert negative BigInt string", () => {
      expect(bigIntReviver("key", "-456n")).to.equal(BigInt(-456));
    });

    it("should convert zero BigInt string", () => {
      expect(bigIntReviver("key", "0n")).to.equal(BigInt(0));
    });

    it("should pass through non-matching strings", () => {
      expect(bigIntReviver("key", "hello")).to.equal("hello");
      expect(bigIntReviver("key", "123")).to.equal("123");
      expect(bigIntReviver("key", "n")).to.equal("n");
      expect(bigIntReviver("key", "")).to.equal("");
    });

    it("should pass through non-string values", () => {
      expect(bigIntReviver("key", 42)).to.equal(42);
      expect(bigIntReviver("key", null)).to.equal(null);
      expect(bigIntReviver("key", true)).to.equal(true);
    });

    it("should work with JSON.parse", () => {
      const json = '{"a":"100n","b":"text","c":"-50n"}';
      const result = JSON.parse(json, bigIntReviver);
      expect(result.a).to.equal(BigInt(100));
      expect(result.b).to.equal("text");
      expect(result.c).to.equal(BigInt(-50));
    });
  });

  describe("roundtrip", () => {
    it("should preserve BigInt values through serialize/deserialize", () => {
      const original = {
        positive: BigInt("999999999999999999"),
        negative: BigInt("-123456789"),
        zero: BigInt(0),
        text: "not a bigint",
        num: 42,
      };
      const serialized = JSON.stringify(original, bigIntReplacer);
      const deserialized = JSON.parse(serialized, bigIntReviver);
      expect(deserialized.positive).to.equal(original.positive);
      expect(deserialized.negative).to.equal(original.negative);
      expect(deserialized.zero).to.equal(original.zero);
      expect(deserialized.text).to.equal(original.text);
      expect(deserialized.num).to.equal(original.num);
    });
  });
});

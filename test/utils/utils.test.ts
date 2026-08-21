import { expect } from "chai";
import {
  BIPS,
  round,
  compareObjArray,
  compareArray,
  nodeIdToBytes20,
  pAddressToBytes20,
  addRpcRetry,
  joinUrlPath,
  withQueryParam,
  isRetryableRpcError,
  isRetryableHttpError,
  retryAfterDelayMs,
  httpWithRetry,
  RetryableHttpProvider,
} from "../../src/utils/utils";

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

  describe("isRetryableRpcError", () => {
    it("should treat empty JSON RPC responses as retryable", () => {
      expect(isRetryableRpcError(new Error('Invalid JSON RPC response: ""'))).to.be.true;
    });

    it("should not treat ordinary errors as retryable", () => {
      expect(isRetryableRpcError(new Error("execution reverted"))).to.be.false;
    });
  });

  describe("addRpcRetry", () => {
    it("should retry transient RPC errors", async () => {
      let calls = 0;
      const response = { jsonrpc: "2.0", id: 1, result: "0x1" };
      const provider: RetryableHttpProvider = {
        send(_payload, callback) {
          calls++;
          if (calls === 1) {
            callback?.(new Error('Invalid JSON RPC response: ""'), undefined);
            return;
          }

          callback?.(null, response);
        },
      };

      addRpcRetry(provider, undefined, { attempts: 2, initialDelayMs: 0, maxDelayMs: 0 });

      const result = await new Promise((resolve, reject) => {
        provider.send({ jsonrpc: "2.0", id: 1, method: "eth_blockNumber" }, (error, rpcResponse) => {
          if (error) {
            reject(error);
            return;
          }

          resolve(rpcResponse);
        });
      });

      expect(result).to.deep.equal(response);
      expect(calls).to.equal(2);
    });

    it("should not retry non-transient RPC errors", async () => {
      let calls = 0;
      const provider: RetryableHttpProvider = {
        send(_payload, callback) {
          calls++;
          callback?.(new Error("execution reverted"), undefined);
        },
      };

      addRpcRetry(provider, undefined, { attempts: 2, initialDelayMs: 0, maxDelayMs: 0 });

      let error: unknown;
      try {
        await new Promise((resolve, reject) => {
          provider.send({ jsonrpc: "2.0", id: 1, method: "eth_call" }, (rpcError, rpcResponse) => {
            if (rpcError) {
              reject(rpcError);
              return;
            }

            resolve(rpcResponse);
          });
        });
      } catch (caught) {
        error = caught;
      }

      expect(error).to.be.instanceOf(Error);
      expect((error as Error).message).to.equal("execution reverted");
      expect(calls).to.equal(1);
    });
  });

  describe("joinUrlPath", () => {
    it("should append a path to a plain base URL", () => {
      expect(joinUrlPath("https://indexer.example.com", "delegators/list")).to.equal(
        "https://indexer.example.com/delegators/list"
      );
    });

    it("should keep the query string after the path", () => {
      expect(joinUrlPath("https://indexer.example.com?x-apikey=secret", "delegators/list")).to.equal(
        "https://indexer.example.com/delegators/list?x-apikey=secret"
      );
    });

    it("should not double up slashes", () => {
      expect(joinUrlPath("https://indexer.example.com/", "/delegators/list")).to.equal(
        "https://indexer.example.com/delegators/list"
      );
      expect(joinUrlPath("https://indexer.example.com//?key=1", "delegators/list")).to.equal(
        "https://indexer.example.com/delegators/list?key=1"
      );
    });

    it("should preserve multiple query params", () => {
      expect(joinUrlPath("https://indexer.example.com?a=1&b=2", "validators/list")).to.equal(
        "https://indexer.example.com/validators/list?a=1&b=2"
      );
    });
  });

  describe("withQueryParam", () => {
    it("should start a query string when there is none", () => {
      expect(withQueryParam("https://indexer.example.com/delegators/list", "x-apikey", "secret")).to.equal(
        "https://indexer.example.com/delegators/list?x-apikey=secret"
      );
    });

    it("should append to an existing query string", () => {
      expect(withQueryParam("https://indexer.example.com/list?a=1", "x-apikey", "secret")).to.equal(
        "https://indexer.example.com/list?a=1&x-apikey=secret"
      );
    });

    it("should encode the name and value", () => {
      expect(withQueryParam("https://indexer.example.com/list", "x-apikey", "a b&c=d")).to.equal(
        "https://indexer.example.com/list?x-apikey=a%20b%26c%3Dd"
      );
    });
  });

  describe("isRetryableHttpError", () => {
    it("should retry on rate limiting and gateway statuses", () => {
      for (const status of [408, 425, 429, 500, 502, 503, 504]) {
        expect(isRetryableHttpError({ response: { status } }), `status ${status}`).to.be.true;
      }
    });

    it("should not retry on client errors that will not go away", () => {
      for (const status of [400, 401, 403, 404, 422]) {
        expect(isRetryableHttpError({ response: { status } }), `status ${status}`).to.be.false;
      }
    });

    it("should fall back to the RPC classifier when there is no response", () => {
      expect(isRetryableHttpError(new Error("socket hang up"))).to.be.true;
      expect(isRetryableHttpError(new Error("ETIMEDOUT"))).to.be.true;
      expect(isRetryableHttpError(new Error("some unrelated failure"))).to.be.false;
    });
  });

  describe("retryAfterDelayMs", () => {
    it("should read the Retry-After header in seconds", () => {
      expect(retryAfterDelayMs({ response: { headers: { "retry-after": "30" } } })).to.equal(30000);
      expect(retryAfterDelayMs({ response: { headers: { "Retry-After": 5 } } })).to.equal(5000);
    });

    it("should read retry_after from a Cloudflare 1015 body", () => {
      expect(retryAfterDelayMs({ response: { data: { retry_after: 30 } } })).to.equal(30000);
    });

    it("should prefer the header over the body", () => {
      const error = { response: { headers: { "retry-after": "1" }, data: { retry_after: 30 } } };
      expect(retryAfterDelayMs(error)).to.equal(1000);
    });

    it("should return undefined when there is nothing usable", () => {
      expect(retryAfterDelayMs(new Error("boom"))).to.be.undefined;
      expect(retryAfterDelayMs({ response: {} })).to.be.undefined;
      expect(retryAfterDelayMs({ response: { headers: { "retry-after": "Wed, 21 Oct 2026 07:28:00 GMT" } } })).to.be
        .undefined;
    });
  });

  describe("httpWithRetry", () => {
    const fast = { attempts: 4, initialDelayMs: 1, maxDelayMs: 4 };
    const httpError = (status: number, extra: Record<string, unknown> = {}) =>
      Object.assign(new Error(`Request failed with status code ${status}`), {
        response: { status, ...extra },
      });

    it("should return the result without retrying on success", async () => {
      let calls = 0;
      const result = await httpWithRetry(
        () => {
          calls++;
          return Promise.resolve("ok");
        },
        "label",
        fast
      );
      expect(result).to.equal("ok");
      expect(calls).to.equal(1);
    });

    it("should retry a 429 and succeed", async () => {
      let calls = 0;
      const result = await httpWithRetry(
        () => {
          calls++;
          if (calls < 3) {
            return Promise.reject(httpError(429));
          }
          return Promise.resolve("ok");
        },
        "label",
        fast
      );
      expect(result).to.equal("ok");
      expect(calls).to.equal(3);
    });

    it("should give up after the configured number of attempts", async () => {
      let calls = 0;
      const error = httpError(429);
      try {
        await httpWithRetry(
          () => {
            calls++;
            return Promise.reject(error);
          },
          "label",
          fast
        );
        expect.fail("should have thrown");
      } catch (e: unknown) {
        expect(e).to.equal(error);
      }
      expect(calls).to.equal(4);
    });

    it("should not retry a non-retryable error", async () => {
      let calls = 0;
      const error = httpError(404);
      try {
        await httpWithRetry(
          () => {
            calls++;
            return Promise.reject(error);
          },
          "label",
          fast
        );
        expect.fail("should have thrown");
      } catch (e: unknown) {
        expect(e).to.equal(error);
      }
      expect(calls).to.equal(1);
    });

    it("should cap the Retry-After wait at maxDelayMs", async () => {
      let calls = 0;
      const start = Date.now();
      await httpWithRetry(
        () => {
          calls++;
          if (calls === 1) {
            return Promise.reject(httpError(429, { data: { retry_after: 30 } }));
          }
          return Promise.resolve("ok");
        },
        "label",
        { attempts: 2, initialDelayMs: 1, maxDelayMs: 20 }
      );
      expect(calls).to.equal(2);
      expect(Date.now() - start).to.be.lessThan(1000);
    });

    it("should log a warning for every retry", async () => {
      const warnings: string[] = [];
      let calls = 0;
      await httpWithRetry(
        () => {
          calls++;
          if (calls < 3) {
            return Promise.reject(httpError(503));
          }
          return Promise.resolve("ok");
        },
        "delegators/list (offset 100)",
        { ...fast, logger: { warning: (message: string) => warnings.push(message) } as never }
      );
      expect(warnings).to.have.lengthOf(2);
      expect(warnings[0]).to.contain("delegators/list (offset 100)");
      expect(warnings[0]).to.contain("(1/4");
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

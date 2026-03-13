import { expect } from "chai";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { readJSON } from "../../src/utils/config-utils";

describe("config-utils", () => {
  describe("readJSON", () => {
    let tmpDir: string;

    before(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "config-utils-test-"));
    });

    after(() => {
      fs.rmSync(tmpDir, { recursive: true });
    });

    function writeTmp(content: string): string {
      const filePath = path.join(tmpDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
      fs.writeFileSync(filePath, content);
      return filePath;
    }

    it("should parse valid JSON", () => {
      const file = writeTmp('{"key": "value"}');
      const result = readJSON<{ key: string }>(file);
      expect(result.key).to.equal("value");
    });

    it("should strip single-line comments", () => {
      const file = writeTmp('{\n  // this is a comment\n  "key": "value"\n}');
      const result = readJSON<{ key: string }>(file);
      expect(result.key).to.equal("value");
    });

    it("should strip multi-line comments", () => {
      const file = writeTmp('{\n  /* multi\n  line */\n  "key": "value"\n}');
      const result = readJSON<{ key: string }>(file);
      expect(result.key).to.equal("value");
    });

    it("should remove trailing commas in objects", () => {
      const file = writeTmp('{"key": "value",}');
      const result = readJSON<{ key: string }>(file);
      expect(result.key).to.equal("value");
    });

    it("should remove trailing commas in arrays", () => {
      const file = writeTmp('{"arr": [1, 2, 3,]}');
      const result = readJSON<{ arr: number[] }>(file);
      expect(result.arr).to.deep.equal([1, 2, 3]);
    });

    it("should handle nested objects with comments and trailing commas", () => {
      const json = `{
        // top level
        "a": {
          "b": 1, // inline
          "c": 2,
        },
      }`;
      const file = writeTmp(json);
      const result = readJSON<{ a: { b: number; c: number } }>(file);
      expect(result.a.b).to.equal(1);
      expect(result.a.c).to.equal(2);
    });

    it("should preserve strings containing comment-like content", () => {
      const file = writeTmp('{"url": "http://example.com"}');
      const result = readJSON<{ url: string }>(file);
      expect(result.url).to.equal("http://example.com");
    });

    it("should throw on invalid JSON", () => {
      const file = writeTmp("not json at all");
      expect(() => readJSON(file)).to.throw();
    });
  });
});

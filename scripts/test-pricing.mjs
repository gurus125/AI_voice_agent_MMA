// Run: npm run test:pricing   (Node 22.18+ strips TypeScript types natively)
import assert from "node:assert/strict";
import { summarizeUsage, costBreakdown } from "../src/lib/pricing.ts";
import { sanitizeUsage } from "../src/lib/validation.ts";

// Real usageMetadata captured from the Gemini Live API during our test run.
const real = {
  promptTokenCount: 571,
  responseTokenCount: 87,
  totalTokenCount: 658,
  promptTokensDetails: [
    { modality: "TEXT", tokenCount: 324 },
    { modality: "AUDIO", tokenCount: 222 },
  ],
  responseTokensDetails: [{ modality: "AUDIO", tokenCount: 87 }],
  thoughtsTokenCount: 112,
};

const one = summarizeUsage([real]);
assert.equal(one.inputTextTokens, 324);
assert.equal(one.inputAudioTokens, 247); // 222 + 25 unattributed
assert.equal(one.outputAudioTokens, 87);
assert.equal(one.thoughtsTokens, 112);
// (324*0.75 + 247*3 + 87*12 + 112*4.5) / 1e6 = 2532 / 1e6
assert.equal(one.estimatedCostUsd, 0.002532);

const two = summarizeUsage([real, real]);
assert.equal(two.promptTokens, 1142);
assert.equal(two.estimatedCostUsd, 0.005064);

assert.equal(summarizeUsage([]).estimatedCostUsd, 0);
assert.deepEqual(summarizeUsage([{}]).promptTokens, 0);

// Sanitizer drops junk and negative/NaN values.
assert.equal(sanitizeUsage("x"), null);
assert.equal(sanitizeUsage({ evil: 1 }), null);
const s = sanitizeUsage({ promptTokenCount: -5, responseTokenCount: 10, hacked: "x", promptTokensDetails: [{ modality: "AUDIO", tokenCount: 3 }, { modality: 5 }] });
assert.deepEqual(s, { responseTokenCount: 10, promptTokensDetails: [{ modality: "AUDIO", tokenCount: 3 }] });

// The itemised breakdown must add up to the headline estimate.
const lines = costBreakdown(one);
assert.equal(lines.length, 5);
const sum = lines.reduce((a, l) => a + l.costUsd, 0);
assert.ok(Math.abs(sum - one.estimatedCostUsd) < 1e-6, `breakdown ${sum} != ${one.estimatedCostUsd}`);

console.log("pricing + validation tests: all passed");

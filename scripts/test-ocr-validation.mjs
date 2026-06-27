import assert from "node:assert/strict";

import { compareOcrAttempts, countOcrValues, createEmptyOcrResult, validateOcrResult } from "../src/receiptOcr.js";

function parsedResult({ vendaProdutos = "100,00", cardValue = "100,00", sobra = "" } = {}) {
  const parsed = createEmptyOcrResult();
  parsed.vendaProdutos = vendaProdutos;
  parsed.cards.eloDebito[0] = cardValue;
  parsed.sobra = sobra;
  return validateOcrResult(parsed);
}

const missingSobra = parsedResult();
const recognizedNonZeroSobra = parsedResult({ sobra: "0,13" });

assert.ok(countOcrValues(recognizedNonZeroSobra) > countOcrValues(missingSobra));
assert.equal(missingSobra.validation.hasRecognizedSobra, false);
assert.equal(missingSobra.validation.difference, null);
assert.equal(recognizedNonZeroSobra.validation.hasRecognizedSobra, true);

const selectedNonZero = compareOcrAttempts(
  { parsed: missingSobra, foundValues: 3 },
  { parsed: recognizedNonZeroSobra, foundValues: 3 }
);

assert.equal(selectedNonZero.parsed.sobra, "0,13");

const recognizedZeroSobra = parsedResult({ cardValue: "100,00", sobra: "0,00" });
const selectedZero = compareOcrAttempts(
  { parsed: missingSobra, foundValues: 3 },
  { parsed: recognizedZeroSobra, foundValues: 3 }
);

assert.equal(selectedZero.parsed.sobra, "0,00");

console.log("OCR validation regression tests passed");

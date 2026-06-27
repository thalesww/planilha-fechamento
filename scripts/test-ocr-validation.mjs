import assert from "node:assert/strict";

import {
  applyOcrResultToClosing,
  compareOcrAttempts,
  countOcrValues,
  createEmptyOcrResult,
  resetClosingSobra,
  validateOcrResult
} from "../src/receiptOcr.js";

function parsedResult({ vendaProdutos = "100,00", cardValue = "100,00", sobra = "" } = {}) {
  const parsed = createEmptyOcrResult();
  parsed.vendaProdutos = vendaProdutos;
  parsed.cards.eloDebito[0] = cardValue;
  parsed.sobra = sobra;
  parsed.diferencaSobra = sobra;
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

const applied = applyOcrResultToClosing(
  {
    vendaProdutos: "",
    sobra: "",
    diferencaSobra: "",
    cards: {
      eloDebito: ["", ""],
      maestroDebito: ["", ""],
      visaDebito: ["", ""],
      eloCredito: ["", ""],
      mastercardCredito: ["", ""],
      visaCredito: ["", ""]
    },
    extras: {
      abasteceAi: "",
      pixStone: "",
      notaPrazo: "",
      sangria: ""
    }
  },
  {
    vendaProdutos: "100,00",
    sobra: "0,13",
    diferencaSobra: "0,13",
    cards: {
      eloDebito: ["25,00", ""],
      maestroDebito: ["", ""],
      visaDebito: ["", ""],
      eloCredito: ["", ""],
      mastercardCredito: ["", ""],
      visaCredito: ["", ""]
    },
    extras: {
      abasteceAi: "",
      pixStone: "",
      notaPrazo: "",
      sangria: ""
    }
  }
);

assert.equal(applied.sobra, "0,13");
assert.equal(applied.diferencaSobra, "0,13");

const cleared = resetClosingSobra(applied);
assert.equal(cleared.sobra, "");
assert.equal(cleared.diferencaSobra, "");
assert.equal(cleared.vendaProdutos, "100,00");
assert.equal(cleared.cards.eloDebito[0], "25,00");

console.log("OCR validation regression tests passed");

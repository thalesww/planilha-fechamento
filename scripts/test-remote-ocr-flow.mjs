import assert from "node:assert/strict";

import {
  countLegacyValues,
  receiptResultToLegacyOcrResult,
  recognizeReceiptImage
} from "../src/services/ocr/recognizeReceiptImage.ts";
import { isValidReceiptOcrResult } from "../src/services/ocr/validateReceiptOcrResult.ts";

const validRemote = {
  ok: true,
  source: "remote-paddleocr",
  vendaProdutos: 100,
  formasPagamento: { eloDebito: 70, tefVisa: 20 },
  extras: { sangriaDinheiro: 10 },
  ignorados: [],
  totais: {
    formasPagamento: 90,
    outrasSaidas: 10,
    totalUsado: 100,
    vendaProdutos: 100,
    diferenca: 0
  },
  raw: { text: "VENDA PRODUTOS 100,00", lines: [{ text: "VENDA PRODUTOS 100,00" }] },
  confidence: 0.9,
  warnings: []
};

assert.equal(isValidReceiptOcrResult(validRemote), true);
assert.equal(isValidReceiptOcrResult({ ok: true, totais: {}, raw: {} }), false);

const success = await recognizeReceiptImage(new Blob(["fake"]), {
  remoteClient: async () => validRemote,
  localFallback: async () => {
    throw new Error("local fallback should not run");
  }
});

assert.equal(success.usedFallback, false);
assert.equal(success.receipt.source, "remote-paddleocr");
assert.equal(success.legacy.cards.eloDebito[0], "70,00");
assert.ok(countLegacyValues(receiptResultToLegacyOcrResult(validRemote)) >= 4);

const remoteWithPrintedTotalWarnings = receiptResultToLegacyOcrResult({
  ...validRemote,
  totais: {
    ...validRemote.totais,
    diferenca: -331.48
  },
  warnings: ["total_impresso_divergente", "troco_final_ignorado"]
});

assert.equal(remoteWithPrintedTotalWarnings.validation.isValid, true);
assert.equal(remoteWithPrintedTotalWarnings.validation.difference, 0);
assert.equal(remoteWithPrintedTotalWarnings.ocrInconsistent, false);

let localCalled = false;
const fallback = await recognizeReceiptImage(new Blob(["fake"]), {
  remoteClient: async () => {
    throw new Error("timeout");
  },
  localFallback: async () => {
    localCalled = true;
    return {
      receipt: { ...validRemote, source: "local-fallback", warnings: ["fallback"] },
      legacy: {
        vendaProdutos: "100,00",
        cards: {
          eloDebito: ["100,00", ""],
          maestroDebito: ["", ""],
          visaDebito: ["", ""],
          eloCredito: ["", ""],
          mastercardCredito: ["", ""],
          visaCredito: ["", ""]
        },
        extras: { abasteceAi: "", pixStone: "", notaPrazo: "", sangria: "" },
        optionalExtras: {},
        sobra: "0,00",
        diferencaSobra: "0,00",
        source: "local-fallback",
        warnings: ["fallback"]
      },
      foundCount: 3
    };
  }
});

assert.equal(localCalled, true);
assert.equal(fallback.usedFallback, true);
assert.equal(fallback.receipt.source, "local-fallback");
assert.equal(fallback.receipt.warnings.includes("fallback"), true);
assert.equal(fallback.receipt.warnings.includes("remote_ocr_failed:timeout"), true);
assert.equal(fallback.legacy.remoteError, "timeout");

const invalidResponseFallback = await recognizeReceiptImage(new Blob(["fake"]), {
  remoteClient: async () => {
    const invalid = { ok: true };
    if (!isValidReceiptOcrResult(invalid)) throw new Error("invalid");
    return invalid;
  },
  localFallback: async () => ({
    receipt: { ...validRemote, source: "local-fallback", warnings: ["invalid_remote_json"] },
    legacy: receiptResultToLegacyOcrResult({ ...validRemote, source: "local-fallback", warnings: ["invalid_remote_json"] }),
    foundCount: 4
  })
});

assert.equal(invalidResponseFallback.usedFallback, true);
assert.equal(invalidResponseFallback.receipt.warnings.includes("invalid_remote_json"), true);
assert.equal(invalidResponseFallback.receipt.warnings.includes("remote_ocr_failed:invalid"), true);

console.log("remote OCR flow tests passed");

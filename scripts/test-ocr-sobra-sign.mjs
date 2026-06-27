import assert from "node:assert/strict";

import { parseReceiptOcrText } from "../src/receiptOcr.js";

const parsed = parseReceiptOcrText(`
VENDA DE PRODUTOS 110.00
ELO DEBITO 100.00
Diferenca(Sobra) -10.00
`);

assert.equal(parsed.vendaProdutos, "110,00");
assert.equal(parsed.cards.eloDebito[0], "100,00");
assert.equal(parsed.sobra, "-10,00");
assert.equal(parsed.ocrTotals.calculatedSobra, -10);
assert.equal(parsed.ocrTotals.recognizedSobra, -10);
assert.equal(parsed.ocrInconsistent, false);

console.log("OCR negative sobra regression test passed");

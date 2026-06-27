import assert from "node:assert/strict";

import { applyOcrResultToClosing, resetClosingSobra } from "../src/receiptOcr.js";

const parsedOcr = {
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
};

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
  parsedOcr
);

assert.equal(applied.sobra, "0,13");
assert.equal(applied.diferencaSobra, "0,13");

const cleared = resetClosingSobra(applied);
assert.equal(cleared.sobra, "");
assert.equal(cleared.diferencaSobra, "");
assert.equal(cleared.vendaProdutos, "100,00");
assert.equal(cleared.cards.eloDebito[0], "25,00");

console.log("OCR validation regression tests passed");

import assert from "node:assert/strict";
import fs from "node:fs";

import { parseClosingText } from "../src/receiptOcr.js";

const fixtureText = fs.readFileSync(new URL("../tests/fixtures/receipt-whatsapp-20260626.txt", import.meta.url), "utf8");
const parsedFixture = parseClosingText(fixtureText);

assert.deepEqual(parsedFixture.cards.eloDebito, ["250,48", "30,00"]);
assert.deepEqual(parsedFixture.cards.maestroDebito, ["51,00", "2.143,83"]);
assert.deepEqual(parsedFixture.cards.visaDebito, ["", "1.159,12"]);
assert.deepEqual(parsedFixture.cards.eloCredito, ["", "172,88"]);
assert.deepEqual(parsedFixture.cards.mastercardCredito, ["250,73", "3.026,73"]);
assert.deepEqual(parsedFixture.cards.visaCredito, ["1.565,86", "50,00"]);

const focusedText = `
2o valor ELO Credito 123,45
TEF Visa 678,90
Visa Credito 11,22
TEF - ELO DEBITO 30,00
ELO DEBITO 250,48
`;
const parsedFocused = parseClosingText(focusedText);

assert.deepEqual(parsedFocused.cards.eloCredito, ["", "123,45"]);
assert.deepEqual(parsedFocused.cards.visaCredito, ["678,90", "11,22"]);
assert.deepEqual(parsedFocused.cards.eloDebito, ["250,48", "30,00"]);

console.log("parseClosingText regression tests passed");

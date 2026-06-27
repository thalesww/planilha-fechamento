import assert from "node:assert/strict";
import fs from "node:fs";

import { parseClosingText } from "../src/receiptOcr.js";

const fixtureText = fs.readFileSync(new URL("../tests/fixtures/receipt-whatsapp-20260626.txt", import.meta.url), "utf8");
const parsedFixture = parseClosingText(fixtureText);
const turno1Text = fs.readFileSync(new URL("../tests/fixtures/receipt-whatsapp-20260626-turno1.txt", import.meta.url), "utf8");
const parsedTurno1 = parseClosingText(turno1Text);
const turno2Text = fs.readFileSync(new URL("../tests/fixtures/receipt-whatsapp-20260626-turno2.txt", import.meta.url), "utf8");
const parsedTurno2 = parseClosingText(turno2Text);

assert.deepEqual(parsedFixture.cards.eloDebito, ["250,48", "30,00"]);
assert.deepEqual(parsedFixture.cards.maestroDebito, ["51,00", "2.143,83"]);
assert.deepEqual(parsedFixture.cards.visaDebito, ["", "1.159,12"]);
assert.deepEqual(parsedFixture.cards.eloCredito, ["", "172,88"]);
assert.deepEqual(parsedFixture.cards.mastercardCredito, ["256,73", "3.026,73"]);
assert.deepEqual(parsedFixture.cards.visaCredito, ["1.565,86", "50,00"]);
assert.equal(parsedFixture.sobra, "0,13");
assert.deepEqual(parsedTurno1, parsedFixture);

assert.deepEqual(parsedTurno2.cards.eloDebito, ["", "250,74"]);
assert.deepEqual(parsedTurno2.cards.maestroDebito, ["110,00", "1.542,24"]);
assert.deepEqual(parsedTurno2.cards.visaDebito, ["220,00", "1.380,74"]);
assert.deepEqual(parsedTurno2.cards.eloCredito, ["142,00", "599,46"]);
assert.deepEqual(parsedTurno2.cards.mastercardCredito, ["136,74", "3.500,42"]);
assert.deepEqual(parsedTurno2.cards.visaCredito, ["2.056,38", "130,00"]);
assert.equal(parsedTurno2.vendaProdutos, "14.587,04");
assert.equal(parsedTurno2.extras.sangria, "1.294,00");
assert.equal(parsedTurno2.sobra, "-131,48");

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

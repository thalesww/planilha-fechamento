import assert from "node:assert/strict";
import fs from "node:fs";

import {
  calculateClosing,
  classifyReceiptItem,
  parseReceiptLines
} from "../src/receiptOcrPipeline.js";

function readFixture(name) {
  return fs.readFileSync(new URL(`../tests/fixtures/${name}`, import.meta.url), "utf8");
}

function closeTo(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: expected ${expected}, got ${actual}`);
}

const aliases = [
  ["QRLIX - PIX SMART 10.00", "formasPagamento", "pix"],
  ["ORLINX PIX SMART 10.00", "formasPagamento", "pix"],
  ["TEF - VISA ELECTRON 1174.70", "formasPagamento", "tefVisaElectron"],
  ["TEF - UISA ELECTRON 1174.70", "formasPagamento", "tefVisaElectron"],
  ["MASTERCARD 220.00", "formasPagamento", "mastercard"],
  ["TEF - MASTERCARD 1122.11", "formasPagamento", "tefMastercard"],
  ["MAESTRO 109.10", "formasPagamento", "maestro"],
  ["TEF - MAESTRO 1859.19", "formasPagamento", "tefMaestro"],
  ["ELO CREDITO 142.00", "formasPagamento", "eloCredito"],
  ["TEF - ELO CREDITO 599.46", "formasPagamento", "tefEloCredito"],
  ["TROCO FINAL 200.00", "outrasSaidas", "trocoFinal"]
];

for (const [line, section, key] of aliases) {
  const classified = classifyReceiptItem(line);
  assert.equal(classified.section, section, line);
  assert.equal(classified.key, key, line);
}

const fixture20250625 = parseReceiptLines(readFixture("receipt-whatsapp-20260625.txt"));
closeTo(fixture20250625.vendaProdutos, 8112.39, "20260625 venda");
closeTo(fixture20250625.totalFormasPagamento, 7245.82, "20260625 formas");
closeTo(fixture20250625.totalOutrasSaidas, 864, "20260625 outras");
closeTo(fixture20250625.totalUsado, 8109.82, "20260625 total usado");
closeTo(fixture20250625.diferenca, -2.57, "20260625 diferenca");
assert.deepEqual(fixture20250625.warnings, []);

const turno1 = parseReceiptLines(readFixture("receipt-whatsapp-20260626-turno1.txt"));
closeTo(turno1.vendaProdutos, 11115.26, "turno1 venda");
closeTo(turno1.totalFormasPagamento, 9865.39, "turno1 formas");
closeTo(turno1.totalOutrasSaidas, 1250, "turno1 outras");
closeTo(turno1.totalUsado, 11115.39, "turno1 total usado");
closeTo(turno1.diferenca, 0.13, "turno1 diferenca");
assert.deepEqual(turno1.warnings, []);

const turno2 = parseReceiptLines(readFixture("receipt-whatsapp-20260626-turno2.txt"));
closeTo(turno2.vendaProdutos, 14587.04, "turno2 venda");
closeTo(turno2.totalFormasPagamento, 12961.56, "turno2 formas");
closeTo(turno2.totalOutrasSaidas, 1494, "turno2 outras com troco final");
closeTo(turno2.totalUsado, 14455.56, "turno2 total usado");
closeTo(turno2.diferenca, -131.48, "turno2 diferenca com troco final");
assert.equal(turno2.ignorados.length, 0);
assert.deepEqual(turno2.warnings, []);

const withVale = calculateClosing(turno2, { vale: 329 });
closeTo(withVale.diferenca, -460.48, "vale adjustment");

console.log("receipt OCR pipeline tests passed");

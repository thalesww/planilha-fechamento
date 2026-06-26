import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tesseract from "tesseract.js";
import { countOcrValues, normalizeOcrText, parseReceiptOcrText } from "../src/receiptOcr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260625.jpg");

const imagePath = process.env.OCR_TEST_IMAGE || DEFAULT_IMAGE;

const expected = {
  vendaProdutos: "8.112,39",
  cards: {
    eloDebito: ["", "160,00"],
    maestroDebito: ["109,10", "1.859,19"],
    visaDebito: ["40,00", "1.174,70"],
    eloCredito: ["311,76", ""],
    mastercardCredito: ["220,00", "1.122,11"],
    visaCredito: ["687,84", "265,31"]
  },
  extras: {
    abasteceAi: "473,39",
    pixStone: "602,42",
    notaPrazo: "220,00",
    sangria: "864,00"
  }
};

function flatten(obj, prefix = "") {
  return Object.entries(obj).flatMap(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (Array.isArray(value)) return value.map((item, index) => [`${nextKey}.${index}`, item]);
    if (value && typeof value === "object") return flatten(value, nextKey);
    return [[nextKey, value]];
  });
}

function assertDeepEqual(actual, expectedValue) {
  const mismatches = [];
  const actualMap = new Map(flatten(actual));
  for (const [key, expectedItem] of flatten(expectedValue)) {
    const actualItem = actualMap.get(key);
    if (actualItem !== expectedItem) {
      mismatches.push({ key, expected: expectedItem, actual: actualItem || "" });
    }
  }
  return mismatches;
}

if (!fs.existsSync(imagePath)) {
  console.error(`OCR_TEST_IMAGE nao encontrado: ${imagePath}`);
  process.exit(1);
}

const { recognize } = tesseract;
const result = await recognize(path.resolve(imagePath), "eng", {
  tessedit_pageseg_mode: "6"
});
const rawText = result.data.text;

const anchors = ["8112.39", "PIX", "ELO DEBITO", "VISA ELECTRON"];
const missingAnchors = anchors.filter((anchor) => !normalizeOcrText(rawText).includes(anchor));
if (missingAnchors.length) {
  console.error("OCR nao encontrou marcadores basicos da notinha:", missingAnchors.join(", "));
  console.error(rawText);
  process.exit(1);
}

const parsed = parseReceiptOcrText(rawText);
const mismatches = assertDeepEqual(parsed, expected);
if (mismatches.length) {
  console.error("OCR nao bateu com o resultado esperado:");
  console.table(mismatches);
  console.error("Texto OCR bruto:\n", rawText);
  process.exit(1);
}

console.log("OCR OK para imagem de teste.");
console.log(`Campos encontrados: ${countOcrValues(parsed)}`);
console.log(JSON.stringify(parsed, null, 2));

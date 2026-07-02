import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tesseract from "tesseract.js";
import { countOcrValues, normalizeOcrText, parseReceiptOcrText } from "../src/receiptOcr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260625.jpg");
const TURNO1_IMAGE = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260626-turno1.jpg");
const TURNO2_IMAGE = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260626-turno2.jpg");
const TURNO1_TEXT = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260626-turno1.txt");
const TURNO2_TEXT = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260626-turno2.txt");

const imagePath = process.env.OCR_TEST_IMAGE || DEFAULT_IMAGE;
const skipImageOcr = process.env.OCR_SKIP_IMAGE === "1";

const imageCases = process.env.OCR_TEST_IMAGE ? [
  {
    source: imagePath,
    type: "image",
    anchors: [],
    minValues: 1
  }
] : [
  {
    source: imagePath,
    type: "image",
    anchors: ["8112.39", "PIX", "ELO DEBITO", "VISA ELECTRON"],
    minValues: 8
  },
  {
    source: TURNO1_IMAGE,
    type: "image",
    anchors: ["11115.26", "PIX SMART", "0.13"],
    minValues: 9
  },
  {
    source: TURNO2_IMAGE,
    type: "image",
    anchors: ["14587.04", "TROCO FINAL", "-131.48"],
    minValues: 9
  }
];

const textCases = [
  {
    source: TURNO1_TEXT,
    type: "text",
    anchors: ["11115.26", "QRLINX", "ELO DEBITO", "TEF - VISA ELECTRON"],
    expected: {
      vendaProdutos: "11.115,26",
      cards: {
        eloDebito: ["250,48", "30,00"],
        maestroDebito: ["51,00", "2.143,83"],
        visaDebito: ["", "1.159,12"],
        eloCredito: ["", "172,88"],
        mastercardCredito: ["256,73", "3.026,73"],
        visaCredito: ["1.565,86", "50,00"]
      },
      extras: {
        abasteceAi: "247,90",
        pixStone: "910,86",
        notaPrazo: "",
        sangria: "1.250,00"
      },
      sobra: "0,13",
      diferencaSobra: "0,13"
    }
  },
  {
    source: TURNO2_TEXT,
    type: "text",
    anchors: ["14587.04", "TROCO FINAL", "DIFERENCA(FALTA)", "-131.48"],
    expected: {
      vendaProdutos: "14.587,04",
      cards: {
        eloDebito: ["", "250,74"],
        maestroDebito: ["110,00", "1.542,24"],
        visaDebito: ["220,00", "1.380,74"],
        eloCredito: ["142,00", "599,46"],
        mastercardCredito: ["136,74", "3.500,42"],
        visaCredito: ["2.056,38", "130,00"]
      },
      extras: {
        abasteceAi: "994,68",
        pixStone: "1.724,05",
        notaPrazo: "174,11",
        sangria: "1.294,00",
        trocoFinal: "200,00"
      },
      sobra: "-131,48",
      diferencaSobra: "-131,48"
    },
    expectedTotals: {
      cardTotal: 10068.72,
      extraTotal: 4386.84,
      calculatedSobra: -131.48,
      recognizedSobra: -131.48,
      isInconsistent: false
    }
  }
];

const cases = [
  ...imageCases.filter((testCase) => !(skipImageOcr && testCase.type === "image")),
  ...textCases
];

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

const { recognize } = tesseract;

for (const testCase of cases) {
  if (!fs.existsSync(testCase.source)) {
    console.error(`Fixture OCR nao encontrado: ${testCase.source}`);
    process.exit(1);
  }

  const rawText = testCase.type === "image"
    ? (await recognize(path.resolve(testCase.source), "eng", { tessedit_pageseg_mode: "6" })).data.text
    : fs.readFileSync(testCase.source, "utf8");

  const missingAnchors = testCase.anchors.filter((anchor) => !normalizeOcrText(rawText).includes(anchor));
  if (missingAnchors.length) {
    console.error("OCR nao encontrou marcadores basicos da notinha:", missingAnchors.join(", "));
    console.error(rawText);
    process.exit(1);
  }

  const parsed = parseReceiptOcrText(rawText);
  const foundValues = countOcrValues(parsed);
  const mismatches = testCase.expected ? assertDeepEqual(parsed, testCase.expected) : [];
  if (testCase.minValues && foundValues < testCase.minValues) {
    mismatches.push({ key: "countOcrValues", expected: `>= ${testCase.minValues}`, actual: foundValues });
  }
  if (testCase.expectedTotals) {
    for (const [key, expectedItem] of Object.entries(testCase.expectedTotals)) {
      const actualItem = parsed.ocrTotals?.[key] ?? parsed[key];
      const matches = typeof expectedItem === "number"
        ? Math.abs((actualItem || 0) - expectedItem) < 0.01
        : actualItem === expectedItem;
      if (!matches) mismatches.push({ key: `ocrTotals.${key}`, expected: expectedItem, actual: actualItem });
    }
  }
  if (mismatches.length) {
    console.error(`OCR nao bateu com o resultado esperado para ${path.basename(testCase.source)}:`);
    console.table(mismatches);
    console.error("Texto OCR bruto:\n", rawText);
    process.exit(1);
  }

  console.log(`OCR OK para ${path.basename(testCase.source)}.`);
  console.log(`Campos encontrados: ${foundValues}`);
  console.log(JSON.stringify(parsed, null, 2));
}

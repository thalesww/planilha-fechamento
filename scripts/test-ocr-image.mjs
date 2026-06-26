import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tesseract from "tesseract.js";
import { countOcrValues, normalizeOcrText, parseReceiptOcrText } from "../src/receiptOcr.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_IMAGE = path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260625.jpg");
const DEFAULT_TEXT_FIXTURES = [
  path.resolve(__dirname, "../tests/fixtures/receipt-whatsapp-20260626.txt")
];

const imagePath = process.env.OCR_TEST_IMAGE || DEFAULT_IMAGE;
const skipImageOcr = process.env.OCR_SKIP_IMAGE === "1";

const cases = [
  {
    source: imagePath,
    type: "image",
    anchors: ["8112.39", "PIX", "ELO DEBITO", "VISA ELECTRON"],
    expected: {
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
    }
  },
  {
    source: DEFAULT_TEXT_FIXTURES[0],
    type: "text",
    anchors: ["11115.26", "QRLINX", "ELO DEBITO", "TEF - VISA ELECTRON"],
    expected: {
      vendaProdutos: "11.115,26",
      cards: {
        eloDebito: ["250,48", "30,00"],
        maestroDebito: ["51,00", "2.143,83"],
        visaDebito: ["", "1.159,12"],
        eloCredito: ["", "172,88"],
        mastercardCredito: ["250,73", "3.026,73"],
        visaCredito: ["1.565,86", "50,00"]
      },
      extras: {
        abasteceAi: "247,90",
        pixStone: "910,86",
        notaPrazo: "",
        sangria: "1.250,00"
      }
    }
  }
].filter((testCase) => !(skipImageOcr && testCase.type === "image"));

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
  const mismatches = assertDeepEqual(parsed, testCase.expected);
  if (mismatches.length) {
    console.error(`OCR nao bateu com o resultado esperado para ${path.basename(testCase.source)}:`);
    console.table(mismatches);
    console.error("Texto OCR bruto:\n", rawText);
    process.exit(1);
  }

  console.log(`OCR OK para ${path.basename(testCase.source)}.`);
  console.log(`Campos encontrados: ${countOcrValues(parsed)}`);
  console.log(JSON.stringify(parsed, null, 2));
}

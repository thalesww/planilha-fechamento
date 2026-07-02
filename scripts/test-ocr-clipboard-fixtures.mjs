import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import tesseract from "tesseract.js";

import { parseReceiptLines } from "../src/receiptOcrPipeline.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.resolve(__dirname, "../tests/fixtures/clipboard-ocr");
const envPath = path.resolve(__dirname, "../.env.local");
const tolerance = Number(process.env.OCR_TOTAL_TOLERANCE || 0.05);

const expectedByGroup = {
  "20260626-turno2": {
    vendaProdutos: 14587.04,
    totalFormasPagamento: 12961.56,
    totalOutrasSaidas: 1494.00,
    totalUsado: 14455.56,
    diferenca: -131.48,
  },
  "20260626-turno1": {
    vendaProdutos: 11115.26,
    totalFormasPagamento: 9865.39,
    totalOutrasSaidas: 1250.00,
    totalUsado: 11115.39,
    diferenca: 0.13,
  },
  "20260624-turno1": {
    vendaProdutos: 8112.39,
    totalFormasPagamento: 7245.82,
    totalOutrasSaidas: 864.00,
    totalUsado: 8109.82,
    diferenca: -2.57,
  },
  "20260620-turno1": {
    vendaProdutos: 13284.34,
    totalFormasPagamento: 11688.93,
    totalOutrasSaidas: 1795.00,
    totalUsado: 13483.93,
    diferenca: 199.59,
  },
};

const imageCases = [
  ["receipt-20260626-turno2-a.png", "20260626-turno2"],
  ["receipt-20260626-turno2-b.png", "20260626-turno2"],
  ["receipt-20260626-turno1-a.png", "20260626-turno1"],
  ["receipt-20260626-turno1-b.png", "20260626-turno1"],
  ["receipt-20260626-turno1-c.png", "20260626-turno1"],
  ["receipt-20260626-turno1-d.png", "20260626-turno1"],
  ["receipt-20260624-turno1.png", "20260624-turno1"],
  ["receipt-20260620-turno1.png", "20260620-turno1"],
].map(([file, group]) => ({
  file,
  group,
  path: path.join(fixturesDir, file),
  expected: expectedByGroup[group],
}));

function loadDotEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  return Object.fromEntries(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
      })
  );
}

function closeEnough(actual, expected) {
  return typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function compareTotals(source, file, actual, expected) {
  const fields = ["vendaProdutos", "totalFormasPagamento", "totalOutrasSaidas", "totalUsado", "diferenca"];
  const mismatches = fields
    .filter((field) => !closeEnough(actual[field], expected[field]))
    .map((field) => ({ field, expected: expected[field], actual: actual[field] }));

  const calculatedDifference = Math.round(((actual.totalUsado || 0) - (actual.vendaProdutos || 0) + Number.EPSILON) * 100) / 100;
  if (!closeEnough(calculatedDifference, actual.diferenca)) {
    mismatches.push({
      field: "diferenca_calculada",
      expected: actual.diferenca,
      actual: calculatedDifference,
    });
  }

  return {
    source,
    file,
    ok: mismatches.length === 0,
    actual,
    expected,
    mismatches,
  };
}

function remoteTotals(receipt) {
  return {
    vendaProdutos: receipt?.totais?.vendaProdutos ?? receipt?.vendaProdutos ?? null,
    totalFormasPagamento: receipt?.totais?.formasPagamento ?? null,
    totalOutrasSaidas: receipt?.totais?.outrasSaidas ?? null,
    totalUsado: receipt?.totais?.totalUsado ?? null,
    diferenca: receipt?.totais?.diferenca ?? null,
  };
}

async function runLocalOcr(testCase) {
  const result = await tesseract.recognize(testCase.path, "eng", { tessedit_pageseg_mode: "6" });
  const parsed = parseReceiptLines(result.data.text);
  return compareTotals("local-tesseract", testCase.file, parsed, testCase.expected);
}

async function runRemoteOcr(testCase, env) {
  const apiUrl = (process.env.VITE_OCR_API_URL || env.VITE_OCR_API_URL || "").replace(/\/+$/, "");
  const apiKey = process.env.VITE_OCR_API_KEY || env.VITE_OCR_API_KEY || "";
  const timeoutMs = Number(process.env.VITE_OCR_TIMEOUT_MS || env.VITE_OCR_TIMEOUT_MS || 90000);
  if (!apiUrl || !apiKey) {
    return {
      source: "remote-api",
      file: testCase.file,
      ok: false,
      skipped: true,
      reason: "OCR remoto nao configurado",
      mismatches: [{ field: "remote", expected: "configurado", actual: "sem URL/chave" }],
    };
  }

  const url = apiUrl.endsWith("/api") ? `${apiUrl}/ocr/receipt` : `${apiUrl}/api/ocr/receipt`;
  let lastError = "";

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const form = new FormData();
      const bytes = fs.readFileSync(testCase.path);
      const blob = new Blob([bytes], { type: "image/png" });
      form.append("file", blob, testCase.file);
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-ocr-api-key": apiKey },
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const receipt = await response.json();
      return compareTotals("remote-api", testCase.file, remoteTotals(receipt), testCase.expected);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < 3 && /HTTP 5\d\d|abort|timeout|limite/i.test(lastError)) {
        await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    source: "remote-api",
    file: testCase.file,
    ok: false,
    error: lastError,
    mismatches: [{ field: "remote", expected: "resposta valida", actual: lastError }],
  };
}

for (const testCase of imageCases) {
  if (!fs.existsSync(testCase.path)) {
    console.error(`Fixture ausente: ${testCase.path}`);
    process.exit(1);
  }
}

const env = loadDotEnv(envPath);
const reports = [];

for (const testCase of imageCases) {
  reports.push(await runLocalOcr(testCase));
}

for (const testCase of imageCases) {
  reports.push(await runRemoteOcr(testCase, env));
}

const summary = reports.map((report) => ({
  OCR: report.source,
  imagem: report.file,
  ok: report.ok ? "OK" : "FALHOU",
  venda: report.actual?.vendaProdutos,
  formas: report.actual?.totalFormasPagamento,
  outras: report.actual?.totalOutrasSaidas,
  total: report.actual?.totalUsado,
  diferenca: report.actual?.diferenca,
  erro: report.error || report.reason || "",
}));

console.table(summary);

const failures = reports.filter((report) => !report.ok);
if (failures.length) {
  console.error("\nFalhas detalhadas:");
  for (const failure of failures) {
    console.error(`\n${failure.source} - ${failure.file}`);
    console.table(failure.mismatches);
  }
  process.exit(1);
}

console.log("Todas as imagens bateram com os totais esperados no OCR local e remoto.");

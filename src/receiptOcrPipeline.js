import { normalizeOcrText, parseMoney } from "./receiptOcr.js";

const DEFAULT_IGNORE_RULES = [
  {
    key: "trocoFinal",
    enabled: true,
    patterns: [/\bTROCO\b.*\bFINAL\b/],
    reason: "troco_final"
  }
];

const NUMBER_PATTERN = /[-+]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|[-+]?\s*\d+[.,]\d{2}|[-+]?\s*\d{3,5}/g;

function roundCurrency(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function normalizeLabel(label) {
  return normalizeOcrText(label)
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/[^A-Z]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseReceiptNumber(value) {
  const numeric = String(value || "").replace(/[^\d,.-]/g, "");
  const decimalIndex = Math.max(numeric.lastIndexOf(","), numeric.lastIndexOf("."));
  if (decimalIndex < 0) return roundCurrency(parseMoney(numeric));
  const integerPart = numeric.slice(0, decimalIndex).replace(/[^\d-]/g, "") || "0";
  const decimalPart = numeric.slice(decimalIndex + 1).replace(/\D/g, "");
  const parsed = Number.parseFloat(`${integerPart}.${decimalPart}`);
  return roundCurrency(Number.isFinite(parsed) ? parsed : 0);
}

function extractLastNumber(line, { preserveSign = false } = {}) {
  const matches = String(line || "").match(NUMBER_PATTERN);
  if (!matches?.length) return null;
  const raw = matches[matches.length - 1];
  const parsed = Math.abs(parseReceiptNumber(raw));
  const isNegative = preserveSign && /-\s*\d/.test(raw);
  return isNegative ? -parsed : parsed;
}

function extractLabel(line) {
  return String(line || "")
    .replace(NUMBER_PATTERN, " ")
    .replace(/[.:;=_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchesAny(label, patterns) {
  return patterns.some((pattern) => pattern.test(label));
}

function makeEmptyStructuredResult() {
  return {
    vendaProdutos: 0,
    formasPagamento: {},
    outrasSaidas: {},
    ignorados: [],
    resumoImpresso: {},
    totalFormasPagamento: 0,
    totalOutrasSaidas: 0,
    totalUsado: 0,
    diferenca: 0,
    confidence: 0,
    warnings: []
  };
}

const CLASSIFIERS = [
  { section: "entrada", key: "vendaProdutos", patterns: [/\bVENDA\b.*\bPRODUT/] },
  { section: "resumo", key: "formasPagamento", patterns: [/\bFORMAS?\b.*\bPAGAMENTO\b/] },
  { section: "resumo", key: "outrasSaidas", patterns: [/\bOUTRAS?\b.*\bSAIDAS?\b/] },
  { section: "resumo", key: "total", patterns: [/^TOTAL\b/] },
  { section: "resumo", key: "diferenca", preserveSign: true, patterns: [/\bDIFERENCA\b/] },
  { section: "formasPagamento", key: "abasteceAi", patterns: [/\bABASTECE\b/, /\bABASTECE\s*AI\b/, /\bRIE\s*CARTAY\b/] },
  { section: "formasPagamento", key: "pix", patterns: [/\bQRLIX\b/, /\bQRLINX\b/, /\bGRLINX\b/, /\bORLINX\b/, /\bRLINX\b/, /\bPIX\b.*\bSMART\b/, /\bPIX\b/] },
  { section: "formasPagamento", key: "notaPrazo", patterns: [/\bNOTA\b.*\bPRAZO\b/, /\bPRAZO\b/] },
  { section: "outrasSaidas", key: "sangria", patterns: [/\bSANGRIA\b/, /\bANGRIA\b/, /\bANGRTA\b/] },
  { section: "formasPagamento", key: "tefVisaElectron", patterns: [/\bTE[FP]\b.*\b[VU]ISA\b.*\bELECTR?ON\b/, /\bTE[FP]\b.*\bELECTR?ON\b/] },
  { section: "formasPagamento", key: "tefVisa", patterns: [/\bTE[FP]\b.*\b[VU]ISA\b/] },
  { section: "formasPagamento", key: "visaElectron", patterns: [/\b[VU]ISA\b.*\bELECTR?ON\b/] },
  { section: "formasPagamento", key: "visaCredito", patterns: [/\b[VU]ISA\b.*\bCREDITO\b/, /\bCREDITO\b.*\b[VU]ISA\b/] },
  { section: "formasPagamento", key: "tefEloCredito", patterns: [/\bTE[FP]\b.*\bELO\b.*\bCREDITO\b/] },
  { section: "formasPagamento", key: "tefEloDebito", patterns: [/\bTE[FP]\b.*\bELO\b.*\bDEBITO\b/] },
  { section: "formasPagamento", key: "eloCredito", patterns: [/\bELO\b.*\bCREDITO\b/, /\bCREDITO\b.*\bELO\b/] },
  { section: "formasPagamento", key: "eloDebito", patterns: [/\bELO\b.*\bDEBITO\b/, /\bDEBITO\b.*\bELO\b/] },
  { section: "formasPagamento", key: "tefMaestro", patterns: [/\bTE[FP]\b.*\bMAESTRO\b/, /\bTE[FP]\b.*\bHAESTRO\b/] },
  { section: "formasPagamento", key: "maestro", patterns: [/\bMAESTRO\b/, /\bHAESTRO\b/] },
  { section: "formasPagamento", key: "tefMastercard", patterns: [/\bTE[FP]\b.*\bMASTERCARD\b/, /\bTE[FP]\b.*\bHASTERCARD\b/, /\bTE[FP]\b.*\bMASTER\s*CARD\b/] },
  { section: "formasPagamento", key: "mastercard", patterns: [/\bMASTERCARD\b/, /\bHASTERCARD\b/, /\bMASTER\s*CARD\b/, /\bERCARD\b/] }
];

export async function preprocessImage(input, options = {}) {
  const {
    scale = 2.5,
    grayscale = true,
    threshold = true,
    crop = true
  } = options;

  if (typeof document === "undefined" || typeof Image === "undefined") {
    return {
      image: input,
      variants: [{ key: "original", image: input }],
      meta: { skipped: true, reason: "canvas_unavailable" }
    };
  }

  const dataUrl = input instanceof File || input instanceof Blob
    ? await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(input);
    })
    : input;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const bounds = crop ? detectReceiptBounds(image) : { x: 0, y: 0, width: image.width, height: image.height };
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(bounds.width * scale);
  canvas.height = Math.floor(bounds.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, bounds.x, bounds.y, bounds.width, bounds.height, 0, 0, canvas.width, canvas.height);

  if (grayscale || threshold) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = threshold ? (gray < 168 ? 0 : 255) : gray;
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  const processed = canvas.toDataURL("image/png");
  return {
    image: processed,
    variants: [
      { key: "processed", image: processed },
      { key: "original", image: input }
    ],
    meta: { bounds, scale, grayscale, threshold }
  };
}

function detectReceiptBounds(image) {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  const { data } = ctx.getImageData(0, 0, image.width, image.height);
  let minX = image.width;
  let minY = image.height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < image.height; y += 4) {
    for (let x = 0; x < image.width; x += 4) {
      const index = (y * image.width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      const spread = Math.max(r, g, b) - Math.min(r, g, b);
      if (brightness > 95 && spread < 95) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, width: image.width, height: image.height };
  const marginX = Math.floor(image.width * 0.03);
  const marginY = Math.floor(image.height * 0.03);
  return {
    x: Math.max(0, minX - marginX),
    y: Math.max(0, minY - marginY),
    width: Math.min(image.width, maxX + marginX) - Math.max(0, minX - marginX),
    height: Math.min(image.height, maxY + marginY) - Math.max(0, minY - marginY)
  };
}

export function extractReceiptRegions(input) {
  if (typeof document !== "undefined" && typeof Image !== "undefined" && typeof input === "string") {
    return [
      { key: "entradas", image: input, bounds: { x: 0, y: 0.30, width: 1, height: 0.22 } },
      { key: "saidas", image: input, bounds: { x: 0, y: 0.42, width: 1, height: 0.42 } },
      { key: "resumo", image: input, bounds: { x: 0, y: 0.72, width: 1, height: 0.22 } }
    ];
  }

  return [
    { key: "full", image: input, bounds: { x: 0, y: 0, width: 1, height: 1 } }
  ];
}

async function cropRegion(region) {
  if (!region.bounds || region.bounds.width === 1 && region.bounds.height === 1 && region.bounds.x === 0 && region.bounds.y === 0) {
    return region.image;
  }
  if (typeof document === "undefined" || typeof Image === "undefined" || typeof region.image !== "string") return region.image;

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = region.image;
  });

  const canvas = document.createElement("canvas");
  const source = {
    x: Math.floor(region.bounds.x * image.width),
    y: Math.floor(region.bounds.y * image.height),
    width: Math.floor(region.bounds.width * image.width),
    height: Math.floor(region.bounds.height * image.height)
  };
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, source.x, source.y, source.width, source.height, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/png");
}

async function resolveRecognizer(recognizer) {
  if (recognizer) return recognizer;
  const tesseract = await import("tesseract.js");
  return tesseract.recognize || tesseract.default?.recognize;
}

export async function runOcrText(image, options = {}) {
  const recognize = await resolveRecognizer(options.recognizer);
  if (!recognize) throw new Error("OCR indisponivel");
  const result = await recognize(image, options.lang || "eng", {
    tessedit_pageseg_mode: options.psm || "6"
  });
  return result?.data?.text || "";
}

export async function runOcrNumbers(image, options = {}) {
  const recognize = await resolveRecognizer(options.recognizer);
  if (!recognize) throw new Error("OCR numerico indisponivel");
  const result = await recognize(image, options.lang || "eng", {
    tessedit_pageseg_mode: options.psm || "6",
    tessedit_char_whitelist: "0123456789.,-"
  });
  return result?.data?.text || "";
}

export function classifyReceiptItem(line, options = {}) {
  const label = normalizeLabel(extractLabel(line));
  const ignoreRules = options.ignoreRules || DEFAULT_IGNORE_RULES;
  const value = extractLastNumber(line, { preserveSign: /\bDIFERENCA\b/.test(label) });

  for (const rule of ignoreRules) {
    if (rule.enabled !== false && matchesAny(label, rule.patterns)) {
      return { section: "ignorado", key: rule.key, label, value, reason: rule.reason };
    }
  }

  const classifier = CLASSIFIERS.find((candidate) => matchesAny(label, candidate.patterns));
  if (!classifier) return { section: "unknown", key: "", label, value };
  return {
    section: classifier.section,
    key: classifier.key,
    label,
    value: classifier.preserveSign ? extractLastNumber(line, { preserveSign: true }) : value
  };
}

export function parseReceiptLines(textOrLines, options = {}) {
  const result = makeEmptyStructuredResult();
  const lines = Array.isArray(textOrLines)
    ? textOrLines
    : String(textOrLines || "").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = String(rawLine || "").replace(/\s+/g, " ").trim();
    if (!line) continue;
    const item = classifyReceiptItem(line, options);
    if (item.value === null && item.section !== "unknown") continue;

    if (item.section === "entrada" && item.key === "vendaProdutos") {
      result.vendaProdutos ||= item.value;
    } else if (item.section === "formasPagamento") {
      result.formasPagamento[item.key] ??= item.value;
    } else if (item.section === "outrasSaidas") {
      result.outrasSaidas[item.key] ??= item.value;
    } else if (item.section === "resumo") {
      result.resumoImpresso[item.key] ??= item.value;
    } else if (item.section === "ignorado") {
      result.ignorados.push(item);
    }
  }

  return calculateClosing(result, options);
}

export function calculateClosing(parsed, options = {}) {
  const totalFormasPagamento = roundCurrency(Object.values(parsed.formasPagamento || {}).reduce((sum, value) => sum + Number(value || 0), 0));
  const totalOutrasSaidas = roundCurrency(Object.values(parsed.outrasSaidas || {}).reduce((sum, value) => sum + Number(value || 0), 0));
  const totalUsado = roundCurrency(totalFormasPagamento + totalOutrasSaidas);
  const vale = Number(options.vale || options.valeAdjustment || 0);
  const diferenca = roundCurrency(totalUsado - Number(parsed.vendaProdutos || 0) - vale);

  return validateTotals({
    ...makeEmptyStructuredResult(),
    ...parsed,
    totalFormasPagamento,
    totalOutrasSaidas,
    totalUsado,
    diferenca
  }, options);
}

export function validateTotals(result, options = {}) {
  const tolerance = options.tolerance ?? 0.01;
  const warnings = [...(result.warnings || [])];
  const resumo = result.resumoImpresso || {};

  if (!result.vendaProdutos) warnings.push("venda_produtos_nao_lida");
  if (resumo.formasPagamento != null && Math.abs(resumo.formasPagamento - result.totalFormasPagamento) > tolerance) {
    warnings.push("total_formas_pagamento_divergente");
  }
  if (resumo.outrasSaidas != null && Math.abs(resumo.outrasSaidas - result.totalOutrasSaidas) > tolerance) {
    warnings.push("total_outras_saidas_divergente");
  }
  if (resumo.diferenca != null && Math.abs(resumo.diferenca - result.diferenca) > tolerance) {
    warnings.push("diferenca_impressa_divergente");
  }

  const filledGroups = [
    result.vendaProdutos ? 1 : 0,
    Object.keys(result.formasPagamento || {}).length ? 1 : 0,
    Object.keys(result.outrasSaidas || {}).length ? 1 : 0,
    resumo.diferenca != null ? 1 : 0
  ].reduce((sum, value) => sum + value, 0);

  return {
    vendaProdutos: result.vendaProdutos,
    formasPagamento: result.formasPagamento || {},
    outrasSaidas: result.outrasSaidas || {},
    ignorados: result.ignorados || [],
    totalFormasPagamento: result.totalFormasPagamento,
    totalOutrasSaidas: result.totalOutrasSaidas,
    totalUsado: result.totalUsado,
    diferenca: result.diferenca,
    confidence: roundCurrency(Math.min(1, filledGroups / 4)),
    warnings
  };
}

export async function processReceiptImage(input, options = {}) {
  const preprocessed = await preprocessImage(input, options.preprocess);
  const regions = extractReceiptRegions(preprocessed.image);
  const texts = [];

  for (const region of regions) {
    const regionImage = await cropRegion(region);
    const text = await runOcrText(regionImage, options.ocr);
    texts.push(text);
    if (options.runNumericPass) texts.push(await runOcrNumbers(regionImage, options.ocr));
  }

  return parseReceiptLines(texts.join("\n"), options.parser);
}

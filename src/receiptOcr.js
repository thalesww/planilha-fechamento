export function normalizeOcrText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[|]/g, "I");
}

function formatNumber(value) {
  return (value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, "")
    .replace(/\./g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatOcrNumeric(value) {
  if (!value) return "";
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return "";
  return formatNumber(Number(digits) / 100);
}

function extractAmountFromLine(line) {
  const matches = line.match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}|\d{3,5}/g);
  if (!matches?.length) return "";
  return formatOcrNumeric(matches[matches.length - 1]);
}

function isTefLine(line) {
  return /\bT[EFP]\b/.test(line) || line.includes("F -") || line.includes("EF -");
}

export function createEmptyOcrResult() {
  return {
    vendaProdutos: "",
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
    },
    optionalExtras: {},
    sobra: ""
  };
}

function setIfEmpty(result, section, key, indexOrValue, maybeValue) {
  if (section === "cards") {
    const index = indexOrValue;
    const value = maybeValue;
    if (value && !result.cards[key][index]) result.cards[key][index] = value;
    return;
  }

  const value = indexOrValue;
  if (value && !result[section][key]) result[section][key] = value;
}

const CARD_LABEL_ALIASES = [
  { key: "eloDebito", index: 1, patterns: [/\bTEF\b.*\bELO\b.*\bDEBITO\b/, /\bTEF\b.*\bDEBITO\b.*\bELO\b/] },
  { key: "eloDebito", index: 0, patterns: [/\bELO\b.*\bDEBITO\b/, /\bDEBITO\b.*\bELO\b/] },
  { key: "maestroDebito", index: 1, patterns: [/\bTEF\b.*\bMAESTRO\b/, /\bTEF\b.*\bMASTER\s*DEBITO\b/] },
  { key: "maestroDebito", index: 0, patterns: [/\bMAESTRO\b/, /\bMASTER\s*DEBITO\b/] },
  { key: "visaDebito", index: 1, patterns: [/\bTEF\b.*\bVISA\s*ELECTRON\b/, /\bTEF\b.*\bVISA\b.*\bDEBITO\b/] },
  { key: "visaDebito", index: 0, patterns: [/\bVISA\s*ELECTRON\b/, /\bVISA\b.*\bDEBITO\b/] },
  { key: "eloCredito", index: 1, patterns: [/\b2[O0]?\b.*\bVALOR\b.*\bELO\b.*\bCREDITO\b/, /\bTEF\b.*\bELO\b.*\bCREDITO\b/] },
  { key: "eloCredito", index: 0, patterns: [/\bELO\b.*\bCREDITO\b/, /\bCREDITO\b.*\bELO\b/] },
  { key: "mastercardCredito", index: 1, patterns: [/\bTEF\b.*\bMASTERCARD\b/, /\bTEF\b.*\bMASTER\s*CARD\b/, /\bTEF\b.*\bMASTER\b.*\bCREDITO\b/] },
  { key: "mastercardCredito", index: 0, patterns: [/\bMASTERCARD\b/, /\bMASTER\s*CARD\b/, /\bMASTER\b.*\bCREDITO\b/] },
  { key: "visaCredito", index: 0, patterns: [/\bTEF\b.*\bVISA\b/] },
  { key: "visaCredito", index: 1, patterns: [/\bVISA\b.*\bCREDITO\b/, /\bCREDITO\b.*\bVISA\b/] }
];

const EXTRA_LABEL_ALIASES = [
  { section: "extras", key: "abasteceAi", patterns: [/\bABASTECE\b/, /\bABASTECE\s*AI\b/] },
  { section: "extras", key: "notaPrazo", patterns: [/\bNOTA\b.*\bPRAZO\b/, /\bPRAZO\b/] },
  { section: "extras", key: "sangria", patterns: [/\bSANGRIA\b/] },
  { section: "optionalExtras", key: "pixCnpj", patterns: [/\bPIX\b.*\bCNPJ\b/] },
  { section: "extras", key: "pixStone", patterns: [/\bPIX\s*STONE\b/, /\bQRLIX\b/, /\bQRLINX\b/, /\bPIX\b/] },
  { section: "optionalExtras", key: "outroDebito", patterns: [/\bOUTRO\b.*\bDEBITO\b/] },
  { section: "optionalExtras", key: "outroCredito", patterns: [/\bOUTRO\b.*\bCREDITO\b/] },
  { section: "optionalExtras", key: "depositosConta", patterns: [/\bDEPOSITO/, /\bCONTA\b/] },
  { section: "optionalExtras", key: "proFrotas", patterns: [/\bPRO\s*FROTAS\b/] },
  { section: "optionalExtras", key: "ctf", patterns: [/\bCTF\b/] },
  { section: "optionalExtras", key: "chequesVista", patterns: [/\bCHEQUE/, /\bCHEQUES\b.*\bVISTA\b/] },
  { section: "optionalExtras", key: "valesMotorista", patterns: [/\bVALES?\b.*\bMOTORISTA\b/] },
  { section: "optionalExtras", key: "valesFuncionarios", patterns: [/\bVALES?\b.*\bFUNCIONARIO\b/] },
  { section: "optionalExtras", key: "especie", patterns: [/\bESPECIE\b/, /\bDINHEIRO\b/] },
  { section: "optionalExtras", key: "moedas", patterns: [/\bMOEDAS?\b/] },
  { section: "optionalExtras", key: "cedulasNaoAceitas", patterns: [/\bCEDULAS?\b.*\bNAO\b.*\bACEITAS?\b/, /\bCOFRE\b/] }
];

function normalizeLabel(label) {
  return normalizeOcrText(label).replace(/[^A-Z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function extractComputerAmount(line) {
  const match = line.match(/(?:R\$\s*)?[-+]?\d{1,3}(?:\.\d{3})*,\d{2}|(?:R\$\s*)?[-+]?\d+[,.]\d{2}/i);
  return match ? formatNumber(parseComputerMoney(match[0])) : "";
}

function parseComputerMoney(value) {
  if (!value) return 0;

  const numeric = String(value).replace(/[^\d,.-]/g, "");
  const decimalSeparatorIndex = Math.max(numeric.lastIndexOf(","), numeric.lastIndexOf("."));

  if (decimalSeparatorIndex < 0) return parseMoney(numeric);

  const integerPart = numeric.slice(0, decimalSeparatorIndex).replace(/[^\d-]/g, "");
  const decimalPart = numeric.slice(decimalSeparatorIndex + 1).replace(/\D/g, "");
  const parsed = Number.parseFloat(`${integerPart || "0"}.${decimalPart}`);

  return Number.isFinite(parsed) ? parsed : 0;
}

function createEmptyClosingParseResult() {
  return {
    vendaProdutos: "",
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
    },
    optionalExtras: {},
    sobra: ""
  };
}

export function parseClosingText(text) {
  const result = createEmptyClosingParseResult();
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const value = extractComputerAmount(line);
    if (!value) continue;

    const [rawLabel = line] = line.split(/[:;=]/);
    const label = normalizeLabel(rawLabel);

    if (/\bVENDA\b.*\bPRODUT/.test(label) || /\bVENDA\b.*\bPOSTO\b/.test(label)) {
      result.vendaProdutos = value;
      continue;
    }

    if (/\bSOBRA\b/.test(label) || /\bTROCO\b.*\bFINAL\b/.test(label) || /\bDIFERENCA\b/.test(label)) {
      result.sobra = value;
      continue;
    }

    const cardAlias = CARD_LABEL_ALIASES.find((alias) => alias.patterns.some((pattern) => pattern.test(label)));
    if (cardAlias) {
      result.cards[cardAlias.key][cardAlias.index] = value;
      continue;
    }

    const extraAlias = EXTRA_LABEL_ALIASES.find((alias) => alias.patterns.some((pattern) => pattern.test(label)));
    if (extraAlias?.section === "extras") {
      result.extras[extraAlias.key] = value;
    } else if (extraAlias?.section === "optionalExtras") {
      result.optionalExtras[extraAlias.key] = value;
    }
  }

  return result;
}

export function parseReceiptOcrText(text) {
  const result = createEmptyOcrResult();
  const normalized = normalizeOcrText(text);
  const lines = normalized
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const value = extractAmountFromLine(line);
    if (!value) continue;

    if (line.includes("VENDA") && line.includes("PRODUT")) {
      if (!result.vendaProdutos) result.vendaProdutos = value;
    } else if (line.includes("ABASTECE") || line.includes("RIE CARTAY")) {
      setIfEmpty(result, "extras", "abasteceAi", value);
    } else if (line.includes("QRL") || line.includes("PIX") || line.includes("RLINX")) {
      setIfEmpty(result, "extras", "pixStone", value);
    } else if (line.includes("NOTA") && line.includes("PRAZ")) {
      setIfEmpty(result, "extras", "notaPrazo", value);
    } else if (line.includes("ANGR") || line.includes("SANGRIA")) {
      setIfEmpty(result, "extras", "sangria", value);
    } else if (line.includes("ELO") && line.includes("CREDIT")) {
      setIfEmpty(result, "cards", "eloCredito", isTefLine(line) ? 1 : 0, value);
    } else if (line.includes("ELO") && line.includes("DEBIT")) {
      setIfEmpty(result, "cards", "eloDebito", isTefLine(line) ? 1 : 0, value);
    } else if (line.includes("HAESTRO") || line.includes("MAESTRO")) {
      if (isTefLine(line)) {
        setIfEmpty(result, "cards", "maestroDebito", 1, value);
      } else {
        setIfEmpty(result, "cards", "maestroDebito", 0, value);
      }
    } else if (line.includes("HASTERC") || line.includes("MASTERC") || line.includes("ERCARD")) {
      if (isTefLine(line) || line.includes("HASTERC ARD")) {
        setIfEmpty(result, "cards", "mastercardCredito", 1, value);
      } else {
        setIfEmpty(result, "cards", "mastercardCredito", 0, value);
      }
    } else if (line.includes("TEF") && line.includes("VISA") && line.includes("ELECTRON")) {
      setIfEmpty(result, "cards", "visaDebito", 1, value);
    } else if (line.includes("TEF") && line.includes("VISA")) {
      setIfEmpty(result, "cards", "visaCredito", 0, value);
    } else if (line.includes("VISA") && line.includes("CREDIT")) {
      setIfEmpty(result, "cards", "visaCredito", 1, value);
    } else if (line.includes("VISA") && line.includes("ELECTRON")) {
      setIfEmpty(result, "cards", "visaDebito", 0, value);
    }
  }

  return result;
}

export function countOcrValues(result) {
  const cardCount = Object.values(result.cards).flat().filter(Boolean).length;
  const extraCount = Object.values(result.extras || {}).filter(Boolean).length;
  const optionalExtraCount = Object.values(result.optionalExtras || {}).filter(Boolean).length;
  return cardCount + extraCount + optionalExtraCount + (result.vendaProdutos ? 1 : 0) + (result.sobra ? 1 : 0);
}

export function applyOcrResultToClosing(currentClosing, ocrResult, { overwrite = false } = {}) {
  const next = structuredClone(currentClosing);

  if (ocrResult.vendaProdutos && (overwrite || !next.vendaProdutos)) next.vendaProdutos = ocrResult.vendaProdutos;

  for (const [key, values] of Object.entries(ocrResult.cards)) {
    values.forEach((value, index) => {
      if (value && (overwrite || !next.cards[key][index])) next.cards[key][index] = value;
    });
  }

  for (const [key, value] of Object.entries(ocrResult.extras || {})) {
    if (value && (overwrite || !next.extras[key])) next.extras[key] = value;
  }

  next.optionalExtras = next.optionalExtras || {};
  for (const [key, value] of Object.entries(ocrResult.optionalExtras || {})) {
    if (value && (overwrite || !next.optionalExtras[key])) next.optionalExtras[key] = value;
  }

  if (ocrResult.sobra && (overwrite || !next.sobra)) next.sobra = ocrResult.sobra;

  return next;
}

export { parseMoney };

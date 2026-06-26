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
    sobra: "",
    ocrInconsistent: false
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

function isSobraLine(line) {
  return line.includes("DIFERENCA(SOBRA)")
    || line.includes("DIFERENCA (SOBRA)")
    || line.includes("DIFERENCA")
    || line.includes("SOBRA");
}

const OCR_RECEIPT_TOTAL_TOLERANCE = 0.01;

function sumMoneyValues(values) {
  return values.reduce((total, value) => total + parseMoney(value), 0);
}

export function calculateOcrReceiptTotals(ocrResult) {
  const cardTotal = Object.values(ocrResult?.cards || {})
    .flat()
    .reduce((total, value) => total + parseMoney(value), 0);
  const extraTotal = sumMoneyValues(Object.values(ocrResult?.extras || {}));
  const optionalExtraTotal = sumMoneyValues(Object.values(ocrResult?.optionalExtras || {}));
  const vendaProdutos = parseMoney(ocrResult?.vendaProdutos);
  const calculatedSobra = cardTotal + extraTotal + optionalExtraTotal - vendaProdutos;
  const recognizedSobra = parseMoney(ocrResult?.sobra);
  const difference = calculatedSobra - recognizedSobra;
  const hasRecognizedSobra = Boolean(ocrResult?.sobra);

  return {
    cardTotal,
    extraTotal,
    optionalExtraTotal,
    vendaProdutos,
    calculatedSobra,
    recognizedSobra,
    difference,
    isInconsistent: hasRecognizedSobra && Math.abs(difference) > OCR_RECEIPT_TOTAL_TOLERANCE
  };
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

    if (isSobraLine(line)) {
      if (!result.sobra) result.sobra = value;
    } else if (line.includes("VENDA") && line.includes("PRODUT")) {
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

  const totals = calculateOcrReceiptTotals(result);
  result.ocrInconsistent = totals.isInconsistent;
  result.ocrTotals = totals;

  return result;
}

export function countOcrValues(result) {
  const cardCount = Object.values(result.cards).flat().filter(Boolean).length;
  const extraCount = Object.values(result.extras).filter(Boolean).length;
  return cardCount + extraCount + (result.vendaProdutos ? 1 : 0) + (result.sobra ? 1 : 0);
}

export function applyOcrResultToClosing(currentClosing, ocrResult) {
  const next = structuredClone(currentClosing);

  if (ocrResult.vendaProdutos && !next.vendaProdutos) next.vendaProdutos = ocrResult.vendaProdutos;

  for (const [key, values] of Object.entries(ocrResult.cards)) {
    values.forEach((value, index) => {
      if (value && !next.cards[key][index]) next.cards[key][index] = value;
    });
  }

  for (const [key, value] of Object.entries(ocrResult.extras)) {
    if (value && !next.extras[key]) next.extras[key] = value;
  }

  return next;
}

export { parseMoney };

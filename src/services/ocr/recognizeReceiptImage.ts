import type { LegacyOcrResult, OcrEvidenceLine, ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";
import { recognizeReceiptLocalFallback } from "./localOcrFallback.ts";
import { recognizeReceiptRemote } from "./remoteOcrClient.ts";

export type RecognizeReceiptImageOptions = {
  onProgress?: (message: string) => void;
  onRemoteError?: (error: Error) => void;
  onRemoteUploadPrepared?: (imageDataUrl: string) => void;
  remoteClient?: typeof recognizeReceiptRemote;
  localFallback?: typeof recognizeReceiptLocalFallback;
};

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeEvidenceText(text: string): string {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[|]/g, "I")
    .replace(/0/g, "O")
    .replace(/1/g, "I")
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseEvidenceNumber(text: string): number | null {
  const matches = String(text || "").match(/[-+]?\s*\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|[-+]?\s*\d+[.,]\d{2}|[-+]?\s*\d{3,5}/g);
  if (!matches?.length) return null;
  const raw = matches[matches.length - 1];
  const numeric = raw.replace(/[^\d,.-]/g, "");
  const decimalIndex = Math.max(numeric.lastIndexOf(","), numeric.lastIndexOf("."));
  if (decimalIndex < 0) return Math.round((Number(numeric || 0) / 100) * 100) / 100;
  const integerPart = numeric.slice(0, decimalIndex).replace(/[^\d-]/g, "") || "0";
  const decimalPart = numeric.slice(decimalIndex + 1).replace(/\D/g, "");
  const parsed = Number.parseFloat(`${integerPart}.${decimalPart}`);
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) / 100 : null;
}

function valuesMatch(lineText: string, value: number | null | undefined): boolean {
  if (typeof value !== "number" || !Number.isFinite(value)) return false;
  const parsed = parseEvidenceNumber(lineText);
  return parsed !== null && Math.abs(parsed - Math.abs(value)) <= 0.01;
}

function findEvidenceLines(
  lines: OcrEvidenceLine[],
  value: number | null | undefined,
  patterns: RegExp[],
): OcrEvidenceLine[] {
  if (typeof value !== "number" || !Number.isFinite(value) || !Array.isArray(lines)) return [];
  const normalized = lines.map((line) => normalizeEvidenceText(line.text));
  const matchesLabel = (text: string) => patterns.some((pattern) => pattern.test(text));
  const chosen = new Set<number>();

  for (let index = 0; index < lines.length; index++) {
    const around = [
      normalized[index],
      `${normalized[index]} ${normalized[index + 1] || ""}`.trim(),
      `${normalized[index - 1] || ""} ${normalized[index]}`.trim(),
    ];
    if (!around.some(matchesLabel)) continue;

    const from = Math.max(0, index - 2);
    const to = Math.min(lines.length - 1, index + 2);
    for (let valueIndex = from; valueIndex <= to; valueIndex++) {
      if (!valuesMatch(lines[valueIndex].text, value)) continue;
      chosen.add(valueIndex);
      chosen.add(index);
      if (valueIndex > index && valueIndex <= index + 2) {
        for (let extraIndex = index + 1; extraIndex < valueIndex; extraIndex++) chosen.add(extraIndex);
      }
      if (valueIndex < index && valueIndex >= index - 2) {
        for (let extraIndex = valueIndex + 1; extraIndex < index; extraIndex++) chosen.add(extraIndex);
      }
      return [...chosen].sort((a, b) => a - b).map((lineIndex) => lines[lineIndex]).filter((line) => line?.bbox);
    }
  }

  return [];
}

function buildEvidence(result: ReceiptOcrResult): Record<string, OcrEvidenceLine[]> {
  const lines = result.raw?.lines || [];
  const evidence: Record<string, OcrEvidenceLine[]> = {};
  const set = (key: string, value: number | null | undefined, patterns: RegExp[]) => {
    const found = findEvidenceLines(lines, value, patterns);
    if (found.length) evidence[key] = found;
  };

  set("vendaProdutos", result.vendaProdutos, [/\bVENDA\b.*\bPRODUT/, /\bENDA\b.*\bPRODUT/]);
  set("cards.eloDebito.0", result.formasPagamento.eloDebito, [/\bELO\b.*\bDEBITO\b/]);
  set("cards.eloDebito.1", result.formasPagamento.tefEloDebito, [/\bTE[FP]\b.*\bELO\b.*\bDEBITO\b/]);
  set("cards.maestroDebito.0", result.formasPagamento.maestro, [/\bMAESTRO\b/, /\bHAESTRO\b/]);
  set("cards.maestroDebito.1", result.formasPagamento.tefMaestro, [/\bTE[FP]\b.*\bMAESTRO\b/, /\bTE[FP]\b.*\bHAESTRO\b/]);
  set("cards.visaDebito.0", result.formasPagamento.visaElectron, [/\b[VU]ISA\b.*\bELECTR?ON\b/]);
  set("cards.visaDebito.1", result.formasPagamento.tefVisaElectron, [/\bTE[FP]\b.*\b[VU]ISA\b.*\bELECTR?ON\b/]);
  set("cards.eloCredito.0", result.formasPagamento.eloCredito, [/\bELO\b.*\bCREDITO\b/]);
  set("cards.eloCredito.1", result.formasPagamento.tefEloCredito, [/\bTE[FP]\b.*\bELO\b.*\bCREDITO\b/]);
  set("cards.mastercardCredito.0", result.formasPagamento.mastercard, [/\bMASTERCARD\b/, /\bHASTERCARD\b/, /\bMASTER\s*CARD\b/]);
  set("cards.mastercardCredito.1", result.formasPagamento.tefMastercard, [/\bTE[FP]\b.*\bMASTERCARD\b/, /\bTE[FP]\b.*\bHASTERCARD\b/]);
  set("cards.visaCredito.0", result.formasPagamento.tefVisa, [/\bTE[FP]\b.*\b[VU]ISA\b/]);
  set("cards.visaCredito.1", result.formasPagamento.visaCredito, [/\b[VU]ISA\b.*\bCREDITO\b/]);
  set("extras.abasteceAi", result.extras.abasteceAiCartao, [/\bABASTECE\b/, /\bCARTAO\b.*\bABASTECE\b/]);
  set("extras.pixStone", result.extras.pixStoneQrlix, [/\bQRLIX\b/, /\bQRLINX\b/, /\bPIX\b/]);
  set("extras.notaPrazo", result.extras.notaPrazo, [/\bNOTA\b.*\bPRAZO\b/, /\bPRAZO\b/]);
  set("extras.sangria", result.extras.sangriaDinheiro, [/\bSANGRIA\b/, /\bDINHEIRO\b/]);
  set("sobra", result.totais.diferenca, [/\bDIFERENCA\b/]);

  return evidence;
}

export function receiptResultToLegacyOcrResult(result: ReceiptOcrResult): LegacyOcrResult {
  const hasRecognizedSobra = result.totais.diferenca !== null;
  const expectedSobra = result.totais.diferenca;
  const recognizedSobra = result.totais.diferenca;
  const difference = hasRecognizedSobra ? 0 : null;

  const legacy: LegacyOcrResult = {
    vendaProdutos: formatMoney(result.vendaProdutos),
    cards: {
      eloDebito: [formatMoney(result.formasPagamento.eloDebito), formatMoney(result.formasPagamento.tefEloDebito)],
      maestroDebito: [formatMoney(result.formasPagamento.maestro), formatMoney(result.formasPagamento.tefMaestro)],
      visaDebito: [formatMoney(result.formasPagamento.visaElectron), formatMoney(result.formasPagamento.tefVisaElectron)],
      eloCredito: [formatMoney(result.formasPagamento.eloCredito), formatMoney(result.formasPagamento.tefEloCredito)],
      mastercardCredito: [formatMoney(result.formasPagamento.mastercard), formatMoney(result.formasPagamento.tefMastercard)],
      visaCredito: [formatMoney(result.formasPagamento.tefVisa), formatMoney(result.formasPagamento.visaCredito)],
    },
    extras: {
      abasteceAi: formatMoney(result.extras.abasteceAiCartao),
      pixStone: formatMoney(result.extras.pixStoneQrlix),
      notaPrazo: formatMoney(result.extras.notaPrazo),
      sangria: formatMoney(result.extras.sangriaDinheiro),
    },
    optionalExtras: {},
    sobra: formatMoney(result.totais.diferenca),
    diferencaSobra: formatMoney(result.totais.diferenca),
    ocrInconsistent: false,
    validation: {
      isValid: hasRecognizedSobra,
      expectedSobra,
      recognizedSobra,
      hasRecognizedSobra,
      difference,
    },
    source: result.source,
    warnings: result.warnings,
    evidence: buildEvidence(result),
  };

  return legacy;
}

export function countLegacyValues(result: LegacyOcrResult): number {
  return [
    result.vendaProdutos,
    result.sobra || result.diferencaSobra,
    ...Object.values(result.cards || {}).flat(),
    ...Object.values(result.extras || {}),
    ...Object.values(result.optionalExtras || {}),
  ].filter(Boolean).length;
}

export async function recognizeReceiptImage(
  image: File | Blob,
  options: RecognizeReceiptImageOptions = {},
): Promise<{
  receipt: ReceiptOcrResult;
  legacy: LegacyOcrResult;
  foundCount: number;
  usedFallback: boolean;
}> {
  const remoteClient = options.remoteClient || recognizeReceiptRemote;
  const localFallback = options.localFallback || recognizeReceiptLocalFallback;

  try {
    options.onProgress?.("Reconhecendo recibo...");
    const receipt = await remoteClient(image, {
      onUploadPrepared: (upload) => options.onRemoteUploadPrepared?.(upload.dataUrl),
    });
    const legacy = receiptResultToLegacyOcrResult(receipt);
    return {
      receipt,
      legacy,
      foundCount: countLegacyValues(legacy),
      usedFallback: false,
    };
  } catch (error) {
    const remoteError = error instanceof Error ? error : new Error("Falha desconhecida no OCR remoto");
    options.onRemoteError?.(remoteError);
    options.onProgress?.("OCR remoto indisponivel. Usando reconhecimento local.");
    const fallback = await localFallback(image, { onProgress: options.onProgress });
    const remoteWarning = `remote_ocr_failed:${remoteError.message}`;
    return {
      ...fallback,
      receipt: {
        ...fallback.receipt,
        warnings: [...(fallback.receipt.warnings || []), remoteWarning],
      },
      legacy: {
        ...fallback.legacy,
        warnings: [...(fallback.legacy.warnings || []), remoteWarning],
        remoteError: remoteError.message,
      },
      usedFallback: true,
    };
  }
}

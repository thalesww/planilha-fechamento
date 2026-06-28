import type { LegacyOcrResult, ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";
import { recognizeReceiptLocalFallback } from "./localOcrFallback.ts";
import { recognizeReceiptRemote } from "./remoteOcrClient.ts";

export type RecognizeReceiptImageOptions = {
  onProgress?: (message: string) => void;
  onRemoteError?: (error: Error) => void;
  remoteClient?: typeof recognizeReceiptRemote;
  localFallback?: typeof recognizeReceiptLocalFallback;
};

function formatMoney(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "";
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function receiptResultToLegacyOcrResult(result: ReceiptOcrResult): LegacyOcrResult {
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
    ocrInconsistent: result.warnings.some((warning) => warning.includes("divergente")),
    validation: {
      isValid: !result.warnings.some((warning) => warning.includes("divergente")),
      expectedSobra: result.totais.diferenca,
      recognizedSobra: result.totais.diferenca,
      hasRecognizedSobra: result.totais.diferenca !== null,
      difference: 0,
    },
    source: result.source,
    warnings: result.warnings,
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
    const receipt = await remoteClient(image);
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

import {
  compareOcrAttempts,
  countOcrValues,
  parseReceiptOcrText,
  validateOcrResult,
} from "../../receiptOcr.js";
import type { LegacyOcrResult, ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";

export type LocalOcrFallbackOptions = {
  onProgress?: (message: string) => void;
  recognizer?: any;
};

function fileToDataUrl(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function preprocessForOcr(file: File | Blob, { contrast = true } = {}): Promise<string> {
  const dataUrl = await fileToDataUrl(file);
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  const scale = 2;
  canvas.width = Math.max(1, Math.floor(image.width * scale));
  canvas.height = Math.max(1, Math.floor(image.height * scale));
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return dataUrl;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (contrast) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const adjusted = gray < 168 ? 0 : 255;
      data[i] = adjusted;
      data[i + 1] = adjusted;
      data[i + 2] = adjusted;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

function moneyNumber(value: string): number | null {
  if (!value) return null;
  const normalized = String(value).replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? Math.round((parsed + Number.EPSILON) * 100) / 100 : null;
}

function sum(values: Array<number | null>): number | null {
  const filled = values.filter((value): value is number => typeof value === "number");
  if (!filled.length) return null;
  return Math.round((filled.reduce((total, value) => total + value, 0) + Number.EPSILON) * 100) / 100;
}

export function legacyToReceiptOcrResult(
  legacy: LegacyOcrResult,
  rawText: string,
  warnings: string[] = [],
): ReceiptOcrResult {
  const formasPagamento = {
    eloDebito: moneyNumber(legacy.cards?.eloDebito?.[0]),
    tefEloDebito: moneyNumber(legacy.cards?.eloDebito?.[1]),
    maestro: moneyNumber(legacy.cards?.maestroDebito?.[0]),
    tefMaestro: moneyNumber(legacy.cards?.maestroDebito?.[1]),
    visaElectron: moneyNumber(legacy.cards?.visaDebito?.[0]),
    tefVisaElectron: moneyNumber(legacy.cards?.visaDebito?.[1]),
    eloCredito: moneyNumber(legacy.cards?.eloCredito?.[0]),
    tefEloCredito: moneyNumber(legacy.cards?.eloCredito?.[1]),
    mastercard: moneyNumber(legacy.cards?.mastercardCredito?.[0]),
    tefMastercard: moneyNumber(legacy.cards?.mastercardCredito?.[1]),
    tefVisa: moneyNumber(legacy.cards?.visaCredito?.[0]),
    visaCredito: moneyNumber(legacy.cards?.visaCredito?.[1]),
  };
  const extras = {
    abasteceAiCartao: moneyNumber(legacy.extras?.abasteceAi),
    pixStoneQrlix: moneyNumber(legacy.extras?.pixStone),
    notaPrazo: moneyNumber(legacy.extras?.notaPrazo),
    sangriaDinheiro: moneyNumber(legacy.extras?.sangria),
    trocoFinal: moneyNumber(legacy.extras?.trocoFinal),
  };
  const compactFormas = Object.fromEntries(
    Object.entries(formasPagamento).filter(([, value]) => typeof value === "number"),
  ) as ReceiptOcrResult["formasPagamento"];
  const compactExtras = Object.fromEntries(
    Object.entries(extras).filter(([, value]) => typeof value === "number"),
  ) as ReceiptOcrResult["extras"];
  const totalFormasPagamento = sum(Object.values(compactFormas));
  const totalOutrasSaidas = sum(Object.values(compactExtras));
  const totalUsado =
    totalFormasPagamento === null && totalOutrasSaidas === null
      ? null
      : Math.round(((totalFormasPagamento || 0) + (totalOutrasSaidas || 0) + Number.EPSILON) * 100) / 100;
  const vendaProdutos = moneyNumber(legacy.vendaProdutos);
  const diferenca =
    totalUsado === null || vendaProdutos === null
      ? null
      : Math.round((totalUsado - vendaProdutos + Number.EPSILON) * 100) / 100;

  return {
    ok: true,
    source: "local-fallback",
    vendaProdutos,
    formasPagamento: compactFormas,
    extras: compactExtras,
    ignorados: [],
    totais: {
      formasPagamento: totalFormasPagamento,
      outrasSaidas: totalOutrasSaidas,
      totalUsado,
      vendaProdutos,
      diferenca,
    },
    raw: {
      text: rawText,
      lines: rawText.split(/\r?\n/).filter(Boolean).map((text) => ({ text })),
    },
    confidence: 0,
    warnings,
  };
}

export async function recognizeReceiptLocalFallback(
  image: File | Blob,
  options: LocalOcrFallbackOptions = {},
): Promise<{ receipt: ReceiptOcrResult; legacy: LegacyOcrResult; foundCount: number }> {
  options.onProgress?.("Carregando reconhecimento local...");
  const tesseractModule = options.recognizer ? null : await import("tesseract.js");
  const recognize =
    options.recognizer || (tesseractModule as any)?.recognize || (tesseractModule as any)?.default?.recognize;
  if (!recognize) throw new Error("OCR local indisponivel");

  const attempts = [
    { label: "imagem original", input: image },
    { label: "imagem otimizada", input: () => preprocessForOcr(image, { contrast: false }) },
    { label: "imagem otimizada com contraste", input: () => preprocessForOcr(image, { contrast: true }) },
  ];
  let bestAttempt: { parsed: LegacyOcrResult; foundValues: number; text: string } | null = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    options.onProgress?.(`Lendo ${attempt.label} (${index + 1}/${attempts.length})...`);
    const input = typeof attempt.input === "function" ? await attempt.input() : attempt.input;
    const ocrRead = await recognize(input, "eng", { tessedit_pageseg_mode: "6" });
    const text = ocrRead?.data?.text || "";
    const parsed = validateOcrResult(parseReceiptOcrText(text));
    const foundValues = countOcrValues(parsed);
    const selected = compareOcrAttempts(bestAttempt, { parsed, foundValues, text } as any) as any;
    bestAttempt = selected?.text ? selected : { ...selected, text };
  }

  const legacy = bestAttempt?.parsed || validateOcrResult(parseReceiptOcrText(""));
  legacy.source = "local-fallback";
  legacy.warnings = [...(legacy.warnings || []), "OCR remoto indisponivel. Usando reconhecimento local."];
  const receipt = legacyToReceiptOcrResult(legacy, bestAttempt?.text || "", legacy.warnings);
  return { receipt, legacy, foundCount: bestAttempt?.foundValues || 0 };
}

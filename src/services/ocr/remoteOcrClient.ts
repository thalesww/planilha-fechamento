import type { ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";
import { isValidReceiptOcrResult } from "./validateReceiptOcrResult.ts";

export type RemoteOcrClientOptions = {
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
};

function envValue(key: string): string {
  return String((import.meta as any).env?.[key] || "").trim();
}

export async function recognizeReceiptRemote(
  image: File | Blob,
  options: RemoteOcrClientOptions = {},
): Promise<ReceiptOcrResult> {
  const apiUrl = (options.apiUrl || envValue("VITE_OCR_API_URL")).replace(/\/+$/, "");
  const apiKey = options.apiKey || envValue("VITE_OCR_API_KEY");
  const timeoutMs = options.timeoutMs || Number(envValue("VITE_OCR_TIMEOUT_MS")) || 20_000;

  if (!apiUrl || !apiKey) {
    throw new Error("OCR remoto nao configurado");
  }

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const form = new FormData();
    form.append("file", image, image instanceof File ? image.name : "receipt.jpg");

    const response = await fetch(`${apiUrl}/api/ocr/receipt`, {
      method: "POST",
      headers: {
        "x-ocr-api-key": apiKey,
      },
      body: form,
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`OCR remoto retornou HTTP ${response.status}`);
    }

    const data = await response.json();
    if (!isValidReceiptOcrResult(data) || data.ok !== true) {
      throw new Error("OCR remoto retornou JSON invalido");
    }

    return data;
  } finally {
    window.clearTimeout(timeout);
  }
}

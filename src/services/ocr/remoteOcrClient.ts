import type { ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";
import { isValidReceiptOcrResult } from "./validateReceiptOcrResult.ts";

export type RemoteOcrClientOptions = {
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  onUploadPrepared?: (upload: RemoteOcrUploadInfo) => void;
};

export type RemoteOcrUploadInfo = {
  blob: Blob;
  filename: string;
  dataUrl: string;
};

const MAX_REMOTE_IMAGE_SIDE = 1800;
const REMOTE_IMAGE_QUALITY = 0.86;
const REMOTE_IMAGE_COMPRESS_THRESHOLD = 1.5 * 1024 * 1024;
const DEFAULT_REMOTE_OCR_TIMEOUT_MS = 90_000;

function envValue(key: string): string {
  return String((import.meta as any).env?.[key] || "").trim();
}

function buildReceiptOcrUrl(apiUrl: string): string {
  const normalized = apiUrl.replace(/\/+$/, "");
  return normalized.endsWith("/api")
    ? `${normalized}/ocr/receipt`
    : `${normalized}/api/ocr/receipt`;
}

function loadImageFromBlob(image: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(image);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Nao foi possivel preparar imagem para OCR remoto"));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Nao foi possivel comprimir imagem para OCR remoto"));
    }, type, quality);
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel preparar preview do OCR remoto"));
    reader.readAsDataURL(blob);
  });
}

function shouldNormalizeRemoteImage(image: Blob): boolean {
  const type = image.type.toLowerCase();
  return image.size > REMOTE_IMAGE_COMPRESS_THRESHOLD || !["image/jpeg", "image/png", "image/webp"].includes(type);
}

async function normalizeImageForRemoteOcr(image: File | Blob): Promise<{ blob: Blob; filename: string }> {
  const originalName = image instanceof File && image.name ? image.name : "receipt.jpg";
  if (!shouldNormalizeRemoteImage(image)) {
    return { blob: image, filename: originalName };
  }

  const img = await loadImageFromBlob(image);
  const largestSide = Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height);
  const scale = largestSide > MAX_REMOTE_IMAGE_SIDE ? MAX_REMOTE_IMAGE_SIDE / largestSide : 1;
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return { blob: image, filename: originalName };
  }

  ctx.drawImage(img, 0, 0, width, height);
  const blob = await canvasToBlob(canvas, "image/jpeg", REMOTE_IMAGE_QUALITY);
  return { blob, filename: originalName.replace(/\.[^.]+$/, "") + ".jpg" };
}

export async function recognizeReceiptRemote(
  image: File | Blob,
  options: RemoteOcrClientOptions = {},
): Promise<ReceiptOcrResult> {
  const apiUrl = (options.apiUrl || envValue("VITE_OCR_API_URL")).replace(/\/+$/, "");
  const apiKey = options.apiKey || envValue("VITE_OCR_API_KEY");
  const timeoutMs = options.timeoutMs || Number(envValue("VITE_OCR_TIMEOUT_MS")) || DEFAULT_REMOTE_OCR_TIMEOUT_MS;

  if (!apiUrl || !apiKey) {
    throw new Error("OCR remoto nao configurado");
  }

  const controller = new AbortController();
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const upload = await normalizeImageForRemoteOcr(image);
    options.onUploadPrepared?.({
      ...upload,
      dataUrl: await blobToDataUrl(upload.blob),
    });
    const form = new FormData();
    form.append("file", upload.blob, upload.filename);

    const response = await fetch(buildReceiptOcrUrl(apiUrl), {
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
  } catch (error) {
    if (timedOut || controller.signal.aborted) {
      throw new Error(`tempo limite do OCR remoto (${Math.round(timeoutMs / 1000)}s)`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

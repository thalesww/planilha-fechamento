import type { ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";
import { isValidReceiptOcrResult } from "./validateReceiptOcrResult.ts";

export type RemoteOcrClientOptions = {
  apiUrl?: string;
  apiKey?: string;
  timeoutMs?: number;
  uploadTimeoutMs?: number;
  pollIntervalMs?: number;
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
const DEFAULT_REMOTE_OCR_TIMEOUT_MS = 180_000;
const DEFAULT_REMOTE_UPLOAD_TIMEOUT_MS = 20_000;
const DEFAULT_REMOTE_POLL_INTERVAL_MS = 1_500;
const DEFAULT_REMOTE_POLL_TIMEOUT_MS = 15_000;
const TERMINAL_JOB_STATUSES = new Set(["done", "failed", "timeout"]);

type RemoteOcrJobResponse = {
  jobId: string;
  status: "queued" | "processing" | "done" | "failed" | "timeout";
  position?: number | null;
  result?: ReceiptOcrResult | null;
  error?: string | null;
};

function envValue(key: string): string {
  return String((import.meta as any).env?.[key] || "").trim();
}

function buildReceiptOcrUrl(apiUrl: string): string {
  const normalized = apiUrl.replace(/\/+$/, "");
  return normalized.endsWith("/api")
    ? `${normalized}/ocr/receipt`
    : `${normalized}/api/ocr/receipt`;
}

function buildReceiptOcrJobUrl(apiUrl: string, jobId: string): string {
  const normalized = apiUrl.replace(/\/+$/, "");
  const encodedJobId = encodeURIComponent(jobId);
  return normalized.endsWith("/api")
    ? `${normalized}/ocr/jobs/${encodedJobId}`
    : `${normalized}/api/ocr/jobs/${encodedJobId}`;
}

function isRemoteOcrJobResponse(data: unknown): data is RemoteOcrJobResponse {
  if (!data || typeof data !== "object") return false;
  const record = data as Record<string, unknown>;
  return typeof record.jobId === "string" && typeof record.status === "string";
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
      const message = data && typeof data === "object"
        ? String((data as any)?.error?.message || (data as any)?.message || "")
        : "";
      throw new Error(message || `OCR remoto retornou HTTP ${response.status}`);
    }
    return data;
  } catch (error) {
    if ((error as Error)?.name === "AbortError") {
      throw new Error(`tempo limite do OCR remoto (${Math.round(timeoutMs / 1000)}s)`);
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
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
  const uploadTimeoutMs = options.uploadTimeoutMs || Number(envValue("VITE_OCR_UPLOAD_TIMEOUT_MS")) || DEFAULT_REMOTE_UPLOAD_TIMEOUT_MS;
  const pollIntervalMs = options.pollIntervalMs || Number(envValue("VITE_OCR_POLL_INTERVAL_MS")) || DEFAULT_REMOTE_POLL_INTERVAL_MS;

  if (!apiUrl || !apiKey) {
    throw new Error("OCR remoto nao configurado");
  }

  const upload = await normalizeImageForRemoteOcr(image);
  options.onUploadPrepared?.({
    ...upload,
    dataUrl: await blobToDataUrl(upload.blob),
  });
  const form = new FormData();
  form.append("file", upload.blob, upload.filename);

  const data = await fetchJsonWithTimeout(
    buildReceiptOcrUrl(apiUrl),
    {
      method: "POST",
      headers: {
        "x-ocr-api-key": apiKey,
      },
      body: form,
    },
    uploadTimeoutMs,
  );

  if (isValidReceiptOcrResult(data) && data.ok === true) {
    return data;
  }

  if (!isRemoteOcrJobResponse(data)) {
    throw new Error("OCR remoto retornou JSON invalido");
  }

  const startedAt = Date.now();
  let latestJob = data;
  while (!TERMINAL_JOB_STATUSES.has(latestJob.status)) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`tempo limite do OCR remoto (${Math.round(timeoutMs / 1000)}s)`);
    }

    await sleep(pollIntervalMs);
    latestJob = await fetchJsonWithTimeout(
      buildReceiptOcrJobUrl(apiUrl, data.jobId),
      {
        method: "GET",
        headers: {
          "x-ocr-api-key": apiKey,
        },
      },
      DEFAULT_REMOTE_POLL_TIMEOUT_MS,
    ) as RemoteOcrJobResponse;

    if (!isRemoteOcrJobResponse(latestJob)) {
      throw new Error("Status do OCR remoto retornou JSON invalido");
    }
  }

  if (latestJob.status !== "done") {
    throw new Error(latestJob.error || `OCR remoto terminou com status ${latestJob.status}`);
  }

  if (!isValidReceiptOcrResult(latestJob.result) || latestJob.result.ok !== true) {
    throw new Error("OCR remoto retornou resultado invalido");
  }

  return latestJob.result;
}

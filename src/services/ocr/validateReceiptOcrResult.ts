import type { ReceiptOcrResult } from "../../types/ReceiptOcrResult.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumberOrNull(value: unknown): boolean {
  return typeof value === "number" || value === null;
}

function hasOnlyOptionalNumbers(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return Object.values(value).every((entry) => typeof entry === "number" || entry === undefined);
}

export function isValidReceiptOcrResult(data: unknown): data is ReceiptOcrResult {
  if (!isRecord(data)) return false;
  if (typeof data.ok !== "boolean") return false;
  if (data.source !== "remote-paddleocr" && data.source !== "local-fallback") return false;
  if (!isNumberOrNull(data.vendaProdutos)) return false;
  if (!hasOnlyOptionalNumbers(data.formasPagamento)) return false;
  if (!hasOnlyOptionalNumbers(data.extras)) return false;
  if (!Array.isArray(data.ignorados)) return false;
  if (!Array.isArray(data.warnings)) return false;
  if (!isRecord(data.totais)) return false;
  if (!isNumberOrNull(data.totais.formasPagamento)) return false;
  if (!isNumberOrNull(data.totais.outrasSaidas)) return false;
  if (!isNumberOrNull(data.totais.totalUsado)) return false;
  if (!isNumberOrNull(data.totais.vendaProdutos)) return false;
  if (!isNumberOrNull(data.totais.diferenca)) return false;
  if (!isRecord(data.raw)) return false;
  if (typeof data.raw.text !== "string") return false;
  if (!Array.isArray(data.raw.lines)) return false;
  return typeof data.confidence === "number";
}

export type ReceiptOcrResult = {
  ok: boolean;
  source: "remote-paddleocr" | "local-fallback";
  vendaProdutos: number | null;
  formasPagamento: {
    eloDebito?: number;
    maestroDebito?: number;
    visaDebito?: number;
    eloCredito?: number;
    mastercardCredito?: number;
    visaCredito?: number;
    tefEloCredito?: number;
    tefEloDebito?: number;
    tefMaestro?: number;
    tefMastercard?: number;
    tefVisa?: number;
    tefVisaElectron?: number;
    mastercard?: number;
    maestro?: number;
    visaElectron?: number;
  };
  extras: {
    abasteceAiCartao?: number;
    pixStoneQrlix?: number;
    notaPrazo?: number;
    sangriaDinheiro?: number;
    trocoFinal?: number;
    vale?: number;
  };
  ignorados: Array<{
    label: string;
    valor: number;
    reason: string;
  }>;
  totais: {
    formasPagamento: number | null;
    outrasSaidas: number | null;
    totalUsado: number | null;
    vendaProdutos: number | null;
    diferenca: number | null;
  };
  raw: {
    text: string;
    lines: Array<{
      text: string;
      confidence?: number;
      bbox?: number[][];
    }>;
  };
  confidence: number;
  warnings: string[];
};

export type LegacyOcrResult = {
  vendaProdutos: string;
  cards: Record<string, string[]>;
  extras: Record<string, string>;
  optionalExtras: Record<string, string>;
  sobra: string;
  diferencaSobra: string;
  ocrInconsistent?: boolean;
  ocrTotals?: unknown;
  validation?: unknown;
  source?: ReceiptOcrResult["source"];
  warnings?: string[];
};

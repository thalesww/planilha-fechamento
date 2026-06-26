import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCopy,
  FileDown,
  QrCode,
  History,
  Plus,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Save,
  Trash2,
  X,
  WalletCards
} from "lucide-react";
import { applyOcrResultToClosing, countOcrValues, parseReceiptOcrText } from "./receiptOcr.js";
import Home from "./Home.jsx";
import Resumo from "./Resumo.jsx";
import Comprovantes from "./Comprovantes.jsx";
import { OcrLoadingOverlay, OcrReviewPanel } from "./OcrReview.jsx";
import "./styles.css";

const DB_NAME = "fechamento-caixa-db";
const DB_VERSION = 1;
const STORE = "closings";
const DRAFT_KEY = "fechamento-caixa-draft-v1";


const QR_PAYLOAD_VERSION = 1;

function normalizeMoneyString(value) {
  return formatNumber(parseMoney(value));
}

function compactClosingForQr(closing, totals = calculateTotals(closing)) {
  return {
    v: QR_PAYLOAD_VERSION,
    cards: Object.fromEntries(CARD_FIELDS.map((field) => [
      field.key,
      field.sources.map((_, index) => normalizeMoneyString(closing.cards?.[field.key]?.[index]))
    ])),
    extras: Object.fromEntries(EXTRA_FIELDS.map((field) => [field.key, normalizeMoneyString(closing.extras?.[field.key])])),
    optionalExtras: Object.fromEntries(
      OPTIONAL_EXTRA_FIELDS.map((field) => [field.key, normalizeMoneyString(closing.optionalExtras?.[field.key])])
    ),
    vendaProdutos: normalizeMoneyString(closing.vendaProdutos),
    sobra: normalizeMoneyString(totals.diferenca),
    date: closing.date || "",
    turno: closing.turno || "",
    operador: closing.operador || ""
  };
}

function encodeQrPayload(closing, totals) {
  return JSON.stringify(compactClosingForQr(closing, totals));
}

function validateQrPayloadText(text) {
  let parsed;
  try {
    parsed = JSON.parse(String(text || "").trim());
  } catch {
    throw new Error("Conteudo do QR Code nao e um JSON valido.");
  }

  const missing = ["cards", "extras", "optionalExtras", "vendaProdutos", "sobra", "date", "turno", "operador"].filter(
    (key) => !(key in parsed)
  );
  if (missing.length) throw new Error(`Payload incompleto. Campos ausentes: ${missing.join(", ")}.`);

  const blank = createBlankClosing();
  return normalizeClosing({
    ...blank,
    cards: Object.fromEntries(CARD_FIELDS.map((field) => [
      field.key,
      field.sources.map((_, index) => parsed.cards?.[field.key]?.[index] || "")
    ])),
    extras: Object.fromEntries(EXTRA_FIELDS.map((field) => [field.key, parsed.extras?.[field.key] || ""])),
    optionalExtras: Object.fromEntries(
      OPTIONAL_EXTRA_FIELDS.map((field) => [field.key, parsed.optionalExtras?.[field.key] || ""])
    ),
    vendaProdutos: parsed.vendaProdutos || "",
    date: parsed.date || blank.date,
    turno: parsed.turno || blank.turno,
    operador: parsed.operador || "",
    step: STEPS.findIndex((step) => step.id === "resumo"),
    status: "rascunho",
    observations: "Importado por QR Code. Revise antes de salvar."
  });
}

const STEPS = [
  { id: "notinha", label: "Cartões" },
  { id: "extras", label: "Combustível" },
  { id: "venda", label: "Venda Posto" },
  { id: "resumo", label: "Resumo" },
  { id: "comprovantes", label: "Comprovantes" }
];

const BLANK_COMPROVANTES = {
  terminals: [
    { total: "", photos: [] },
    { total: "", photos: [] },
    { total: "", photos: [] },
  ],
  totalCofre: "",
  coffrePhotos: [],
  sangriaPhotos: [],
};

const CARD_GROUPS = [
  {
    title: "Debito",
    fields: [
      {
        key: "eloDebito",
        label: "ELO Debito",
        sheetLabel: "Debito ELO",
        sources: ["ELO Debito", "TEF ELO Debito"]
      },
      {
        key: "maestroDebito",
        label: "Maestro Debito",
        sheetLabel: "Debito Maestro",
        sources: ["Maestro", "TEF Maestro"]
      },
      {
        key: "visaDebito",
        label: "Visa Debito",
        sheetLabel: "Debito Visa",
        sources: ["Visa Electron", "TEF Visa Electron"]
      }
    ]
  },
  {
    title: "Credito",
    fields: [
      {
        key: "eloCredito",
        label: "ELO Credito",
        sheetLabel: "Credito ELO",
        sources: ["ELO Credito", "2o valor ELO Credito"]
      },
      {
        key: "mastercardCredito",
        label: "Mastercard Credito",
        sheetLabel: "Credito Mastercard",
        sources: ["Mastercard", "TEF Mastercard"]
      },
      {
        key: "visaCredito",
        label: "Visa Credito",
        sheetLabel: "Credito Visa",
        sources: ["TEF Visa", "Visa Credito"]
      }
    ]
  }
];

const CARD_FIELDS = CARD_GROUPS.flatMap((group) => group.fields.map((field) => ({ ...field, groupTitle: group.title })));

const EXTRA_FIELDS = [
  { key: "abasteceAi", label: "Abastece Ai Cartao" },
  { key: "pixStone", label: "Pix Stone / QRLIX" },
  { key: "notaPrazo", label: "Nota a prazo" },
  { key: "sangria", label: "Sangria dinheiro" }
];

const OPTIONAL_EXTRA_FIELDS = [
  { key: "outroDebito", label: "Outro debito" },
  { key: "outroCredito", label: "Outro credito" },
  { key: "pixCnpj", label: "PIX CNPJ" },
  { key: "depositosConta", label: "Depositos em conta" },
  { key: "proFrotas", label: "Pro Frotas" },
  { key: "ctf", label: "CTF" },
  { key: "chequesVista", label: "Cheques a vista" },
  { key: "valesMotorista", label: "Vales a motorista" },
  { key: "valesFuncionarios", label: "Vales funcionarios" },
  { key: "especie", label: "Especie" },
  { key: "moedas", label: "Moedas" },
  { key: "cedulasNaoAceitas", label: "Cedulas nao aceitas pelo cofre" }
];

const SUMMARY_ORDER = [
  { type: "card", key: "eloDebito", label: "ELO Debito" },
  { type: "card", key: "maestroDebito", label: "Maestro Debito" },
  { type: "card", key: "visaDebito", label: "Visa Debito" },
  { type: "card", key: "eloCredito", label: "ELO Credito" },
  { type: "card", key: "mastercardCredito", label: "Mastercard Credito" },
  { type: "card", key: "visaCredito", label: "Visa Credito" },
  { type: "extra", key: "abasteceAi", label: "Abastece Ai" },
  { type: "extra", key: "pixStone", label: "PIX Stone" },
  { type: "extra", key: "notaPrazo", label: "Nota a prazo" },
  { type: "extra", key: "sangria", label: "Sangria" }
];

const SAMPLE_VALUES = {
  vendaProdutos: "13.284,34",
  cards: {
    eloDebito: ["20,00", "270,00"],
    maestroDebito: ["48,00", "1.725,75"],
    visaDebito: ["2.721,46", ""],
    eloCredito: ["150,00", ""],
    mastercardCredito: ["207,70", "2.277,21"],
    visaCredito: ["2.503,47", "219,85"]
  },
  extras: {
    abasteceAi: "632,71",
    pixStone: "813,20",
    notaPrazo: "72,58",
    sangria: "1.595,00"
  }
};

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function createBlankClosing() {
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: createId(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    date: today,
    turno: "1",
    operador: "",
    step: 0,
    cardIndex: 0,
    extraIndex: 0,
    cards: Object.fromEntries(
      CARD_FIELDS.map((field) => [field.key, field.sources.map(() => "")])
    ),
    extras: Object.fromEntries(EXTRA_FIELDS.map((field) => [field.key, ""])),
    optionalExtras: Object.fromEntries(OPTIONAL_EXTRA_FIELDS.map((field) => [field.key, ""])),
    vendaProdutos: "",
    observations: "",
    attachments: [],
    status: "rascunho",
    savedAt: ""
  };
}

function normalizeClosing(raw) {
  const blank = createBlankClosing();
  const cards = Object.fromEntries(
    CARD_FIELDS.map((field) => {
      const previous = raw?.cards?.[field.key];
      if (Array.isArray(previous)) {
        return [field.key, field.sources.map((_, index) => previous[index] || "")];
      }
      return [field.key, blank.cards[field.key]];
    })
  );

  return {
    ...blank,
    ...raw,
    cards,
    extras: { ...blank.extras, ...(raw?.extras || {}) },
    optionalExtras: { ...blank.optionalExtras, ...(raw?.optionalExtras || {}) },
    attachments: Array.isArray(raw?.attachments) ? raw.attachments : [],
    step: Number.isInteger(raw?.step) ? Math.min(Math.max(raw.step, 0), STEPS.length - 1) : 0,
    cardIndex: Number.isInteger(raw?.cardIndex) ? Math.min(Math.max(raw.cardIndex, 0), CARD_FIELDS.length - 1) : 0,
    extraIndex: Number.isInteger(raw?.extraIndex) ? Math.min(Math.max(raw.extraIndex, 0), EXTRA_FIELDS.length - 1) : 0
  };
}

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(mode, callback) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const store = transaction.objectStore(STORE);
    const result = callback(store);
    transaction.oncomplete = () => {
      db.close();
      resolve(result?.result ?? result);
    };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

function saveClosing(closing) {
  return withStore("readwrite", (store) => store.put(closing));
}

function deleteClosing(id) {
  return withStore("readwrite", (store) => store.delete(id));
}

function loadClosings() {
  return withStore("readonly", (store) => store.getAll()).then((rows) =>
    rows.map(normalizeClosing).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""))
  );
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

function formatNumber(value) {
  return (value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value || 0);
}

function formatDate(value) {
  if (!value) return "";
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function toMoneyInput(value) {
  const cents = String(value).replace(/\D/g, "");
  if (!cents) return "";
  return formatNumber(Number(cents) / 100);
}

function getCardFieldTotal(closing, key) {
  return (closing.cards[key] || []).reduce((sum, value) => sum + parseMoney(value), 0);
}

function getExtraTotal(closing, key) {
  return parseMoney(closing.extras[key]);
}

function getOptionalExtraTotal(closing, key) {
  return parseMoney(closing.optionalExtras?.[key]);
}

function getSummaryItemValue(closing, item) {
  if (item.type === "card") return getCardFieldTotal(closing, item.key);
  return getExtraTotal(closing, item.key);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getReceiptCropBounds(imageData, width, height) {
  const data = imageData.data;
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = data[index];
      const g = data[index + 1];
      const b = data[index + 2];
      const brightness = (r + g + b) / 3;
      const colorSpread = Math.max(r, g, b) - Math.min(r, g, b);
      const looksLikePaperOrInk = brightness > 105 && colorSpread < 85;

      if (looksLikePaperOrInk) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (maxX <= minX || maxY <= minY) return { x: 0, y: 0, width, height };

  const marginX = Math.floor(width * 0.03);
  const marginY = Math.floor(height * 0.03);
  const x = Math.max(0, minX - marginX);
  const y = Math.max(0, minY - marginY);
  const right = Math.min(width, maxX + marginX);
  const bottom = Math.min(height, maxY + marginY);

  return {
    x,
    y,
    width: right - x,
    height: bottom - y
  };
}

async function preprocessForOcr(file, { crop = true, contrast = true } = {}) {
  const dataUrl = await fileToDataUrl(file);
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });

  let cropBounds = { x: 0, y: 0, width: image.width, height: image.height };
  if (crop) {
    const probeCanvas = document.createElement("canvas");
    probeCanvas.width = image.width;
    probeCanvas.height = image.height;
    const probeCtx = probeCanvas.getContext("2d", { willReadFrequently: true });
    probeCtx.drawImage(image, 0, 0);
    cropBounds = getReceiptCropBounds(probeCtx.getImageData(0, 0, image.width, image.height), image.width, image.height);
  }

  const scale = Math.min(2.6, Math.max(1.6, 1900 / cropBounds.width));
  const canvas = document.createElement("canvas");
  canvas.width = Math.floor(cropBounds.width * scale);
  canvas.height = Math.floor(cropBounds.height * scale);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(
    image,
    cropBounds.x,
    cropBounds.y,
    cropBounds.width,
    cropBounds.height,
    0,
    0,
    canvas.width,
    canvas.height
  );

  if (contrast) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      const boosted = gray < 155 ? Math.max(0, gray * 0.5) : Math.min(255, gray * 1.25);
      data[i] = boosted;
      data[i + 1] = boosted;
      data[i + 2] = boosted;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  return canvas.toDataURL("image/png");
}

function calculateTotals(closing) {
  const cardTotal = CARD_FIELDS.reduce(
    (sum, field) => sum + getCardFieldTotal(closing, field.key),
    0
  );
  const extrasTotal = EXTRA_FIELDS.reduce((sum, field) => sum + getExtraTotal(closing, field.key), 0);
  const optionalExtrasTotal = OPTIONAL_EXTRA_FIELDS.reduce((sum, field) => sum + getOptionalExtraTotal(closing, field.key), 0);
  const venda = parseMoney(closing.vendaProdutos);
  const entradas = cardTotal + extrasTotal + optionalExtrasTotal;

  return {
    cardTotal,
    extrasTotal,
    optionalExtrasTotal,
    entradas,
    venda,
    diferenca: entradas - venda
  };
}

function buildSummary(closing, totals) {
  const lines = [
    "FECHAMENTO DE CAIXA",
    `Data: ${formatDate(closing.date)} | Turno: ${closing.turno || "-"}`,
    `Operador: ${closing.operador || "-"}`,
    "",
    "VALORES PARA COPIAR NA PLANILHA",
    "",
    ...SUMMARY_ORDER.map((item) => `${item.label}: ${formatCurrency(getSummaryItemValue(closing, item))}`),
    "",
    "EXTRAS OPCIONAIS PREENCHIDOS",
    ...OPTIONAL_EXTRA_FIELDS.filter((field) => getOptionalExtraTotal(closing, field.key) > 0).map(
      (field) => `${field.label}: ${formatCurrency(getOptionalExtraTotal(closing, field.key))}`
    ),
    "",
    `Total das entradas: ${formatCurrency(totals.entradas)}`,
    `Venda de produtos: ${formatCurrency(totals.venda)}`,
    `Troco final / diferenca: ${formatCurrency(totals.diferenca)}`,
    "",
    "CONFERENCIA DA NOTINHA",
    ...CARD_FIELDS.flatMap((field) => [
        "",
        field.label,
        ...field.sources.map((source, index) => `- ${source}: ${formatCurrency(parseMoney(closing.cards[field.key][index]))}`)
      ]),
    "",
    "OBSERVACOES",
    closing.observations || "-"
  ];

  return lines.join("\n");
}

function App() {
  const [closing, setClosing] = useState(() => {
    try {
      const savedDraft = localStorage.getItem(DRAFT_KEY);
      return savedDraft ? normalizeClosing(JSON.parse(savedDraft)) : createBlankClosing();
    } catch {
      return createBlankClosing();
    }
  });
  const [history, setHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [currentView, setCurrentView] = useState("home");
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrScannerOpen, setQrScannerOpen] = useState(false);
  // OCR state
  const [ocrStatus, setOcrStatus] = useState("idle"); // idle | running | done | error
  const [ocrProgress, setOcrProgress] = useState("");
  const [ocrResult, setOcrResult] = useState(null); // raw parsed result before confirmation
  const [ocrFoundCount, setOcrFoundCount] = useState(0);
  const TOTAL_OCR_FIELDS = 13; // 6 card pairs * 2 + 4 extras
  // Comprovantes state
  const [comprovantes, setComprovantes] = useState(BLANK_COMPROVANTES);

  const totals = useMemo(() => calculateTotals(closing), [closing]);
  const summary = useMemo(() => buildSummary(closing, totals), [closing, totals]);
  const qrPayload = useMemo(() => encodeQrPayload(closing, totals), [closing, totals]);
  const currentStep = STEPS[closing.step];

  const lancamentos = useMemo(() => {
    if (currentStep.id !== "resumo") return [];
    const list = [];
    CARD_FIELDS.forEach(field => {
      const total = getCardFieldTotal(closing, field.key);
      if (total > 0) list.push({ label: field.sheetLabel || field.label, value: formatCurrency(total) });
    });
    EXTRA_FIELDS.forEach(field => {
      const total = getExtraTotal(closing, field.key);
      if (total > 0) list.push({ label: field.label, value: formatCurrency(total) });
    });
    OPTIONAL_EXTRA_FIELDS.forEach(field => {
      const total = getOptionalExtraTotal(closing, field.key);
      if (total > 0) list.push({ label: field.label, value: formatCurrency(total) });
    });
    return list;
  }, [closing, currentStep.id]);

  const refreshHistory = useCallback(() => {
    loadClosings()
      .then(setHistory)
      .catch(() => setMessage("Nao foi possivel carregar o historico local."));
  }, []);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  useEffect(() => {
    try {
      const draft = {
        ...closing,
        attachments: closing.attachments.map((attachment) => ({
          id: attachment.id,
          name: attachment.name,
          size: attachment.size,
          addedAt: attachment.addedAt
        }))
      };
      localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      setMessage("Rascunho mantido na tela, mas o navegador nao conseguiu salvar localmente.");
    }
  }, [closing]);

  const updateClosing = useCallback((patch) => {
    setClosing((current) => ({ ...current, ...patch, updatedAt: new Date().toISOString() }));
  }, []);

  const goToStep = useCallback((step) => {
    setClosing((current) => ({ ...current, step: Math.min(Math.max(step, 0), STEPS.length - 1) }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep.id === "notinha" && closing.cardIndex < CARD_FIELDS.length - 1) {
      setClosing((current) => ({ ...current, cardIndex: current.cardIndex + 1, updatedAt: new Date().toISOString() }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (currentStep.id === "extras" && closing.extraIndex < EXTRA_FIELDS.length - 1) {
      setClosing((current) => ({ ...current, extraIndex: current.extraIndex + 1, updatedAt: new Date().toISOString() }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    goToStep(closing.step + 1);
  }, [closing.cardIndex, closing.extraIndex, closing.step, currentStep.id, goToStep]);

  const previousStep = useCallback(() => {
    if (currentStep.id === "notinha" && closing.cardIndex > 0) {
      setClosing((current) => ({ ...current, cardIndex: current.cardIndex - 1, updatedAt: new Date().toISOString() }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (currentStep.id === "extras" && closing.extraIndex > 0) {
      setClosing((current) => ({ ...current, extraIndex: current.extraIndex - 1, updatedAt: new Date().toISOString() }));
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (closing.step === 0 && closing.cardIndex === 0) {
      setCurrentView("home");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    goToStep(closing.step - 1);
  }, [closing.cardIndex, closing.extraIndex, closing.step, currentStep.id, goToStep]);

  const updateCardValue = useCallback((fieldKey, index, value) => {
    setClosing((current) => {
      const nextValues = [...current.cards[fieldKey]];
      nextValues[index] = toMoneyInput(value);
      return {
        ...current,
        cards: { ...current.cards, [fieldKey]: nextValues },
        updatedAt: new Date().toISOString()
      };
    });
  }, []);

  const updateExtraValue = useCallback((fieldKey, value) => {
    setClosing((current) => ({
      ...current,
      extras: { ...current.extras, [fieldKey]: toMoneyInput(value) },
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const updateOptionalExtraValue = useCallback((fieldKey, value) => {
    setClosing((current) => ({
      ...current,
      optionalExtras: { ...current.optionalExtras, [fieldKey]: toMoneyInput(value) },
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const persist = useCallback(
    async (status = "salvo") => {
      const payload = {
        ...closing,
        status,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await saveClosing(payload);
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...payload, attachments: [] }));
      setClosing(payload);
      refreshHistory();
      setMessage(status === "concluido" ? "Fechamento concluido e salvo offline." : "Fechamento salvo offline.");
    },
    [closing, refreshHistory]
  );

  const fillExample = useCallback(() => {
    setClosing((current) => ({
      ...current,
      cards: SAMPLE_VALUES.cards,
      extras: SAMPLE_VALUES.extras,
      vendaProdutos: SAMPLE_VALUES.vendaProdutos,
      updatedAt: new Date().toISOString()
    }));
    setMessage("Exemplo da notinha aplicado para conferencia.");
  }, []);

  const attachAndScan = useCallback(async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;

    // Encode files for preview
    const encoded = await Promise.all(
      selected.map((file) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () =>
            resolve({
              id: createId(),
              name: file.name,
              size: file.size,
              dataUrl: reader.result,
              addedAt: new Date().toISOString()
            });
          reader.onerror = reject;
          reader.readAsDataURL(file);
        })
      )
    );

    setClosing((current) => ({
      ...current,
      attachments: [...current.attachments, ...encoded],
      updatedAt: new Date().toISOString()
    }));

    // Auto-start OCR scan
    setOcrStatus("running");
    setOcrProgress("Carregando motor OCR…");
    setOcrResult(null);

    try {
      const tesseractModule = await import("tesseract.js");
      const recognize = tesseractModule.recognize || tesseractModule.default?.recognize;
      if (!recognize) throw new Error("OCR indisponivel");

      const ocrOptions = { tessedit_pageseg_mode: "6" };
      const attempts = [
        { label: "imagem original", input: selected[0] },
        {
          label: "notinha recortada",
          input: () => preprocessForOcr(selected[0], { crop: true, contrast: false })
        },
        {
          label: "notinha recortada com contraste",
          input: () => preprocessForOcr(selected[0], { crop: true, contrast: true })
        }
      ];

      let parsed = null;
      let foundValues = 0;
      for (let index = 0; index < attempts.length; index += 1) {
        const attempt = attempts[index];
        setOcrProgress(`Lendo ${attempt.label} (${index + 1}/${attempts.length})…`);
        const input = typeof attempt.input === "function" ? await attempt.input() : attempt.input;
        const ocrRead = await recognize(input, "eng", ocrOptions);
        const attemptParsed = parseReceiptOcrText(ocrRead.data.text);
        const attemptFoundValues = countOcrValues(attemptParsed);

        if (attemptFoundValues > foundValues) {
          parsed = attemptParsed;
          foundValues = attemptFoundValues;
        }
      }

      setOcrResult(parsed);
      setOcrFoundCount(foundValues);
      setOcrStatus("done");
    } catch {
      setOcrStatus("error");
      setMessage("Nao consegui ler a notinha por OCR. A foto foi anexada. Preencha manualmente.");
    }
  }, []);

  const attachFiles = useCallback(async (files) => {
    const selected = Array.from(files || []);
    if (!selected.length) return;
    const encoded = await Promise.all(
      selected.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                id: createId(),
                name: file.name,
                size: file.size,
                dataUrl: reader.result,
                addedAt: new Date().toISOString()
              });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          })
      )
    );
    setClosing((current) => ({
      ...current,
      attachments: [...current.attachments, ...encoded],
      updatedAt: new Date().toISOString()
    }));
  }, []);

  const confirmOcr = useCallback(() => {
    if (!ocrResult) return;
    setClosing((current) => ({
      ...applyOcrResultToClosing(current, ocrResult),
      updatedAt: new Date().toISOString()
    }));
    setOcrStatus("idle");
    setOcrResult(null);
    setMessage("Valores do OCR aplicados. Confira campo a campo.");
  }, [ocrResult]);

  const discardOcr = useCallback(() => {
    setOcrStatus("idle");
    setOcrResult(null);
    setMessage("OCR descartado. Preencha os valores manualmente.");
  }, []);

  const updateComprovantes = useCallback((patch) => {
    setComprovantes((prev) => ({ ...prev, ...patch }));
  }, []);

  const removeAttachment = useCallback((id) => {
    setClosing((current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== id)
    }));
  }, []);

  const loadFromHistory = useCallback((item) => {
    setClosing(normalizeClosing(item));
    setMessage("Fechamento aberto para revisao.");
    setCurrentView("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const duplicateClosing = useCallback((item) => {
    setClosing({
      ...normalizeClosing(item),
      id: createId(),
      status: "rascunho",
      savedAt: "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    setMessage("Copia criada. Revise os valores antes de salvar.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const copySummary = useCallback(async () => {
    await navigator.clipboard.writeText(summary);
    setMessage("Resumo copiado para preencher a planilha.");
  }, [summary]);

  const exportCsv = useCallback(() => {
    const rows = [
      ["Campo", "Valor"],
      ["Data", formatDate(closing.date)],
      ["Turno", closing.turno],
      ...CARD_GROUPS.flatMap((group) =>
        group.fields.map((field) => [field.sheetLabel, formatNumber(getCardFieldTotal(closing, field.key))])
      ),
      ...EXTRA_FIELDS.map((field) => [field.label, formatNumber(getExtraTotal(closing, field.key))]),
      ...OPTIONAL_EXTRA_FIELDS.filter((field) => getOptionalExtraTotal(closing, field.key) > 0).map((field) => [
        field.label,
        formatNumber(getOptionalExtraTotal(closing, field.key))
      ]),
      ["Total das entradas", formatNumber(totals.entradas)],
      ["Venda de produtos", formatNumber(totals.venda)],
      ["Troco final / diferenca", formatNumber(totals.diferenca)]
    ];
    const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `fechamento-${closing.date || "caixa"}-turno-${closing.turno || "x"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [closing, totals]);

  const applyQrPayload = useCallback((text) => {
    try {
      const importedClosing = validateQrPayloadText(text);
      setClosing(importedClosing);
      setCurrentView("form");
      setQrScannerOpen(false);
      setMessage("Fechamento importado por QR Code. Revise e edite antes de salvar.");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessage(error.message || "Nao foi possivel importar o QR Code.");
    }
  }, []);

  const resetForm = useCallback(() => {
    setClosing(createBlankClosing());
    setComprovantes(BLANK_COMPROVANTES);
    setOcrStatus("idle");
    setOcrResult(null);
    localStorage.removeItem(DRAFT_KEY);
    setMessage("Novo fechamento iniciado.");
    setCurrentView("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <>
      {ocrStatus === "running" && <OcrLoadingOverlay progress={ocrProgress} />}
      {qrModalOpen && <QrSendModal payload={qrPayload} onClose={() => setQrModalOpen(false)} />}
      {qrScannerOpen && <QrScanModal onApply={applyQrPayload} onClose={() => setQrScannerOpen(false)} />}
      {currentView === "home" ? (
        <Home 
          closing={closing} 
          updateClosing={updateClosing} 
          history={history} 
          onNew={resetForm} 
          onLoadHistory={loadFromHistory}
          onOpenQrScanner={() => setQrScannerOpen(true)}
          calculateTotals={calculateTotals}
          formatCurrency={formatCurrency}
          formatDate={formatDate}
        />
      ) : currentStep.id === "resumo" ? (
        <Resumo
          lancamentos={lancamentos}
          totals={totals}
          onCopy={copySummary}
          onCsv={exportCsv}
          onPrint={() => window.print()}
          onSave={() => goToStep(STEPS.findIndex(s => s.id === "comprovantes"))}
          onBack={previousStep}
          formatCurrency={formatCurrency}
        />
      ) : currentStep.id === "comprovantes" ? (
        <Comprovantes
          closing={closing}
          lancamentos={lancamentos}
          totals={totals}
          comprovantes={comprovantes}
          onUpdateComp={updateComprovantes}
          onSave={async () => { await persist("concluido"); setCurrentView("home"); setComprovantes(BLANK_COMPROVANTES); }}
          onBack={previousStep}
          formatCurrencyProp={formatCurrency}
        />
      ) : (
        <main className="app-shell">
      <header className="top-app-bar">
        <div className="hero-top">
          <ReceiptText size={24} />
          <div>
            <span>Postos Vila</span>
            <h1>Fechamento de Turno</h1>
          </div>
          <button type="button" onClick={resetForm} aria-label="Novo fechamento">
            <Plus size={20} />
          </button>
        </div>

        <section className="stepper" aria-label="Etapas do fechamento">
          {STEPS.map((step, index) => (
            <button
              key={step.id}
              type="button"
              className={index === closing.step ? "active" : index < closing.step ? "done" : ""}
              onClick={() => goToStep(index)}
            >
              <span />
              {step.label}
            </button>
          ))}
        </section>

        <div className="meta-row">
          <label>
            <span>Data</span>
            <input type="date" value={closing.date} onChange={(event) => updateClosing({ date: event.target.value })} />
          </label>
          <label>
            <span>Turno</span>
            <input
              type="number"
              min="1"
              value={closing.turno}
              onChange={(event) => updateClosing({ turno: event.target.value })}
            />
          </label>
        </div>
      </header>

      {message ? <div className="toast">{message}</div> : null}

      {currentStep.id === "notinha" ? (
        <NotinhaStep
          closing={closing}
          totals={totals}
          onCardValue={updateCardValue}
          onAttach={attachAndScan}
          onRemoveAttachment={removeAttachment}
          onFillExample={fillExample}
          ocrStatus={ocrStatus}
          ocrResult={ocrResult}
          ocrFoundCount={ocrFoundCount}
          TOTAL_OCR_FIELDS={TOTAL_OCR_FIELDS}
          onConfirmOcr={confirmOcr}
          onDiscardOcr={discardOcr}
          onOpenQrModal={() => setQrModalOpen(true)}
        />
      ) : null}

      {currentStep.id === "extras" ? (
        <ExtrasStep
          closing={closing}
          totals={totals}
          onExtraValue={updateExtraValue}
          onOptionalExtraValue={updateOptionalExtraValue}
        />
      ) : null}

      {currentStep.id === "venda" ? (
        <VendaStep
          closing={closing}
          totals={totals}
          onVenda={(value) => updateClosing({ vendaProdutos: toMoneyInput(value) })}
          onObservations={(observations) => updateClosing({ observations })}
        />
      ) : null}

      <nav className="bottom-nav" aria-label="Navegacao do fechamento">
        <button type="button" onClick={previousStep}>
          <ArrowLeft size={18} />
          Voltar
        </button>
        <div>
          <span>{currentStep.id === "venda" || currentStep.id === "resumo" ? "Troco final" : "Total Cartoes"}</span>
          <strong className={totals.diferenca < 0 ? "negative-text" : totals.diferenca > 0 ? "positive-text" : ""}>
            {currentStep.id === "venda" || currentStep.id === "resumo"
              ? formatCurrency(totals.diferenca)
              : formatCurrency(totals.cardTotal + totals.extrasTotal)}
          </strong>
        </div>
        {closing.step < STEPS.length - 1 ? (
          <button className="primary" type="button" onClick={nextStep}>
            Proximo
            <ArrowRight size={18} />
          </button>
        ) : (
          <button className="primary" type="button" onClick={() => persist("concluido")}>
            <Save size={18} />
            Salvar
          </button>
        )}
      </nav>
    </main>
      )}
    </>
  );
}

function NotinhaStep({
  closing,
  totals,
  onCardValue,
  onAttach,
  onRemoveAttachment,
  onFillExample,
  ocrStatus,
  ocrResult,
  ocrFoundCount,
  TOTAL_OCR_FIELDS,
  onConfirmOcr,
  onDiscardOcr,
  onOpenQrModal
}) {
  const activeField = CARD_FIELDS[closing.cardIndex];

  return (
    <section className="flow-section">
      <section className="ocr-card">
        <div className="section-heading split">
          <div>
            <Camera size={20} />
            <h2>Captura OCR</h2>
          </div>
          <span className="beta-chip">Processamento Beta</span>
        </div>
        <button className="qr-action" type="button" onClick={onOpenQrModal}>
          <QrCode size={18} />
          Enviar para celular
        </button>
        <div className="capture-grid">
          <label className="attach-compact">
            <Camera size={18} />
            Tirar Foto
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              onChange={(event) => {
                onAttach(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
          <label className="attach-compact">
            <FileDown size={18} />
            Galeria
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(event) => {
                onAttach(event.target.files);
                event.target.value = "";
              }}
            />
          </label>
        </div>

        {closing.attachments.length ? (
          <div className="thumbs">
            {closing.attachments.map((attachment) => (
              <figure key={attachment.id}>
                <img src={attachment.dataUrl} alt={attachment.name} />
                <figcaption>{attachment.name}</figcaption>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)} aria-label="Remover anexo">
                  <Trash2 size={15} />
                </button>
              </figure>
            ))}
          </div>
        ) : null}

        {ocrStatus === "done" && ocrResult && (
          <div style={{ marginTop: "16px" }}>
            <OcrReviewPanel
              ocrResult={ocrResult}
              foundCount={ocrFoundCount}
              totalFields={TOTAL_OCR_FIELDS}
              onConfirm={onConfirmOcr}
              onDiscard={onDiscardOcr}
            />
          </div>
        )}
      </section>

      <div className="focus-progress">
        <span>{activeField.groupTitle}</span>
        <strong>
          Campo {closing.cardIndex + 1} de {CARD_FIELDS.length}
        </strong>
      </div>

      {CARD_GROUPS.map((group) => (
        <CardGroupSection
          key={group.title}
          group={group}
          activeKey={activeField.key}
          cards={closing.cards}
          onCardValue={onCardValue}
        />
      ))}

      <button className="example-button" type="button" onClick={onFillExample}>
        <CheckCircle2 size={18} />
        Usar exemplo
      </button>
    </section>
  );
}

function CardGroupSection({ group, activeKey, cards, onCardValue }) {
  return (
    <section className="payment-section">
      <h3>{group.title}</h3>
      <div className="payment-list">
        {group.fields.map((field) => (
          <FinalField
            key={field.key}
            field={field}
            values={cards[field.key]}
            total={getCardFieldTotal({ cards }, field.key)}
            active={field.key === activeKey}
            onChange={(index, value) => onCardValue(field.key, index, value)}
          />
        ))}
      </div>
    </section>
  );
}

function ExtrasStep({ closing, totals, onExtraValue, onOptionalExtraValue }) {
  const activeExtra = EXTRA_FIELDS[closing.extraIndex];

  return (
    <section className="flow-section">
      <div className="instruction">
        <Plus size={24} />
        <p>Agora preencha os recebimentos fora das bandeiras. Eles entram na soma final.</p>
      </div>

      <div className="focus-progress">
        <span>Extras principais</span>
        <strong>
          Campo {closing.extraIndex + 1} de {EXTRA_FIELDS.length}
        </strong>
      </div>

      <div className="focused-extra">
        <MoneyInput
          label={activeExtra.label}
          value={closing.extras[activeExtra.key]}
          onChange={(value) => onExtraValue(activeExtra.key, value)}
        />
      </div>

      <TotalCard label="Total dos extras" value={totals.extrasTotal} />

      <details className="optional-panel">
        <summary>Outros campos opcionais da planilha</summary>
        <div className="extras-list">
          {OPTIONAL_EXTRA_FIELDS.map((field) => (
            <MoneyInput
              key={field.key}
              label={field.label}
              value={closing.optionalExtras[field.key]}
              onChange={(value) => onOptionalExtraValue(field.key, value)}
            />
          ))}
        </div>
        <TotalCard label="Total opcional preenchido" value={totals.optionalExtrasTotal} />
      </details>
    </section>
  );
}

function VendaStep({ closing, totals, onVenda, onObservations }) {
  return (
    <section className="flow-section">
      <div className="instruction">
        <ReceiptText size={24} />
        <p>Informe a venda total do posto do relatório. O troco final é a soma de tudo menos essa venda.</p>
      </div>
      <MoneyInput label="Venda do Posto" value={closing.vendaProdutos} onChange={onVenda} autoFocus />
      <div className="calculation-card">
        <div>
          <span>Total das entradas</span>
          <strong>{formatCurrency(totals.entradas)}</strong>
        </div>
        <div>
          <span>Venda do Posto</span>
          <strong>{formatCurrency(totals.venda)}</strong>
        </div>
        <div>
          <span>Troco final</span>
          <strong className={totals.diferenca < 0 ? "negative-text" : totals.diferenca > 0 ? "positive-text" : ""}>
            {formatCurrency(totals.diferenca)}
          </strong>
        </div>
      </div>
      <label className="notes-field">
        <span>Observacoes</span>
        <textarea
          value={closing.observations}
          rows="5"
          placeholder="Ex.: valor baixado em dinheiro e pago na maquininha, vales, divergencias ou comprovantes."
          onChange={(event) => onObservations(event.target.value)}
        />
      </label>
    </section>
  );
}

function ResumoStep({ closing, history, totals, summary, onCopy, onCsv, onPrint, onSave, onLoadHistory, onDuplicate, onDelete }) {
  return (
    <section className="flow-section">
      <div className="section-heading">
        <CheckCircle2 size={20} />
        <div>
          <h2>Resumo para passar na planilha</h2>
          <span>Copie os totais finais, nao os valores separados da notinha.</span>
        </div>
      </div>

      <div className="copy-list">
        {SUMMARY_ORDER.map((item, index) => (
          <div key={item.key} className="copy-row">
            <span>{index + 1}</span>
            <strong>{item.label}</strong>
            <em>{formatCurrency(getSummaryItemValue(closing, item))}</em>
          </div>
        ))}
      </div>

      {totals.optionalExtrasTotal > 0 ? (
        <div className="optional-summary">
          <h3>Extras opcionais preenchidos</h3>
          {OPTIONAL_EXTRA_FIELDS.filter((field) => getOptionalExtraTotal(closing, field.key) > 0).map((field) => (
            <div key={field.key} className="copy-row">
              <span>+</span>
              <strong>{field.label}</strong>
              <em>{formatCurrency(getOptionalExtraTotal(closing, field.key))}</em>
            </div>
          ))}
        </div>
      ) : null}

      <div className="calculation-card final">
        <div>
          <span>Total das entradas</span>
          <strong>{formatCurrency(totals.entradas)}</strong>
        </div>
        <div>
          <span>Venda de produtos</span>
          <strong>{formatCurrency(totals.venda)}</strong>
        </div>
        <div>
          <span>Troco final</span>
          <strong className={totals.diferenca < 0 ? "negative-text" : totals.diferenca > 0 ? "positive-text" : ""}>
            {formatCurrency(totals.diferenca)}
          </strong>
        </div>
      </div>

      <pre className="summary-box">{summary}</pre>

      <div className="action-grid">
        <button type="button" onClick={onCopy}>
          <ClipboardCopy size={18} />
          Copiar
        </button>
        <button type="button" onClick={onCsv}>
          <FileDown size={18} />
          CSV
        </button>
        <button type="button" onClick={onPrint}>
          <ReceiptText size={18} />
          PDF
        </button>
        <button type="button" onClick={onSave}>
          <Save size={18} />
          Salvar
        </button>
      </div>

      <div className="history-panel">
        <div className="section-heading">
          <History size={19} />
          <div>
            <h2>Historico local</h2>
            <span>Salvo apenas neste aparelho.</span>
          </div>
        </div>
        {history.length ? (
          <div className="history-list">
            {history.map((item) => {
              const itemTotals = calculateTotals(item);
              return (
                <article key={item.id} className="history-item">
                  <button type="button" onClick={() => onLoadHistory(item)}>
                    <strong>{formatDate(item.date)} - Turno {item.turno || "-"}</strong>
                    <span>{formatCurrency(itemTotals.diferenca)} de diferenca</span>
                  </button>
                  <div>
                    <button type="button" onClick={() => onDuplicate(item)} aria-label="Duplicar fechamento">
                      <RotateCcw size={16} />
                    </button>
                    <button type="button" onClick={() => onDelete(item.id)} aria-label="Excluir fechamento">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="muted">Os fechamentos salvos aparecerao aqui.</p>
        )}
      </div>
    </section>
  );
}

function FinalField({ field, values, total, onChange, active = false }) {
  return (
    <article className={`final-field ${active ? "active" : ""}`}>
      <div className="final-field-head">
        <div>
          <strong>{field.label.replace(" Debito", "").replace(" Credito", "")}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{formatCurrency(total)}</strong>
        </div>
      </div>
      <div className="source-grid">
        {field.sources.map((source, index) => (
          <MoneyInput key={source} label={source} value={values[index] || ""} onChange={(value) => onChange(index, value)} />
        ))}
      </div>
    </article>
  );
}

function MoneyInput({ label, value, onChange, autoFocus = false }) {
  return (
    <label className="money-input">
      <span>{label}</span>
      <div>
        <small>R$</small>
        <input
          autoFocus={autoFocus}
          inputMode="numeric"
          value={value}
          placeholder="0,00"
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
    </label>
  );
}

function TotalCard({ label, value, compact = false }) {
  return (
    <div className={`total-card ${compact ? "compact" : ""}`}>
      <span>{label}</span>
      <strong>{formatCurrency(value)}</strong>
    </div>
  );
}


function QrSendModal({ payload, onClose }) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(payload)}`;
  const copyPayload = async () => navigator.clipboard.writeText(payload);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Enviar para celular">
      <section className="qr-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <div className="section-heading">
          <QrCode size={20} />
          <div>
            <h2>Enviar para celular</h2>
            <span>Escaneie este QR Code no celular ou copie o conteúdo abaixo.</span>
          </div>
        </div>
        <img className="qr-image" src={qrSrc} alt="QR Code com os valores do fechamento" />
        <textarea readOnly value={payload} rows="5" />
        <button className="primary-inline" type="button" onClick={copyPayload}>Copiar conteúdo codificado</button>
      </section>
    </div>
  );
}

function QrScanModal({ onApply, onClose }) {
  const videoRef = React.useRef(null);
  const [manualText, setManualText] = useState("");
  const [status, setStatus] = useState("Aguardando camera...");

  useEffect(() => {
    let stream;
    let timer;
    let stopped = false;

    async function start() {
      try {
        if (!("BarcodeDetector" in window)) throw new Error("Leitor nativo indisponivel neste navegador.");
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (videoRef.current) videoRef.current.srcObject = stream;
        setStatus("Aponte a camera para o QR Code do fechamento.");
        const scan = async () => {
          if (stopped || !videoRef.current) return;
          try {
            const codes = await detector.detect(videoRef.current);
            const value = codes?.[0]?.rawValue;
            if (value) {
              stopped = true;
              onApply(value);
              return;
            }
          } catch {}
          timer = window.setTimeout(scan, 450);
        };
        timer = window.setTimeout(scan, 700);
      } catch (error) {
        setStatus(`${error.message || "Camera indisponivel."} Use o campo de colagem abaixo.`);
      }
    }

    start();
    return () => {
      stopped = true;
      if (timer) window.clearTimeout(timer);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onApply]);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Ler QR Code do fechamento">
      <section className="qr-modal">
        <button className="modal-close" type="button" onClick={onClose} aria-label="Fechar">
          <X size={18} />
        </button>
        <div className="section-heading">
          <ScanLine size={20} />
          <div>
            <h2>Ler QR Code do fechamento</h2>
            <span>{status}</span>
          </div>
        </div>
        <video className="qr-video" ref={videoRef} autoPlay muted playsInline />
        <label className="notes-field">
          <span>Fallback por texto</span>
          <textarea value={manualText} rows="5" placeholder="Cole aqui o JSON copiado do computador" onChange={(event) => setManualText(event.target.value)} />
        </label>
        <button className="primary-inline" type="button" onClick={() => onApply(manualText)}>Importar conteúdo colado</button>
      </section>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowLeft,
  ArrowRight,
  Camera,
  CheckCircle2,
  ClipboardCopy,
  FileDown,
  History,
  Plus,
  ReceiptText,
  RotateCcw,
  Save,
  Trash2,
  WalletCards
} from "lucide-react";
import "./styles.css";

const DB_NAME = "fechamento-caixa-db";
const DB_VERSION = 1;
const STORE = "closings";
const DRAFT_KEY = "fechamento-caixa-draft-v1";

const STEPS = [
  { id: "notinha", label: "Notinha" },
  { id: "extras", label: "Extras" },
  { id: "venda", label: "Venda" },
  { id: "resumo", label: "Resumo" }
];

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

function toMoneyFromNumber(value) {
  return value > 0 ? formatNumber(value) : "";
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

function normalizeOcrText(text) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[|]/g, "I");
}

function extractAmountFromLine(line) {
  const matches = line.match(/\d{1,3}(?:[.,]\d{3})*[.,]\d{2}|\d+[.,]\d{2}/g);
  if (!matches?.length) return "";
  return toMoneyFromNumber(parseMoney(matches[matches.length - 1]));
}

function assignIfEmpty(target, section, key, indexOrValue, maybeValue) {
  if (section === "cards") {
    const index = indexOrValue;
    const value = maybeValue;
    if (value && !target.cards[key][index]) target.cards[key][index] = value;
    return;
  }

  const value = indexOrValue;
  if (value && !target[section][key]) target[section][key] = value;
}

function parseReceiptOcr(text, currentClosing) {
  const next = normalizeClosing(currentClosing);
  const lines = normalizeOcrText(text)
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  for (const line of lines) {
    const value = extractAmountFromLine(line);
    if (!value) continue;

    if (line.includes("VENDA") && line.includes("PRODUT")) {
      if (!next.vendaProdutos) next.vendaProdutos = value;
      continue;
    }

    if (line.includes("ABASTECE")) assignIfEmpty(next, "extras", "abasteceAi", value);
    else if (line.includes("QRL") || line.includes("PIX")) assignIfEmpty(next, "extras", "pixStone", value);
    else if (line.includes("NOTA") && line.includes("PRAZO")) assignIfEmpty(next, "extras", "notaPrazo", value);
    else if (line.includes("SANGRIA")) assignIfEmpty(next, "extras", "sangria", value);
    else if (line.includes("TEF") && line.includes("ELO") && line.includes("DEBIT")) {
      assignIfEmpty(next, "cards", "eloDebito", 1, value);
    } else if (!line.includes("TEF") && line.includes("ELO") && line.includes("DEBIT")) {
      assignIfEmpty(next, "cards", "eloDebito", 0, value);
    } else if (line.includes("TEF") && line.includes("MAESTRO")) {
      assignIfEmpty(next, "cards", "maestroDebito", 1, value);
    } else if (!line.includes("TEF") && line.includes("MAESTRO")) {
      assignIfEmpty(next, "cards", "maestroDebito", 0, value);
    } else if (line.includes("TEF") && line.includes("VISA") && line.includes("ELECTRON")) {
      assignIfEmpty(next, "cards", "visaDebito", 1, value);
    } else if (!line.includes("TEF") && line.includes("VISA") && line.includes("DEBIT")) {
      assignIfEmpty(next, "cards", "visaDebito", 0, value);
    } else if (!line.includes("TEF") && line.includes("ELO") && line.includes("CREDIT")) {
      assignIfEmpty(next, "cards", "eloCredito", 0, value);
    } else if (line.includes("TEF") && line.includes("MASTERCARD")) {
      assignIfEmpty(next, "cards", "mastercardCredito", 1, value);
    } else if (!line.includes("TEF") && (line.includes("MASTERCARD") || line.includes("MASTERC"))) {
      assignIfEmpty(next, "cards", "mastercardCredito", 0, value);
    } else if (line.includes("TEF") && line.includes("VISA") && !line.includes("ELECTRON")) {
      assignIfEmpty(next, "cards", "visaCredito", 0, value);
    } else if (!line.includes("TEF") && line.includes("VISA") && line.includes("CREDIT")) {
      assignIfEmpty(next, "cards", "visaCredito", 1, value);
    }
  }

  return next;
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
  const [isOcrRunning, setIsOcrRunning] = useState(false);

  const totals = useMemo(() => calculateTotals(closing), [closing]);
  const summary = useMemo(() => buildSummary(closing, totals), [closing, totals]);
  const currentStep = STEPS[closing.step];

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
    setMessage("Foto anexada sem apagar os valores digitados.");
  }, []);

  const runOcr = useCallback(
    async (files) => {
      const selected = Array.from(files || []);
      if (!selected.length) return;

      await attachFiles(selected);
      setIsOcrRunning(true);
      setMessage("Lendo notinha por OCR. Confira os valores depois.");

      try {
        const { recognize } = await import("tesseract.js");
        const result = await recognize(selected[0], "por");
        setClosing((current) => ({
          ...parseReceiptOcr(result.data.text, current),
          updatedAt: new Date().toISOString()
        }));
        setMessage("OCR finalizado. Confira campo por campo antes de fechar.");
      } catch {
        setMessage("Nao consegui ler a notinha por OCR. A foto foi anexada e seus valores foram mantidos.");
      } finally {
        setIsOcrRunning(false);
      }
    },
    [attachFiles]
  );

  const removeAttachment = useCallback((id) => {
    setClosing((current) => ({
      ...current,
      attachments: current.attachments.filter((attachment) => attachment.id !== id)
    }));
  }, []);

  const loadFromHistory = useCallback((item) => {
    setClosing(normalizeClosing(item));
    setMessage("Fechamento aberto para revisao.");
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

  const resetForm = useCallback(() => {
    setClosing(createBlankClosing());
    localStorage.removeItem(DRAFT_KEY);
    setMessage("Novo fechamento iniciado.");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  return (
    <main className="app-shell">
      <header className="hero">
        <div className="hero-top">
          <ReceiptText size={24} />
          <div>
            <span>Postos Vila</span>
            <h1>Fechamento de Caixa</h1>
          </div>
          <button type="button" onClick={resetForm} aria-label="Novo fechamento">
            <Plus size={20} />
          </button>
        </div>

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

      <section className="stepper" aria-label="Etapas do fechamento">
        {STEPS.map((step, index) => (
          <button
            key={step.id}
            type="button"
            className={index === closing.step ? "active" : index < closing.step ? "done" : ""}
            onClick={() => goToStep(index)}
          >
            <span>{index + 1}</span>
            {step.label}
          </button>
        ))}
      </section>

      {message ? <div className="toast">{message}</div> : null}

      {currentStep.id === "notinha" ? (
        <NotinhaStep
          closing={closing}
          totals={totals}
          onCardValue={updateCardValue}
          onAttach={attachFiles}
          onOcr={runOcr}
          onRemoveAttachment={removeAttachment}
          onFillExample={fillExample}
          isOcrRunning={isOcrRunning}
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

      {currentStep.id === "resumo" ? (
        <ResumoStep
          closing={closing}
          history={history}
          totals={totals}
          summary={summary}
          onCopy={copySummary}
          onCsv={exportCsv}
          onPrint={() => window.print()}
          onSave={() => persist("concluido")}
          onLoadHistory={loadFromHistory}
          onDuplicate={duplicateClosing}
          onDelete={async (id) => {
            await deleteClosing(id);
            refreshHistory();
          }}
        />
      ) : null}

      <nav className="bottom-nav" aria-label="Navegacao do fechamento">
        <button type="button" onClick={previousStep} disabled={closing.step === 0 && closing.cardIndex === 0}>
          <ArrowLeft size={18} />
          Voltar
        </button>
        <div>
          <span>{currentStep.id === "venda" || currentStep.id === "resumo" ? "Troco final" : "Total parcial"}</span>
          <strong className={totals.diferenca < 0 ? "negative-text" : totals.diferenca > 0 ? "positive-text" : ""}>
            {currentStep.id === "venda" || currentStep.id === "resumo"
              ? formatCurrency(totals.diferenca)
              : formatCurrency(totals.cardTotal + totals.extrasTotal)}
          </strong>
        </div>
        {closing.step < STEPS.length - 1 ? (
          <button className="primary" type="button" onClick={nextStep}>
            {currentStep.id === "notinha" && closing.cardIndex < CARD_FIELDS.length - 1
              ? "Prox. campo"
              : currentStep.id === "extras" && closing.extraIndex < EXTRA_FIELDS.length - 1
                ? "Prox. extra"
                : "Proximo"}
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
  );
}

function NotinhaStep({ closing, totals, onCardValue, onAttach, onOcr, onRemoveAttachment, onFillExample, isOcrRunning }) {
  const activeField = CARD_FIELDS[closing.cardIndex];

  return (
    <section className="flow-section">
      <div className="instruction">
        <ReceiptText size={24} />
        <p>Digite os valores como aparecem na notinha. O app soma no campo da planilha.</p>
      </div>

      <div className="section-heading">
        <WalletCards size={20} />
        <div>
          <h2>Cartoes da notinha</h2>
          <span>Total dos cartoes: {formatCurrency(totals.cardTotal)}</span>
        </div>
      </div>

      <div className="focus-progress">
        <span>{activeField.groupTitle}</span>
        <strong>
          Campo {closing.cardIndex + 1} de {CARD_FIELDS.length}
        </strong>
      </div>

      <FinalField
        field={activeField}
        values={closing.cards[activeField.key]}
        total={getCardFieldTotal(closing, activeField.key)}
        onChange={(index, value) => onCardValue(activeField.key, index, value)}
      />

      <div className="utility-row">
        <label className="attach-compact">
          <Camera size={18} />
          Anexar foto da notinha
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
        <label className={`attach-compact ${isOcrRunning ? "busy" : ""}`}>
          <ReceiptText size={18} />
          {isOcrRunning ? "Lendo OCR..." : "Ler notinha por OCR"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            disabled={isOcrRunning}
            onChange={(event) => {
              onOcr(event.target.files);
              event.target.value = "";
            }}
          />
        </label>
        <button type="button" onClick={onFillExample}>
          <CheckCircle2 size={18} />
          Usar exemplo
        </button>
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
        <p>Informe a venda de produtos do relatorio. O troco final e a soma de tudo menos essa venda.</p>
      </div>
      <MoneyInput label="Venda de produtos" value={closing.vendaProdutos} onChange={onVenda} autoFocus />
      <div className="calculation-card">
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

function FinalField({ field, values, total, onChange }) {
  return (
    <article className="final-field">
      <div className="final-field-head">
        <div>
          <span>Campo da planilha</span>
          <strong>{field.label}</strong>
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

createRoot(document.getElementById("root")).render(<App />);

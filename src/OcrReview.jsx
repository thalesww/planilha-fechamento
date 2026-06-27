import React from 'react';
import { CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';

function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value)
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  const parsed = parseFloat(normalized);
  return isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

// CARD_FIELDS mirror — needed to build the review list
const CARD_REVIEW_FIELDS = [
  { key: 'eloDebito',       label: 'ELO Débito',        sources: ['ELO Debito', 'TEF ELO Debito'] },
  { key: 'maestroDebito',   label: 'Maestro Débito',     sources: ['Maestro', 'TEF Maestro'] },
  { key: 'visaDebito',      label: 'Visa Débito',        sources: ['Visa Electron', 'TEF Visa Electron'] },
  { key: 'eloCredito',      label: 'ELO Crédito',        sources: ['ELO Credito', '2º ELO Crédito'] },
  { key: 'mastercardCredito', label: 'Mastercard Crédito', sources: ['Mastercard', 'TEF Mastercard'] },
  { key: 'visaCredito',     label: 'Visa Crédito',       sources: ['TEF Visa', 'Visa Credito'] },
];

const EXTRA_REVIEW_FIELDS = [
  { key: 'abasteceAi', label: 'Abastece Aí' },
  { key: 'pixStone',   label: 'PIX Stone / QRLIX' },
  { key: 'notaPrazo',  label: 'Nota a Prazo' },
  { key: 'sangria',    label: 'Sangria' },
];

// ── Loading overlay ────────────────────────────────────────────────────────────
export function OcrLoadingOverlay({ progress }) {
  return (
    <div className="ocr-loading-overlay">
      <div className="ocr-loading-card">
        <div className="ocr-spinner-ring">
          <svg viewBox="0 0 56 56" className="ocr-spinner-svg">
            <circle cx="28" cy="28" r="22" fill="none" stroke="var(--outline-variant)" strokeWidth="4" />
            <circle
              cx="28" cy="28" r="22"
              fill="none"
              stroke="var(--primary)"
              strokeWidth="4"
              strokeDasharray="138"
              strokeDashoffset="100"
              strokeLinecap="round"
              className="ocr-spinner-arc"
            />
          </svg>
        </div>
        <p className="ocr-loading-title">Lendo notinha…</p>
        <p className="ocr-loading-sub">{progress || 'Aguarde, processando imagem com OCR'}</p>
        <div className="ocr-loading-bar">
          <div className="ocr-loading-bar-fill" />
        </div>
      </div>
    </div>
  );
}

// ── Result panel ───────────────────────────────────────────────────────────────
export function OcrReviewPanel({
  ocrResult,
  foundCount,
  totalFields,
  onConfirm,
  onDiscard,
  onChangeCardValue,
  onChangeExtraValue,
  onChangeVendaProdutos,
  onChangeSobra
}) {
  const precision = Math.round((foundCount / totalFields) * 100);
  const precisionColor =
    precision >= 80 ? 'precision-high' : precision >= 50 ? 'precision-mid' : 'precision-low';
  const validation = ocrResult?.validation;

  const cardRows = CARD_REVIEW_FIELDS
    .map(field => {
      const vals = ocrResult?.cards?.[field.key] || ['', ''];
      const v0 = parseMoney(vals[0]);
      const v1 = parseMoney(vals[1]);
      const hasAny = v0 > 0 || v1 > 0;
      return { ...field, vals, v0, v1, sum: v0 + v1, hasAny };
    });

  const extraRows = EXTRA_REVIEW_FIELDS
    .map(field => {
      const val = parseMoney(ocrResult?.extras?.[field.key]);
      return { ...field, val };
    });

  return (
    <div className="ocr-review-panel">
      {/* Header */}
      <div className="ocr-review-header">
        <div className="ocr-review-title-row">
          <CheckCircle2 size={20} className="ocr-review-icon" />
          <span className="ocr-review-title">OCR Concluído</span>
        </div>
        <div className={`ocr-precision-chip ${precisionColor}`}>
          {precision}% precisão · {foundCount} de {totalFields} campos
        </div>
      </div>

      {validation && !validation.isValid && (
        <div className="ocr-validation-alert" role="alert">
          <AlertTriangle size={22} />
          <div>
            <strong>Conferência matemática não bateu.</strong>
            <p>
              A sobra calculada pela soma dos campos menos venda de produtos é {formatCurrency(validation.expectedSobra)},
              {validation.hasRecognizedSobra
                ? ` mas a sobra lida na notinha foi ${formatCurrency(validation.recognizedSobra)} (diferença de ${formatCurrency(validation.difference)}).`
                : " mas a sobra nao foi lida na notinha."} Confira e edite os campos antes de confirmar.
            </p>
          </div>
        </div>
      )}

      {foundCount === 0 && (
        <div className="ocr-review-empty">
          <AlertTriangle size={28} />
          <p>Nenhum valor reconhecido. Verifique a nitidez da foto e tente novamente, ou preencha manualmente.</p>
        </div>
      )}

      <div className="ocr-review-list">

          {/* Venda Produtos */}
          <div className="ocr-review-item">
            <div className="ocr-review-item-label">Venda de produtos</div>
            <div className="ocr-review-sources">
              <div className="ocr-review-source-row">
                <span className="ocr-source-name">Reconhecido</span>
                <input
                  className="ocr-source-value ocr-source-input"
                  type="text"
                  inputMode="numeric"
                  value={ocrResult?.vendaProdutos || ''}
                  placeholder="0,00"
                  onChange={(event) => onChangeVendaProdutos?.(event.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Card fields */}
          {cardRows.map(row => (
            <div key={row.key} className="ocr-review-item">
              <div className="ocr-review-item-label">{row.label}</div>
              <div className="ocr-review-sources">
                {row.vals.map((v, i) => (
                  <div key={i} className="ocr-review-source-row">
                    <span className="ocr-source-name">{row.sources[i]}</span>
                    <input
                      className="ocr-source-value ocr-source-input"
                      type="text"
                      inputMode="numeric"
                      value={v || ''}
                      placeholder="0,00"
                      onChange={(event) => onChangeCardValue?.(row.key, i, event.target.value)}
                    />
                  </div>
                ))}
                {row.v0 > 0 && row.v1 > 0 && (
                  <div className="ocr-review-sum-row">
                    <span className="ocr-sum-label">Soma →</span>
                    <span className="ocr-sum-value">{formatCurrency(row.sum)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* Extra fields */}
          {extraRows.map(row => (
            <div key={row.key} className="ocr-review-item">
              <div className="ocr-review-item-label">{row.label}</div>
              <div className="ocr-review-sources">
                <div className="ocr-review-source-row">
                  <span className="ocr-source-name">Reconhecido</span>
                  <input
                    className="ocr-source-value ocr-source-input"
                    type="text"
                    inputMode="numeric"
                    value={ocrResult?.extras?.[row.key] || ''}
                    placeholder="0,00"
                    onChange={(event) => onChangeExtraValue?.(row.key, event.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}


          {/* Sobra / diferenca */}
          <div className="ocr-review-item">
            <div className="ocr-review-item-label">Sobra / diferença</div>
            <div className="ocr-review-sources">
              <div className="ocr-review-source-row">
                <span className="ocr-source-name">Reconhecido</span>
                <input
                  className="ocr-source-value ocr-source-input"
                  type="text"
                  inputMode="numeric"
                  value={ocrResult?.sobra || ocrResult?.diferencaSobra || ''}
                  placeholder="0,00"
                  onChange={(event) => onChangeSobra?.(event.target.value)}
                />
              </div>
            </div>
          </div>
      </div>

      {/* Actions */}
      <div className="ocr-review-actions">
        <button className="ocr-btn-confirm" onClick={onConfirm}>
          <CheckCircle2 size={18} />
          Confirmar e usar valores
        </button>
        <button className="ocr-btn-discard" onClick={onDiscard}>
          <XCircle size={18} />
          Descartar — digitar manual
        </button>
      </div>
    </div>
  );
}

import React, { useState, useRef } from 'react';
import { Camera, Trash2, ClipboardCopy, CheckCircle2, FileDown } from 'lucide-react';

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
}

function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isFinite(parsed) ? parsed : 0;
}

function toMoneyInput(value) {
  const cents = String(value).replace(/\D/g, '');
  if (!cents) return '';
  return (Number(cents) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function createId() {
  return crypto.randomUUID?.() || `id-${Date.now().toString(36)}`;
}

function PhotoThumb({ photo, onRemove }) {
  return (
    <figure className="thumb-figure">
      <img src={photo.dataUrl} alt={photo.name} className="thumb-img" />
      <figcaption className="thumb-caption">{photo.name}</figcaption>
      <button
        type="button"
        className="thumb-remove-btn"
        onClick={() => onRemove(photo.id)}
        aria-label="Remover foto"
      >
        <Trash2 size={13} />
      </button>
    </figure>
  );
}

function PhotoAttachBtn({ label, capture, onFiles }) {
  const inputRef = useRef();
  return (
    <label className="comp-attach-btn">
      <Camera size={16} />
      {label}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture={capture || undefined}
        multiple
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = Array.from(e.target.files || []);
          if (!files.length) return;
          const encoded = await Promise.all(files.map(async f => ({
            id: createId(),
            name: f.name,
            size: f.size,
            dataUrl: await fileToDataUrl(f),
            addedAt: new Date().toISOString(),
          })));
          onFiles(encoded);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function TerminalCard({ index, data, onChange, onPhotos, onRemovePhoto }) {
  const label = `Terminal ${index + 1}`;
  return (
    <div className="comp-terminal-card">
      <div className="comp-terminal-header">
        <span className="material-symbols-outlined comp-terminal-icon">point_of_sale</span>
        <span className="comp-terminal-label">{label}</span>
      </div>
      <div className="comp-money-row">
        <label className="comp-field-label">Total do fechamento</label>
        <div className="comp-money-input">
          <small>R$</small>
          <input
            type="tel"
            inputMode="numeric"
            placeholder="0,00"
            value={data.total || ''}
            onChange={e => onChange(index, 'total', toMoneyInput(e.target.value))}
          />
        </div>
      </div>
      <div className="comp-photo-row">
        <PhotoAttachBtn label="Foto câmera" capture="environment" onFiles={files => onPhotos(index, files)} />
        <PhotoAttachBtn label="Da galeria" capture={null} onFiles={files => onPhotos(index, files)} />
      </div>
      {data.photos?.length > 0 && (
        <div className="comp-thumbs">
          {data.photos.map(p => (
            <PhotoThumb key={p.id} photo={p} onRemove={id => onRemovePhoto(index, id)} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Comprovantes({
  closing,
  lancamentos,
  totals,
  comprovantes,
  onUpdateComp,
  onSave,
  onBack,
  formatCurrencyProp,
}) {
  const [toastVisible, setToastVisible] = useState(false);
  const fmt = formatCurrencyProp || formatCurrency;

  // ── helpers ─────────────────────────────────────────────────────────────
  function updateTerminal(index, field, value) {
    const next = [...comprovantes.terminals];
    next[index] = { ...next[index], [field]: value };
    onUpdateComp({ terminals: next });
  }

  function addTerminalPhotos(index, files) {
    const next = [...comprovantes.terminals];
    next[index] = { ...next[index], photos: [...(next[index].photos || []), ...files] };
    onUpdateComp({ terminals: next });
  }

  function removeTerminalPhoto(termIndex, photoId) {
    const next = [...comprovantes.terminals];
    next[termIndex] = { ...next[termIndex], photos: next[termIndex].photos.filter(p => p.id !== photoId) };
    onUpdateComp({ terminals: next });
  }

  function addCoffrePhotos(files) {
    onUpdateComp({ coffrePhotos: [...(comprovantes.coffrePhotos || []), ...files] });
  }
  function removeCoffrePhoto(id) {
    onUpdateComp({ coffrePhotos: comprovantes.coffrePhotos.filter(p => p.id !== id) });
  }

  function addSangriaPhotos(files) {
    onUpdateComp({ sangriaPhotos: [...(comprovantes.sangriaPhotos || []), ...files] });
  }
  function removeSangriaPhoto(id) {
    onUpdateComp({ sangriaPhotos: comprovantes.sangriaPhotos.filter(p => p.id !== id) });
  }

  // ── planilha instructions ────────────────────────────────────────────────
  const planilhaLines = lancamentos
    .map(item => `${item.label}: ${item.value}`)
    .join('\n');

  const terminalLines = comprovantes.terminals
    .map((t, i) => `Terminal ${i + 1}: ${t.total ? `R$ ${t.total}` : '(não informado)'}`)
    .join('\n');

  const fullInstructions = [
    '=== LANÇAMENTOS PARA A PLANILHA ===',
    planilhaLines,
    '',
    `Total Entradas: ${fmt(totals.entradas)}`,
    `Venda do Posto: ${fmt(totals.venda)}`,
    `Sobra calculada: ${fmt(totals.diferenca)}`,
    `Sobra informada: ${fmt(parseMoney(closing?.sobra))}`,
    `Troco Final: ${fmt(totals.diferenca)}`,
    '',
    '=== FECHAMENTO DAS MAQUININHAS ===',
    terminalLines,
    '',
    `Cofre / Sangrias: R$ ${comprovantes.totalCofre || '(não informado)'}`,
  ].join('\n');

  async function copyInstructions() {
    await navigator.clipboard.writeText(fullInstructions);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3000);
  }

  const allTerminalsFilled = comprovantes.terminals.every(t => t.total);

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-28">
      {/* Header */}
      <header className="flex flex-col w-full px-container-padding py-2 bg-surface border-b border-outline-variant sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>local_gas_station</span>
          <h1 className="text-headline-md font-headline-md font-bold text-primary flex-1">Postos Vila</h1>
        </div>
        {/* Stepper */}
        <div className="flex items-center justify-between mt-4 px-2">
          {['Cartões', 'Comb.', 'Venda Posto', 'Resumo', 'Comp.'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${i < 4 ? 'bg-primary text-on-primary' : 'border-2 border-primary text-primary'}`}>
                  {i < 4 ? (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  ) : (
                    <span className="text-[12px] font-bold">5</span>
                  )}
                </div>
                <span className={`text-[10px] ${i === 4 ? 'font-bold text-primary' : 'text-secondary'}`}>{label}</span>
              </div>
              {i < 4 && <div className="flex-1 h-[2px] bg-primary mx-1" />}
            </React.Fragment>
          ))}
        </div>
      </header>

      <main className="p-container-padding space-y-card-gap max-w-4xl mx-auto">
        <h2 className="text-headline-lg font-headline-lg">Comprovantes</h2>
        <p className="text-body-md text-on-surface-variant">Registre o fechamento das maquininhas e do cofre. As fotos são opcionais, mas os totais são necessários para lançar na planilha.</p>

        {/* ── Terminals ─────────────────────────────────────────── */}
        <div className="comp-section-card">
          <div className="comp-section-header">
            <span className="material-symbols-outlined text-primary">point_of_sale</span>
            <h3 className="comp-section-title">Fechamento das Maquininhas</h3>
          </div>
          <p className="comp-instruction">Digite o valor total que aparece no fechamento de cada terminal.</p>
          <div className="comp-terminals-list">
            {comprovantes.terminals.map((t, i) => (
              <TerminalCard
                key={i}
                index={i}
                data={t}
                onChange={updateTerminal}
                onPhotos={addTerminalPhotos}
                onRemovePhoto={removeTerminalPhoto}
              />
            ))}
          </div>
        </div>

        {/* ── Cofre / Sangrias ───────────────────────────────────── */}
        <div className="comp-section-card">
          <div className="comp-section-header">
            <span className="material-symbols-outlined text-primary">savings</span>
            <h3 className="comp-section-title">Extrato do Cofre / Sangrias</h3>
          </div>
          <p className="comp-instruction">Informe o total depositado no cofre somando todas as sangrias do turno.</p>
          <div className="comp-money-row">
            <label className="comp-field-label">Total depositado no cofre</label>
            <div className="comp-money-input">
              <small>R$</small>
              <input
                type="tel"
                inputMode="numeric"
                placeholder="0,00"
                value={comprovantes.totalCofre || ''}
                onChange={e => onUpdateComp({ totalCofre: toMoneyInput(e.target.value) })}
              />
            </div>
          </div>
          <div className="comp-photo-row mt-3">
            <PhotoAttachBtn label="📷 Extrato cofre" capture="environment" onFiles={addCoffrePhotos} />
            <PhotoAttachBtn label="📷 Fotos sangrias" capture={null} onFiles={addSangriaPhotos} />
          </div>
          {comprovantes.coffrePhotos?.length > 0 && (
            <div className="comp-thumbs mt-2">
              {comprovantes.coffrePhotos.map(p => (
                <PhotoThumb key={p.id} photo={p} onRemove={removeCoffrePhoto} />
              ))}
            </div>
          )}
          {comprovantes.sangriaPhotos?.length > 0 && (
            <div className="comp-thumbs mt-2">
              {comprovantes.sangriaPhotos.map(p => (
                <PhotoThumb key={p.id} photo={p} onRemove={removeSangriaPhoto} />
              ))}
            </div>
          )}
        </div>

        {/* ── Planilha guide ─────────────────────────────────────── */}
        <div className="comp-section-card">
          <div className="comp-section-header">
            <span className="material-symbols-outlined text-primary">table_chart</span>
            <h3 className="comp-section-title">Instruções para a Planilha</h3>
          </div>
          <p className="comp-instruction">Copie e cole no chat do seu gerente ou use como guia para preencher a planilha.</p>
          <pre className="comp-instructions-box">{fullInstructions}</pre>
          <button className="comp-copy-btn" onClick={copyInstructions}>
            <ClipboardCopy size={18} />
            Copiar instruções
          </button>
        </div>

        {/* ── Finalize ───────────────────────────────────────────── */}
        {!allTerminalsFilled && (
          <div className="comp-warning">
            <span className="material-symbols-outlined">warning</span>
            <span>Preencha o total de pelo menos uma maquininha para finalizar.</span>
          </div>
        )}
        <button
          className={`comp-finalize-btn ${allTerminalsFilled ? 'active' : 'disabled'}`}
          onClick={allTerminalsFilled ? onSave : undefined}
          disabled={!allTerminalsFilled}
        >
          <CheckCircle2 size={22} />
          Finalizar Fechamento
        </button>
      </main>

      {/* Bottom nav */}
      <nav className="fixed bottom-0 w-full z-50 flex justify-between items-center px-container-padding py-3 bg-surface-container-lowest rounded-t-xl border-t border-outline-variant shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={onBack}
          className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full min-w-[120px] py-2 hover:bg-primary/10 active:scale-95 transition-transform duration-100"
        >
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="text-label-sm font-label-sm mt-1">Voltar</span>
        </button>
        <div />
      </nav>

      {/* Toast */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-opacity duration-300 pointer-events-none z-50 ${toastVisible ? 'opacity-100' : 'opacity-0'}`}>
        <span className="material-symbols-outlined text-primary-fixed-dim">check_circle</span>
        <span>Instruções copiadas!</span>
      </div>
    </div>
  );
}

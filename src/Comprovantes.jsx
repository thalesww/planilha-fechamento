import React, { useRef } from 'react';
import { Camera, Trash2, CheckCircle2, Paperclip } from 'lucide-react';

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
        <PhotoAttachBtn label="Foto camera" capture="environment" onFiles={files => onPhotos(index, files)} />
        <PhotoAttachBtn label="Da galeria" capture={null} onFiles={files => onPhotos(index, files)} />
      </div>
      <label className="comp-check-row">
        <input
          type="checkbox"
          checked={Boolean(data.printedAttached)}
          onChange={e => onChange(index, 'printedAttached', e.target.checked)}
        />
        <span>Relatorio anexado</span>
      </label>
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
  comprovantes,
  onUpdateComp,
  onSave,
  onBack,
}) {
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
    next[termIndex] = { ...next[termIndex], photos: (next[termIndex].photos || []).filter(p => p.id !== photoId) };
    onUpdateComp({ terminals: next });
  }

  function addCoffrePhotos(files) {
    onUpdateComp({ coffrePhotos: [...(comprovantes.coffrePhotos || []), ...files] });
  }
  function removeCoffrePhoto(id) {
    onUpdateComp({ coffrePhotos: (comprovantes.coffrePhotos || []).filter(p => p.id !== id) });
  }

  function addSangriaPhotos(files) {
    onUpdateComp({ sangriaPhotos: [...(comprovantes.sangriaPhotos || []), ...files] });
  }
  function removeSangriaPhoto(id) {
    onUpdateComp({ sangriaPhotos: (comprovantes.sangriaPhotos || []).filter(p => p.id !== id) });
  }

  function addOtherDocsPhotos(files) {
    onUpdateComp({ otherDocsPhotos: [...(comprovantes.otherDocsPhotos || []), ...files], noOtherDocs: false });
  }
  function removeOtherDocsPhoto(id) {
    onUpdateComp({ otherDocsPhotos: (comprovantes.otherDocsPhotos || []).filter(p => p.id !== id) });
  }

  const sangriaDinheiro = closing?.extras?.sangria || "";
  const allTerminalsDocumented = comprovantes.terminals.every(t => t.printedAttached || t.photos?.length);
  const cofreDocumented = comprovantes.coffrePrintedAttached || comprovantes.coffrePhotos?.length;
  const sangriasDocumented = comprovantes.sangriaPhotosAttached || comprovantes.sangriaPhotos?.length > 0;
  const otherDocsChecked = comprovantes.noOtherDocs || comprovantes.otherDocsPhotos?.length > 0 || comprovantes.otherDocsNote?.trim();
  const canFinalize = allTerminalsDocumented && cofreDocumented && sangriasDocumented && otherDocsChecked;
  const pendingItems = [
    !allTerminalsDocumented ? "marque/anexe os 3 relatorios das maquininhas" : "",
    !cofreDocumented ? "marque/anexe o relatorio do cofre inteligente" : "",
    !sangriasDocumented ? "marque/anexe as fotos das sangrias" : "",
    !otherDocsChecked ? "anexe vales/outros documentos ou marque que nao houve" : "",
  ].filter(Boolean);

  return (
    <div className="bg-surface text-on-surface min-h-screen pb-28">
      <header className="flex flex-col w-full px-container-padding py-2 bg-surface border-b border-outline-variant sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>local_gas_station</span>
          <h1 className="text-headline-md font-headline-md font-bold text-primary flex-1">Postos Vila</h1>
        </div>
        <div className="flex items-center justify-between mt-4 px-2">
          {['Cartoes', 'Comb.', 'Venda Posto', 'Resumo', 'Comp.'].map((label, i) => (
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
        <p className="text-body-md text-on-surface-variant">Depois do resumo da planilha, confira e registre todos os documentos que precisam acompanhar o fechamento.</p>

        <div className="comp-section-card">
          <div className="comp-section-header">
            <span className="material-symbols-outlined text-primary">point_of_sale</span>
            <h3 className="comp-section-title">Fechamento das Maquininhas</h3>
          </div>
          <p className="comp-instruction">Registre os 3 fechamentos. Para cada maquininha, anexe a foto ou marque que o relatorio ja foi anexado.</p>
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

        <div className="comp-section-card">
          <div className="comp-section-header">
            <span className="material-symbols-outlined text-primary">savings</span>
            <h3 className="comp-section-title">Cofre inteligente / Sangrias</h3>
          </div>
          <p className="comp-instruction">O total do cofre inteligente deve bater com a Sangria dinheiro informada no fechamento. Anexe o relatorio do cofre e as fotos das sangrias do turno.</p>
          <div className="comp-money-row">
            <label className="comp-field-label">Total do cofre inteligente / Sangria dinheiro</label>
            <div className="comp-money-input read-only">
              <small>R$</small>
              <strong>{sangriaDinheiro || "0,00"}</strong>
            </div>
          </div>
          <div className="comp-photo-row mt-3">
            <PhotoAttachBtn label="Relatorio cofre" capture="environment" onFiles={addCoffrePhotos} />
            <PhotoAttachBtn label="Fotos sangrias" capture={null} onFiles={addSangriaPhotos} />
          </div>
          <label className="comp-check-row">
            <input
              type="checkbox"
              checked={Boolean(comprovantes.coffrePrintedAttached)}
              onChange={e => onUpdateComp({ coffrePrintedAttached: e.target.checked })}
            />
            <span>Relatorio anexado</span>
          </label>
          <label className="comp-check-row">
            <input
              type="checkbox"
              checked={Boolean(comprovantes.sangriaPhotosAttached)}
              onChange={e => onUpdateComp({ sangriaPhotosAttached: e.target.checked })}
            />
            <span>Fotos das sangrias anexadas</span>
          </label>
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

        <div className="comp-section-card">
          <div className="comp-section-header">
            <Paperclip size={18} className="text-primary" />
            <h3 className="comp-section-title">Vales e outros documentos</h3>
          </div>
          <p className="comp-instruction">Anexe eventuais vales, recibos ou outros documentos do fechamento. Se nao houver, marque a confirmacao abaixo.</p>
          <div className="comp-photo-row">
            <PhotoAttachBtn label="Foto documento" capture="environment" onFiles={addOtherDocsPhotos} />
            <PhotoAttachBtn label="Da galeria" capture={null} onFiles={addOtherDocsPhotos} />
          </div>
          <label className="comp-field-label">
            Observacao sobre vales/outros documentos
            <textarea
              className="comp-textarea"
              rows="3"
              value={comprovantes.otherDocsNote || ''}
              placeholder="Ex.: vale motorista, recibo avulso, comprovante separado."
              onChange={e => onUpdateComp({ otherDocsNote: e.target.value, noOtherDocs: false })}
            />
          </label>
          <label className="comp-check-row">
            <input
              type="checkbox"
              checked={Boolean(comprovantes.noOtherDocs)}
              onChange={e => onUpdateComp({ noOtherDocs: e.target.checked })}
            />
            <span>Nao houve vales nem outros documentos neste fechamento</span>
          </label>
          {comprovantes.otherDocsPhotos?.length > 0 && (
            <div className="comp-thumbs mt-2">
              {comprovantes.otherDocsPhotos.map(p => (
                <PhotoThumb key={p.id} photo={p} onRemove={removeOtherDocsPhoto} />
              ))}
            </div>
          )}
        </div>

        {!canFinalize && (
          <div className="comp-warning">
            <span className="material-symbols-outlined">warning</span>
            <div>
              <strong>Falta conferir:</strong>
              <ul className="comp-missing-list">
                {pendingItems.map(item => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        )}
        <button
          className={`comp-finalize-btn ${canFinalize ? 'active' : 'disabled'}`}
          onClick={canFinalize ? onSave : undefined}
          disabled={!canFinalize}
        >
          <CheckCircle2 size={22} />
          Finalizar Fechamento
        </button>
      </main>

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

    </div>
  );
}

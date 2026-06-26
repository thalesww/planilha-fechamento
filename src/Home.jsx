import React, { useState } from 'react';

export default function Home({ closing, updateClosing, history, onNew, onLoadHistory, calculateTotals, formatCurrency, formatDate, onImportClosingText }) {
  const [closingText, setClosingText] = useState("");

  const handleImport = () => {
    if (onImportClosingText(closingText)) setClosingText("");
  };

  return (
    <div className="bg-background text-on-background min-h-screen flex flex-col">
      <header className="bg-surface dark:bg-surface-dim docked full-width top-0 border-b border-outline-variant dark:border-outline flat no shadows flex flex-col w-full px-container-padding py-2 sticky z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim" style={{ fontVariationSettings: "'FILL' 1" }}>local_gas_station</span>
          <h1 className="text-headline-md font-headline-md font-bold text-primary dark:text-primary-fixed">Postos Vila</h1>
        </div>
        <div className="mt-2 text-headline-lg-mobile font-headline-lg-mobile md:text-headline-lg md:font-headline-lg text-primary dark:text-primary-fixed-dim">
          Fechamento de Caixa
        </div>
      </header>

      <main className="flex-grow p-container-padding flex flex-col gap-card-gap md:px-8 md:py-6 max-w-4xl mx-auto w-full">
        {/* Stepper */}
        <div className="flex items-center justify-between px-2 py-4 bg-surface-container-lowest border border-outline-variant rounded-lg mb-4">
          <div className="flex flex-col items-center flex-1">
            <div className="w-8 h-8 rounded-full bg-primary text-on-primary flex items-center justify-center font-bold text-sm mb-1">1</div>
            <span className="text-label-sm font-label-sm text-primary font-bold border-b-2 border-primary pb-1">Início</span>
          </div>
          <div className="h-[2px] bg-outline-variant flex-1 mx-2"></div>
          <div className="flex flex-col items-center flex-1 opacity-50">
            <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-sm mb-1">2</div>
            <span className="text-label-sm font-label-sm text-on-surface-variant">Cartões</span>
          </div>
          <div className="h-[2px] bg-outline-variant flex-1 mx-2"></div>
          <div className="flex flex-col items-center flex-1 opacity-50">
            <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-sm mb-1">3</div>
            <span className="text-label-sm font-label-sm text-on-surface-variant">Combustível</span>
          </div>
          <div className="h-[2px] bg-outline-variant flex-1 mx-2 hidden sm:block"></div>
          <div className="flex flex-col items-center flex-1 opacity-50 hidden sm:flex">
            <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-sm mb-1">4</div>
            <span className="text-label-sm font-label-sm text-on-surface-variant">Venda Posto</span>
          </div>
          <div className="h-[2px] bg-outline-variant flex-1 mx-2 hidden md:block"></div>
          <div className="flex flex-col items-center flex-1 opacity-50 hidden md:flex">
            <div className="w-8 h-8 rounded-full bg-surface-container-high text-on-surface-variant flex items-center justify-center font-bold text-sm mb-1">5</div>
            <span className="text-label-sm font-label-sm text-on-surface-variant">Final</span>
          </div>
        </div>

        {/* Start Shift Card */}
        <div className="bg-surface-container-lowest rounded-xl p-4 md:p-6 border border-outline-variant shadow-sm flex flex-col gap-stack-gap">
          <h2 className="text-headline-md font-headline-md text-on-surface">Iniciar Turno</h2>
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1">Data</label>
              <input 
                className="w-full bg-surface border border-outline-variant rounded px-3 py-3 text-body-md font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[touch-target-min]" 
                type="date" 
                value={closing.date}
                onChange={(e) => updateClosing({ date: e.target.value })}
              />
            </div>
            <div className="flex-1">
              <label className="block text-label-sm font-label-sm text-on-surface-variant mb-1">Turno</label>
              <select 
                className="w-full bg-surface border border-outline-variant rounded px-3 py-3 text-body-md font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[touch-target-min]"
                value={closing.turno}
                onChange={(e) => updateClosing({ turno: e.target.value })}
              >
                <option value="1">Manhã (06:00 - 14:00)</option>
                <option value="2">Tarde (14:00 - 22:00)</option>
                <option value="3">Noite (22:00 - 06:00)</option>
              </select>
            </div>
          </div>
          <button 
            onClick={onNew}
            className="mt-4 w-full bg-primary hover:bg-primary-fixed-dim text-on-primary font-bold rounded-lg py-4 flex items-center justify-center gap-2 transition-colors duration-200 min-h-[touch-target-min]">
            <span className="material-symbols-outlined">add</span>
            Iniciar Novo Fechamento
          </button>
        </div>

        {/* Paste Closing Values */}
        <div className="bg-surface-container-lowest rounded-xl p-4 md:p-6 border border-outline-variant shadow-sm flex flex-col gap-stack-gap">
          <div>
            <h2 className="text-headline-md font-headline-md text-on-surface">Colar valores do fechamento</h2>
            <p className="text-body-sm font-body-sm text-on-surface-variant mt-1">Cole o texto gerado pelo computador para preencher cartões, extras, venda de produtos e sobra automaticamente.</p>
          </div>
          <label className="block">
            <span className="block text-label-sm font-label-sm text-on-surface-variant mb-1">Texto do fechamento</span>
            <textarea
              className="w-full bg-surface border border-outline-variant rounded px-3 py-3 text-body-md font-body-md text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[140px]"
              value={closingText}
              placeholder={`ELO Debito: R$ 123,45\nVenda de produtos: R$ 11.115,26\nTroco final / diferenca: R$ 0,13`}
              onChange={(event) => setClosingText(event.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={handleImport}
            disabled={!closingText.trim()}
            className="w-full bg-secondary hover:bg-secondary/90 disabled:opacity-50 disabled:cursor-not-allowed text-on-secondary font-bold rounded-lg py-4 flex items-center justify-center gap-2 transition-colors duration-200 min-h-[touch-target-min]"
          >
            <span className="material-symbols-outlined">content_paste_go</span>
            Importar
          </button>
        </div>

        {/* History Section */}
        <div className="mt-6 flex flex-col gap-stack-gap">
          <h3 className="text-headline-md font-headline-md text-on-surface border-b border-outline-variant pb-2">Histórico Recente</h3>
          <div className="bg-surface-container-lowest rounded-xl border border-outline-variant overflow-hidden">
            {history.length === 0 ? (
              <div className="p-4 text-center text-on-surface-variant">Nenhum histórico encontrado.</div>
            ) : (
              history.map((item, index) => {
                const itemTotals = calculateTotals(item);
                const turnoLabel = item.turno === "1" ? "Manhã" : item.turno === "2" ? "Tarde" : item.turno === "3" ? "Noite" : item.turno;
                return (
                  <div 
                    key={item.id}
                    onClick={() => onLoadHistory(item)}
                    className={`flex flex-row items-center justify-between p-4 cursor-pointer hover:bg-surface-variant transition-colors border-b border-outline-variant ${index % 2 === 0 ? 'bg-surface' : 'bg-surface-container-lowest'}`}>
                    <div className="flex flex-col">
                      <span className="text-body-md font-body-md text-on-surface font-semibold">{formatDate(item.date)} - {turnoLabel}</span>
                      <span className="text-label-sm font-label-sm text-on-surface-variant">Operador: {item.operador || 'Não informado'}</span>
                    </div>
                    <div className="text-label-numeric font-label-numeric text-primary font-bold">{formatCurrency(itemTotals.entradas)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </main>

      {/* BottomNavBar */}
      <nav className="bg-surface-container-lowest dark:bg-surface-container-low docked full-width bottom-0 rounded-t-xl border-t border-outline-variant shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shadow-sm fixed bottom-0 w-full z-50 flex justify-between items-center px-container-padding py-3 md:hidden">
        <button className="flex flex-col items-center justify-center text-secondary dark:text-secondary-fixed-dim py-2 hover:bg-primary/10 dark:hover:bg-primary-fixed-dim/10 flex-1">
          <span className="material-symbols-outlined">history</span>
          <span className="text-label-sm font-label-sm mt-1">Histórico</span>
        </button>
        <button onClick={onNew} className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full min-w-[120px] py-2 hover:bg-primary/10 dark:hover:bg-primary-fixed-dim/10 active:scale-95 transition-transform duration-100 flex-1 mx-2">
          <span className="material-symbols-outlined">add_circle</span>
          <span className="text-label-sm font-label-sm mt-1 font-bold">Novo</span>
        </button>
        <button className="flex flex-col items-center justify-center text-secondary dark:text-secondary-fixed-dim py-2 hover:bg-primary/10 dark:hover:bg-primary-fixed-dim/10 flex-1">
          <span className="material-symbols-outlined">settings</span>
          <span className="text-label-sm font-label-sm mt-1">Ajustes</span>
        </button>
      </nav>
      <div className="h-20 md:hidden"></div>
    </div>
  );
}

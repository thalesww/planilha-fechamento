import React, { useState } from 'react';

function parseMoney(value) {
  if (!value) return 0;
  const normalized = String(value).replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = parseFloat(normalized);
  return isFinite(parsed) ? parsed : 0;
}

export default function Resumo({ closing, lancamentos, totals, onCopy, onSave, onBack, formatCurrency }) {
  const [toastVisible, setToastVisible] = useState(false);

  const handleCopy = () => {
    onCopy();
    setToastVisible(true);
    setTimeout(() => {
      setToastVisible(false);
    }, 3000);
  };

  return (
    <div className="bg-surface text-on-surface font-body-md min-h-screen pb-24">
      {/* TopAppBar */}
      <header className="flex flex-col w-full px-container-padding py-2 bg-surface dark:bg-surface-dim border-b border-outline-variant dark:border-outline flat no shadows sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-primary dark:text-primary-fixed-dim" style={{ fontVariationSettings: "'FILL' 1" }}>local_gas_station</span>
          <h1 className="text-headline-md font-headline-md font-bold text-primary dark:text-primary-fixed flex-1">Postos Vila</h1>
        </div>
        {/* Stepper */}
        <div className="flex items-center justify-between mt-4 px-2">
          {['Cartões', 'Comb.', 'Venda Posto', 'Resumo'].map((label, i) => (
            <React.Fragment key={label}>
              <div className="flex flex-col items-center">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center mb-1 ${i < 3 ? 'bg-primary text-on-primary' : 'border-2 border-primary text-primary'}`}>
                  {i < 3 ? (
                    <span className="material-symbols-outlined text-[14px]">check</span>
                  ) : (
                    <span className="text-[12px] font-bold">4</span>
                  )}
                </div>
                <span className={`text-[10px] ${i === 3 ? 'font-bold text-primary' : 'text-secondary'}`}>{label}</span>
              </div>
              {i < 3 && <div className="flex-1 h-[2px] bg-primary mx-1" />}
            </React.Fragment>
          ))}
        </div>
      </header>

      <main className="p-container-padding space-y-card-gap max-w-4xl mx-auto w-full">
        <h2 className="text-headline-lg font-headline-lg">Revisão Final</h2>

        {/* Orderly List (Zebra Striped) */}
        <div className="bg-surface-container-lowest border border-outline-variant rounded-lg overflow-hidden shadow-sm">
          <div className="p-4 border-b border-outline-variant bg-surface-container-low font-bold">
            Lançamentos
          </div>
          {lancamentos.length === 0 ? (
            <div className="p-4 text-center text-on-surface-variant">Nenhum valor informado.</div>
          ) : (
            lancamentos.map((item, index) => (
              <div key={index} className={`flex justify-between items-center px-4 py-3 ${index % 2 === 0 ? 'bg-surface-container-lowest' : 'bg-surface-container-low'}`}>
                <span className="text-body-md font-body-md text-on-surface-variant">{item.label}</span>
                <span className="text-label-numeric font-label-numeric">{item.value}</span>
              </div>
            ))
          )}
        </div>

        {/* Summary Totals */}
        <div className="bg-primary-container text-on-primary-container rounded-lg p-4 space-y-3">
          <div className="flex justify-between items-center">
            <span>Total Entradas</span>
            <span className="text-label-numeric font-label-numeric font-bold">{formatCurrency(totals.entradas)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Venda do Posto</span>
            <span className="text-label-numeric font-label-numeric font-bold">{formatCurrency(totals.venda)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span>Sobra informada</span>
            <span className="text-label-numeric font-label-numeric font-bold">{formatCurrency(parseMoney(closing?.sobra))}</span>
          </div>
          <div className="h-px bg-primary/20 w-full"></div>
          <div className="flex justify-between items-center pt-1">
            <span className="font-bold">Sobra calculada</span>
            <span className="text-display-currency font-display-currency">{formatCurrency(totals.diferenca)}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 mt-6">
          <button 
            onClick={handleCopy}
            className="min-h-[48px] bg-primary text-on-primary rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-surface-tint active:scale-95 transition-transform">
            <span className="material-symbols-outlined">content_copy</span>
            Copiar Resumo
          </button>
          <button 
            onClick={onSave}
            className="min-h-[48px] bg-surface-container-high text-on-surface rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-surface-variant active:scale-95 transition-transform">
            <span className="material-symbols-outlined">check_circle</span>
            Dados passados na planilha
          </button>
        </div>
      </main>

      {/* BottomNavBar */}
      <nav className="fixed bottom-0 w-full z-50 flex justify-between items-center px-container-padding py-3 bg-surface-container-lowest dark:bg-surface-container-low rounded-t-xl border-t border-outline-variant shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] shadow-sm">
        <button 
          onClick={onBack}
          className="flex flex-col items-center justify-center bg-primary-container text-on-primary-container rounded-full min-w-[120px] py-2 hover:bg-primary/10 active:scale-95 transition-transform duration-100">
          <span className="material-symbols-outlined">arrow_back</span>
          <span className="text-label-sm font-label-sm mt-1">Voltar</span>
        </button>
        <button className="flex flex-col items-center justify-center text-secondary py-2 min-w-[120px]">
          {/* Invisible placeholder to keep alignment if needed, or remove */}
        </button>
      </nav>

      {/* Toast Notification */}
      <div className={`fixed bottom-24 left-1/2 -translate-x-1/2 bg-inverse-surface text-inverse-on-surface px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 transition-opacity duration-300 pointer-events-none z-50 ${toastVisible ? 'opacity-100' : 'opacity-0'}`}>
        <span className="material-symbols-outlined text-primary-fixed-dim">check_circle</span>
        <span className="text-body-md font-body-md">Copiado para a área de transferência!</span>
      </div>
    </div>
  );
}

# Fechamento de Caixa PWA

PWA mobile para ajudar no fechamento de caixa a partir da notinha do sistema e dos valores que precisam ser passados para a planilha fisica.

## Rodar localmente

```bash
npm install
npm run dev -- --host 0.0.0.0 --port 5174
```

No celular, acesse o IP local do computador na mesma rede Wi-Fi:

```text
http://192.168.18.2:5174/
```

## Testes

Build de producao:

```bash
npm run build
```

Teste OCR com a imagem real de referencia:

```bash
npm run test:ocr
```

Para usar outra imagem no teste OCR:

```bash
OCR_TEST_IMAGE="C:/caminho/para/notinha.jpg" npm run test:ocr
```

## Fluxo do app

- A etapa `Notinha` mostra um campo por vez, focando em dois valores possiveis para somar no campo final da planilha.
- O OCR tenta preencher campos vazios a partir da imagem e preserva valores ja corrigidos manualmente.
- A etapa `Resumo` mostra os valores na ordem da planilha: ELO, Maestro, Visa, ELO, Mastercard, Visa, Abastece Ai, PIX, Nota a Prazo e Sangria.

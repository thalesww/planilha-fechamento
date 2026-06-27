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

Em `http://<IP-da-rede>:5174`, navegadores de celular bloqueiam o acesso a camera por nao ser uma origem segura. Nesse modo, use o fallback de texto do modal de QR Code. Para usar a camera do leitor QR, abra o app em `localhost` no proprio aparelho ou sirva o PWA por HTTPS.

## Testes

Build de producao:

```bash
npm run build
```

Teste OCR com a imagem real de referencia salva em `tests/fixtures/receipt-whatsapp-20260625.jpg`:

```bash
npm run test:ocr
```

Para usar outra imagem no teste OCR, sobrescreva o fixture padrao:

```bash
OCR_TEST_IMAGE="C:/caminho/para/notinha.jpg" npm run test:ocr
```

## OCR remoto

O PWA envia a imagem para o backend principal, nao diretamente para o app Python de OCR:

```env
VITE_OCR_API_URL=https://autoentregabackend.squareweb.app/api
VITE_OCR_API_KEY=chave-configurada-em-OCR_API_KEYS
VITE_OCR_TIMEOUT_MS=20000
```

O backend principal recebe `POST /api/ocr/receipt` e encaminha internamente para o OCRBackend (`https://ocrbackend.squareweb.app`). Se o backend remoto falhar, o app usa o OCR local automaticamente.

## Fluxo do app

- A etapa `Notinha` mostra um campo por vez, focando em dois valores possiveis para somar no campo final da planilha.
- O OCR tenta preencher campos vazios a partir da imagem e preserva valores ja corrigidos manualmente.
- A etapa `Resumo` mostra os valores na ordem da planilha: ELO, Maestro, Visa, ELO, Mastercard, Visa, Abastece Ai, PIX, Nota a Prazo e Sangria.

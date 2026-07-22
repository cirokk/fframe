# Fframe Server

🌐 **[Português](README.md)** · [English](README.en.md)

Servidor auto-hospedado que **recebe vídeos** e os organiza em projetos, com um painel web (PWA)
para assistir, baixar e excluir. A forma principal de enviar é o **Fframe Uploader** (o app deste
repositório), via `POST /_ingest` autenticado por uma *device key*.

> Projeto de estudo/interoperabilidade. Use com apps e contas que você tem direito de usar.

## Rodar

Precisa de Docker + Docker Compose.

```bash
cp .env.example .env      # ajuste PUBLIC_BASE, DATA_DIR, PORT...
docker compose up -d --build
```

Painel: `http://localhost:3260/` (ou o `PUBLIC_BASE` que você definir).
No primeiro acesso você cria **usuário e senha** (guardados como hash, só no servidor).

### Variáveis (.env)

| Variável | Descrição |
|----------|-----------|
| `PORT` | porta publicada no host (padrão 3260) |
| `PUBLIC_BASE` | endereço público do servidor |
| `DATA_DIR` | onde salvar os vídeos no host |
| `CONTAINER_NAME` | nome do container |
| `CHUNK_SIZE` | tamanho de cada pedaço de upload (bytes) |

## Conectar o app Fframe Uploader

No painel, vá em **Dispositivos → Adicionar dispositivo**, dê um nome (ex.: "Celular do João") e
escaneie o QR gerado direto no app — servidor e chave são preenchidos automaticamente. Cada
dispositivo tem sua própria chave e pode ser **revogado individualmente** a qualquer momento, sem
afetar os outros.

## Comentários com timestamp

No player do painel, cada vídeo tem um painel de **comentários ancorados no tempo**: você pausa
no ponto desejado, escreve, e o comentário fica preso àquele instante. Os comentários aparecem
como **marcadores na timeline** (clique pra pular pra aquele ponto), podem ser marcados como
**resolvidos** e excluídos. O card do vídeo mostra um badge 💬 com a contagem. Só quem tem login
no painel comenta. Ficam guardados em `data/comments.json`.

Rotas (todas exigem login): `GET/POST /_api/assets/:id/comments`, `PATCH` (resolver) e
`DELETE /_api/assets/:id/comments/:cid`.

## Idiomas do painel

O painel vem em **português** e **inglês**, com um menu suspenso na tela de login e na barra
lateral (a escolha fica salva no navegador; na primeira visita segue o idioma do navegador).
O app Android continua **só em português**.

Para adicionar um idioma, copie um bloco em `public/i18n.js`, traduza os valores e pronto — o
menu passa a listar a opção sozinho. Chaves que faltarem caem no português.

## Estrutura

- `server.js` — rotas (`/_ingest` do app, `/_api/*` e mídia do painel)
- `lib/store.js` — estado (config, projetos, assets, auth, dispositivos, comentários)
- `public/` — painel web (PWA): `dashboard.html`, `app.css`, `app.js`, `i18n.js` (traduções)
- `data/` — dados em runtime (config, vídeos, logs, dispositivos, `comments.json`) — **não versionado**
- `test-client.js` — simula um envio completo para testar o servidor sem celular

## Segurança

- Painel protegido por login (bcrypt + sessão httpOnly/secure/sameSite).
- **Múltiplos dispositivos, cada um com sua própria chave** (`data/devices.json`), gerados com
  `crypto.randomBytes(24)`. Revogar um dispositivo não afeta os demais.
- Endpoints de dados exigem sessão **ou** uma chave de dispositivo ativa. **Gerenciar dispositivos
  (criar/listar/revogar) exige sessão de admin** — uma chave de dispositivo sozinha não consegue
  criar ou revogar outras chaves. Endpoints do protocolo de câmera (`/oauth2`, `/v2`, `/_upload`)
  ficam abertos por necessidade do protocolo.
- A chave de dispositivo nunca deve ir em query string em fluxos novos (só header
  `X-Device-Key`) — evita vazar em logs de proxy/CDN.
- Nenhum endereço/segredo privado no código — tudo via `.env` e `data/`.

## Licença

MIT

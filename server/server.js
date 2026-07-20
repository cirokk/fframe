// server.js — "Frame.io fake": emula a API do Frame.io (V2) + OAuth2 para que o
// FiLMiC Pro envie os videos gravados para o SEU servidor em vez do Frame.io.
//
// Fluxo que o app faz (descoberto na engenharia reversa do APK 7.6.4):
//   1) OAuth2  -> applications.frame.io/oauth2/auth  e  /oauth2/token   (header Bearer)
//   2) Bootstrap -> descobre conta / projeto / root_asset_id  (GET /v2/me, etc.)
//   3) Criar asset -> POST /v2/assets/{parent}/children {name,type,filetype,filesize}
//                     resposta traz upload_urls[]  (pedacos do arquivo)
//   4) Upload -> PUT em cada upload_url  ->  200 + ETag  ->  asset vira "uploaded"
//
// Como o servidor recebe TANTO applications.frame.io quanto api.frame.io (via DNS),
// tudo roda num Express so; as rotas nao colidem (/oauth2/* vs /v2/*).

const express = require("express");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const store = require("./lib/store");

const PORT = process.env.PORT || 3000;
// Base publica usada para montar as upload_urls. Em producao aponte para o host
// que o app enxerga como api.frame.io (ex.: https://api.frame.io se via DNS, ou o
// dominio proprio). Localmente usa http://<ip>:<porta>.
const PUBLIC_BASE = process.env.PUBLIC_BASE || `http://localhost:${PORT}`;
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 25 * 1024 * 1024); // 25MB por pedaco

const app = express();
app.set("json spaces", 2);
// Atras do Cloudflare Tunnel: confia no proxy p/ detectar HTTPS (cookie secure).
app.set("trust proxy", 1);

// ---- Cabecalhos de seguranca ------------------------------------------------
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  // CSP: tudo do proprio host, sem inline de script. (JS/CSS sao arquivos externos.)
  res.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data:; media-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
  );
  next();
});

// ---- Sessao (cookie assinado, httpOnly, secure via HTTPS, sameSite strict) ---
app.use(session({
  name: "fio.sid",
  secret: store.getSessionSecret(),
  resave: false,
  saveUninitialized: false,
  // Sem maxAge por padrao = cookie de sessao (some ao fechar o navegador).
  // O "Manter conectado" define validade longa (ver applyRemember).
  cookie: { httpOnly: true, secure: "auto", sameSite: "strict" },
}));
// "Manter conectado": marcado -> cookie dura 30 dias; desmarcado -> so a sessao.
function applyRemember(req) {
  if (req.body && req.body.remember) req.session.cookie.maxAge = 30 * 24 * 3600 * 1000;
  else req.session.cookie.expires = false;
}

// ---- Anti forca-bruta simples (por IP) --------------------------------------
const authAttempts = new Map();
function authRate(req, res, next) {
  const ip = req.ip || "?";
  const now = Date.now();
  const rec = authAttempts.get(ip) || { n: 0, t: now };
  if (now - rec.t > 15 * 60 * 1000) { rec.n = 0; rec.t = now; }
  rec.n++;
  authAttempts.set(ip, rec);
  if (rec.n > 10) return res.status(429).json({ error: "Muitas tentativas. Aguarde alguns minutos." });
  next();
}
// Exige login (validado no SERVIDOR — o frontend nao decide nada).
function requireAuth(req, res, next) {
  if (req.session && req.session.authed) return next();
  // Alternativa p/ o app: autenticacao por device key (header OU ?key= p/ player nativo).
  // Aceita qualquer chave ATIVA de data/devices.json (revogada = 401).
  const key = req.headers["x-device-key"] || req.query.key;
  const dev = store.findDeviceByKey(key);
  if (dev) { req.device = dev; return next(); }
  res.status(401).json({ error: "nao autenticado" });
}

// So sessao de admin (painel) -- NAO aceita device key. Usado nas rotas que
// gerenciam os proprios dispositivos: um celular pareado nao pode criar ou
// revogar chaves de outros dispositivos.
function requireAdminSession(req, res, next) {
  if (req.session && req.session.authed && !req.device) return next();
  res.status(401).json({ error: "requer login no painel" });
}

// ---- LOG de tudo (nossa janela de depuracao) --------------------------------
// Registra cada request que o app faz. E assim que a gente descobre se falta
// implementar algum endpoint: aparece aqui no console e no arquivo de log.
const LOG_FILE = path.join(store.DATA_DIR, "requests.log");
function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  try { fs.appendFileSync(LOG_FILE, msg + "\n"); } catch {}
}

app.use((req, res, next) => {
  const host = req.headers.host || "?";
  const auth = req.headers.authorization ? " (Bearer)" : "";
  log(`--> ${req.method} ${host}${req.originalUrl}${auth}`);
  next();
});

// Body parsers. IMPORTANTE: nao aplicar nos PUT de upload (binarios grandes).
// Token OAuth costuma vir form-urlencoded; as chamadas /v2 vem JSON. Alguns
// clientes esquecem o Content-Type, entao tratamos "sem content-type" como JSON.
app.use((req, res, next) => {
  if (req.method === "PUT" && req.path.startsWith("/_upload/")) return next();
  if (req.method === "POST" && req.path === "/_ingest") return next(); // video binario do app
  const ct = (req.headers["content-type"] || "").toLowerCase();
  if (ct.includes("urlencoded")) {
    return express.urlencoded({ extended: true })(req, res, next);
  }
  // JSON tolerante: parseia application/json E tambem body sem content-type.
  return express.json({ type: () => true, limit: "10mb" })(req, res, (err) => {
    if (err) req.body = {}; // se nao for JSON valido, segue com body vazio
    next();
  });
});

// =============================================================================
// 1) OAUTH2  (host: applications.frame.io)
// =============================================================================

// GET /oauth2/auth -> auto-aprova e redireciona de volta pro app com um "code".
// Frame.io real mostraria tela de login; aqui aprovamos na hora.
app.get("/oauth2/auth", (req, res) => {
  const { redirect_uri, state } = req.query;
  if (!redirect_uri) return res.status(400).send("missing redirect_uri");
  const code = store.issueAuthCode(String(redirect_uri));
  const sep = String(redirect_uri).includes("?") ? "&" : "?";
  let url = `${redirect_uri}${sep}code=${encodeURIComponent(code)}`;
  if (state) url += `&state=${encodeURIComponent(String(state))}`;
  log(`    OAuth auto-aprovado -> redirect ${url}`);
  res.redirect(302, url);
});

// POST /oauth2/token -> troca o code (ou refresh) por um access_token Bearer.
app.post("/oauth2/token", (req, res) => {
  const grant = req.body.grant_type;
  log(`    token grant_type=${grant}`);
  const { access_token, refresh_token } = store.issueToken();
  res.json({
    access_token,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token,
    scope: req.body.scope || "offline",
  });
});

// =============================================================================
// 2) BOOTSTRAP  (host: api.frame.io) — conta / time / projeto / root asset
// =============================================================================
const cfg = store.config;

function userPayload() {
  return {
    id: cfg.user.id,
    name: cfg.user.name,
    email: cfg.user.email,
    account_id: cfg.account.id,
    account: accountPayload(),
    role: "admin",
    created_at: cfg.user.created_at,
  };
}
function accountPayload() {
  return {
    id: cfg.account.id,
    display_name: cfg.account.display_name,
    name: cfg.account.name,
    plan: cfg.account.plan,
    account_id: cfg.account.id,
  };
}
function teamPayload() {
  return {
    id: cfg.team.id,
    name: cfg.team.name,
    account_id: cfg.account.id,
    project_count: 1,
  };
}
function projectPayload(p) {
  p = p || store.getConnectedProject();
  return {
    id: p.id,
    name: p.name,
    root_asset_id: p.root_asset_id,
    team_id: cfg.team.id,
    account_id: cfg.account.id,
  };
}
const allProjectsPayload = () => store.listProjects().map((p) => projectPayload(p));

// ---- API de DISPOSITIVOS (Camera to Cloud) — descoberta observando o app real.
// O FiLMiC conecta como um "device" C2C e busca a conta/projeto por aqui.
const DEVICE_ID = cfg.device ? cfg.device.id : cfg.user.id;
function devicePayload() {
  const p = store.getConnectedProject();
  return {
    id: DEVICE_ID,
    name: "FiLMiC Pro",
    type: "device",
    status: "connected",
    connected: true,
    account_id: cfg.account.id,
    account: accountPayload(),
    accounts: [accountPayload()],
    root_asset_id: p.root_asset_id,
    project: projectPayload(p),
  };
}
app.get("/v2/devices/me", (req, res) => res.json(devicePayload()));
app.get("/v2/devices/accounts", (req, res) => res.json([accountPayload()]));
app.get("/v2/devices/accounts/:id", (req, res) => res.json(accountPayload()));
app.get("/v2/devices/accounts/:id/projects", (req, res) => res.json(allProjectsPayload()));
app.get("/v2/devices/accounts/:id/teams", (req, res) => res.json([teamPayload()]));
app.get("/v2/devices/projects", (req, res) => res.json(allProjectsPayload()));
app.get("/v2/devices/projects/:id", (req, res) => res.json(projectPayload(store.getProject(req.params.id))));
app.get("/v2/devices/teams", (req, res) => res.json([teamPayload()]));
app.post("/v2/devices/assets", handleCreateAsset);
app.post("/v2/devices/assets/:parentId/children", handleCreateAsset);

// Conecta o dispositivo a um projeto (passo obrigatorio antes do upload real).
// Guarda qual projeto foi escolhido para associar os videos que vierem depois.
app.post("/v2/devices/connect", (req, res) => {
  const projectId = req.query.project_id || store.getConnectedProject().id;
  store.setConnectedProject(projectId);
  const p = store.getProject(projectId) || store.getConnectedProject();
  log(`    DEVICE conectado ao projeto "${p.name}" (${projectId})`);
  res.status(200).json({
    ...devicePayload(),
    project_id: projectId,
    status: "connected",
    connected: true,
  });
});
app.post("/v2/devices/disconnect", (req, res) => res.status(200).json({ status: "disconnected" }));
app.post("/v2/devices/heartbeat", (req, res) => res.status(200).json({ status: "ok", connected: true }));
app.get("/v2/devices/heartbeat", (req, res) => res.status(200).json({ status: "ok", connected: true }));

app.get("/v2/me", (req, res) => res.json(userPayload()));
app.get("/v2/users/me", (req, res) => res.json(userPayload()));
app.get("/v2/accounts", (req, res) => res.json([accountPayload()]));
app.get("/v2/accounts/:id", (req, res) => res.json(accountPayload()));
app.get("/v2/accounts/:id/teams", (req, res) => res.json([teamPayload()]));
app.get("/v2/teams", (req, res) => res.json([teamPayload()]));
app.get("/v2/teams/:id", (req, res) => res.json(teamPayload()));
app.get("/v2/teams/:id/projects", (req, res) => res.json(allProjectsPayload()));
app.get("/v2/accounts/:id/projects", (req, res) => res.json(allProjectsPayload()));
app.get("/v2/projects", (req, res) => res.json(allProjectsPayload()));
app.get("/v2/projects/:id", (req, res) => res.json(projectPayload(store.getProject(req.params.id))));

// =============================================================================
// 3) CRIAR ASSET  — o app anuncia um video e recebe as upload_urls
// =============================================================================
function assetResponse(a) {
  const urls = [];
  for (let i = 0; i < a.expected_parts; i++) {
    urls.push(`${PUBLIC_BASE}/_upload/${a.id}/${i}`);
  }
  // O parser do app (org.json) EXIGE todos estes campos, senao quebra e nao
  // faz o upload: id, project_id, name, account_id, creator_id, team_id,
  // status, type, filesize (numero/long), filetype, upload_urls (array).
  return {
    id: a.id,
    parent_id: a.parent_id,
    project_id: a.project_id,
    account_id: cfg.account.id,
    creator_id: cfg.user.id,
    team_id: cfg.team.id,
    name: a.name,
    type: a.type,
    filetype: a.filetype,
    filesize: a.filesize,
    status: a.status,
    upload_url: urls[0],
    upload_urls: urls,
    is_hls_required: false,
    created_at: a.created_at,
  };
}

// Descobre a qual projeto o video pertence: pelo corpo (parent_id/project_id),
// pela rota, ou pelo projeto atualmente conectado (o que o usuario escolheu no app).
function resolveProject(req) {
  const b = req.body || {};
  if (b.parent_id) { const p = store.getProjectByRoot(b.parent_id); if (p) return p; }
  if (b.project_id) { const p = store.getProject(b.project_id); if (p) return p; }
  if (req.params.parentId) { const p = store.getProjectByRoot(req.params.parentId); if (p) return p; }
  return store.getConnectedProject();
}

function handleCreateAsset(req, res) {
  const proj = resolveProject(req);
  const { name, filetype, filesize } = req.body || {};
  const parts = Number(req.query.parts) || 0; // o app diz quantos pedacos quer
  const asset = store.createAsset({ projectId: proj.id, name, filetype, filesize, chunkSize: CHUNK_SIZE, parts });
  log(`    ASSET criado: "${asset.name}" ${asset.filesize} bytes -> ${asset.expected_parts} pedaco(s)  projeto="${proj.name}"  id=${asset.id}`);
  res.status(201).json(assetResponse(asset));
}

app.post("/v2/assets/:parentId/children", handleCreateAsset);
app.post("/v2/assets", handleCreateAsset);

app.get("/v2/assets/:id", (req, res) => {
  const a = store.getAsset(req.params.id);
  if (!a) return res.status(404).json({ message: "asset not found" });
  res.json(assetResponse(a));
});

// =============================================================================
// 4) UPLOAD dos pedacos  (PUT binario, sem Bearer — igual presigned S3)
// =============================================================================
app.put("/_upload/:id/:part", (req, res) => {
  const { id } = req.params;
  const part = Number(req.params.part);
  const asset = store.getAsset(id);
  if (!asset) return res.status(404).end();

  // IDEMPOTENTE: se o video ja foi recebido por inteiro, uma retentativa do app
  // nao deve dar erro. Consome o corpo e responde 200 -> o app marca como enviado.
  if (asset.status === "uploaded") {
    req.on("data", () => {});
    req.on("end", () => { res.set("ETag", asset.etag || '"done"'); res.status(200).end(); });
    req.on("error", () => { try { res.status(200).end(); } catch {} });
    return;
  }

  // Garante que a pasta dos pedacos exista (evita ENOENT em retentativas).
  fs.mkdirSync(path.join(store.PARTS_DIR, id), { recursive: true });
  const out = fs.createWriteStream(store.partPath(id, part));
  const hash = crypto.createHash("md5");
  let bytes = 0;

  req.on("data", (chunk) => { hash.update(chunk); bytes += chunk.length; });
  req.pipe(out);

  out.on("finish", () => {
    store.markPartReceived(id, part);
    const etag = `"${hash.digest("hex")}"`;
    asset.etag = etag; // guardado p/ responder retentativas
    log(`    UPLOAD parte ${part} de ${asset.name}: ${bytes} bytes (etag ${etag.slice(1, 9)})`);
    maybeAssemble(asset);
    res.set("ETag", etag);
    res.status(200).end();
  });
  out.on("error", (e) => { log(`    ERRO gravando parte: ${e.message}`); res.status(500).end(); });
});

// Quando todos os pedacos chegam, junta tudo no arquivo final, organizado em
// uploads/<projeto>/<data>/<arquivo>.
function maybeAssemble(asset) {
  const a = store.getAsset(asset.id);
  if (!a || a.status === "uploaded") return;
  if (a.received_parts.length < a.expected_parts) return;

  const finalPath = store.finalPathFor(a);
  const outStream = fs.createWriteStream(finalPath);

  const writeNext = (i) => {
    if (i >= a.expected_parts) {
      outStream.end(() => {
        store.markUploaded(a.id, finalPath);
        log(`    >>> VIDEO COMPLETO: ${finalPath}`);
      });
      return;
    }
    const rs = fs.createReadStream(store.partPath(a.id, i));
    rs.pipe(outStream, { end: false });
    rs.on("end", () => writeNext(i + 1));
    rs.on("error", (e) => log(`    ERRO juntando parte ${i}: ${e.message}`));
  };
  writeNext(0);
}

// =============================================================================
// UTIL / DEBUG
// =============================================================================

app.get("/api/health", (req, res) => res.json({ ok: true, service: "fframe-server" }));

// ---- Tela / arquivos estaticos (SEM segredos: so HTML/CSS/JS publicos) -------
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/favicon.ico", (req, res) => res.status(204).end());
// PWA: service worker (escopo raiz) e manifest, publicos e sem segredo.
app.get("/sw.js", (req, res) => {
  res.set("Content-Type", "application/javascript; charset=utf-8");
  res.set("Cache-Control", "no-cache");
  res.set("Service-Worker-Allowed", "/");
  res.sendFile(path.join(__dirname, "public", "sw.js"));
});
app.get("/manifest.webmanifest", (req, res) => {
  res.set("Content-Type", "application/manifest+json; charset=utf-8");
  res.sendFile(path.join(__dirname, "public", "manifest.webmanifest"));
});
app.use(express.static(path.join(__dirname, "public"), { index: false }));

// ---- AUTENTICACAO (credenciais e hash SO no servidor) -----------------------
app.get("/_auth/status", (req, res) =>
  res.json({ configured: store.isConfigured(), authed: !!(req.session && req.session.authed) }));

// Primeiro acesso: o usuario define login+senha direto no navegador (via HTTPS).
app.post("/_auth/setup", authRate, async (req, res) => {
  if (store.isConfigured()) return res.status(409).json({ error: "ja configurado" });
  const user = String((req.body && req.body.user) || "").trim();
  const password = String((req.body && req.body.password) || "");
  if (user.length < 3 || password.length < 6)
    return res.status(400).json({ error: "usuario (min 3) e senha (min 6 caracteres) obrigatorios" });
  const hash = await bcrypt.hash(password, 12);
  store.setAuth(user, hash);
  req.session.authed = true; req.session.user = user;
  applyRemember(req);
  log(`    ADMIN configurado: ${user}`);
  res.json({ ok: true });
});

app.post("/_auth/login", authRate, async (req, res) => {
  const auth = store.getAuth();
  const user = String((req.body && req.body.user) || "");
  const password = String((req.body && req.body.password) || "");
  const ok = !!auth && user === auth.user && (await bcrypt.compare(password, auth.hash));
  if (!ok) return res.status(401).json({ error: "credenciais invalidas" }); // generico de proposito
  req.session.authed = true; req.session.user = auth.user;
  applyRemember(req);
  res.json({ ok: true });
});

app.post("/_auth/logout", (req, res) => req.session.destroy(() => res.json({ ok: true })));

// Login automatico do app (WebView) via device key -> abre o painel ja logado.
// Qualquer dispositivo ATIVO de devices.json serve; revogado nao loga.
app.get("/_devicelogin", (req, res) => {
  const dev = store.findDeviceByKey(req.query.key || "");
  if (dev) {
    req.session.authed = true;
    req.session.user = "device:" + dev.name;
    req.session.cookie.maxAge = 30 * 24 * 3600 * 1000;
  }
  res.redirect("/");
});

// ---- API do painel — TUDO exige login (checado no SERVIDOR) -----------------
app.get("/_api/projects", requireAuth, (req, res) => {
  const connId = store.getConnectedProject().id;
  const all = Object.values(store.assets());
  res.json(store.listProjects().map((p) => ({
    ...p,
    connected: p.id === connId,
    video_count: all.filter((a) => a.project_id === p.id && a.status === "uploaded").length,
  })));
});
app.post("/_api/projects", requireAuth, (req, res) => {
  const name = (req.body && req.body.name) || "";
  if (!String(name).trim()) return res.status(400).json({ error: "nome obrigatorio" });
  res.status(201).json(store.createProject(name));
});
app.delete("/_api/projects/:id", requireAuth, (req, res) => {
  const ok = store.deleteProject(req.params.id);
  res.status(ok ? 200 : 400).json({ ok, error: ok ? undefined : "nao pode remover (ultimo projeto ou inexistente)" });
});
app.get("/_api/assets", requireAuth, (req, res) => {
  const projectId = req.query.project;
  let list = Object.values(store.assets()).filter((a) => a.status === "uploaded");
  if (projectId) list = list.filter((a) => a.project_id === projectId);
  list = list
    .map((a) => ({
      id: a.id, name: a.name, project_id: a.project_id, project_name: a.project_name,
      filesize: a.filesize, filetype: a.filetype, device_name: a.device_name,
      uploaded_at: a.uploaded_at || a.created_at,
      date: (a.uploaded_at || a.created_at || "").slice(0, 10),
    }))
    .sort((x, y) => String(y.uploaded_at).localeCompare(String(x.uploaded_at)));
  res.json(list);
});
// Excluir video (apaga o arquivo do disco tambem)
app.delete("/_api/assets/:id", requireAuth, (req, res) => {
  const a = store.getAsset(req.params.id);
  const ok = store.deleteAsset(req.params.id);
  if (ok) log(`    VIDEO EXCLUIDO: "${a && a.name}" (${req.params.id})`);
  res.status(ok ? 200 : 404).json({ ok });
});

// JSON cru (compatibilidade) — tambem protegido
app.get("/_status", requireAuth, (req, res) => {
  const list = Object.values(store.assets()).map((a) => ({
    name: a.name, project: a.project_name, filesize: a.filesize, status: a.status,
    parts: `${a.received_parts.length}/${a.expected_parts}`, id: a.id,
  }));
  res.json({ projects: store.listProjects(), count: list.length, assets: list });
});

// ---- Streaming e download de video (exige login) ----------------------------
app.get("/_media/:id", requireAuth, (req, res) => {
  const a = store.getAsset(req.params.id);
  if (!a || !a.stored_path || !fs.existsSync(a.stored_path)) return res.status(404).end();
  const stat = fs.statSync(a.stored_path);
  const type = a.filetype && a.filetype.startsWith("video") ? a.filetype : "video/mp4";
  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range) || [];
    const start = parseInt(m[1] || "0", 10);
    const end = m[2] ? parseInt(m[2], 10) : stat.size - 1;
    res.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stat.size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": end - start + 1,
      "Content-Type": type,
    });
    fs.createReadStream(a.stored_path, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Length": stat.size, "Content-Type": type, "Accept-Ranges": "bytes" });
    fs.createReadStream(a.stored_path).pipe(res);
  }
});
app.get("/_download/:id", requireAuth, (req, res) => {
  const a = store.getAsset(req.params.id);
  if (!a || !a.stored_path || !fs.existsSync(a.stored_path)) return res.status(404).end();
  res.download(a.stored_path, a.name);
});

// ---- Ingest do app Fframe Uploader (autenticado por device key) -------------
// Recebe o video inteiro no corpo. Sem Bearer/sessao: valida a X-Device-Key.
app.post("/_ingest", (req, res) => {
  const key = req.headers["x-device-key"] || "";
  const dev = store.findDeviceByKey(key); // qualquer dispositivo ATIVO; revogado = 401
  if (!dev) return res.status(401).json({ error: "device key invalida" });
  const name = req.query.name || "video.mp4";
  const filetype = req.headers["content-type"] || "video/mp4";
  const projectId = req.query.project;
  let bytes = 0;
  let responded = false;
  store.ingestAsset(
    { name, filetype, projectId, deviceName: dev.name },
    (finalPath, onDone) => {
      const out = fs.createWriteStream(finalPath);
      req.on("data", (c) => { bytes += c.length; });
      req.pipe(out);
      out.on("finish", () => onDone(bytes));
      out.on("error", (e) => { log(`    ERRO ingest: ${e.message}`); if (!responded) { responded = true; res.status(500).json({ ok: false }); } });
    },
    (asset) => {
      log(`    INGEST (app): "${asset.name}" ${asset.filesize} bytes projeto="${asset.project_name}" dispositivo="${dev.name}"`);
      if (!responded) { responded = true; res.status(201).json({ ok: true, id: asset.id, name: asset.name }); }
    }
  );
});

// Chave do dispositivo para configurar o app (mostrada no painel, exige login).
// LEGADO: devolve a primeira chave ativa (compatibilidade com clientes antigos).
app.get("/_api/device-key", requireAuth, (req, res) => {
  const active = store.listDevices().filter((d) => !d.revoked_at);
  res.json({ key: active.length ? active[0].key : store.getDeviceKey() });
});

// ---- Dispositivos (multiplos, nomeados, revogaveis) — exige login -----------
app.get("/_api/devices", requireAdminSession, (req, res) => res.json(store.listDevices()));
app.post("/_api/devices", requireAdminSession, (req, res) => {
  const name = String((req.body && req.body.name) || "").trim();
  if (!name) return res.status(400).json({ error: "nome obrigatorio" });
  const d = store.createDevice(name);
  log(`    DISPOSITIVO criado: "${d.name}" (${d.id})`);
  res.status(201).json(d);
});
app.delete("/_api/devices/:id", requireAdminSession, (req, res) => {
  const ok = store.revokeDevice(req.params.id);
  if (ok) log(`    DISPOSITIVO revogado: ${req.params.id}`);
  res.status(ok ? 200 : 404).json({ ok, error: ok ? undefined : "dispositivo inexistente ou ja revogado" });
});

// Catch-all: qualquer rota que o app chame e a gente ainda nao implementou
// aparece aqui LOGADA, pra sabermos exatamente o que falta.
app.use((req, res) => {
  log(`    !!! ROTA NAO IMPLEMENTADA: ${req.method} ${req.originalUrl}  body=${JSON.stringify(req.body || {})}`);
  res.status(404).json({ message: "not implemented (logged)", path: req.originalUrl });
});

app.listen(PORT, "0.0.0.0", () => {
  log(`Fframe Server ouvindo na porta ${PORT}`);
  log(`  PUBLIC_BASE = ${PUBLIC_BASE}`);
  log(`  Projetos: ${store.listProjects().map((p) => p.name).join(", ")}`);
  log(`  Painel:  ${PUBLIC_BASE}/`);
});

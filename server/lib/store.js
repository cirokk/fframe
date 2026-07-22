// store.js — estado do servidor: config estavel, PROJETOS, tokens e assets.
// Videos finais sao organizados em: uploads/<projeto>/<AAAA-MM-DD>/<arquivo>.

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "..", "data");
const UPLOADS_DIR = path.join(DATA_DIR, "uploads");
const PARTS_DIR = path.join(UPLOADS_DIR, ".parts"); // pedacos temporarios
const CONFIG_FILE = path.join(DATA_DIR, "config.json");
const ASSETS_FILE = path.join(DATA_DIR, "assets.json");
const PROJECTS_FILE = path.join(DATA_DIR, "projects.json");
const AUTH_FILE = path.join(DATA_DIR, "auth.json"); // { user, hash } — nunca vai pro frontend
const SECRET_FILE = path.join(DATA_DIR, ".session-secret");
const DEVICE_KEY_FILE = path.join(DATA_DIR, "device-key.txt"); // chave legada (unica) do app Fframe Uploader
const DEVICES_FILE = path.join(DATA_DIR, "devices.json"); // dispositivos nomeados/revogaveis
const COMMENTS_FILE = path.join(DATA_DIR, "comments.json"); // comentarios com timestamp por video

fs.mkdirSync(PARTS_DIR, { recursive: true });

const uuid = () => crypto.randomUUID();
function slug(s) {
  return (
    String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "projeto"
  );
}

// ---- Config estavel (conta/time/projeto padrao) -----------------------------
function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  const now = new Date().toISOString();
  const cfg = {
    user: { id: uuid(), name: "Wave C2C", email: "c2c@wave.local", created_at: now },
    account: { id: uuid(), display_name: "Wave", name: "Wave", plan: "enterprise" },
    team: { id: uuid(), name: "Wave Team" },
    project: { id: uuid(), name: "C2C Uploads", root_asset_id: uuid() },
    created_at: now,
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  return cfg;
}
const config = loadConfig();

// ---- PROJETOS ---------------------------------------------------------------
let projects = [];
function persistProjects() { fs.writeFileSync(PROJECTS_FILE, JSON.stringify(projects, null, 2)); }
function loadProjects() {
  if (fs.existsSync(PROJECTS_FILE)) {
    projects = JSON.parse(fs.readFileSync(PROJECTS_FILE, "utf8"));
  } else {
    // Semente: o projeto padrao do config (mantem selecao atual do app valida).
    projects = [{
      id: config.project.id, name: config.project.name,
      root_asset_id: config.project.root_asset_id, created_at: config.created_at,
    }];
    persistProjects();
  }
}
loadProjects();

const listProjects = () => projects;
const getProject = (id) => projects.find((p) => p.id === id);
const getProjectByRoot = (root) => projects.find((p) => p.root_asset_id === root);
function createProject(name) {
  const p = { id: uuid(), name: (name || "Novo Projeto").trim(), root_asset_id: uuid(), created_at: new Date().toISOString() };
  projects.push(p);
  persistProjects();
  return p;
}
function deleteProject(id) {
  const i = projects.findIndex((p) => p.id === id);
  if (i >= 0 && projects.length > 1) { projects.splice(i, 1); persistProjects(); return true; }
  return false;
}

// Projeto "conectado" no momento (ultimo /v2/devices/connect vence).
let connectedProjectId = config.project.id;
const setConnectedProject = (id) => { if (getProject(id)) connectedProjectId = id; };
const getConnectedProject = () => getProject(connectedProjectId) || projects[0];

// ---- Tokens OAuth -----------------------------------------------------------
const authCodes = new Map();
const tokens = new Map();
function issueAuthCode(redirect_uri) {
  const code = crypto.randomBytes(24).toString("hex");
  authCodes.set(code, { redirect_uri, createdAt: Date.now() });
  return code;
}
function redeemAuthCode(code) { const e = authCodes.get(code); if (e) authCodes.delete(code); return e; }
function issueToken() {
  const access_token = crypto.randomBytes(32).toString("hex");
  const refresh_token = crypto.randomBytes(32).toString("hex");
  tokens.set(access_token, { createdAt: Date.now() });
  return { access_token, refresh_token };
}

// ---- Assets (videos) --------------------------------------------------------
let assets = {};
if (fs.existsSync(ASSETS_FILE)) {
  try { assets = JSON.parse(fs.readFileSync(ASSETS_FILE, "utf8")); } catch { assets = {}; }
}
function persistAssets() { fs.writeFileSync(ASSETS_FILE, JSON.stringify(assets, null, 2)); }

function createAsset({ projectId, name, filetype, filesize, chunkSize, parts: partsOverride }) {
  const proj = getProject(projectId) || getConnectedProject();
  const id = uuid();
  const size = Number(filesize) || 0;
  // Respeita o numero de pedacos que o app pediu; senao calcula pelo tamanho.
  const parts = partsOverride > 0 ? partsOverride : (size > 0 ? Math.max(1, Math.ceil(size / chunkSize)) : 1);
  const asset = {
    id, project_id: proj.id, project_name: proj.name, parent_id: proj.root_asset_id,
    name: name || "clip", type: "file", filetype: filetype || "application/octet-stream",
    filesize: size, expected_parts: parts, received_parts: [], status: "created",
    created_at: new Date().toISOString(),
  };
  assets[id] = asset;
  fs.mkdirSync(path.join(PARTS_DIR, id), { recursive: true });
  persistAssets();
  return asset;
}
const getAsset = (id) => assets[id];

// ---- Comentarios com timestamp (revisao no painel) --------------------------
// data/comments.json: { <assetId>: [ { id, t, text, author, created_at, resolved } ] }
// `t` = segundos no video (float). Ordenados por tempo na leitura.
let comments = {};
if (fs.existsSync(COMMENTS_FILE)) {
  try { comments = JSON.parse(fs.readFileSync(COMMENTS_FILE, "utf8")); } catch { comments = {}; }
}
function persistComments() { fs.writeFileSync(COMMENTS_FILE, JSON.stringify(comments, null, 2)); }

const listComments = (assetId) => (comments[assetId] || []).slice().sort((a, b) => a.t - b.t);
const countComments = (assetId) => (comments[assetId] || []).length;
function addComment(assetId, { t, tEnd, parentId, text, author }) {
  const clean = String(text || "").trim().slice(0, 2000);
  if (!clean) return null;
  const list = comments[assetId] || (comments[assetId] = []);
  // Resposta: herda o tempo do comentario-pai; so aceita pai valido do mesmo video.
  const parent = parentId ? list.find((x) => x.id === parentId && !x.parent_id) : null;
  const inT = parent ? parent.t : Math.max(0, Number(t) || 0);
  let outT = null;
  if (!parent && tEnd != null && Number(tEnd) > inT + 0.05) outT = Number(tEnd);
  const c = {
    id: uuid(),
    t: inT,
    t_end: outT,                                   // trecho (in/out); null = ponto unico
    parent_id: parent ? parent.id : null,          // resposta aninhada
    text: clean,
    author: (String(author || "").trim().slice(0, 120)) || null,
    created_at: new Date().toISOString(),
    resolved: false,
  };
  list.push(c);
  persistComments();
  return c;
}
function deleteComment(assetId, commentId) {
  const list = comments[assetId];
  if (!list) return false;
  const i = list.findIndex((c) => c.id === commentId);
  if (i < 0) return false;
  list.splice(i, 1);
  // Apagar um comentario-pai remove tambem as respostas dele.
  for (let j = list.length - 1; j >= 0; j--) if (list[j].parent_id === commentId) list.splice(j, 1);
  if (!list.length) delete comments[assetId];
  persistComments();
  return true;
}
function setCommentResolved(assetId, commentId, resolved) {
  const c = (comments[assetId] || []).find((x) => x.id === commentId);
  if (!c) return false;
  c.resolved = !!resolved;
  persistComments();
  return true;
}

function markPartReceived(id, partIndex) {
  const a = assets[id]; if (!a) return;
  if (!a.received_parts.includes(partIndex)) a.received_parts.push(partIndex);
  a.status = "uploading"; persistAssets();
}
const partPath = (id, i) => path.join(PARTS_DIR, id, `part_${i}`);

// Caminho final unico: uploads/<projeto>/<data>/<arquivo>
function finalPathFor(asset) {
  const date = new Date().toISOString().slice(0, 10);
  const dir = path.join(UPLOADS_DIR, slug(asset.project_name), date);
  fs.mkdirSync(dir, { recursive: true });
  const safe = (asset.name || "clip.mov").replace(/[^a-zA-Z0-9._-]/g, "_");
  let p = path.join(dir, safe);
  if (fs.existsSync(p)) {
    const ext = path.extname(safe), base = path.basename(safe, ext);
    p = path.join(dir, `${base}_${asset.id.slice(0, 6)}${ext}`);
  }
  return p;
}
function markUploaded(id, finalPath) {
  const a = assets[id]; if (!a) return;
  a.status = "uploaded"; a.stored_path = finalPath;
  a.uploaded_at = new Date().toISOString();
  // limpa pedacos temporarios
  try { fs.rmSync(path.join(PARTS_DIR, id), { recursive: true, force: true }); } catch {}
  persistAssets();
}

// ---- Autenticacao (credenciais SO no servidor) ------------------------------
function getSessionSecret() {
  if (fs.existsSync(SECRET_FILE)) return fs.readFileSync(SECRET_FILE, "utf8").trim();
  const s = crypto.randomBytes(48).toString("hex");
  try { fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 }); } catch { fs.writeFileSync(SECRET_FILE, s); }
  return s;
}
const getAuth = () => (fs.existsSync(AUTH_FILE) ? JSON.parse(fs.readFileSync(AUTH_FILE, "utf8")) : null);
const isConfigured = () => fs.existsSync(AUTH_FILE);
function setAuth(user, hash) {
  const data = JSON.stringify({ user, hash, created_at: new Date().toISOString() }, null, 2);
  try { fs.writeFileSync(AUTH_FILE, data, { mode: 0o600 }); } catch { fs.writeFileSync(AUTH_FILE, data); }
}

// ---- Chave do dispositivo (app Fframe Uploader) -----------------------------
function getDeviceKey() {
  if (fs.existsSync(DEVICE_KEY_FILE)) return fs.readFileSync(DEVICE_KEY_FILE, "utf8").trim();
  const k = crypto.randomBytes(24).toString("hex");
  try { fs.writeFileSync(DEVICE_KEY_FILE, k, { mode: 0o600 }); } catch { fs.writeFileSync(DEVICE_KEY_FILE, k); }
  return k;
}

// ---- Dispositivos (multiplos, nomeados e revogaveis) ------------------------
// data/devices.json: [{ id, name, key, created_at, revoked_at }]
// Revogar NAO apaga: so marca revoked_at (mantem historico/auditoria).
let devices = [];
function persistDevices() {
  const data = JSON.stringify(devices, null, 2);
  try { fs.writeFileSync(DEVICES_FILE, data, { mode: 0o600 }); } catch { fs.writeFileSync(DEVICES_FILE, data); }
}
function loadDevices() {
  if (fs.existsSync(DEVICES_FILE)) {
    try { devices = JSON.parse(fs.readFileSync(DEVICES_FILE, "utf8")); } catch { devices = []; }
    if (!Array.isArray(devices)) devices = [];
    return;
  }
  devices = [];
  // MIGRACAO: a chave unica antiga (device-key.txt) vira o primeiro dispositivo.
  // Ela TEM que continuar valida — o celular do dono ja esta configurado com ela.
  if (fs.existsSync(DEVICE_KEY_FILE)) {
    const legacy = fs.readFileSync(DEVICE_KEY_FILE, "utf8").trim();
    if (legacy) {
      devices.push({
        id: uuid(), name: "Dispositivo principal", key: legacy,
        created_at: new Date().toISOString(), revoked_at: null,
      });
    }
  }
  persistDevices();
}
loadDevices();

const listDevices = () => devices;
function createDevice(name) {
  const d = {
    id: uuid(),
    name: String(name || "").trim() || "Dispositivo",
    key: crypto.randomBytes(24).toString("hex"),
    created_at: new Date().toISOString(),
    revoked_at: null,
  };
  devices.push(d);
  persistDevices();
  return d;
}
function revokeDevice(id) {
  const d = devices.find((x) => x.id === id);
  if (!d || d.revoked_at) return false;
  d.revoked_at = new Date().toISOString();
  persistDevices();
  return true;
}
// So dispositivos ATIVOS autenticam. Retorna o device (com nome) ou null.
function findDeviceByKey(key) {
  if (!key) return null;
  return devices.find((d) => d.key === key && !d.revoked_at) || null;
}

// Recebe um video ja completo (upload direto do app), grava e cataloga.
// Retorna o objeto asset. `writeStream(finalPath)` faz a gravacao do corpo.
function ingestAsset({ name, filetype, projectId, deviceName }, writeFn, done) {
  const proj = getProject(projectId) || getConnectedProject();
  const id = uuid();
  const asset = {
    id, project_id: proj.id, project_name: proj.name, parent_id: proj.root_asset_id,
    name: name || "video.mp4", type: "file", filetype: filetype || "video/mp4",
    filesize: 0, expected_parts: 1, received_parts: [0], status: "uploading",
    created_at: new Date().toISOString(), source: "fframe-app",
    device_name: deviceName || undefined,
  };
  assets[id] = asset;
  persistAssets();
  const finalPath = finalPathFor(asset);
  writeFn(finalPath, (bytes) => {
    asset.filesize = bytes;
    markUploaded(id, finalPath);
    done(asset);
  });
  return asset;
}

// ---- Excluir video ----------------------------------------------------------
function deleteAsset(id) {
  const a = assets[id];
  if (!a) return false;
  if (a.stored_path) { try { fs.unlinkSync(a.stored_path); } catch {} }
  try { fs.rmSync(path.join(PARTS_DIR, id), { recursive: true, force: true }); } catch {}
  delete assets[id];
  persistAssets();
  if (comments[id]) { delete comments[id]; persistComments(); } // sem video, sem comentarios
  return true;
}

module.exports = {
  DATA_DIR, UPLOADS_DIR, PARTS_DIR, config, uuid, slug,
  getSessionSecret, getAuth, isConfigured, setAuth, deleteAsset,
  getDeviceKey, ingestAsset,
  listDevices, createDevice, revokeDevice, findDeviceByKey,
  listProjects, getProject, getProjectByRoot, createProject, deleteProject,
  setConnectedProject, getConnectedProject,
  issueAuthCode, redeemAuthCode, issueToken,
  createAsset, getAsset, markPartReceived, partPath, finalPathFor, markUploaded,
  listComments, countComments, addComment, deleteComment, setCommentResolved,
  assets: () => assets,
};

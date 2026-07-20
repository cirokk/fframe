"use strict";
// Frontend do painel. NENHUM segredo aqui: a autenticacao e feita por cookie de
// sessao (httpOnly) e TODA autorizacao e validada no servidor.

let projects = [], current = null, configured = false;
const DEVICES_VIEW = "__devices__"; // valor especial de `current` p/ tela Dispositivos

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSize = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB"
  : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const fmtTime = (s) => { try { return new Date(s).toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); } catch { return d; } };

async function api(method, url, body) {
  const opt = { method, headers: {} };
  if (body !== undefined) { opt.headers["Content-Type"] = "application/json"; opt.body = JSON.stringify(body); }
  const r = await fetch(url, opt);
  if (r.status === 401) { showAuth(); throw new Error("nao autenticado"); }
  return r;
}

// ---- Avisos (toast) e modais — dentro do site, sem popups do navegador ------
function toast(msg, type) {
  const el = document.createElement("div");
  el.className = "toast" + (type === "err" ? " err" : type === "ok" ? " ok" : "");
  el.textContent = msg;
  $("toasts").appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => { el.classList.remove("show"); setTimeout(() => el.remove(), 250); }, 3400);
}
function dialog({ title, message, input, placeholder, okText, danger }) {
  return new Promise((resolve) => {
    const back = $("modal");
    back.innerHTML =
      `<div class="modal-card">
        <h3>${escapeHtml(title || "")}</h3>
        ${message ? `<p class="modal-msg">${escapeHtml(message)}</p>` : ""}
        ${input ? `<input id="modal-input" class="fld" type="text" placeholder="${escapeHtml(placeholder || "")}" />` : ""}
        <div class="modal-acts">
          <button class="btn-ghost" data-act="cancel" type="button">Cancelar</button>
          <button class="btn-primary${danger ? " danger" : ""}" data-act="ok" type="button">${escapeHtml(okText || "OK")}</button>
        </div>
      </div>`;
    back.classList.add("show");
    const inp = back.querySelector("#modal-input");
    if (inp) setTimeout(() => inp.focus(), 60);
    const close = (val) => { back.classList.remove("show"); setTimeout(() => (back.innerHTML = ""), 180); resolve(val); };
    back.querySelector('[data-act="cancel"]').addEventListener("click", () => close(input ? null : false));
    back.querySelector('[data-act="ok"]').addEventListener("click", () => close(input ? (inp ? inp.value : "") : true));
    back.addEventListener("click", (e) => { if (e.target === back) close(input ? null : false); });
    if (inp) inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); close(inp.value); } });
  });
}
const confirmModal = (message, okText, danger) => dialog({ title: "Confirmar", message, okText: okText || "Confirmar", danger });
const promptModal = (title, placeholder) => dialog({ title, input: true, placeholder, okText: "Criar" });

// ---- Autenticacao -----------------------------------------------------------
async function init() {
  const st = await (await fetch("/_auth/status")).json();
  configured = st.configured;
  if (st.authed) showApp(); else showAuth();
}
function showAuth() {
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  const setup = !configured;
  $("auth-title").textContent = setup ? "Criar acesso" : "Entrar";
  $("auth-sub").textContent = setup
    ? "Primeiro acesso: defina um usuário e senha. Ficam guardados com segurança (hash) só no servidor."
    : "";
  $("auth-pass2").classList.toggle("hidden", !setup);
  $("auth-pass").setAttribute("autocomplete", setup ? "new-password" : "current-password");
  $("auth-btn").textContent = setup ? "Criar e entrar" : "Entrar";
  $("auth-err").textContent = "";
}
function showApp() {
  $("auth").classList.add("hidden");
  $("app").classList.remove("hidden");
  $("host").textContent = location.host;
  render();
}
async function submitAuth(ev) {
  ev.preventDefault();
  const setup = !configured;
  const user = $("auth-user").value.trim();
  const pass = $("auth-pass").value;
  const err = $("auth-err");
  err.textContent = "";
  if (setup && pass !== $("auth-pass2").value) { err.textContent = "As senhas não conferem."; return; }
  $("auth-btn").disabled = true;
  try {
    const remember = $("auth-remember").checked;
    const r = await fetch(setup ? "/_auth/setup" : "/_auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password: pass, remember }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = data.error === "credenciais invalidas" ? "Usuário ou senha inválidos." : (data.error || "Erro."); return; }
    configured = true;
    $("auth-pass").value = ""; $("auth-pass2").value = "";
    showApp();
  } finally { $("auth-btn").disabled = false; }
}
async function logout() { await api("POST", "/_auth/logout"); location.reload(); }

// ---- Projetos + videos ------------------------------------------------------
async function loadProjects() {
  projects = await (await api("GET", "/_api/projects")).json();
  const box = $("projects");
  box.innerHTML = "";
  const total = projects.reduce((s, p) => s + p.video_count, 0);
  box.appendChild(projRow({ id: null, name: "Todos os vídeos", video_count: total }, true));
  projects.forEach((p) => box.appendChild(projRow(p, false)));
  $("total").textContent = projects.length + " proj · " + total + " víd";
}
function projRow(p, isAll) {
  const el = document.createElement("div");
  el.className = "proj" + (current === p.id ? " active" : "");
  el.innerHTML =
    (p.connected ? '<span class="conn" title="conectado no app"></span>' : "") +
    `<span class="nm">${escapeHtml(p.name)}</span><span class="ct">${p.video_count}</span>` +
    (!isAll ? `<span class="del" role="button" title="apagar projeto" data-del="${p.id}" data-name="${escapeHtml(p.name)}">×</span>` : "");
  el.addEventListener("click", (e) => {
    if (e.target.dataset.del) return;
    current = p.id; closeDrawer(); render();
  });
  const del = el.querySelector(".del");
  if (del) del.addEventListener("click", (e) => { e.stopPropagation(); apagarProjeto(del.dataset.del, del.dataset.name); });
  return el;
}
async function render() {
  await loadProjects();
  $("nav-devices").classList.toggle("active", current === DEVICES_VIEW);
  if (current === DEVICES_VIEW) return renderDevices();
  const proj = projects.find((p) => p.id === current);
  $("title").textContent = proj ? proj.name : "Todos os vídeos";
  const url = current ? "/_api/assets?project=" + encodeURIComponent(current) : "/_api/assets";
  const assets = await (await api("GET", url)).json();
  $("count").textContent = assets.length + " vídeo(s)";
  const content = $("content");
  if (!assets.length) {
    content.innerHTML = '<div class="empty"><div class="big">🎬</div>Nenhum vídeo aqui ainda.<br>Grave no FiLMiC com o auto-upload ligado.</div>';
    return;
  }
  const byDate = {};
  assets.forEach((a) => { (byDate[a.date] = byDate[a.date] || []).push(a); });
  content.innerHTML = Object.keys(byDate).sort().reverse().map((date) =>
    `<div class="date-h">${fmtDate(date)}</div><div class="grid">${byDate[date].map(cardHtml).join("")}</div>`).join("");
  content.querySelectorAll("[data-delv]").forEach((b) =>
    b.addEventListener("click", () => excluirVideo(b.dataset.delv, b.dataset.name)));
  content.querySelectorAll("[data-play]").forEach((b) =>
    b.addEventListener("click", () => openPlayer(b.dataset.play, b.dataset.name)));
}
function cardHtml(a) {
  return `<div class="card">
    <button class="thumb" type="button" data-play="${a.id}" data-name="${escapeHtml(a.name)}">
      <video preload="metadata" muted playsinline src="/_media/${a.id}#t=0.5"></video>
      <span class="playbtn">▶</span>
    </button>
    <div class="meta">
      <div class="nm" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
      <div class="row"><span>${fmtSize(a.filesize)} · ${fmtTime(a.uploaded_at)}</span>
        <span class="acts">
          <a class="act" href="/_download/${a.id}">baixar</a>
          <button class="act danger" type="button" data-delv="${a.id}" data-name="${escapeHtml(a.name)}">excluir</button>
        </span></div>
    </div></div>`;
}

// Player em tela cheia (assistir grande)
function openPlayer(id, name) {
  const p = $("player");
  p.innerHTML =
    `<div class="player-inner">
      <div class="player-bar">
        <span class="player-name">${escapeHtml(name)}</span>
        <button class="player-close" type="button" data-close aria-label="fechar">✕</button>
      </div>
      <video class="player-video" src="/_media/${id}" controls autoplay playsinline></video>
    </div>`;
  p.classList.add("show");
  const close = () => {
    const v = p.querySelector("video");
    if (v) { try { v.pause(); } catch {} }
    p.classList.remove("show");
    setTimeout(() => (p.innerHTML = ""), 200);
    document.removeEventListener("keydown", onEsc);
  };
  const onEsc = (e) => { if (e.key === "Escape") close(); };
  p.querySelector("[data-close]").addEventListener("click", close);
  p.addEventListener("click", (e) => { if (e.target === p) close(); });
  document.addEventListener("keydown", onEsc);
}
async function novoProjeto() {
  const name = await promptModal("Novo projeto", "Nome do projeto");
  if (!name || !name.trim()) return;
  await api("POST", "/_api/projects", { name: name.trim() });
  toast("Projeto criado.", "ok");
  render();
}
async function apagarProjeto(id, name) {
  const ok = await confirmModal(`Apagar o projeto "${name}"?\nOs arquivos de vídeo no disco NÃO são apagados.`, "Apagar", true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/projects/" + id);
  const data = await r.json().catch(() => ({}));
  if (!data.ok) { toast(data.error || "Não foi possível apagar.", "err"); return; }
  if (current === id) current = null;
  toast("Projeto apagado.", "ok");
  render();
}
async function excluirVideo(id, name) {
  const ok = await confirmModal(`Excluir o vídeo "${name}"?\nIsso APAGA o arquivo do servidor. Não dá pra desfazer.`, "Excluir", true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/assets/" + id);
  if (!r.ok) { toast("Não foi possível excluir.", "err"); return; }
  toast("Vídeo excluído.", "ok");
  render();
}

// ---- Dispositivos (chaves do app Fframe Uploader) ---------------------------
async function renderDevices() {
  $("title").textContent = "Dispositivos";
  const devices = await (await api("GET", "/_api/devices")).json();
  const active = devices.filter((d) => !d.revoked_at);
  $("count").textContent = active.length + " ativo(s)";
  const content = $("content");
  const rows = devices.slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(devRowHtml).join("");
  content.innerHTML =
    `<div class="dev-head">
      <p class="dev-hint">Cada aparelho com o app Fframe Uploader usa a própria chave. Revogar corta o acesso na hora (o histórico fica guardado).</p>
      <button id="add-device" class="btn-primary" type="button">＋ Adicionar dispositivo</button>
    </div>` +
    (devices.length ? `<div class="dev-list">${rows}</div>`
      : '<div class="empty"><div class="big">📱</div>Nenhum dispositivo ainda.<br>Adicione um pra gerar a chave do app.</div>');
  $("add-device").addEventListener("click", novoDispositivo);
  content.querySelectorAll("[data-revoke]").forEach((b) =>
    b.addEventListener("click", () => revogarDispositivo(b.dataset.revoke, b.dataset.name)));
  content.querySelectorAll("[data-showkey]").forEach((b) =>
    b.addEventListener("click", () => {
      const d = devices.find((x) => x.id === b.dataset.showkey);
      if (d) keyModal(d);
    }));
}
function devRowHtml(d) {
  const revoked = !!d.revoked_at;
  const dt = (s) => { try { return new Date(s).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return ""; } };
  return `<div class="dev-row${revoked ? " revoked" : ""}">
    <div class="dev-info">
      <div class="dev-nm">${escapeHtml(d.name)}</div>
      <div class="dev-sub">criado em ${dt(d.created_at)}${revoked ? " · revogado em " + dt(d.revoked_at) : ""}</div>
    </div>
    <span class="badge ${revoked ? "off" : "on"}">${revoked ? "revogado" : "ativo"}</span>
    <span class="acts">${revoked ? "" :
      `<button class="act" type="button" data-showkey="${d.id}">chave</button>
      <button class="act danger" type="button" data-revoke="${d.id}" data-name="${escapeHtml(d.name)}">revogar</button>`}
    </span>
  </div>`;
}
async function novoDispositivo() {
  const name = await promptModal("Novo dispositivo", "Nome (ex.: Celular do Ciro)");
  if (!name || !name.trim()) return;
  const r = await api("POST", "/_api/devices", { name: name.trim() });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.key) { toast((d && d.error) || "Não foi possível criar.", "err"); return; }
  toast("Dispositivo criado.", "ok");
  await renderDevices();
  keyModal(d);
}
async function revogarDispositivo(id, name) {
  const ok = await confirmModal(`Revogar o dispositivo "${name}"?\nO app com essa chave perde o acesso imediatamente.`, "Revogar", true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/devices/" + id);
  const data = await r.json().catch(() => ({}));
  if (!data.ok) { toast(data.error || "Não foi possível revogar.", "err"); return; }
  toast("Dispositivo revogado.", "ok");
  renderDevices();
}
// Modal com QR code + chave em texto (pra configurar o app Fframe Uploader).
function keyModal(d) {
  const back = $("modal");
  back.innerHTML =
    `<div class="modal-card">
      <h3>${escapeHtml(d.name)}</h3>
      <p class="modal-msg">Escaneie o QR no app Fframe Uploader, ou copie a chave e cole manualmente.</p>
      <div class="qr-wrap"><div id="qr-box"></div></div>
      <code class="key-text" id="key-text">${escapeHtml(d.key)}</code>
      <div class="modal-acts">
        <button class="btn-ghost" data-act="copy" type="button">Copiar chave</button>
        <button class="btn-primary" data-act="ok" type="button">Fechar</button>
      </div>
    </div>`;
  back.classList.add("show");
  try {
    new QRCode(back.querySelector("#qr-box"), {
      text: JSON.stringify({ url: window.location.origin, key: d.key }),
      width: 200, height: 200,
      colorDark: "#000000", colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M,
    });
  } catch (e) { /* sem QR, a chave em texto resolve */ }
  const close = () => { back.classList.remove("show"); setTimeout(() => (back.innerHTML = ""), 180); };
  back.querySelector('[data-act="ok"]').addEventListener("click", close);
  back.addEventListener("click", (e) => { if (e.target === back) close(); });
  back.querySelector('[data-act="copy"]').addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(d.key); toast("Chave copiada.", "ok"); }
    catch {
      const rng = document.createRange(); rng.selectNodeContents(back.querySelector("#key-text"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      const ok = document.execCommand && document.execCommand("copy");
      toast(ok ? "Chave copiada." : "Não deu pra copiar — a chave está selecionada.", ok ? "ok" : "err");
    }
  });
}

// ---- Gaveta (mobile) --------------------------------------------------------
const openDrawer = () => $("app").classList.add("open");
const closeDrawer = () => $("app").classList.remove("open");

// ---- Ligações ---------------------------------------------------------------
$("auth-card").addEventListener("submit", submitAuth);
$("logout").addEventListener("click", logout);
$("new-proj").addEventListener("click", novoProjeto);
$("nav-devices").addEventListener("click", () => { current = DEVICES_VIEW; closeDrawer(); render(); });
$("menu").addEventListener("click", openDrawer);
$("scrim").addEventListener("click", closeDrawer);

// PWA: registra o service worker (instalavel + funciona offline)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
}

init();

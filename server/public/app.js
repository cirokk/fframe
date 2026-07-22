"use strict";
// Frontend do painel. NENHUM segredo aqui: a autenticacao e feita por cookie de
// sessao (httpOnly) e TODA autorizacao e validada no servidor.
// Textos visiveis vem do i18n.js (t("chave")) — nunca escreva texto fixo aqui.

let projects = [], current = null, configured = false;
const DEVICES_VIEW = "__devices__"; // valor especial de `current` p/ tela Dispositivos

const $ = (id) => document.getElementById(id);
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmtSize = (b) => b >= 1073741824 ? (b / 1073741824).toFixed(2) + " GB"
  : b >= 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB";
const fmtTime = (s) => { try { return new Date(s).toLocaleString(I18n.locale(), { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const fmtDate = (d) => { try { return new Date(d + "T00:00:00").toLocaleDateString(I18n.locale(), { weekday: "long", day: "2-digit", month: "long" }); } catch { return d; } };
const fmtDay = (s) => { try { return new Date(s).toLocaleDateString(I18n.locale(), { day: "2-digit", month: "2-digit", year: "numeric" }); } catch { return ""; } };

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
          <button class="btn-ghost" data-act="cancel" type="button">${escapeHtml(t("modal.cancel"))}</button>
          <button class="btn-primary${danger ? " danger" : ""}" data-act="ok" type="button">${escapeHtml(okText || t("modal.ok"))}</button>
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
const confirmModal = (message, okText, danger) =>
  dialog({ title: t("modal.confirmTitle"), message, okText: okText || t("modal.confirm"), danger });
const promptModal = (title, placeholder) => dialog({ title, input: true, placeholder, okText: t("modal.create") });

// ---- Autenticacao -----------------------------------------------------------
async function init() {
  I18n.init();
  I18n.onChange = () => { if ($("app").classList.contains("hidden")) showAuth(); else render(); };
  const st = await (await fetch("/_auth/status")).json();
  configured = st.configured;
  if (st.authed) showApp(); else showAuth();
}
function showAuth() {
  $("app").classList.add("hidden");
  $("auth").classList.remove("hidden");
  const setup = !configured;
  $("auth-title").textContent = setup ? t("auth.title.setup") : t("auth.title.signin");
  $("auth-sub").textContent = setup ? t("auth.sub.setup") : "";
  $("auth-pass2").classList.toggle("hidden", !setup);
  $("auth-pass").setAttribute("autocomplete", setup ? "new-password" : "current-password");
  $("auth-btn").textContent = setup ? t("auth.btn.setup") : t("auth.btn.signin");
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
  if (setup && pass !== $("auth-pass2").value) { err.textContent = t("auth.err.mismatch"); return; }
  $("auth-btn").disabled = true;
  try {
    const remember = $("auth-remember").checked;
    const r = await fetch(setup ? "/_auth/setup" : "/_auth/login",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user, password: pass, remember }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { err.textContent = data.error === "credenciais invalidas" ? t("auth.err.invalid") : (data.error || t("auth.err.generic")); return; }
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
  box.appendChild(projRow({ id: null, name: t("title.allVideos"), video_count: total }, true));
  projects.forEach((p) => box.appendChild(projRow(p, false)));
  $("total").textContent = t("side.stats", { projects: projects.length, videos: total });
}
function projRow(p, isAll) {
  const el = document.createElement("div");
  el.className = "proj" + (current === p.id ? " active" : "");
  el.innerHTML =
    (p.connected ? `<span class="conn" title="${escapeHtml(t("proj.connected"))}"></span>` : "") +
    `<span class="nm">${escapeHtml(p.name)}</span><span class="ct">${p.video_count}</span>` +
    (!isAll ? `<span class="del" role="button" title="${escapeHtml(t("proj.deleteTitle"))}" data-del="${p.id}" data-name="${escapeHtml(p.name)}">×</span>` : "");
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
  $("title").textContent = proj ? proj.name : t("title.allVideos");
  const url = current ? "/_api/assets?project=" + encodeURIComponent(current) : "/_api/assets";
  const assets = await (await api("GET", url)).json();
  $("count").textContent = t("count.videos", { n: assets.length });
  const content = $("content");
  if (!assets.length) {
    content.innerHTML = `<div class="empty"><div class="big">🎬</div>${escapeHtml(t("empty.videos.title"))}<br>${escapeHtml(t("empty.videos.hint"))}</div>`;
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
      ${a.comment_count ? `<span class="cmt-badge">💬 ${a.comment_count}</span>` : ""}
    </button>
    <div class="meta">
      <div class="nm" title="${escapeHtml(a.name)}">${escapeHtml(a.name)}</div>
      <div class="row"><span>${fmtSize(a.filesize)} · ${fmtTime(a.uploaded_at)}</span>
        <span class="acts">
          <a class="act" href="/_download/${a.id}">${escapeHtml(t("card.download"))}</a>
          <button class="act danger" type="button" data-delv="${a.id}" data-name="${escapeHtml(a.name)}">${escapeHtml(t("card.delete"))}</button>
        </span></div>
    </div></div>`;
}

// Formata segundos como M:SS (ou H:MM:SS em videos longos).
function fmtClock(s) {
  s = Math.max(0, Math.floor(Number(s) || 0));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  const mm = h ? String(m).padStart(2, "0") : String(m);
  return (h ? h + ":" : "") + mm + ":" + String(ss).padStart(2, "0");
}
// Autor "device:Celular do Ciro" -> "Celular do Ciro".
const authorLabel = (a) => (a ? String(a).replace(/^device:/, "") : "—");

// Player em tela cheia (assistir grande) com comentarios ancorados no tempo.
function openPlayer(id, name) {
  const p = $("player");
  p.innerHTML =
    `<div class="player-inner review">
      <div class="player-main">
        <div class="player-bar">
          <span class="player-name">${escapeHtml(name)}</span>
          <button class="player-close" type="button" data-close aria-label="${escapeHtml(t("player.close"))}">✕</button>
        </div>
        <div class="player-stage">
          <video class="player-video" src="/_media/${id}" controls autoplay playsinline></video>
          <div class="tl-markers" id="tl-markers"></div>
        </div>
      </div>
      <aside class="player-side">
        <div class="cmt-head">${escapeHtml(t("cmt.title"))} <span class="cmt-n" id="cmt-n">0</span></div>
        <div class="cmt-list" id="cmt-list"></div>
        <form class="cmt-compose" id="cmt-compose" autocomplete="off">
          <div class="cmt-when">
            <span class="chip" id="cmt-chip"></span>
            <button type="button" class="cmt-reset" id="cmt-reset" hidden>↺ ${escapeHtml(t("cmt.now"))}</button>
          </div>
          <textarea id="cmt-text" rows="2"></textarea>
          <button class="btn-primary" id="cmt-send" type="submit">${escapeHtml(t("cmt.send"))}</button>
        </form>
      </aside>
    </div>`;
  p.classList.add("show");

  const video = p.querySelector("video");
  let comments = [];
  let composeTime = null; // null = segue o playhead; numero = congelado no momento comentado
  let duration = 0;

  const textEl = () => $("cmt-text");
  const seek = (sec) => { try { video.currentTime = sec; video.pause(); } catch {} };

  function updateChip() {
    const time = composeTime != null ? composeTime : video.currentTime;
    $("cmt-chip").textContent = t("cmt.at", { time: fmtClock(time) });
    textEl().placeholder = t("cmt.placeholder", { time: fmtClock(time) });
  }
  function freeze() { // ao focar pra escrever, congela o momento e pausa o video
    if (composeTime == null) { composeTime = video.currentTime; video.pause(); $("cmt-reset").hidden = false; updateChip(); }
  }
  function unfreeze() { composeTime = null; $("cmt-reset").hidden = true; updateChip(); }

  function renderMarkers() {
    const box = $("tl-markers");
    if (!box) return;
    box.innerHTML = !duration ? "" : comments.map((c) =>
      `<button class="tl-mark${c.resolved ? " done" : ""}" type="button" data-seek="${c.t}"
        title="${escapeHtml(authorLabel(c.author) + ": " + c.text)}"></button>`).join("");
    // Posicao setada via JS (CSSOM), nao por atributo style inline — a CSP do
    // servidor (default-src 'self', sem 'unsafe-inline') bloqueia style="" no markup.
    box.querySelectorAll(".tl-mark").forEach((b) => {
      if (duration) b.style.left = (parseFloat(b.dataset.seek) / duration * 100).toFixed(3) + "%";
      b.addEventListener("click", () => seek(parseFloat(b.dataset.seek)));
    });
  }
  function renderList() {
    $("cmt-n").textContent = comments.length;
    const list = $("cmt-list");
    if (!comments.length) {
      list.innerHTML = `<div class="cmt-empty">${escapeHtml(t("cmt.empty"))}<br><span>${escapeHtml(t("cmt.emptyHint"))}</span></div>`;
      return;
    }
    list.innerHTML = comments.slice().sort((a, b) => a.t - b.t).map((c) =>
      `<div class="cmt-item${c.resolved ? " done" : ""}">
        <div class="cmt-top">
          <button class="cmt-time" type="button" data-seek="${c.t}" title="${escapeHtml(t("cmt.jump", { time: fmtClock(c.t) }))}">${fmtClock(c.t)}</button>
          <span class="cmt-auth">${escapeHtml(authorLabel(c.author))}</span>
        </div>
        <div class="cmt-body">${escapeHtml(c.text)}</div>
        <div class="cmt-acts">
          <button class="cmt-act" type="button" data-resolve="${c.id}" data-on="${c.resolved ? 1 : 0}">${escapeHtml(c.resolved ? t("cmt.reopen") : t("cmt.resolve"))}</button>
          <button class="cmt-act danger" type="button" data-del="${c.id}">${escapeHtml(t("cmt.delete"))}</button>
        </div>
      </div>`).join("");
    list.querySelectorAll("[data-seek]").forEach((b) => b.addEventListener("click", () => seek(parseFloat(b.dataset.seek))));
    list.querySelectorAll("[data-resolve]").forEach((b) => b.addEventListener("click", () => toggleResolve(b.dataset.resolve, b.dataset.on !== "1")));
    list.querySelectorAll("[data-del]").forEach((b) => b.addEventListener("click", () => delComment(b.dataset.del)));
  }

  async function load() {
    try { comments = await (await api("GET", `/_api/assets/${id}/comments`)).json(); }
    catch { comments = []; }
    renderList(); renderMarkers();
  }
  async function toggleResolve(cid, resolved) {
    await api("PATCH", `/_api/assets/${id}/comments/${cid}`, { resolved });
    const c = comments.find((x) => x.id === cid); if (c) c.resolved = resolved;
    renderList(); renderMarkers();
  }
  async function delComment(cid) {
    const ok = await confirmModal(t("cmt.delete.confirm"), t("cmt.delete"), true);
    if (!ok) return;
    const r = await api("DELETE", `/_api/assets/${id}/comments/${cid}`);
    if (!r.ok) { toast(t("cmt.delete.fail"), "err"); return; }
    comments = comments.filter((x) => x.id !== cid);
    renderList(); renderMarkers(); toast(t("cmt.deleted"), "ok");
  }
  async function submit(ev) {
    ev.preventDefault();
    const text = textEl().value.trim();
    if (!text) return;
    const when = composeTime != null ? composeTime : video.currentTime;
    const btn = $("cmt-send"); btn.disabled = true; btn.textContent = t("cmt.sending");
    try {
      const r = await api("POST", `/_api/assets/${id}/comments`, { t: when, text });
      const c = await r.json().catch(() => null);
      if (!r.ok || !c || !c.id) { toast((c && c.error) || t("cmt.add.fail"), "err"); return; }
      comments.push(c);
      textEl().value = ""; unfreeze();
      renderList(); renderMarkers(); toast(t("cmt.added"), "ok");
    } finally { btn.disabled = false; btn.textContent = t("cmt.send"); }
  }

  video.addEventListener("loadedmetadata", () => { duration = video.duration || 0; renderMarkers(); updateChip(); });
  video.addEventListener("timeupdate", () => { if (composeTime == null) updateChip(); });
  textEl().addEventListener("focus", freeze);
  $("cmt-reset").addEventListener("click", () => { composeTime = video.currentTime; updateChip(); textEl().focus(); });
  $("cmt-compose").addEventListener("submit", submit);
  updateChip();
  load();

  const close = () => {
    try { video.pause(); } catch {}
    p.classList.remove("show");
    setTimeout(() => (p.innerHTML = ""), 200);
    document.removeEventListener("keydown", onEsc);
    render(); // atualiza o contador 💬 nos cards
  };
  const onEsc = (e) => {
    if (e.key !== "Escape") return;
    if (document.activeElement === textEl()) { textEl().blur(); return; } // Esc no texto: so desfoca
    close();
  };
  p.querySelector("[data-close]").addEventListener("click", close);
  p.addEventListener("click", (e) => { if (e.target === p) close(); });
  document.addEventListener("keydown", onEsc);
}
async function novoProjeto() {
  const name = await promptModal(t("proj.new.title"), t("proj.new.placeholder"));
  if (!name || !name.trim()) return;
  await api("POST", "/_api/projects", { name: name.trim() });
  toast(t("proj.created"), "ok");
  render();
}
async function apagarProjeto(id, name) {
  const ok = await confirmModal(t("proj.delete.confirm", { name }), t("proj.delete.btn"), true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/projects/" + id);
  const data = await r.json().catch(() => ({}));
  if (!data.ok) { toast(data.error || t("proj.delete.fail"), "err"); return; }
  if (current === id) current = null;
  toast(t("proj.deleted"), "ok");
  render();
}
async function excluirVideo(id, name) {
  const ok = await confirmModal(t("video.delete.confirm", { name }), t("video.delete.btn"), true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/assets/" + id);
  if (!r.ok) { toast(t("video.delete.fail"), "err"); return; }
  toast(t("video.deleted"), "ok");
  render();
}

// ---- Dispositivos (chaves do app Fframe Uploader) ---------------------------
async function renderDevices() {
  $("title").textContent = t("title.devices");
  const devices = await (await api("GET", "/_api/devices")).json();
  const active = devices.filter((d) => !d.revoked_at);
  $("count").textContent = t("count.devices", { n: active.length });
  const content = $("content");
  const rows = devices.slice()
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    .map(devRowHtml).join("");
  const note = t("dev.appLangNote");
  content.innerHTML =
    `<div class="dev-head">
      <div class="dev-hint-wrap">
        <p class="dev-hint">${escapeHtml(t("dev.hint"))}</p>
        ${note ? `<p class="dev-note">${escapeHtml(note)}</p>` : ""}
      </div>
      <button id="add-device" class="btn-primary" type="button">${escapeHtml(t("dev.add"))}</button>
    </div>` +
    (devices.length ? `<div class="dev-list">${rows}</div>`
      : `<div class="empty"><div class="big">📱</div>${escapeHtml(t("empty.devices.title"))}<br>${escapeHtml(t("empty.devices.hint"))}</div>`);
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
  const sub = t("dev.createdAt", { date: fmtDay(d.created_at) })
    + (revoked ? t("dev.revokedAt", { date: fmtDay(d.revoked_at) }) : "");
  return `<div class="dev-row${revoked ? " revoked" : ""}">
    <div class="dev-info">
      <div class="dev-nm">${escapeHtml(d.name)}</div>
      <div class="dev-sub">${escapeHtml(sub)}</div>
    </div>
    <span class="badge ${revoked ? "off" : "on"}">${escapeHtml(revoked ? t("dev.badge.revoked") : t("dev.badge.active"))}</span>
    <span class="acts">${revoked ? "" :
      `<button class="act" type="button" data-showkey="${d.id}">${escapeHtml(t("dev.act.key"))}</button>
      <button class="act danger" type="button" data-revoke="${d.id}" data-name="${escapeHtml(d.name)}">${escapeHtml(t("dev.act.revoke"))}</button>`}
    </span>
  </div>`;
}
async function novoDispositivo() {
  const name = await promptModal(t("dev.new.title"), t("dev.new.placeholder"));
  if (!name || !name.trim()) return;
  const r = await api("POST", "/_api/devices", { name: name.trim() });
  const d = await r.json().catch(() => null);
  if (!r.ok || !d || !d.key) { toast((d && d.error) || t("dev.create.fail"), "err"); return; }
  toast(t("dev.created"), "ok");
  await renderDevices();
  keyModal(d);
}
async function revogarDispositivo(id, name) {
  const ok = await confirmModal(t("dev.revoke.confirm", { name }), t("dev.revoke.btn"), true);
  if (!ok) return;
  const r = await api("DELETE", "/_api/devices/" + id);
  const data = await r.json().catch(() => ({}));
  if (!data.ok) { toast(data.error || t("dev.revoke.fail"), "err"); return; }
  toast(t("dev.revoked"), "ok");
  renderDevices();
}
// Modal com QR code + chave em texto (pra configurar o app Fframe Uploader).
function keyModal(d) {
  const back = $("modal");
  back.innerHTML =
    `<div class="modal-card">
      <h3>${escapeHtml(d.name)}</h3>
      <p class="modal-msg">${escapeHtml(t("dev.key.hint"))}</p>
      <div class="qr-wrap"><div id="qr-box"></div></div>
      <code class="key-text" id="key-text">${escapeHtml(d.key)}</code>
      <div class="modal-acts">
        <button class="btn-ghost" data-act="copy" type="button">${escapeHtml(t("dev.key.copy"))}</button>
        <button class="btn-primary" data-act="ok" type="button">${escapeHtml(t("dev.key.close"))}</button>
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
    try { await navigator.clipboard.writeText(d.key); toast(t("dev.key.copied"), "ok"); }
    catch {
      const rng = document.createRange(); rng.selectNodeContents(back.querySelector("#key-text"));
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(rng);
      const ok = document.execCommand && document.execCommand("copy");
      toast(ok ? t("dev.key.copied") : t("dev.key.copyFail"), ok ? "ok" : "err");
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

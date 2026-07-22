"use strict";
// i18n do painel. Para adicionar um idioma novo, basta acrescentar um bloco em
// LANGS com as mesmas chaves — o seletor do painel se atualiza sozinho.
// Chaves que faltarem caem no pt-BR (idioma de referencia).
//
// Placeholders: use {nome} no texto e passe { nome: valor } em t().

const LANGS = {
  "pt-BR": {
    _label: "Português",
    _flag: "🇧🇷",
    _locale: "pt-BR",

    "auth.title.signin": "Entrar",
    "auth.title.setup": "Criar acesso",
    "auth.sub.setup": "Primeiro acesso: defina um usuário e senha. Ficam guardados com segurança (hash) só no servidor.",
    "auth.user": "Usuário",
    "auth.pass": "Senha",
    "auth.pass2": "Repita a senha",
    "auth.remember": "Manter conectado",
    "auth.btn.signin": "Entrar",
    "auth.btn.setup": "Criar e entrar",
    "auth.err.mismatch": "As senhas não conferem.",
    "auth.err.invalid": "Usuário ou senha inválidos.",
    "auth.err.generic": "Erro.",

    "side.projects": "Projetos",
    "side.newProject": "＋ Novo Projeto",
    "side.settings": "Configurações",
    "side.devices": "📱 Dispositivos",
    "side.logout": "Sair",
    "side.language": "Idioma",
    "side.stats": "{projects} proj · {videos} víd",

    "title.allVideos": "Todos os vídeos",
    "title.devices": "Dispositivos",
    "count.videos": "{n} vídeo(s)",
    "count.devices": "{n} ativo(s)",
    "menu.aria": "menu",

    "empty.videos.title": "Nenhum vídeo aqui ainda.",
    "empty.videos.hint": "Grave com o Fframe Uploader e o auto-envio ligado.",
    "empty.devices.title": "Nenhum dispositivo ainda.",
    "empty.devices.hint": "Adicione um pra gerar a chave do app.",

    "card.download": "baixar",
    "card.delete": "excluir",
    "player.close": "fechar",

    "cmt.title": "Comentários",
    "cmt.count": "{n}",
    "cmt.empty": "Nenhum comentário ainda.",
    "cmt.emptyHint": "Pause no ponto que quer comentar e escreva abaixo.",
    "cmt.at": "em {time}",
    "cmt.placeholder": "Comentar em {time}…",
    "cmt.send": "Enviar",
    "cmt.sending": "Enviando…",
    "cmt.now": "usar momento atual",
    "cmt.jump": "ir para {time}",
    "cmt.resolve": "resolver",
    "cmt.reopen": "reabrir",
    "cmt.resolved": "resolvido",
    "cmt.delete": "excluir",
    "cmt.delete.confirm": "Excluir este comentário?",
    "cmt.added": "Comentário adicionado.",
    "cmt.deleted": "Comentário excluído.",
    "cmt.add.fail": "Não foi possível comentar.",
    "cmt.delete.fail": "Não foi possível excluir.",
    "cmt.you": "Você",

    "modal.cancel": "Cancelar",
    "modal.ok": "OK",
    "modal.confirmTitle": "Confirmar",
    "modal.confirm": "Confirmar",
    "modal.create": "Criar",

    "proj.connected": "conectado no app",
    "proj.deleteTitle": "apagar projeto",
    "proj.new.title": "Novo projeto",
    "proj.new.placeholder": "Nome do projeto",
    "proj.created": "Projeto criado.",
    "proj.delete.confirm": "Apagar o projeto \"{name}\"?\nOs arquivos de vídeo no disco NÃO são apagados.",
    "proj.delete.btn": "Apagar",
    "proj.deleted": "Projeto apagado.",
    "proj.delete.fail": "Não foi possível apagar.",

    "video.delete.confirm": "Excluir o vídeo \"{name}\"?\nIsso APAGA o arquivo do servidor. Não dá pra desfazer.",
    "video.delete.btn": "Excluir",
    "video.deleted": "Vídeo excluído.",
    "video.delete.fail": "Não foi possível excluir.",

    "dev.hint": "Cada aparelho com o app Fframe Uploader usa a própria chave. Revogar corta o acesso na hora (o histórico fica guardado).",
    "dev.appLangNote": "",
    "dev.add": "＋ Adicionar dispositivo",
    "dev.createdAt": "criado em {date}",
    "dev.revokedAt": " · revogado em {date}",
    "dev.badge.active": "ativo",
    "dev.badge.revoked": "revogado",
    "dev.act.key": "chave",
    "dev.act.revoke": "revogar",
    "dev.new.title": "Novo dispositivo",
    "dev.new.placeholder": "Nome (ex.: Celular do Ciro)",
    "dev.created": "Dispositivo criado.",
    "dev.create.fail": "Não foi possível criar.",
    "dev.revoke.confirm": "Revogar o dispositivo \"{name}\"?\nO app com essa chave perde o acesso imediatamente.",
    "dev.revoke.btn": "Revogar",
    "dev.revoked": "Dispositivo revogado.",
    "dev.revoke.fail": "Não foi possível revogar.",
    "dev.key.hint": "Escaneie o QR no app Fframe Uploader, ou copie a chave e cole manualmente.",
    "dev.key.copy": "Copiar chave",
    "dev.key.close": "Fechar",
    "dev.key.copied": "Chave copiada.",
    "dev.key.copyFail": "Não deu pra copiar — a chave está selecionada.",
  },

  en: {
    _label: "English",
    _flag: "🇬🇧",
    _locale: "en-GB",

    "auth.title.signin": "Sign in",
    "auth.title.setup": "Create access",
    "auth.sub.setup": "First access: choose a username and password. They are stored securely (hashed) on the server only.",
    "auth.user": "Username",
    "auth.pass": "Password",
    "auth.pass2": "Repeat password",
    "auth.remember": "Keep me signed in",
    "auth.btn.signin": "Sign in",
    "auth.btn.setup": "Create and sign in",
    "auth.err.mismatch": "Passwords don't match.",
    "auth.err.invalid": "Invalid username or password.",
    "auth.err.generic": "Error.",

    "side.projects": "Projects",
    "side.newProject": "＋ New Project",
    "side.settings": "Settings",
    "side.devices": "📱 Devices",
    "side.logout": "Sign out",
    "side.language": "Language",
    "side.stats": "{projects} proj · {videos} vid",

    "title.allVideos": "All videos",
    "title.devices": "Devices",
    "count.videos": "{n} video(s)",
    "count.devices": "{n} active",
    "menu.aria": "menu",

    "empty.videos.title": "No videos here yet.",
    "empty.videos.hint": "Record with the Fframe Uploader and auto-upload turned on.",
    "empty.devices.title": "No devices yet.",
    "empty.devices.hint": "Add one to generate a key for the app.",

    "card.download": "download",
    "card.delete": "delete",
    "player.close": "close",

    "cmt.title": "Comments",
    "cmt.count": "{n}",
    "cmt.empty": "No comments yet.",
    "cmt.emptyHint": "Pause where you want to comment and write below.",
    "cmt.at": "at {time}",
    "cmt.placeholder": "Comment at {time}…",
    "cmt.send": "Send",
    "cmt.sending": "Sending…",
    "cmt.now": "use current time",
    "cmt.jump": "jump to {time}",
    "cmt.resolve": "resolve",
    "cmt.reopen": "reopen",
    "cmt.resolved": "resolved",
    "cmt.delete": "delete",
    "cmt.delete.confirm": "Delete this comment?",
    "cmt.added": "Comment added.",
    "cmt.deleted": "Comment deleted.",
    "cmt.add.fail": "Couldn't add the comment.",
    "cmt.delete.fail": "Couldn't delete it.",
    "cmt.you": "You",

    "modal.cancel": "Cancel",
    "modal.ok": "OK",
    "modal.confirmTitle": "Confirm",
    "modal.confirm": "Confirm",
    "modal.create": "Create",

    "proj.connected": "connected in the app",
    "proj.deleteTitle": "delete project",
    "proj.new.title": "New project",
    "proj.new.placeholder": "Project name",
    "proj.created": "Project created.",
    "proj.delete.confirm": "Delete the project \"{name}\"?\nThe video files on disk are NOT deleted.",
    "proj.delete.btn": "Delete",
    "proj.deleted": "Project deleted.",
    "proj.delete.fail": "Couldn't delete it.",

    "video.delete.confirm": "Delete the video \"{name}\"?\nThis REMOVES the file from the server. It can't be undone.",
    "video.delete.btn": "Delete",
    "video.deleted": "Video deleted.",
    "video.delete.fail": "Couldn't delete it.",

    "dev.hint": "Each phone running the Fframe Uploader uses its own key. Revoking cuts access immediately (the history is kept).",
    "dev.appLangNote": "Heads-up: the Android app's interface is in Portuguese only.",
    "dev.add": "＋ Add device",
    "dev.createdAt": "created on {date}",
    "dev.revokedAt": " · revoked on {date}",
    "dev.badge.active": "active",
    "dev.badge.revoked": "revoked",
    "dev.act.key": "key",
    "dev.act.revoke": "revoke",
    "dev.new.title": "New device",
    "dev.new.placeholder": "Name (e.g. John's phone)",
    "dev.created": "Device created.",
    "dev.create.fail": "Couldn't create it.",
    "dev.revoke.confirm": "Revoke the device \"{name}\"?\nThe app holding this key loses access immediately.",
    "dev.revoke.btn": "Revoke",
    "dev.revoked": "Device revoked.",
    "dev.revoke.fail": "Couldn't revoke it.",
    "dev.key.hint": "Scan the QR code in the Fframe Uploader app, or copy the key and paste it manually.",
    "dev.key.copy": "Copy key",
    "dev.key.close": "Close",
    "dev.key.copied": "Key copied.",
    "dev.key.copyFail": "Couldn't copy — the key is selected instead.",
  },
};

const FALLBACK = "pt-BR";
const STORAGE_KEY = "fframe.lang";

// Escolhe o idioma: preferencia salva > idioma do navegador > pt-BR.
function detectLang() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* modo privado */ }
  if (saved && LANGS[saved]) return saved;
  const wanted = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language || ""]);
  for (const raw of wanted) {
    const tag = String(raw);
    if (LANGS[tag]) return tag;                                     // ex.: "pt-BR"
    const base = tag.split("-")[0];
    if (LANGS[base]) return base;                                   // ex.: "en-US" -> "en"
    const match = Object.keys(LANGS).find((c) => c.split("-")[0] === base);
    if (match) return match;                                        // ex.: "pt-PT" -> "pt-BR"
  }
  return FALLBACK;
}

let currentLang = detectLang();

/** Traduz uma chave, aplicando os placeholders {nome} de `vars`. */
function t(key, vars) {
  const dict = LANGS[currentLang] || LANGS[FALLBACK];
  let str = dict[key];
  if (str === undefined) str = LANGS[FALLBACK][key];
  if (str === undefined) return key;
  if (!vars) return str;
  return str.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
}

/** Aplica as traducoes nos elementos estaticos marcados no HTML. */
function applyStatic(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  scope.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  scope.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  document.documentElement.lang = currentLang;
}

/** Monta os <select> de idioma (um por elemento .lang-select no HTML). */
function mountSelectors() {
  document.querySelectorAll(".lang-select").forEach((sel) => {
    sel.innerHTML = Object.keys(LANGS)
      .map((code) => `<option value="${code}">${LANGS[code]._flag} ${LANGS[code]._label}</option>`)
      .join("");
    sel.value = currentLang;
    sel.setAttribute("aria-label", t("side.language"));
    sel.addEventListener("change", () => I18n.set(sel.value));
  });
}

const I18n = {
  t,
  langs: LANGS,
  get lang() { return currentLang; },
  /** Locale para Intl/toLocaleString (datas e horas seguem o idioma escolhido). */
  locale() { return (LANGS[currentLang] || LANGS[FALLBACK])._locale; },
  /** Callback que o app.js define para redesenhar o conteudo dinamico. */
  onChange: null,
  set(code) {
    if (!LANGS[code] || code === currentLang) return;
    currentLang = code;
    try { localStorage.setItem(STORAGE_KEY, code); } catch { /* modo privado */ }
    document.querySelectorAll(".lang-select").forEach((s) => { s.value = code; s.setAttribute("aria-label", t("side.language")); });
    applyStatic();
    if (typeof I18n.onChange === "function") I18n.onChange();
  },
  applyStatic,
  init() { mountSelectors(); applyStatic(); },
};

window.I18n = I18n;
window.t = t;

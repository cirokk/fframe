// test-client.js — simula um app de camera C2C para PROVAR que o servidor
// funciona, sem precisar de celular. Roda o fluxo inteiro: login -> conta/
// projeto -> criar asset -> upload de um "video" de teste -> confere que chegou.
//
// Uso:  node test-client.js            (usa http://localhost:3000)
//       BASE=http://SEU_SERVIDOR:3000 node test-client.js

const BASE = process.env.BASE || "http://localhost:3000";

async function j(method, url, { body, headers, raw } = {}) {
  const res = await fetch(url, {
    method,
    headers: { ...(headers || {}) },
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function ok(cond, msg) {
  console.log(`${cond ? "  OK  " : " FAIL "} ${msg}`);
  if (!cond) process.exitCode = 1;
}

(async () => {
  console.log(`\n== Simulando um app de camera C2C contra ${BASE} ==\n`);

  // 1) OAuth: pega o code e troca por token
  const authUrl = `${BASE}/oauth2/auth?client_id=teste&response_type=code&redirect_uri=${encodeURIComponent("com.example.c2c:/callback")}&scope=offline&state=abc`;
  const authRes = await fetch(authUrl, { redirect: "manual" });
  const loc = authRes.headers.get("location") || "";
  const code = new URL(loc.replace("com.example.c2c:/", "http://x/")).searchParams.get("code");
  ok(!!code, `OAuth authorize devolveu um code (${code ? code.slice(0, 8) + "..." : "nenhum"})`);

  const tok = await j("POST", `${BASE}/oauth2/token`, {
    body: `grant_type=authorization_code&code=${code}&redirect_uri=com.example.c2c:/callback`,
    raw: true,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });
  const token = tok.data.access_token;
  ok(!!token && tok.data.token_type === "Bearer", `token endpoint devolveu Bearer token`);
  const AUTH = { Authorization: `Bearer ${token}` };

  // 2) Bootstrap: me -> projeto -> root_asset_id
  const me = await j("GET", `${BASE}/v2/me`, { headers: AUTH });
  ok(me.status === 200 && me.data.account_id, `GET /v2/me trouxe conta`);

  const projs = await j("GET", `${BASE}/v2/projects`, { headers: AUTH });
  const project = Array.isArray(projs.data) ? projs.data[0] : projs.data;
  ok(project && project.root_asset_id, `GET /v2/projects trouxe root_asset_id`);
  const root = project.root_asset_id;

  // 3) Criar asset (um "video" de ~60KB pra testar 1 pedaco)
  const fake = Buffer.alloc(60 * 1024, 7); // 60KB de bytes "7"
  const create = await j("POST", `${BASE}/v2/assets/${root}/children`, {
    headers: { ...AUTH, "Content-Type": "application/json" },
    body: { name: "take_teste.mov", type: "file", filetype: "video/quicktime", filesize: fake.length },
  });
  ok(create.status === 201 && Array.isArray(create.data.upload_urls) && create.data.upload_urls.length >= 1,
     `POST asset devolveu upload_urls (${(create.data.upload_urls || []).length})`);
  const asset = create.data;

  // 4) Upload de cada pedaco
  const n = asset.upload_urls.length;
  const partSize = Math.ceil(fake.length / n);
  for (let i = 0; i < n; i++) {
    const slice = fake.subarray(i * partSize, (i + 1) * partSize);
    const put = await j("PUT", asset.upload_urls[i], {
      raw: true, body: slice, headers: { "Content-Type": "video/quicktime" },
    });
    ok(put.status === 200 && put.headers.get("etag"), `upload parte ${i + 1}/${n} -> 200 + ETag`);
  }

  // 5) Confirma que o video chegou completo
  await new Promise((r) => setTimeout(r, 300));
  const st = await j("GET", `${BASE}/_status`);
  const got = (st.data.assets || []).find((a) => a.id === asset.id);
  ok(got && got.status === "uploaded", `servidor marcou o video como "uploaded"`);

  console.log(`\n== Fim. ${process.exitCode ? "TEVE FALHA ^" : "TUDO PASSOU \\o/"} ==\n`);
})().catch((e) => { console.error("ERRO:", e); process.exit(1); });

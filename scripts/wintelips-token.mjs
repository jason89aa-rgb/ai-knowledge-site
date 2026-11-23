// Issues the shared WINTELIPS OAuth token for the patent report.
//   node scripts/wintelips-token.mjs            Log in to WINTELIPS in the browser and save the tokens
//   node scripts/wintelips-token.mjs --refresh  Renew the saved access token with the saved refresh token
// Tokens are written to .env.local (git-ignored), never printed. Copy the values from there into the host's secrets.
import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const envFile = process.env.WINTELIPS_ENV_FILE || path.join(root, ".env.local");
const issuer = (process.env.WINTELIPS_OAUTH_ISSUER || "https://mcp.wipsclip.co.kr").replace(/\/+$/, "");
const port = Number(process.env.WINTELIPS_CALLBACK_PORT || 8976);
const redirectUri = `http://127.0.0.1:${port}/callback`;
const args = new Set(process.argv.slice(2));

function readEnv() {
  const values = {};
  if (!existsSync(envFile)) return values;
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match) values[match[1]] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
  return values;
}

function saveEnv(updates) {
  const lines = existsSync(envFile) ? readFileSync(envFile, "utf8").split(/\r?\n/) : [];
  const pending = new Map(Object.entries(updates).filter(([, value]) => value));
  const next = lines.map(line => {
    const key = line.match(/^\s*([A-Z0-9_]+)\s*=/)?.[1];
    if (!key || !pending.has(key)) return line;
    const value = pending.get(key);
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (next.length && next[next.length - 1] === "") next.pop();
  for (const [key, value] of pending) next.push(`${key}=${value}`);
  writeFileSync(envFile, next.join("\n") + "\n", { mode: 0o600 });
}

async function post(url, body, type = "form") {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": type === "json" ? "application/json" : "application/x-www-form-urlencoded", Accept: "application/json" },
    body: type === "json" ? JSON.stringify(body) : new URLSearchParams(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${url} 응답 오류 (HTTP ${res.status}) ${data.error_description || data.error || ""}`.trim());
  return data;
}

function report(tokens, previousRefresh) {
  const minutes = Number(tokens.expires_in) ? Math.round(Number(tokens.expires_in) / 60) : undefined;
  console.log(`저장 위치: ${envFile}`);
  console.log(`액세스 토큰 유효 시간: ${minutes ? `약 ${minutes}분` : "응답에 표시되지 않음"}`);
  console.log(`리프레시 토큰: ${tokens.refresh_token ? "발급됨" : "발급되지 않음 (만료되면 이 스크립트로 다시 로그인)"}`);
  if (previousRefresh && tokens.refresh_token) {
    console.log(tokens.refresh_token === previousRefresh
      ? "리프레시 토큰 회전: 없음 · 서버에 저장한 리프레시 토큰을 계속 쓸 수 있습니다."
      : "리프레시 토큰 회전: 있음 · 갱신할 때마다 새 리프레시 토큰이 발급되어, 서버의 환경 변수에 둔 값은 한 번만 쓸 수 있습니다.");
  }
}

async function refresh() {
  const env = readEnv();
  if (!env.WINTELIPS_REFRESH_TOKEN || !env.WINTELIPS_CLIENT_ID) throw new Error(`${envFile}에 WINTELIPS_REFRESH_TOKEN과 WINTELIPS_CLIENT_ID가 없습니다. 먼저 로그인하세요.`);
  const tokens = await post(issuer + "/token", {
    grant_type: "refresh_token", refresh_token: env.WINTELIPS_REFRESH_TOKEN, client_id: env.WINTELIPS_CLIENT_ID,
    ...(env.WINTELIPS_CLIENT_SECRET ? { client_secret: env.WINTELIPS_CLIENT_SECRET } : {}),
  });
  saveEnv({ WINTELIPS_ACCESS_TOKEN: tokens.access_token, WINTELIPS_REFRESH_TOKEN: tokens.refresh_token });
  report(tokens, env.WINTELIPS_REFRESH_TOKEN);
}

function openBrowser(url) {
  // cmd's "start" would cut the address at its first "&", so Windows opens it without a shell.
  const [command, params] = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
    : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  spawn(command, params, { stdio: "ignore", detached: true }).on("error", () => {}).unref();
}

async function login() {
  const env = readEnv();
  let clientId = env.WINTELIPS_CLIENT_ID;
  let clientSecret = env.WINTELIPS_CLIENT_SECRET;
  if (!clientId) {
    const client = await post(issuer + "/register", {
      client_name: "AI-ALL patent report", redirect_uris: [redirectUri], grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"], token_endpoint_auth_method: "client_secret_post",
    }, "json");
    clientId = client.client_id;
    clientSecret = client.client_secret;
    saveEnv({ WINTELIPS_CLIENT_ID: clientId, WINTELIPS_CLIENT_SECRET: clientSecret });
  }
  const verifier = randomBytes(48).toString("base64url");
  const state = randomBytes(24).toString("base64url");
  const authorize = new URL(issuer + "/authorize");
  authorize.search = new URLSearchParams({
    response_type: "code", client_id: clientId, redirect_uri: redirectUri, state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256",
  }).toString();

  const code = await new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (url.pathname !== "/callback") { res.writeHead(404).end(); return; }
      const ok = url.searchParams.get("state") === state && url.searchParams.get("code");
      res.writeHead(ok ? 200 : 400, { "Content-Type": "text/html; charset=utf-8" })
        .end(ok ? "WINTELIPS 로그인이 끝났습니다. 이 창을 닫아도 됩니다." : "로그인 응답을 확인하지 못했습니다. 터미널을 확인하세요.");
      server.close();
      if (ok) resolve(url.searchParams.get("code"));
      else reject(new Error(url.searchParams.get("error_description") || url.searchParams.get("error") || "로그인 응답의 state가 맞지 않습니다."));
    });
    server.on("error", reject);
    server.listen(port, "127.0.0.1", () => {
      console.log("브라우저에서 WINTELIPS 로그인을 마쳐 주세요. 창이 열리지 않으면 아래 주소를 여세요.");
      console.log(authorize.href);
      if (!args.has("--no-open")) openBrowser(authorize.href);
    });
    setTimeout(() => { server.close(); reject(new Error("10분 안에 로그인이 끝나지 않았습니다.")); }, 10 * 60 * 1000).unref();
  });

  const tokens = await post(issuer + "/token", {
    grant_type: "authorization_code", code, redirect_uri: redirectUri, client_id: clientId, code_verifier: verifier,
    ...(clientSecret ? { client_secret: clientSecret } : {}),
  });
  saveEnv({ WINTELIPS_ACCESS_TOKEN: tokens.access_token, WINTELIPS_REFRESH_TOKEN: tokens.refresh_token });
  report(tokens);
  if (tokens.refresh_token) {
    // Renew once now so the admin learns whether refresh tokens rotate before relying on the stored one.
    await refresh();
  }
}

(args.has("--refresh") ? refresh() : login()).catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});

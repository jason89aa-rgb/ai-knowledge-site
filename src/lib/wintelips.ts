import { date, PatentError, recent, request, section, type Candidate, type Report } from "./patent-review";

// WINTELIPS (WIPS) exposes its patent database as a remote MCP server; this module is a minimal client for it.
type Row = Record<string, string | undefined>;
type Data = Record<string, unknown> & { row_list?: Row[]; total_count?: number | string };
type Rpc = { id?: number; result?: { content?: { type: string; text?: string }[]; structuredContent?: unknown }; error?: { message?: string } };

const service = "WINTELIPS";
const protocol = "2025-06-18";
const endpoint = () => process.env.WINTELIPS_MCP_URL?.trim() || "https://mcp.wipsclip.co.kr/mcp";
const candidateFields = "SKEY,CC,KC_D,XN_D,AN_D,RN_D,AD,CSTK,TIK,TIE,APSTH,APST";
const reportFields = "SKEY,CC,KC_D,XN_D,AN_D,RN_D,AD,XD,RD,CSTK,TIK,TIE,ABK,ABE,APSTH,APST";
const officeActions: Record<string, { section: string; title: string }> = {
  "WIPS-OP": { section: "opinion_info", title: "의견제출통지서" },
  "WIPS-RE": { section: "refuse_info", title: "거절결정서" },
};
const textLabels: Record<string, string> = {
  send_num: "발송번호", send_dt: "발송일", subm_due_dt: "제출기일", examn: "심사관", exam_cntnt: "심사 대상",
  ref_law: "거절이유 및 관련 법조항", rfs_cntnt_detail: "거절이유 상세", pat_cntnt: "특허 가능 청구항",
  ref_cntnt: "통지 안내", attach_file: "첨부",
};

// The site shares one admin-issued OAuth token. When it expires, a configured refresh token renews it in memory.
class AuthError extends PatentError {}
const env = (name: string) => process.env[name]?.trim() || undefined;
const issuer = () => (env("WINTELIPS_OAUTH_ISSUER") ?? "https://mcp.wipsclip.co.kr").replace(/\/+$/, "");
let memory: { access?: string; refresh?: string } = {};
let renewing: Promise<string> | undefined;

export const wintelipsConfigured = () =>
  Boolean(env("WINTELIPS_ACCESS_TOKEN") || (env("WINTELIPS_REFRESH_TOKEN") && env("WINTELIPS_CLIENT_ID")));

async function renew() {
  const refreshToken = memory.refresh ?? env("WINTELIPS_REFRESH_TOKEN");
  const clientId = env("WINTELIPS_CLIENT_ID");
  if (!refreshToken || !clientId) {
    throw new PatentError("WINTELIPS 토큰이 만료되었습니다. 관리자가 토큰을 다시 발급해 WINTELIPS_ACCESS_TOKEN을 교체해야 합니다.", 424);
  }
  const form = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: clientId });
  const secret = env("WINTELIPS_CLIENT_SECRET");
  if (secret) form.set("client_secret", secret);
  const res = await request(issuer() + "/token", service, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: form,
  });
  const body: { access_token?: unknown; refresh_token?: unknown } = await res.json().catch(() => ({}));
  if (!res.ok || typeof body.access_token !== "string") {
    throw new PatentError("WINTELIPS 토큰을 갱신하지 못했습니다. 관리자가 scripts/wintelips-token.mjs로 토큰을 다시 발급해야 합니다.", 424);
  }
  memory = { access: body.access_token, refresh: typeof body.refresh_token === "string" ? body.refresh_token : refreshToken };
  return body.access_token;
}

export async function withWintelips<T>(run: (token: string) => Promise<T>): Promise<T> {
  if (!wintelipsConfigured()) {
    throw new PatentError("WINTELIPS 연결이 서버에 설정되지 않았습니다. 검색 설정의 데이터 출처를 공식 기관 API로 바꿔 주세요.", 503);
  }
  const token = memory.access ?? env("WINTELIPS_ACCESS_TOKEN");
  if (token) {
    try { return await run(token); } catch (error) { if (!(error instanceof AuthError)) throw error; }
  }
  renewing ??= renew().finally(() => { renewing = undefined; });
  return run(await renewing);
}

async function post(token: string, body: object, session?: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json", Accept: "application/json, text/event-stream",
    Authorization: `Bearer ${token}`, "MCP-Protocol-Version": protocol,
  };
  if (session) headers["Mcp-Session-Id"] = session;
  const res = await request(endpoint(), service, { method: "POST", headers, body: JSON.stringify(body) }, 25000);
  if (res.status === 401 || res.status === 403) {
    throw new AuthError("WINTELIPS 인증이 만료되었거나 권한이 없습니다. 관리자에게 WINTELIPS 토큰 재발급을 요청해 주세요.", 424);
  }
  if (!res.ok && res.status !== 202) throw new PatentError(`WINTELIPS 응답 오류 (HTTP ${res.status})`, 424);
  if (Number(res.headers.get("Content-Length")) > 8 * 1024 * 1024) throw new PatentError("WINTELIPS 응답이 너무 큽니다.", 424);
  return res;
}

function parseJson(text: string) {
  try { return JSON.parse(text); } catch { return undefined; }
}

async function reply(res: Response, id: number): Promise<Rpc> {
  const text = await res.text();
  const messages = (res.headers.get("content-type") ?? "").includes("text/event-stream")
    ? text.split(/\r?\n\r?\n/).map(event => event.split(/\r?\n/).filter(line => line.startsWith("data:"))
      .map(line => line.slice(5).trimStart()).join("\n")).filter(Boolean).map(parseJson)
    : [parseJson(text)];
  const found = messages.find(message => message?.id === id);
  if (!found) throw new PatentError("WINTELIPS 응답을 해석하지 못했습니다.", 424);
  return found;
}

async function connect(token: string) {
  const res = await post(token, {
    jsonrpc: "2.0", id: 0, method: "initialize",
    params: { protocolVersion: protocol, capabilities: {}, clientInfo: { name: "ai-all-patent-report", version: "1.0" } },
  });
  if ((await reply(res, 0)).error) throw new PatentError("WINTELIPS에 연결하지 못했습니다.", 424);
  const session = res.headers.get("Mcp-Session-Id") ?? undefined;
  await (await post(token, { jsonrpc: "2.0", method: "notifications/initialized" }, session)).body?.cancel();
  let next = 1;
  return async (name: string, args: Record<string, unknown>): Promise<Data | undefined> => {
    const id = next++;
    const message = await reply(await post(token, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, session), id);
    if (message.error) throw new PatentError(`WINTELIPS 도구 오류 · ${message.error.message ?? name}`, 424);
    const text = message.result?.content?.find(item => item.type === "text")?.text;
    const payload = (text === undefined ? message.result?.structuredContent : parseJson(text)) as
      { success?: boolean; data?: Data; error_code?: string; message?: string } | undefined;
    if (!payload) throw new PatentError("WINTELIPS 응답을 해석하지 못했습니다.", 424);
    if (payload.success === false) {
      if (/NOT_FOUND|NO_DATA/.test(payload.error_code ?? "") || payload.message?.includes("보유하지 않")) return undefined;
      throw new PatentError(`WINTELIPS · ${payload.message || payload.error_code || "요청을 처리하지 못했습니다."}`, 424);
    }
    return payload.data;
  };
}

const compact = (value?: string) => (value ?? "").replace(/[^\dA-Z]/gi, "").toUpperCase();
const list = (data: Data | undefined) => (Object.entries(data ?? {}).find(([key, value]) => key.endsWith("_list") && Array.isArray(value))?.[1] ?? []) as Row[];
const clean = (text: string) => text.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").replace(/†/g, " | ").replace(/§/g, "\n").trim();

export async function wintelipsCandidates(token: string, input: unknown, office: unknown) {
  if (typeof input !== "string" || !input.trim() || input.length > 64) throw new PatentError("특허번호를 입력해 주세요.", 400);
  const raw = input.normalize("NFKC").trim().toUpperCase();
  const prefix = raw.match(/^(KR|US|EP|CN|ZL|WO|PCT|JP|CA|AU|GB|DE|FR)(?=[\s-]*\d)/)?.[1];
  let body = raw.slice(prefix?.length ?? 0).trim();
  const kind = body.match(/\d\s*([A-Z]\d?)$/)?.[1];
  if (kind) body = body.slice(0, body.length - kind.length);
  const number = body.replace(/[\s,./-]/g, "");
  if (!/^(?:D|RE|PP)?\d{4,14}$/.test(number)) {
    throw new PatentError("번호를 확인해 주세요. 예: 10-2023-0010262, US 11,234,231, EP4286919", 400);
  }
  const named = office && office !== "auto" && office !== "UPC" ? String(office) : prefix;
  const country = named === "ZL" ? "CN" : named === "PCT" ? "WO" : named;
  const call = await connect(token);
  const data = await call("get_patent_search_onlyengine", {
    query: ["AN", "RN", "XN", "PN"].map(field => `${number}.${field}.`).join(" OR "), outitem: candidateFields, pgrow: 50,
  });
  const groups = new Map<string, Row[]>();
  for (const row of data?.row_list ?? []) {
    if (country && row.CC !== country) continue;
    const key = `${row.CC}:${compact(row.AN_D) || row.SKEY}`;
    groups.set(key, [...groups.get(key) ?? [], row]);
  }
  const candidates: Candidate[] = [];
  for (const rows of groups.values()) {
    if (kind && !rows.some(row => row.KC_D === kind)) continue;
    // Prefer the granted document and the record that carries a Korean title.
    const ranked = [...rows].sort((a, b) => Number(Boolean(b.TIK)) - Number(Boolean(a.TIK)) || (b.KC_D ?? "").localeCompare(a.KC_D ?? ""));
    const lead = ranked[0];
    const matched = [
      compact(lead.AN_D) === number && "출원번호",
      rows.some(row => compact(row.RN_D) === number) && "등록번호",
      rows.some(row => compact(row.XN_D) === number && row.KC_D?.startsWith("A") && !row.RN_D) && "공개번호",
      rows.some(row => compact(row.XN_D) === number && !row.KC_D?.startsWith("A") && compact(row.RN_D) !== number) && "문헌번호",
    ].filter(Boolean).join("·") || "번호";
    const documents = [...new Set(rows.map(row => [row.XN_D, row.KC_D].filter(Boolean).join(" ")))].join(", ");
    candidates.push({
      source: "wintelips", country: lead.CC ?? "", matched, title: lead.TIK || lead.TIE, application: lead.AN_D,
      publication: rows.find(row => row.KC_D?.startsWith("A") && !row.RN_D)?.XN_D, grant: lead.RN_D || undefined, documents,
      filed: lead.AD ? date(lead.AD) : undefined, status: lead.CSTK || undefined, applicants: lead.APSTH || lead.APST,
      skey: lead.SKEY,
    });
  }
  const notes = Number(data?.total_count) > 50 ? ["검색 결과가 많아 WINTELIPS 상위 50개 문헌만 정리했습니다. 국가 코드를 붙이면 범위를 좁힐 수 있습니다."] : [];
  return { candidates, notes };
}

const officeLinks = (country: string, publication: string): Report["links"] => country === "KR"
  ? [{ label: "KIPRIS 특허 검색", url: "https://www.kipris.or.kr/" }]
  : country === "EP" ? [{ label: "European Patent Register", url: "https://register.epo.org/smartSearch?query=" + encodeURIComponent("pn=EP" + publication) }]
    : [{ label: "Global Dossier", url: "https://globaldossier.uspto.gov/" }];

function validSkey(skey: unknown) {
  if (typeof skey !== "string" || !/^\d{10,16}$/.test(skey)) throw new PatentError("선택한 특허 식별자를 확인해 주세요.", 400);
  return skey;
}

export async function wintelipsReport(token: string, input: unknown): Promise<Report> {
  const skey = validSkey(input);
  const call = await connect(token);
  const row = (await call("get_patent_search_onlyengine", { query: `${skey}.SKEY.`, outitem: reportFields, pgrow: 1 }))?.row_list?.[0];
  if (!row?.CC) throw new PatentError("WINTELIPS에서 선택한 특허를 찾지 못했습니다.", 404);
  const country = row.CC;
  const published = row.KC_D?.startsWith("A") && !row.RN_D; // Pre-2001 US grants also carry kind A.
  const r: Report = {
    country: country as Report["country"], query: [country, row.XN_D, row.KC_D].filter(Boolean).join(" "), skey,
    title: row.TIK || row.TIE || "", application: row.AN_D, grant: row.RN_D || undefined,
    publication: published ? row.XN_D : undefined, filed: row.AD ? date(row.AD) : undefined,
    published: published && row.XD ? date(row.XD) : undefined, granted: row.RD ? date(row.RD) : undefined,
    status: row.CSTK || undefined, applicants: row.APSTH || row.APST, abstract: row.ABK || row.ABE,
    retrievedAt: new Date().toISOString(), source: service, links: officeLinks(country, row.XN_D ?? ""),
    family: [], events: [], documents: [], notes: [],
  };
  const korean = country === "KR";
  const [history, admin, family, inventors, opinions, refusals, status] = await Promise.all([
    section(r, "출원 이력", () => call("get_patent_admin_history", { section: "apply_history", skey })),
    korean ? section(r, "통합행정이력", () => call("get_patent_admin_history", { section: "kr_adm_info", skey })) : undefined,
    section(r, "패밀리", () => call("get_patent_family", { section: "wips_fmly", skey })),
    section(r, "발명자", () => call("get_patent_person", { section: "invt", skey })),
    korean ? section(r, "의견제출통지서", () => call("get_patent_office_action", { section: "opinion_info", skey })) : undefined,
    korean ? section(r, "거절결정서", () => call("get_patent_office_action", { section: "refuse_info", skey })) : undefined,
    r.status ? undefined : section(r, "현재 상태", () => call("get_patent_admin_history", { section: "stts", skey })),
  ]);
  const historyRows = list(history);
  const publicationEvent = historyRows.find(item => item.evnt_nm === "공개");
  if (!r.publication && publicationEvent?.evnt_rltd_info) {
    r.publication = publicationEvent.evnt_rltd_info.replace(/^[A-Z]{2}\s+/, "");
    r.published = date(publicationEvent.evnt_dt);
  }
  r.status ||= typeof status?.stts === "string" ? status.stts : undefined;
  r.inventors = list(inventors).map(item => item.invt).filter(Boolean).join(", ") || undefined;
  const adminRows = list(admin);
  const events: Report["events"] = adminRows.length
    ? adminRows.map(item => ({ date: date(item.rcptDt), title: item.doc ?? "", detail: item.stts, id: item.rcptNum }))
    : historyRows.map(item => ({
      date: date(item.evnt_dt), title: item.evnt_nm ?? "",
      detail: [item.evnt_rltd_info_attrbt, item.evnt_rltd_info].filter(Boolean).join(" "),
    }));
  r.events = recent(events);
  r.family = list(family).slice(0, 80).map(item => ({
    country: item.ctry ?? "", publication: [item.doc_num, item.doc_kind].filter(Boolean).join(" "),
    date: item.doc_dt ? date(item.doc_dt) : undefined, relation: "WIPS 확장 패밀리",
  }));
  for (const [code, data] of [["WIPS-OP", opinions], ["WIPS-RE", refusals]] as const) {
    list(data).forEach((item, index) => r.documents.push({
      id: item.send_num || item.rcpt_num || String(index + 1), title: officeActions[code].title,
      date: date(item.send_dt || item.dcsn_dt || item.rcpt_dt), code, downloadable: false, text: true,
    }));
  }
  r.notes.push("WINTELIPS(WIPS)가 가공한 데이터입니다. 권리 판단 전에 특허청 원본을 확인하세요.");
  return r;
}

export async function wintelipsDocument(token: string, input: unknown, code: unknown, id: unknown) {
  const skey = validSkey(input);
  const action = typeof code === "string" ? officeActions[code] : undefined;
  if (!action || typeof id !== "string") throw new PatentError("문서 식별자를 확인해 주세요.", 400);
  const call = await connect(token);
  const items = list(await call("get_patent_office_action", { section: action.section, skey }));
  const item = items.find((row, index) => (row.send_num || row.rcpt_num || String(index + 1)) === id);
  if (!item) throw new PatentError("WINTELIPS에서 해당 심사 문서를 찾지 못했습니다.", 404);
  const text = Object.entries(textLabels).filter(([key]) => item[key]).map(([key, label]) => `[${label}]\n${clean(item[key] ?? "")}`).join("\n\n");
  if (!text) throw new PatentError("WINTELIPS가 이 문서의 본문을 제공하지 않았습니다.", 404);
  return { title: action.title, text };
}

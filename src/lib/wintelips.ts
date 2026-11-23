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
    for (let attempt = 0; ; attempt++) {
      const id = next++;
      const message = await reply(await post(token, { jsonrpc: "2.0", id, method: "tools/call", params: { name, arguments: args } }, session), id);
      if (message.error) throw new PatentError(`WINTELIPS 도구 오류 · ${message.error.message ?? name}`, 424);
      const text = message.result?.content?.find(item => item.type === "text")?.text;
      const payload = (text === undefined ? message.result?.structuredContent : parseJson(text)) as
        { success?: boolean; data?: Data; error_code?: string; message?: string } | undefined;
      if (!payload) throw new PatentError("WINTELIPS 응답을 해석하지 못했습니다.", 424);
      if (payload.success === false) {
        // The shared account runs one search at a time, so a collision with another user clears after a short wait.
        if (payload.error_code === "CONCURRENT_CALL" && attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
          continue;
        }
        if (/NOT_FOUND|NO_DATA/.test(payload.error_code ?? "") || payload.message?.includes("보유하지 않")) return undefined;
        throw new PatentError(`WINTELIPS · ${payload.message || payload.error_code || "요청을 처리하지 못했습니다."}`, 424);
      }
      return payload.data;
    }
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

// The family list comes from WIPS' extended family; the reviewed patent is located by SKEY or, for official-API reports, by its number.
type Subject = { skey?: unknown; number?: unknown; country?: unknown };

async function subjectSkey(token: string, input: Subject, purpose: string) {
  if (typeof input.skey === "string" && /^\d{10,16}$/.test(input.skey)) return input.skey;
  const { candidates } = await wintelipsCandidates(token, input.number, input.country);
  const skey = candidates.find(item => !input.country || item.country === input.country)?.skey;
  if (!skey) throw new PatentError(`WINTELIPS에서 이 특허를 찾지 못해 ${purpose} 조회하지 못했습니다.`, 404);
  return skey;
}

export async function wintelipsFamily(token: string, input: Subject) {
  const skey = await subjectSkey(token, input, "패밀리를");
  const call = await connect(token);
  const first = await call("get_patent_family", { section: "wips_fmly", skey });
  if (!first) return { members: [], total: 0 };
  const pages = Math.min(Number(first.last_page_no) || 1, 3);
  const rest = await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
    call("get_patent_family", { section: "wips_fmly", skey, current_page_no: String(i + 2) })));
  const members = [first, ...rest].flatMap(page => list(page)).slice(0, 80).map(item => ({
    country: item.ctry ?? "", number: item.doc_num ?? "", kind: item.doc_kind, date: item.doc_dt ? date(item.doc_dt) : undefined, title: item.title,
  })).filter(item => item.country && item.number);
  return {
    subject: { country: String(first.ctry ?? ""), number: String(first.doc_num ?? ""), application: first.appl_num, filed: first.appl_dt ? date(first.appl_dt) : undefined },
    members, total: Number(first.total_cnt) || members.length,
  };
}

const related = (data: Data | undefined, key: string) => (Array.isArray(data?.[key]) ? data[key] : []) as Row[];
// WIPS marks each claim element with a list tag; one element per line keeps that structure.
const claimLines = (text: string) => clean(text.replace(/<\/?ul>/gi, "\n")).split("\n").map(line => line.trim()).filter(Boolean).join("\n");
const day = (value: string | undefined) => (value ? date(value) : undefined);

// One family member: its representative claim and the filings it descends from (CA/DA/CIP, PCT national stage, original application, priority).
function familyDocument(input: unknown) {
  const row = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const country = typeof row.country === "string" ? row.country.toUpperCase() : "";
  const number = typeof row.number === "string" ? row.number.trim() : "";
  const kind = typeof row.kind === "string" ? row.kind.toUpperCase() : "";
  if (!/^[A-Z]{2}$/.test(country) || !/^[A-Z0-9][A-Z0-9/.-]{2,23}$/i.test(number) || (kind && !/^[A-Z]\d?$/.test(kind))) {
    throw new PatentError("패밀리 문헌 번호를 확인해 주세요.", 400);
  }
  return { country, number, kind, target: { ctry: country, mng_num: number, ...(kind ? { doc_kind: kind } : {}) } };
}

export async function wintelipsFamilyMember(token: string, input: unknown) {
  const { country, number, kind, target } = familyDocument(input);
  const call = await connect(token);
  const notes: string[] = [];
  const optional = (label: string, run: () => Promise<Data | undefined>) => run().catch(error => {
    if (error instanceof AuthError) throw error;
    notes.push(`${label} 조회 실패`);
    return undefined;
  });
  const [claim, continuity, international, original, priority] = await Promise.all([
    optional("대표청구항", () => call("get_patent_spec_text", { section: "rept_claim", ...target })),
    ["US", "WO", "AU"].includes(country) ? optional("관련출원", () => call("get_patent_related_appl", { section: "rel_appl", ...target })) : undefined,
    country === "WO" ? undefined : optional("국제출원", () => call("get_patent_intl_appl", { section: "intr_appl", ...target })),
    ["KR", "JP", "CN", "EP", "CA"].includes(country) ? optional("원출원", () => call("get_patent_related_appl", { section: "org_appl", ...target })) : undefined,
    optional("우선권", () => call("get_patent_related_appl", { section: "pr", ...target })),
  ]);
  const info = (claim ?? continuity ?? original ?? priority ?? (international?.info as Data | undefined)) as Data | undefined;
  const text = (claim?.cl as { cl?: string; lang_cd?: string } | undefined);
  const filing = (item: Row) => ({ country: item.ctry, application: item.appl_num, filed: item.appl_dt ? date(item.appl_dt) : undefined, number: item.mng_num, type: item.ra_type });
  const pct = related(international, "intr_appl_list")[0];
  return {
    country, number, kind: kind || undefined,
    application: typeof info?.appl_num === "string" ? info.appl_num : undefined,
    filed: typeof info?.appl_dt === "string" ? date(info.appl_dt) : undefined,
    claim: text?.cl ? claimLines(text.cl).slice(0, 6000) : undefined,
    claimLanguage: text?.lang_cd,
    parents: related(continuity, "pa_list").map(filing), children: related(continuity, "ch_list").map(filing),
    provisionals: related(continuity, "pa_provs_list").map(filing),
    pct: pct ? { application: pct.appl_num, filed: pct.appl_dt ? date(pct.appl_dt) : undefined, publication: [pct.publ_num, pct.doc_kind].filter(Boolean).join(" ") } : undefined,
    original: related(original, "org_appl_list").map(item => {
      const key = (suffix: string) => Object.keys(item).find(name => name.endsWith(suffix));
      const filed = item[key("appl_dt") ?? ""];
      return { country: item.ctry ?? country, application: item[key("appl_num") ?? ""], filed: filed ? date(filed) : undefined };
    }).filter(item => item.application),
    priorities: related(priority, "pr_list").map(item => ({ country: item.ctry, application: item.pr_num, filed: item.pr_dt ? date(item.pr_dt) : undefined })),
    notes,
  };
}

const plain = (value: string | undefined) => (value ?? "").replace(/&amp;/g, "&");
const trialFields = ["trial_char", "trial_num", "appeal_num", "trial_type", "trial_title", "case_info", "inst", "req_dt", "filing_dt", "dcsn_dt", "trial_stts", "dcsn",
  "dcsn_rslt", "appeal_rslt", "dcsn_stts", "pprt_claim", "claim_cnt", "dcsn_dtl", "cons_trial_num", "cons_dt", "appeal_phase", "stmnt_filed_dt", "final_adm", "final_adm_dt", "dcsn_rsn"];

// One trial or court case about the patent. Offices name the fields differently; fields this does not know are kept as a plain detail line.
function trialRecord(item: Row, extra: { title?: string; parties?: string; root?: string } = {}) {
  const rest = Object.entries(item).filter(([key, value]) => !trialFields.includes(key) && typeof value === "string" && value).map(([, value]) => value ?? "");
  const named = item.trial_char || item.appeal_num || item.trial_num;
  return {
    number: named || rest[0] || "",
    type: item.trial_type || item.appeal_phase || undefined,
    title: plain(extra.title || item.trial_title || item.case_info).replace(/^-$/, "") || undefined,
    forum: item.inst || undefined,
    filed: day(item.req_dt || item.filing_dt), decided: day(item.dcsn_dt || item.final_adm_dt),
    status: item.trial_stts || undefined,
    result: item.dcsn || item.appeal_rslt || item.dcsn_rslt || item.final_adm || undefined,
    finality: item.dcsn_stts || undefined,
    purport: item.pprt_claim ? clean(item.pprt_claim).slice(0, 400) : undefined,
    parties: extra.parties || undefined, root: extra.root || undefined,
    // The conclusion and reasons of a decision, where the office gives them, lead the detail line.
    detail: [item.dcsn_dtl, item.dcsn_rsn, ...(named ? rest : rest.slice(1))].filter(Boolean).slice(0, 5).map(value => clean(value ?? "")).join(" · ").slice(0, 400) || undefined,
  };
}

const citation = (item: Row) => ({
  country: item.ctry ?? "", number: item.doc_num ?? "", kind: item.doc_kind || undefined, date: day(item.doc_dt),
  step: item.refer_step || undefined, title: item.title || undefined, applicant: item.appt || undefined,
});

// What the examination file itself does not show: the claims as published and as granted, the art on record,
// the term of the right, and proceedings after grant.
export async function wintelipsCaseRecord(token: string, input: Subject) {
  const skey = await subjectSkey(token, input, "권리 기록을");
  const call = await connect(token);
  const fields = "SKEY,CC,KC_D,XN_D,AN_D,RN_D,AD,XD,CSTK";
  const own = (await call("get_patent_search_onlyengine", { query: `${skey}.SKEY.`, outitem: fields, pgrow: 1 }))?.row_list?.[0];
  if (!own?.CC) throw new PatentError("WINTELIPS에서 이 특허를 찾지 못했습니다.", 404);
  const country = own.CC;
  const notes: string[] = [];
  const optional = <T>(label: string, run: () => Promise<T>) => run().catch(error => {
    if (error instanceof AuthError) throw error;
    notes.push(`${label} 조회 실패`);
    return undefined;
  });
  // The granted patent and its pre-grant publication are separate documents of one application.
  const application = compact(own.AN_D);
  const siblings = application
    ? (await optional("공개·등록 문헌", () => call("get_patent_search_onlyengine", { query: `${application}.AN.`, outitem: fields, pgrow: 20 })))?.row_list ?? []
    : [];
  const documents = [own, ...siblings.filter(row => row.SKEY !== own.SKEY && row.CC === country && compact(row.AN_D) === application)];
  const prePublication = (row: Row) => Boolean(row.KC_D?.startsWith("A") && !row.RN_D);
  const granted = documents.find(row => row.RN_D);
  const published = documents.filter(prePublication).sort((a, b) => (a.XD ?? "").localeCompare(b.XD ?? ""))[0];
  const target = (granted ?? own).SKEY;

  // Both versions are read in the office's own language so that their wording can be compared.
  const language = ({ KR: "KR", JP: "JP", CN: "CN" } as Record<string, string>)[country] ?? "US";
  const independent = ["KR", "US", "JP", "EP", "IN"].includes(country);
  const claimsOf = async (row: Row | undefined, label: string) => {
    if (!row?.SKEY) return undefined;
    const data = await optional(label, () => call("get_patent_spec_text", { section: independent ? "indp_claim" : "rept_claim", skey: row.SKEY, lang_cd: language }));
    const single = data?.cl as Row | undefined;
    const items = independent ? related(data, "cl_list") : single?.cl ? [single] : [];
    const claims = items.slice(0, 12).map(item => {
      const text = claimLines(item.cl ?? "");
      return { number: item.cl_num || /^\s*(\d+)\s*[.．]/.exec(text)?.[1] || "", text: text.replace(/^\s*\d+\s*[.．]\s*/, "").slice(0, 8000) };
    }).filter(item => item.text);
    if (!claims.length) return undefined;
    return {
      label: [country, row.XN_D, row.KC_D].filter(Boolean).join(" "), date: day(row.XD),
      language: String(items[0]?.lang_cd || data?.lang_cd || language), claims,
    };
  };
  // Every claim, dependent ones included, so that the numbers before and after grant can be matched.
  const everyClaim = async (row: Row | undefined, label: string) => {
    if (!row?.SKEY) return undefined;
    const data = await optional(label, () => call("get_patent_spec_text", { section: "all_claim", skey: row.SKEY, lang_cd: language }));
    const seen = new Set<string>();
    const claims = related(data, "cl_list").map(item => ({
      number: item.cl_num || "", text: clean((item.cl ?? "").replace(/<\/?ul>/gi, " ")).replace(/\s+/g, " ").replace(/^\s*\d+\s*[.．]\s*/, "").trim().slice(0, 4000),
    })).filter(item => /^\d+$/.test(item.number) && item.text && !seen.has(item.number) && seen.add(item.number)).slice(0, 200);
    return claims.length ? { language: String(data?.lang_cd || language), claims } : undefined;
  };
  const backward = async () => {
    const first = await call("get_patent_citn", { section: "backward", skey: target });
    if (!first) return undefined;
    const pages = Math.min(Number(first.last_page_no) || 1, 3);
    const all = [first, ...await Promise.all(Array.from({ length: pages - 1 }, (_, i) =>
      call("get_patent_citn", { section: "backward", skey: target, current_page_no: String(i + 2) })))];
    return {
      total: Number(first.total_cnt) || 0,
      items: all.flatMap(page => related(page, "citn_backward_list")).slice(0, 150).map(citation).filter(item => item.number),
      nonPatent: [...new Set(all.flatMap(page => related(page, "non_pat_list")).map(item => item.doc_nm).filter(Boolean))].slice(0, 40),
    };
  };
  const rights = (section: string, offices: string[], label: string) => offices.includes(country)
    ? optional(label, () => call("get_patent_rights", { section, skey: target })) : undefined;
  // Korean and Japanese trial details come in one call. US trial parties and EP board appeals are fetched only when such a proceeding exists.
  const trialTool = ({ US: ["get_patent_us_trial", "trial_exist"], KR: ["get_patent_kr_trial", "info"], JP: ["get_patent_jp_trial", "info"] } as Record<string, string[]>)[country];
  const [grantedAll, originalAll, grantedClaims, originalClaims, citations, expiry, fees, owner, pta, trials, appeals, litigation, opposition] = await Promise.all([
    granted && published ? everyClaim(granted, "등록 청구항 전체") : undefined, granted && published ? everyClaim(published, "공개 청구항 전체") : undefined,
    claimsOf(granted, "등록 청구항"), claimsOf(published, "공개 청구항"), optional("인용문헌", backward),
    rights("grt_expiry_date", ["KR", "US", "JP", "CN", "CA", "AU"], "예상 만료일"), rights("fee_grt", ["KR", "US", "EP", "AU"], "연차료"),
    rights("crrt_assn", ["KR", "US", "JP", "CA", "AU"], "현재 권리자"),
    country === "US" ? optional("존속기간 조정", () => call("get_patent_us_rights", { section: "pta", skey: target })) : undefined,
    trialTool ? optional("심판", () => call(trialTool[0], { section: trialTool[1], skey: target })) : undefined,
    country === "US" ? optional("항소심판", () => call("get_patent_us_trial", { section: "bpai_trial_info", skey: target })) : undefined,
    country === "US" ? optional("소송", () => call("get_patent_us_litigation", { section: "ligt_exist", skey: target })) : undefined,
    country === "EP" ? optional("이의신청", () => call("get_patent_ep_trial", { section: "oppnt_is_exist", skey: target })) : undefined,
  ]);
  const trialList = related(trials, "trial_list");
  const [cases, opponents, parties, boards] = await Promise.all([
    litigation?.ligt_exis === "Y" ? optional("소송 목록", () => call("get_patent_us_litigation", { section: "ligt_info", skey: target })) : undefined,
    opposition?.oppnt_yn === "Y" ? optional("이의신청 목록", () => call("get_patent_ep_trial", { section: "oppnt_info", skey: target })) : undefined,
    country === "US" && trialList.length ? optional("심판 당사자", () => call("get_patent_us_trial", { section: "ptab_trial_pers", skey: target })) : undefined,
    opposition?.appeal_yn === "Y" ? optional("불복심판", () => call("get_patent_ep_trial", { section: "trial_info", skey: target })) : undefined,
  ]);
  const adjustment = pta?.pta as Row | undefined;
  // A Korean court case is tied to the trial whose decision it reviews.
  const numbers = new Map(trialList.map(item => [item.trial_num, item.trial_char || item.trial_num]));
  const roots = new Map(related(trials, "rel_case_list").map(item => [item.rel_case_num, numbers.get(item.trial_num)]));
  const titles = new Map(related(parties, "trial_list").map(item => [item.trial_num, item.trial_title]));
  const people = related(parties, "trial_pers_list");
  const sides = (number: string | undefined) => ["청구인", "피청구인"].map(side => {
    const names = [...new Set(people.filter(item => item.trial_num === number && item.trial_pers_type === side).map(item => plain(item.nm)))];
    return names.length ? `${side} ${names.join(", ")}` : "";
  }).filter(Boolean).join(" / ");
  const docket = (row: Row | undefined) => row && { number: row.XN_D, kind: row.KC_D, date: day(row.XD) };
  return {
    retrieved: new Date().toISOString().slice(0, 10),
    subject: { country, application: own.AN_D, filed: day(own.AD), status: own.CSTK || undefined, granted: docket(granted), published: docket(published) },
    claims: { scope: independent ? "independent" : "representative", granted: grantedClaims, original: originalClaims,
      all: grantedAll && originalAll && grantedAll.language === originalAll.language ? { granted: grantedAll.claims, original: originalAll.claims } : undefined },
    citations,
    term: {
      expiry: typeof expiry?.expire_dt === "string" ? date(expiry.expire_dt) : undefined,
      adjustment: adjustment ? { total: Number(adjustment.tot_pta) || 0, applicantDelay: Number(adjustment.appt_dly_day) || 0 } : undefined,
      fees: related(fees, "fee_info_list").slice(0, 30).map(item => ({
        date: day(item.dt), label: [item.annl && item.annl + "년차", item.dscp, item.fee && item.fee + (country === "KR" ? "원" : "")].filter(Boolean).join(" · "),
      })),
      owners: related(owner, "crrt_assnee_list").map(item => item.crrt_assn || item.crrt_assn_eng).filter(Boolean),
    },
    postGrant: {
      trials: trials ? trialList.slice(0, 40).map(item => trialRecord(item, { title: titles.get(item.trial_num), parties: sides(item.trial_num), root: roots.get(item.trial_num) })) : undefined,
      appeals: appeals ? related(appeals, "trial_list").slice(0, 20).map(item => trialRecord(item)) : undefined,
      litigation: litigation ? {
        count: Number(litigation.ligt_num) || 0,
        cases: related(cases, "litigation_info_list").slice(0, 30).map(item => ({
          number: item.case_num, title: plain(item.case_title), court: item.court_nm, type: item.case_type, status: item.case_stts,
          filed: day(item.filing_dt), closed: day(item.closing_dt), outcome: [item.basis_tmnt, item.otc_judg, item.otc_comm].filter(Boolean).join(" · ") || undefined,
        })),
      } : undefined,
      opposition: opposition ? {
        count: Number(opposition.oppnt_num) || 0, appeals: Number(opposition.appeal_num) || 0,
        items: related(opponents, "oppnt_info_list").slice(0, 30).map(item => ({ filed: day(item.oppnt_dt), opponent: plain(item.oppnt), status: item.oppnt_stts, statusDate: day(item.oppnt_stts_dt) })),
        boards: related(boards, "trial_info_list").slice(0, 20).map(item => ({
          number: item.appeal_num, phase: item.appeal_phase, filed: day(item.req_dt), grounds: day(item.stmnt_filed_dt), result: item.appeal_rslt, decided: day(item.dcsn_dt),
        })),
      } : undefined,
    },
    notes,
  };
}

// Art cited against other family members, so the browser can list what this case's record does not hold.
export async function wintelipsFamilyCitations(token: string, input: unknown) {
  const body = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const members = (Array.isArray(body.members) ? body.members : []).slice(0, 10).map(familyDocument);
  if (!members.length) throw new PatentError("인용문헌을 조회할 패밀리 문헌이 없습니다.", 400);
  const call = await connect(token);
  return {
    members: await Promise.all(members.map(async ({ country, number, kind, target }) => {
      try {
        const data = await call("get_patent_citn", { section: "backward", ...target });
        return { country, number, kind: kind || undefined, total: Number(data?.total_cnt) || 0,
          items: related(data, "citn_backward_list").slice(0, 80).map(citation).filter(item => item.number) };
      } catch (error) {
        if (error instanceof AuthError) throw error;
        return { country, number, kind: kind || undefined, error: "조회 실패" };
      }
    })),
  };
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

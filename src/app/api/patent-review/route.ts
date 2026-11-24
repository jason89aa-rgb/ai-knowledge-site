import {
  addEpoPublicationPages, askReport, compareFamilyClaims, firstPageDrawing, jointReport, koreanClaimRecord, lookup, maxUpload, normalizePatent, officialCandidates, officialPdf, PatentError, selectDocuments, summarizeEvents, summarizePdf, summarizeText, uploadBytes, uploadedPdf,
} from "../../../lib/patent-review";
import {
  wintelipsCandidates, wintelipsCaseRecord, wintelipsConfigured, wintelipsDocument, wintelipsFamily, wintelipsFamilyCitations, wintelipsFamilyMember,
  wintelipsReport, withWintelips,
} from "../../../lib/wintelips";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { headers, status });
const encoder = new TextEncoder();

function failure(error: unknown) {
  return error instanceof PatentError ? error : new PatentError("특허 자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

async function search(body: { number?: unknown; country?: unknown; numberType?: unknown; source?: unknown }) {
  const official = async (notes: string[] = []) => {
    const result = await officialCandidates(body.number, body.country, body.numberType);
    return { source: "official", candidates: result.candidates, notes: [...notes, ...result.notes] };
  };
  if (body.source === "official" || (body.source !== "wintelips" && !wintelipsConfigured())) return official();
  try {
    const found = await withWintelips(token => wintelipsCandidates(token, body.number, body.country));
    // Automatic mode asks the offices when WINTELIPS does not hold the number.
    if (!found.candidates.length && body.source !== "wintelips") return official(found.notes);
    return { source: "wintelips", ...found };
  } catch (error) {
    // Automatic mode keeps working when WINTELIPS is down or its token has expired.
    if (body.source === "wintelips" || (error instanceof PatentError && error.status === 400)) throw error;
    return official([`WINTELIPS 검색 실패 · ${failure(error).message} 공식 기관 API로 검색했습니다.`]);
  }
}

function streamSummary(summarize: () => Promise<unknown>) {
  let cancelled = false;
  let beat: ReturnType<typeof setInterval> | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\n"));
      // Whitespace every few seconds keeps proxies from closing a connection that waits minutes for Claude; JSON parsing ignores it.
      beat = setInterval(() => { if (!cancelled) controller.enqueue(encoder.encode("\n")); }, 10000);
      const finish = (result: unknown) => {
        clearInterval(beat);
        if (cancelled) return;
        controller.enqueue(encoder.encode(JSON.stringify(result)));
        controller.close();
      };
      void summarize().then(finish, error => {
        const problem = failure(error);
        finish({ error: problem.message, status: problem.status, retryAfter: problem.retryAfter });
      });
    },
    cancel() { cancelled = true; clearInterval(beat); },
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": "application/json; charset=utf-8" } });
}

// WINTELIPS holds the whole case record. KIPO publishes the claims of a Korean application itself, so a Korean case keeps
// its claims when WINTELIPS cannot be reached; `limited` tells the page why the rest of the record is missing.
async function caseRecord(body: { skey?: unknown; number?: unknown; country?: unknown; application?: unknown }) {
  try {
    return await withWintelips(token => wintelipsCaseRecord(token, body));
  } catch (error) {
    if (body.country !== "KR" || (error instanceof PatentError && error.status === 400)) throw error;
    const record = await koreanClaimRecord(body.application).catch(() => undefined);
    if (!record) throw error;
    return { ...record, limited: failure(error).message };
  }
}

const sessionName = "patent_review_session";
async function sessionSignature(secret: string, expiry: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(sessionName + ":" + expiry)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function authorize(request: Request) {
  const secret = process.env.PATENT_REVIEW_ACCESS_CODE;
  if (!secret || secret.length < 16) throw new PatentError("팀용 특허 조회가 아직 설정되지 않았습니다. 예시 보고서를 확인할 수 있습니다.", 503);
  const supplied = request.headers.get("X-Patent-Access") ?? "";
  if (!supplied) {
    const cookie = /(?:^|;\s*)patent_review_session=(\d{13})\.([a-f0-9]{64})(?:;|$)/.exec(request.headers.get("Cookie") ?? "");
    // The custom header requires a CORS preflight for cross-origin calls.
    if (request.headers.get("X-Patent-Client") === "report" && request.headers.get("Origin") === new URL(request.url).origin &&
        cookie && Number(cookie[1]) > Date.now() && await sessionSignature(secret, cookie[1]) === cookie[2]) return;
    throw new PatentError("이 브라우저의 팀 인증이 필요합니다. 팀 액세스 코드를 입력해 주세요.", 401);
  }
  if (supplied.length > 200) throw new PatentError("팀 액세스 코드를 확인해 주세요.", 401);
  const [expected, actual] = await Promise.all([secret, supplied].map(code => crypto.subtle.digest("SHA-256", encoder.encode(code))));
  const a = new Uint8Array(expected);
  const b = new Uint8Array(actual);
  if (a.reduce((diff, byte, i) => diff | (byte ^ b[i]), 0)) throw new PatentError("팀 액세스 코드를 확인해 주세요.", 401);
}

export async function POST(request: Request) {
  try {
    await authorize(request);
    const content = request.headers.get("Content-Type") ?? "";
    const length = Number(request.headers.get("Content-Length"));
    if (content.startsWith("multipart/form-data;")) {
      // PDFs arrive as base64 text, a third larger than the files themselves.
      if (length > maxUpload * 4 / 3 + 65536) throw new PatentError("3.5 MiB 이하의 PDF를 올려 주세요.", 413);
      const form = await request.formData().catch(() => { throw new PatentError("PDF를 다시 선택해 주세요.", 400); });
      if (form.get("action") === "joint-report") {
        const files = form.getAll("document");
        const context = form.get("context");
        const focus = form.get("focus") || "";
        if (typeof context !== "string" || context.length > 30000 || typeof focus !== "string" || focus.length > 2000 ||
            !files.length || files.length > 8 || !files.every((file): file is File => typeof file !== "string" && file.size > 0) ||
            files.reduce((size, file) => size + uploadBytes(file), 0) > maxUpload) throw new PatentError("선택한 원문 묶음의 크기 또는 형식을 확인해 주세요.", 400);
        return streamSummary(() => jointReport(files, context, focus));
      }
      const file = form.get("pdf");
      if (!file || typeof file === "string") throw new PatentError("요약할 PDF 파일을 선택해 주세요.", 400);
      if (uploadBytes(file) > maxUpload) throw new PatentError("3.5 MiB 이하의 PDF를 올려 주세요.", 413);
      const data = await uploadedPdf(file, "유효한 PDF 파일을 올려 주세요.");
      return streamSummary(() => summarizePdf(data, file.name.slice(0, 180), "사용자 업로드"));
    }
    // An AI request carries the report or claims the browser already holds, so it gets a larger body limit.
    const large = request.headers.get("X-Patent-Action");
    const limit = large === "ask" ? 600000 : large === "select-documents" ? 200000 : large === "family-compare" ? 160000 : 8192;
    if (!content.startsWith("application/json") || length > limit) throw new PatentError("요청 형식을 확인해 주세요.", 400);
    const body = await request.json().catch(() => null);
    if (large === "ask" && body?.action === "ask") return streamSummary(() => askReport(body.report, body.prompt));
    if (large === "select-documents" && body?.action === "select-documents") return streamSummary(() => selectDocuments(body.documents, body.case));
    if (large === "family-compare" && body?.action === "family-compare") return streamSummary(() => compareFamilyClaims(body));
    if (body?.action === "family") return json(await withWintelips(token => wintelipsFamily(token, body)));
    if (body?.action === "family-member") return json(await withWintelips(token => wintelipsFamilyMember(token, body)));
    if (body?.action === "family-citations") return json(await withWintelips(token => wintelipsFamilyCitations(token, body)));
    if (body?.action === "case-record") return json(await caseRecord(body));
    if (body?.action === "search") {
      const result = json(await search(body));
      if (request.headers.get("X-Patent-Access")) {
        const expiry = String(Date.now() + 8 * 60 * 60 * 1000);
        const signature = await sessionSignature(process.env.PATENT_REVIEW_ACCESS_CODE!, expiry);
        const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
        result.headers.append("Set-Cookie", `${sessionName}=${expiry}.${signature}; HttpOnly; SameSite=Strict; Path=/api/patent-review${secure}`);
      }
      return result;
    }
    if (body?.source === "wintelips") {
      if (body.action === "lookup") {
        const report = await withWintelips(token => wintelipsReport(token, body.skey));
        return json({ ...report, canSummarize: Boolean(process.env.ANTHROPIC_API_KEY) });
      }
      if (body.action === "summarize-events") {
        return streamSummary(async () => {
          const report = await withWintelips(token => wintelipsReport(token, body.skey));
          if (!report.events.length) throw new PatentError("요약할 공개 이력을 찾지 못했습니다.", 404);
          return summarizeEvents(report);
        });
      }
      if (body.action === "prepare-text") {
        const doc = await withWintelips(token => wintelipsDocument(token, body.skey, body.code, body.id));
        return json({ text: doc.text.slice(0, 60000) });
      }
      if (body.action === "summarize") {
        return streamSummary(async () => {
          const document = await withWintelips(token => wintelipsDocument(token, body.skey, body.code, body.id));
          return summarizeText(document.title, "WINTELIPS", document.text);
        });
      }
      throw new PatentError("WINTELIPS 자료는 원문 PDF를 제공하지 않습니다.", 400);
    }
    if (body?.action === "lookup") {
      const report = await lookup(normalizePatent(body.number, body.country, body.numberType));
      await addEpoPublicationPages(report);
      return json({ ...report, canSummarize: Boolean(process.env.ANTHROPIC_API_KEY) });
    }
    if (body?.action === "summarize-events") {
      const patent = normalizePatent(body.number, body.country, body.numberType);
      return streamSummary(async () => {
        const report = await lookup(patent);
        if (!report.events.length) throw new PatentError("요약할 공개 이력을 찾지 못했습니다.", 404);
        return summarizeEvents(report);
      });
    }
    if (body?.action === "summarize") {
      return streamSummary(async () => {
        const document = await officialPdf(body.country, body.application, body.id, body.code, 12 * 1024 * 1024);
        return summarizePdf(document.bytes, document.title, document.source);
      });
    }
    if (body?.action === "drawing") {
      const bytes = await firstPageDrawing(body.number);
      if (!bytes) throw new PatentError("이 공보의 대표도면을 찾지 못했습니다.", 404);
      return new Response(bytes.buffer, { headers: { ...headers, "Content-Type": "image/png" } });
    }
    if (body?.action === "download") {
      const document = await officialPdf(body.country, body.application, body.id, body.code, 4 * 1024 * 1024);
      return new Response(document.bytes.buffer, {
        headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="patent-document.pdf"' },
      });
    }
    throw new PatentError("요청 형식을 확인해 주세요.", 400);
  } catch (error) {
    const problem = failure(error);
    return json({ error: problem.message, retryAfter: problem.retryAfter }, problem.status);
  }
}

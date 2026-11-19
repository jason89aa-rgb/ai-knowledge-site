import { isPdf, lookup, maxUpload, normalizePatent, officialPdf, PatentError, summarizeEvents, summarizePdf, type Report } from "../../../lib/patent-review";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { headers, status });
const encoder = new TextEncoder();

function failure(error: unknown) {
  return error instanceof PatentError ? error : new PatentError("특허 자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
}

function streamJson(run: (send: (result: unknown) => void, active: () => boolean) => Promise<unknown>, contentType: string) {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode("\n"));
      const send = (result: unknown) => {
        if (!cancelled) controller.enqueue(encoder.encode(JSON.stringify(result) + "\n"));
      };
      void run(send, () => !cancelled).catch(error => send({ error: failure(error).message })).finally(() => {
        if (!cancelled) controller.close();
      });
    },
    cancel() { cancelled = true; },
  });
  return new Response(stream, { headers: { ...headers, "Content-Type": contentType + "; charset=utf-8" } });
}

const streamSummary = (summarize: () => Promise<unknown>) => streamJson(async send => send(await summarize()), "application/json");

function priorityDocuments(r: Report) {
  const groups = {
    KR: [/^(RE|RG)$/, /^OP$/],
    US: [/^(CTFR|NOA|N\/=\.)$/, /^(CTNF|CTRS|CTAV)$/, /^(REM|A\.N[EFP]|A\.AF)$/],
    EP: [/^A[34]$/, /^A1$/],
  };
  const order = groups[r.country as keyof typeof groups] ?? [];
  const docs = r.documents.filter(doc => doc.downloadable);
  const ranked = order.flatMap(pattern => docs.filter(doc => pattern.test(doc.code ?? "")));
  const firstOfEach = order.flatMap(pattern => docs.find(doc => pattern.test(doc.code ?? "")) ?? []);
  return Array.from(new Map([...firstOfEach, ...ranked].map(doc => [doc.id, doc])).values()).slice(0, 3);
}

async function review(patent: ReturnType<typeof normalizePatent>, send: (result: unknown) => void, active: () => boolean) {
  const report = await lookup(patent);
  const selected = priorityDocuments(report);
  send({ type: "report", report });
  if (!process.env.ANTHROPIC_API_KEY && (selected.length || report.events.length)) {
    send({ type: "note", text: "Claude API 키가 서버에 설정되면 자동 요약을 사용할 수 있습니다." });
    send({ type: "complete" });
    return;
  }
  let summarized = 0;
  for (const [index, doc] of selected.entries()) {
    if (!active()) return;
    send({ type: "progress", text: `공개 원문 요약 중 (${index + 1}/${selected.length}) · ${doc.title}` });
    try {
      const pdf = await officialPdf(report.country, report.application, doc.id, doc.code, 12 * 1024 * 1024);
      if (!active()) return;
      const summary = await summarizePdf(pdf.bytes, pdf.title, pdf.source);
      send({ type: "summary", summary: { ...summary, id: doc.id } });
      summarized++;
    } catch (error) {
      send({ type: "note", text: `${doc.title} (${doc.id}) · ${failure(error).message}` });
    }
  }
  if (active() && !summarized && report.events.length) {
    send({ type: "progress", text: "기관에서 제공한 공개 이력을 요약하고 있습니다." });
    try {
      send({ type: "summary", summary: await summarizeEvents(report) });
    } catch (error) {
      send({ type: "note", text: `공개 이력 요약 · ${failure(error).message}` });
    }
  }
  send({ type: "complete" });
}

async function authorize(request: Request) {
  const secret = process.env.PATENT_REVIEW_ACCESS_CODE;
  if (!secret || secret.length < 16) throw new PatentError("팀용 특허 조회가 아직 설정되지 않았습니다. 예시 보고서를 확인할 수 있습니다.", 503);
  const supplied = request.headers.get("X-Patent-Access") ?? "";
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
      if (length > maxUpload + 32768) throw new PatentError("3.5 MiB 이하의 PDF를 올려 주세요.", 413);
      const form = await request.formData().catch(() => { throw new PatentError("PDF를 다시 선택해 주세요.", 400); });
      const file = form.get("pdf");
      if (!file || typeof file === "string") throw new PatentError("요약할 PDF 파일을 선택해 주세요.", 400);
      if (file.size > maxUpload) throw new PatentError("3.5 MiB 이하의 PDF를 올려 주세요.", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isPdf(bytes)) throw new PatentError("유효한 PDF 파일을 올려 주세요.", 400);
      return streamSummary(() => summarizePdf(bytes, file.name.slice(0, 180), "사용자 업로드"));
    }
    if (!content.startsWith("application/json") || length > 8192) throw new PatentError("요청 형식을 확인해 주세요.", 400);
    const body = await request.json().catch(() => null);
    if (body?.action === "review") {
      const patent = normalizePatent(body.number, body.country, body.numberType);
      return streamJson((send, active) => review(patent, send, active), "application/x-ndjson");
    }
    if (body?.action === "lookup") {
      return json(await lookup(normalizePatent(body.number, body.country, body.numberType)));
    }
    if (body?.action === "summarize") {
      return streamSummary(async () => {
        const document = await officialPdf(body.country, body.application, body.id, body.code, 12 * 1024 * 1024);
        return summarizePdf(document.bytes, document.title, document.source);
      });
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
    return json({ error: problem.message }, problem.status);
  }
}

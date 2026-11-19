import { isPdf, lookup, maxUpload, normalizePatent, officialPdf, PatentError, summarizePdf } from "../../../lib/patent-review";

export const runtime = "nodejs";
export const maxDuration = 90;
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (body: unknown, status = 200) => Response.json(body, { headers, status });
const encoder = new TextEncoder();

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
      if (!(file instanceof File)) throw new PatentError("요약할 PDF 파일을 선택해 주세요.", 400);
      if (file.size > maxUpload) throw new PatentError("3.5 MiB 이하의 PDF를 올려 주세요.", 413);
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!isPdf(bytes)) throw new PatentError("유효한 PDF 파일을 올려 주세요.", 400);
      return json(await summarizePdf(bytes, file.name.slice(0, 180), "사용자 업로드"));
    }
    if (!content.startsWith("application/json") || length > 8192) throw new PatentError("요청 형식을 확인해 주세요.", 400);
    const body = await request.json().catch(() => null);
    if (body?.action === "lookup") {
      return json(await lookup(normalizePatent(body.number, body.country, body.numberType)));
    }
    if (body?.action === "download" || body?.action === "summarize") {
      const document = await officialPdf(body.country, body.application, body.id, body.code, body.action === "download" ? 4 * 1024 * 1024 : 12 * 1024 * 1024);
      if (body.action === "summarize") return json(await summarizePdf(document.bytes, document.title, document.source));
      return new Response(document.bytes.buffer, {
        headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="patent-document.pdf"' },
      });
    }
    throw new PatentError("요청 형식을 확인해 주세요.", 400);
  } catch (error) {
    if (error instanceof PatentError) return json({ error: error.message }, error.status);
    return json({ error: "특허 자료를 처리하지 못했습니다. 잠시 후 다시 시도해 주세요." }, 502);
  }
}

const usDossier = "https://globaldossier.uspto.gov/";
const epRegister = "https://register.epo.org/";
const maxPages = 80;
const maxScanPages = 10;

// A bare number with no country code can belong to several offices; list the readings the user can pick from.
export function localCandidates(input, office, numberType) {
  const raw = input.normalize("NFKC").trim().toUpperCase();
  if (office !== "auto" || /^(?:KR|US|EP|CN|ZL|WO|JP|CA|AU|GB|DE|FR|UPC)|^(?:CFI|COA|ACT|APL|APP|ORD)[_ -]?\d/.test(raw)) return [];
  const digits = raw.replace(/[\s,./-]/g, "").replace(/(?<=\d)[A-Z]\d?$/, "");
  const readings = /^(10|20)\d{11}$/.test(digits) ? [["KR", "auto", "KR 출원·공개번호"]]
    : /^(10|20)\d{7}$/.test(digits) ? [["KR", "grant", "KR 등록번호"]]
      : /^\d{8}$/.test(digits) ? [["US", "grant", "US 등록번호"], ["US", "application", "US 출원번호"], ["EP", "application", "EP 출원번호"]]
        : /^\d{7}$/.test(digits) ? [["US", "grant", "US 등록번호"], ["EP", "publication", "EP 공개·등록번호"]]
          : /^20\d{9}$/.test(digits) ? [["US", "publication", "US 공개번호"]] : [];
  return readings.filter(([, type]) => numberType === "auto" || type === "auto" || type === numberType)
    .map(([country, type, matched]) => ({ country, numberType: numberType === "auto" ? type : numberType, matched }));
}

export function localReport(input, office, numberType) {
  const raw = input.normalize("NFKC").trim().toUpperCase();
  const isCourt = /^(?:UPC[_ -])?(?:CFI|COA|ACT|APL|APP|ORD)[_ -]?\d{1,7}\s*\/\s*20\d{2}$/.test(raw);
  const prefix = raw.match(/^(KR|US|EP|CN|ZL|WO|JP|CA|AU|GB|DE|FR)\s*(?=[\d-]|(?:D|RE|PP)\d)/)?.[1];
  const detected = isCourt ? "UPC" : prefix === "ZL" ? "CN" : prefix;
  const country = office === "auto" ? detected || (/^\d{2}\//.test(raw) ? "US" : "KR") : office;
  if (detected && country !== detected) throw new Error("입력한 번호와 선택한 관할이 일치하는지 확인해 주세요.");

  const report = { country, query: raw, title: "", local: true, source: "공식 열람처 · 직접 정리",
    retrievedAt: new Date().toISOString(), links: [], family: [], events: [], documents: [], summaries: [], notes: [] };
  const add = (label, url) => report.links.push({ label, url });

  if (country === "UPC") {
    if (!isCourt) throw new Error("UPC_CFI_123/2025 형식으로 사건번호를 입력해 주세요.");
    add("UPC 공개 결정·명령", "https://www.unifiedpatentcourt.org/en/decisions-and-orders");
    report.notes.push("법원 사이트에서 사건번호를 검색하고 열람 가능한 결정문 PDF를 내려받으세요.");
    return report;
  }

  const compact = raw.slice(prefix?.length ?? 0).replace(/[\s,/-]/g, "");
  const match = compact.match(/^((?:D|RE|PP)?\d{5,14})(?:\.[\dX])?([A-Z]\d?)?$/);
  if (!match) throw new Error("특허번호를 확인해 주세요. 미국 번호만 입력할 때는 관할을 미국으로 선택하세요.");
  const [, digits, kind = ""] = match;
  if (office === "auto" && !detected && country === "KR" && !/^(10|20)\d{7}(?:\d{4})?$/.test(digits)) {
    throw new Error("국가 코드를 붙여 입력하거나 검색 설정에서 관할을 선택해 주세요. 예: US11234231, EP4286919A1. 국가 코드가 없는 번호는 한국 번호로 조회합니다.");
  }
  const looksLikeApplication = country === "US" ? /^\d{8}$/.test(digits) && !kind && (!raw.includes(",") || raw.includes("/"))
    : country === "KR" ? digits.length === 13 && !kind
      : country === "EP" ? digits.length === 8 && !kind
        : country === "CN" ? digits.length === 12 || prefix === "ZL" : false;
  const application = numberType === "application" || (numberType === "auto" && looksLikeApplication);
  const yearlessUsSerial = country === "US" && application && /^\d{8}$/.test(digits);

  if (!looksLikeApplication || (numberType !== "auto" && !application)) {
    // Korean publication identifiers in Espacenet omit the domestic rights prefix.
    const published = country === "KR" && /^(10|20)\d{11}$/.test(digits) ? digits.slice(2) : digits;
    const query = `${application ? "ap" : "pn"}=${country}${published}${application ? "" : kind}`;
    if (!yearlessUsSerial) add("Espacenet · 서지·패밀리", "https://worldwide.espacenet.com/patent/search?q=" + encodeURIComponent(query));
  } else if (country !== "US" && country !== "KR") {
    add("Espacenet · 번호 검색", "https://worldwide.espacenet.com/patent/search?q=" + encodeURIComponent("ap=" + country + digits));
  }

  if (country === "US") {
    add("Global Dossier · 미국 공개 심사철", usDossier);
    add("USPTO Patent Center · 본인 인증 필요", yearlessUsSerial
      ? "https://patentcenter.uspto.gov/applications/" + digits + "/ifw/docs" : "https://patentcenter.uspto.gov/");
    report.notes.push("Global Dossier에서 관할을 US로 선택하고 번호 유형과 번호를 입력하세요. Espacenet 검색 결과에서도 공개 파일이 있으면 Global Dossier로 이동할 수 있습니다.");
  } else if (country === "EP") {
    add("European Patent Register · 심사 문서", application && digits.length === 8
      ? epRegister + "application?number=EP" + digits + "&lng=en&tab=doclist"
      : epRegister + "smartSearch?query=" + encodeURIComponent("pn=EP" + digits));
    report.notes.push("Register에서 해당 건을 연 뒤 All documents에서 심사 문서를 내려받으세요.");
  } else if (country === "KR") {
    add("KIPRIS · 통합행정정보", application && /^(10|20)\d{11}$/.test(digits)
      ? "https://www.kipris.or.kr/link/APP_link/APP_PATENT.jsp?APPLNO=" + digits : "https://www.kipris.or.kr/");
    report.notes.push("KIPRIS에서 번호를 검색하고 통합행정정보의 공개 문서를 열어 주세요.");
  } else if (country === "CN") {
    add("CNIPA · 중국 심사 기록", "https://cpquery.cponline.cnipa.gov.cn/");
    add("Global Dossier · 공개 심사철", usDossier);
    report.notes.push("CNIPA 또는 Global Dossier에서 번호를 검색해 열람 가능한 원문을 확인하세요.");
  } else {
    add("Global Dossier 안내", "https://www.epo.org/en/searching-for-patents/legal/register");
    report.notes.push("Espacenet에서 서지와 패밀리를 확인하고, 참여 기관이 공개한 심사철을 열람할 수 있습니다.");
  }
  return report;
}

const signals = [
  ["판단·거절 사유", /\breject(?:s|ed|ion|ions)?\b|35\s*U\.?\s*S\.?\s*C|obvious(?:ness)?|lack of (?:novelty|inventive step)|refus(?:al|ed)|거절|진보성|신규성|驳回|创造性|neuartigkeit|erfinderische|nouveauté|activité inventive/giu],
  ["관련 청구항", /\bclaims?\s+(?:nos?\.?\s*)?\d|청구항\s*(?:제\s*)?\d|权利要求\s*\d|patentanspr(?:uch|üche)\s*\d|revendications?\s*\d/giu],
  ["선행문헌·인용", /prior art|\bD[1-9]\d?\b|\b(?:US|EP|WO|CN|KR|JP)[ .-]*\d{6,}|인용발명|선행문헌|现有技术|对比文件|stand der technik|état de la technique/giu],
  ["보정·답변·기한", /\bamend(?:ed|ment|ments)?\b|response|reply|deadline|within\s+(?:\d+|two|three|six)\s+months?|보정|의견서|제출기한|补正|答复|frist|délai/giu],
];

function summarizePages(pages, caveats) {
  const segmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "sentence" }) : undefined;
  const candidates = pages.flatMap(({ page, text, scanned }) => {
    const parts = segmenter ? Array.from(segmenter.segment(text), part => part.segment) : text.split(/(?<=[.!?。！？])\s*|\n/);
    return parts.flatMap(part => {
      const clean = part.replace(/\s+/g, " ").trim();
      if (clean.length < 22) return [];
      const pieces = clean.match(/.{1,420}(?:\s|$)|.{1,420}/gu) ?? [];
      return pieces.map(piece => ({ page, scanned, text: piece.trim() }));
    });
  });
  const selected = new Set();
  const format = item => `• ${item.text} (PDF p. ${item.page}${item.scanned ? ", 문자 인식" : ""})`;
  const sections = signals.flatMap(([heading, pattern]) => {
    const results = candidates.map(item => ({ ...item, hits: Array.from(item.text.matchAll(pattern)).length }))
      .filter(item => item.hits > 0).sort((a, b) => b.hits - a.hits || a.page - b.page);
    const lines = [];
    for (const item of results) {
      if (selected.has(item.text)) continue;
      selected.add(item.text);
      lines.push(format(item));
      if (lines.length === 2) break;
    }
    return lines.length ? [heading + "\n" + lines.join("\n")] : [];
  });
  if (!sections.length) {
    const excerpts = candidates.slice(0, 4).map(format);
    if (excerpts.length) sections.push("주요 본문 발췌\n" + excerpts.join("\n"));
  }
  if (!sections.length) throw new Error("읽을 수 있는 본문을 찾지 못했습니다. 스캔 언어를 확인하거나 텍스트가 포함된 PDF로 다시 시도해 주세요.");
  if (caveats.length) sections.push("처리 범위\n" + caveats.join("\n"));
  return sections.join("\n\n");
}

let tesseractScript;
function loadOcr() {
  if (!tesseractScript) {
    tesseractScript = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "/patent-assets/ocr/tesseract.min.js";
      script.addEventListener("load", () => resolve(window.Tesseract), { once: true });
      script.addEventListener("error", () => {
        tesseractScript = undefined;
        script.remove();
        reject(new Error("스캔 처리 모듈을 불러오지 못했습니다."));
      }, { once: true });
      document.head.append(script);
    });
  }
  return tesseractScript;
}

async function scanPage(pdfPage, worker) {
  const base = pdfPage.getViewport({ scale: 1 });
  const scale = Math.min(2.25, 2100 / Math.max(base.width, base.height));
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  try {
    await pdfPage.render({ canvasContext: canvas.getContext("2d", { alpha: false }), viewport }).promise;
    const { data } = await worker.recognize(canvas);
    return data.text;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

export async function summarizeLocal(file, language, progress) {
  const base = "/patent-assets";
  const pdfjs = await import("/patent-assets/pdf/pdf.min.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = base + "/pdf/pdf.worker.min.mjs";
  const task = pdfjs.getDocument({
    data: await file.arrayBuffer(), isEvalSupported: false, enableXfa: false,
    maxImageSize: 16000000, canvasMaxAreaInBytes: 64000000,
    cMapUrl: base + "/pdf/cmaps/", standardFontDataUrl: base + "/pdf/standard_fonts/",
    wasmUrl: base + "/pdf/wasm/", iccUrl: base + "/pdf/iccs/",
  });
  task.onPassword = () => { void task.destroy(); };
  let worker;
  try {
    const pdf = await task.promise;
    const pages = [];
    const limit = Math.min(pdf.numPages, maxPages);
    let scanned = 0;
    let missed = 0;
    let ocrUnavailable = false;
    for (let page = 1; page <= limit; page++) {
      progress(`${page}/${limit}쪽 확인 중`);
      const pdfPage = await pdf.getPage(page);
      const content = await pdfPage.getTextContent();
      let text = content.items.map(item => ("str" in item ? item.str + (item.hasEOL ? "\n" : " ") : "")).join("").trim();
      let usedOcr = false;
      if (text.replace(/[^\p{L}\p{N}]/gu, "").length < 32) {
        if (scanned < maxScanPages && !ocrUnavailable) {
          try {
            if (!worker) {
              progress("스캔 문자 인식 준비 중");
              const ocr = await loadOcr();
              worker = await ocr.createWorker(language === "eng" ? "eng" : ["eng", language], 1, {
                workerPath: base + "/ocr/worker.min.js", corePath: base + "/ocr/", langPath: base + "/ocr/lang",
                workerBlobURL: false, errorHandler: () => {},
              });
            }
            progress(`${page}/${limit}쪽 스캔 문자 인식 중`);
            text = (await scanPage(pdfPage, worker)).trim() || text;
            usedOcr = true;
            scanned++;
          } catch {
            ocrUnavailable = true;
          }
        }
        if (!usedOcr) missed++;
      }
      if (text) pages.push({ text, page, scanned: usedOcr });
      pdfPage.cleanup();
    }
    const notes = [];
    if (limit < pdf.numPages) notes.push(`전체 ${pdf.numPages}쪽 중 처음 ${limit}쪽을 읽었습니다.`);
    if (missed) notes.push(`스캔 ${missed}쪽의 본문을 건너뛰었습니다. 필요한 페이지만 나눠 다시 선택할 수 있습니다.`);
    if (scanned) notes.push("문자 인식으로 읽은 부분은 번호·법조문을 PDF 원문과 대조하세요.");
    return { title: file.name, source: "사용자 선택 PDF", model: "브라우저 원문 발췌", text: summarizePages(pages, notes) };
  } catch (error) {
    if (error.name === "PasswordException" || /destroyed|password/i.test(error.message)) {
      throw new Error("암호 없이 열리는 PDF를 선택해 주세요.");
    }
    if (error.name === "InvalidPDFException") throw new Error("열 수 없는 PDF입니다. 원본 파일을 다시 내려받아 선택해 주세요.");
    throw error;
  } finally {
    if (worker) await worker.terminate();
    await task.destroy();
  }
}

// Lists the PDFs inside a ZIP (such as the European Patent Register "All documents" archive) without a library.
// Each entry decompresses only when read, so a large archive does not inflate every file at once.
export async function readZipPdfs(file, maxEntries = 200) {
  const data = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let end = -1;
  for (let i = data.length - 22; i >= Math.max(0, data.length - 65557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { end = i; break; }
  }
  if (end < 0) throw new Error("ZIP 파일을 읽지 못했습니다. Register에서 ZIP Archive로 받은 파일인지 확인해 주세요.");
  const count = view.getUint16(end + 10, true);
  let offset = view.getUint32(end + 16, true);
  if (count === 0xffff || offset === 0xffffffff) throw new Error("4 GB를 넘는 ZIP(ZIP64)은 지원하지 않습니다.");
  const entries = [];
  for (let n = 0; n < count; n++) {
    if (offset + 46 > data.length || view.getUint32(offset, true) !== 0x02014b50) throw new Error("ZIP 목차가 손상되었습니다.");
    const flags = view.getUint16(offset + 8, true);
    const method = view.getUint16(offset + 10, true);
    const compressed = view.getUint32(offset + 20, true);
    const size = view.getUint32(offset + 24, true);
    const nameLength = view.getUint16(offset + 28, true);
    const skip = nameLength + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true);
    const local = view.getUint32(offset + 42, true);
    const path = new TextDecoder().decode(data.subarray(offset + 46, offset + 46 + nameLength));
    offset += 46 + skip;
    if (!/\.pdf$/i.test(path) || path.endsWith("/")) continue;
    if (entries.length >= maxEntries) break;
    const entry = { name: path.split("/").pop(), path, size, encrypted: Boolean(flags & 1) };
    entry.read = () => inflateEntry(data, view, local, compressed, method, entry);
    entries.push(entry);
  }
  return entries;
}

async function inflateEntry(data, view, local, compressed, method, entry) {
  if (entry.encrypted) throw new Error("암호가 걸린 파일은 열 수 없습니다.");
  if (view.getUint32(local, true) !== 0x04034b50) throw new Error("ZIP 항목이 손상되었습니다.");
  const start = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
  const raw = data.subarray(start, start + compressed);
  if (method === 0) return raw.slice();
  if (method !== 8) throw new Error("지원하지 않는 압축 방식입니다.");
  const stream = new Blob([raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

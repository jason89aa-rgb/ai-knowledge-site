export class InputError extends Error {}

export type Evidence = { id: string; label: string; text: string };
type Claim = { id: number; text: string; start: number; end: number };
export const labels = ["일치", "표현 수정", "불일치", "근거 부족", "검토 제외"] as const;
type Finding = { claim: number; status: string; evidence: string[]; reason: string; suggestion: string };

function field(value: unknown, max: number, label: string): string {
  if (typeof value !== "string" || value.length > max) throw new InputError(`${label} 입력을 확인해 주세요 (최대 ${max.toLocaleString("ko-KR")}자).`);
  return value;
}

// Keep the original CSV record (including quoted newlines) for the source viewer.
function readCSV(source: string) {
  const records: { cells: string[]; raw: string }[] = [];
  let cells: string[] = [], cell = "", quoted = false, closed = false, start = 0;
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === undefined) throw new InputError("CSV에서 닫히지 않은 큰따옴표가 있습니다.");
      if (c === '"' && source[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else cell += c;
    } else if (c === "," || c === "\n" || c === "\r" || c === undefined) {
      cells.push(cell.trim());
      cell = ""; closed = false;
      if (c === ",") continue;
      const raw = source.slice(start, i);
      if (raw.trim()) records.push({ cells, raw });
      if (c === "\r" && source[i + 1] === "\n") i++;
      cells = []; start = i + 1;
    } else if (c === '"' && !cell && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new InputError("CSV 따옴표와 쉼표 구분을 확인해 주세요.");
      cell += c;
    }
  }
  if (records.length < 2 || records.length > 101) throw new InputError("CSV는 제목 행과 데이터 1~100행을 입력해 주세요.");
  const headers = records[0].cells;
  if (headers.some(h => !h) || new Set(headers).size !== headers.length || headers.length > 30 ||
      records.some(r => r.cells.length !== headers.length)) throw new InputError("CSV 제목은 고유해야 하며 각 행의 열 수가 같아야 합니다 (최대 30열).");
  return { header: records[0], rows: records.slice(1) };
}

function numberCell(value: string): number {
  if (!/^[+-]?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(value)) throw new InputError("계산할 열에는 빈칸 없이 숫자를 입력해 주세요. 검산 없이 읽으려면 계산할 열 이름을 지우세요.");
  const n = Number(value.replace(/,/g, ""));
  if (!Number.isFinite(n) || Math.abs(n) > 1e12) throw new InputError("검산 값은 절댓값 1조 이하로 입력해 주세요.");
  return n;
}
const fmt = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 6 });

function csvEvidence(source: string, valueColumn: string, baseColumn: string) {
  const { header, rows } = readCSV(source);
  const records: Evidence[] = [{ id: "H", label: "CSV 제목 행", text: header.raw }];
  rows.forEach((row, i) => records.push({ id: `R${i + 1}`, label: `데이터 ${i + 1}행`, text: row.raw }));
  const calculations: Evidence[] = [];
  const add = (label: string, text: string) => calculations.push({ id: `C${calculations.length + 1}`, label, text });
  if (!valueColumn && !baseColumn) return { records, calculations };
  const a = header.cells.indexOf(valueColumn), b = header.cells.indexOf(baseColumn);
  if (a < 0 || (baseColumn && (b < 0 || b === a))) throw new InputError("계산할 열 이름은 CSV 제목과 같아야 합니다. 분모에는 다른 열을 입력하세요.");
  const values = rows.map(r => numberCell(r.cells[a]));
  add(`${valueColumn} 합계`, `데이터 1~${rows.length}행 합계 = ${fmt(values.reduce((x, y) => x + y, 0))}`);
  if (b < 0) return { records, calculations };
  const bases = rows.map(r => numberCell(r.cells[b]));
  add(`${baseColumn} 합계`, `데이터 1~${rows.length}행 합계 = ${fmt(bases.reduce((x, y) => x + y, 0))}`);
  const rates = values.map((v, i) => bases[i] === 0 ? null : v / bases[i] * 100);
  rates.forEach((rate, i) => add(`${i + 1}행 · ${valueColumn}/${baseColumn}`,
    rate === null ? "분모가 0이어서 비율을 계산할 수 없습니다." : `${fmt(values[i])} ÷ ${fmt(bases[i])} × 100 = ${fmt(rate)}%`));
  const first = rates[0], last = rates[rates.length - 1];
  if (rates.length > 1 && first !== null && last !== null) {
    add("첫 행 대비 마지막 행의 비율 차이", `${fmt(last)}% − ${fmt(first)}% = ${fmt(last - first)}%포인트`);
    if (first !== 0) add("첫 행 대비 마지막 행의 상대 변화율", `(${fmt(last)} − ${fmt(first)}) ÷ ${fmt(first)} × 100 = ${fmt((last - first) / first * 100)}%`);
  }
  return { records, calculations };
}

export function prepare(input: Record<string, unknown>) {
  const source = field(input.source, 12000, "원본").replace(/^\uFEFF/, "");
  const draft = field(input.draft, 3000, "초안");
  if (!source.trim() || !draft.trim()) throw new InputError("원본 자료와 보고서 초안을 모두 입력해 주세요.");
  if (input.format !== "text" && input.format !== "csv") throw new InputError("자료 형식을 확인해 주세요.");
  const claims: Claim[] = [];
  // Preserve offsets in the submitted draft so accepting one edit never rewrites adjacent text.
  const sentences = /[^\r\n]+?(?:[.!?。]+(?=\s|$)|(?=\r|\n|$))/gu;
  let m;
  while ((m = sentences.exec(draft))) {
    const text = m[0].trim();
    if (!text) continue;
    const start = m.index + m[0].indexOf(text);
    claims.push({ id: claims.length + 1, text, start, end: start + text.length });
  }
  if (!claims.length || claims.length > 12) throw new InputError("한 번에 최대 12문장까지 검토할 수 있습니다. 초안을 나누어 주세요.");
  const sourceData = input.format === "csv" ? csvEvidence(source,
    field(input.valueColumn ?? "", 120, "계산 열").trim(), field(input.baseColumn ?? "", 120, "분모 열").trim()) : {
    records: source.split(/\r\n|[\r\n]/).map((text, i) => ({ id: `L${i + 1}`, label: `원문 ${i + 1}행`, text })).filter(r => r.text.trim()), calculations: [],
  };
  if (sourceData.records.length > 200) throw new InputError("원문은 200행 이하로 나누어 주세요.");
  return { claims, ...sourceData };
}

export const findingsSchema = {
  type: "object", additionalProperties: false, required: ["findings"],
  properties: { findings: { type: "array", items: {
    type: "object", additionalProperties: false, required: ["claim", "status", "evidence", "reason", "suggestion"],
    properties: { claim: { type: "integer" }, status: { type: "string", enum: [...labels] },
      evidence: { type: "array", items: { type: "string" } }, reason: { type: "string" }, suggestion: { type: "string" } },
  } } },
};

export function resolveFindings(output: unknown, data: ReturnType<typeof prepare>) {
  const rows: unknown = (output as { findings?: unknown } | null)?.findings;
  const evidence = new Map([...data.records, ...data.calculations].map(e => [e.id, e]));
  const invalid = () => new Error("Invalid review response");
  if (!Array.isArray(rows) || rows.length !== data.claims.length) throw invalid();
  return data.claims.map(claim => {
    const row = rows.find(r => r?.claim === claim.id) as Finding | undefined;
    if (!row || !labels.some(l => l === row.status) || typeof row.reason !== "string" || !row.reason.trim() ||
        typeof row.suggestion !== "string" || !Array.isArray(row.evidence) || row.evidence.some(id => !evidence.has(id))) throw invalid();
    if (!row.evidence.length && ["일치", "표현 수정", "불일치"].includes(row.status)) throw invalid();
    return { ...claim, status: row.status, reason: row.reason, suggestion: row.suggestion,
      evidence: [...new Set(row.evidence)].map(id => evidence.get(id)!) };
  });
}

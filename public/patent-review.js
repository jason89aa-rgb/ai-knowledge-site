"use strict";

const by = id => document.getElementById(id);
const facts = [
  ["application", "출원번호"], ["publication", "공개번호"], ["grant", "등록번호"],
  ["filed", "출원일"], ["published", "공개일"], ["granted", "등록일"],
  ["status", "기관 표시 상태"], ["applicants", "출원인"], ["inventors", "발명자"],
];
const examples = {
  auto: "10-2023-0010262, US 11,234,231, EP4286919", KR: "10-2023-0010262", US: "US 2014-0167116 A1", EP: "EP4286919A1",
  CN: "CN101876751A", UPC: "UPC_CFI_123/2025", WO: "WO2023232483A1", JP: "JP2020123456A",
};
let current;
let standaloneReport;
let searchVersion = 0;
let activeSearch;
let processing = false;
const isAutomaticMode = () => by("lookup").elements.mode.value === "api";
const localTools = () => import("/patent-review-local.mjs?v=20261120-epo-review");

function el(tag, text = "", className = "") {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function say(id, text, error = false) {
  const element = by(id);
  element.textContent = text;
  element.classList.toggle("error", error);
}

function link(source) {
  const element = el("a", source.label + " ↗");
  const url = new URL(source.url);
  if (url.protocol !== "https:") return el("span", source.label);
  element.href = url.href;
  element.target = "_blank";
  element.rel = "noopener noreferrer";
  return element;
}

function dateLabel(value) {
  return value ? new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Seoul",
  }).format(new Date(value)) + " KST" : "";
}

function table(columns, rows, empty) {
  if (!rows.length) return el("p", empty, "muted");
  const wrap = el("div", "", "table-wrap");
  const grid = el("table");
  const head = grid.createTHead().insertRow();
  columns.forEach(name => { const header = el("th", name); header.scope = "col"; head.append(header); });
  const body = grid.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const cell of row) {
      const td = tr.insertCell();
      if (cell instanceof Node) td.append(cell);
      else td.textContent = cell || "—";
    }
  }
  wrap.append(grid);
  return wrap;
}

function button(label, fn, style = "secondary") {
  const element = el("button", label, style);
  element.type = "button";
  element.addEventListener("click", fn);
  return element;
}

async function api(data, signal) {
  if (!isAutomaticMode()) throw new Error("검색 설정에서 자동 조회 및 요약을 선택해 주세요.");
  const code = by("access").value;
  if (!code) throw new Error("팀 액세스 코드를 입력해 주세요.");
  const headers = { "X-Patent-Access": code };
  const form = data instanceof FormData;
  if (!form) headers["Content-Type"] = "application/json";
  if (data.action === "ask") headers["X-Patent-Action"] = "ask";
  const response = await fetch("/api/patent-review", {
    method: "POST", headers, body: form ? data : JSON.stringify(data), cache: "no-store", signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw summaryError(body);
  }
  return response;
}

async function readSummary(response) {
  const summary = await response.json();
  if (summary.error) throw summaryError(summary);
  return summary;
}

function summaryError({ error, retryAfter }) {
  return Object.assign(new Error(error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."), { retryAfter });
}

async function summarizeWithRetry(payload, signal, progress) {
  try {
    return await readSummary(await api(payload, signal));
  } catch (error) {
    signal.throwIfAborted();
    if (!Number.isFinite(error.retryAfter)) throw error;
    say("status", `${progress} · ${error.retryAfter}초 후 재시도`);
    await new Promise((resolve, reject) => {
      function abort() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, Math.min(error.retryAfter * 1000, 2147483647));
      signal.addEventListener("abort", abort, { once: true });
    });
    say("status", progress);
    return readSummary(await api(payload, signal));
  }
}

function summaryCard(summary, index) {
  const item = el("article", "", "summary");
  if (Number.isInteger(index)) item.id = "summary-" + index;
  item.append(el("h3", summary.title), el("small", [summary.source, summary.id, summary.model].filter(Boolean).join(" · ")), el("pre", summary.text));
  if (summary.partial) item.append(el("p", "출력 한도에 도달해 요약 일부만 표시됩니다.", "muted"));
  if (summary.evidenceIncomplete) item.append(el("p", "청구항 근거 추출이 불완전합니다. 원문에서 추가 근거를 확인하세요.", "muted"));
  return item;
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = el("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function exportButton(report, status) {
  return button("PowerPoint 내려받기", async event => {
    const control = event.currentTarget;
    control.disabled = true;
    try {
      await window.exportPatentPptx(report, report.reviewed ? "원문 검토일 " + report.reviewedAt : dateLabel(report.retrievedAt), facts, download);
      say(status, "PowerPoint 파일을 만들었습니다.");
    } catch {
      say(status, "PowerPoint를 만들지 못했습니다. 페이지를 새로 열고 다시 시도해 주세요.", true);
    } finally {
      control.disabled = false;
    }
  });
}

function showSummaries(report) {
  const slot = by("summaries");
  if (current !== report || !slot) return;
  if (by("claim-analysis")) claimAnalysis(report, by("claim-analysis"));
  slot.replaceChildren(...report.summaries.map(summaryCard));
  if (!report.summaries.length) {
    const message = report.autoPending ? "공개 기록과 원문을 확인하고 있습니다."
      : report.local ? "아래에서 PDF를 선택해 문서 요약을 추가할 수 있습니다." : "이 조회에서 생성된 요약이 없습니다.";
    slot.append(el("p", message, "muted"));
  }
}

function addSummary(report, summary) {
  const index = summary.id ? report.summaries.findIndex(item => item.id === summary.id) : -1;
  if (index < 0) report.summaries.push(summary);
  else report.summaries[index] = summary;
  const slot = by("summaries");
  if (current !== report || !slot) return;
  if (summary.evidence || index >= 0) {
    const panel = by("claim-analysis");
    if (panel) claimAnalysis(report, panel);
  }
  if (index < 0) {
    if (report.summaries.length === 1) slot.replaceChildren();
    slot.append(summaryCard(summary, report.summaries.length - 1));
  } else {
    slot.children[index].replaceWith(summaryCard(summary, index));
  }
}

function addReportNote(report, text) {
  report.notes.push(text);
  if (current === report) {
    const notes = by("report-notes");
    notes.hidden = false;
    notes.append(el("li", text));
  }
}

const documentPayload = (report, doc) => report.skey
  ? { source: "wintelips", skey: report.skey, id: doc.id, code: doc.code }
  : { country: report.country, application: report.application, id: doc.id, code: doc.code };

async function summarizeReport(report, query, signal) {
  const documents = new Map(report.documents.filter(doc => doc.downloadable || doc.text).map(doc => [doc.id, doc]));
  if (!report.canSummarize) {
    if (documents.size || report.events.length) addReportNote(report, "Claude API 키가 서버에 설정되면 자동 요약을 사용할 수 있습니다.");
    return;
  }
  let position = 0;
  // Keep each PDF in its own worker request, even for a long document list.
  for (const doc of documents.values()) {
    signal.throwIfAborted();
    const progress = `공개 원문 요약 중 (${++position}/${documents.size}) · ${doc.title}`;
    say("status", progress);
    try {
      const summary = await summarizeWithRetry({ action: "summarize", ...documentPayload(report, doc) }, signal, progress);
      signal.throwIfAborted();
      addSummary(report, { ...summary, id: doc.id });
    } catch (error) {
      signal.throwIfAborted();
      addReportNote(report, `${doc.title} (${doc.id}) · ${error.message}`);
    }
  }
  if (!report.summaries.length && report.events.length) {
    const progress = "기관에서 제공한 공개 이력을 요약하고 있습니다.";
    say("status", progress);
    try {
      const summary = await summarizeWithRetry({ action: "summarize-events", ...query }, signal, progress);
      signal.throwIfAborted();
      addSummary(report, summary);
    } catch (error) {
      signal.throwIfAborted();
      addReportNote(report, `공개 이력 요약 · ${error.message}`);
    }
  }
}

function documentActions(report, doc) {
  if (report.reviewed) return link(report.espacenet);
  if (!(doc.downloadable || doc.text) || report.demo) return report.local ? "브라우저에서 처리" : "공식 열람처 참고";
  const wrapper = el("div", "", "document-actions");
  wrapper.hidden = !isAutomaticMode();
  const payload = documentPayload(report, doc);
  const actions = doc.text ? [["summarize", "Claude 요약"]] : [["download", "원문 PDF"], ["summarize", "Claude 요약"]];
  for (const [action, title] of actions) {
    wrapper.append(button(title, async event => {
      const control = event.currentTarget;
      control.disabled = true;
      say("status", action === "download" ? "기관에서 PDF를 받고 있습니다." : "공개 원문을 Claude로 요약하고 있습니다.");
      try {
        const response = await api({ action, ...payload });
        if (action === "download") download(await response.blob(), `${report.country}-${doc.id}.pdf`);
        else {
          addSummary(report, { ...await readSummary(response), id: doc.id });
        }
        if (current === report) say("status", action === "download" ? "원문 PDF를 내려받았습니다." : "문서 요약을 아래에 추가했습니다.");
        if (action === "summarize" && current === report) by("summaries").scrollIntoView({ block: "nearest" });
      } catch (error) {
        if (current === report) say("status", error.message, true);
      } finally {
        control.disabled = false;
      }
    }));
  }
  return wrapper;
}

function familyCell(row) {
  const label = row.publication || row.application || "";
  const countries = Array.from(by("office").options, option => option.value);
  if (!label || !countries.includes(row.country)) return label;
  let number = label.startsWith(row.country) ? label : row.country + label;
  if (row.country === "KR") {
    const docdb = number.match(/^KR(\d{11})([ABUY]\d?)$/);
    if (docdb) number = "KR" + (/^[UY]/.test(docdb[2]) ? "20" : "10") + docdb[1];
    if (!/^KR(?:10|20)\d{7}(?:\d{4})?(?:[A-Z]\d?)?$/.test(number)) return label;
  }
  return button(label, () => {
    by("back-search").click();
    by("office").value = row.country;
    by("number").value = number;
    by("numberType").value = row.publication ? (row.country === "KR" && /^KR(?:10|20)\d{7}(?:B\d?)?$/.test(number) ? "grant" :
      row.country === "US" && /^US\d{5,8}[BS]\d?$/.test(number) ? "grant" : "publication") : "application";
    by("office").dispatchEvent(new Event("change"));
    by("lookup").requestSubmit();
    by("number").focus();
  }, "text-button");
}

function manualEditor(report) {
  const details = el("details", "", "manual-record");
  details.append(el("summary", "기관에서 확인한 기록 입력"));
  const form = el("form", "", "manual-form");
  const fields = el("div", "", "manual-fields");
  function field(name, label, value = "", placeholder = "", long = false) {
    const wrapper = el("div", "", long ? "full" : "");
    const caption = el("label", label);
    const control = el(long ? "textarea" : "input");
    control.id = "manual-" + name;
    control.name = name;
    control.value = value;
    control.placeholder = placeholder;
    control.maxLength = long ? 5500 : 250;
    caption.htmlFor = control.id;
    wrapper.append(caption, control);
    fields.append(wrapper);
  }
  field("title", "발명의 명칭", report.title);
  field("applicants", "출원인", report.applicants);
  field("application", "출원번호", report.application);
  field("publication", "공개번호", report.publication);
  field("grant", "등록번호", report.grant);
  field("status", "기관 표시 상태", report.status);
  field("family", "패밀리 · 관할 | 번호 | 관계",
    report.family.map(row => [row.country, row.publication, row.relation].join(" | ")).join("\n"), "EP | EP4286919A1 | 동일 우선권", true);
  field("events", "심사 이력 · 날짜 | 사건명",
    report.events.map(row => [row.date, row.title].join(" | ")).join("\n"), "2025-06-10 | 의견제출통지서 발송", true);
  const save = el("button", "보고서에 반영", "secondary");
  save.type = "submit";
  const confirmation = el("span", "", "edit-confirmation");
  confirmation.setAttribute("role", "status");
  form.append(fields, save, confirmation);
  details.append(form);
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = new FormData(form);
    const entries = name => String(data.get(name)).split(/\r?\n/).filter(line => line.trim()).map(line => line.split("|").map(value => value.trim()));
    const family = entries("family");
    const events = entries("events");
    if (family.some(([country, id]) => !/^[A-Z]{2,3}$/i.test(country) || !id) ||
        events.some(([date, title]) => !/^\d{4}-\d{2}-\d{2}$/.test(date) || !title)) {
      confirmation.textContent = "패밀리와 심사 이력의 줄 형식을 확인해 주세요.";
      return;
    }
    for (const name of ["title", "applicants", "application", "publication", "grant", "status"]) report[name] = String(data.get(name)).trim();
    report.family = family.map(([country, publication, relation]) => ({ country: country.toUpperCase(), publication, relation: relation || "사용자 확인" }));
    report.events = events.map(([date, title]) => ({ date, title })).sort((a, b) => b.date.localeCompare(a.date));
    show(report);
    by("report-title").focus();
    say("status", "직접 입력한 기록을 보고서에 반영했습니다.");
  });
  return details;
}

function show(report) {
  const entering = current !== report;
  current = report;
  const area = by("result");
  area.replaceChildren();
  area.hidden = false;
  if (report.demo) area.append(el("div", "가상 데이터로 만든 예시입니다.", "panel sample"));
  document.body.classList.add("reading-report");
  by("back-search").hidden = false;
  const overview = el("section", "", "panel dossier-cover");
  const head = el("div", "", "report-head");
  const identity = el("div");
  const title = el("h2", report.title || report.query, "report-title");
  title.id = "report-title";
  title.tabIndex = -1;
  identity.append(el("p", [report.country, report.query, report.source].filter(Boolean).join(" · "), "identity"), title,
    el("p", report.reviewed ? "원문 검토일 · " + report.reviewedAt : dateLabel(report.retrievedAt), "muted hint"));
  const ppt = exportButton(report, "status");
  ppt.id = "report-export";
  ppt.disabled = Boolean(report.autoPending);
  head.append(identity);
  if (!report.linksOnly) head.append(ppt);
  overview.append(head);
  if (report.takeaway) overview.append(el("p", report.takeaway, "dossier-takeaway"));
  const milestones = reportMilestones(report);
  if (!report.linksOnly) overview.append(reportMetrics(report, milestones));
  const metadata = el("details", "", "report-metadata");
  metadata.append(el("summary", "서지 정보 및 공식 열람처"));
  const fields = el("dl", "", "facts");
  for (const [key, label] of facts) {
    if (!report[key]) continue;
    const group = el("div");
    group.append(el("dt", label), el("dd", report[key]));
    fields.append(group);
  }
  if (fields.childElementCount) metadata.append(fields);
  if (report.abstract) {
    const abstract = el("details");
    abstract.append(el("summary", "초록"), el("p", report.abstract));
    metadata.append(abstract);
  }
  if (report.links.length) {
    const links = el("div", "", "links");
    links.append(...report.links.map(link));
    metadata.append(links);
  }
  const notes = el("ul", "", "notes");
  notes.id = "report-notes";
  notes.hidden = !report.notes.length;
  notes.append(...report.notes.map(note => el("li", note)));
  notes.setAttribute("aria-live", "polite");
  notes.setAttribute("aria-label", "보고서 안내");
  metadata.open = Boolean(report.linksOnly || report.local);
  overview.append(notes, metadata);
  if (report.local && report.country !== "UPC") overview.append(manualEditor(report));
  area.append(overview);
  if (entering) {
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  if (report.linksOnly) {
    if (report.country === "US") area.append(usDocumentGuide(report));
    return;
  }

  if (report.country !== "UPC") {
    const nav = el("nav", "", "report-nav");
    nav.setAttribute("aria-label", "리포트 목차");
    for (const [id, label] of [["report-timeline", "타임라인"], ["claim-analysis", "청구항 분석"], ["report-documents", "심사 문서"], ["report-history", "전체 이력"]]) {
      const jump = el("a", label);
      jump.href = "#" + id;
      nav.append(jump);
    }
    const analysis = el("section", "", "panel claim-panel");
    analysis.id = "claim-analysis";
    area.append(nav, timeline(milestones), analysis);
    const family = el("section", "", "panel");
    family.append(el("h2", `패밀리 및 연계 출원 (${report.family.length})`), table(
      ["관할", "공개·등록번호", "출원번호", "조회 관계", "일자"],
      report.family.map(row => [row.country, familyCell(row), row.application, row.relation, row.date]),
      "표시할 패밀리 자료가 없습니다.",
    ));
    const history = el("section", "", "panel");
    history.id = "report-history";
    history.append(el("h2", `심사·행정 이력 (${report.events.length})`), table(
      ["날짜", "기록", "상태·구분", "문서번호·코드"],
      report.events.map(row => [row.date, row.title, row.detail, row.id]),
      report.local ? "공식 기록을 확인한 뒤 위 입력란에 추가할 수 있습니다." : "가져온 이력이 없습니다. 공식 열람 링크를 확인해 주세요.",
    ));
    const docs = el("section", "", "panel");
    docs.id = "report-documents";
    docs.append(el("h2", `심사 문서 (${report.documents.length})`), table(
      ["날짜", "문서", "식별자", "원문 및 요약"],
      report.documents.map(doc => [doc.date, doc.title, doc.id, documentActions(report, doc)]),
      report.local ? "기관에서 받은 PDF를 아래에서 선택할 수 있습니다." : "자동으로 가져올 수 있는 공개 원문이 없습니다. 위의 공식 열람처를 확인해 주세요.",
    ));
    if (report.country === "US") docs.append(usDocumentGuide(report));
    area.append(docs, history, family);
  }
  const summaries = el("section", "", "panel");
  const slot = el("div");
  slot.id = "summaries";
  summaries.append(el("h2", "문서 요약"), slot);
  area.append(summaries);
  if (!report.local && !report.demo && !report.reviewed) area.append(askPanel(report));
  showSummaries(report);
}

function usDocumentGuide(report) {
  const guide = el("section", "", "panel");
  guide.append(el("h3", "EPO에서 미국 심사문서 받기"),
    el("p", "Espacenet에서 해당 미국 문헌을 열고 서지 화면의 Global Dossier를 선택하세요. 문서 목록에서 날짜와 제목을 확인하고 원문을 열면 PDF 뷰어에서 저장할 수 있습니다. Global Dossier는 미국 특허청이 심사철을 제공하는 경우에 표시됩니다."));
  const entry = report.links.find(item => item.url.startsWith("https://worldwide.espacenet.com/"));
  const pub = String(report.grant || report.publication || "").replace(/[\s,/.-]/g, "").replace(/^US/i, "");
  const url = entry?.url || (/^(?:D|RE|PP)?\d{5,11}(?:[A-Z]\d?)?$/i.test(pub)
    ? "https://worldwide.espacenet.com/patent/search?q=" + encodeURIComponent("pn=US" + pub) : "https://worldwide.espacenet.com/");
  guide.append(link({ label: "EPO Espacenet 열기", url }));
  return guide;
}

const askContext = report => ({
  ...Object.fromEntries(["country", "query", "title", "source", "application", "publication", "grant", "filed", "published",
    "granted", "status", "applicants", "inventors", "abstract", "family", "events", "notes"].map(key => [key, report[key]])),
  documents: report.documents.map(({ date, title, id }) => ({ date, title, id })),
  summaries: report.summaries.map(({ title, source, text }) => ({ title, source, text })),
});

async function requestAnswer(report, text, signal) {
  const progress = "AI가 요청한 내용을 작성하고 있습니다.";
  say("status", progress);
  const summary = await summarizeWithRetry({ action: "ask", prompt: text, report: askContext(report) }, signal, progress);
  const number = report.summaries.filter(item => item.id?.startsWith("AI 요청")).length + 1;
  addSummary(report, { ...summary, id: `AI 요청 ${number}` });
}

function askPanel(report) {
  const panel = el("section", "", "panel ask");
  const label = el("label", "AI에게 추가로 요청");
  label.htmlFor = "askPrompt";
  const prompt = el("textarea");
  prompt.id = "askPrompt";
  prompt.maxLength = 2000;
  prompt.rows = 3;
  prompt.placeholder = "예: 거절이유와 인용발명을 표로 정리하고, 출원인이 어떻게 대응했는지 설명해 줘";
  const help = el("p", report.canSummarize
    ? "지금 화면의 서지·이력·패밀리·문서 요약을 함께 보냅니다. 답변은 문서 요약에 추가되고 PowerPoint에도 들어갑니다."
    : "Claude API 키가 서버에 설정되면 사용할 수 있습니다.", "muted hint");
  const send = button("AI에게 요청", async () => {
    const text = prompt.value.trim();
    if (!text) {
      say("status", "AI에게 요청할 내용을 입력해 주세요.", true);
      prompt.focus();
      return;
    }
    send.disabled = true;
    try {
      await requestAnswer(report, text, new AbortController().signal);
      if (current === report) {
        say("status", "요청한 내용을 문서 요약에 추가했습니다.");
        by("summaries").scrollIntoView({ block: "nearest" });
        prompt.value = "";
      }
    } catch (error) {
      if (current === report) say("status", error.message, true);
    } finally {
      send.disabled = !report.canSummarize;
    }
  }, "primary");
  send.disabled = !report.canSummarize;
  panel.append(el("h2", "AI 요청"), label, prompt, help, send);
  return panel;
}

function updateMode() {
  updateEspacenetLink();
  const office = by("office").value;
  const apiMode = isAutomaticMode();
  by("number").placeholder = examples[office] ? "예: " + examples[office] : "국가 코드와 특허번호";
  by("numberType").disabled = office === "UPC";
  by("source").disabled = !apiMode;
  by("requestGroup").hidden = !apiMode;
  by("search").textContent = apiMode ? "리포트 만들기" : "공식 열람처 찾기";
  by("accessGroup").hidden = !apiMode;
  by("manualUpload").hidden = apiMode;
  by("scanGroup").hidden = apiMode;
  by("pdf").multiple = !apiMode;
  by("fileLabel").textContent = apiMode ? "PDF 파일 · 최대 3.5 MiB" : "PDF 파일 · 파일당 최대 20 MiB";
  by("summarize").textContent = apiMode ? "Claude에 PDF 보내기" : "브라우저에서 요약";
  by("uploadHelp").textContent = apiMode ? "선택한 PDF는 Claude로 전송되어 한국어 요약을 생성합니다."
    : "PDF를 서버로 보내지 않고 중요 문장과 페이지 번호를 뽑습니다. 이미지 PDF는 파일당 스캔 10쪽까지 문자 인식합니다.";
  document.querySelectorAll(".document-actions").forEach(actions => { actions.hidden = !apiMode; });
}

by("office").addEventListener("change", updateMode);
function updateEspacenetLink() {
  const raw = by("number").value.normalize("NFKC").trim().toUpperCase();
  const office = by("office").value;
  const isUS = office === "US" || (office === "auto" && (/^US/.test(raw) || /^\d{2}\//.test(raw)));
  const match = raw.replace(/^USA?/, "").replace(/[\s,/-]/g, "").match(/^((?:D|RE|PP)?\d{5,11})([A-Z]\d?)?$/);
  const anchor = by("espacenet-search");
  anchor.hidden = !isUS || !match;
  if (!anchor.hidden) {
    const yearless = !match[2] && match[1].length === 8 && (by("numberType").value === "application" || raw.includes("/"));
    anchor.href = yearless ? "https://worldwide.espacenet.com/" : "https://worldwide.espacenet.com/patent/search?q=" + encodeURIComponent("pn=US" + match[0]);
    anchor.textContent = yearless ? "EPO Espacenet 열기 · 공개번호 또는 등록번호로 검색 ↗" : "EPO Espacenet에서 직접 검색 ↗";
  }
}
by("number").addEventListener("input", updateEspacenetLink);
by("numberType").addEventListener("change", updateEspacenetLink);
by("lookup").querySelectorAll('[name="mode"]').forEach(mode => {
  mode.addEventListener("change", () => {
    activeSearch?.abort();
    searchVersion++;
    if (current?.autoPending) {
      current.autoPending = false;
      show(current);
    }
    by("search").disabled = false;
    say("status", "");
    updateMode();
  });
});

function showCandidates(found, pick, local = false) {
  current = undefined;
  const area = by("result");
  area.replaceChildren();
  area.hidden = false;
  const panel = el("section", "", "panel");
  const hasUnverified = found.candidates.some(item => item.linksOnly);
  const heading = el("h2", local || hasUnverified ? `가능한 번호 해석 ${found.candidates.length}가지` : `검색 결과 ${found.candidates.length}건`, "report-title");
  heading.id = "report-title";
  heading.tabIndex = -1;
  panel.append(heading, el("p", local ? "국가 코드가 없어 여러 관할의 번호로 읽을 수 있습니다. 확인할 번호를 고르세요."
    : hasUnverified ? "자동 조회로 확인하지 못한 후보는 공식 열람처에서 번호를 확인할 수 있습니다." : "같은 번호를 가진 특허가 여러 건입니다. 리포트를 만들 특허를 고르세요.", "muted"));
  panel.append(table(
    local ? ["관할", "번호 해석", ""] : ["관할", "명칭", "출원번호", "문헌·등록번호", "출원일", "상태", "출원인", "일치", ""],
    found.candidates.map(item => {
      const choose = button(local || item.linksOnly ? "열람처 보기" : "리포트 만들기", () => pick(item), "secondary");
      return local ? [item.country, item.matched, choose] : [item.country, item.title, item.application,
        item.documents || item.grant || item.publication || item.number, item.filed, item.status, item.applicants, item.matched, choose];
    }), ""));
  if (found.notes?.length) {
    const notes = el("ul", "", "notes");
    notes.append(...found.notes.map(note => el("li", note)));
    panel.append(notes);
  }
  area.append(panel);
  heading.focus();
}

function finishReport(report) {
  if (report.country === "KR" || report.country === "CN") by("scanLanguage").value = report.country === "KR" ? "kor" : "chi_sim";
  else by("scanLanguage").value = "eng";
}

function openReviewed() {
  activeSearch?.abort();
  searchVersion++;
  by("search").disabled = false;
  say("status", "");
  const report = reviewedUsCase();
  show(report);
  finishReport(report);
}

by("reviewed-case").addEventListener("click", openReviewed);
by("back-search").addEventListener("click", () => {
  activeSearch?.abort();
  searchVersion++;
  current = undefined;
  by("result").hidden = true;
  by("result").replaceChildren();
  by("search").disabled = false;
  by("back-search").hidden = true;
  document.body.classList.remove("reading-report");
  const url = new URL(location.href);
  url.searchParams.delete("patent");
  url.hash = "";
  history.replaceState(null, "", url);
  say("status", "");
  by("number").focus();
});

async function openCandidate(candidate, notes = [], request = "") {
  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;
  const version = ++searchVersion;
  const control = by("search");
  control.disabled = true;
  let report;
  say("status", "선택한 특허의 공개 기록을 조회하고 있습니다.");
  try {
    const query = candidate.source === "wintelips" ? { source: "wintelips", skey: candidate.skey }
      : { number: candidate.number, country: candidate.country, numberType: candidate.numberType };
    const response = await api({ action: "lookup", ...query }, controller.signal);
    const data = await response.json();
    report = { ...data, summaries: [], autoPending: !data.linksOnly };
    controller.signal.throwIfAborted();
    report.notes.unshift(...notes);
    show(report);
    if (!report.linksOnly) await summarizeReport(report, query, controller.signal);
    // The request from the search form runs last, so the answer can draw on every document summary.
    let answered = false;
    if (request && !report.linksOnly) {
      if (!report.canSummarize) addReportNote(report, "Claude API 키가 서버에 설정되면 AI 요청을 사용할 수 있습니다.");
      else {
        try {
          await requestAnswer(report, request, controller.signal);
          answered = true;
        } catch (error) {
          controller.signal.throwIfAborted();
          addReportNote(report, `AI 요청 · ${error.message}`);
        }
      }
    }
    if (searchVersion !== version) return;
    finishReport(report);
    say("status", report.linksOnly ? "EPO 자동 조회로 미국 자료를 확인하지 못했습니다. 공식 열람 링크를 표시했습니다."
      : `조회 완료 · 요약 ${report.summaries.length}건${answered ? " · AI 요청 반영" : ""} · PowerPoint 다운로드 가능`);
  } catch (error) {
    if (searchVersion === version) say("status", error.message, true);
  } finally {
    if (searchVersion === version) {
      control.disabled = false;
      if (report?.autoPending) {
        report.autoPending = false;
        by("report-export").disabled = false;
        if (!report.summaries.length || by("claim-analysis")) showSummaries(report);
      }
    }
  }
}

function openLocal(tools, number, reading) {
  activeSearch?.abort();
  searchVersion++;
  try {
    const report = { ...tools.localReport(number, reading.country, reading.numberType), summaries: [] };
    show(report);
    finishReport(report);
    say("status", "공식 열람처를 표시했습니다.");
  } catch (error) {
    say("status", error.message, true);
  }
}

by("lookup").addEventListener("submit", async event => {
  event.preventDefault();
  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;
  const version = ++searchVersion;
  const control = by("search");
  const apiMode = isAutomaticMode();
  if (apiMode && !by("access").value) {
    control.disabled = false;
    say("status", "팀 액세스 코드를 입력해 주세요.", true);
    by("access").focus();
    return;
  }
  control.disabled = true;
  by("result").hidden = true;
  current = undefined;
  const [number, office, numberType] = [by("number").value, by("office").value, by("numberType").value];
  const request = apiMode ? by("request").value.trim() : "";
  say("status", apiMode ? "번호와 일치하는 특허를 찾고 있습니다." : "공식 열람처를 준비하고 있습니다.");
  try {
    if (apiMode) {
      const found = await (await api({ action: "search", number, country: office, numberType, source: by("source").value }, controller.signal)).json();
      controller.signal.throwIfAborted();
      if (!found.candidates.length) throw new Error(["일치하는 특허를 찾지 못했습니다.", ...found.notes].join(" "));
      if (found.candidates.length === 1) {
        await openCandidate(found.candidates[0], found.notes, request);
        return;
      }
      showCandidates(found, candidate => openCandidate(candidate, found.notes, request));
      say("status", "확인할 번호와 자료를 선택해 주세요.");
    } else {
      const tools = await localTools();
      if (searchVersion !== version) return;
      const readings = tools.localCandidates(number, office, numberType);
      if (readings.length > 1) {
        showCandidates({ candidates: readings }, reading => openLocal(tools, number, reading), true);
        say("status", "국가 코드가 없는 번호입니다. 확인할 번호 해석을 고르세요.");
      } else openLocal(tools, number, readings[0] ?? { country: office, numberType });
    }
  } catch (error) {
    if (searchVersion === version) say("status", error.message, true);
  } finally {
    if (searchVersion === version) control.disabled = false;
  }
});

by("example").addEventListener("click", () => {
  activeSearch?.abort();
  searchVersion++;
  by("search").disabled = false;
  say("status", "");
  show({
    demo: true, country: "KR", query: "KR 예시", source: "가상 데이터", title: "온도 센서를 이용한 배터리 충전 제어",
    application: "10-2022-0000000", publication: "10-2023-0000000", filed: "2022-01-12", published: "2023-07-20",
    status: "등록결정", applicants: "예시 주식회사", abstract: "배터리 온도에 따라 충전 전류를 조절하는 제어 장치입니다.",
    retrievedAt: new Date().toISOString(), links: [], notes: ["기관 조회 및 Claude 호출 없이 만든 화면 예시입니다."],
    family: [
      { country: "KR", application: "예시 출원 A", date: "2022-01-12", relation: "동일 우선권" },
      { country: "EP", application: "예시 출원 B", date: "2022-12-14", relation: "동일 우선권" },
    ],
    events: [
      { date: "2024-06-03", title: "등록결정서", detail: "발송", id: "예시 문서 03" },
      { date: "2024-04-05", title: "의견서 및 보정서 제출", detail: "수리", id: "예시 문서 02" },
      { date: "2024-02-02", title: "의견제출통지서", detail: "발송", id: "예시 문서 01" },
    ],
    documents: [{ id: "예시 문서 01", title: "의견제출통지서", date: "2024-02-02" }],
    summaries: [{ id: "예시 문서 01", title: "의견제출통지서", source: "가상 요약",
      text: "심사관은 청구항 1의 온도에 따른 충전 전류 조절 구성이 선행문헌 D1에 기재돼 있다고 지적했습니다. (PDF p. 2)\n\n청구항 2의 센서 배치를 별도로 판단했는지는 문서에서 확인되지 않음." }],
  });
});

by("upload").addEventListener("submit", async event => {
  event.preventDefault();
  if (processing) return;
  const apiMode = isAutomaticMode();
  const files = Array.from(by("pdf").files);
  const limit = apiMode ? 3.5 : 20;
  if (!files.length || (apiMode && files.length !== 1) || files.length > 8 ||
      files.some(file => !file.name.toLowerCase().endsWith(".pdf") || file.size > limit * 1024 * 1024)) {
    say("uploadStatus", apiMode ? "3.5 MiB 이하의 PDF 파일 한 개를 선택해 주세요." : "20 MiB 이하의 PDF를 최대 8개까지 선택해 주세요.", true);
    return;
  }
  const report = current && !current.demo ? current : null;
  const control = by("summarize");
  const language = by("scanLanguage").value;
  const summaries = [];
  const errors = [];
  processing = true;
  control.disabled = true;
  by("pdf").disabled = true;
  try {
    if (apiMode) {
      say("uploadStatus", "선택한 PDF를 Claude로 요약하고 있습니다.");
      const form = new FormData();
      form.append("pdf", files[0]);
      summaries.push(await readSummary(await api(form)));
    } else {
      const { summarizeLocal } = await localTools();
      for (const [index, file] of files.entries()) {
        const progress = message => say("uploadStatus", `${index + 1}/${files.length} · ${file.name} · ${message}`);
        progress("PDF 여는 중");
        try { summaries.push(await summarizeLocal(file, language, progress)); }
        catch (error) { errors.push(`${file.name} · ${error.message}`); }
      }
    }
    if (summaries.length && report && current === report) {
      report.summaries.push(...summaries);
      if (report.local) {
        report.documents.push(...summaries.map(summary => ({ title: summary.title, id: "직접 선택한 PDF" })));
        show(report);
      } else showSummaries(report);
    } else if (summaries.length) {
      standaloneReport ??= { title: "심사 문서 요약", source: "사용자 선택 PDF", retrievedAt: new Date().toISOString(),
        query: "", notes: [], family: [], events: [], documents: [], links: [], summaries: [] };
      standaloneReport.summaries.push(...summaries);
      by("standalone").replaceChildren(...standaloneReport.summaries.map(summary => summaryCard(summary)), exportButton(standaloneReport, "uploadStatus"));
    }
    say("uploadStatus", [summaries.length ? `${summaries.length}개 문서 요약을 추가했습니다.` : "", ...errors].filter(Boolean).join(" "), Boolean(errors.length));
    by("upload").reset();
    by("scanLanguage").value = language;
  } catch (error) {
    say("uploadStatus", error.message, true);
  } finally {
    control.disabled = false;
    by("pdf").disabled = false;
    processing = false;
  }
});

const initialNumber = new URLSearchParams(location.search).get("patent");
if (initialNumber && initialNumber.length <= by("number").maxLength) by("number").value = initialNumber;
updateMode();

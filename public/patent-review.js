"use strict";

const by = id => document.getElementById(id);
if (location.hostname.endsWith(".ai-knowledge-site.pages.dev") || /^ai-knowledge-site-git-.+\.vercel\.app$/.test(location.hostname)) {
  const environment = by("preview-environment");
  if (environment) {
    environment.hidden = false;
    const production = new URL("https://ai-all.co.kr/patent-review");
    const input = new URLSearchParams(location.search).get("patent");
    if (input) production.searchParams.set("patent", input);
    environment.querySelector("a").href = production.href;
  }
}
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
const localTools = () => import("/patent-review-local.mjs?v=20261120-epo-review-zip");

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

function reportBody(text) {
  const body = el("div", "", "report-body");
  const lines = text.split(/\r?\n/).map(line => line.trim());
  const cells = line => line.replace(/^\||\|$/g, "").split("|").map(value => value.trim());
  const inline = value => {
    const fragment = document.createDocumentFragment();
    for (const part of value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)) {
      if (part.startsWith("**") && part.endsWith("**")) fragment.append(el("strong", part.slice(2, -2)));
      else if (part.startsWith("`") && part.endsWith("`")) fragment.append(el("code", part.slice(1, -1)));
      else fragment.append(part);
    }
    return fragment;
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line || /^-{3,}$/.test(line)) continue;
    if (line.includes("|") && /^\|?\s*:?-{3,}/.test(lines[i + 1] || "") && (lines[i + 1] || "").includes("|")) {
      const headers = cells(line).map(value => inline(value).textContent);
      const rows = [];
      i++;
      while (i + 1 < lines.length && lines[i + 1].includes("|")) rows.push(cells(lines[++i]).map(inline));
      body.append(table(headers, rows, headers.join(" · ")));
      continue;
    }
    const heading = /^(#{1,6})\s+(.+)/.exec(line);
    const item = /^[-*]\s+/.test(line);
    const quote = /^>\s?/.test(line);
    const node = el(heading ? (heading[1].length < 3 ? "h3" : "h4") : item ? "li" : quote ? "blockquote" : "p");
    node.append(inline(heading ? heading[2] : line.replace(/^(?:[-*]\s+|>\s?)/, "")));
    if (item) {
      if (body.lastElementChild?.tagName !== "UL") body.append(el("ul"));
      body.lastElementChild.append(node);
    } else body.append(node);
  }
  return body;
}

// A long answer is streamed. One that never arrives, or ends before its JSON, was cut on the way by a platform limit, a proxy or the network.
const cutError = status => Object.assign(new Error("서버 응답을 끝까지 받지 못했습니다. 잠시 후 다시 시도해 주세요."), { cut: true, status });

async function api(data, signal) {
  if (!isAutomaticMode()) throw new Error("검색 설정에서 자동 조회 및 요약을 선택해 주세요.");
  const code = by("access").value;
  const headers = { "X-Patent-Client": "report" };
  if (code) headers["X-Patent-Access"] = code;
  const form = data instanceof FormData;
  if (!form) headers["Content-Type"] = "application/json";
  if (data.action === "ask" || data.action === "family-compare") headers["X-Patent-Action"] = data.action;
  let response;
  try {
    response = await fetch("/api/patent-review", {
      method: "POST", headers, body: form ? data : JSON.stringify(data), cache: "no-store", signal,
    });
  } catch (error) {
    if (signal?.aborted || error.name === "AbortError") throw error;
    throw cutError();
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    // A server error that is not this route's own JSON comes from the platform in front of it, which gave up on the request.
    if (!body?.error && response.status >= 500) throw cutError(response.status);
    throw summaryError({ ...body, status: response.status });
  }
  return response;
}

async function readSummary(response) {
  let summary;
  try {
    summary = JSON.parse(await response.text());
  } catch (error) {
    if (error.name === "AbortError") throw error;
    throw cutError();
  }
  if (!summary || typeof summary !== "object") throw cutError();
  if (summary.error) throw summaryError(summary);
  recordUsage(summary.usage || summary.conclusion?.usage);
  return summary;
}

// Every Claude response passes through readSummary, so the report keeps a running total of tokens and cost.
const usageLabel = usage => `입력 ${usage.input.toLocaleString("ko-KR")} · 출력 ${usage.output.toLocaleString("ko-KR")} 토큰 · 약 $${usage.cost.toFixed(2)}`;

function recordUsage(usage) {
  if (!current || !usage) return;
  const total = current.usage || { input: 0, output: 0, cost: 0 };
  current.usage = { input: total.input + usage.input, output: total.output + usage.output, cost: total.cost + usage.cost };
  showUsage(current);
}

function showUsage(report) {
  const cover = document.querySelector(".dossier-cover");
  if (current !== report || !report.usage || !cover) return;
  let line = by("report-usage");
  if (!line) {
    line = el("p", "", "muted hint report-usage");
    line.id = "report-usage";
    cover.append(line);
  }
  line.textContent = "Claude 사용량 · " + usageLabel(report.usage);
}

function summaryError({ error, retryAfter, status }) {
  return Object.assign(new Error(error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요."), { retryAfter, status });
}

// A request is sent again once when the server asks for a wait or, unless the caller has a better answer to a cut response, when the answer was cut.
async function summarizeWithRetry(payload, signal, progress, retryCut = true) {
  try {
    return await readSummary(await api(payload, signal));
  } catch (error) {
    signal.throwIfAborted();
    const wait = Number.isFinite(error.retryAfter) ? error.retryAfter : error.cut && retryCut ? 5 : undefined;
    if (wait === undefined) throw error;
    say("status", `${progress} · ${error.cut ? "응답이 끊겨 " : ""}${wait}초 후 재시도`);
    await new Promise((resolve, reject) => {
      function abort() {
        clearTimeout(timer);
        reject(signal.reason);
      }
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", abort);
        resolve();
      }, Math.min(wait * 1000, 2147483647));
      signal.addEventListener("abort", abort, { once: true });
    });
    say("status", progress);
    return readSummary(await api(payload, signal));
  }
}

// The one-page conclusion a practitioner writes after reading the history in the order of the sections below.
const resultHeadings = ["심사 결과", "등록의 핵심 구성", "포기·제한된 범위", "남은 쟁점과 위험"];
const headingKey = text => text.replace(/\s+/g, "").replace(/[ㆍ・∙•/]/g, "·");

function resultDashboard(report) {
  const panel = el("section", "", "panel decision-panel");
  panel.id = "analysis-result";
  panel.append(el("h2", "심사 결과 보고서"));
  panel.append(el("p", "아래 1~9단계를 종합한 한 장 결론입니다. 근거는 각 단계에서 확인할 수 있습니다.", "muted hint"));
  if (report.analysisCoverage) panel.append(el("p", report.analysisCoverage, "muted hint"));
  const grid = el("div", "", "decision-grid");
  const sections = new Map();
  let active;
  for (const line of (report.conclusion?.text || "").split(/\r?\n/)) {
    const heading = resultHeadings.find(name => headingKey(name) === headingKey(line.trim().replace(/^#{1,6}\s*|\*\*/g, "").replace(/[:：]$/, "")));
    if (heading) {
      active = heading;
      if (!sections.has(active)) sections.set(active, []);
    } else if (active && line.trim()) sections.get(active).push(line);
  }
  // Without a written conclusion, only the result can be taken straight from a decision document.
  const roles = ["outcome"];
  for (const [index, heading] of resultHeadings.entries()) {
    const lines = sections.get(heading);
    const card = el("article", "", "decision-card decision-" + index);
    card.append(el("h3", heading));
    if (lines?.length) card.append(reportBody(lines.join("\n")));
    else {
      const findings = report.summaries.flatMap(source => (source.evidence || [])
        .filter(row => row.role === roles[index]).map(entry => ({ source, entry })));
      // A decision that disposes of the claims outranks later procedural notices about them.
      if (roles[index] === "outcome") findings.sort((a, b) => Number(b.entry.finalDisposition === true) - Number(a.entry.finalDisposition === true) ||
        (calendarDay(b.entry.documentDate) || "").localeCompare(calendarDay(a.entry.documentDate) || ""));
      const { source, entry } = findings[0] || {};
      if (!entry) continue;
      card.append(el("p", entry.text), el("small", [source.title, entry.locator].filter(Boolean).join(" · ")));
    }
    grid.append(card);
  }
  if (grid.childElementCount) panel.append(grid);
  if (report.conclusion && !sections.size) {
    const body = reportBody(report.conclusion.text);
    if (!grid.childElementCount && body.textContent) {
      const excerpt = el("p", body.querySelector("p, li")?.textContent || body.textContent, "decision-excerpt");
      panel.append(excerpt);
    }
    const full = el("details", "", "record-fold");
    full.append(el("summary", "분석 전문 보기"), body);
    panel.append(full);
  }
  if (report.conclusion?.partial) panel.append(el("p", "출력 한도로 종합 분석이 일부만 작성됐습니다.", "analysis-notice"));
  return panel;
}

function summaryCard(summary, index) {
  const item = el("article", "", "summary");
  if (Number.isInteger(index)) item.id = "summary-" + index;
  item.append(el("h3", summary.title), el("small", [summary.source, summary.id, summary.model,
    summary.usage && usageLabel(summary.usage)].filter(Boolean).join(" · ")), reportBody(summary.text));
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
      const timelineRows = reportMilestones(report).flatMap(([date, stages]) =>
        [...stages].map(([stage, sources]) => [date, stage, [...sources.keys()].join(" · ")]));
      const procedureRows = proceedingBriefs(report).flatMap(group => group.rows.map(row => [
        [group.date, group.name].filter(Boolean).join(" · "), claimScope(row.claims),
        briefRoles.find(([role]) => role === row.role)?.[1], [row.issue, ...findingDetailText(row), row.text].filter(Boolean).join("\n"),
        [row.date, row.procedure, row.locator].filter(Boolean).join(" · "),
      ]));
      await window.exportPatentPptx({ ...report, timelineRows, procedureRows, issueRows: issueRows(report), recordSheets: recordSheets(report) }, report.reviewed ? "원문 검토일 " + report.reviewedAt : dateLabel(report.retrievedAt), facts, download);
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
  if (by("claim-analysis")) renderAnalysis(report);
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
  if (by("claim-analysis")) renderAnalysis(report);
  if (index < 0) {
    if (report.summaries.length === 1) slot.replaceChildren();
    slot.append(summaryCard(summary, report.summaries.length - 1));
  } else {
    slot.children[index].replaceWith(summaryCard(summary, index));
  }
}

const documentPayload = (report, doc) => report.skey
  ? { source: "wintelips", skey: report.skey, id: doc.id, code: doc.code }
  : { country: report.country, application: report.application, id: doc.id, code: doc.code };

function documentActions(report, doc) {
  if (report.reviewed) return link(report.espacenet);
  if (doc.importHash) return "선택한 PDF";
  if (doc.text) return "공개 텍스트";
  if (!doc.downloadable || report.demo) return report.local ? "브라우저에서 처리" : "공식 열람처 참고";
  const wrapper = el("div", "", "document-actions");
  wrapper.hidden = !isAutomaticMode();
  wrapper.append(button("원문 PDF", async event => {
    const control = event.currentTarget;
    control.disabled = true;
    try {
      const response = await api({ action: "download", ...documentPayload(report, doc) });
      download(await response.blob(), report.country + "-" + doc.id + ".pdf");
    } catch (error) {
      if (current === report) say("status", error.message, true);
    } finally { control.disabled = false; }
  }));
  return wrapper;
}

const uploadLimit = 3.5 * 1024 * 1024;
const sizeLabel = bytes => bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + " MiB" : Math.max(1, Math.round(bytes / 1024)) + " KiB";

// EPO does not offer prosecution documents through an API, so the user downloads the Register ZIP once and we summarize it.
function registerZipBox(report) {
  const box = el("div", "", "register-zip");
  box.append(el("h3", "EP 심사 서류 원문 한 번에 요약"), el("p",
    "European Patent Register의 All documents에서 ZIP Archive로 받은 파일을 올리면, 안에 든 PDF를 골라 Claude로 요약합니다. "
    + "EPO 이용 조건상 원문은 사이트가 자동으로 가져오지 않습니다. PDF는 3.5 MiB 이하만 요약할 수 있습니다.", "muted hint"));
  const actions = el("div", "", "register-zip-actions");
  const register = report.links.find(item => item.url.includes("register.epo.org"));
  if (register) actions.append(link({ label: "Register에서 ZIP 받기", url: register.url }));
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".zip,application/zip";
  input.hidden = true;
  const pick = button("Register ZIP 올리기", () => input.click(), "primary");
  pick.disabled = !report.canSummarize;
  actions.append(pick);
  const list = el("div", "", "zip-list");
  box.append(actions, list);
  if (!report.canSummarize) box.append(el("p", "Claude API 키가 서버에 설정되면 사용할 수 있습니다.", "muted hint"));

  input.addEventListener("change", async () => {
    const file = input.files[0];
    input.value = "";
    if (!file) return;
    list.replaceChildren();
    if (file.size > 200 * 1024 * 1024) {
      say("status", "200 MiB 이하의 ZIP을 올려 주세요.", true);
      return;
    }
    say("status", "ZIP 안의 PDF를 확인하고 있습니다.");
    let entries;
    try {
      entries = await (await localTools()).readZipPdfs(file);
    } catch (error) {
      say("status", error.message, true);
      return;
    }
    if (!entries.length) {
      say("status", "ZIP 안에서 PDF를 찾지 못했습니다.", true);
      return;
    }
    const rows = entries.map(entry => {
      const usable = !entry.encrypted && entry.size <= uploadLimit;
      const row = el("label", "", "zip-row");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.checked = usable;
      check.disabled = !usable;
      row.append(check, el("span", entry.name), el("small", usable ? sizeLabel(entry.size)
        : entry.encrypted ? "암호 파일" : `${sizeLabel(entry.size)} · 용량 초과`, "muted"));
      return { entry, check, row };
    });
    const run = button("", async () => {
      const selected = rows.filter(item => item.check.checked);
      if (!selected.length) {
        say("status", "요약할 PDF를 골라 주세요.", true);
        return;
      }
      run.disabled = pick.disabled = true;
      let done = 0;
      for (const [index, { entry }] of selected.entries()) {
        const progress = `Register 서류 요약 중 (${index + 1}/${selected.length}) · ${entry.name}`;
        say("status", progress);
        try {
          const form = new FormData();
          form.append("pdf", new File([await entry.read()], entry.name, { type: "application/pdf" }));
          const summary = await summarizeWithRetry(form, new AbortController().signal, progress);
          addSummary(report, { ...summary, source: "European Patent Register · 사용자 업로드", id: entry.name });
          done++;
        } catch (error) {
          addReportNote(report, `${entry.name} · ${error.message}`);
        }
      }
      run.disabled = pick.disabled = false;
      if (current === report) {
        say("status", `Register 서류 ${done}건을 요약해 문서 요약에 추가했습니다.`, done < selected.length);
        if (done) by("summaries").scrollIntoView({ block: "nearest" });
      }
    }, "primary");
    const count = () => { run.textContent = `선택한 서류 요약 (${rows.filter(item => item.check.checked).length}건)`; };
    rows.forEach(item => item.check.addEventListener("change", count));
    count();
    list.append(el("p", `${file.name} · PDF ${entries.length}개`, "muted hint"), ...rows.map(item => item.row), run);
    say("status", "요약할 서류를 고른 뒤 버튼을 눌러 주세요.");
  });
  box.append(input);
  return box;
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
    workflowStep(isAutomaticMode() ? 0 : -1);
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
  // While the user is on an earlier step, updates to the open case wait until they return to it.
  if (!entering && report.collecting && flow.step >= 0 && flow.step < 2) return workflowStep(flow.step);
  current = report;
  // Step 2 of a finished case shows the document selection again; the report itself is kept for step 3.
  const selecting = Boolean(!entering && report.collecting && report.conclusion && !report.autoPending && flow.step === 2);
  const drafting = Boolean(report.collecting && (!report.conclusion || selecting));
  workflowStep(report.collecting ? (drafting && !report.autoPending ? 2 : 3) : -1);
  const area = by("result");
  area.replaceChildren();
  area.hidden = false;
  if (report.demo) area.append(el("div", "가상 데이터로 만든 예시입니다.", "panel sample"));
  document.body.classList.remove("flow-input");
  document.body.classList.add("reading-report");
  // A case in the workflow is left through the step bar, which keeps it; other reports use the back button.
  by("back-search").hidden = Boolean(report.collecting);
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
  if (!report.linksOnly && !drafting) head.append(ppt);
  overview.append(head);
  const useHandoff = !report.demo && !report.reviewed && !report.local;
  if (useHandoff) {
    const picker = dossierHandoff(report);
    if (report.conclusion && !report.autoPending && !selecting) {
      const edit = el("details", "", "report-metadata");
      edit.append(el("summary", "분석 문서 다시 선택"), picker);
      overview.append(edit);
    } else {
      if (selecting) overview.append(el("p", "만들어 둔 보고서는 그대로 있습니다. 문서를 추가하거나 선택을 바꾼 뒤 보고서 생성을 누르면 다시 만들고, 이미 분석한 문서는 다시 보내지 않습니다.", "hint muted"));
      overview.append(picker);
    }
  }
  if (report.takeaway) overview.append(el("p", report.takeaway, "dossier-takeaway"));
  const milestones = reportMilestones(report);
  if (!report.linksOnly && !drafting) overview.append(reportMetrics(report, milestones));
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
  showUsage(report);
  if ((report.conclusion && !selecting) || report.reviewed) area.append(resultDashboard(report));
  if (entering) {
    title.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  if (drafting) return;
  if (report.linksOnly) {
    if (report.country === "US" && !useHandoff) area.append(usDocumentGuide(report));
    return;
  }

  if (report.country !== "UPC") {
    const nav = el("nav", "", "report-nav");
    nav.setAttribute("aria-label", "리포트 목차");
    // The sections follow the order in which a practitioner reads a prosecution history.
    for (const [id, label] of [["case-frame", "1 사건의 틀"], ["claim-evolution", "2 청구항 대조"], ["allowance-reasons", "3 등록 사유"], ["process-analysis", "4 단계별 흐름"],
      ["claim-analysis", "청구항별 비교"], ["scope-limits", "5 좁힌 기록"], ["prior-art", "6 선행기술"], ["report-family", "7 패밀리"], ["rights-record", "8 존속기간"],
      ["post-grant", "9 등록 후"], ["report-timeline", "타임라인"], ["report-documents", "심사 문서"], ["report-history", "전체 이력"]]) {
      const jump = el("a", label);
      jump.href = "#" + id;
      jump.onclick = () => { const target = by(id); if (target?.tagName === "DETAILS") target.open = true; };
      nav.append(jump);
    }
    const section = id => Object.assign(el("section", "", "panel claim-panel"), { id });
    area.append(nav, section("case-frame"), section("claim-evolution"), section("allowance-reasons"), section("process-analysis"), section("claim-analysis"),
      section("scope-limits"), section("prior-art"), familySection(report), section("rights-record"), section("post-grant"), timeline(milestones));
    const history = el("details", "", "panel record-fold");
    history.id = "report-history";
    history.append(el("summary", `심사·행정 이력 (${report.events.length})`), table(
      ["날짜", "기록", "상태·구분", "문서번호·코드"],
      report.events.map(row => [row.date, row.title, row.detail, row.id]),
      report.local ? "공식 기록을 확인한 뒤 위 입력란에 추가할 수 있습니다." : "가져온 이력이 없습니다. 공식 열람 링크를 확인해 주세요.",
    ));
    const docs = el("details", "", "panel record-fold");
    docs.id = "report-documents";
    docs.append(el("summary", `심사 문서 (${report.documents.length})`), table(
      ["날짜", "문서", "식별자", "원문 및 요약"],
      report.documents.map(doc => [doc.date, doc.title, doc.id, documentActions(report, doc)]),
      report.local ? "기관에서 받은 PDF를 아래에서 선택할 수 있습니다." : "자동으로 가져올 수 있는 공개 원문이 없습니다. 위의 공식 열람처를 확인해 주세요.",
    ));
    if (report.country === "EP" && !report.local && !report.demo) docs.append(registerZipBox(report));
    if (report.country === "US" && !useHandoff) docs.append(usDocumentGuide(report));
    area.append(docs, history);
  }
  const summaries = el("details", "", "panel record-fold");
  const slot = el("div");
  slot.id = "summaries";
  summaries.append(el("summary", "문서 요약"), slot);
  area.append(summaries);
  if (report.conclusion && !report.autoPending && !report.reviewed && !report.demo && !report.local) area.append(askPanel(report));
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
  documents: report.documents.filter(doc => report.summaries.some(item => item.id === doc.id)).map(({ date, title, id }) => ({ date, title, id })),
  summaries: report.summaries.map(({ title, source, text }) => ({ title, source, text })),
});

async function requestAnswer(report, text, signal) {
  const original = report.summaries;
  const progress = "AI가 요청한 내용을 작성하고 있습니다.";
  say("status", progress);
  const summary = await summarizeWithRetry({ action: "ask", prompt: text, report: askContext(report) }, signal, progress);
  signal.throwIfAborted();
  if (report.summaries !== original || current !== report) return;
  const number = report.summaries.filter(item => item.id?.startsWith("AI 요청")).length + 1;
  addSummary(report, { ...summary, id: `AI 요청 ${number}` });
}

async function finishDossierAnalysis(report, signal) {
  if (!report.canSummarize || report.linksOnly) return;
  const context = askContext(report);
  const record = caseContext(report);
  const base = { ...context, userFocus: report.analysisRequest, record: record.record ? JSON.stringify(record).slice(0, 9000) : undefined,
    events: report.events.filter(row => prosecutionStage(row)), documents: [], summaries: [] };
  let pieces = report.summaries.filter(item => !item.id?.startsWith("AI 요청")).map(item => ({
    title: item.title, source: [item.source, item.id].filter(Boolean).join(" · "),
    text: item.text.slice(0, 9000) + (item.text.length > 9000 || item.partial ? "\n[일부 발췌]" : ""),
  }));
  const progress = "확보한 자료를 바탕으로 심사 결과 보고서를 작성하고 있습니다.";
  const request = (summaries, prompt) => summarizeWithRetry({
    action: "ask", report: { ...base, summaries }, prompt,
  }, signal, progress);
  say("status", progress);
  // Keep every document represented even when the final request would exceed
  // the API's context limits. Preserve source references between passes.
  while (pieces.length > 10) {
    const condensed = [];
    for (let i = 0; i < pieces.length; i += 10) {
      const summary = await request(pieces.slice(i, i + 10), "수수료·접수 내역은 생략하고 각 문서에서 확인된 주요 심사 시점, 청구항, 심사관 판단, 출원인 대응, 결과를 날짜와 문서명·근거 페이지를 유지해 압축해 주세요. 근거가 없는 판단은 추가하지 마세요.");
      condensed.push({ title: "문서 묶음 " + (condensed.length + 1), source: summary.source, text: summary.text + (summary.partial ? "\n[일부 요약]" : "") });
    }
    pieces = condensed;
  }
  const final = await request(pieces, [
    "문서 요약과 기관 이력, record(등록·공개 청구항 대조와 WINTELIPS 권리 기록)만 근거로 사내 보고용 한국어 심사 보고서를 작성하세요. userFocus에 있는 사용자 요청을 네 섹션에 반영하세요.",
    "다음 네 제목을 순서대로 정확히 사용하세요. 각 제목은 ## 로 시작하는 별도 줄입니다.",
    resultHeadings.join(", "),
    "각 제목 아래 네 개 이하의 짧은 글머리표로 쓰고, 항목마다 문서의 실제 절차명과 페이지 또는 이력 날짜를 붙이세요.",
    "심사 결과: 첫 항목은 청구항 처분을 확정한 결정, 이어서 거절 근거별로 '제n항 — 부정된 특허요건·인용문헌 — 보정한 문언 또는 보정 없이 의견서 — 그 뒤의 처분'. 허여 통지와 등록을 구분하고, 불복·등록 후 절차의 결정은 심사 단계의 결과와 나눠 쓰세요.",
    "등록의 핵심 구성: 허여 이유, 마지막 거절을 푼 보정 문언, record의 청구항 대조를 근거로 독립항이 선행기술과 구별된 구성을 청구항 문언 그대로. 문언이 그대로 등록됐으면 그렇다고 쓰고, 허여 이유가 없으면 '허여 이유 미기재'라고 쓰세요.",
    "포기·제한된 범위: 감축 보정으로 추가된 한정, 삭제한 청구항, 인용발명과 구별한 한정 주장, terminal disclaimer의 조건. 없으면 '확인된 감축·한정 없음'.",
    "남은 쟁점과 위험: 보정 없이 주장만으로 극복한 거절, record의 만료일·심판·소송·이의신청, 심사 중인 후속 출원, 제3자 정보제공, 진행 중인 불복·등록 후 절차처럼 확인이 더 필요한 사실. 무효·침해 같은 법적 결론과 자료에 없는 추정은 쓰지 마세요.",
    "수수료·접수·서지 변경은 생략하되 미납에 따른 권리 상실처럼 결과를 바꾼 결정은 포함하세요. 자료가 부족하면 미확인이라고 한 줄로 표시하세요.",
  ].join(" "));
  signal.throwIfAborted();
  if (current !== report) return;
  report.conclusion = final;
  show(report);
  say("status", final.partial ? "심사 결과 보고서가 일부 작성되었습니다." : "심사 결과 보고서를 작성했습니다.");
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
        by("summaries").parentElement.open = true;
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
  by("search").textContent = apiMode ? "특허 찾기" : "공식 열람처 찾기";
  by("accessGroup").hidden = !apiMode;
  by("manualUpload").hidden = apiMode;
  if (!current) workflowStep(apiMode ? 0 : -1);
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
    // Changing the mode ends the open case; one that is not on screen is dropped so the step bar stops offering it.
    if (current?.collecting && flow.step >= 0 && flow.step < 2) current = undefined;
    by("search").disabled = false;
    say("status", "");
    updateMode();
  });
});

// The search result and the open case stay in memory, so each step can be reopened without redoing the ones before it.
const flow = { step: 0, found: undefined, pick: undefined, candidate: undefined };
const caseSignals = new WeakMap();
const openCase = () => current?.collecting && caseSignals.get(current)?.aborted === false ? current : undefined;

function workflowStep(index) {
  flow.step = index;
  const bar = by("case-flow");
  bar.hidden = index < 0;
  const open = openCase();
  const reachable = [true, Boolean(flow.found), Boolean(open), Boolean(open && (open.conclusion || open.autoPending))];
  [...bar.children].forEach((item, i) => {
    if (i === index) item.setAttribute("aria-current", "step");
    else item.removeAttribute("aria-current");
    item.classList.toggle("complete", i < index);
    item.firstElementChild.disabled = i === index || !reachable[i];
  });
}

function goStep(index) {
  const open = openCase();
  if (index === 0) {
    // The result stays in the page (only hidden by the class) so files arriving for the open case still reach it.
    document.body.classList.remove("reading-report");
    document.body.classList.add("flow-input");
    workflowStep(0);
    by("number").focus();
  } else if (index === 1 && flow.found) {
    showCandidates(flow.found, flow.pick);
  } else if (index >= 2 && open) {
    flow.step = index;
    show(open);
    window.scrollTo(0, 0);
  }
}
[...by("case-flow").children].forEach((item, index) => item.firstElementChild.addEventListener("click", () => goStep(index)));

// Opening another case drops the open one, so a finished or running analysis is confirmed first.
function leaveOpenCase() {
  const open = openCase();
  return !open || !(open.conclusion || open.autoPending) ||
    window.confirm("다른 사건을 열면 현재 사건에서 만든 보고서와 추가한 문서가 지워집니다. 계속할까요?");
}

function showCandidates(found, pick, local = false) {
  const area = by("result");
  area.replaceChildren();
  area.hidden = false;
  document.body.classList.remove("reading-report", "flow-input");
  by("back-search").hidden = true;
  const panel = el("section", "", "panel");
  workflowStep(local ? -1 : 1);
  const hasUnverified = found.candidates.some(item => item.linksOnly);
  const heading = el("h2", local || hasUnverified ? `가능한 번호 해석 ${found.candidates.length}가지` : `검색 결과 ${found.candidates.length}건`, "report-title");
  heading.id = "report-title";
  heading.tabIndex = -1;
  panel.append(heading, el("p", local ? "국가 코드가 없어 여러 관할의 번호로 읽을 수 있습니다. 확인할 번호를 고르세요."
    : hasUnverified ? "자동 조회 미확인 항목은 원문을 연결해 검토할 수 있습니다." : "심사문서를 내려받을 특허를 선택하세요.", "muted"));
  panel.append(table(
    local ? ["관할", "번호 해석", ""] : ["관할", "명칭", "출원번호", "문헌·등록번호", "출원일", "상태", "출원인", "일치", ""],
    found.candidates.map(item => {
      // The case that is already open is continued as it is instead of being looked up again.
      const reopen = !local && item === flow.candidate && Boolean(openCase());
      const choose = button(local ? "열람처 보기" : reopen ? "이 사건 이어서 하기" : "심사문서 다운로드", () => {
        if (reopen) return goStep(2);
        if (!local && !leaveOpenCase()) return;
        panel.querySelectorAll("button").forEach(control => { control.disabled = true; });
        Promise.resolve(pick(item)).finally(() => {
          panel.querySelectorAll("button").forEach(control => { control.disabled = false; });
        });
      }, reopen ? "primary" : "secondary");
      if (!local && !reopen) choose.dataset.prepareCase = "true";
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
  if (!leaveOpenCase()) return;
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
  document.body.classList.remove("reading-report", "flow-input");
  const url = new URL(location.href);
  url.searchParams.delete("patent");
  url.hash = "";
  history.replaceState(null, "", url);
  say("status", "");
  workflowStep(isAutomaticMode() ? 0 : -1);
  by("number").focus();
});

async function openCandidate(candidate, notes = [], request = "") {
  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;
  const version = ++searchVersion;
  const control = by("search");
  control.disabled = true;
  say("status", "선택한 특허의 공개 기록을 조회하고 있습니다.");
  try {
    const query = candidate.source === "wintelips" ? { source: "wintelips", skey: candidate.skey }
      : { number: candidate.number, country: candidate.country, numberType: candidate.numberType };
    const response = await api({ action: "lookup", ...query }, controller.signal);
    const data = await response.json();
    const report = { ...data, summaries: [], analysisRequest: request, collecting: true };
    controller.signal.throwIfAborted();
    report.notes.unshift(...notes);
    caseSignals.set(report, controller.signal);
    flow.candidate = candidate;
    show(report);
    finishReport(report);
    say("status", report.linksOnly ? "자동 조회로 사건을 확인하지 못했습니다. 직접 추가한 심사문서를 선택해 분석할 수 있습니다."
      : "원문 준비 · 사용할 문서를 체크한 뒤 보고서 생성을 누르세요.");
  } catch (error) {
    if (searchVersion === version) say("status", error.message, true);
  } finally {
    if (searchVersion === version) control.disabled = false;
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
  if (!leaveOpenCase()) return;
  activeSearch?.abort();
  const controller = new AbortController();
  activeSearch = controller;
  const version = ++searchVersion;
  const control = by("search");
  const apiMode = isAutomaticMode();
  control.disabled = true;
  by("result").hidden = true;
  document.body.classList.remove("flow-input");
  current = flow.found = flow.pick = flow.candidate = undefined;
  const [number, office, numberType] = [by("number").value, by("office").value, by("numberType").value];
  const request = apiMode ? by("request").value.trim() : "";
  workflowStep(apiMode ? 1 : -1);
  say("status", apiMode ? "번호와 일치하는 특허를 찾고 있습니다." : "공식 열람처를 준비하고 있습니다.");
  try {
    if (apiMode) {
      const found = await (await api({ action: "search", number, country: office, numberType, source: by("source").value }, controller.signal)).json();
      controller.signal.throwIfAborted();
      if (!found.candidates.length) throw new Error(["일치하는 특허를 찾지 못했습니다.", ...found.notes].join(" "));
      flow.found = found;
      flow.pick = candidate => openCandidate(candidate, found.notes, request);
      showCandidates(found, flow.pick);
      say("status", "특허를 찾았습니다. 해당 사건의 심사문서 다운로드를 누르세요.");
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
  if (!leaveOpenCase()) return;
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

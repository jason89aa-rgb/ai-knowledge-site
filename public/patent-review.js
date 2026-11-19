"use strict";

const by = id => document.getElementById(id);
const facts = [
  ["application", "출원번호"], ["publication", "공개번호"], ["grant", "등록번호"],
  ["filed", "출원일"], ["published", "공개일"], ["granted", "등록일"],
  ["status", "기관 표시 상태"], ["applicants", "출원인"], ["inventors", "발명자"],
];
const examples = {
  auto: "EP4286919A1", KR: "10-2023-0010262", US: "US 2014-0167116 A1", EP: "EP4286919A1",
  CN: "CN101876751A", UPC: "UPC_CFI_123/2025", WO: "WO2023232483A1", JP: "JP2020123456A",
};
let current;
let searchVersion = 0;

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

async function api(data) {
  const code = by("access").value;
  if (!code) throw new Error("팀 액세스 코드를 입력해 주세요.");
  const headers = { "X-Patent-Access": code };
  const form = data instanceof FormData;
  if (!form) headers["Content-Type"] = "application/json";
  const response = await fetch("/api/patent-review", {
    method: "POST", headers, body: form ? data : JSON.stringify(data), cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || "요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.");
  }
  return response;
}

function summaryCard(summary) {
  const item = el("article", "", "summary");
  item.append(el("h3", summary.title), el("small", [summary.source, summary.id, summary.model].filter(Boolean).join(" · ")), el("pre", summary.text));
  if (summary.partial) item.append(el("p", "출력 한도에 도달해 요약 일부만 표시됩니다.", "muted"));
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
      await window.exportPatentPptx(report, dateLabel(report.retrievedAt), facts, download);
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
  slot.replaceChildren(...report.summaries.map(summaryCard));
  if (!report.summaries.length) slot.append(el("p", "심사 문서에서 요약을 실행하거나 아래에서 PDF를 올려 주세요.", "muted"));
}

function documentActions(report, doc) {
  if (!doc.downloadable || report.demo) return "공식 열람처 참고";
  const wrapper = el("div", "", "document-actions");
  const payload = { country: report.country, application: report.application, id: doc.id, code: doc.code };
  for (const [action, title] of [["download", "원문 PDF"], ["summarize", "Claude 요약"]]) {
    wrapper.append(button(title, async event => {
      const control = event.currentTarget;
      control.disabled = true;
      say("status", action === "download" ? "기관에서 PDF를 받고 있습니다." : "공개 원문을 Claude로 요약하고 있습니다.");
      try {
        const response = await api({ action, ...payload });
        if (action === "download") download(await response.blob(), `${report.country}-${doc.id}.pdf`);
        else {
          const summary = { ...await response.json(), id: doc.id };
          report.summaries = report.summaries.filter(item => item.id !== doc.id);
          report.summaries.push(summary);
          showSummaries(report);
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
    by("office").value = row.country;
    by("number").value = number;
    by("numberType").value = row.publication ? (row.country === "KR" && /^KR(?:10|20)\d{7}(?:B\d?)?$/.test(number) ? "grant" :
      row.country === "US" && /^US\d{5,8}[BS]\d?$/.test(number) ? "grant" : "publication") : "application";
    by("office").dispatchEvent(new Event("change"));
    by("lookup").requestSubmit();
    by("number").focus();
  }, "text-button");
}

function show(report) {
  current = report;
  const area = by("result");
  area.replaceChildren();
  area.hidden = false;
  if (report.demo) area.append(el("div", "가상 데이터로 만든 예시입니다.", "panel sample"));
  const overview = el("section", "", "panel");
  const head = el("div", "", "report-head");
  const identity = el("div");
  const title = el("h2", report.title || report.query, "report-title");
  title.id = "report-title";
  identity.append(el("p", [report.country, report.query, report.source].filter(Boolean).join(" · "), "identity"), title,
    el("p", dateLabel(report.retrievedAt), "muted hint"));
  head.append(identity, exportButton(report, "status"));
  overview.append(head);
  const fields = el("dl", "", "facts");
  for (const [key, label] of facts) {
    if (!report[key]) continue;
    const group = el("div");
    group.append(el("dt", label), el("dd", report[key]));
    fields.append(group);
  }
  if (fields.childElementCount) overview.append(fields);
  if (report.abstract) {
    const abstract = el("details");
    abstract.append(el("summary", "초록"), el("p", report.abstract));
    overview.append(abstract);
  }
  if (report.links.length) {
    const links = el("div", "", "links");
    links.append(...report.links.map(link));
    overview.append(links);
  }
  if (report.notes.length) {
    const notes = el("ul", "", "notes");
    notes.append(...report.notes.map(note => el("li", note)));
    overview.append(notes);
  }
  area.append(overview);

  if (report.country !== "UPC") {
    const family = el("section", "", "panel");
    family.append(el("h2", `패밀리 및 연계 출원 (${report.family.length})`), table(
      ["관할", "공개·등록번호", "출원번호", "조회 관계", "일자"],
      report.family.map(row => [row.country, familyCell(row), row.application, row.relation, row.date]),
      "표시할 패밀리 자료가 없습니다.",
    ));
    const history = el("section", "", "panel");
    history.append(el("h2", `심사·행정 이력 (${report.events.length})`), table(
      ["날짜", "기록", "상태·구분", "문서번호·코드"],
      report.events.map(row => [row.date, row.title, row.detail, row.id]),
      "자동으로 가져온 이력이 없습니다. 공식 열람 링크에서 확인할 수 있습니다.",
    ));
    const docs = el("section", "", "panel");
    docs.append(el("h2", `심사 문서 (${report.documents.length})`), table(
      ["날짜", "문서", "식별자", "원문 및 요약"],
      report.documents.map(doc => [doc.date, doc.title, doc.id, documentActions(report, doc)]),
      "자동으로 가져온 문서가 없습니다. 기관에서 받은 PDF를 아래에서 올릴 수 있습니다.",
    ));
    area.append(family, history, docs);
  }
  const summaries = el("section", "", "panel");
  const slot = el("div");
  slot.id = "summaries";
  summaries.append(el("h2", "문서 요약"), slot);
  area.append(summaries);
  showSummaries(report);
}

by("office").addEventListener("change", () => {
  const office = by("office").value;
  by("number").placeholder = examples[office] ? "예: " + examples[office] : "국가 코드와 특허번호";
  by("numberType").disabled = office === "UPC";
  by("search").textContent = office === "UPC" ? "사건 열람처 찾기" : "특허 조회";
});

by("lookup").addEventListener("submit", async event => {
  event.preventDefault();
  const version = ++searchVersion;
  const control = by("search");
  control.disabled = true;
  say("status", "공개 특허 데이터를 확인하고 있습니다.");
  try {
    const response = await api({
      action: "lookup", country: by("office").value, numberType: by("numberType").value, number: by("number").value,
    });
    const report = await response.json();
    if (searchVersion !== version) return;
    show({ ...report, summaries: [] });
    say("status", "조회 결과를 표시했습니다.");
  } catch (error) {
    if (searchVersion === version) say("status", error.message, true);
  } finally {
    if (searchVersion === version) control.disabled = false;
  }
});

by("example").addEventListener("click", () => {
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
  const file = by("pdf").files[0];
  if (!file || !file.name.toLowerCase().endsWith(".pdf") || file.size > 3.5 * 1024 * 1024) {
    say("uploadStatus", "3.5 MiB 이하의 PDF 파일을 선택해 주세요.", true);
    return;
  }
  const report = current;
  const control = by("upload").querySelector("button");
  const form = new FormData();
  form.append("pdf", file);
  control.disabled = true;
  say("uploadStatus", "선택한 PDF를 Claude로 요약하고 있습니다.");
  try {
    const response = await api(form);
    const summary = await response.json();
    if (report && !report.demo && current === report) {
      report.summaries.push(summary);
      showSummaries(report);
      say("uploadStatus", "현재 보고서의 문서 요약에 추가했습니다.");
    } else {
      const standalone = { title: summary.title, source: "사용자 업로드", retrievedAt: new Date().toISOString(),
        query: "", notes: [], family: [], events: [], documents: [], links: [], summaries: [summary] };
      by("standalone").replaceChildren(summaryCard(summary), exportButton(standalone, "uploadStatus"));
      say("uploadStatus", "PDF 요약이 완료되었습니다.");
    }
    by("upload").reset();
  } catch (error) {
    say("uploadStatus", error.message, true);
  } finally {
    control.disabled = false;
  }
});

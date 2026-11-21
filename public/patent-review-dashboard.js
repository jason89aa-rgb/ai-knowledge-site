"use strict";

// Use UTC calendar days so daylight saving and the reader's timezone cannot move an event.
function calendarDay(value) {
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:$|T)/.exec(String(value));
  if (!match) return null;
  const iso = match.slice(1).join("-");
  const time = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso) ? iso : null;
}

// Use docket titles and document codes, never a reference buried in a fee receipt.
function prosecutionStage(record) {
  const code = String(record.code || record.id || "").trim().toUpperCase();
  const title = (record.title || "").replace(/[_–—]/g, " ").replace(/\s+/g, " ").trim();
  const byCode = { CTNF: "비최종 거절", CTFR: "최종 거절", CTAV: "Advisory Action",
    CTRS: "R/R · 제한요구", NOA: "NoA · 허여 통지", RCEX: "RCE · 계속심사 청구" };
  const actionCode = code.replace(/^M(?=CTNF$|CTFR$|CTRS$)/, "");
  if (Object.hasOwn(byCode, actionCode)) return byCode[actionCode];
  if (/notice of allowance and (?:issue )?fee/i.test(title) && !/response to|withdraw/i.test(title)) return "NoA · 허여 통지";
  if (/abandon(?:ed|ment)|lapse(?:d)?|취하 간주|권리 소멸/i.test(title)) return "결정·종결";
  if (/\bfees?\b|payment|receipt|postcard|acknowledg|transmittal|수수료|납부|등록료|연차료|접수증|영수증/i.test(title)) return "";
  if (/advisory action|권고\s*통지/i.test(title) && !/response (?:to|after)|reply to/i.test(title)) return "Advisory Action";
  if (/board.{0,22}decision|appeal decision|decision on appeal|심결/i.test(title)) return "Appeal · 불복 결정";
  if (/examiner.s answer|reply brief|appeal brief|pre[- ]?appeal/i.test(title)) return "Appeal · 불복 심리";
  if (/notice of appeal|심판청구|항고/i.test(title)) return "Appeal · 불복 청구";
  if (/request for continued examination|\bRCE\b|계속심사\s*청구/i.test(title)) return "RCE · 계속심사 청구";
  if (/examiner.s amendment|심사관.{0,2}보정/i.test(title)) return "심사관 보정";
  if (/interview summary|면담\s*기록/i.test(title)) return "면담 기록";
  if (/response (?:to|after)|reply to|applicant.{0,16}(argument|remark|response)|amendment|amended claims|election (?:with|without)|보정서?|의견서|답변서|반박|청구항 제출|포기서 제출/i.test(title)) return "출원인 대응·보정";
  if (/restriction\s*[/&]\s*election|restriction (?:and |or )?(?:election |species )?requirement|requirement for restriction|election of species requirement|\bR\s*\/\s*R\b|제한\s*요구|한정\s*요구/i.test(title)) return "R/R · 제한요구";
  if (/withdraw.{0,20}(allowance|issue)|허여 철회/i.test(title)) return "허여 절차 철회";
  if (/notice of allowability/i.test(title)) return "허여 가능 통지";
  if (/notice of allowance|허여\s*통지|\bNOA\b/i.test(title)) return "NoA · 허여 통지";
  if (/non[- ]?final (?:office )?(?:rejection|action)|비최종\s*(?:거절|통지)/i.test(title)) return "비최종 거절";
  if (/final (?:office )?(?:rejection|action)|최종\s*(?:거절|통지)/i.test(title)) return "최종 거절";
  if (/appeal/i.test(title)) return "Appeal · 불복 심리";
  if (/oral proceedings|opposition|구술심리|이의신청/i.test(title)) return "이의·심리 절차";
  if (/abandon(?:ed|ment)|application (?:deemed )?withdrawn|decision to refuse|revocation|거절결정|취하|포기 간주|취소결정/i.test(title)) return "결정·종결";
  if (/decision to grant|intention to grant|rule 71\s*\(3\)|등록결정|특허결정/i.test(title)) return "등록 결정·예고";
  if (/patent (?:was )?(?:granted|issued)|grant of (?:a |the )?patent|publication of (?:the )?grant|특허 등록|^등록$|설정등록/i.test(title)) return "특허 등록";
  if (/office action|examination report|written opinion|search report|art(?:icle)?\.?\s*94\s*\(3\)|거절\s*이유|의견제출통지|심사의견|검색보고서|拒絶理由/i.test(title)) return "심사관 검토";
  if (/terminal disclaimer|권리기간 포기서/i.test(title)) return "권리기간 포기 절차";
  if (/request for examination|심사청구/i.test(title)) return "심사 청구";
  if (/application filed|filing of (?:the )?application|^출원$|계속출원|출원서 제출/i.test(title)) return "출원";
  return "";
}

function procedureName(title) {
  return String(title || "").split(/[\\]/).pop().replace(/^\d{4}[-.]\d{2}[-.]\d{2}[\s_.-]+/, "")
    .replace(/\.pdf$/i, "").replace(/_/g, " / ").trim();
}

function claimScope(numbers) {
  const claims = [...new Set(numbers)].sort((a, b) => a - b);
  const ranges = [];
  for (let i = 0; i < claims.length; i++) {
    const first = claims[i];
    while (claims[i + 1] === claims[i] + 1) i++;
    ranges.push(first === claims[i] ? String(first) : first + "–" + claims[i]);
  }
  return ranges.length ? "청구항 " + ranges.join(", ") : "";
}

function reportMilestones(report) {
  const dates = new Map();
  function put(value, stage, title, finding) {
    const date = calendarDay(value);
    if (!date || !stage) return;
    if (!dates.has(date)) dates.set(date, new Map());
    const records = dates.get(date);
    if (!records.has(stage)) records.set(stage, new Map());
    const sources = records.get(stage);
    if (!sources.has(title) || finding) sources.set(title || stage, finding);
  }
  for (const row of [...report.events, ...report.documents]) put(row.date, prosecutionStage(row), row.title);
  for (const [field, title] of [["filed", "출원"], ["granted", "특허 등록"]]) put(report[field], title, title);
  for (const summary of report.summaries) {
    for (const row of summary.evidence || []) {
      const stage = prosecutionStage(summary) || { examiner: "심사관 검토", applicant: "출원인 대응·보정", outcome: "심사 결과" }[row.role];
      const existing = dates.get(calendarDay(row.documentDate))?.get(stage)?.get(summary.title);
      if (!existing) put(row.documentDate, stage, summary.title, row);
    }
  }
  return [...dates].sort(([a], [b]) => a.localeCompare(b));
}

function reportMetrics(report, milestones) {
  const strip = el("dl", "", "dossier-metrics");
  const first = calendarDay(report.filed);
  const last = calendarDay(report.granted);
  const duration = first && last && last >= first ? (Date.parse(last) - Date.parse(first)) / 86400000 : null;
  const metrics = [
    ["기관 표시 상태", report.status || "미확인"],
    duration === null ? ["주요 심사 시점", milestones.length + "개"] : ["출원부터 등록까지", duration.toLocaleString("ko-KR") + "일"],
    ["수록 문서", report.documents.length + "건"],
  ];
  for (const [label, value] of metrics) {
    const cell = el("div");
    cell.append(el("dt", label), el("dd", value));
    strip.append(cell);
  }
  return strip;
}

function timeline(dates) {
  const section = el("section", "", "panel time-panel");
  section.id = "report-timeline";
  section.append(el("h2", "주요 심사 타임라인"));
  if (!dates.length) {
    section.append(el("p", "확인된 자료에서 날짜가 명시된 주요 심사 단계를 찾지 못했습니다.", "muted"));
    return section;
  }
  const guide = {
    "R/R · 제한요구": ["examiner", "Restriction Requirement", "심사받을 발명이나 종을 선택하라는 요구"],
    "비최종 거절": ["examiner", "Non-Final Rejection", "심사관이 청구항에 대한 거절이유를 통지"],
    "최종 거절": ["examiner", "Final Rejection", "심사관이 거절이유를 최종 통지"],
    "Advisory Action": ["examiner", "최종 거절 후 통지", "최종 거절 이후 제출된 대응에 대한 심사관 통지"],
    "출원인 대응·보정": ["applicant", "", "출원인이 의견, 발명 선택 또는 청구항 보정을 제출"],
    "RCE · 계속심사 청구": ["applicant", "", "출원인이 심사를 계속해 달라고 요청"],
    "Appeal · 불복 청구": ["appeal", "", "불복 절차를 시작한 기록"],
    "Appeal · 불복 심리": ["appeal", "", "불복 절차에서의 의견 제출 또는 심리"],
    "Appeal · 불복 결정": ["outcome", "", "불복 절차에서 내려진 판단"],
    "NoA · 허여 통지": ["outcome", "Notice of Allowance", "특허 허여를 알리는 심사관 통지"],
    "특허 등록": ["outcome", "", "특허 등록일이 확인된 기록"],
  };
  const axis = el("ol", "", "stage-axis");
  for (const [date, stages] of dates) {
    for (const [stage, sources] of stages) {
      const [tone, subtitle, description] = guide[stage] || ["neutral", "", ""];
      const step = el("li", "", "stage-step stage-" + tone);
      const time = el("time", date);
      time.dateTime = date;
      const heading = el("div", "", "stage-heading");
      const names = [...new Set([...sources.keys()].map(procedureName))];
      heading.append(el("h3", names.join(" · ")));
      if (!names.includes(stage)) heading.append(el("span", stage));
      else if (subtitle) heading.append(el("span", subtitle));
      step.append(time, heading);
      const finding = [...sources.values()].find(Boolean);
      if (finding) {
        step.append(el("p", finding.text));
      } else if (description) step.append(el("p", description));
      const detail = el("details", "", "stage-record");
      detail.append(el("summary", "근거 기록 " + sources.size + "건"));
      const titles = el("ul");
      for (const [title, evidence] of sources) {
        titles.append(el("li", [title, evidence?.locator].filter(Boolean).join(" · ")));
      }
      detail.append(titles);
      step.append(detail);
      axis.append(step);
    }
  }
  section.append(axis);
  return section;
}

// A dated response belongs to a notice only if the cited notice can be
// identified. Two notices mailed on the same date remain distinct proceedings.
const noticeStages = new Set(["비최종 거절", "최종 거절", "R/R · 제한요구", "심사관 검토", "Advisory Action"]);
function proceedingBriefs(report) {
  const actions = new Map();
  const briefs = new Map();
  function isNotice(record) {
    return noticeStages.has(prosecutionStage(record)) &&
      !/search report|검색보고서/i.test(record.title || "");
  }
  function put(key, record, date) {
    if (!briefs.has(key)) briefs.set(key, { key, name: procedureName(record.title) || "문서명 미확인",
      stage: prosecutionStage(record), date, rows: [] });
    return briefs.get(key);
  }
  function notice(record, date, key) {
    const brief = put(key, record, date);
    if (!actions.has(date)) actions.set(date, []);
    actions.get(date).push(brief);
  }
  const summariesById = new Map(report.summaries.map(summary => [summary.id, summary]));
  for (const doc of report.documents) {
    const evidence = summariesById.get(doc.id)?.evidence || [];
    const name = evidence.find(row => row.procedureTitle)?.procedureTitle;
    const record = isNotice(doc) || !name ? doc : { ...doc, title: name };
    const date = calendarDay(doc.date) || calendarDay(evidence[0]?.documentDate);
    if (date && isNotice(record)) notice(record, date, "doc:" + doc.id);
  }
  for (const event of report.events) {
    const date = calendarDay(event.date);
    if (!date || !isNotice(event)) continue;
    const same = (actions.get(date) || []).some(action => action.name === procedureName(event.title) ||
      (action.stage === prosecutionStage(event) && ["비최종 거절", "최종 거절", "R/R · 제한요구"].includes(action.stage)));
    if (!same) notice(event, date, "event:" + date + ":" + event.title);
  }
  for (const [index, summary] of report.summaries.entries()) {
    const doc = summary.id && report.documents.find(item => item.id === summary.id);
    const ownKey = doc ? "doc:" + doc.id : "summary:" + index;
    if (!summary.evidence?.length && summary.text && prosecutionStage(doc || summary)) {
      const group = put(ownKey, doc || summary, calendarDay(doc?.date || summary.date));
      group.summaryIndex = index;
    }
    for (const entry of summary.evidence || []) {
      const date = calendarDay(entry.documentDate) || calendarDay(doc?.date);
      const docketTitle = doc?.title || summary.title;
      const record = { ...doc, title: prosecutionStage({ ...doc, title: docketTitle }) ? docketTitle : entry.procedureTitle || docketTitle };
      const targetDate = calendarDay(entry.roundDate);
      const candidates = targetDate && (!date || targetDate <= date) ? actions.get(targetDate) || [] : [];
      let target;
      if (candidates.length) {
        const refName = procedureName(entry.noticeTitle).toLowerCase();
        const named = candidates.filter(action => action.name.toLowerCase() === refName);
        const typed = candidates.filter(action => action.stage === prosecutionStage({ title: refName }));
        const matches = named.length ? named : refName ? typed : candidates;
        if (matches.length === 1) target = matches[0];
      }
      if (entry.noticeId && entry.reference) {
        const named = briefs.get("doc:" + entry.noticeId);
        target = named && actions.get(named.date)?.includes(named) && (!targetDate || targetDate === named.date) &&
          (!date || named.date <= date) ? named : undefined;
      }
      // The notice's own findings never migrate into a different notice.
      const ownNotice = briefs.get(ownKey);
      const group = (isNotice(record) && ownNotice ? ownNotice : target) || put(ownKey, record, date);
      if (group.key === ownKey && !group.date && date) group.date = date;
      group.rows.push({ ...entry, date, sourceStage: prosecutionStage(record), procedure: procedureName(record.title), sourceTitle: summary.title,
        index, linked: group.key !== ownKey, targetDate });
    }
  }
  for (const group of briefs.values()) {
    group.rows.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  }
  return [...briefs.values()].sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
}

const briefRoles = [["examiner", "심사관의 판단"], ["applicant", "출원인의 답변·보정"], ["outcome", "문서상 처분"]];

function findingSource(row, compact = false) {
  const cite = [row.date, procedureName(row.sourceTitle), row.locator].filter(Boolean).join(" · ");
  const source = el("a", compact ? [row.date, row.locator].filter(Boolean).join(" · ") : cite, "source-ref");
  source.title = cite;
  source.href = "#summary-" + row.index;
  source.onclick = () => { by("summaries").parentElement.open = true; };
  return source;
}

function claimComparison(briefs, reviewed) {
  const claims = new Map();
  for (const group of briefs) {
    for (const row of group.rows) {
      let role = row.role;
      if (role === "outcome") {
        // A notice may describe claims as allowable or rejected before a response.
        // Its disposition belongs with the examiner's opinion, even in older reports.
        if (noticeStages.has(row.sourceStage)) role = "examiner";
        else if (!row.date || row.sourceStage === "출원인 대응·보정" ||
          !(row.finalDisposition === true || (reviewed && row.sourceStage === "NoA · 허여 통지"))) role = null;
      }
      for (const number of row.claims) {
        if (!claims.has(number)) claims.set(number, { examiner: [], applicant: [], outcome: [] });
        if (role) claims.get(number)[role].push(row);
      }
    }
  }
  return [...claims.entries()].sort(([a], [b]) => a - b).map(([number, cells]) => {
    for (const rows of Object.values(cells)) rows.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
    const lastDecision = cells.outcome.at(-1)?.date;
    const notices = cells.examiner.filter(row => noticeStages.has(row.sourceStage)).map(row => row.date).filter(Boolean).sort();
    const laterReview = lastDecision && notices.some(date => date > lastDecision);
    // Keep every decision since the last office action, so the deciding allowance is not hidden by a later corrected notice.
    const lastNotice = notices.at(-1);
    cells.outcome = laterReview ? [] : cells.outcome.filter(row => !lastNotice || (row.date && row.date > lastNotice));
    return { number, cells };
  });
}

// Claims whose three columns hold exactly the same findings share one row, labelled as a range such as "1~19항".
function groupClaims(rows) {
  const ids = new Map();
  const id = row => ids.get(row) ?? ids.set(row, ids.size).get(row);
  const groups = [];
  for (const row of rows) {
    const key = ["examiner", "applicant", "outcome"].map(role => row.cells[role].map(id).join(",")).join("|");
    const last = groups.at(-1);
    if (last && last.key === key) last.numbers.push(row.number);
    else groups.push({ key, numbers: [row.number], cells: row.cells });
  }
  return groups.map(({ numbers, cells }) => ({ number: numbers[0], label: claimRange(numbers), cells }));
}

function claimRange(numbers) {
  const parts = [];
  for (let i = 0; i < numbers.length; i++) {
    let j = i;
    while (j + 1 < numbers.length && numbers[j + 1] === numbers[j] + 1) j++;
    parts.push(j > i ? numbers[i] + "~" + numbers[j] : String(numbers[i]));
    i = j;
  }
  return parts.join(", ") + "항";
}

// Claim-level detail of a finding: the ground, limitation and prior art behind a rejection, or how the applicant answered it.
const responseLabels = { amend: "보정", argue: "보정 없이 의견서", cancel: "청구항 삭제", add: "청구항 신설", disclaimer: "Terminal disclaimer 제출" };

function findingDetails(row) {
  const applicant = row.role === "applicant";
  const chip = applicant ? responseLabels[row.responseType] || "" : row.ground || "";
  const lines = [];
  if (row.element) {
    const label = !applicant ? "대상 구성" : ["amend", "add"].includes(row.responseType) ? "보정 문언" : row.responseType === "cancel" ? "삭제 대상" : "다툰 구성";
    lines.push([label, ["“" + row.element + "”"]]);
  }
  const references = (row.references || []).filter(item => item?.doc).map(item => [item.doc, item.where].filter(Boolean).join(" · "));
  if (references.length) lines.push(["인용문헌", references]);
  return { chip, tone: applicant ? row.responseType : "ground", lines };
}

function findingDetailNodes(row) {
  const { chip, tone, lines } = findingDetails(row);
  const nodes = { chip: chip ? el("span", chip, "detail-chip chip-" + tone) : null, list: null };
  if (lines.length) {
    nodes.list = el("dl", "", "finding-detail");
    for (const [label, values] of lines) {
      const line = el("div");
      const value = el("dd");
      value.append(...values.map(text => el("span", text)));
      line.append(el("dt", label), value);
      nodes.list.append(line);
    }
  }
  return nodes;
}

// Plain-text form of the same detail for the PowerPoint export.
function findingDetailText(row) {
  const { chip, lines } = findingDetails(row);
  return [chip && (row.role === "applicant" ? "대응 방식: " : "거절 근거: ") + chip, ...lines.map(([label, values]) => label + ": " + values.join("; "))].filter(Boolean);
}

// One line per ground or response type with the claims it covers, so a stage can be read before its individual findings.
function stageOverview(role, rows) {
  const groups = new Map();
  const group = label => {
    const key = label.replace(/\s+/g, "");
    if (!groups.has(key)) groups.set(key, { label, claims: new Set(), references: new Set() });
    return groups.get(key);
  };
  if (role === "examiner") {
    for (const row of rows) {
      if (!row.ground) continue;
      const entry = group(row.ground);
      row.claims.forEach(number => entry.claims.add(number));
      for (const item of row.references || []) if (item?.doc) entry.references.add(item.doc);
    }
  } else {
    const types = new Map();
    for (const row of rows) {
      if (!responseLabels[row.responseType]) continue;
      if (!row.claims.length) group(responseLabels[row.responseType]);
      for (const number of row.claims) types.set(number, (types.get(number) || new Set()).add(row.responseType));
    }
    // A claim counts as answered by argument only when the stage shows no amendment, cancellation or new claim for it.
    for (const [number, found] of [...types].sort(([a], [b]) => a - b)) {
      const changed = ["amend", "cancel", "add"].filter(type => found.has(type));
      for (const type of changed.length ? changed : found) group(responseLabels[type]).claims.add(number);
    }
  }
  if (!groups.size) return null;
  const list = el("ul", "", "stage-overview");
  for (const { label, claims, references } of groups.values()) {
    const item = el("li");
    item.append(el("strong", label), [claimScope([...claims]), [...references].join(", ")].filter(Boolean).map(text => " · " + text).join(""));
    list.append(item);
  }
  return list;
}

function comparisonTable(rows) {
  const wrap = el("div", "", "table-wrap claim-comparison");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "청구항별 심사 비교표");
  const table = el("table");
  const head = table.createTHead().insertRow();
  for (const title of ["청구항", "심사관 의견", "출원인 대응", "최종 결과"]) {
    const th = el("th", title);
    th.scope = "col";
    head.append(th);
  }
  const body = table.createTBody();
  for (const { number, label, cells } of rows) {
    const tr = body.insertRow();
    const claim = el("th", label || number + "항");
    claim.scope = "row";
    tr.append(claim);
    for (const [role, empty, title] of [["examiner", "의견 미확인", "심사관 의견"], ["applicant", "대응 미확인", "출원인 대응"],
      ["outcome", "최종 결과 미확인", "최종 결과"]]) {
      const td = tr.insertCell();
      td.dataset.label = title;
      if (!cells[role].length) td.append(el("span", empty, "comparison-empty"));
      for (const row of cells[role]) {
        const item = el("div", "", "comparison-finding");
        const detail = findingDetailNodes(row);
        item.append(...[detail.chip, el("p", row.text), detail.list, findingSource(row, true)].filter(Boolean));
        if (role === "applicant" && row.linked && row.targetDate) {
          item.append(el("small", row.targetDate + " 통지에 대한 답변", "comparison-context"));
        }
        td.append(item);
      }
    }
  }
  wrap.append(table);
  return wrap;
}

// Each examiner notice opens a stage; the applicant's filings until the next notice answer it.
const stageTitles = {
  "R/R · 제한요구": ["Restriction Requirement", "제한요구"], "비최종 거절": ["Non-Final Rejection", "비최종 거절이유 통지"],
  "최종 거절": ["Final Rejection", "최종 거절이유 통지"], "Advisory Action": ["Advisory Action", "최종 거절 후 통지"], "심사관 검토": ["", "심사관 통지"],
  "결정·종결": ["", "거절결정 · 재심사·불복 대상"],
};
const decisionStages = new Set(["NoA · 허여 통지", "허여 가능 통지", "등록 결정·예고", "결정·종결", "Appeal · 불복 결정", "특허 등록", "심사관 보정"]);
// A refusal decision can still be answered (re-examination, appeal), so it opens a stage like a notice.
const refusalDecision = /거절결정|decision to refuse|refusal decision|拒絶査定|驳回决定/i;
const opensStage = (stage, name) => noticeStages.has(stage) || (stage === "결정·종결" && refusalDecision.test(name || ""));

function referenceOnly(group) {
  return !group.stage && !group.rows.some(row => row.linked) &&
    /^(?:claims|specification|drawings?|abstract|bibliographic data sheet|청구항 제출본|명세서|공보 청구항|공보 첫 면)(?:$|\s*[(·])/i.test(group.name);
}

function prosecutionRounds(report, briefs) {
  const notices = briefs.filter(group => opensStage(group.stage, group.name) && group.date);
  for (const event of report.events) {
    const date = calendarDay(event.date);
    const name = procedureName(event.title);
    if (date && prosecutionStage(event) === "결정·종결" && refusalDecision.test(name) && !notices.some(notice => notice.date === date)) {
      notices.push({ key: "event:" + date + ":" + name, name, stage: "결정·종결", date, rows: [] });
    }
  }
  notices.sort((a, b) => a.date.localeCompare(b.date));
  const rounds = notices.map(notice => ({ notice, responses: [], decisions: [], docket: [], results: [] }));
  const roundAt = date => rounds.filter(round => date && round.notice.date <= date).at(-1);
  const decisions = [];
  const loose = [];
  for (const group of briefs) {
    if (rounds.some(round => round.notice === group) || referenceOnly(group)) continue;
    const round = roundAt(group.date);
    // An analysed decision is the result of the stage it closes, so its reasons are read with that stage.
    if (decisionStages.has(group.stage)) (round ? round.decisions : decisions).push(group);
    else if (round) round.responses.push(group);
    else loose.push(group);
  }
  // Docket entries without an analysed document still show what happened in the stage.
  const known = new Set(briefs.map(group => group.date + "|" + group.name));
  const seen = new Set();
  for (const event of [...report.events].sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    const date = calendarDay(event.date);
    const stage = prosecutionStage(event);
    const name = procedureName(event.title);
    const round = roundAt(date);
    // Several docket lines can record one decision (e.g. mailing and issuing a notice of allowance) on the same day.
    const key = date + "|" + (decisionStages.has(stage) ? stage : name);
    if (!round || !stage || opensStage(stage, name) || known.has(date + "|" + name) || seen.has(key)) continue;
    seen.add(key);
    (decisionStages.has(stage) ? round.results : round.docket).push({ date, name, stage, detail: event.detail });
  }
  return { rounds, decisions, loose };
}

function findingItem(row, groupName) {
  const item = el("div", "", "finding");
  if (row.procedure !== groupName || row.linked) item.append(el("strong", [row.date, row.procedure].filter(Boolean).join(" · "), "finding-procedure"));
  const detail = findingDetailNodes(row);
  item.append(...[detail.chip, el("p", row.text), detail.list].filter(Boolean));
  const scope = [claimScope(row.claims), row.issue].filter(Boolean).join(" · ");
  if (scope) item.append(el("small", scope, "finding-scope"));
  item.append(findingSource(row, true));
  if (row.linked && row.reference) {
    const quote = el("details", "", "reference-quote");
    quote.append(el("summary", "연결 근거"), el("q", row.reference));
    item.append(quote);
  }
  return item;
}

function findingColumn(role, title, rows, groupName, extra = [], overview = null) {
  const column = el("section", "", "claim-role " + role);
  column.append(el("h4", title));
  if (overview) column.append(overview);
  const general = rows.filter(row => !row.claims.length);
  // Short stages show every finding; longer ones lead with the stage-level findings and fold the rest.
  const primary = rows.length <= 5 ? rows : [...general, ...rows.filter(row => row.claims.length)].slice(0, 4);
  const more = el("details", "", "extra-findings");
  more.append(el("summary", "근거 " + (rows.length - primary.length) + "건 더 보기"));
  for (const row of rows) (primary.includes(row) ? column : more).append(findingItem(row, groupName));
  if (rows.length > primary.length) column.append(more);
  column.append(...extra);
  return column;
}

function summaryFinding(report, group) {
  const summary = report.summaries[group.summaryIndex];
  const item = el("div", "", "finding");
  item.append(el("strong", [group.date, group.name].filter(Boolean).join(" · "), "finding-procedure"), reportBody(summary.text),
    findingSource({ date: group.date, sourceTitle: summary.title, index: group.summaryIndex }, true));
  return item;
}

function docketFinding(entry) {
  const item = el("div", "", "finding docket-finding");
  item.append(el("strong", entry.date + " · " + entry.name, "finding-procedure"));
  if (entry.detail) item.append(el("p", entry.detail));
  item.append(el("small", "심사 이력 기록 · 원문 분석 전", "finding-scope"));
  return item;
}

function roundCard(report, round, index, next, selected) {
  const { notice } = round;
  const card = el("article", "", "procedure-brief stage-round");
  const head = el("header", "", "procedure-head");
  const identity = el("div");
  const [english, korean] = stageTitles[notice.stage] || ["", ""];
  identity.append(el("small", [index + 1 + "단계", notice.date].join(" · "), "stage-number"), el("h3", notice.name));
  const chip = english && english.toLowerCase() !== notice.name.toLowerCase() ? english + " · " + korean : korean;
  if (chip && chip !== notice.name) identity.append(el("span", chip, "stage-chip"));
  head.append(identity);
  card.append(head);
  const responseRows = round.responses.flatMap(group => group.rows);
  const decisionRows = round.decisions.flatMap(group => group.rows);
  const rows = [...notice.rows, ...responseRows];
  const claims = [...new Set([...rows, ...decisionRows].flatMap(row => row.claims))].sort((a, b) => a - b);
  // A docket line for a decision is dropped once the decision document itself was analysed.
  const docketResults = round.results.filter(entry => !round.decisions.some(group => group.date === entry.date && group.stage === entry.stage));
  const picker = el("select");
  picker.dataset.filterKey = "claim:" + notice.key;
  const all = el("option", "전체 청구항");
  all.value = "";
  picker.append(all, ...claims.map(claim => Object.assign(el("option", "청구항 " + claim), { value: claim })));
  picker.value = selected.get(picker.dataset.filterKey) || "";
  if (claims.length > 1) {
    const label = el("label", "검토 범위", "brief-filter");
    label.append(picker);
    head.append(label);
  }
  const issues = [...new Set(rows.map(row => row.issue).filter(Boolean))];
  const issuePicker = el("select");
  issuePicker.dataset.filterKey = "issue:" + notice.key;
  const allIssues = el("option", "전체 쟁점");
  allIssues.value = "";
  issuePicker.append(allIssues, ...issues.map(issue => el("option", issue)));
  issuePicker.value = selected.get(issuePicker.dataset.filterKey) || "";
  if (issues.length > 1) {
    const label = el("label", "쟁점", "brief-filter");
    label.append(issuePicker);
    head.append(label);
  }
  const grid = el("div", "", "round-grid");
  const result = el("footer", "", "round-result");
  const roleOf = row => row.role === "outcome" && noticeStages.has(row.sourceStage) ? "examiner" : row.role;
  // An answer linked to this notice counts, even when its document has no card of its own.
  const answered = rows.some(row => roleOf(row) === "applicant");
  function render() {
    const visible = list => list.filter(row => (!picker.value || row.claims.includes(Number(picker.value))) &&
      (!issuePicker.value || row.issue === issuePicker.value));
    const examiner = visible(rows.filter(row => roleOf(row) === "examiner"));
    const applicant = visible(rows.filter(row => roleOf(row) === "applicant"));
    const outcome = visible([...rows.filter(row => roleOf(row) === "outcome"), ...decisionRows]);
    const decisionSummaries = round.decisions.filter(group => group.summaryIndex !== undefined);
    const noticeExtra = notice.summaryIndex !== undefined ? [summaryFinding(report, notice)] : [];
    if (!examiner.length && !noticeExtra.length) noticeExtra.push(el("p", report.autoPending ? "통지 원문을 분석하고 있습니다." : "통지 기록은 확인됐습니다. 선택한 자료에서 통지 내용을 확인하지 못했습니다.", "muted"));
    // Docket entries stand in only when no analysed document covers that side of the stage.
    const analysed = round.responses.filter(group => group.summaryIndex !== undefined).map(group => summaryFinding(report, group));
    const responseExtra = analysed.length || answered ? analysed : round.docket.map(docketFinding);
    if (!applicant.length && !responseExtra.length) responseExtra.push(el("p", "이 통지에 대한 출원인 대응은 선택한 자료에서 확인되지 않았습니다.", "muted"));
    grid.replaceChildren(findingColumn("examiner", "심사관의 통지", examiner, notice.name, noticeExtra, stageOverview("examiner", examiner)),
      findingColumn("applicant", "출원인의 대응", applicant, notice.name, responseExtra, stageOverview("applicant", applicant)));
    result.replaceChildren(el("h4", "이 단계의 결과"));
    for (const row of outcome) result.append(findingItem(row, notice.name));
    for (const group of decisionSummaries) result.append(summaryFinding(report, group));
    if (!rows.some(row => roleOf(row) === "outcome")) for (const entry of docketResults) result.append(docketFinding(entry));
    if (!outcome.length && !decisionSummaries.length && !docketResults.length) {
      result.append(el("p", next ? "→ " + next.notice.date + " " + next.notice.name + " (" + (index + 2) + "단계)로 이어졌습니다." : "이 단계 이후의 결정은 선택한 자료에서 확인되지 않았습니다.", "muted"));
    }
  }
  picker.onchange = render;
  issuePicker.onchange = render;
  render();
  card.append(grid, result);
  return card;
}

function decisionCard(report, group) {
  const card = el("article", "", "procedure-brief stage-decision");
  const head = el("header", "", "procedure-head");
  const identity = el("div");
  identity.append(el("small", [group.date || "문서일 미확인", group.stage].filter(Boolean).join(" · "), "stage-number"), el("h3", group.name));
  head.append(identity);
  card.append(head);
  const extra = group.summaryIndex !== undefined ? [summaryFinding(report, group)] : [];
  if (!group.rows.length && !extra.length) extra.push(el("p", "결정 기록은 확인됐습니다. 선택한 자료에서 결정 내용을 확인하지 못했습니다.", "muted"));
  card.append(findingColumn(group.rows.some(row => row.role === "applicant") ? "applicant" : "outcome", group.rows.some(row => row.role === "applicant") ? "제출 내용" : "결정 내용", group.rows, group.name, extra));
  return card;
}

function renderAnalysis(report) {
  const briefs = proceedingBriefs(report);
  const procedures = by("process-analysis");
  const panel = by("claim-analysis");
  const selected = new Map([...procedures.querySelectorAll("select")].map(node => [node.dataset.filterKey, node.value]));
  procedures.replaceChildren(el("h2", "단계별 심사 흐름"));
  const flow = prosecutionRounds(report, briefs);
  if (flow.rounds.length) procedures.append(el("p", "심사관의 통지마다 출원인의 대응과 그 결과를 한 단계로 묶었습니다. 다음 통지 전까지 제출된 서류는 날짜 순서로 해당 단계에 넣었습니다.", "hint muted"));
  const steps = [...flow.rounds.map((round, index) => ({ date: round.notice.date, node: roundCard(report, round, index, flow.rounds[index + 1], selected) })),
    ...flow.decisions.map(group => ({ date: group.date, node: decisionCard(report, group) })),
    ...flow.loose.map(group => ({ date: group.date, node: decisionCard(report, group) }))];
  steps.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999")).forEach(step => procedures.append(step.node));
  panel.replaceChildren(el("h2", "청구항별 심사 비교"));
  const incomplete = report.summaries.filter(summary => summary.evidenceIncomplete);
  if (incomplete.length) panel.append(el("p", "청구항 근거 추출이 불완전한 문서 " + incomplete.length + "건 · " + incomplete.map(item => item.title).join(", "), "analysis-notice"));
  const comparison = claimComparison(briefs, report.reviewed);
  if (comparison.length) {
    if (comparison.some(row => !row.cells.outcome.length)) {
      panel.append(el("p", "최종 결과는 선택한 결정문에서 해당 청구항의 처분이 확인될 때 표시됩니다.", "hint muted"));
    }
    panel.append(comparisonTable(groupClaims(comparison)));
  } else panel.append(el("p", report.autoPending ? "선택한 원문을 검토하고 있습니다." : "선택한 자료에서 청구항별로 대조할 근거를 확인하지 못했습니다.", "muted"));
  const reference = briefs.filter(referenceOnly);
  if (reference.length) {
    const supporting = el("details", "", "record-fold supporting-documents");
    supporting.append(el("summary", "청구항 제출본·공보 등 참고 자료"));
    for (const group of reference) supporting.append(decisionCard(report, group));
    procedures.append(supporting);
  }
  if (!steps.length) procedures.append(el("p", report.autoPending ? "선택한 원문을 검토하고 있습니다." : "선택한 자료에서 주요 심사 절차의 의견·대응을 확인하지 못했습니다.", "muted"));
}

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
  if (/advisory action|권고\s*통지/i.test(title) && !/response to|reply to/i.test(title)) return "Advisory Action";
  if (/board.{0,22}decision|appeal decision|decision on appeal|심결/i.test(title)) return "Appeal · 불복 결정";
  if (/examiner.s answer|reply brief|appeal brief|pre[- ]?appeal/i.test(title)) return "Appeal · 불복 심리";
  if (/notice of appeal|심판청구|항고/i.test(title)) return "Appeal · 불복 청구";
  if (/request for continued examination|\bRCE\b|계속심사\s*청구/i.test(title)) return "RCE · 계속심사 청구";
  if (/examiner.s amendment|심사관.{0,2}보정/i.test(title)) return "심사관 보정";
  if (/interview summary|면담\s*기록/i.test(title)) return "면담 기록";
  if (/response to|reply to|applicant.{0,16}(argument|remark|response)|amendment|amended claims|election (?:with|without)|보정서?|의견서|답변서|반박|청구항 제출|포기서 제출/i.test(title)) return "출원인 대응·보정";
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
function proceedingBriefs(report) {
  const actions = new Map();
  const briefs = new Map();
  const actionStages = new Set(["비최종 거절", "최종 거절", "R/R · 제한요구", "심사관 검토"]);
  function isNotice(record) {
    return actionStages.has(prosecutionStage(record)) &&
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
    const doc = report.documents.find(item => item.id === summary.id);
    const ownKey = doc ? "doc:" + doc.id : "summary:" + index;
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
        target = named && isNotice({ title: named.name }) && (!targetDate || targetDate === named.date) &&
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
  const notices = new Set(["비최종 거절", "최종 거절", "R/R · 제한요구", "심사관 검토", "Advisory Action"]);
  for (const group of briefs) {
    for (const row of group.rows) {
      let role = row.role;
      if (role === "outcome") {
        // A notice may describe claims as allowable or rejected before a response.
        // Its disposition belongs with the examiner's opinion, even in older reports.
        if (notices.has(row.sourceStage)) role = "examiner";
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
    const laterReview = lastDecision && cells.examiner.some(row => notices.has(row.sourceStage) && row.date > lastDecision);
    cells.outcome = laterReview ? [] : cells.outcome.filter(row => row.date === lastDecision);
    return { number, cells };
  });
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
  for (const { number, cells } of rows) {
    const tr = body.insertRow();
    const claim = el("th", number + "항");
    claim.scope = "row";
    tr.append(claim);
    for (const [role, empty] of [["examiner", "의견 미확인"], ["applicant", "대응 미확인"], ["outcome", "최종 결과 미확인"]]) {
      const td = tr.insertCell();
      if (!cells[role].length) td.append(el("span", empty, "comparison-empty"));
      for (const row of cells[role]) {
        const item = el("div", "", "comparison-finding");
        item.append(el("p", row.text), findingSource(row, true));
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

function claimAnalysis(report, panel) {
  const selected = new Map([...panel.querySelectorAll("select")].map(node => [node.dataset.filterKey, node.value]));
  panel.replaceChildren(el("h2", "청구항별 심사 비교"));
  const incomplete = report.summaries.filter(summary => summary.evidenceIncomplete);
  if (incomplete.length) panel.append(el("p", "청구항 근거 추출이 불완전한 문서 " + incomplete.length + "건 · " + incomplete.map(item => item.title).join(", "), "analysis-notice"));
  const briefs = proceedingBriefs(report);
  if (!briefs.length) {
    panel.append(el("p", report.autoPending ? "선택한 원문을 검토하고 있습니다." : "선택한 자료에서 청구항별로 대조할 통지와 답변 근거를 확인하지 못했습니다.", "muted"));
    return;
  }
  const comparison = claimComparison(briefs, report.reviewed);
  if (comparison.length) {
    if (comparison.some(row => !row.cells.outcome.length)) {
      panel.append(el("p", "최종 결과는 선택한 결정문에서 해당 청구항의 처분이 확인될 때 표시됩니다.", "hint muted"));
    }
    panel.append(comparisonTable(comparison));
  }
  const procedures = el("details", "", "record-fold supporting-documents");
  procedures.append(el("summary", "절차별 쟁점과 대응"));
  procedures.open = !comparison.length;
  const supporting = el("details", "", "record-fold supporting-documents");
  supporting.append(el("summary", "청구항 제출본·공보 등 참고 자료"));
  for (const group of briefs) {
    const brief = el("article", "", "procedure-brief");
    const head = el("header", "", "procedure-head");
    const identity = el("div");
    identity.append(el("small", [group.date || "문서일 미확인", group.stage !== group.name && group.stage].filter(Boolean).join(" · ")),
      el("h3", group.name));
    const claims = [...new Set(group.rows.flatMap(row => row.claims))].sort((a, b) => a - b);
    head.append(identity);
    brief.append(head);
    const referenceOnly = !group.stage && !group.rows.some(row => row.linked) &&
      /^(?:claims|specification|drawings?|abstract|bibliographic data sheet|청구항 제출본|명세서|공보 청구항|공보 첫 면)(?:$|\s*[(·])/i.test(group.name);
    (referenceOnly ? supporting : procedures).append(brief);
    if (!group.rows.length) {
      brief.append(el("p", "통지 기록은 확인됐습니다. 선택한 원문에서 청구항별 판단을 확인할 수 없습니다.", "muted"));
      continue;
    }
    const picker = el("select");
    picker.dataset.filterKey = "claim:" + group.key;
    const all = el("option", "전체 청구항");
    all.value = "";
    picker.append(all);
    for (const claim of claims) {
      const option = el("option", "청구항 " + claim);
      option.value = claim;
      picker.append(option);
    }
    picker.value = selected.get(picker.dataset.filterKey) || "";
    const label = el("label", "검토 범위", "brief-filter");
    label.append(picker);
    head.append(label);
    const issues = [...new Set(group.rows.map(row => row.issue).filter(Boolean))];
    const issuePicker = el("select");
    if (issues.length > 1) {
      issuePicker.dataset.filterKey = "issue:" + group.key;
      const allIssues = el("option", "전체 쟁점");
      allIssues.value = "";
      issuePicker.append(allIssues);
      for (const issue of issues) issuePicker.append(el("option", issue));
      issuePicker.value = selected.get(issuePicker.dataset.filterKey) || "";
      const issueLabel = el("label", "쟁점", "brief-filter");
      issueLabel.append(issuePicker);
      head.append(issueLabel);
    }
    const grid = el("div", "", "claim-grid");
    function render() {
      grid.replaceChildren();
      const visible = group.rows.filter(row => (!picker.value || row.claims.includes(Number(picker.value))) &&
        (!issuePicker.value || row.issue === issuePicker.value));
      if (!visible.length) grid.append(el("p", "선택한 청구항과 쟁점에 해당하는 근거가 없습니다.", "muted"));
      for (const [role, name] of briefRoles) {
        const rows = visible.filter(row => row.role === role);
        if (!rows.length) continue;
        const column = el("article", "", "claim-role " + role);
        column.append(el("h4", name));
        const extra = el("details", "", "extra-findings");
        extra.append(el("summary", "근거 " + (rows.length - 2) + "건 더 보기"));
        for (const [index, row] of rows.entries()) {
          const item = el("div", "", "finding");
          if (row.procedure !== group.name || row.linked) item.append(el("strong", row.procedure, "finding-procedure"));
          item.append(el("small", [claimScope(row.claims), row.issue].filter(Boolean).join(" · ")),
            el("p", row.text));
          item.append(findingSource(row));
          if (row.linked && row.reference) item.append(el("small", "대응 근거 · “" + row.reference + "”", "reference-quote"));
          if (index < 2) column.append(item);
          else extra.append(item);
        }
        if (rows.length > 2) column.append(extra);
        grid.append(column);
      }
    }
    picker.onchange = render;
    issuePicker.onchange = render;
    render();
    brief.append(grid);
    if (!group.rows.some(row => row.linked) && group.rows.some(row => row.role === "applicant")) {
      brief.append(el("p", "이 제출서가 답한 통지는 선택한 자료에서 특정되지 않았습니다.", "brief-note"));
    } else if (group.rows.some(row => row.role === "examiner") && !group.rows.some(row => row.role === "applicant")) {
      brief.append(el("p", "이 판단에 대한 출원인 답변은 선택한 자료에서 확인되지 않았습니다.", "brief-note"));
    }
  }
  if (procedures.childElementCount > 1) panel.append(procedures);
  if (supporting.childElementCount > 1) panel.append(supporting);
}

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
      heading.append(el("h3", stage));
      if (subtitle) heading.append(el("span", subtitle));
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

function claimAnalysis(report, panel) {
  const opened = new Map([...panel.querySelectorAll("details")].map(node => [node.dataset.round, node.open]));
  const selected = new Map([...panel.querySelectorAll("select")].map(node => [node.dataset.round, node.value]));
  const groups = new Map();
  for (const record of [...report.events, ...report.documents]) {
    const date = calendarDay(record.date);
    const title = record.title || "";
    const stage = prosecutionStage(record);
    const isAction = ["비최종 거절", "최종 거절", "R/R · 제한요구"].includes(stage)
      || /거절\s*이유\s*통지|의견제출통지/.test(title);
    if (date && isAction && !groups.has(date)) groups.set(date, { date, datedRound: date, title, rows: [] });
  }
  for (const [i, summary] of report.summaries.entries()) {
    const doc = report.documents.find(item => item.id === summary.id);
    for (const entry of summary.evidence || []) {
      const datedRound = calendarDay(entry.roundDate);
      const key = datedRound || "doc-" + i;
      if (!groups.has(key)) groups.set(key, { date: datedRound || calendarDay(entry.documentDate) || calendarDay(doc?.date), datedRound, rows: [] });
      groups.get(key).rows.push({ ...entry, doc, summaryIndex: i, title: summary.title });
    }
  }
  panel.replaceChildren(el("h2", "심사 회차별 청구항 분석"));
  const incomplete = report.summaries.filter(summary => summary.evidenceIncomplete);
  if (incomplete.length) panel.append(el("p", "청구항 근거 추출이 불완전한 문서 " + incomplete.length + "건 · " + incomplete.map(summary => summary.title).join(", "), "analysis-notice"));
  if (!groups.size) {
    if (!incomplete.length) panel.append(el("p", report.autoPending ? "공개 원문에서 청구항별 판단과 대응을 확인하고 있습니다." : "청구항 번호와 판단 근거가 함께 확인된 문서가 없습니다.", "muted"));
    return;
  }
  const rounds = [...groups].sort(([, a], [, b]) => (a.date || "9999").localeCompare(b.date || "9999"));
  const initialRound = rounds.find(([, round]) => round.rows.length)?.[0] ?? rounds[0][0];
  let roundCount = 0;
  for (const [key, { date, datedRound, title, rows }] of rounds) {
    const claims = [...new Set(rows.flatMap(row => row.claims))].sort((a, b) => a - b);
    const block = el("details", "", "review-round");
    block.dataset.round = key;
    block.open = opened.get(key) ?? (key === initialRound);
    const heading = el("summary");
    heading.append(el("span", datedRound ? "심사 " + (++roundCount) + "회" : "회차 연결 미확인"), el("strong", date || rows[0].title), el("small", title || ""), el("small", claims.length ? "청구항 " + claims.length + "개" : "청구항 미확인"));
    if (!claims.length) {
      block.append(heading, el("p", "심사 통지 기록이 있습니다. 청구항별 판단과 대응을 확인할 원문 근거는 아직 없습니다.", "muted"));
      panel.append(block);
      continue;
    }
    const picker = el("select");
    picker.dataset.round = key;
    const label = el("label", "검토할 청구항", "claim-picker");
    for (const claim of claims) {
      const option = el("option", "제" + claim + "항");
      option.value = claim;
      picker.append(option);
    }
    if (claims.includes(Number(selected.get(key)))) picker.value = selected.get(key);
    label.append(picker);
    const grid = el("div", "", "claim-grid");
    function render() {
      grid.replaceChildren();
      for (const [role, title] of [["examiner", "심사관 의견"], ["applicant", "출원인 의견·보정"], ["outcome", "심사 결과"]]) {
        const column = el("article", "", "claim-role " + role);
        column.append(el("h3", title));
        const entries = rows.filter(row => row.role === role && row.claims.includes(Number(picker.value)));
        if (!entries.length) column.append(el("p", "이 항에 관한 원문 근거 미확인", "muted"));
        for (const row of entries) {
          const item = el("div", "", "finding");
          const scope = row.claims.length > 1 ? row.claims.length + "개 항 공통" : "개별 항";
          item.append(el("small", scope), el("p", row.text));
          const cite = [row.documentDate, row.title, row.locator].filter(Boolean).join(" · ");
          if (report.reviewed) {
            item.append(el("small", cite, "source-ref"), el("br"), link(report.espacenet));
          } else {
            const source = el("a", cite, "source-ref");
            source.href = "#summary-" + row.summaryIndex;
            source.onclick = () => { by("summaries").parentElement.open = true; };
            item.append(source);
          }
          column.append(item);
        }
        grid.append(column);
      }
    }
    picker.onchange = render;
    render();
    block.append(heading, label, grid);
    panel.append(block);
  }
}

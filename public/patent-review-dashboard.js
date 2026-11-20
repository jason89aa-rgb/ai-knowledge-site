"use strict";

// Use UTC calendar days so daylight saving and the reader's timezone cannot move an event.
function calendarDay(value) {
  const match = /^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:$|T)/.exec(String(value));
  if (!match) return null;
  const iso = match.slice(1).join("-");
  const time = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(iso) ? iso : null;
}

function reportMilestones(report) {
  const dates = new Map();
  function put(value, title, detail) {
    const date = calendarDay(value);
    if (!date || !title) return;
    if (!dates.has(date)) dates.set(date, new Map());
    dates.get(date).set(title, detail || dates.get(date).get(title) || "");
  }
  for (const row of report.events) put(row.date, row.title, row.detail);
  for (const [field, title] of [["filed", "출원"], ["published", "공개"], ["granted", "등록"]]) {
    if (!dates.has(calendarDay(report[field]))) put(report[field], title);
  }
  for (const doc of report.documents) put(doc.date, doc.title);
  return [...dates].sort(([a], [b]) => a.localeCompare(b));
}

function reportMetrics(report, milestones) {
  const strip = el("dl", "", "dossier-metrics");
  const first = calendarDay(report.filed);
  const last = calendarDay(report.granted);
  const duration = first && last && last >= first ? (Date.parse(last) - Date.parse(first)) / 86400000 : null;
  const metrics = [
    ["기관 표시 상태", report.status || "미확인"],
    duration === null ? ["날짜가 확인된 시점", milestones.length + "개"] : ["출원부터 등록까지", duration.toLocaleString("ko-KR") + "일"],
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
  section.append(el("h2", "심사 타임라인"));
  if (!dates.length) {
    section.append(el("p", "날짜가 확인된 심사 기록이 없습니다.", "muted"));
    return section;
  }
  const first = Date.parse(dates[0][0]);
  const span = Date.parse(dates.at(-1)[0]) - first;
  const chart = el("div", "", "date-chart");
  chart.setAttribute("aria-hidden", "true");
  const dots = dates.map(([date]) => {
    const dot = el("i");
    dot.style.left = (span ? (Date.parse(date) - first) * 100 / span : 50) + "%";
    chart.append(dot);
    return dot;
  });
  const bounds = el("div", "", "chart-bounds");
  bounds.append(el("span", dates[0][0]), el("span", dates.length > 1 ? dates.at(-1)[0] : ""));
  const stops = el("div", "", "time-stops");
  const office = dates.findIndex(([, records]) => [...records.keys()].some(title => /거절|office action|examination report|의견제출|拒絶/i.test(title)));
  const anchors = [...new Set([0, office > 0 ? office : Math.floor((dates.length - 1) / 2), dates.length - 1])];
  for (const index of anchors) {
    const [date, records] = dates[index];
    const stop = button("", () => pick(index), "time-stop");
    stop.append(el("small", date), el("strong", records.keys().next().value));
    stops.append(stop);
  }
  const controls = el("div", "", "time-controls");
  const select = el("select");
  select.setAttribute("aria-label", "심사 시점 선택");
  dates.forEach(([date, records], i) => {
    const option = el("option", date + " · " + records.keys().next().value);
    option.value = i;
    select.append(option);
  });
  const list = el("ul", "", "time-records");
  list.setAttribute("aria-live", "polite");
  function pick(index) {
    select.selectedIndex = index;
    dots.forEach((dot, i) => dot.classList.toggle("selected", i === index));
    list.replaceChildren();
    for (const [title, detail] of dates[index][1]) {
      const item = el("li");
      item.append(el("strong", title));
      if (detail && detail !== title) item.append(el("span", detail));
      list.append(item);
    }
    prev.disabled = index === 0;
    next.disabled = index === dates.length - 1;
  }
  const prev = button("이전", () => pick(select.selectedIndex - 1));
  const next = button("다음", () => pick(select.selectedIndex + 1));
  select.onchange = () => pick(select.selectedIndex);
  chart.onclick = event => {
    const box = chart.getBoundingClientRect();
    const target = first + (event.clientX - box.left) / Math.max(1, box.width) * span;
    const index = dates.reduce((best, [date], i) => Math.abs(Date.parse(date) - target) < Math.abs(Date.parse(dates[best][0]) - target) ? i : best, 0);
    pick(index);
  };
  controls.append(select, prev, next);
  section.append(stops, chart, bounds, controls, list);
  pick(0);
  return section;
}

function claimAnalysis(report, panel) {
  const opened = new Map([...panel.querySelectorAll("details")].map(node => [node.dataset.round, node.open]));
  const selected = new Map([...panel.querySelectorAll("select")].map(node => [node.dataset.round, node.value]));
  const groups = new Map();
  for (const record of [...report.events, ...report.documents]) {
    const date = calendarDay(record.date);
    const title = record.title || "";
    const isAction = /^(?:CTNF|CTFR)$/.test(record.code || record.id || "")
      || /^(?:(?:non[- ]?final|final) (?:office |examiner.s )?action|(?:비최종 |최종 )?거절이유\s*통지(?:서)?$|의견제출통지서$)/i.test(title);
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
  let roundCount = 0;
  for (const [key, { date, datedRound, title, rows }] of rounds) {
    const claims = [...new Set(rows.flatMap(row => row.claims))].sort((a, b) => a - b);
    const block = el("details", "", "review-round");
    block.dataset.round = key;
    block.open = opened.get(key) ?? panel.querySelector("details") === null;
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

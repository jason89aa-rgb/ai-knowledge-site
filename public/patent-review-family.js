"use strict";

// Family analysis: the filing tree, members by country with representative claims, and how each claim compares with the reviewed patent.
const familyDetailLimit = 12;
const verdictTones = { "동일": "same", "더 넓음": "broader", "더 좁음": "narrower", "일부 겹침": "overlap", "다른 발명": "different" };

function familyLabel(member) {
  const number = member.country === "US" && /^\d{7,8}$/.test(member.number) ? Number(member.number).toLocaleString("en-US") : member.number;
  return [String(number).startsWith(member.country) ? "" : member.country, number, member.kind].filter(Boolean).join(" ");
}

const familyId = member => [member.country, member.number, member.kind].filter(Boolean).join(":");
const filingKey = (country, application) => application ? country + ":" + String(application).replace(/[^0-9A-Z]/gi, "").toUpperCase() : "";
const byFiled = (a, b) => (a.filed || a.member?.date || "9999").localeCompare(b.filed || b.member?.date || "9999");
const sameDocument = (a, b) => Boolean(a && b && a.country === b.country &&
  String(a.number).replace(/[^0-9A-Z]/gi, "") === String(b.number).replace(/[^0-9A-Z]/gi, ""));

function relationName(type) {
  const value = String(type || "");
  if (/in.?part|\bCIP\b/i.test(value)) return "CIP · 부분계속출원";
  if (/division|\bDA\b/i.test(value)) return "DA · 분할출원";
  if (/continuation|\bCA\b/i.test(value)) return "CA · 계속출원";
  if (/reissue/i.test(value)) return "재발행";
  return value || "관련 출원";
}

// Each filing hangs under the nearest filing it descends from: a US parent, the original application,
// the PCT application it entered from, then the earliest priority claim.
function familyGraph(state) {
  const nodes = new Map();
  const add = (key, data) => {
    if (!nodes.has(key)) nodes.set(key, { key, children: [], docs: [], ...data });
    return nodes.get(key);
  };
  for (const member of state.members) {
    const node = add(filingKey(member.country, member.detail?.application) || "doc:" + familyId(member), { member, filed: member.detail?.filed });
    node.docs.push(member);
  }
  const attach = (node, parent, edge) => {
    for (let up = parent; up; up = up.parent) if (up === node) return false;
    node.parent = parent;
    node.edge = edge;
    parent.children.push(node);
    return true;
  };
  const outside = (country, row, label) => add(filingKey(country, row.application), { label, filed: row.filed, outside: true });
  for (const node of [...nodes.values()]) {
    const detail = node.member?.detail;
    if (!detail) continue;
    const country = node.member.country;
    const parents = [...detail.parents || []].filter(row => row.application).sort((a, b) => {
      const inside = row => Number(nodes.has(filingKey(row.country || country, row.application)));
      return inside(b) - inside(a) || (b.filed || "").localeCompare(a.filed || "");
    });
    const parent = parents[0];
    if (parent && attach(node, outside(parent.country || country, parent, `${parent.country || country} ${parent.application}`), relationName(parent.type))) continue;
    const original = detail.original?.[0];
    if (original && attach(node, outside(original.country || country, original, `${original.country || country} ${original.application} · 원출원`), "원출원에서 분할·변경")) continue;
    if (detail.pct?.application && attach(node, outside("WO", detail.pct, ["PCT", detail.pct.application, detail.pct.publication].filter(Boolean).join(" · ")), "PCT 국내단계")) continue;
    const provisional = detail.provisionals?.[0];
    if (provisional && attach(node, outside(provisional.country || country, provisional, `${provisional.country || country} 가출원 ${provisional.application}`), "가출원 기초")) continue;
    const priority = [...detail.priorities || []].filter(row => row.application && (country !== "US" || row.country !== "US"))
      .sort((a, b) => (a.filed || "").localeCompare(b.filed || ""))[0];
    if (priority) attach(node, outside(priority.country, priority, `${priority.country} ${priority.application} · 우선권 출원`), priority.country === country ? "국내우선권" : "우선권 주장");
  }
  return nodes;
}

function treeItem(node) {
  const item = el("li");
  if (node.edge) item.append(el("span", node.edge, "family-edge"));
  const box = el("div", "", "family-node" + (node.member?.subject ? " is-subject" : "") + (node.member ? "" : " is-outside"));
  const labels = node.member ? [...new Set(node.docs.map(familyLabel))].join(" / ") : node.label;
  box.append(el("strong", labels));
  const application = node.member?.detail?.application;
  box.append(el("small", [application && "출원 " + application, node.filed].filter(Boolean).join(" · ") || "출원 정보 미확인"));
  if (node.member?.subject) box.append(el("em", "조사 대상"));
  else if (!node.member) box.append(el("em", "패밀리 목록 밖 기초 출원"));
  item.append(box);
  if (node.children.length) {
    const children = el("ul");
    for (const child of node.children.sort(byFiled)) children.append(treeItem(child));
    item.append(children);
  }
  return item;
}

function familyTreeView(state, nodes) {
  const wrap = el("div", "", "family-tree-wrap");
  const roots = [...nodes.values()].filter(node => !node.parent && (!node.member || node.member.detail));
  if (!roots.length) {
    wrap.append(el("p", state.status === "loading" ? "출원 관계를 조회하고 있습니다." : "출원 관계를 확인할 수 있는 문헌이 없습니다.", "muted"));
    return wrap;
  }
  const tree = el("ul", "", "family-tree");
  tree.setAttribute("aria-label", "패밀리 출원 관계도");
  for (const root of roots.sort(byFiled)) tree.append(treeItem(root));
  wrap.append(tree);
  const skipped = state.members.filter(member => !member.detail).length;
  wrap.append(el("p", "CA 계속출원 · DA 분할출원 · CIP 부분계속출원 · PCT 국내단계 · 우선권 주장" +
    (skipped && state.status !== "loading" ? ` · 관계를 조회하지 않은 문헌 ${skipped}건은 아래 표에만 표시합니다.` : ""), "hint muted"));
  return wrap;
}

function claimCell(member) {
  const detail = member.detail;
  if (!detail?.claim) {
    return el("span", member.error ? "조회 실패 · " + member.error : detail?.notes?.includes("대표청구항 조회 실패") ? "대표청구항 조회 실패" : detail ? "대표청구항 미제공" :
      current?.familyAnalysis?.status === "loading" ? "조회 중" : `상세 조회 생략 (상위 ${familyDetailLimit}건만 조회)`, "comparison-empty");
  }
  const box = el("div", "", "family-claim");
  const lines = detail.claim.split("\n");
  const translated = detail.claimLanguage && detail.claimLanguage !== member.country && !(member.country === "WO" || member.country === "EP");
  const flat = lines.join(" ");
  box.append(el("p", flat.length > 220 ? flat.slice(0, 220) + "…" : flat));
  const more = el("details");
  more.append(el("summary", "전체 대표청구항" + (translated ? " · " + (detail.claimLanguage === "KR" ? "국문 번역" : "영문") : "")));
  for (const line of lines) more.append(el("p", line));
  box.append(more);
  return box;
}

function comparisonCell(state, member) {
  if (member.subject) return el("span", "비교 기준", "family-verdict verdict-subject");
  const row = state.comparisons?.[familyId(member)];
  if (!row) {
    const reason = !member.detail?.claim ? "청구항이 없어 비교하지 않음" : state.compareError || (state.status === "loading" ? "비교 중" : "비교 결과 없음");
    return el("span", reason, "comparison-empty");
  }
  const box = el("div", "", "family-compare");
  box.append(el("span", row.verdict, "family-verdict verdict-" + (verdictTones[row.verdict] || "overlap")), el("p", row.summary));
  for (const [items, label] of [[row.onlyMember, "이 문헌에만"], [row.onlySubject, "조사 대상에만"]]) {
    if (!items?.length) continue;
    const line = el("p", "", "family-diff");
    line.append(el("strong", label + " "), items.join(" · "));
    box.append(line);
  }
  return box;
}

function familyTableView(state, nodes) {
  const groups = new Map();
  for (const member of state.members) {
    if (!groups.has(member.country)) groups.set(member.country, []);
    groups.get(member.country).push(member);
  }
  const home = state.members.find(member => member.subject)?.country;
  const countries = [...groups.keys()].sort((a, b) => Number(b === home) - Number(a === home) ||
    groups.get(b).length - groups.get(a).length || a.localeCompare(b));
  const nodeOf = member => [...nodes.values()].find(node => node.docs.includes(member));
  const wrap = el("div", "", "table-wrap family-table");
  wrap.tabIndex = 0;
  wrap.setAttribute("role", "region");
  wrap.setAttribute("aria-label", "국가별 패밀리와 대표청구항 비교");
  const grid = el("table");
  const head = grid.createTHead().insertRow();
  for (const title of ["문헌", "출원", "관계", "대표청구항", "조사 대상 대비"]) {
    const th = el("th", title);
    th.scope = "col";
    head.append(th);
  }
  for (const country of countries) {
    const body = grid.createTBody();
    const caption = body.insertRow();
    caption.className = "family-country";
    const th = el("th", `${country} · ${groups.get(country).length}건`);
    th.colSpan = 5;
    th.scope = "colgroup";
    caption.append(th);
    const members = groups.get(country).sort((a, b) => byFiled({ filed: a.detail?.filed, member: a }, { filed: b.detail?.filed, member: b }));
    for (const member of members) {
      const tr = body.insertRow();
      if (member.subject) tr.className = "is-subject";
      const node = nodeOf(member);
      const parent = node?.parent;
      const doc = el("div");
      const stage = /^[BC]/.test(member.kind || "") ? "등록" : /^A/.test(member.kind || "") ? "공개" : "";
      doc.append(el("strong", familyLabel(member)), el("small", [stage, member.date && "발행 " + member.date, member.title].filter(Boolean).join(" · ")));
      const relation = member.subject ? "조사 대상" : node?.edge ? node.edge + " ← " + (parent.member ? familyLabel(parent.member) : parent.label) :
        !member.detail ? "관계 미조회" : member.country === "WO" ? "PCT 국제출원" : node?.children.length ? "기초 출원" : "WIPS 확장 패밀리";
      const filing = el("div");
      filing.append(el("span", member.detail?.application || "—"), el("small", member.detail?.filed ? "출원일 " + member.detail.filed : ""));
      const cells = [[doc, "문헌"], [filing, "출원"],
        [relation, "관계"], [claimCell(member), "대표청구항"], [comparisonCell(state, member), "조사 대상 대비"]];
      for (const [value, label] of cells) {
        const td = tr.insertCell();
        td.dataset.label = label;
        if (value instanceof Node) td.append(value);
        else td.textContent = value;
      }
    }
  }
  wrap.append(grid);
  return wrap;
}

// Reports from the official APIs keep the plain family list when WINTELIPS is unavailable.
function basicFamilyTable(report) {
  const groups = [...new Set(report.family.map(row => row.country))];
  return table(["관할", "공개·등록번호", "출원번호", "조회 관계", "일자"],
    groups.flatMap(country => report.family.filter(row => row.country === country))
      .map(row => [row.country, familyCell(row), row.application, row.relation, row.date]),
    "표시할 패밀리 자료가 없습니다.");
}

// Later filings that descend from the reviewed patent: while one is pending, the owner can still draft new claims on the same disclosure.
function familyFollowerList(state) {
  const subject = state?.members?.find(member => member.subject);
  const own = subject?.detail?.application && filingKey(subject.country, subject.detail.application);
  if (!own) return [];
  const known = new Map();
  for (const member of state.members) {
    if (member.subject || !member.detail?.application) continue;
    if ((member.detail.parents || []).some(row => filingKey(row.country || member.country, row.application) === own)) {
      known.set(filingKey(member.country, member.detail.application), familyLabel(member) + (/^[BC]/.test(member.kind || "") ? " (등록)" : " (공개 · 등록 전)"));
    }
  }
  for (const child of subject.detail.children || []) {
    const key = filingKey(child.country || subject.country, child.application);
    if (key && !known.has(key)) known.set(key, `${child.country || subject.country} ${child.application} (패밀리 목록에 문헌 없음 · 심사 중이거나 미공개일 수 있음)`);
  }
  return [...known.values()];
}

function familyFollowers(state) {
  const followers = familyFollowerList(state);
  if (!followers.length) return null;
  const note = el("p", "", "family-followers");
  note.append(el("strong", `조사 대상에서 나온 후속 출원 ${followers.length}건 `), followers.join(" · "));
  return note;
}

function familySection(report) {
  const section = el("section", "", "panel family-panel");
  section.id = "report-family";
  section.append(el("h2", "7 · 패밀리와 병행 심사"));
  const live = !report.reviewed && !report.demo && !report.local && !report.linksOnly;
  if (!report.familyAnalysis && live && isAutomaticMode()) void loadFamily(report);
  const state = report.familyAnalysis;
  if (!state || state.status === "error") {
    if (state?.error) section.append(el("p", "WINTELIPS 패밀리 분석을 불러오지 못했습니다 · " + state.error, "analysis-notice"));
    section.append(basicFamilyTable(report));
    return section;
  }
  const status = el("p", state.status === "loading" ? state.progress : "", "family-status");
  status.setAttribute("role", "status");
  if (state.status === "loading") section.append(status);
  const countries = new Set(state.members.map(member => member.country));
  const verdicts = Object.values(state.comparisons || {}).reduce((counts, row) => counts.set(row.verdict, (counts.get(row.verdict) || 0) + 1), new Map());
  const overview = [`${countries.size}개국 · ${state.total || state.members.length}건`,
    ...[...verdicts].map(([verdict, count]) => `${verdict} ${count}건`)].join(" · ");
  section.append(el("p", overview, "family-overview"));
  if (state.source) section.append(el("p", state.source, "hint muted"));
  const followers = familyFollowers(state);
  if (followers) section.append(followers);
  const nodes = familyGraph(state);
  section.append(el("h3", "출원 관계도"), familyTreeView(state, nodes));
  section.append(el("h3", "국가별 패밀리와 대표청구항 비교"), familyTableView(state, nodes));
  if (state.total > state.members.length) section.append(el("p", `WINTELIPS 패밀리 ${state.total}건 중 ${state.members.length}건을 표시했습니다.`, "hint muted"));
  return section;
}

function refreshFamily(report) {
  if (current !== report) return;
  by("report-family")?.replaceWith(familySection(report));
}

async function loadFamily(report) {
  const state = report.familyAnalysis = { status: "loading", progress: "WINTELIPS에서 패밀리 목록을 조회하고 있습니다.", members: [], comparisons: {} };
  const update = progress => {
    state.progress = progress;
    refreshFamily(report);
  };
  try {
    const list = await (await api({ action: "family", skey: report.skey, country: report.country,
      number: report.grant || report.publication || report.application || report.query })).json();
    state.total = list.total;
    state.members = list.members.map(member => ({ ...member, subject: sameDocument(member, list.subject) }));
    if (list.subject && !state.members.some(member => member.subject)) state.members.unshift({ ...list.subject, subject: true });
    state.source = "WINTELIPS · " + new Date().toISOString().slice(0, 10) + " 조회 · 대표청구항은 WINTELIPS 제공 문안이며, 비교는 Claude가 청구항 문언만 대조한 결과입니다.";
    const picked = [...state.members].sort((a, b) => Number(b.subject) - Number(a.subject) ||
      Number(b.country === report.country) - Number(a.country === report.country) ||
      Number(/^[BCT]/.test(b.kind || "")) - Number(/^[BCT]/.test(a.kind || "")) || (b.date || "").localeCompare(a.date || "")).slice(0, familyDetailLimit);
    let done = 0;
    update(`대표청구항과 출원 관계를 조회하고 있습니다. 0/${picked.length}`);
    const queue = [...picked];
    await Promise.all(Array.from({ length: 3 }, async () => {
      for (let member = queue.shift(); member; member = queue.shift()) {
        try {
          member.detail = await (await api({ action: "family-member", country: member.country, number: member.number, kind: member.kind })).json();
        } catch (error) {
          member.error = error.message;
        }
        update(`대표청구항과 출원 관계를 조회하고 있습니다. ${++done}/${picked.length}`);
      }
    }));
    const subject = state.members.find(member => member.subject);
    const others = picked.filter(member => !member.subject && member.detail?.claim);
    if (!subject?.detail?.claim) state.compareError = "조사 대상의 대표청구항을 받지 못해 비교하지 않았습니다.";
    else if (others.length) {
      update("조사 대상의 대표청구항과 패밀리 청구항을 비교하고 있습니다.");
      try {
        const result = await readSummary(await api({ action: "family-compare", subject: { label: familyLabel(subject), claim: subject.detail.claim },
          members: others.map(member => ({ id: familyId(member), label: familyLabel(member), claim: member.detail.claim })) }));
        for (const row of result.comparisons) state.comparisons[row.id] = row;
      } catch (error) {
        state.compareError = "청구항 비교 실패 · " + error.message;
      }
    }
    state.status = "done";
  } catch (error) {
    state.status = "error";
    state.error = error.message;
  }
  refreshFamily(report);
  // The frame of the case and the family citation check read the finished family.
  if (current === report) renderRecord(report);
}

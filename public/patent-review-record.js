"use strict";

// The report follows the order in which a practitioner reads a prosecution history. This file renders the steps that the
// stage flow and the family analysis do not cover: the frame of the case, the granted claims against the claims as filed,
// why they were allowed, what the applicant gave up, the art on record, the term, and what followed the grant.

const recordLoads = new WeakMap();
const claimDiffs = new WeakMap();
const recordLive = report => !report.reviewed && !report.demo && !report.local && !report.linksOnly && report.country !== "UPC";

// The WINTELIPS record of the case is fetched once per report and kept on it.
function loadCaseRecord(report) {
  if (recordLoads.has(report)) return recordLoads.get(report);
  if (report.caseRecord || !recordLive(report) || !isAutomaticMode()) return Promise.resolve();
  const state = report.caseRecord = { status: "loading" };
  const load = (async () => {
    try {
      state.data = await (await api({ action: "case-record", skey: report.skey, country: report.country,
        number: report.grant || report.publication || report.application || report.query })).json();
      state.status = "done";
    } catch (error) {
      state.status = "error";
      state.error = error.message;
    }
    if (current === report) (by("claim-analysis") ? renderAnalysis : renderRecord)(report);
  })();
  recordLoads.set(report, load);
  return load;
}

// Words are compared without regard to spacing or case. Chinese and Japanese text has no spaces, so it is compared by character.
const wordPattern = /\s+|[぀-ヿ㐀-鿿]|(?:(?![぀-ヿ㐀-鿿])[\p{L}\p{N}])+|\S/gu;

function claimWords(text) {
  const words = [];
  let gap = "";
  for (const token of String(text).match(wordPattern) || []) {
    if (/^\s+$/.test(token)) gap = token.includes("\n") ? "\n" : " ";
    else {
      words.push({ text: token, key: token.toLowerCase(), gap: words.length ? gap : "" });
      gap = "";
    }
  }
  return words;
}

// Longest common subsequence of the two wordings; what is left over on either side was added or removed.
function diffWords(before, after) {
  const a = claimWords(before);
  const b = claimWords(after);
  let start = 0;
  while (start < a.length && start < b.length && a[start].key === b[start].key) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1].key === b[endB - 1].key) { endA--; endB--; }
  const n = endA - start;
  const m = endB - start;
  if (n * m > 4000000) return null;
  const table = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i][j] = a[start + i].key === b[start + j].key ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const parts = b.slice(0, start).map(word => ({ ...word, type: "same" }));
  let i = 0;
  let j = 0;
  while (i < n || j < m) {
    if (i < n && j < m && a[start + i].key === b[start + j].key) { parts.push({ ...b[start + j], type: "same" }); i++; j++; }
    else if (j < m && (i === n || table[i][j + 1] >= table[i + 1][j])) parts.push({ ...b[start + j++], type: "added" });
    else parts.push({ ...a[start + i++], type: "removed" });
  }
  parts.push(...b.slice(endB).map(word => ({ ...word, type: "same" })));
  const runs = [];
  for (const part of parts) {
    if (runs.at(-1)?.type === part.type) runs.at(-1).words.push(part);
    else runs.push({ type: part.type, words: [part] });
  }
  return runs;
}

const runText = run => run.words.map((word, index) => (index ? word.gap : "") + word.text).join("");

// Claims are renumbered at grant, so each granted claim is paired with the published claim it shares the most wording with.
// The closest pairs are fixed first and each published claim is used once; a granted claim that resembles none stays unpaired.
function comparedClaims(claims) {
  if (claimDiffs.has(claims)) return claimDiffs.get(claims);
  const granted = claims.granted?.claims || [];
  const original = claims.original?.claims || [];
  const comparable = Boolean(granted.length && original.length && claims.granted.language === claims.original.language);
  const wording = claim => new Set(claimWords(claim.text).map(word => word.key).filter(key => /[\p{L}\p{N}]/u.test(key)));
  const pairs = [];
  if (comparable) {
    const before = original.map(wording);
    granted.map(wording).forEach((keys, g) => before.forEach((set, o) => {
      let shared = 0;
      for (const key of keys) if (set.has(key)) shared++;
      pairs.push({ g, o, score: shared / (keys.size + set.size - shared || 1) });
    }));
  }
  const match = new Map();
  const used = new Set();
  for (const pair of pairs.sort((a, b) => b.score - a.score || Math.abs(a.g - a.o) - Math.abs(b.g - b.o))) {
    if (pair.score < 0.45 || match.has(pair.g) || used.has(pair.o)) continue;
    match.set(pair.g, pair.o);
    used.add(pair.o);
  }
  const rows = granted.map((claim, index) => {
    if (!match.has(index)) return { claim };
    const source = original[match.get(index)];
    const runs = diffWords(source.text, claim.text);
    const phrases = type => (runs || []).filter(run => run.type === type).map(runText).filter(text => /[\p{L}\p{N}]/u.test(text));
    return { claim, source, runs, added: phrases("added"), removed: phrases("removed") };
  });
  const result = { rows, comparable, dropped: comparable ? original.filter((_, index) => !used.has(index)) : [] };
  claimDiffs.set(claims, result);
  return result;
}

const claimChange = row => !row.source ? "대응하는 공개 청구항 없음" : !row.runs ? "문언이 길어 대조 생략"
  : !row.added.length && !row.removed.length ? "출원 당시 문언 그대로 등록" : [row.added.length && `추가 ${row.added.length}곳`, row.removed.length && `삭제 ${row.removed.length}곳`].filter(Boolean).join(" · ");

// The amendments that introduced a phrase, found by shared wording with the amended language the applicant quoted.
function amendmentsFor(phrase, rows) {
  const keys = new Set(claimWords(phrase).map(word => word.key).filter(key => key.length > 2));
  if (keys.size < 2) return [];
  return rows.filter(row => {
    if (row.role !== "applicant" || !["amend", "add"].includes(row.responseType) || !row.element) return false;
    const words = [...new Set(claimWords(row.element).map(word => word.key).filter(key => key.length > 2))];
    return words.length > 1 && words.filter(key => keys.has(key)).length / Math.min(words.length, keys.size) >= 0.6;
  });
}

function recordPanel(id, title, hint) {
  const panel = by(id);
  if (!panel) return null;
  panel.hidden = false;
  panel.replaceChildren(el("h2", title));
  if (hint) panel.append(el("p", hint, "hint muted"));
  return panel;
}

// Returns the loaded record, or explains in the panel why there is none yet.
function recordData(panel, report, what) {
  const state = report.caseRecord;
  if (state?.status === "done") return state.data;
  const text = !state ? `자동 조회 모드에서만 WINTELIPS로 ${what} 조회합니다.` : state.status === "loading" ? `WINTELIPS에서 ${what} 조회하고 있습니다.`
    : `WINTELIPS에서 ${what} 불러오지 못했습니다 · ${state.error}`;
  panel.append(el("p", text, state?.status === "error" ? "analysis-notice" : "muted"));
  return null;
}

function claimText(text) {
  const body = el("div", "", "claim-text");
  for (const line of String(text).split("\n")) body.append(el("p", line));
  return body;
}

function familyPosition(report) {
  const state = report.familyAnalysis;
  const subject = state?.members?.find(member => member.subject);
  const detail = subject?.detail;
  if (!detail) return { text: report.family?.length ? `패밀리 ${report.family.length}건` : "", note: state?.status === "loading" ? "출원 관계 조회 중" : "" };
  const parent = [...detail.parents || []].filter(row => row.application).sort((a, b) => (b.filed || "").localeCompare(a.filed || ""))[0];
  const origin = parent ? `${parent.country || subject.country} ${parent.application}의 ${relationName(parent.type)}`
    : detail.original?.[0] ? `${detail.original[0].application}의 분할·변경출원` : detail.pct?.application ? `${detail.pct.application}의 국내단계`
      : detail.priorities?.[0]?.application ? `${detail.priorities[0].country || ""} ${detail.priorities[0].application} 우선권 주장 출원`.trim() : "모출원·우선권 기록 없음";
  const followers = familyFollowerList(state);
  const bases = [...detail.parents || [], ...detail.provisionals || [], ...detail.priorities || [], ...detail.original || [], detail.pct,
    { country: subject.country, application: detail.application, filed: detail.filed }].filter(row => row?.filed).sort((a, b) => a.filed.localeCompare(b.filed));
  return {
    text: origin + (followers.length ? ` · 후속 출원 ${followers.length}건` : ""),
    note: followers.join(" · "),
    earliest: bases[0]?.filed, earliestSource: bases[0] && [bases[0].country, bases[0].application].filter(Boolean).join(" "),
  };
}

function fillFrame(report) {
  const panel = recordPanel("case-frame", "1 · 사건의 틀", "어떤 문헌이 선행기술이 되는지와 권리가 살아 있는지를 정하는 기본 사실입니다.");
  if (!panel) return;
  const state = report.caseRecord;
  const data = state?.status === "done" ? state.data : undefined;
  const facts = el("dl", "", "frame-facts");
  const add = (label, value, note) => {
    if (!value) return;
    const cell = el("div");
    cell.append(el("dt", label), el("dd", value));
    if (note) cell.append(el("small", note));
    facts.append(cell);
  };
  const docket = doc => doc ? [doc.number, doc.kind].filter(Boolean).join(" ") : "";
  const position = familyPosition(report);
  add("출원", [report.application || data?.subject.application, report.filed || data?.subject.filed].filter(Boolean).join(" · "));
  add("공개", [report.publication || docket(data?.subject.published), report.published || data?.subject.published?.date].filter(Boolean).join(" · "));
  add("등록", [report.grant || docket(data?.subject.granted), report.granted || data?.subject.granted?.date].filter(Boolean).join(" · ") || "등록 문헌 미확인");
  add("가장 이른 기초 출원일", position.earliest, position.earliest && position.earliestSource + " · 패밀리 기록 기준이며 우선권의 유효성은 따로 확인");
  add("패밀리 내 위치", position.text, position.note);
  add("현재 상태", report.status || data?.subject.status, "기관·DB 표시 기준");
  add("권리자", data?.term.owners?.join(", ") || report.applicants, data?.term.owners?.length ? "WINTELIPS 현재 권리자" : "출원인 기준");
  add("예상 만료일", data?.term.expiry, "WINTELIPS 산정 · 연차료 납부 전제");
  panel.append(facts);
  if (state?.status === "loading") panel.append(el("p", "WINTELIPS에서 권리 기록을 조회하고 있습니다.", "muted"));
  const problem = state?.status === "error" ? "WINTELIPS 권리 기록을 불러오지 못했습니다 · " + state.error : data?.notes?.length ? "일부 WINTELIPS 조회 실패 · " + data.notes.join(", ") : "";
  if (problem) {
    const notice = el("p", problem + " ", "analysis-notice");
    if (recordLive(report)) notice.append(button("다시 조회", () => {
      recordLoads.delete(report);
      report.caseRecord = undefined;
      renderRecord(report);
    }));
    panel.append(notice);
  }
  if (data) panel.append(el("p", `WINTELIPS · ${data.retrieved} 조회`, "hint muted"));
}

function fillClaims(report, rows) {
  const slot = by("claim-evolution");
  if (!slot) return;
  if (!report.caseRecord && !recordLive(report)) { slot.hidden = true; return; }
  const panel = recordPanel("claim-evolution", "2 · 등록 청구항과 출원 당시 청구항",
    "청구항을 구성요소별로 줄을 나누고, 출원 공개 당시 문언과 달라진 곳을 표시했습니다. 밑줄은 등록 과정에서 추가된 문언, 취소선은 삭제된 문언입니다.");
  const data = recordData(panel, report, "청구항을");
  if (!data) return;
  const { granted, original, scope } = data.claims;
  const kind = scope === "independent" ? "독립항" : "대표청구항";
  if (!granted && !original) {
    panel.append(el("p", "WINTELIPS가 이 문헌의 청구항 문언을 제공하지 않았습니다.", "muted"));
    return;
  }
  const versions = [granted && `등록 ${granted.label}${granted.date ? ` (${granted.date})` : ""}`, original && `공개 ${original.label}${original.date ? ` (${original.date})` : ""}`];
  panel.append(el("p", versions.filter(Boolean).join(" ↔ ") + ` · ${kind} · WINTELIPS ${data.retrieved} 조회`, "family-overview"));
  const compared = comparedClaims(data.claims);
  if (!granted) panel.append(el("p", "등록 문헌이 없어 공개 청구항만 표시합니다.", "analysis-notice"));
  else if (!original) panel.append(el("p", "공개 문헌이 없어 출원 당시 문언과 대조하지 못했습니다. 문언이 바뀐 경위는 4단계의 보정 기록에서 확인하세요.", "analysis-notice"));
  else if (!compared.comparable) panel.append(el("p", "등록 문언과 공개 문언의 언어가 달라 대조하지 않았습니다.", "analysis-notice"));
  const list = granted ? compared.rows : original.claims.map(claim => ({ claim }));
  for (const row of list) {
    const card = el("article", "", "claim-card");
    const head = el("header");
    head.append(el("h3", row.claim.number ? `제${row.claim.number}항` : kind));
    if (granted && compared.comparable) {
      const changed = row.source && row.runs && (row.added.length || row.removed.length);
      head.append(el("span", claimChange(row), "detail-chip " + (changed ? "chip-amend" : "chip-argue")));
      if (row.source) head.append(el("small", `공개 제${row.source.number}항과 대조`));
    }
    card.append(head);
    if (row.runs) {
      const body = el("p", "", "claim-diff");
      for (const run of row.runs) {
        const first = run.words[0];
        if (run !== row.runs[0]) body.append(first.gap);
        body.append(run.type === "same" ? runText(run) : el(run.type === "added" ? "ins" : "del", runText(run)));
      }
      card.append(body);
    } else card.append(claimText(row.claim.text));
    for (const [phrases, label] of [[row.added, "등록 과정에서 추가된 문언"], [row.removed, "삭제된 문언"]]) {
      if (!phrases?.length) continue;
      const block = el("div", "", "claim-changes");
      block.append(el("h4", label));
      const items = el("ul");
      for (const phrase of phrases) {
        const item = el("li", "“" + phrase.replace(/\s+/g, " ") + "”");
        const amendments = label.startsWith("등록") ? amendmentsFor(phrase, rows) : [];
        if (amendments.length) item.append(" ", el("small", "보정 기록"));
        for (const amendment of amendments) item.append(" ", findingSource(amendment, true));
        items.append(item);
      }
      block.append(items);
      card.append(block);
    }
    if (row.source) {
      const before = el("details");
      before.append(el("summary", `출원 당시 문언 · 공개 제${row.source.number}항`), claimText(row.source.text));
      card.append(before);
    }
    panel.append(card);
  }
  if (compared.dropped.length) {
    const dropped = el("details", "", "claim-dropped");
    dropped.append(el("summary", `등록 ${kind}과 대응하지 않는 출원 당시 ${kind} ${compared.dropped.length}건 · 제${compared.dropped.map(claim => claim.number).join(", ")}항`),
      el("p", "삭제됐거나 제한요구·분할로 빠졌을 수 있습니다. 경위는 4단계에서 확인하세요.", "hint muted"));
    for (const claim of compared.dropped) dropped.append(el("h4", `공개 제${claim.number}항`), claimText(claim.text));
    panel.append(dropped);
  }
  panel.append(el("p", "공개공보는 보통 출원 당시 청구항을 싣지만, 공개 전에 보정했다면 보정된 문언일 수 있습니다. 종속항은 대조하지 않았습니다.", "hint muted"));
}

const allowanceStages = new Set(["NoA · 허여 통지", "허여 가능 통지", "등록 결정·예고", "Appeal · 불복 결정", "심사관 보정", "면담 기록"]);

function fillAllowance(report, briefs, rows) {
  const panel = recordPanel("allowance-reasons", "3 · 등록을 이끈 사유",
    "허여통지의 이유, 심사관 직권보정, 면담 기록처럼 심사관이 왜 등록시켰는지가 적힌 기록입니다.");
  if (!panel) return;
  const decisive = rows.filter(row => row.reason || row.finalDisposition || (allowanceStages.has(row.sourceStage) && row.role !== "applicant" && row.role !== "third"))
    .sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"));
  for (const row of decisive) {
    const item = el("div", "", "finding allowance-finding");
    item.append(el("strong", [row.date, row.procedure].filter(Boolean).join(" · "), "finding-procedure"));
    if (row.reason) {
      const reason = el("p", "", "allowance-reason");
      reason.append(el("b", "허여·철회 이유 "), row.reason);
      item.append(reason);
    }
    item.append(el("p", row.text));
    if (row.element) item.append(el("p", "“" + row.element + "”", "allowance-element"));
    const scope = claimScope(row.claims);
    if (scope) item.append(el("small", scope, "finding-scope"));
    item.append(findingSource(row, true));
    panel.append(item);
  }
  const last = prosecutionRounds(report, briefs).rounds.filter(round => round.kind === "exam").at(-1);
  if (last) {
    const answers = [...last.notice.rows, ...last.responses.flatMap(group => group.rows)].filter(row => row.role === "applicant");
    const overview = stageOverview("applicant", answers);
    if (overview) {
      const block = el("div", "", "allowance-last");
      block.append(el("h3", `마지막 통지에 대한 대응 · ${last.notice.date} ${last.notice.name}`), overview);
      panel.append(block);
    }
  }
  if (!decisive.length) {
    panel.append(el("p", report.autoPending ? "선택한 원문을 검토하고 있습니다."
      : "허여 이유가 적힌 결정문(허여통지·등록결정서·심결)을 분석 문서로 선택하지 않았습니다. 마지막 통지와 보정서를 4단계에서 맞대어 확인하세요.", "muted"));
  } else if (!decisive.some(row => row.reason)) {
    panel.append(el("p", "선택한 결정문에는 허여 이유가 따로 적혀 있지 않습니다. 등록을 가능하게 한 대응은 위의 처분과 마지막 통지에 대한 대응으로 확인하세요.", "hint muted"));
  }
}

// Acts of the applicant that can narrow how the claims are read or what equivalents remain.
function limitEntries(rows) {
  const entries = [];
  for (const row of rows) {
    if (row.role !== "applicant") continue;
    if (row.responseType === "amend" && row.element) entries.push({ kind: "감축·변경 보정", text: "“" + row.element + "”", note: [row.text, row.support && "명세서 근거 " + row.support].filter(Boolean).join(" · "), row });
    else if (row.responseType === "cancel") entries.push({ kind: "청구항 삭제", text: row.text, row });
    else if (row.responseType === "disclaimer") entries.push({ kind: "Terminal disclaimer", text: row.text, row });
    if (row.statement) entries.push({ kind: "한정 주장", text: "“" + row.statement + "”", note: row.responseType === "amend" ? "" : row.text, row });
  }
  return entries.sort((a, b) => (a.row.date || "9999").localeCompare(b.row.date || "9999"));
}

function fillLimits(report, rows) {
  const panel = recordPanel("scope-limits", "5 · 권리범위를 좁힌 기록",
    "출원인이 등록을 받으려고 한 보정, 청구항 삭제, 인용발명과 구별한 발언, 포기서를 모았습니다. 균등론 금반언(의식적 제외)과 청구항 해석의 근거가 될 수 있는 기록이며, 실제 적용 여부는 변리사 검토가 필요합니다.");
  if (!panel) return;
  const entries = limitEntries(rows);
  if (!entries.length) {
    const data = report.caseRecord?.data;
    const compared = data?.claims.granted && data.claims.original ? comparedClaims(data.claims) : undefined;
    const unchanged = compared?.comparable && compared.rows.every(row => row.source && row.runs && !row.added.length && !row.removed.length);
    panel.append(el("p", (report.autoPending ? "선택한 원문을 검토하고 있습니다." : "선택한 문서에서 감축 보정, 청구항 삭제, 한정 주장, 포기서를 확인하지 못했습니다.")
      + (unchanged ? " 등록 독립항은 출원 공개 당시 문언과 같습니다." : ""), "muted"));
    return;
  }
  panel.append(table(["구분", "청구항", "기록 내용", "근거"], entries.map(entry => {
    const content = el("div", "", "limit-entry");
    content.append(el("p", entry.text));
    if (entry.note) content.append(el("small", entry.note));
    return [entry.kind, claimScope(entry.row.claims).replace(/^청구항 /, "") || "사건 전체", content, findingSource(entry.row)];
  }), ""));
}

const citationKey = item => String(item.country || "").toUpperCase() + ":" + String(item.number || "").replace(/[^0-9A-Z]/gi, "").toUpperCase();
const citationLabel = item => [item.country, item.number, item.kind].filter(Boolean).join(" ");
const examinerStep = step => /심사|조사|search|exam/i.test(step || "");

// Document numbers quoted in the examiner's findings, in the same form as the citation keys.
function referenceKeys(text) {
  const keys = [];
  for (const match of String(text).matchAll(/\b(US|KR|JP|CN|EP|WO|DE|GB|FR|CA|AU|TW)[\s-]*((?:\d[\d,./\s-]*)?\d)/gi)) {
    keys.push(match[1].toUpperCase() + ":" + match[2].replace(/\D/g, ""));
  }
  return keys;
}

function rejectionArt(rows, third = false) {
  const used = new Map();
  for (const row of rows) {
    if (third ? row.role !== "third" : row.role !== "examiner" && row.role !== "outcome") continue;
    for (const item of row.references || []) {
      if (!item?.doc) continue;
      const key = referenceKeys(item.doc)[0] || item.doc.replace(/\s+/g, "").toUpperCase();
      if (!used.has(key)) used.set(key, { doc: item.doc, keys: referenceKeys(item.doc), where: new Set(), grounds: new Set(), claims: new Set(), sources: [] });
      const entry = used.get(key);
      if (item.where) entry.where.add(item.where);
      if (row.ground) entry.grounds.add(row.ground);
      row.claims.forEach(number => entry.claims.add(number));
      if (!entry.sources.some(source => source.index === row.index && source.locator === row.locator)) entry.sources.push(row);
    }
  }
  return [...used.values()];
}

function familyOnlyCitations(report) {
  const state = report.caseRecord;
  const own = new Set((state.data.citations?.items || []).map(citationKey));
  const family = new Set((report.familyAnalysis?.members || []).map(citationKey));
  const found = new Map();
  for (const member of state.family?.members || []) {
    for (const item of member.items || []) {
      const key = citationKey(item);
      if (own.has(key) || family.has(key)) continue;
      if (!found.has(key)) found.set(key, { ...item, citedIn: new Set(), steps: new Set() });
      found.get(key).citedIn.add(familyLabel(member));
      if (item.step) found.get(key).steps.add(item.step);
    }
  }
  const examined = item => Number([...item.steps].some(examinerStep));
  return [...found.values()].sort((a, b) => examined(b) - examined(a) || (b.date || "").localeCompare(a.date || ""));
}

async function loadFamilyCitations(report) {
  const state = report.caseRecord;
  const members = (report.familyAnalysis?.members || []).filter(member => !member.subject)
    .sort((a, b) => Number(/^[BC]/.test(b.kind || "")) - Number(/^[BC]/.test(a.kind || "")) || (b.date || "").localeCompare(a.date || "")).slice(0, 10);
  state.family = { status: "loading" };
  renderRecord(report);
  try {
    const result = await (await api({ action: "family-citations", members: members.map(({ country, number, kind }) => ({ country, number, kind })) })).json();
    state.family = { status: "done", members: result.members };
  } catch (error) {
    state.family = { status: "error", error: error.message };
  }
  if (current === report) renderRecord(report);
}

function fillPriorArt(report, rows) {
  const panel = recordPanel("prior-art", "6 · 선행기술 기록",
    "거절에 실제로 쓰인 문헌과, 심사 기록에 올라 있는 문헌을 나눴습니다. 무효 자료는 보통 심사관이 검토하지 않은 문헌에서 나옵니다.");
  if (!panel) return;
  const used = rejectionArt(rows);
  panel.append(el("h3", "거절에 쓰인 문헌"));
  if (used.length) {
    panel.append(table(["문헌", "심사관이 대응시킨 부분", "거절 근거", "청구항", "근거"], used.map(entry => {
      const sources = el("div", "", "art-sources");
      sources.append(...entry.sources.slice(0, 3).map(row => findingSource(row, true)));
      return [entry.doc, [...entry.where].join(" / "), [...entry.grounds].join(" / "), claimScope([...entry.claims]).replace(/^청구항 /, ""), sources];
    }), ""));
  } else panel.append(el("p", report.autoPending ? "선택한 원문을 검토하고 있습니다." : "선택한 문서에서 인용문헌에 근거한 거절을 확인하지 못했습니다.", "muted"));
  const submitted = rejectionArt(rows, true);
  if (submitted.length) {
    const adopted = new Set(used.flatMap(entry => entry.keys));
    panel.append(el("h3", "제3자가 제출·주장한 문헌"), table(["문헌", "제출·주장 내용", "다툰 요건", "청구항", "기관의 인용", "근거"], submitted.map(entry => {
      const sources = el("div", "", "art-sources");
      sources.append(...entry.sources.slice(0, 3).map(row => findingSource(row, true)));
      return [entry.doc, [...entry.where].join(" / "), [...entry.grounds].join(" / "), claimScope([...entry.claims]).replace(/^청구항 /, ""),
        entry.keys.some(key => adopted.has(key)) ? "거절·결정에 인용됨" : "인용 확인 안 됨", sources];
    }), ""));
  }
  const state = report.caseRecord;
  if (!state && !recordLive(report)) return;
  panel.append(el("h3", "심사 기록에 있는 인용문헌"));
  const data = recordData(panel, report, "인용문헌을");
  if (!data) return;
  const citations = data.citations;
  if (!citations?.items.length) {
    panel.append(el("p", "WINTELIPS에 이 문헌의 인용문헌 기록이 없습니다.", "muted"));
  } else {
    const usedKeys = used.flatMap(entry => entry.keys);
    const inRejection = item => {
      const digits = citationKey(item).split(":")[1];
      return usedKeys.some(key => key.startsWith(item.country + ":") && (key.endsWith(digits) || digits.endsWith(key.split(":")[1])));
    };
    const steps = citations.items.reduce((counts, item) => counts.set(item.step || "단계 미표시", (counts.get(item.step || "단계 미표시") || 0) + 1), new Map());
    panel.append(el("p", `특허문헌 ${citations.total || citations.items.length}건 · ` + [...steps].map(([step, count]) => `${step} ${count}건`).join(" · ")
      + (citations.nonPatent.length ? ` · 비특허문헌 ${citations.nonPatent.length}건` : ""), "family-overview"));
    const sorted = [...citations.items].sort((a, b) => Number(examinerStep(b.step)) - Number(examinerStep(a.step)) || (b.date || "").localeCompare(a.date || ""));
    const fold = el("details", "", "record-fold");
    fold.open = sorted.length <= 12;
    fold.append(el("summary", `인용문헌 목록 (${sorted.length})`), table(["문헌", "인용 단계", "발행일", "명칭 · 출원인", "거절 사용"],
      sorted.map(item => [citationLabel(item), item.step, item.date, [item.title, item.applicant].filter(Boolean).join(" · "), inRejection(item) ? "거절에 사용" : "—"]), ""));
    panel.append(fold);
    if (citations.nonPatent.length) {
      const other = el("details", "", "record-fold");
      other.append(el("summary", `비특허문헌 (${citations.nonPatent.length})`));
      const items = el("ul");
      items.append(...citations.nonPatent.map(name => el("li", name)));
      other.append(items);
      panel.append(other);
    }
  }
  panel.append(el("h3", "패밀리 심사에서 나온 문헌 중 이 사건 기록에 없는 것"));
  const members = (report.familyAnalysis?.members || []).filter(member => !member.subject);
  if (state.family?.status === "done") {
    const missing = familyOnlyCitations(report);
    const failed = state.family.members.filter(member => member.error).map(familyLabel);
    if (missing.length) {
      panel.append(el("p", `${missing.length}건 · 심사관·조사보고서 인용 ${missing.filter(item => [...item.steps].some(examinerStep)).length}건`, "family-overview"),
        table(["문헌", "인용한 패밀리 문헌", "인용 단계", "발행일", "명칭 · 출원인"], missing.slice(0, 60).map(item =>
          [citationLabel(item), [...item.citedIn].join(", "), [...item.steps].join(", "), item.date, [item.title, item.applicant].filter(Boolean).join(" · ")]), ""));
    } else panel.append(el("p", "조회한 패밀리 문헌의 인용문헌은 모두 이 사건 기록에도 있습니다.", "muted"));
    if (failed.length) panel.append(el("p", "조회 실패 · " + failed.join(", "), "analysis-notice"));
    panel.append(el("p", "WINTELIPS 인용 데이터로 대조한 결과입니다. 이 사건에 IDS로 제출됐는지는 심사철에서 확인하세요.", "hint muted"));
  } else if (state.family?.status === "loading") {
    panel.append(el("p", "패밀리 문헌의 인용문헌을 조회하고 있습니다.", "muted"));
  } else if (!recordLive(report)) {
    panel.append(el("p", "이 보고서에는 패밀리 인용문헌 대조를 포함하지 않았습니다.", "muted"));
  } else if (!members.length) {
    panel.append(el("p", report.familyAnalysis?.status === "loading" ? "패밀리 목록을 불러오면 대조할 수 있습니다." : "대조할 패밀리 문헌이 없습니다.", "muted"));
  } else {
    if (state.family?.error) panel.append(el("p", "패밀리 인용문헌을 불러오지 못했습니다 · " + state.family.error, "analysis-notice"));
    panel.append(el("p", `패밀리 문헌 ${Math.min(members.length, 10)}건의 인용문헌을 WINTELIPS에서 조회해 이 사건 기록과 대조합니다.`, "hint muted"),
      button("패밀리 인용문헌 대조", () => void loadFamilyCitations(report)));
  }
}

const formalGround = /신규사항|new matter|기재불비|written description|enablement|indefinite|§\s*112|§\s*132|art\.?\s*123|art\.?\s*8[34]|제42조|제47조|우선권|priority/i;

// Term and status of the right as label/value pairs, shared by the page and the PowerPoint export.
function rightsEntries(report, rows) {
  const data = report.caseRecord?.data;
  const entries = [];
  if (data) {
    const term = data.term;
    entries.push(["예상 만료일", term.expiry ? term.expiry + " · WINTELIPS 산정" : "WINTELIPS 기록 없음"]);
    if (term.adjustment) entries.push(["존속기간 조정 (PTA)", `${term.adjustment.total}일` + (term.adjustment.applicantDelay ? ` · 출원인 지연 ${term.adjustment.applicantDelay}일` : "")]);
    if (term.owners.length) entries.push(["현재 권리자", term.owners.join(", ")]);
    entries.push(["연차료·유지료", term.fees.length ? `최근 납부 ${term.fees[0].date || ""} ${term.fees[0].label}`.trim() + ` · 기록 ${term.fees.length}건` : "WINTELIPS에 납부 기록 없음"]);
  }
  for (const row of rows.filter(item => item.role === "applicant" && item.responseType === "disclaimer")) {
    entries.push(["Terminal disclaimer", [row.date, row.text].filter(Boolean).join(" · ")]);
  }
  return entries;
}

function fillRights(report, rows) {
  const slot = by("rights-record");
  if (!slot) return;
  const formal = rows.filter(row => (row.role === "examiner" || row.role === "outcome") && formalGround.test(row.ground || ""));
  const entries = rightsEntries(report, rows);
  if (!report.caseRecord && !recordLive(report) && !entries.length && !formal.length) { slot.hidden = true; return; }
  const panel = recordPanel("rights-record", "8 · 존속기간과 권리 상태", "권리가 언제까지 살아 있는지와, 기록에 남은 기재·형식 문제입니다.");
  if (!report.caseRecord || report.caseRecord.status !== "done") recordData(panel, report, "권리 정보를");
  if (entries.length) {
    const facts = el("dl", "", "frame-facts");
    for (const [label, value] of entries) {
      const cell = el("div");
      cell.append(el("dt", label), el("dd", value));
      facts.append(cell);
    }
    panel.append(facts);
  }
  const fees = report.caseRecord?.data?.term.fees || [];
  if (fees.length > 1) {
    const fold = el("details", "", "record-fold");
    fold.append(el("summary", `연차료·유지료 납부 기록 (${fees.length})`), table(["납부일", "내용"], fees.map(fee => [fee.date, fee.label]), ""));
    panel.append(fold);
  }
  panel.append(el("h3", "심사관이 지적한 기재·신규사항·우선권 문제"));
  if (formal.length) {
    panel.append(table(["지적", "청구항", "내용", "근거"], formal.map(row =>
      [row.ground, claimScope(row.claims).replace(/^청구항 /, "") || "사건 전체", row.text, findingSource(row)]), ""));
  } else panel.append(el("p", "선택한 문서에서 확인되지 않았습니다. 우선권 주장의 유효성과 보정의 신규사항 여부는 이 기록만으로 판단할 수 없습니다.", "muted"));
}

// Proceedings after grant as table rows, shared by the page and the PowerPoint export.
function postGrantEntries(data) {
  const after = data.postGrant;
  const entries = [];
  if (after.trials) {
    entries.push(["심판", after.trials.length ? after.trials.map(item => [item.number, item.type].filter(Boolean).join(" · ")).join("\n") : "WINTELIPS 기준 심판 기록 없음"]);
  }
  if (after.litigation) entries.push(["미국 소송", after.litigation.count ? `${after.litigation.count}건` : "WINTELIPS 기준 소송 기록 없음"]);
  if (after.opposition) {
    entries.push(["EP 이의신청", after.opposition.count ? `${after.opposition.count}건` + (after.opposition.appeals ? ` · 불복심판 ${after.opposition.appeals}건` : "") : "WINTELIPS 기준 이의신청 기록 없음"]);
  }
  return entries;
}

function fillPostGrant(report, briefs) {
  const slot = by("post-grant");
  if (!slot) return;
  // Proceedings found in the selected documents or the docket are read as stages of section 4.
  const flow = prosecutionRounds(report, briefs);
  const tracks = flow.rounds.map((round, index) => ({ round, index })).filter(({ round }) => round.kind !== "exam" && round.kind !== "appeal");
  if (!report.caseRecord && !recordLive(report) && !tracks.length) { slot.hidden = true; return; }
  const panel = recordPanel("post-grant", "9 · 등록 후 절차", "등록 뒤에도 무효심판·IPR·재심사·이의신청·정정·소송으로 청구항과 그 해석이 바뀔 수 있습니다.");
  if (tracks.length) {
    panel.append(el("h3", "문서와 이력에서 확인된 절차"));
    const list = el("ul");
    for (const { round, index } of tracks) {
      const item = el("li");
      const jump = el("a", `${index + 1}단계 · ${round.notice.date} ${round.notice.name}`);
      jump.href = "#process-analysis";
      item.append(jump, " · " + round.notice.stage + (round.id ? " · " + round.id : ""));
      list.append(item);
    }
    panel.append(list, el("p", "주장·대응·결정은 4단계의 해당 단계에서 볼 수 있습니다.", "hint muted"));
  }
  if (!report.caseRecord && !recordLive(report)) return;
  const data = recordData(panel, report, "등록 후 절차를");
  if (!data) return;
  const entries = postGrantEntries(data);
  if (!entries.length) {
    panel.append(el("p", data.subject.granted ? "이 관할의 심판·소송은 WINTELIPS 조회 대상이 아니거나 조회하지 못했습니다. 공식 열람처에서 확인하세요." : "등록 전 사건입니다.", "muted"));
    return;
  }
  const facts = el("dl", "", "frame-facts");
  for (const [label, value] of entries) {
    const cell = el("div");
    cell.append(el("dt", label), el("dd", value));
    facts.append(cell);
  }
  panel.append(facts);
  const after = data.postGrant;
  if (after.litigation?.cases.length) {
    panel.append(el("h3", "미국 소송"), table(["사건번호", "사건명", "법원", "제소일 – 종결일", "상태 · 결과"], after.litigation.cases.map(item =>
      [item.number, item.title, item.court, [item.filed, item.closed].filter(Boolean).join(" – "), [item.status, item.outcome].filter(Boolean).join(" · ")]), ""));
  }
  if (after.opposition?.items.length) {
    panel.append(el("h3", "EP 이의신청"), table(["신청일", "이의신청인", "상태", "상태일"], after.opposition.items.map(item =>
      [item.filed, item.opponent, item.status, item.statusDate]), ""));
  }
  panel.append(el("p", `WINTELIPS · ${data.retrieved} 조회 · 심판·소송의 상세 기록과 최신 상태는 각 기관에서 확인하세요. 재심사(EPR)·재발행·보충심사는 이 조회에 포함되지 않으므로, 해당 서류를 심사문서로 추가하면 4단계에 단계로 표시됩니다.`, "hint muted"));
}

function renderRecord(report, briefs = proceedingBriefs(report)) {
  if (!by("case-frame")) return;
  if (!report.caseRecord && recordLive(report) && isAutomaticMode()) void loadCaseRecord(report);
  const rows = briefs.flatMap(group => group.rows);
  fillFrame(report);
  fillClaims(report, rows);
  fillAllowance(report, briefs, rows);
  fillLimits(report, rows);
  fillPriorArt(report, rows);
  fillRights(report, rows);
  fillPostGrant(report, briefs);
  for (const jump of document.querySelectorAll(".report-nav a")) jump.hidden = Boolean(by(jump.hash.slice(1))?.hidden);
}

// Compact form of the record for Claude: the granted claims with what changed since publication, and the status of the right.
function caseContext(report) {
  const data = report.caseRecord?.status === "done" ? report.caseRecord.data : undefined;
  if (!data) return {};
  const { granted, original } = data.claims;
  const list = granted ? comparedClaims(data.claims).rows : (original?.claims || []).map(claim => ({ claim }));
  const steps = {};
  for (const item of data.citations?.items || []) steps[item.step || "단계 미표시"] = (steps[item.step || "단계 미표시"] || 0) + 1;
  const after = data.postGrant;
  return {
    claims: list.length ? {
      note: !granted ? "공개 청구항 (등록 문헌 없음)" : original ? "등록 독립항과, 출원 공개 당시 문언 대비 달라진 부분" : "등록 독립항 (공개 문헌 없음)",
      items: list.slice(0, 4).map(row => ({
        claim: row.claim.number, text: row.claim.text.slice(0, 1200), comparedWith: row.source ? "공개 제" + row.source.number + "항" : undefined,
        added: row.added?.slice(0, 4).map(text => text.slice(0, 240)), removed: row.removed?.slice(0, 4).map(text => text.slice(0, 240)),
        unchanged: row.source && row.runs && !row.added.length && !row.removed.length ? true : undefined,
      })),
    } : undefined,
    record: {
      source: "WINTELIPS " + data.retrieved, expectedExpiry: data.term.expiry, termAdjustmentDays: data.term.adjustment?.total, owners: data.term.owners,
      citations: data.citations ? { total: data.citations.total, byStep: steps } : undefined,
      trials: after.trials, litigation: after.litigation && { count: after.litigation.count, cases: after.litigation.cases.slice(0, 5).map(item => [item.title, item.status].filter(Boolean).join(" · ")) },
      opposition: after.opposition && { count: after.opposition.count, appeals: after.opposition.appeals },
    },
  };
}

// Tables for the PowerPoint export, in the order of the report.
function recordSheets(report) {
  const rows = proceedingBriefs(report).flatMap(group => group.rows);
  const data = report.caseRecord?.status === "done" ? report.caseRecord.data : undefined;
  const source = row => [row.date, row.procedure, row.locator].filter(Boolean).join(" · ");
  const sheets = [];
  if (data?.claims.granted || data?.claims.original) {
    const list = data.claims.granted ? comparedClaims(data.claims).rows : data.claims.original.claims.map(claim => ({ claim }));
    sheets.push({ title: "등록 청구항과 출원 당시 청구항", headers: ["청구항", "문언", "출원 당시 대비"], widths: [1.2, 7.3, 3.54],
      rows: list.map(row => [row.claim.number ? `제${row.claim.number}항` : "대표청구항", row.claim.text,
        !data.claims.granted ? "공개 청구항" : [row.source ? claimChange(row) : data.claims.original ? claimChange(row) : "공개 문헌 없음",
          row.added?.length && "추가: " + row.added.join(" / "), row.removed?.length && "삭제: " + row.removed.join(" / ")].filter(Boolean).join("\n")]) });
  }
  const limits = limitEntries(rows);
  if (limits.length) {
    sheets.push({ title: "권리범위를 좁힌 기록", headers: ["구분", "청구항", "기록 내용", "근거"], widths: [1.9, 1.4, 6, 2.74],
      rows: limits.map(entry => [entry.kind, claimScope(entry.row.claims).replace(/^청구항 /, "") || "사건 전체", [entry.text, entry.note].filter(Boolean).join("\n"), source(entry.row)]) });
  }
  const used = rejectionArt(rows);
  if (used.length) {
    sheets.push({ title: "거절에 쓰인 문헌", headers: ["문헌", "대응 부분", "거절 근거", "청구항"], widths: [3.4, 3.6, 3.2, 1.84],
      rows: used.map(entry => [entry.doc, [...entry.where].join(" / "), [...entry.grounds].join(" / "), claimScope([...entry.claims]).replace(/^청구항 /, "")]) });
  }
  if (data?.citations?.items.length) {
    sheets.push({ title: "심사 기록에 있는 인용문헌", headers: ["문헌", "인용 단계", "발행일", "명칭 · 출원인"], widths: [3, 1.8, 1.6, 5.64],
      rows: [...data.citations.items].sort((a, b) => Number(examinerStep(b.step)) - Number(examinerStep(a.step))).slice(0, 40)
        .map(item => [citationLabel(item), item.step, item.date, [item.title, item.applicant].filter(Boolean).join(" · ")]) });
  }
  const status = [...rightsEntries(report, rows), ...(data ? postGrantEntries(data) : [])];
  if (status.length) sheets.push({ title: "존속기간과 등록 후 절차", headers: ["항목", "내용"], widths: [3, 9.04], rows: status });
  return sheets;
}

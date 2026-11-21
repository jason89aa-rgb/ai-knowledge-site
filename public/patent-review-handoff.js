"use strict";

const handoffPanels = new WeakMap();
const pdfLimit = 3.5 * 1024 * 1024;

// The report tab never reads the EPO tab. Only files chosen by the user, or new
// files saved in a folder explicitly connected to this case, enter the queue.
function dossierHandoff(report) {
  if (handoffPanels.has(report)) return handoffPanels.get(report);
  const panel = el("section", "", "panel dossier-import");
  panel.append(el("h2", "심사문서 추가"));
  const guide = el("p", "PDF나 ZIP을 추가하면 안에 있는 문서가 아래에 표시됩니다. 분석할 문서를 체크한 뒤 분석 시작을 누르세요.");
  const controls = el("fieldset", "", "import-controls");
  const picker = el("input");
  picker.type = "file";
  picker.multiple = true;
  picker.accept = ".pdf,.zip";
  const label = el("label", "이 사건의 PDF·ZIP 선택");
  label.append(picker);
  controls.append(label);
  const status = el("p", "", "muted");
  status.setAttribute("role", "status");

  const problems = el("ul", "", "notes");
  const signal = activeSearch?.signal;
  let folderSession;
  let queue = Promise.resolve();
  const active = () => current === report && !signal?.aborted;

  function stopFolder() {
    if (folderSession) clearTimeout(folderSession.timer);
    folderSession = undefined;
    stop.hidden = true;
    watch.disabled = false;
  }
  const stop = button("폴더 연결 해제", () => {
    stopFolder();
    status.textContent = "폴더 연결을 해제했습니다.";
  });
  const watch = button("사건 전용 폴더 연결", async () => {
    watch.disabled = true;
    try {
      const dir = await window.showDirectoryPicker({ mode: "read", id: "patent-dossier" });
      if (!active()) return;
      const normalize = value => String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      const names = [report.query, report.application, report.grant, report.publication].map(normalize).filter(Boolean);
      if (!names.includes(normalize(dir.name))) {
        throw new Error("이 사건의 파일을 구분할 수 있도록 폴더 이름을 " + report.query + "로 지정하거나 PDF·ZIP을 직접 선택하세요.");
      }
      // Ignore pre-existing files. A downloaded ZIP can arrive via a temporary
      // filename, so accept only completed extensions stable across two polls.
      const session = { dir, seen: new Map(), pending: new Map(), timer: undefined };
      folderSession = session;
      for await (const handle of dir.values()) {
        if (folderSession !== session || !active()) return;
        if (handle.kind === "file" && /\.(pdf|zip)$/i.test(handle.name)) {
          const file = await handle.getFile();
          session.seen.set(file.name, file.size + ":" + file.lastModified);
        }
      }
      stop.hidden = false;
      status.textContent = "연결된 폴더 · " + dir.name + " — 이 사건의 새 PDF·ZIP을 기다립니다.";
      async function poll() {
        if (!active() || folderSession !== session) return;
        try {
          const ready = [];
          for await (const handle of dir.values()) {
            if (handle.kind !== "file" || !/\.(pdf|zip)$/i.test(handle.name)) continue;
            const file = await handle.getFile();
            const version = file.size + ":" + file.lastModified;
            if (!file.size || session.seen.get(file.name) === version) continue;
            if (session.pending.get(file.name) !== version) {
              session.pending.set(file.name, version);
              continue;
            }
            session.seen.set(file.name, version);
            session.pending.delete(file.name);
            ready.push(file);
          }
          if (!active() || folderSession !== session) return;
          if (ready.length) await enqueue(ready);
          if (active() && folderSession === session) session.timer = setTimeout(poll, 1500);
        } catch {
          if (!active() || folderSession !== session) return;
          stopFolder();
          status.textContent = "폴더를 읽을 수 없습니다. 다시 연결하거나 파일을 직접 선택하세요.";
        }
      }
      session.timer = setTimeout(poll, 1500);
    } catch (error) {
      if (!active()) return;
      stopFolder();
      if (error.name !== "AbortError") status.textContent = error.name === "Error" ? error.message : "폴더 접근 권한이 없습니다. PDF·ZIP 선택을 이용하세요.";
    }
  });
  stop.hidden = true;
  if (typeof window.showDirectoryPicker === "function") controls.append(watch, stop);
  const choices = el("fieldset", "", "analysis-choices");
  choices.append(el("legend", "분석할 문서"));
  const rows = new Map();
  const summaries = new Map();
  const stagedFiles = new Set();
  const officialDocs = [...report.documents];
  const list = el("div", "", "analysis-list");
  const selectAll = el("input");
  selectAll.type = "checkbox";
  const allLabel = el("label", "", "analysis-option");
  allLabel.append(selectAll, "전체 선택");
  const metadataOnly = el("input");
  metadataOnly.type = "checkbox";
  const metadataLabel = el("label", "", "analysis-option");
  metadataLabel.append(metadataOnly, "서지·공개 이력만 분석");
  const count = el("span", "", "muted");
  const start = button("분석 시작", runAnalysis, "primary");
  const footer = el("div", "", "analysis-footer");
  footer.append(count, start);
  choices.append(allLabel, list, metadataLabel, footer);
  panel.append(guide, controls, choices, status, problems);
  if (["EP", "US"].includes(report.country)) {
    const home = report.country === "US" ? "https://worldwide.espacenet.com/" : "https://register.epo.org/";
    const source = report.links.find(item => item.url.startsWith(home));
    panel.append(link(source || { url: home, label: report.country === "US" ? "Espacenet 열기" : "European Patent Register 열기" }));
  }
  const originalLinksOnly = Boolean(report.linksOnly);

  function refresh() {
    const eligible = [...rows.values()].filter(row => !row.input.disabled);
    const selected = eligible.filter(row => row.input.checked).length;
    allLabel.hidden = eligible.length === 0;
    selectAll.checked = selected > 0 && selected === eligible.length;
    selectAll.indeterminate = selected > 0 && selected < eligible.length;
    metadataLabel.hidden = originalLinksOnly || eligible.length > 0;
    if (metadataLabel.hidden) metadataOnly.checked = false;
    count.textContent = "문서 " + rows.size + "건 · 선택 " + selected + "건";
    start.disabled = !report.canSummarize || !active() || report.autoPending || !(selected || metadataOnly.checked);
  }
  function addRow(key, name, source, reason = "") {
    const input = el("input");
    input.type = "checkbox";
    input.disabled = Boolean(reason);
    const label = el("label", "", "analysis-option");
    const info = el("small", reason);
    label.append(input, el("span", name), info);
    list.append(label);
    rows.set(key, { input, name, info, ...source });
    input.onchange = refresh;
  }
  for (const doc of officialDocs) {
    if ((doc.downloadable || doc.text) && !rows.has(doc.id)) {
      addRow(doc.id, [doc.date, doc.title || doc.id].filter(Boolean).join(" · "), { doc });
    }
  }
  metadataOnly.onchange = refresh;
  selectAll.onchange = () => {
    for (const row of rows.values()) if (!row.input.disabled) row.input.checked = selectAll.checked;
    refresh();
  };
  signal?.addEventListener("abort", () => {
    stopFolder();
    controls.disabled = choices.disabled = true;
  }, { once: true });

  async function digest(data) {
    const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", data));
    return Array.from(bytes, n => n.toString(16).padStart(2, "0")).join("");
  }
  async function stage(file) {
    const zipped = /\.zip$/i.test(file.name);
    if (!zipped && !/\.pdf$/i.test(file.name)) throw new Error("PDF 또는 ZIP을 선택하세요.");
    if (zipped && file.size > 120 * 1024 * 1024) throw new Error("ZIP은 120 MiB까지 처리할 수 있습니다.");
    if (!zipped && file.size > pdfLimit) {
      const key = JSON.stringify([file.name, file.size, file.lastModified]);
      if (!rows.has(key)) addRow(key, file.name, {}, "3.5 MiB 초과");
      return;
    }
    const hash = await digest(await file.arrayBuffer());
    if (!active() || stagedFiles.has(hash)) return;
    if (zipped) {
      const { readZipPdfs } = await import("/patent-review-archive.js");
      const entries = await readZipPdfs(file);
      if (!active()) return;
      if (!entries.length) throw new Error("ZIP에 PDF가 없습니다.");
      entries.forEach((entry, index) => {
        addRow(hash + ":" + index, entry.path, {
          getFile: async () => new File([await entry.read()], entry.name, { type: "application/pdf" }),
        }, entry.encrypted ? "암호화된 PDF" : entry.size > pdfLimit ? "3.5 MiB 초과" : "");
      });
    } else addRow(hash, file.name, { getFile: () => file, hash });
    stagedFiles.add(hash);
  }
  function enqueue(files) {
    queue = queue.then(async () => {
      for (const file of files) {
        if (!active()) return;
        try { await stage(file); }
        catch (error) {
          if (active()) problems.append(el("li", file.name + " · " + error.message));
        }
      }
      if (active()) refresh();
    });
    return queue;
  }
  async function analyze(row) {
    if (row.result) return row.result;
    let doc = row.doc;
    let result;
    if (doc) {
      const summary = await summarizeWithRetry({ action: "summarize", ...documentPayload(report, doc) }, signal, row.name);
      result = { doc, summary: { ...summary, id: doc.id } };
    } else {
      const file = await row.getFile();
      const data = await file.arrayBuffer();
      if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("유효한 PDF가 아닙니다.");
      const hash = row.hash || await digest(data);
      signal.throwIfAborted();
      result = summaries.get(hash);
      if (!result) {
        const form = new FormData();
        form.append("pdf", file);
        const summary = await summarizeWithRetry(form, signal, row.name);
        const dates = [...new Set((summary.evidence || []).map(item => calendarDay(item.documentDate)).filter(Boolean))];
        const date = dates.length === 1 ? dates[0] : calendarDay(file.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0]);
        doc = { id: "PDF-" + hash.slice(0, 16), title: file.name, date: date || "", importHash: hash };
        result = { doc, summary: { ...summary, id: doc.id, source: "사용자 제공 PDF" } };
        summaries.set(hash, result);
      }
    }
    row.result = result;
    return result;
  }
  async function runAnalysis() {
    if (start.disabled || report.autoPending || !active()) return;
    const selected = [...rows.values()].filter(row => row.input.checked && !row.input.disabled);
    const results = new Map();
    let failed = 0;
    report.autoPending = choices.disabled = true;
    report.conclusion = undefined;
    report.summaries = [];
    report.documents = [...officialDocs];
    show(report);
    try {
      for (const [index, row] of selected.entries()) {
        status.textContent = (index + 1) + "/" + selected.length + " · " + row.name;
        try {
          row.info.textContent = "분석 중";
          const result = await analyze(row);
          signal.throwIfAborted();
          results.set(result.doc.id, result);
          row.info.textContent = "분석 완료";
        } catch (error) {
          signal.throwIfAborted();
          row.info.textContent = "분석 실패 · " + error.message;
          failed++;
        }
      }
      if (!active()) return;
      if (selected.length && !results.size) throw new Error("선택한 문서를 분석하지 못했습니다. 문서 옆의 사유를 확인한 뒤 다시 시도하세요.");
      for (const { doc, summary } of results.values()) {
        if (doc.importHash) report.documents.push(doc);
        report.summaries.push(summary);
      }
      if (report.linksOnly && results.size) {
        report.linksOnly = false;
        report.source = "사용자 제공 심사문서 · 자동 서지 미확인";
        report.notes.push("선택한 사건에 사용자가 연결한 파일로 작성했습니다. 기관 검색으로 문헌 일치를 확인하지 못했습니다.");
      }
      report.analysisCoverage = "선택 " + selected.length + "건 · 분석한 고유 원문 " + results.size + "건 · 실패 " + failed + "건";
      status.textContent = "심사 결과 보고서 작성 중";
      await finishDossierAnalysis(report, signal);
      signal.throwIfAborted();
      status.textContent = report.analysisCoverage + (report.conclusion.partial ? " · 일부 작성" : " · 보고서 작성 완료");
      const jump = el("a", "보고서 보기");
      jump.href = "#analysis-result";
      status.append(" ", jump);
      if (report.analysisRequest) await requestAnswer(report, report.analysisRequest, signal);
    } catch (error) {
      if (active()) {
        status.textContent = error.message;
        say("status", error.message, true);
      }
    } finally {
      if (active()) {
        report.autoPending = choices.disabled = false;
        refresh();
        show(report);
        if (report.conclusion) by("analysis-result")?.scrollIntoView({ block: "start" });
      }
    }
  }
  picker.onchange = () => {
    const files = [...picker.files];
    picker.value = "";
    void enqueue(files);
  };
  if (!report.canSummarize) status.textContent = "서버에 AI 요약 키를 설정하면 분석을 시작할 수 있습니다.";
  refresh();
  handoffPanels.set(report, panel);
  return panel;
}

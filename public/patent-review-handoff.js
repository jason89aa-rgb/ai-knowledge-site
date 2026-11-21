"use strict";

const handoffPanels = new WeakMap();
const pdfLimit = 3.5 * 1024 * 1024;

// The report tab never reads the EPO tab. Only files chosen by the user, or new
// files saved in a folder explicitly connected to this case, enter the queue.
function dossierHandoff(report) {
  if (handoffPanels.has(report)) return handoffPanels.get(report);
  const panel = el("section", "", "panel dossier-import");
  panel.append(el("h2", "심사문서 추가"));
  const guide = el("p", "PDF나 ZIP을 추가하면 안에 있는 문서가 아래에 표시됩니다. 분석할 문서를 체크한 뒤 보고서 생성을 누르세요.");
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
  const cachedResults = new Map();
  const jointConclusions = new Map();
  let preparing = true;
  let staging = 0;
  const stagedFiles = new Set();
  const officialDocs = [...report.documents];
  const list = el("div", "", "analysis-list");
  const stopWaiting = button("현재 준비된 문서로 계속", () => {
    panel.dataset.zipPending = "false";
    refresh();
  });
  panel.addEventListener("zip-download-state", refresh);
  const selectAll = el("input");
  selectAll.type = "checkbox";
  const allLabel = el("label", "", "analysis-option");
  allLabel.append(selectAll, "전체 선택");
  const metadataOnly = el("input");
  metadataOnly.type = "checkbox";
  const metadataLabel = el("label", "", "analysis-option");
  metadataLabel.append(metadataOnly, "서지·공개 이력만 분석");
  const count = el("span", "", "muted");
  const start = button("보고서 생성", runAnalysis, "primary");
  const footer = el("div", "", "analysis-footer");
  footer.append(count, start, stopWaiting);
  choices.append(allLabel, list, metadataLabel, footer);
  panel.append(guide, controls, choices, status, problems);
  if (["EP", "US"].includes(report.country)) {
    const home = report.country === "US" ? "https://worldwide.espacenet.com/" : "https://register.epo.org/";
    const source = report.links.find(item => item.url.startsWith(home));
    if (report.country === "US") panel.append(link({ url: "https://ez-patents.com/", label: "EZ Patents에서 심사철 ZIP 받기" }), " · ");
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
    const waitingForZip = panel.dataset.zipPending === "true";
    stopWaiting.hidden = !waitingForZip;
    start.disabled = waitingForZip || !report.canSummarize || !active() || preparing || staging > 0 || report.autoPending || !(selected || metadataOnly.checked);
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
    staging++;
    refresh();
    queue = queue.then(async () => {
      for (const file of files) {
        if (!active()) return;
        try { await stage(file); }
        catch (error) {
          if (active()) problems.append(el("li", file.name + " · " + error.message));
        }
      }
    }).finally(() => {
      staging--;
      if (active()) refresh();
    });
    return queue;
  }
  async function prepareOfficial() {
    for (const row of rows.values()) {
      if (!row.doc || !active()) continue;
      try {
        status.textContent = "기관 원문 다운로드 중 · " + row.name;
        const response = await api({ action: row.doc.text ? "prepare-text" : "download", ...documentPayload(report, row.doc) }, signal);
        const data = row.doc.text ? (await response.json()).text : await response.blob();
        if (row.doc.text && (typeof data !== "string" || !data.trim())) throw new Error("기관 본문이 비어 있습니다.");
        row.file = new File([data], row.doc.title || row.doc.id, { type: row.doc.text ? "text/plain" : "application/pdf" });
        row.info.textContent = "다운로드 완료";
      } catch (error) {
        if (!active()) return;
        row.info.textContent = "원문 다운로드 실패 · 선택하면 기관에 다시 요청";
      }
    }
    preparing = false;
    if (active()) {
      status.textContent = report.canSummarize ? "사용할 문서를 선택해 주세요." : "서버에 AI 요약 키를 설정하면 보고서를 생성할 수 있습니다.";
      refresh();
    }
  }

  async function material(row) {
    if (row.doc && (!row.file || row.file.size > pdfLimit)) return { doc: row.doc, key: "기관:" + row.doc.id, row };
    const file = row.file || await row.getFile();
    const data = await file.arrayBuffer();
    if (!row.doc?.text && new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("유효한 PDF가 아닙니다.");
    const hash = row.hash || await digest(data);
    const date = calendarDay(file.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0]);
    const doc = row.doc || { id: "PDF-" + hash.slice(0, 16), title: file.name, date: date || "", importHash: hash };
    return { file, doc, key: hash, row };
  }

  function jointContext() {
    const data = { country: report.country, query: report.query, application: report.application, title: report.title,
      grant: report.grant, filed: report.filed, granted: report.granted, status: report.status, source: report.source,
      publication: report.publication, applicants: report.applicants, inventors: report.inventors,
      abstract: report.abstract?.slice(0, 1200), family: report.family.slice(0, 6).map(row => ({
        country: row.country, application: row.application, publication: row.publication,
      })), bibliographicMatch: !originalLinksOnly, ...caseContext(report), events: [] };
    let budget = 21000 - new TextEncoder().encode(JSON.stringify(data)).length;
    for (const event of report.events.filter(event => prosecutionStage(event))) {
      const item = { date: event.date, title: event.title?.slice(0, 230), detail: event.detail?.slice(0, 160) };
      budget -= new TextEncoder().encode(JSON.stringify(item)).length;
      if (budget < 0) break;
      data.events.push(item);
    }
    return data;
  }

  async function runAnalysis() {
    if (start.disabled || report.autoPending || !active()) return;
    const selected = [...rows.values()].filter(row => row.input.checked && !row.input.disabled);
    const results = new Map();
    const inputs = new Map();
    let failed = 0;
    // A rerun that fails must not cost the report that is already there.
    const previous = report.conclusion && { conclusion: report.conclusion, summaries: report.summaries, documents: report.documents, analysisCoverage: report.analysisCoverage };
    report.autoPending = choices.disabled = true;
    report.conclusion = undefined;
    report.summaries = [];
    report.documents = [...officialDocs];
    show(report);
    try {
      // Resolve the selection locally before sending a case-bound request. Only
      // a single batch's inflated ZIP entries are kept in memory at a time.
      let batch = [];
      let bytes = 0;
      // A batch the server could not answer in one piece is not tried at that size again in this run.
      let docLimit = 8;
      let byteLimit = pdfLimit;
      const shrinkTo = done => {
        docLimit = Math.max(1, Math.min(docLimit, done.length));
        byteLimit = Math.max(1, Math.min(byteLimit, done.reduce((size, item) => size + item.file.size, 0)));
      };
      let cuts = 0;
      let onlyConclusion;
      let groups = 0;
      // The claims as published and granted and the status of the right frame the conclusion; a failed or slow lookup only leaves them out.
      status.textContent = "WINTELIPS에서 청구항과 권리 기록 조회 중";
      await Promise.race([loadCaseRecord(report), new Promise(resolve => setTimeout(resolve, 20000))]);
      signal.throwIfAborted();
      const context = jointContext();
      async function submitBatch(work = batch) {
        if (!work.length) return;
        if (work === batch) {
          batch = [];
          bytes = 0;
        }
        groups++;
        const key = JSON.stringify(work.map(item => item.key));
        const fresh = work.filter(item => !cachedResults.has(item.key));
        if (fresh.length) {
          const form = new FormData();
          form.append("action", "joint-report");
          const sources = fresh.map(({ doc }) => ({
            date: doc.date, id: doc.id, title: doc.title?.slice(0, 160), source: doc.importHash ? "사용자 제공 원문" : report.source,
          }));
          form.append("context", JSON.stringify({ case: context, sources }));
          form.append("focus", report.analysisRequest || "");
          fresh.forEach(item => {
            const type = item.row.doc?.text ? "text/plain" : "application/pdf";
            form.append("document", item.file.slice(0, item.file.size, type), item.file.name);
          });
          status.textContent = "선택 원문 " + fresh.length + "건 함께 분석 중";
          let response;
          // A cut answer to several documents is not asked for again: the batch is halved. A single document gets one more try.
          try { response = await summarizeWithRetry(form, signal, status.textContent, fresh.length === 1); }
          catch (error) {
            signal.throwIfAborted();
            // 504: Claude did not start answering in time, which fewer documents also cures.
            const overload = error.cut || error.status === 504;
            if (!overload && ![413, 422].includes(error.status)) throw error;
            if (fresh.length > 1) {
              groups--;
              const split = Math.ceil(work.length / 2);
              if (overload) {
                shrinkTo(fresh.slice(0, Math.ceil(fresh.length / 2)));
                for (const item of fresh) item.row.info.textContent = "응답이 끊김 · 나눠서 재분석 대기";
                // Documents analysed in an earlier run need no request. The limit may drop again while a part is sent, so each part is cut to the limit of that moment.
                await submitBatch(work.filter(item => !fresh.includes(item)));
                for (let rest = fresh; rest.length;) {
                  const part = rest.slice(0, docLimit);
                  rest = rest.slice(part.length);
                  await submitBatch(part);
                }
              } else {
                await submitBatch(work.slice(0, split));
                await submitBatch(work.slice(split));
              }
            } else {
              fresh[0].row.info.textContent = "분석 실패 · " + error.message;
              failed++;
              // When nothing gets through, stop instead of failing every remaining document the same way.
              if (error.cut && ++cuts >= 3) throw error;
              // The rest of this batch was analysed in an earlier run and still counts.
              if (work.length > 1) {
                groups--;
                await submitBatch(work.filter(item => item !== fresh[0]));
              }
            }
            return;
          }
          signal.throwIfAborted();
          cuts = 0;
          if (!Array.isArray(response.documents) || response.documents.length !== fresh.length) throw new Error("문서별 분석 결과를 확인할 수 없습니다.");
          const missed = fresh.filter((item, i) => !response.documents[i]?.text);
          fresh.forEach((item, i) => {
            const summary = response.documents[i];
            if (!summary?.text) return;
            const doc = item.doc;
            const dates = [...new Set((summary.evidence || []).map(row => calendarDay(row.documentDate)).filter(Boolean))];
            if (doc.importHash && dates.length === 1) doc.date = dates[0];
            for (const row of summary.evidence || []) {
              const index = row.noticeSource - 1;
              if (row.reference && Number.isInteger(index) && index !== i && fresh[index]) row.noticeId = fresh[index].doc.id;
            }
            cachedResults.set(item.key, { doc, summary: { ...summary, id: doc.id, source: doc.importHash ? "사용자 제공 PDF" : report.source } });
          });
          if (fresh.length === work.length && response.conclusion?.text && response.documents.every(Boolean)) jointConclusions.set(key, response.conclusion);
          if (missed.length === fresh.length) {
            for (const item of missed) item.row.info.textContent = "이번 응답에서 문서별 분석 미완료";
            failed += missed.length;
          } else if (missed.length) {
            // The answer left these out, so they are sent again. When it ran out before the last ones, later batches hold only as many as it covered.
            if (fresh.indexOf(missed[0]) === fresh.length - missed.length) shrinkTo(fresh.slice(0, fresh.length - missed.length));
            for (const item of missed) item.row.info.textContent = "응답에 담기지 않음 · 재분석 대기";
            await submitBatch(missed);
          }
        }
        onlyConclusion = jointConclusions.get(key);
        for (const item of work) {
          const result = cachedResults.get(item.key);
          if (result) { results.set(result.doc.id, result); item.row.info.textContent = "분석 완료"; }
        }
      }

      for (const row of selected) {
        signal.throwIfAborted();
        let item;
        try { item = await material(row); }
        catch (error) { failed++; row.info.textContent = "준비 실패 · " + error.message; continue; }
        if (inputs.has(item.key)) { row.info.textContent = "동일 원문"; continue; }
        inputs.set(item.key, true);
        if (!item.file) {
          await submitBatch();
          groups++;
          try {
            if (!cachedResults.has(item.key)) {
              const summary = await summarizeWithRetry({ action: "summarize", ...documentPayload(report, item.doc) }, signal, row.name);
              cachedResults.set(item.key, { doc: item.doc, summary: { ...summary, id: item.doc.id } });
            }
            results.set(item.doc.id, cachedResults.get(item.key));
            row.info.textContent = "분석 완료";
            cuts = 0;
          } catch (error) {
            signal.throwIfAborted();
            row.info.textContent = "기관 원문 분석 실패 · " + error.message;
            failed++;
            if (error.cut && ++cuts >= 3) throw error;
          }
          continue;
        }
        if (batch.length >= docLimit || bytes + item.file.size > byteLimit) await submitBatch();
        batch.push(item);
        bytes += item.file.size;
      }
      await submitBatch();
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
      if (groups === 1 && onlyConclusion && !failed) report.conclusion = onlyConclusion;
      else await finishDossierAnalysis(report, signal);
      signal.throwIfAborted();
      status.textContent = report.analysisCoverage + (report.conclusion.partial ? " · 일부 작성" : " · 보고서 작성 완료");
      const jump = el("a", "보고서 보기");
      jump.href = "#analysis-result";
      status.append(" ", jump);
      say("status", report.conclusion.partial ? "보고서가 일부 작성됐습니다." : "심사 결과 보고서를 작성했습니다.");
    } catch (error) {
      if (active()) {
        if (previous) Object.assign(report, previous);
        status.textContent = error.message + (previous ? " 이전 보고서는 그대로 두었습니다." : "");
        // Finished analyses stay in this panel, so running again only sends what is still missing.
        if (error.cut && cachedResults.size) status.textContent += " 분석을 마친 문서 " + cachedResults.size + "건은 다시 실행할 때 그대로 사용합니다.";
        say("status", status.textContent, true);
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
  void prepareOfficial();
  return panel;
}

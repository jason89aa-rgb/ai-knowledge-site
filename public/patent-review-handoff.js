"use strict";

const handoffPanels = new WeakMap();
const pdfLimit = 3.5 * 1024 * 1024;

// The report tab never reads the EPO tab. Only files chosen by the user, or new
// files saved in a folder explicitly connected to this case, enter the queue.
function dossierHandoff(report) {
  if (handoffPanels.has(report)) return handoffPanels.get(report);
  const panel = el("section", "", "panel dossier-import");
  panel.append(el("h2", "EPO 심사문서 가져오기"));
  const entry = report.links.find(item => item.url.startsWith(report.country === "US"
    ? "https://worldwide.espacenet.com/" : "https://register.epo.org/"));
  const home = report.country === "US" ? "https://worldwide.espacenet.com/" : "https://register.epo.org/";
  panel.append(link({ url: entry?.url || home, label: report.country === "US" ? "Espacenet 열기" : "European Patent Register 열기" }));
  panel.append(el("p", (report.country === "US"
    ? "EPO 탭에서 보안 확인 후 Global Dossier의 원문 PDF를 저장하세요."
    : "EPO 탭에서 보안 확인 후 All documents에서 원문 PDF 또는 ZIP을 저장하세요.")
    + " 이 리포트 탭을 열어 두세요. 사건번호로 이름을 지은 폴더를 먼저 연결하면 새 PDF·ZIP의 원문을 Claude에 전송하고 결과 보고서를 갱신합니다. 이미 받은 파일도 선택할 수 있습니다."));
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
  status.textContent = "EPO 원문 대기 중 · 폴더를 연결하거나 이미 받은 파일을 선택하세요.";
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
        throw new Error("이 사건 파일만 자동 전송하도록 폴더 이름을 " + report.query + "로 지정하거나 PDF·ZIP을 직접 선택하세요.");
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
  signal?.addEventListener("abort", () => { stopFolder(); controls.disabled = true; }, { once: true });
  panel.append(controls, status, problems);

  function failure(name, error) {
    const message = name + " · " + error.message;
    problems.append(el("li", message));
    if (!report.notes.includes(message)) addReportNote(report, message);
  }
  async function analyze(file) {
    if (!active()) return false;
    if (file.size > pdfLimit) throw new Error("PDF가 3.5 MiB를 초과합니다.");
    const data = await file.arrayBuffer();
    if (new TextDecoder().decode(data.slice(0, 5)) !== "%PDF-") throw new Error("유효한 PDF가 아닙니다.");
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), n => n.toString(16).padStart(2, "0")).join("");
    if (!active() || report.documents.some(doc => doc.importHash === hash)) return false;
    const form = new FormData();
    form.append("pdf", file);
    status.textContent = file.name + " · 원문 분석 중";
    const summary = await summarizeWithRetry(form, signal, file.name);
    if (!active()) return false;
    const id = "PDF-" + hash.slice(0, 16);
    const dates = [...new Set((summary.evidence || []).map(row => calendarDay(row.documentDate)).filter(Boolean))];
    const date = dates.length === 1 ? dates[0] : calendarDay(file.name.match(/^\d{4}-\d{2}-\d{2}/)?.[0]);
    report.documents.push({ id, title: file.name, date: date || "", importHash: hash });
    addSummary(report, { ...summary, id, source: "사용자 제공 PDF" });
    return true;
  }
  function enqueue(files) {
    queue = queue.then(async () => {
      if (!active()) return;
      let added = 0;
      let skipped = 0;
      let failed = 0;
      async function processPdf(name, getFile) {
        if (!active()) return;
        try {
          if (await analyze(await getFile())) added++;
          else skipped++;
        } catch (error) {
          if (active()) { failed++; failure(name, error); }
        }
      }
      for (const file of files) {
        if (!active()) return;
        if (/\.pdf$/i.test(file.name)) {
          await processPdf(file.name, () => file);
        } else if (/\.zip$/i.test(file.name)) {
          try {
            const { readZipPdfs } = await import("/patent-review-archive.js");
            const entries = await readZipPdfs(file);
            if (!entries.length) throw new Error("ZIP에 PDF가 없습니다.");
            for (const item of entries) {
              if (!active()) return;
              await processPdf(item.path, async () => new File([await item.read()], item.name, { type: "application/pdf" }));
            }
          } catch (error) {
            if (active()) { failed++; failure(file.name, error); }
          }
        } else { failed++; failure(file.name, new Error("PDF 또는 ZIP을 선택하세요.")); }
      }
      if (!active()) return;
      if (added) {
        report.conclusion = undefined;
        if (report.linksOnly) {
          report.linksOnly = false;
          report.source = "사용자 제공 심사문서 · 자동 서지 미확인";
          report.notes.push("선택한 사건에 사용자가 연결한 파일로 작성했습니다. 기관 검색으로 문헌 일치를 확인하지 못했습니다.");
        }
        show(report);
      }
      if (added || (skipped && !report.conclusion && report.summaries.length)) {
        status.textContent = "심사 결과 보고서 작성 중";
        await finishDossierAnalysis(report, signal);
      }
      if (active()) status.textContent = "원문 분석 " + added + "건 · 중복 " + skipped + "건 · 실패 " + failed + "건";
    }).catch(error => {
      if (active()) { status.textContent = "종합에 실패했습니다. 같은 파일을 다시 선택하면 기존 분석으로 재시도합니다."; failure("결과 보고서", error); }
    });
    return queue;
  }
  picker.onchange = () => {
    const files = [...picker.files];
    picker.value = "";
    void enqueue(files);
  };
  controls.disabled = !report.canSummarize || report.autoPending;
  if (!report.canSummarize) status.textContent = "서버에 AI 요약 키를 설정하면 원문 분석을 사용할 수 있습니다.";
  handoffPanels.set(report, panel);
  return panel;
}

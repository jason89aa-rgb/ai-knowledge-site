(() => {
  const form = document.getElementById("lookup");
  const result = document.getElementById("result");
  if (!form || !result) return;
  let previousCover;
  let job;
  function notice(text) {
    const cover = result.querySelector(".dossier-cover");
    if (!cover || result.hidden) return;
    let message = cover.querySelector(".ez-zip-status");
    if (!message) {
      message = document.createElement("p");
      message.className = "ez-zip-status";
      message.setAttribute("role", "status");
      cover.append(message);
    }
    message.textContent = text;
  }
  function downloading(pending) {
    const panel = result.querySelector(".dossier-import");
    if (!panel) return;
    panel.dataset.zipPending = pending ? "true" : "false";
    panel.dispatchEvent(new Event("zip-download-state"));
  }
  const waiting = new MutationObserver(importWhenReady);
  function importWhenReady() {
    if (!job?.file || result.hidden) return;
    const picker = result.querySelector(".dossier-import input[type=file]");
    if (!picker || picker.matches(":disabled")) return;
    const transfer = new DataTransfer();
    transfer.items.add(job.file);
    picker.files = transfer.files;
    job.file = null;
    waiting.disconnect();
    const details = picker.closest("details");
    if (details) details.open = true;
    picker.dispatchEvent(new Event("change", {bubbles: true}));
    downloading(false);
    notice("EZ Patents 전체 ZIP을 이 사건에 연결했습니다. 심사문서 추가에서 문서를 체크하고 보고서 생성을 누르세요.");
  }
  chrome.runtime.onMessage.addListener((message, sender, reply) => {
    if (sender.id !== chrome.runtime.id || !job || message.ticket !== job.ticket ||
        message.application !== job.application || job.received || result.hidden) return;
    job.received = true;
    if (message.type === "archive" && message.blob instanceof Blob && message.blob.size) {
      job.file = new File([message.blob], job.application + "_file_history.zip", {type:"application/zip"});
      notice("전체 ZIP을 받았습니다. 리포트가 준비되면 문서 목록에 추가합니다.");
      waiting.observe(result, {attributes:true, childList:true, subtree:true});
      importWhenReady();
    } else {
      downloading(false);
      notice("ZIP을 자동으로 연결하지 못했습니다. EZ Patents 탭을 확인하고, 이미 저장된 ZIP은 파일 선택으로 추가하세요.");
    }
    reply({received:true});
  });
  const watch = new MutationObserver(() => {
    const cover = result.querySelector(".dossier-cover");
    if (!cover || cover === previousCover || result.hidden) return;
    const label = cover.querySelector(".identity")?.textContent || "";
    watch.disconnect();
    if (!/^US\s*·/.test(label)) return;
    const field = [...cover.querySelectorAll(".facts dt")].find(dt => dt.textContent.trim() === "출원번호");
    const value = (field?.nextElementSibling?.textContent || "").toUpperCase().replace(/[\s,/-]/g, "");
    const query = document.getElementById("number")?.value.trim().toUpperCase() || "";
    const explicit = /^(?:US\s*)?(\d{2})\/(\d{3}),?(\d{3})$/.exec(query);
    const serial = /^(?:US)?(?:(?:19|20)\d{2})?(\d{8})$/.exec(value)?.[1]
      || (explicit && explicit.slice(1).join(""))
      || (document.getElementById("numberType")?.value === "application" && /^(?:US\s*)?(\d{8})$/.exec(query)?.[1]);
    if (!serial) {
      notice("미국 출원번호를 확인할 수 없어 ZIP 다운로드를 시작하지 못했습니다.");
      return;
    }
    const ticket = crypto.randomUUID();
    job = {ticket, application: serial};
    downloading(true);
    chrome.runtime.sendMessage({type: "start", application: serial, ticket}).then(answer => {
      if (job?.ticket !== ticket) return;
      if (!answer?.started) throw new Error();
      if (!job.received) notice("출원 " + serial + "의 ZIP을 내려받은 뒤 이 리포트의 선택 목록에 추가합니다. 두 탭을 열어 두세요.");
    }).catch(() => {
      if (job?.ticket === ticket) {
        downloading(false);
        notice("EZ Patents 탭을 열지 못했습니다. 브라우저의 확장 기능을 확인하세요.");
      }
    });
  });
  function reset() {
    job = undefined;
    waiting.disconnect();
    watch.disconnect();
  }
  function arm() {
    reset();
    previousCover = result.querySelector(".dossier-cover");
    watch.observe(result, {childList: true, subtree: true});
  }
  form.addEventListener("submit", event => {
    if (event.isTrusted && form.elements.mode?.value === "api") {
      if (form.querySelector("#search")?.textContent.trim() === "특허 찾기") reset();
      else arm();
    }
  }, true);
  result.addEventListener("click", event => {
    if (event.isTrusted && (event.target.closest("[data-prepare-case]") || event.target.closest("button")?.textContent.trim() === "리포트 만들기")) arm();
  }, true);
  document.addEventListener("click", event => {
    if (event.target.closest("#example,#reviewed-case,#back-search")) reset();
  }, true);
  form.addEventListener("change", event => {
    if (event.target.name === "mode") reset();
  });
})();

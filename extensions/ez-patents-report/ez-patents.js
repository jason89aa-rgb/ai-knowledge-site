(async () => {
  if (location.pathname !== "/") return;
  const job = await chrome.runtime.sendMessage({type: "take"});
  if (!/^\d{8}$/.test(job?.application || "")) return;
  const input = document.getElementById("appNumber");
  const fetchButton = document.getElementById("fetchBtn");
  const zipButton = document.getElementById("downloadAllBtn");
  const fail = () => chrome.runtime.sendMessage({type: "failed"}).catch(() => {});
  if (!input || !fetchButton || !zipButton) { await fail(); return; }
  input.value = job.application;
  input.dispatchEvent(new Event("input", {bubbles: true}));
  const observer = new MutationObserver(check);
  const timer = setTimeout(() => { stop(); void fail(); }, 90000);
  function stop() {
    clearTimeout(timer);
    observer.disconnect();
  }
  function check() {
    const error = document.getElementById("error");
    if (input.value !== job.application || (error?.getClientRects().length && error.textContent.trim())) { stop(); void fail(); return; }
    const count = /^(\d+) of (\d+) documents/i.exec(document.getElementById("stats")?.textContent.trim() || "");
    if (!count || !zipButton.getClientRects().length || zipButton.disabled) return;
    stop();
    if (!Number(count[1]) || count[1] !== count[2]) { void fail(); return; }
    // The viewer already holds the complete ZIP in a blob URL when it clicks
    // its download link. Open that blob before the viewer revokes the URL.
    function capture(event) {
      const anchor = event.target.closest?.("a[download]");
      if (anchor?.download !== job.application + "_file_history.zip" ||
          !anchor.href.startsWith("blob:" + location.origin + "/")) return;
      document.removeEventListener("click", capture, true);
      fetch(anchor.href).then(response => {
        if (!response.ok) throw new Error();
        return response.blob();
      }).then(blob => chrome.runtime.sendMessage({type: "archive", blob})).catch(fail);
    }
    document.addEventListener("click", capture, true);
    zipButton.click();
  }
  observer.observe(document.body, {childList: true, subtree: true, attributes: true, characterData: true});
  fetchButton.click();
  check();
})();

const reportOrigin = "https://ai-all.co.kr";
const viewer = "https://ez-patents.com/";
const jobKey = id => "zip-tab-" + id;

async function handle(message, sender) {
  if (!sender.tab || sender.frameId !== 0) return;
  const url = new URL(sender.url);
  if (message.type === "start" && url.origin === reportOrigin &&
      /^\/patent-review(?:\.html)?\/?$/.test(url.pathname) && /^\d{8}$/.test(message.application) &&
      /^[a-f\d-]{36}$/.test(message.ticket)) {
    const tab = await chrome.tabs.create({url: "about:blank", active: false, openerTabId: sender.tab.id});
    try {
      await chrome.storage.session.set({[jobKey(tab.id)]: {
        application: message.application, ticket: message.ticket,
        reportTab: sender.tab.id, reportDocument: sender.documentId
      }});
      await chrome.tabs.update(tab.id, {url: viewer});
    } catch (error) {
      await chrome.tabs.remove(tab.id).catch(() => {});
      throw error;
    }
    return {started: true};
  }
  if (url.origin === new URL(viewer).origin && url.pathname === "/") {
    const key = jobKey(sender.tab.id);
    const job = (await chrome.storage.session.get(key))[key];
    if (!job) return;
    if (message.type === "take" && !job.viewerDocument) {
      await chrome.storage.session.set({[key]: {...job, viewerDocument: sender.documentId}});
      return {application: job.application};
    }
    if (job.viewerDocument !== sender.documentId || !["archive", "failed"].includes(message.type)) return;
    if (message.type === "archive" && (!(message.blob instanceof Blob) || !message.blob.size)) return;
    await chrome.storage.session.remove(key);
    return chrome.tabs.sendMessage(job.reportTab, {
      type: message.type, application: job.application, ticket: job.ticket, blob: message.blob
    }, {documentId: job.reportDocument});
  }
}

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  handle(message, sender).then(value => reply(value ?? null), () => reply({error: true}));
  return true;
});
chrome.tabs.onRemoved.addListener(id => { void chrome.storage.session.remove(jobKey(id)); });

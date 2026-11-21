"use strict";

function reviewedUsCase() {
  const application = "18/494,796";
  const documents = [
    ["2024-05-16", "Non-Final Rejection", "LW6GG0CPGREENX7"],
    ["2024-08-16", "Applicant Arguments / Remarks Made in an Amendment", "M02LGTDHWFYBM27"],
    ["2024-08-16", "Claims", "M02LGTDFWFYBM27"],
    ["2024-08-16", "Terminal Disclaimer", "LZX3I5DKWFYBX50"],
    ["2024-08-17", "Terminal Disclaimer review decision", "LZYJXULTWFYBX98"],
    ["2024-08-29", "Notice of Allowance and Fees Due (PTOL-85)", "M0D1CQVJWFYGX53"],
    ["2024-12-10", "Notice of Allowance and Fees Due (PTOL-85)", "M4CP76YBWFYGX62"],
  ].map(([date, title, id]) => ({ date, title, id }));
  const docket = { label: "USPTO 공식 문서 목록", url: "https://patentcenter.uspto.gov/applications/18494796/ifw/docs" };
  const espacenet = { label: "Espacenet에서 이 특허 열기", url: "https://worldwide.espacenet.com/patent/search?q=pn%3DUS12198599B2" };
  const claims = Array.from({ length: 19 }, (_, index) => index + 1);
  function finding(index, role, text, locator, extra = {}) {
    const doc = documents[index];
    return { id: doc.id, title: doc.title, source: "USPTO 심사철", text, evidence: [
      { roundDate: "2024-05-16", documentDate: doc.date, claims, role, text, locator, ...extra },
    ] };
  }
  const summaries = [
    finding(0, "examiner", "심사관은 제1~19항을 모특허 US 11,837,142의 제1항, 제3~18항, 제20항과 함께 비교했다. 이 출원의 청구범위가 더 넓고 특허성 측면에서 구별되지 않는다는 이유로 비법정 이중특허 거절을 제기했다.", "PDF p. 4"),
    finding(1, "applicant", "출원인은 같은 날 제출한 terminal disclaimer를 근거로 이중특허 거절을 철회해 달라고 요청했다.", "PDF p. 1"),
    { id: documents[3].id, title: documents[3].title, source: "USPTO 심사철 · PDF p. 1",
      text: "출원인은 모특허의 존속기간을 초과하는 부분을 포기하고, 두 특허의 소유자가 같은 기간에만 이 특허의 권리를 행사할 수 있다는 조건을 수락했다." },
    finding(5, "outcome", "심사관은 terminal disclaimer로 이중특허 문제가 해소됐다고 기재하고 제1~19항을 모두 허여했다.", "PDF pp. 5–6",
      { finalDisposition: true }),
    finding(6, "outcome", "2024-11-27 제출된 정보공개서(IDS)를 검토한 뒤에도 제1~19항의 허여가 유지됐다.", "PDF p. 2"),
  ];
  const events = [
    ["2023-10-26", "계속출원", "출원", "모출원 US 17/638,836에서 이어진 출원"],
    ["2024-03-07", "출원 공개", "공개", "US 2024/0078956 A1"],
    ["2024-05-16", "비최종 거절이유 통지", "심사관", "제1~19항에 대한 이중특허 거절"],
    ["2024-08-16", "의견서·권리기간 포기서 제출", "출원인", "Terminal disclaimer를 근거로 거절 철회 요청"],
    ["2024-08-17", "권리기간 포기서 승인", "심사관", "Terminal disclaimer 승인 기록"],
    ["2024-08-29", "허여 통지", "심사관", "제1~19항 허여"],
    ["2024-11-29", "등록료 납부", "출원인", ""],
    ["2024-12-10", "정정 허여 통지", "심사관", "추가 IDS 검토 후 허여 유지"],
    ["2025-01-14", "특허 등록", "등록", "US 12,198,599 B2"],
  ].map(([date, title, kind, detail]) => ({ date, title, kind, detail }));
  return {
    reviewed: true, country: "US", query: "US12198599B2", application, grant: "US 12,198,599 B2",
    publication: "US 2024/0078956 A1", title: "Array substrate and display device",
    applicants: "BOE Technology Group Co., Ltd.", inventors: "Long Han, Libin Liu, Lujiang Huangfu",
    status: "특허 등록", filed: events[0].date, published: events[1].date, granted: events.at(-1).date,
    source: "저장된 검토 사례 · USPTO 공개 심사철", reviewedAt: "2026-11-20", espacenet, events, documents, summaries,
    takeaway: "제1~19항에 제기된 이중특허 거절은 출원인이 모특허와 연계한 terminal disclaimer를 제출하면서 해소됐다. 심사관은 19개 항을 모두 허여했다. "
      + "그 대가로 이 특허는 모특허 US 11,837,142보다 오래 존속할 수 없고(예상 만료일 2041-02-04, WINTELIPS 기준), 두 특허를 같은 권리자가 보유할 때만 권리를 행사할 수 있다.",
    notes: ["선별한 주요 절차와 원문을 수록했습니다. 날짜는 미국 현지 서류 기준입니다. 담당 심사관은 Kenneth B. Lee Jr.이며 심사 부서는 Art Unit 2625입니다."],
    family: [{ country: "US", application: "17/638,836", publication: "US11837142B2", relation: "모출원 · 계속출원 관계" }],
    links: [espacenet, docket,
      { label: "등록공보", url: "https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/12198599" }],
  };
}

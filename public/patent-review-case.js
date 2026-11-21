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
  // WINTELIPS family, continuity and representative claims as retrieved on 2026-11-21.
  const pct = { application: "PCT-CN2021-075289", filed: "2021-02-04", publication: "WO2022-165712 A1" };
  const us = (application, filed, type = "Continuation") => ({ country: "US", application, filed, type });
  const member = (country, number, kind, date, detail, subject = false) => ({
    country, number, kind, date, title: "Array substrate and display device", subject,
    detail: { parents: [], children: [], provisionals: [], original: [], priorities: [], claimLanguage: country === "DE" ? "US" : "KR", ...detail },
  });
  const familyAnalysis = {
    status: "done", total: 7, source: "WINTELIPS · 2026-11-21 조회 · 대표청구항은 WINTELIPS 제공 문안(국문 번역 포함)이며, 비교는 검토자가 대표청구항 문언을 대조해 작성했습니다.",
    members: [
      member("WO", "WO2022-165712", "A1", "2022-08-11", { application: "PCT-CN2021-075289", filed: "2021-02-04" }),
      member("CN", "115191036", "B", "2025-04-04", { application: "2021-80000156", filed: "2021-02-04", pct, claim: [
        "1. 복수의 화소 셀이 배열된 어레이 기판으로서, 상기 화소 셀은 복수의 서브 화소를 포함하고, 상기 어레이 기판은 복수의 서브 화소를 포함하는, 어레이 기판:",
        "복수의 초기화 신호선은, 기판 상에 설치된 도전층이 제1 방향으로 연장되고 제2 방향으로 간격을 두고 배열되고, 각 상기 서브 화소에 초기화 신호를 제공하기 위한 것이다; 상기 제1 방향과 제2 방향이 교차한다;",
        "복수의 접속선은, 상기 기판 상에 설치된 다른 도전층이, 상기 제2 방향으로 연장되고 또한 상기 제1 방향을 따라 간격을 두고 배열된다;",
        "여기서, 적어도 하나의 상기 초기화 신호선과 적어도 하나의 상기 접속선의 상기 기판 상의 투영은 모두 교차하고, 상기 초기화 신호선과 상기 접속선의 상기 기판 상의 투영이 격자형 구조를 형성하도록 비아를 통해 접속된다;",
        "상기 어레이 기판은 기판과, 상기 기판 상에 순차적으로 적층된 제1 게이트 라인층, 제2 게이트 라인층, 소스 드레인층, 양극층을 포함한다; 상기 제1 방향은 행 방향이고, 상기 제2 방향은 열 방향이다;",
        "상기 초기화 신호선은 상기 제2 게이트층에 설치된다;",
        "상기 접속선은 상기 소스 드레인층 또는 양극층에 설치된다;",
        "상기 어레이 기판은 또한 포함한다:",
        "복수의 주사선은, 상기 제1 게이트선층에 설치되고, 상기 행 방향을 따라 연장되고 또한 열 방향을 따라 간격을 두고 배열되어, 각 상기 서브 화소에 주사 신호를 제공하기 위한 것이다;",
        "복수의 리셋 신호선은, 상기 제1 게이트 라인층에 설치되고, 상기 행 방향으로 연장되고 또한 열 방향으로 간격을 두고 배열되어, 각 상기 서브 화소에 리셋 신호를 제공하기 위한 것이다;",
        "상기 서브 픽셀 영역 내에서, 상기 리셋 신호선과 상기 상위 서브 픽셀의 주사선은 일체로 연결된다;",
        "초기화 신호 라인의 기판 상의 투영은 리셋 신호 라인의 투영과 교차한다;",
        "상기 초기화 신호선은 복수의 세그먼트가 서로 이격된 신호 세그먼트를 포함하고, 각각의 상기 신호 세그먼트는 각각의 상기 화소 유닛에 일대일 대응한다;",
        "여기서, 각각의 상기 신호 세그먼트는 대응하는 상기 화소 유닛 내의 적어도 하나의 상기 서브 화소 영역 내에서 상기 리셋 신호선의 투영과 중첩되지 않고, 나머지 상기 서브 화소 영역 내에서 상기 리셋 신호선의 투영과 교차한다.",
      ].join("\n") }),
      member("DE", "11-2021-001197", "T5", "2022-12-22", { application: "11-2021-001197", filed: "2021-02-04", pct, claim:
        "Array substrate comprising a plurality of pixel units arranged in an array, each of the pixel units comprising a plurality of sub-pixels, the array substrate comprising: a plurality of initialization signal lines disposed in a conductive layer, extending along a first direction and spaced apart from one another along a second direction and used for providing initialization signals to the individual sub-pixels, the first direction intersecting the second direction; and a plurality of connection lines arranged in another conductive layer, extending along the second direction and spaced from each other along the first direction; wherein projections of at least one of the initialization signal lines and at least one of the connection lines on the base substrate intersect and the at least one of the initialization signal lines and the at least one of the connection lines are connected by a through hole, so that the projections of the initialization signal lines and the connection lines on the base substrate have a grid-like structure form." }),
      member("US", "11837142", "B2", "2023-12-05", { application: "17/638836", filed: "2021-02-04", pct, children: [us("18/494796", "2023-10-26")], claim: [
        "1. 어레이 기판:",
        "어레이로 배열된 복수의 픽셀 유닛, 각 픽셀 유닛은 복수의 서브 픽셀을 포함한다, 여기에서 상기 어레이 기판은 포함한다:",
        "베이스 기판 상의 도전층에 배치된 복수의 초기화 신호 라인, 제 1 방향을 따라 연장되고 제 2 방향을 따라 간격을 두고 배열되고, 서브 픽셀에 초기화 신호를 제공하기 위해 사용된다, 여기에서 상기 제 1 방향은 상기 제 2 방향과 교차한다; 및",
        "베이스 기판 상의 다른 도전층에 배치되는 복수의 연결선, 상기 제 2 방향을 따라 연장되고, 상기 제 1 방향을 따라 간격을 두고 배열된다;",
        "상기 초기화 신호 라인들 중 적어도 하나와 상기 베이스 기판 상의 상기 연결 라인들 중 적어도 하나의 돌출부는 교차한다, 상기 초기화 신호 라인들 및 상기 적어도 하나의 연결 라인들 중 적어도 하나는 비아 홀을 통해 연결된다, 따라서, 초기화 신호 라인들 및 기판 상의 연결 라인들의 돌기들이 격자-유사 구조를 형성한다;",
        "상기 어레이 기판은 상기 베이스 기판과 제 1 게이트 라인 층, 제 2 게이트 라인 층을 포함한다, 상기 베이스 기판 상에 순차적으로 적층된 소스 및 드레인 층, 및 상기 제 1 방향은 행 방향이다, 상기 제 2 방향은 열 방향이다;",
        "상기 복수의 초기화 신호 라인은 상기 제 2 게이트 층에 배치된다; 및",
        "상기 복수의 연결 라인은 상기 소스 및 드레인 층 또는 상기 애노드 층에 배치된다.",
      ].join("\n") }),
      member("US", "12198599", "B2", "2025-01-14", { application: "18/494796", filed: "2023-10-26",
        parents: [us("17/638836", "2021-02-04")], children: [us("18/962357", "2024-11-27")], claim: [
          "1. 어레이로 배열된 복수의 픽셀 유닛을 포함하는 어레이 기판, 상기 각 픽셀 유닛은 복수의 서브 픽셀을 포함하며, 여기에서 상기 어레이 기판은 복수의 서브 픽셀을 포함한다:",
          "베이스 기판 상의 전도 층에 배열되고, 제 1 방향을 따라 간격을 두고 배열되고 제 2 방향을 따라 연장되는 복수의 전원 라인이 상기 서브 화소에 전원 신호를 제공하기 위해 사용된다; 그리고",
          "다른 도전층에 배열되고, 상기 제 2 방향을 따라 간격을 두고 배열되고 상기 제 1 방향을 따라 연장되는 복수의 전력 리드가 배열된다;",
          "상기 전원 라인 중 적어도 하나와 상기 베이스 기판 상의 상기 전원 리드 중 적어도 하나의 돌출부가 교차하고, 상기 전원 라인 중 상기 적어도 하나와 상기 전원 리드 중 상기 적어도 하나는 비아 홀을 통해 연결되고, 상기 베이스 기판 상의 상기 전원 라인과 상기 전원 리드의 돌출부는 그리드 유사 구조를 형성한다.",
        ].join("\n") }, true),
      member("US", "12469425", "B2", "2025-11-11", { application: "18/962357", filed: "2024-11-27",
        parents: [us("17/638836", "2021-02-04"), us("18/494796", "2023-10-26")], children: [us("19/357267", "2025-10-14")], claim: [
          "1. 어레이로 배열된 복수의 픽셀 유닛을 포함하는 어레이 기판, 상기 각 픽셀 유닛은 복수의 서브 픽셀을 포함한다, 어레이 기판 포함:",
          "베이스 기판 상의 전도 층에 배열되고, 제 1 방향을 따라 연장되고 제 2 방향을 따라 간격을 두고 배열된 복수의 초기화 신호 라인, 상기 서브 픽셀에 초기화 신호를 제공하기 위해 사용되며, 여기에서 상기 제 1 방향은 상기 제 2 방향과 교차한다; 그리고",
          "상기 베이스 기판 상의 다른 전도 층에 배열되고, 상기 제 2 방향을 따라 연장되고 상기 제 1 방향을 따라 간격을 두고 배열된 복수의 연결 라인;",
          "상기 초기화 신호 라인 중 적어도 하나와 상기 베이스 기판 상의 상기 연결 라인 중 적어도 하나의 돌출부는 교차한다, 초기화 신호 라인들 중 적어도 하나와 연결 라인들 중 적어도 하나는 비아 홀을 통해 연결된다, 초기화 신호 라인들과 기판 상의 연결 라인들의 돌출부들이 격자형 구조를 형성하도록 한다;",
          "상기 어레이 기판은 상기 어레이 기판을 더 포함한다: 복수의 전원 라인, 여기에서 상기 복수의 전원 라인과 상기 복수의 연결 라인은 동일한 층에 배열된다, 상기 복수의 전원 라인은 상기 제 1 방향을 따라 간격을 두고 배열되고 상기 제 2 방향을 따라 연장된다, 서브 픽셀에 전원 신호를 제공하기 위해 사용된다;",
          "상기 연결 라인 중 하나와 동일한 열의 상기 전원 라인 중 하나는 모두 상기 제 2 방향을 따라 연장되고 상기 연결 라인 중 상기 하나와 상기 베이스 기판 상의 동일한 열의 상기 전원 라인 중 하나의 상기 제 1 방향 및 직교 투영을 따라 순차적으로 배열된다.",
        ].join("\n") }),
      member("US", "12776239", "B2", "2026-10-27", { application: "19/357267", filed: "2025-10-14",
        parents: [us("17/638836", "2021-02-04"), us("18/494796", "2023-10-26"), us("18/962357", "2024-11-27")], claim: [
          "1. 다수의 픽셀 유닛이 배열된 어레이 기판으로서, 각 픽셀 유닛은 다수의 서브 픽셀을 포함하며, 상기 어레이 기판은 다음을 포함한다:",
          "베이스 기판 상에 전도층으로 배치되고, 제1 방향으로 연장되며, 제2 방향으로 간격을 두고 배치된 다수의 초기화 신호선은 서브 픽셀에 초기화 신호를 제공하는 데 사용되며, 제1 방향과 제2 방향은 서로 교차한다; 그리고",
          "어레이 기판은 또한 다음을 포함한다: 기저 기판 상의 다른 전도층에 배치된 다수의 전력선으로서, 상기 다수의 전력선은 제1 방향으로 간격을 두고 배치되어 제2 방향으로 연장되며, 서브 픽셀에 전력 신호를 제공하는 데 사용된다;",
          "어레이 기판은 또한 다음을 포함한다:",
          "다수의 전원 배선이 포함되며, 상기 다수의 전원 배선과 다수의 초기화 신호선은 동일한 층에 배치되고, 상기 다수의 전력 배선은 첫 번째 방향으로 연장되며 두 번째 방향으로 배치되며, 동일한 행의 초기화 배선 중 하나와 전력 배선 중 하나의 직교 투영은 기판 상에서 서로 겹치지 않는다;",
          "기저 기판 상에서 적어도 하나의 전력선과 적어도 하나의 전력 배선의 투영이 교차하고, 상기 적어도 하나의 전력선 및 상기 적어도 하나의 전력 배선은 비아 홀을 통해 연결되며, 상기 전력선 및 전력 배선의 기저 기판 상으로의 투영은 격자형 구조를 형성한다.",
        ].join("\n") }),
    ],
    comparisons: Object.fromEntries([
      ["CN:115191036:B", "일부 겹침", "두 층의 교차 배선을 비아로 연결해 격자 구조를 만든다는 점은 같지만, CN은 초기화 신호선·접속선의 격자이고 조사 대상은 전원 라인·전원 리드의 격자다. CN은 게이트층·소스드레인층 배치와 주사선·리셋 신호선, 화소별 신호 세그먼트까지 한정한다.",
        ["초기화 신호선·접속선 격자", "게이트층·소스드레인층 배치", "주사선·리셋 신호선", "화소별 신호 세그먼트"], ["전원 라인·전원 리드 격자"]],
      ["DE:11-2021-001197:T5", "일부 겹침", "초기화 신호선과 연결선의 격자 구조만 한정한 넓은 청구항이다. 격자 구조라는 점은 같지만 조사 대상의 전원 라인·전원 리드와는 배선 종류가 다르다.",
        ["초기화 신호선·연결선 격자"], ["전원 라인·전원 리드 격자"]],
      ["US:11837142:B2", "일부 겹침", "모특허도 다른 도전층의 교차 배선을 비아로 연결한 격자 구조이지만, 대상 배선이 초기화 신호 라인과 연결선이다. 모특허는 제2 게이트층과 소스·드레인층 배치까지 한정한다.",
        ["초기화 신호 라인·연결선 격자", "제2 게이트층·소스드레인층 배치"], ["전원 라인·전원 리드 격자"]],
      ["US:12469425:B2", "일부 겹침", "초기화 신호 라인·연결 라인 격자를 기본으로 하고 전원 라인을 연결 라인과 같은 층에 추가 배치한다. 조사 대상의 전원 리드와 전원 라인 격자 구조는 없다.",
        ["초기화 신호 라인·연결 라인 격자", "연결 라인과 같은 층의 전원 라인 배열"], ["전원 리드", "전원 라인·전원 리드 격자"]],
      ["US:12776239:B2", "더 좁음", "조사 대상처럼 전력선과 전원 배선(전원 리드)을 비아로 연결한 격자 구조를 갖추고, 초기화 신호선과 그 신호선과 같은 층에 겹치지 않게 놓인 전원 배선 조건을 더 한정한다.",
        ["초기화 신호선", "전원 배선과 초기화 신호선의 동일 층·비중첩 배치"], []],
    ].map(([id, verdict, summary, onlyMember, onlySubject]) => [id, { id, verdict, summary, onlyMember, onlySubject }])),
  };
  return {
    reviewed: true, country: "US", query: "US12198599B2", application, familyAnalysis, grant: "US 12,198,599 B2",
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

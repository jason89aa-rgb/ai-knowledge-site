"use strict";

(() => {
  const ink = "172E45";
  const blue = "1459AE";
  const muted = "52657B";
  const fontFace = "Malgun Gothic";
  const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  const cleaned = value => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();

  function wrap(text, max) {
    const lines = [];
    for (const paragraph of cleaned(text).split("\n")) {
      let line = "";
      let length = 0;
      for (const char of paragraph) {
        const width = /[\u0000-\u00FF]/.test(char) ? .62 : 1;
        if (length + width > max) { lines.push(line); line = ""; length = 0; }
        line += char;
        length += width;
      }
      lines.push(line);
    }
    return lines;
  }

  function makeDeck(Pptx, report, retrieved, facts) {
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "AI-ALL";
    pptx.title = cleaned(report.title || report.query || "특허 심사 리포트");
    pptx.lang = "ko-KR";
    pptx.theme = { headFontFace: fontFace, bodyFontFace: fontFace, lang: "ko-KR" };

    function text(slide, content, x, y, w, h, style = {}) {
      slide.addText(cleaned(content), { x, y, w, h, fontFace, color: ink, fontSize: 16, margin: 0, valign: "mid", ...style });
    }

    function page(title) {
      const slide = pptx.addSlide();
      slide.background = { color: "FFFFFF" };
      slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: .12, line: { transparency: 100 }, fill: { color: blue } });
      text(slide, title, .64, .43, 12, .62, { fontSize: 28, bold: true });
      text(slide, [report.demo ? "가상 예시" : report.query, report.source, retrieved].filter(Boolean).join("  ·  "), .64, 7.03, 11.8, .25,
        { fontSize: 9, color: muted });
      slide.addShape(pptx.ShapeType.line, { x: .64, y: 6.9, w: 12.02, h: 0, line: { color: "D8E2ED", width: 1 } });
      return slide;
    }

    function slidesForText(section, content, subtitle = "") {
      const blocks = chunks(wrap(content, 53), 12);
      blocks.forEach((lines, index) => {
        const slide = page(section + (blocks.length > 1 ? ` (${index + 1}/${blocks.length})` : ""));
        if (subtitle) text(slide, wrap(subtitle, 73).slice(0, 2).join("\n"), .65, 1.23, 12.03, .55,
          { fontSize: 13, color: blue, bold: true });
        lines.forEach((line, i) => text(slide, line, .65, 1.89 + i * .398, 12.03, .36, { fontSize: 16 }));
      });
    }

    function tabulate(title, headers, rows, widths) {
      if (!rows.length) return;
      const groups = [[]];
      let available = 5;
      for (const row of rows) {
        const cells = row.map((value, i) => wrap(cleaned(value) || "—", Math.max(4, Math.floor((widths[i] - .2) * 5.2))));
        const tallest = Math.max(...cells.map(cell => cell.length));
        for (let offset = 0; offset < tallest; offset += 12) {
          const height = Math.min(12, tallest - offset) * .26 + .15;
          if (height > available) { groups.push([]); available = 5; }
          groups.at(-1).push(cells.map(cell => cell.slice(offset, offset + 12).join("\n")));
          available -= height;
        }
      }
      groups.forEach((group, index) => {
        const slide = page(title + (groups.length > 1 ? ` (${index + 1}/${groups.length})` : ""));
        slide.addTable([
          headers.map(name => ({ text: name, options: { bold: true, color: "FFFFFF", fill: { color: blue } } })),
          ...group.map((row, i) => row.map(value => ({
            text: cleaned(value) || "—",
            options: { fill: { color: i % 2 ? "F1F5FA" : "FFFFFF" } },
          }))),
        ], { x: .64, y: 1.34, w: 12.04, colW: widths, margin: [4, 6, 4, 6], fontFace, color: ink,
          fontSize: 12, border: { color: "D9E4EE", pt: .5 }, autoPage: false });
      });
    }

    const cover = page(report.country === "UPC" ? "UPC 사건 리포트" : "특허 심사 리포트");
    const title = wrap(pptx.title, 29);
    text(cover, title.slice(0, 3).join("\n"), .65, 1.25, 12.02, 1.62, { fontSize: 27, bold: true, valign: "top" });
    const overview = facts.filter(([key]) => report[key]);
    for (const [i, [key, label]] of overview.slice(0, 9).entries()) {
      const x = .65 + (i % 3) * 4.03;
      const y = 3.02 + Math.floor(i / 3) * 1.01;
      text(cover, label, x, y, 3.85, .24, { fontSize: 11, color: blue, bold: true });
      const lines = wrap(report[key], 24);
      text(cover, lines.slice(0, 3).join("\n") + (lines.length > 3 ? "…" : ""), x, y + .28, 3.85, .64,
        { fontSize: 12, valign: "top" });
    }
    if (title.length > 3 || overview.some(([key]) => wrap(report[key], 24).length > 3) || report.abstract) {
      slidesForText("서지 상세", [pptx.title, ...overview.map(([key, label]) => label + "  " + report[key]), report.abstract].filter(Boolean).join("\n\n"));
    }
    if (report.conclusion) slidesForText("심사 결과 보고서", report.conclusion.text + (report.conclusion.partial ? "\n\n일부 출력" : ""));
    if (report.procedureRows?.length) tabulate("절차별 쟁점과 대응", ["심사 절차", "청구항", "구분", "쟁점과 판단", "근거"], report.procedureRows, [2.35, 1.3, 1.3, 4.34, 2.75]);
    if (report.timelineRows) tabulate("주요 심사 타임라인", ["날짜", "심사 단계", "근거 기록"], report.timelineRows, [1.7, 3.25, 7.09]);
    tabulate("패밀리 및 연계 출원", ["관할", "공개·등록번호", "출원번호", "조회 관계", "일자"],
      report.family.map(row => [row.country, row.publication, row.application, row.relation, row.date]), [1.05, 2.65, 2.53, 4.02, 1.79]);
    if (!report.timelineRows) tabulate("심사·행정 이력", ["날짜", "기록", "상태·구분", "문서번호·코드"],
      report.events.map(row => [row.date, row.title, row.detail, row.id]), [1.6, 5.52, 2.62, 2.3]);
    tabulate("심사 문서", ["날짜", "문서", "식별자", "원문"],
      report.documents.map(row => [row.date, row.title, row.id, row.downloadable ? "기관 PDF" : "공식 열람처 참조"]), [1.6, 5.43, 2.91, 2.1]);
    for (const summary of report.summaries) {
      slidesForText("문서 요약", [summary.text, summary.partial && "요약이 불완전합니다.",
        summary.evidenceIncomplete && "청구항 근거 추출이 불완전합니다."].filter(Boolean).join("\n\n"),
        [summary.title, summary.id, summary.source, summary.model].filter(Boolean).join(" · "));
    }
    if (!report.summaries.length) slidesForText("문서 요약", "이 보고서에 포함된 문서 요약이 없습니다.");
    if (report.links.length || report.notes.length) {
      for (const sources of chunks(report.links, 8)) {
        const slide = page("공식 열람처");
        sources.forEach((source, i) => {
          const url = new URL(source.url);
          if (url.protocol === "https:") {
            text(slide, source.label, .65, 1.35 + .62 * i, 12, .5, { color: blue, hyperlink: { url: url.href } });
          }
        });
      }
      if (report.notes.length) slidesForText("조회 범위", report.notes.join("\n\n"));
    }
    return pptx;
  }

  if (typeof module !== "undefined" && module.exports) module.exports = { makeDeck };
  if (typeof window !== "undefined") {
    window.exportPatentPptx = async (report, retrieved, facts, download) => {
      const pptx = makeDeck(window.PptxGenJS, report, retrieved, facts);
      const blob = await pptx.write({ outputType: "blob", compression: true });
      const slug = (report.query || "").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
      download(blob, slug ? `특허-심사-리포트-${slug}.pptx` : "특허-문서-요약.pptx");
    };
  }
})();

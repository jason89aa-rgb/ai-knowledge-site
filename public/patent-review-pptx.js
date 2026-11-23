"use strict";

(() => {
  const fontFace = "Malgun Gothic";
  const color = { deep: "102B3C", teal: "165563", mint: "A5DFD6", soft: "C4D6DC", ink: "192C42", muted: "52657B", line: "D9E3EE", paper: "F2F6FB", white: "FFFFFF" };
  // The colours the report page gives each party, so a slide reads like the page it was exported from.
  const tones = {
    exam: { main: "955321", tint: "FBF3EA", label: "심사관 통지·거절" },
    appl: { main: "235F91", tint: "EEF4FA", label: "출원인 대응·보정" },
    out: { main: "176B56", tint: "EAF5F0", label: "허여·등록·결정" },
    appeal: { main: "6E5191", tint: "F3EEF8", label: "불복·심판" },
    plain: { main: "62768B", tint: "EEF2F6", label: "그 밖의 절차" },
  };
  const added = { color: "0F5B45", bold: true, highlight: "CFEBDD" };
  const removed = { color: "B42318", strike: "sngStrike" };
  const top = 1.72;
  const bottom = 6.86;
  const chunks = (rows, size) => Array.from({ length: Math.ceil(rows.length / size) }, (_, i) => rows.slice(i * size, (i + 1) * size));
  const cleaned = value => String(value ?? "").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, "").trim();
  const numbered = (title, index, total) => title + (total > 1 ? ` (${index + 1}/${total})` : "");
  const lineHeight = pt => pt * 1.26 / 72;

  // Width of a text in ems. PowerPoint does the real wrapping; this only tells how many lines a box will need.
  function ems(text) {
    let total = 0;
    for (const char of text) total += char === " " ? .28 : /[\u0000-\u00FF]/.test(char) ? .5 : 1;
    return total;
  }

  // Lines keep their trailing space, so joining them gives the text back.
  function wrap(text, width, pt) {
    const limit = width * 72 / pt * .93;
    const lines = [];
    for (const paragraph of cleaned(text).split("\n")) {
      let line = "";
      let used = 0;
      for (const token of paragraph.match(/[ \t]+|[!-\u00FF]+|[^\u0000-\u00FF]/g) || []) {
        // A run with no break in it that is longer than a line is broken by character.
        for (const piece of ems(token) > limit ? [...token] : [token]) {
          const size = ems(piece);
          if (used + size > limit && line) {
            lines.push(line);
            line = "";
            used = 0;
            if (!piece.trim()) continue;
          }
          line += piece;
          used += size;
        }
      }
      lines.push(line);
    }
    return lines;
  }

  function stageTone(stage) {
    const name = String(stage || "");
    if (/Appeal|불복|심판|IPR|PGR|무효|이의|재심사|Reexam/i.test(name)) return "appeal";
    if (/거절|Rejection/i.test(name)) return "exam";
    if (/허여|등록|NoA|Allow|결정|심사 결과/i.test(name)) return "out";
    if (/출원인|대응|보정|의견서|답변|RCE|응답|Response|Amend/i.test(name)) return "appl";
    if (/통지|제한|R\/R|Advisory|심사관|검색|Search/i.test(name)) return "exam";
    return "plain";
  }

  // The written conclusion as headed sections of items. An item that opens with a date keeps the date apart, so the slide can show it as a step.
  function conclusionSections(text) {
    const sections = [];
    let item;
    for (const raw of cleaned(text).split(/\r?\n/)) {
      const line = raw.replace(/\*\*/g, "").trimEnd();
      if (!line.trim()) { item = null; continue; }
      const heading = /^\s*#{1,6}\s*(.+?)\s*[:：]?$/.exec(line);
      if (heading) {
        sections.push({ title: heading[1], items: [] });
        item = null;
        continue;
      }
      if (!sections.length) sections.push({ title: "", items: [] });
      const bullet = /^(\s*)(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
      if (bullet && bullet[1].length >= 2 && item) { item.text += "\n· " + bullet[2]; continue; }
      if (!bullet && item) { item.text += "\n" + line.trim(); continue; }
      const body = bullet ? bullet[2] : line.trim();
      const dated = /^\(?(\d{4}[-.]\d{1,2}[-.]\d{1,2})\)?\.?\s*[·:—–-]?\s*(.*)$/.exec(body);
      item = dated && dated[2] ? { date: dated[1], text: dated[2] } : { text: body };
      sections.at(-1).items.push(item);
    }
    return sections.filter(section => section.items.length);
  }

  // A long compared claim is carried over several slides; the added and removed runs stay whole words.
  function diffPages(runs, capacity, lineEms) {
    const pages = [[]];
    let used = 0;
    for (const run of runs) {
      for (const piece of run.text.match(/\s*(?:[!-\u00FF]+|[^\s\u0000-\u00FF])\s*|\s+/g) || []) {
        const size = ems(piece.replace(/\n/g, "")) + (piece.split("\n").length - 1) * lineEms * .6;
        if (used + size > capacity && pages.at(-1).length) {
          pages.push([]);
          used = 0;
        }
        const last = pages.at(-1).at(-1);
        if (last?.type === run.type) last.text += piece;
        else pages.at(-1).push({ type: run.type, text: piece });
        used += size;
      }
    }
    return pages;
  }

  function makeDeck(Pptx, report, retrieved, facts) {
    const pptx = new Pptx();
    pptx.layout = "LAYOUT_WIDE";
    pptx.author = "AI-ALL";
    pptx.title = cleaned(report.title || report.query || "특허 심사 리포트");
    pptx.lang = "ko-KR";
    pptx.theme = { headFontFace: fontFace, bodyFontFace: fontFace, lang: "ko-KR" };
    const shape = pptx.ShapeType;
    const deck = report.deck || {};
    const footer = [report.demo ? "가상 예시" : report.query, report.source, retrieved].filter(Boolean).join("  ·  ");
    let section = "";

    const put = (slide, content, x, y, w, h, style = {}) => slide.addText(typeof content === "string" ? cleaned(content) : content,
      { x, y, w, h, fontFace, color: color.ink, fontSize: 12, margin: 0, valign: "top", isTextBox: true, ...style });
    const card = (slide, x, y, w, h, fill = color.white, edge = color.line) =>
      slide.addShape(shape.roundRect, { x, y, w, h, rectRadius: Math.min(.09, h / 2), fill: { color: fill }, line: { color: edge, width: .75 } });
    const dot = (slide, x, y, size, fill, edge = fill) =>
      slide.addShape(shape.ellipse, { x, y, w: size, h: size, fill: { color: fill }, line: { color: edge, width: edge === fill ? 0 : 1.5 } });
    const rule = (slide, x, y, w, h, tint = color.line, width = 1.25) => slide.addShape(shape.line, { x, y, w, h, line: { color: tint, width } });

    function pill(slide, label, x, y, fill, ink = color.white, pt = 10, width = 0) {
      const w = width || ems(cleaned(label)) * pt / 72 + .36;
      const h = pt * .03;
      slide.addText(cleaned(label), { x, y, w, h, shape: shape.roundRect, rectRadius: h / 2, fill: { color: fill }, line: { color: fill, width: 0 },
        fontFace, fontSize: pt, bold: true, color: ink, align: "center", valign: "middle", margin: 0 });
      return w;
    }

    // Paragraphs cut to the lines a box has room for. Returns the text runs and the lines they take.
    function fit(paragraphs, width, pt, maxLines = Infinity) {
      const runs = [];
      let lines = 0;
      for (const { text, ...style } of paragraphs.flatMap(item => cleaned(item.text).split("\n").map(text => ({ ...item, text })))) {
        const room = maxLines - lines;
        if (!text.trim() || room <= 0) continue;
        const wrapped = wrap(text, width, pt);
        const cut = wrapped.length > room;
        runs.push({ text: cut ? wrapped.slice(0, room).join("").trimEnd().slice(0, -2) + "…" : text, options: { ...style, breakLine: true } });
        lines += Math.min(wrapped.length, room);
      }
      if (runs.length) runs.at(-1).options.breakLine = false;
      return { runs, lines };
    }

    function page(title, note = "") {
      const slide = pptx.addSlide();
      slide.background = { color: color.paper };
      if (section) pill(slide, section, .6, .34, color.teal, color.white, 9.5);
      put(slide, title, .6, .7, 12.13, .56, { fontSize: 23, bold: true, valign: "middle" });
      if (note) put(slide, fit([{ text: note }], 12.13, 11.5, 1).runs, .6, 1.27, 12.13, .3, { fontSize: 11.5, color: color.muted, valign: "middle" });
      put(slide, fit([{ text: footer }], 10.8, 9, 1).runs, .6, 7.08, 10.8, .25, { fontSize: 9, color: color.muted, valign: "middle" });
      slide.slideNumber = { x: 12.1, y: 7.08, w: .63, h: .25, fontFace, fontSize: 9, color: color.muted, align: "right" };
      return slide;
    }

    function backdrop(slide) {
      slide.background = { color: color.deep };
      slide.addShape(shape.ellipse, { x: 8.7, y: -2.4, w: 7.4, h: 7.4, fill: { color: color.teal }, line: { color: color.teal, width: 0 } });
      slide.addShape(shape.ellipse, { x: 10.5, y: 3.7, w: 4.8, h: 4.8, fill: { color: "1F6F7C", transparency: 30 }, line: { color: "1F6F7C", width: 0 } });
    }

    function divider(number, title, lines) {
      section = number + "  " + title;
      const slide = pptx.addSlide();
      backdrop(slide);
      put(slide, number, .8, 1.9, 3, 1.3, { fontSize: 72, bold: true, color: color.mint, valign: "middle" });
      put(slide, title, .8, 3.25, 8, .8, { fontSize: 36, bold: true, color: color.white, valign: "middle" });
      put(slide, lines.map((text, index) => ({ text, options: { breakLine: index < lines.length - 1 } })), .8, 4.25, 7.6, 1.6,
        { fontSize: 15, color: color.soft, paraSpaceAfter: 6 });
    }

    function cover() {
      const slide = pptx.addSlide();
      backdrop(slide);
      put(slide, report.country === "UPC" ? "UPC 사건 리포트" : "특허 심사 리포트", .8, .95, 7.6, .35, { fontSize: 13, bold: true, color: color.mint, charSpacing: 2, valign: "middle" });
      const size = wrap(pptx.title, 7.9, 30).length > 3 ? 24 : 30;
      const title = fit([{ text: pptx.title }], 7.9, size, 4);
      put(slide, title.runs, .8, 1.42, 7.9, title.lines * lineHeight(size) + .1, { fontSize: size, bold: true, color: color.white });
      let y = 1.42 + title.lines * lineHeight(size) + .28;
      const identity = [report.grant || report.publication || report.application, report.applicants].filter(Boolean).join("  ·  ");
      if (identity) put(slide, fit([{ text: identity }], 7.9, 14, 1).runs, .8, y, 7.9, .34, { fontSize: 14, color: color.mint, valign: "middle" });
      if (report.status) pill(slide, report.status, .8, y + .5, color.mint, color.deep, 11);
      const shown = facts.filter(([key]) => report[key] && key !== "status").slice(0, 6);
      y = Math.max(y + 1.25, 4.35);
      shown.forEach(([key, label], index) => {
        const x = .8 + (index % 3) * 2.62;
        const row = y + Math.floor(index / 3) * 1.08;
        rule(slide, x, row, 2.4, 0, "3B6472", 1);
        put(slide, label, x, row + .1, 2.4, .26, { fontSize: 10, color: color.soft, valign: "middle" });
        put(slide, fit([{ text: report[key] }], 2.4, 12.5, 2).runs, x, row + .38, 2.4, .6, { fontSize: 12.5, bold: true, color: color.white });
      });
      (deck.metrics || []).slice(0, 3).forEach(([label, value], index) => {
        put(slide, value, 9.75, 1.0 + index * 1.25, 3, .62, { fontSize: 30, bold: true, color: color.white, valign: "middle" });
        put(slide, label, 9.75, 1.6 + index * 1.25, 3, .3, { fontSize: 11, color: color.mint, valign: "middle" });
      });
      put(slide, fit([{ text: footer }], 11.8, 10, 1).runs, .8, 6.95, 11.8, .3, { fontSize: 10, color: color.soft, valign: "middle" });
    }

    function overview() {
      const slide = page("한눈에 보기", "서지사항과 심사 경과의 크기를 먼저 봅니다.");
      const metrics = (deck.metrics || []).slice(0, 4);
      const width = metrics.length ? (12.13 - (metrics.length - 1) * .2) / metrics.length : 0;
      metrics.forEach(([label, value], index) => {
        const x = .6 + index * (width + .2);
        card(slide, x, top, width, 1.2);
        put(slide, value, x + .25, top + .14, width - .5, .6, { fontSize: 26, bold: true, color: color.teal, valign: "middle" });
        put(slide, label, x + .25, top + .76, width - .5, .3, { fontSize: 11, color: color.muted, valign: "middle" });
      });
      const y = metrics.length ? top + 1.42 : top;
      const height = bottom - y;
      const picture = report.drawing;
      const shown = facts.filter(([key]) => report[key]).slice(0, 9);
      const panel = picture ? 7.7 : 12.13;
      const columns = picture ? 2 : 3;
      const rows = Math.ceil(shown.length / columns) || 1;
      card(slide, .6, y, panel, height);
      shown.forEach(([key, label], index) => {
        const w = (panel - .5) / columns;
        const x = .85 + (index % columns) * w;
        const row = y + .22 + Math.floor(index / columns) * ((height - .3) / rows);
        put(slide, label, x, row, w - .25, .26, { fontSize: 10, bold: true, color: color.teal, valign: "middle" });
        put(slide, fit([{ text: report[key] }], w - .25, 12, picture ? 1 : 2).runs, x, row + .28, w - .25, .5, { fontSize: 12 });
      });
      if (!picture) return;
      card(slide, 8.5, y, 4.23, height);
      put(slide, "대표도면", 8.72, y + .14, 3.8, .28, { fontSize: 10, bold: true, color: color.teal, valign: "middle" });
      const room = { w: 3.83, h: height - .7 };
      const scale = Math.min(room.w / picture.width, room.h / picture.height);
      const w = picture.width * scale;
      const h = picture.height * scale;
      slide.addImage({ data: picture.data.replace(/^data:/, ""), x: 8.7 + (room.w - w) / 2, y: y + .5 + (room.h - h) / 2, w, h });
    }

    function timeline() {
      const dates = new Map();
      for (const [date, stage, sources] of report.timelineRows || []) {
        if (!dates.has(date)) dates.set(date, { date, stages: [], sources: [] });
        dates.get(date).stages.push(stage);
        if (sources) dates.get(date).sources.push(sources);
      }
      const pages = chunks([...dates.values()], 6);
      pages.forEach((nodes, index) => {
        const slide = page(numbered("심사 타임라인", index, pages.length), "날짜마다 무엇이 있었는지를 왼쪽에서 오른쪽으로 읽습니다.");
        const width = 12.13 / Math.max(4, nodes.length);
        rule(slide, .6, 2.87, 12.13, 0, "B9CAD6", 2.5);
        nodes.forEach((node, at) => {
          const tone = tones[stageTone(node.stages[0])];
          const x = .6 + at * width;
          put(slide, node.date, x, 2.1, width, .4, { fontSize: 15, bold: true, align: "center", valign: "middle" });
          dot(slide, x + width / 2 - .17, 2.7, .34, tone.main, color.white);
          rule(slide, x + width / 2, 3.04, 0, .3, tone.main, 1.25);
          const names = fit(node.stages.map(text => ({ text, bold: true, color: tone.main })), width - .5, 13, 5);
          const sources = fit([{ text: node.sources.join(" · "), color: color.muted }], width - .5, 10.5, 6);
          const h = names.lines * lineHeight(13) + (sources.lines ? sources.lines * lineHeight(10.5) + .14 : 0) + .4;
          card(slide, x + .1, 3.34, width - .2, h, tone.tint, tone.main);
          put(slide, names.runs, x + .25, 3.53, width - .5, names.lines * lineHeight(13), { fontSize: 13 });
          if (sources.lines) put(slide, sources.runs, x + .25, 3.67 + names.lines * lineHeight(13), width - .5, sources.lines * lineHeight(10.5), { fontSize: 10.5 });
        });
        let x = .6;
        for (const name of ["exam", "appl", "out", "appeal", "plain"]) {
          dot(slide, x, 6.56, .16, tones[name].main);
          put(slide, tones[name].label, x + .24, 6.49, 2, .3, { fontSize: 10, color: color.muted, valign: "middle" });
          x += ems(tones[name].label) * 10 / 72 + .7;
        }
      });
    }

    // Steps down a rail, one card each, under the heading of their part. Parts follow one another on a slide as long as they fit.
    function steps(title, parts) {
      const pt = 13;
      const width = 9.85;
      const start = top - .12;
      const room = bottom - start;
      const limit = Math.floor((room - .85) / lineHeight(pt));
      const units = [];
      for (const part of parts) {
        if (part.title) units.push({ heading: part.title, tone: part.tone, height: .5 });
        for (const item of part.items) {
          const label = item.label ? wrap(item.label, width, pt) : [];
          const lines = cleaned(item.text).split("\n").flatMap(paragraph => wrap(paragraph, width, pt).map((line, at, all) => line + (at === all.length - 1 ? "\n" : "")));
          chunks([...label.map(() => null), ...lines], limit).forEach((group, at) => units.push({
            tone: part.tone, date: at ? "" : item.date, label: at ? "" : item.label, text: group.filter(line => line !== null).join("").trimEnd(),
            height: group.length * lineHeight(pt) + .32 + .12,
          }));
        }
      }
      const pages = [[]];
      let used = 0;
      units.forEach((unit, at) => {
        // A heading is not left alone at the foot of a slide.
        const needed = unit.heading ? unit.height + (units[at + 1]?.height || 0) : unit.height;
        if (used + needed > room && pages.at(-1).length) {
          pages.push([]);
          used = 0;
        }
        pages.at(-1).push(unit);
        used += unit.height;
      });
      pages.forEach((list, index) => {
        const slide = page(numbered(title, index, pages.length));
        let y = start;
        for (const unit of list) {
          if (unit.heading) {
            pill(slide, unit.heading, .6, y + .08, unit.tone.main, color.white, 11.5);
          } else {
            const h = unit.height - .12;
            rule(slide, 2.19, y, 0, unit.height, "B9CAD6", 1.5);
            dot(slide, 2.11, y + .2, .16, unit.tone.main);
            if (unit.date) pill(slide, unit.date, .6, y + .12, unit.tone.tint, unit.tone.main, 10.5, 1.36);
            card(slide, 2.45, y, 10.28, h);
            put(slide, [...(unit.label ? [{ text: unit.label, options: { bold: true, color: color.teal, breakLine: Boolean(unit.text) } }] : []),
              ...(unit.text ? [{ text: unit.text, options: {} }] : [])], 2.66, y + .16, width, h - .32, { fontSize: pt });
          }
          y += unit.height;
        }
      });
    }

    function prose(title, content, subtitle = "") {
      const pt = 13;
      const y = subtitle ? top + .42 : top;
      const pages = chunks(wrap(content, 11.6, pt), Math.floor((bottom - y - .4) / lineHeight(pt)));
      pages.forEach((lines, index) => {
        const slide = page(numbered(title, index, pages.length));
        if (subtitle) put(slide, fit([{ text: subtitle }], 12.13, 11.5, 1).runs, .6, top - .02, 12.13, .3, { fontSize: 11.5, bold: true, color: color.teal, valign: "middle" });
        card(slide, .6, y, 12.13, bottom - y);
        put(slide, lines.map((line, at) => {
          const heading = /^\s*#{1,6}\s*(.*)$/.exec(line);
          return { text: (heading ? heading[1] : line).replace(/\*\*/g, "").trimEnd() || " ",
            options: { breakLine: at < lines.length - 1, bold: Boolean(heading), color: heading ? color.teal : color.ink } };
        }), .86, y + .2, 11.6, bottom - y - .4, { fontSize: pt });
      });
    }

    function tabulate(title, headers, rows, widths) {
      if (!rows.length) return;
      const pt = 11;
      const room = bottom - top - .45;
      const groups = [[]];
      let available = room;
      for (const row of rows) {
        const cells = row.map((value, i) => wrap(cleaned(value) || "—", widths[i] - .24, pt).map(line => line.trimEnd()));
        const tallest = Math.max(...cells.map(cell => cell.length));
        for (let offset = 0; offset < tallest; offset += 14) {
          const height = Math.min(14, tallest - offset) * lineHeight(pt) + .14;
          if (height > available && groups.at(-1).length) {
            groups.push([]);
            available = room;
          }
          groups.at(-1).push(cells.map(cell => cell.slice(offset, offset + 14).join("\n")));
          available -= height;
        }
      }
      groups.forEach((group, index) => {
        const slide = page(numbered(title, index, groups.length));
        slide.addTable([
          headers.map(name => ({ text: name, options: { bold: true, color: color.white, fill: { color: color.teal } } })),
          ...group.map((row, i) => row.map(value => ({ text: cleaned(value) || "—", options: { fill: { color: i % 2 ? "F7FAFC" : color.white } } }))),
        ], { x: .6, y: top, w: widths.reduce((sum, width) => sum + width, 0), colW: widths, margin: [4, 7, 4, 7], fontFace, color: color.ink,
          fontSize: pt, valign: "top", border: { color: color.line, pt: .75 }, autoPage: false });
      });
    }

    // Every stage on one slide: what was raised, against which claims, and how it ended.
    function roadmap(stages) {
      const pages = chunks(stages.map((stage, index) => ({ ...stage, number: index + 1 })), 5);
      pages.forEach((list, index) => {
        const slide = page(numbered("심사 흐름 한눈에", index, pages.length), "통지마다 한 단계입니다. 무엇이 지적됐고 어떻게 끝났는지를 위에서 아래로 읽습니다.");
        list.forEach((stage, at) => {
          const tone = tones[stage.tone] || tones.plain;
          const y = top + .1 + at * 1.0;
          if (at < list.length - 1) rule(slide, .87, y + .55, 0, .45, "B9CAD6", 1.5);
          slide.addText(String(stage.number), { x: .6, y, w: .55, h: .55, shape: shape.ellipse, fill: { color: tone.main }, line: { color: tone.main, width: 0 },
            fontFace, fontSize: 15, bold: true, color: color.white, align: "center", valign: "middle", margin: 0 });
          put(slide, stage.date || "", 1.35, y - .04, 3.2, .26, { fontSize: 10.5, color: color.muted, valign: "middle" });
          put(slide, fit([{ text: stage.name }], 3.2, 13, 2).runs, 1.35, y + .22, 3.2, .6, { fontSize: 13, bold: true });
          const raised = fit(stage.issues.length ? stage.issues.map(issue => ({ text: "• " + [issue.title, issue.claims].filter(Boolean).join(" — ") }))
            : [{ text: "청구항별 쟁점이 분석되지 않은 단계입니다.", color: color.muted }], 4.1, 11, 4);
          card(slide, 4.7, y - .06, 4.4, .9, tone.tint, tone.tint);
          put(slide, raised.runs, 4.85, y + .02, 4.1, .76, { fontSize: 11, valign: "middle" });
          slide.addShape(shape.rightArrow, { x: 9.17, y: y + .27, w: .26, h: .24, fill: { color: "B9CAD6" }, line: { color: "B9CAD6", width: 0 } });
          const ends = stage.issues.flatMap(issue => issue.fate).filter(line => line.tone !== "advisory").map(line => line.text);
          const ended = fit([{ text: [...new Set(ends)].join(" / ") || "그 뒤의 처분은 선택한 자료에서 확인되지 않았습니다.", color: ends.length ? color.ink : color.muted }], 3.0, 10.5, 4);
          card(slide, 9.5, y - .06, 3.23, .9, ends.length ? tones.out.tint : color.white, ends.length ? tones.out.tint : color.line);
          put(slide, ended.runs, 9.62, y + .02, 3.0, .76, { fontSize: 10.5, valign: "middle" });
        });
      });
    }

    // One stage as three columns: what the examiner held, what the applicant did about it, and what became of it.
    function stageSlides(stage, number) {
      const pt = 11.5;
      const columns = [{ x: .6, tone: tones.exam, title: "심사관의 판단" }, { x: 4.78, tone: tones.appl, title: "출원인의 대응" }, { x: 8.96, tone: tones.out, title: "그 뒤" }];
      const width = 3.77;
      const inner = width - .32;
      const fateColor = { decided: tones.out.main, kept: tones.exam.main, dropped: color.muted, advisory: tones.appeal.main, unknown: color.muted };
      const rows = stage.issues.map((issue, index) => {
        const cells = [
          issue.examiner.flatMap(row => [{ text: row.text }, row.quote && { text: "대상 구성: “" + row.quote + "”", color: tones.exam.main }]),
          issue.answers.length ? issue.answers.flatMap(row => [{ text: (row.label ? "[" + row.label + "] " : "") + row.text },
            row.quote && { text: "문언: “" + row.quote + "”", color: tones.appl.main }]) : [{ text: "대응이 선택한 자료에서 확인되지 않았습니다.", color: color.muted }],
          issue.fate.length ? issue.fate.flatMap(line => [{ text: "● " + line.text, color: fateColor[line.tone] || color.ink },
            line.reason && { text: "이유: " + line.reason, color: color.muted }]) : [{ text: "그 뒤의 처분이 확인되지 않았습니다.", color: color.muted }],
        ].map(list => fit(list.filter(Boolean), inner, pt, 17));
        return { issue, index, cells, height: Math.max(...cells.map(cell => cell.lines)) * lineHeight(pt) + .26 };
      });
      const start = top + .5;
      const pages = [[]];
      let used = 0;
      for (const row of rows) {
        const h = row.height + .44 + .16;
        if (used + h > bottom - start && pages.at(-1).length) {
          pages.push([]);
          used = 0;
        }
        pages.at(-1).push(row);
        used += h;
      }
      pages.forEach((list, index) => {
        const slide = page(numbered(`${number}단계 · ${stage.name}`, index, pages.length), [stage.date, stage.path.length > 1 ? stage.path.join("  →  ") : ""].filter(Boolean).join("  ·  "));
        columns.forEach((column, at) => {
          pill(slide, column.title, column.x, top, column.tone.main, color.white, 11, width);
          if (at) slide.addShape(shape.rightArrow, { x: column.x - .35, y: top + .05, w: .28, h: .23, fill: { color: "9FB3C2" }, line: { color: "9FB3C2", width: 0 } });
        });
        let y = start;
        for (const row of list) {
          const art = row.issue.art.length ? "인용: " + row.issue.art.join(", ") : "";
          put(slide, fit([{ text: `${row.index + 1}. ${row.issue.title}` + [row.issue.claims, art].filter(Boolean).map(text => "  ·  " + text).join("") }], 12.13, 12, 1).runs,
            .6, y, 12.13, .34, { fontSize: 12, bold: true, valign: "middle" });
          columns.forEach((column, at) => {
            card(slide, column.x, y + .4, width, row.height, column.tone.tint, column.tone.tint);
            put(slide, row.cells[at].runs, column.x + .16, y + .53, inner, row.height - .26, { fontSize: pt });
          });
          y += row.height + .44 + .16;
        }
      });
    }

    function numbering(rows) {
      const kinds = {
        gone: { tone: tones.exam, label: "등록 청구항에 없음" }, fresh: { tone: tones.appeal, label: "공개 청구항에 없던 항" },
        changed: { tone: tones.out, label: "문언 변경" }, same: { tone: tones.plain, label: "그대로 · 번호만 변경" },
      };
      const kindOf = note => /등록 청구항에 없음/.test(note) ? "gone" : /대응하는 공개 청구항 없음/.test(note) ? "fresh" : /문언 변경/.test(note) ? "changed" : "same";
      const pages = chunks(rows, 18);
      pages.forEach((list, index) => {
        const slide = page(numbered("청구항 번호는 이렇게 이어집니다", index, pages.length), "공개공보의 항 번호가 등록공보에서 몇 항이 됐는지, 문언이 바뀌었는지를 봅니다.");
        const width = (12.13 - .4) / 3;
        list.forEach(([before, after, note], at) => {
          const kind = kinds[kindOf(note)];
          const x = .6 + Math.floor(at / 6) * (width + .2);
          const y = top + (at % 6) * .78;
          card(slide, x, y, width, .68, kind.tone.tint, kind.tone.tint);
          put(slide, [{ text: "공개 " + before, options: { color: color.ink } }, { text: "  →  ", options: { color: kind.tone.main } }, { text: "등록 " + after, options: { color: kind.tone.main } }],
            x + .16, y + .06, width - .32, .3, { fontSize: 12.5, bold: true, valign: "middle" });
          put(slide, fit([{ text: note }], width - .32, 9.5, 1).runs, x + .16, y + .36, width - .32, .26, { fontSize: 9.5, color: color.muted, valign: "middle" });
        });
        let x = .6;
        for (const kind of Object.values(kinds)) {
          dot(slide, x, 6.56, .16, kind.tone.main);
          put(slide, kind.label, x + .24, 6.49, 2.6, .3, { fontSize: 10, color: color.muted, valign: "middle" });
          x += ems(kind.label) * 10 / 72 + .6;
        }
      });
    }

    // The granted claim with the words it gained and lost against the published claim marked in place.
    function claimDiff(claim) {
      const pt = 12.5;
      const width = 8.3;
      const lineEms = width * 72 / pt * .93;
      // The estimate runs wide for Latin text, so a slide is filled a little past it.
      const pages = diffPages(claim.runs, lineEms * (Math.floor((bottom - top - .4) / lineHeight(pt)) - 1) * 1.15, lineEms);
      const name = claim.granted ? `등록 제${claim.granted}항` : "등록 대표청구항";
      pages.forEach((runs, index) => {
        const slide = page(numbered(name + "은 이렇게 바뀌었습니다", index, pages.length),
          (claim.original ? `공개 제${claim.original}항` : "공개 청구항") + "과 단어 단위로 대조했습니다. 초록색은 등록 문언에 새로 들어간 말, 붉은 줄은 빠진 말입니다.");
        card(slide, .6, top, 8.75, bottom - top);
        put(slide, runs.map(run => ({ text: run.text, options: run.type === "added" ? { ...added } : run.type === "removed" ? { ...removed } : { color: color.ink } })),
          .82, top + .2, width, bottom - top - .4, { fontSize: pt });
        const x = 9.55;
        const w = 3.18;
        card(slide, x, top, w / 2 - .08, .95, tones.out.tint, tones.out.tint);
        put(slide, claim.added + "곳", x + .15, top + .1, w / 2 - .38, .45, { fontSize: 20, bold: true, color: tones.out.main, valign: "middle" });
        put(slide, "추가된 문언", x + .15, top + .56, w / 2 - .38, .28, { fontSize: 10, color: color.muted, valign: "middle" });
        card(slide, x + w / 2 + .08, top, w / 2 - .08, .95, "FDECEA", "FDECEA");
        put(slide, claim.removed + "곳", x + w / 2 + .23, top + .1, w / 2 - .38, .45, { fontSize: 20, bold: true, color: removed.color, valign: "middle" });
        put(slide, "삭제된 문언", x + w / 2 + .23, top + .56, w / 2 - .38, .28, { fontSize: 10, color: color.muted, valign: "middle" });
        card(slide, x, top + 1.1, w, bottom - top - 1.1);
        put(slide, "이 문언을 넣은 보정", x + .18, top + 1.22, w - .36, .3, { fontSize: 11, bold: true, color: color.teal, valign: "middle" });
        const notes = fit(claim.notes?.length ? claim.notes.flatMap(note => [{ text: note.from, bold: true, color: tones.appl.main }, { text: "“" + note.phrase + "”" },
          note.support && { text: "명세서 근거: " + note.support, color: color.muted }]).filter(Boolean)
          : [{ text: "분석한 답변서에서 이 문언을 넣은 보정을 찾지 못했습니다. 단계별 심사 흐름의 보정 내용과 함께 확인하세요.", color: color.muted }],
          w - .36, 10.5, Math.floor((bottom - top - 1.9) / (lineHeight(10.5) + .06)));
        put(slide, notes.runs, x + .18, top + 1.58, w - .36, bottom - top - 1.8, { fontSize: 10.5, paraSpaceAfter: 4 });
      });
    }

    const stages = deck.stages || [];
    const claims = deck.claims || [];
    const overviewFacts = facts.filter(([key]) => report[key]);
    const sections = report.conclusion ? conclusionSections(report.conclusion.text) : [];
    const headed = sections.some(part => part.title);

    cover();
    section = "01  개요";
    overview();
    if (report.timelineRows?.length) timeline();
    if (headed) {
      const order = [tones.out, tones.appl, tones.exam, tones.appeal];
      steps("심사 결과 보고서", sections.map((part, index) => ({ ...part, tone: order[index % order.length] })));
      if (report.conclusion.partial) prose("심사 결과 보고서", "출력 한도로 종합 분석이 일부만 작성됐습니다.");
    } else if (report.conclusion) prose("심사 결과 보고서", report.conclusion.text + (report.conclusion.partial ? "\n\n일부 출력" : ""));

    let parts = 1;
    const next = () => String(++parts).padStart(2, "0");
    if (stages.length > 1 || stages.some(stage => stage.issues.length)) {
      divider(next(), "심사 흐름", ["통지마다 한 단계로 묶었습니다.", "심사관의 판단 → 출원인의 대응 → 그 뒤의 처분 순서로 읽습니다."]);
      if (stages.length > 1) roadmap(stages);
      stages.forEach((stage, index) => { if (stage.issues.length) stageSlides(stage, index + 1); });
    }
    if (claims.length || deck.numbering?.length) {
      divider(next(), "청구항", ["공개공보의 청구항이 등록공보에서 어떻게 달라졌는지 봅니다.", "추가된 문언은 초록색, 삭제된 문언은 붉은 줄로 표시했습니다."]);
      if (deck.numbering?.length) numbering(deck.numbering);
      claims.forEach(claimDiff);
    }

    divider(next(), "근거 자료", ["앞 장의 그림을 뒷받침하는 표와 문서 요약입니다.", "원문 위치와 출처를 함께 적었습니다."]);
    // The cover and the overview cut long values short; the full wording is kept here.
    if (report.abstract || overviewFacts.some(([key]) => wrap(report[key], 3.4, 12).length > 1)) {
      prose("서지 상세와 초록", [pptx.title, ...overviewFacts.map(([key, label]) => label + "  " + report[key]), report.abstract].filter(Boolean).join("\n\n"));
    }
    for (const sheet of report.recordSheets || []) tabulate(sheet.title, sheet.headers, sheet.rows, sheet.widths);
    if (report.issueRows?.length) tabulate("쟁점별 거절 · 대응 · 그 뒤", ["단계", "거절", "심사관의 판단", "출원인의 대응", "그 뒤"], report.issueRows, [1.9, 2.3, 3, 3, 1.93]);
    if (report.procedureRows?.length) tabulate("절차별 쟁점과 대응", ["심사 절차", "청구항", "구분", "쟁점과 판단", "근거"], report.procedureRows, [2.35, 1.3, 1.3, 4.43, 2.75]);
    tabulate("패밀리 및 연계 출원", ["관할", "공개·등록번호", "출원번호", "조회 관계", "일자"],
      report.family.map(row => [row.country, row.publication, row.application, row.relation, row.date]), [1.05, 2.65, 2.53, 4.11, 1.79]);
    if (!report.timelineRows?.length) tabulate("심사·행정 이력", ["날짜", "기록", "상태·구분", "문서번호·코드"],
      report.events.map(row => [row.date, row.title, row.detail, row.id]), [1.6, 5.61, 2.62, 2.3]);
    tabulate("심사 문서", ["날짜", "문서", "식별자", "원문"],
      report.documents.map(row => [row.date, row.title, row.id, row.downloadable ? "기관 PDF" : "공식 열람처 참조"]), [1.6, 5.52, 2.91, 2.1]);
    const dated = new Map(report.documents.map(row => [row.id, row.date]));
    if (report.summaries.length) {
      steps("문서 요약", [{ title: "", tone: tones.plain, items: report.summaries.map(summary => ({
        date: String(dated.get(summary.id) || "").slice(0, 10), label: [summary.title, summary.id, summary.source, summary.model].filter(Boolean).join(" · "),
        text: [summary.text, summary.partial && "요약이 불완전합니다.", summary.evidenceIncomplete && "청구항 근거 추출이 불완전합니다."].filter(Boolean).join("\n"),
      })) }]);
    } else prose("문서 요약", "이 보고서에 포함된 문서 요약이 없습니다.");
    for (const sources of chunks(report.links.filter(source => new URL(source.url).protocol === "https:"), 8)) {
      const slide = page("공식 열람처");
      sources.forEach((source, i) => {
        card(slide, .6, top + .62 * i, 12.13, .52);
        put(slide, source.label, .85, top + .62 * i, 11.6, .52, { fontSize: 13, color: color.teal, valign: "middle", hyperlink: { url: new URL(source.url).href } });
      });
    }
    if (report.notes.length) prose("조회 범위", report.notes.join("\n\n"));
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

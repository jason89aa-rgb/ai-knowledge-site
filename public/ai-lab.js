(() => {
    const byId = id => document.getElementById(id);
    const form = byId("review-form"), inputs = byId("inputs"), source = byId("source"), draft = byId("draft");
    const format = byId("format"), file = byId("file"), results = byId("results");
    let reviewedDraft = "", rows = [], fileVersion = 0;
    function message(text, error = false) {
        byId("status").textContent = text;
        byId("status").dataset.error = String(error);
    }
    function invalidate() {
        fileVersion++;
        byId("math-fields").hidden = format.value !== "csv";
        results.hidden = true;
        byId("findings").replaceChildren();
        byId("revision").value = "";
        byId("copy-status").textContent = "";
        rows = [];
        reviewedDraft = "";
        message("");
    }
    form.addEventListener("input", invalidate);
    function example() {
        format.value = "csv";
        source.value = "기간,방문자,구매자\n지난주,1000,40\n이번 주,800,40";
        draft.value = "전환율이 1% 상승했다.\n이번 주 구매자가 늘었다.\n새 광고가 전환율을 높였다.";
        byId("value-column").value = "구매자";
        byId("base-column").value = "방문자";
        file.value = "";
        invalidate();
        message("예제를 불러왔습니다. 근거 검토하기를 눌러 분석하세요.");
    }
    byId("example").addEventListener("click", () => {
        if ((source.value || draft.value) && !window.confirm("현재 자료와 초안을 주간 실적 예제로 바꿀까요?")) return;
        example();
    });
    if (location.hash === "#example") example();
    file.addEventListener("change", async () => {
        const selected = file.files[0];
        if (!selected) return;
        const version = ++fileVersion;
        try {
            if (selected.size > 50000) throw new Error("50KB 이하의 UTF-8 CSV를 선택해 주세요.");
            const text = new TextDecoder("utf-8", { fatal: true }).decode(await selected.arrayBuffer());
            if (version !== fileVersion) return;
            if (text.length > 12000) throw new Error("CSV는 12,000자 이하로 나누어 주세요.");
            format.value = "csv";
            source.value = text;
            byId("value-column").value = "";
            byId("base-column").value = "";
            invalidate();
            message("CSV를 읽었습니다. 제목 행과 계산할 열을 확인하세요.");
        } catch (error) {
            if (version !== fileVersion) return;
            file.value = "";
            message(error instanceof TypeError ? "UTF-8로 저장한 CSV를 선택해 주세요." : error.message, true);
        }
    });
    function node(tag, text) {
        const e = document.createElement(tag);
        if (text !== undefined) e.textContent = text;
        return e;
    }
    function updateRevision() {
        let revised = reviewedDraft;
        for (const checkbox of [...byId("findings").querySelectorAll("input:checked")].reverse()) {
            const row = rows[Number(checkbox.value)];
            revised = revised.slice(0, row.start) + row.suggestion + revised.slice(row.end);
        }
        byId("revision").value = revised;
        byId("copy-status").textContent = "";
    }
    byId("findings").addEventListener("change", updateRevision);
    function render(result, original) {
        reviewedDraft = original;
        rows = result.findings;
        const counts = new Map();
        const list = byId("findings");
        list.replaceChildren();
        rows.forEach((row, index) => {
            counts.set(row.status, (counts.get(row.status) || 0) + 1);
            const item = node("article"), claim = node("div"), evidence = node("div"), review = node("div");
            item.className = "finding";
            claim.append(node("strong", "보고서 문장"), node("p", row.text));
            evidence.append(node("strong", "근거"));
            if (!row.evidence.length) evidence.append(node("p", "연결된 근거 없음"));
            for (const ref of row.evidence) {
                const details = node("details");
                details.append(node("summary", ref.label + " 보기"));
                if (result.csvHeader && ref.id.startsWith("R")) details.append(node("p", result.csvHeader));
                details.append(node("p", ref.text));
                evidence.append(details);
            }
            const badge = node("em", row.status);
            if (row.status === "일치") badge.className = "ok";
            review.append(node("strong", "검토 결과"), badge, node("p", row.reason));
            if (row.suggestion && row.suggestion !== row.text) {
                const label = node("label"), check = node("input");
                check.type = "checkbox";
                check.value = String(index);
                label.append(check, document.createTextNode("수정 반영 · " + row.suggestion));
                review.append(label);
            }
            item.append(claim, evidence, review);
            list.append(item);
        });
        byId("summary").textContent = [...counts].map(([key, count]) => key + " " + count + "건").join(" · ");
        const math = byId("calculations");
        math.open = false;
        math.hidden = !result.calculations.length;
        math.querySelector("ul").replaceChildren(...result.calculations.map(c => node("li", c.label + " · " + c.text)));
        results.hidden = false;
        updateRevision();
        byId("result-heading").focus();
    }
    form.addEventListener("submit", async event => {
        event.preventDefault();
        if (inputs.disabled) return;
        invalidate();
        inputs.disabled = true;
        const original = draft.value;
        message("Claude Haiku가 원본과 초안의 문장을 대조하고 있습니다…");
        try {
            const response = await fetch("/api/ai-lab", {
                method: "POST", headers: { "Content-Type": "application/json", "X-Patent-Access": byId("access-code").value.trim() },
                body: JSON.stringify({ source: source.value, draft: original, format: format.value,
                    valueColumn: byId("value-column").value, baseColumn: byId("base-column").value }),
            });
            const result = await response.json().catch(() => null);
            if (response.status === 401) {
                inputs.disabled = false;
                byId("access-code").focus();
                byId("access-code").select();
            }
            if (!response.ok || !Array.isArray(result?.findings)) throw new Error(result?.error || "검토 서버의 응답을 확인할 수 없습니다.");
            render(result, original);
            message("검토를 마쳤습니다. 원문과 대조한 뒤 반영할 수정을 선택하세요.");
        } catch (error) {
            results.hidden = true;
            message(error instanceof TypeError ? "검토 서버에 연결할 수 없습니다. 잠시 후 다시 시도해 주세요." : error.message, true);
        } finally { inputs.disabled = false; }
    });
    byId("copy").addEventListener("click", async () => {
        try {
            await navigator.clipboard.writeText(byId("revision").value);
            byId("copy-status").textContent = "복사했습니다.";
        } catch {
            byId("revision").focus();
            byId("revision").select();
            byId("copy-status").textContent = "선택된 수정본을 복사해 주세요.";
        }
    });
})();

const fs = require('fs');
const path = require('path');
const publicDir = path.join(process.cwd(), 'public');

// 1. Identify and delete thin pages
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
const deletedFiles = new Set();

for (const f of files) {
    if (f === '404.html' || f.startsWith('naver') || f === 'welcome.html') continue;
    const filePath = path.join(publicDir, f);
    const stat = fs.statSync(filePath);
    if (stat.size < 8000 && (f.startsWith('tech-column') || f.startsWith('tool-'))) {
        fs.unlinkSync(filePath);
        deletedFiles.add(f);
        console.log('Deleted thin content page: ' + f);
    }
}

// 2. Update index.html
const indexHtmlPath = path.join(publicDir, 'index.html');
if (fs.existsSync(indexHtmlPath)) {
    let indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');
    const newCards = `                    <article class="card">
                        <div class="icon-box" style="background:#fefce8; color:#ca8a04;">
                            <i class="fa-solid fa-robot"></i>
                        </div>
                        <h3>[제1회] 2026 AI 에이전트 시대</h3>
                        <p>단순 챗봇을 넘어 '자율적 행동'의 시대로 진입한 AI 에이전트 분석.</p>
                        <a href="tech-column-01.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>
                    <article class="card">
                        <div class="icon-box" style="background:#fef2f2; color:#ef4444;">
                            <i class="fa-solid fa-microchip"></i>
                        </div>
                        <h3>[제2회] 효율적인 AI 생태계, SLM</h3>
                        <p>파라미터가 전부가 아니다! 소형언어모델(SLM)이 주도하는 미래.</p>
                        <a href="tech-column-02.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>
                    <article class="card">
                        <div class="icon-box" style="background:#eef2ff; color:#4338ca;">
                            <i class="fa-solid fa-network-wired"></i>
                        </div>
                        <h3>[제3회] 에이전트 워크플로우</h3>
                        <p>자율적 AI 에이전트 시스템 설계를 위한 핵심 아키텍처 원칙.</p>
                        <a href="tech-column-03.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>
                    <article class="card">
                        <div class="icon-box" style="background:#ecfeff; color:#0891b2;">
                            <i class="fa-solid fa-bolt"></i>
                        </div>
                        <h3>엑셀 & PPT 업무 자동화</h3>
                        <p>복잡한 코딩 없이도 AI를 활용하여 업무 속도를 비약적으로 높이는 법.</p>
                        <a href="automation.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>
                     <article class="card">
                        <div class="icon-box" style="background:#fdf2f8; color:#db2777;">
                            <i class="fa-solid fa-comment-dots"></i>
                        </div>
                        <h3>프롬프트 엔지니어링 완벽 가이드</h3>
                        <p>AI의 성능을 100% 이끌어내는 프롬프트 설계 공식과 실전 팁.</p>
                        <a href="study-step1.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>
                    <article class="card">
                        <div class="icon-box" style="background:#fffbeb; color:#f59e0b;">
                            <i class="fa-solid fa-code"></i>
                        </div>
                        <h3>바이브 코딩(Vibe Coding) 실전</h3>
                        <p>기획부터 배포까지, 코딩 없이 AI와 대화하며 나만의 웹사이트 만들기.</p>
                        <a href="guide-vibe-coding.html" class="link-text">자세히 보기 <i class="fa-solid fa-arrow-right"></i></a>
                    </article>`;

    const startTag = '<div class="grid-container">';
    const sectionStart = indexHtml.indexOf('<section id="in-depth-analysis"');
    if (sectionStart !== -1) {
        const gridStart = indexHtml.indexOf(startTag, sectionStart);
        const sectionEnd = indexHtml.indexOf('<div style="text-align: center; margin-top: 50px;">', gridStart);
        if (gridStart !== -1 && sectionEnd !== -1) {
            const before = indexHtml.substring(0, gridStart + startTag.length);
            const after = indexHtml.substring(sectionEnd);
            fs.writeFileSync(indexHtmlPath, before + '\n' + newCards + '\n                </div>\n                ' + after, 'utf8');
            console.log('Updated index.html in-depth-analysis section.');
        }
    }
}

// 3. Remove references to deleted files in all HTML pages
function cleanHtmlFile(htmlFilePath) {
    let content = fs.readFileSync(htmlFilePath, 'utf8');
    let changed = false;

    // Remove entire article tags if they link to deleted files
    const articleRegex = /<article class="card">[\s\S]*?<\/article>/gi;
    content = content.replace(articleRegex, (match) => {
        for (const df of deletedFiles) {
            if (match.includes(`href="${df}"`)) {
                changed = true;
                return '';
            }
        }
        return match;
    });

    // Remove specific <li> references if any
    const liRegex = /<li>\s*<a[^>]*href="([^"]+)"[^>]*>.*?<\/a>\s*<\/li>/gi;
    content = content.replace(liRegex, (match, href) => {
        if (deletedFiles.has(href)) {
            changed = true;
            return '';
        }
        return match;
    });

    if (changed) {
        fs.writeFileSync(htmlFilePath, content, 'utf8');
        console.log('Cleaned up references in ' + path.basename(htmlFilePath));
    }
}

const htmlFiles = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));
for (const f of htmlFiles) {
    cleanHtmlFile(path.join(publicDir, f));
}

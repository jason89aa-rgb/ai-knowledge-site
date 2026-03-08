const fs = require('fs');
const path = require('path');

const publicDir = path.join(process.cwd(), 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html'));

const standardNav = `<nav>
                <ul>
                    <li><a href="tips.html">AI 꿀팁</a></li>
                    <li><a href="in-depth-analysis.html">심층 분석</a></li>
                    <li><a href="tools.html">추천 툴</a></li>
                    <li><a href="roadmap.html">학습 로드맵</a></li>
                    <li><a href="learning-journey.html">나의 학습 여정</a></li>
                    <li><a href="about.html">소개</a></li>
                    <li><a href="sitemap.html">사이트맵</a></li>
                </ul>
            </nav>`;

let updatedCount = 0;

for (const f of files) {
    if (f.startsWith('naver')) continue; // skip naver verification file
    const filePath = path.join(publicDir, f);
    let content = fs.readFileSync(filePath, 'utf8');

    // Replace the <nav> block
    const newContent = content.replace(/<nav>[\s\S]*?<\/nav>/, standardNav);
    
    if (content !== newContent) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        console.log(`Updated nav in ${f}`);
        updatedCount++;
    }
}

console.log(`Total files updated: ${updatedCount}`);

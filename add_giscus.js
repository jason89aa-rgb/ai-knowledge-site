const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

function findHtmlFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            results = results.concat(findHtmlFiles(file));
        } else if (file.endsWith('.html')) {
            results.push(file);
        }
    });
    return results;
}

const htmlFiles = findHtmlFiles(publicDir);

const giscusSnippet = `
            <!-- Giscus 댓글창 -->
            <div class="giscus"></div>
            <script src="https://giscus.app/client.js"
                    data-repo="jason89aa-rgb/ai-knowledge-site"
                    data-repo-id="R_kgDORQTSlA"
                    data-category="Announcements"
                    data-category-id="DIC_kwDORQTSlM4C4tQ4"
                    data-mapping="pathname"
                    data-strict="1"
                    data-reactions-enabled="1"
                    data-emit-metadata="0"
                    data-input-position="top"
                    data-theme="light"
                    data-lang="ko"
                    data-loading="lazy"
                    crossorigin="anonymous"
                    async></script>
`;

let modifiedCount = 0;

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    // 이미 Giscus 코드가 없는 경우에만 추가
    if (!content.includes('class="giscus"')) {
        // ads-wrapper-bottom 닫는 태그(</div>) 뒤에 Giscus 스니펫을 삽입
        const regex = /(<div\s+class="ads-wrapper-bottom">[\s\S]*?<\/div>)/i;
        if (regex.test(content)) {
            content = content.replace(regex, '$1\n' + giscusSnippet);
        }
    }

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        modifiedCount++;
    }
});

console.log(`총 ${modifiedCount}개의 파일에 Giscus 댓글창을 성공적으로 추가했습니다.`);

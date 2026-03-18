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
const timestamp = Date.now();
let modifiedCount = 0;

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    // 캐시 무효화를 위해 style.css 링크 업데이트
    content = content.replace(/href="style\.css(\?v=\d+)?"/g, `href="style.css?v=${timestamp}"`);

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        modifiedCount++;
    }
});

console.log(`총 ${modifiedCount}개의 HTML 파일에 CSS 캐시 무효화 파라미터를 추가했습니다.`);

const fs = require('fs');
const path = require('path');

const publicDir = path.join(__dirname, 'public');

// 모든 HTML 파일 찾기
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

let modifiedCount = 0;

htmlFiles.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    let originalContent = content;

    // 1. <head> 안에 애드센스 스크립트가 없다면 추가
    const adsenseScript = '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1012734614251637" crossorigin="anonymous"></script>';
    const adsenseScriptRegex = /<script\s+async\s+src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-1012734614251637"(\s+crossorigin="anonymous")?><\/script>/g;
    
    // <head> 영역 추출 (없으면 파일 전체에서 검사하지만, 우리 파일들은 모두 <head>가 있음)
    const headMatch = content.match(/<head>([\s\S]*?)<\/head>/i);
    if (headMatch) {
        if (!adsenseScriptRegex.test(headMatch[1]) && !headMatch[1].includes('pagead2.googlesyndication.com/pagead/js/adsbygoogle.js')) {
            content = content.replace('</head>', `    ${adsenseScript}\n</head>`);
        }
    }

    // 2. <body> 안의 중복 스크립트 제거
    const bodyMatch = content.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) {
        let bodyContent = bodyMatch[1];
        // <body> 내부의 애드센스 외부 스크립트 로드 태그 모두 제거
        bodyContent = bodyContent.replace(/<script\s+async\s+src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js.*?"[^>]*><\/script>/gi, '');
        
        content = content.replace(bodyMatch[1], bodyContent);
    }

    // 3. 상단 광고 래퍼 교체
    // 기존: <div style="margin-bottom: 30px; text-align: center;">
    content = content.replace(/<div\s+style="margin-bottom:\s*30px;\s*text-align:\s*center;">(\s*<!-- ai-all-main-top -->\s*<ins\s+class="adsbygoogle"[\s\S]*?data-ad-slot="6867902771"[\s\S]*?<\/script>\s*)<\/div>/gi, '<div class="ads-wrapper-top">$1</div>');

    // 4. 하단 광고 래퍼 교체
    // 기존: <div style="margin: 40px 0;">
    content = content.replace(/<div\s+style="margin:\s*40px\s*0;">(\s*<!-- ai-all-article-footer -->\s*<ins\s+class="adsbygoogle"[\s\S]*?data-ad-slot="3002002897"[\s\S]*?<\/script>\s*)<\/div>/gi, '<div class="ads-wrapper-bottom">$1</div>');

    // 5. tech-column, tool 등 분석/칼럼 페이지의 경우 본문 첫 번째 <h2> 태그 위에 중간 광고 삽입
    const filename = path.basename(file);
    if ((filename.startsWith('tech-column') || filename.startsWith('tool-') || filename === 'guide-vibe-coding.html') && filename !== 'tools.html') {
        // 이미 추가되었는지 확인
        if (!content.includes('class="ads-wrapper-mid"')) {
            const midAdSnippet = `
            <!-- 본문 중간 인피드 광고 -->
            <div class="ads-wrapper-mid">
                <ins class="adsbygoogle"
                     style="display:block; text-align:center;"
                     data-ad-layout="in-article"
                     data-ad-format="fluid"
                     data-ad-client="ca-pub-1012734614251637"
                     data-ad-slot="8901234567"></ins> <!-- 임시 슬롯 -->
                <script>
                     (adsbygoogle = window.adsbygoogle || []).push({});
                </script>
            </div>
            `;
            // 첫 번째 <h2> 태그 찾기
            content = content.replace(/(<h2>)/i, midAdSnippet + '$1');
        }
    }

    if (content !== originalContent) {
        fs.writeFileSync(file, content, 'utf8');
        modifiedCount++;
    }
});

console.log(`총 ${htmlFiles.length}개의 파일 중 ${modifiedCount}개의 파일을 성공적으로 수정했습니다.`);

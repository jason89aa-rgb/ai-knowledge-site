const fs = require('fs');

const deletedFiles = ['tech-column-12.html', 'tech-column-13.html', 'tech-column-14.html', 'tech-column-15.html', 'tech-column-40.html', 'tech-column-41.html', 'tech-column-42.html', 'tech-column-43.html', 'tech-column-44.html', 'tech-column-45.html', 'tech-column-46.html', 'tool-gamma.html', 'tool-heygen.html', 'tool-v0.html', 'tool-vrew.html'];

function fixHtmlFile(htmlFilePath) {
    let content = fs.readFileSync(htmlFilePath, 'utf8');
    let changed = false;

    // Remove matching articles with flexible start tag
    const articleRegex = /<article[^>]*>[\s\S]*?<\/article>/gi;
    content = content.replace(articleRegex, (match) => {
        for (const df of deletedFiles) {
            if (match.includes(`href="${df}"`) || match.includes(`href='${df}'`)) {
                changed = true;
                return '';
            }
        }
        return match;
    });

    if (changed) {
        fs.writeFileSync(htmlFilePath, content, 'utf8');
        console.log('Cleaned up references in ' + htmlFilePath);
    }
}

const files = fs.readdirSync('public').filter(f => f.endsWith('.html'));
for (const f of files) {
    fixHtmlFile('public/' + f);
}

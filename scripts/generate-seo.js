const fs = require('fs');
const path = require('path');

const publicDir = path.join(process.cwd(), 'public');
const files = fs.readdirSync(publicDir).filter(f => f.endsWith('.html') && f !== 'naverf5984bc86d5b4fab1223bb755aac7fad.html' && f !== '404.html');

const items = [];
const skipRssList = ['index.html', 'about.html', 'contact.html', 'privacy.html', 'terms.html', 'sitemap.html', 'tools.html', 'roadmap.html'];

for (const file of files) {
    const filePath = path.join(publicDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const stats = fs.statSync(filePath);
    
    let title = 'AI Insight';
    const titleMatch = content.match(/<title>(.*?)<\/title>/i);
    if (titleMatch) title = titleMatch[1].trim();

    let description = '';
    const descMatch = content.match(/<meta\s+name=['"]description['"]\s+content=['"](.*?)['"]/i);
    if (descMatch) description = descMatch[1].trim();

    const url = `https://ai-all.co.kr/${file}`;
    // YYYY-MM-DD format for sitemap
    const lastModDate = new Date(stats.mtime).toISOString().split('T')[0];
    const pubDate = new Date(stats.mtime).toUTCString();

    items.push({
        file,
        title,
        description,
        url,
        pubDate,
        lastModDate,
        mtime: stats.mtime.getTime(),
        isArticle: !skipRssList.includes(file)
    });
}

// 1. Generate sitemap.xml
let sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
`;

// Homepage explicitly
sitemapXml += `  <url>
    <loc>https://ai-all.co.kr/</loc>
    <lastmod>${new Date().toISOString().split('T')[0]}</lastmod>
  </url>
`;

for (const item of items) {
    if (item.file === 'index.html') continue; // already added above
    sitemapXml += `  <url>
    <loc>${item.url}</loc>
    <lastmod>${item.lastModDate}</lastmod>
  </url>
`;
}
sitemapXml += `</urlset>`;

fs.writeFileSync(path.join(publicDir, 'sitemap.xml'), sitemapXml, 'utf8');
console.log('✅ sitemap.xml automatically generated.');

// 2. Generate rss.xml
// Sort by modification time descending for RSS
const rssItems = items.filter(i => i.isArticle).sort((a, b) => b.mtime - a.mtime).slice(0, 20);

let rssXml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>AI Insight - 인공지능의 모든 것</title>
    <link>https://ai-all.co.kr/</link>
    <description>AI 툴 소개, 학습 로드맵, 프롬프트 엔지니어링 팁을 제공하는 AI 전문 지식 허브입니다.</description>
    <language>ko</language>
    <atom:link href="https://ai-all.co.kr/rss.xml" rel="self" type="application/rss+xml" />
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
`;

for (const item of rssItems) {
    rssXml += `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.url}</link>
      <description><![CDATA[${item.description}]]></description>
      <pubDate>${item.pubDate}</pubDate>
      <guid>${item.url}</guid>
    </item>
`;
}
rssXml += `  </channel>
</rss>`;

fs.writeFileSync(path.join(publicDir, 'rss.xml'), rssXml, 'utf8');
console.log('✅ rss.xml automatically generated.');

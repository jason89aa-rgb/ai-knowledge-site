const html = `
    <!-- Google AdSense: ai-all-main-top -->
    <div style="margin-bottom: 30px; text-align: center;">
        <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1012734614251637" crossorigin="anonymous"></script>
        <!-- ai-all-main-top -->
        <ins class="adsbygoogle"
             style="display:block"
             data-ad-client="ca-pub-1012734614251637"
             data-ad-slot="6867902771"
             data-ad-format="auto"
             data-full-width-responsive="true"></ins>
        <script>
             (adsbygoogle = window.adsbygoogle || []).push({});
        </script>
    </div>
`;

const slotTopRegex = /(<ins[^>]*data-ad-slot=["']6867902771["'][^>]*>[\s\S]*?<\/script>)/gi;

let result = html.replace(slotTopRegex, (match, p1, offset, string) => {
    return `<div class="ads-wrapper-top">\n${match}\n</div>`;
});

console.log(result);

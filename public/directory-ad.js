(() => {
    const slot = document.querySelector(".directory-ad .adsbygoogle");
    if (!slot || !("IntersectionObserver" in window)) return;

    function requestAd() {
        const script = document.createElement("script");
        script.async = true;
        script.crossOrigin = "anonymous";
        script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + slot.dataset.adClient;
        document.head.appendChild(script);
        (window.adsbygoogle = window.adsbygoogle || []).push({});
    }

    const observer = new IntersectionObserver(entries => {
        if (entries.some(entry => entry.isIntersecting)) {
            observer.disconnect();
            requestAd();
        }
    });
    observer.observe(slot);
})();

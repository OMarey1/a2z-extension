chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'download' && msg.url && msg.filename) {
        chrome.downloads.download(
            { url: msg.url, filename: msg.filename, saveAs: true },
            (id) => chrome.runtime.lastError &&
                console.error(chrome.runtime.lastError.message)
        );
    }
});

// Share a game result: the system share sheet on touch devices, the clipboard elsewhere.

function legacyCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

async function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        try {
            await navigator.clipboard.writeText(text);
            return;
        } catch (e) {}
    }
    legacyCopy(text);
}

// onCopied runs only when the text went to the clipboard; a dismissed share sheet does nothing.
export async function shareResult(text, onCopied) {
    if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
        try {
            await navigator.share({ text });
            return;
        } catch (e) {
            if (e.name === 'AbortError') return;
        }
    }
    await copyText(text);
    onCopied();
}

async function unfurlSocialLink(content) {
    const text = String(content || '');

    const replaceHostname = (url, newHost) => {
        try {
            const u = new URL(url);
            u.hostname = newHost;
            return u.toString();
        } catch (_) {
            return url;
        }
    };

    const extractFirstUrl = (regex) => {
        const match = text.match(regex);
        if (!match || !match[0]) return null;
        return String(match[0])
            .replace(/[\s<>"'`]+$/g, '')
            .replace(/[),.!?]+$/g, '')
            .split('#')[0];
    };

    // Instagram -> ddinstagram
    const instaUrl = extractFirstUrl(/https?:\/\/(?:www\.)?instagram\.com\/(?:reel|reels|p|tv)\/[A-Za-z0-9_-]+(?:\?[^\s]*)?/i);
    if (instaUrl) return replaceHostname(instaUrl, 'ddinstagram.com');

    // TikTok -> d.tiktokez.com
    const tiktokUrl = extractFirstUrl(/https?:\/\/(?:www\.|vm\.|vt\.)?tiktok\.com\/(?:@[^\s\/]+\/video\/\d+|t\/[A-Za-z0-9]+|[A-Za-z0-9_-]+)(?:\?[^\s]*)?/i);
    if (tiktokUrl) {
        const chosen = (process.env.TIKTOK_REWRITE_DOMAIN || 'd.tiktokez.com').trim();
        const domain = chosen || 'd.tiktokez.com';
        return replaceHostname(tiktokUrl, domain);
    }

    return null;
}

module.exports = { unfurlSocialLink };

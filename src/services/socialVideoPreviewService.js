const MAX_BYTES = 25 * 1024 * 1024;

const DEBUG = process.env.SOCIAL_VIDEO_DEBUG === '1';

const SOCIAL_VIDEO_REGEX = /https?:\/\/\S+/gi;

function extractCandidateUrls(content) {
    const text = String(content || '');
    const matches = text.match(SOCIAL_VIDEO_REGEX) || [];
    return matches
        .map((u) => String(u).replace(/[\s<>"'`]+$/g, '').replace(/[),.!?]+$/g, '').split('#')[0])
        .filter(Boolean);
}

function isSupportedSocialVideoUrl(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch (_) {
        return false;
    }

    const host = u.hostname.toLowerCase();
    const path = u.pathname || '';

    if (host === 'tiktok.com' || host.endsWith('.tiktok.com')) return true;

    if (host === 'instagram.com' || host === 'www.instagram.com') {
        return /^\/(reel|reels|p|tv)\//i.test(path);
    }

    if (host === 'youtube.com' || host === 'www.youtube.com' || host === 'm.youtube.com') {
        return /^\/shorts\//i.test(path);
    }

    if (host === 'youtu.be') return true;

    if (host === 'pinterest.com' || host === 'www.pinterest.com' || host === 'pin.it') return true;

    if (host === 'reddit.com' || host === 'www.reddit.com' || host === 'old.reddit.com') {
        return /\/comments\//i.test(path);
    }

    if (host === 'v.redd.it') return true;

    return false;
}

async function fetchJson(url) {
    const res = await fetch(url, {
        headers: {
            'user-agent': 'Mozilla/5.0'
        }
    });
    if (!res.ok) return null;
    return res.json().catch(() => null);
}

async function resolveFinalUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        const host = u.hostname.toLowerCase();
        const isTikTok = host === 'tiktok.com' || host.endsWith('.tiktok.com');
        if (!isTikTok) return rawUrl;

        const res = await fetch(rawUrl, {
            method: 'GET',
            redirect: 'follow',
            headers: {
                'user-agent': 'Mozilla/5.0'
            }
        });

        const finalUrl = res?.url ? String(res.url) : rawUrl;
        if (DEBUG && finalUrl !== rawUrl) {
            console.debug(`[SOCIAL_VIDEO] resolved tiktok url: ${rawUrl} -> ${finalUrl}`);
        }
        return finalUrl;
    } catch (_) {
        return rawUrl;
    }
}

async function tryGetRedditStats(rawUrl) {
    let u;
    try {
        u = new URL(rawUrl);
    } catch (_) {
        return { likes: null, shares: null };
    }

    if (!/reddit\.com$/i.test(u.hostname) && u.hostname !== 'www.reddit.com' && u.hostname !== 'old.reddit.com') {
        return { likes: null, shares: null };
    }

    const jsonUrl = `https://www.reddit.com${u.pathname}.json?raw_json=1`;
    const data = await fetchJson(jsonUrl);
    const post = data?.[0]?.data?.children?.[0]?.data;

    const likes = typeof post?.ups === 'number' ? post.ups : null;
    const shares = typeof post?.num_crossposts === 'number' ? post.num_crossposts : null;

    return { likes, shares };
}

async function getSocialStats(rawUrl) {
    if (rawUrl.includes('reddit.com')) {
        return tryGetRedditStats(rawUrl);
    }

    return { likes: null, shares: null };
}

async function cobaltDownload(rawUrl) {
    const endpoint = (process.env.COBALT_API_URL || 'https://api.cobalt.tools/api/json').trim();

    const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            accept: 'application/json',
            'user-agent': 'Mozilla/5.0'
        },
        body: JSON.stringify({
            url: rawUrl,
            vCodec: 'h264',
            vQuality: '720',
            aFormat: 'mp3'
        })
    });

    const data = await res.json().catch(() => null);
    if (DEBUG) {
        try {
            console.debug(`[SOCIAL_VIDEO] cobalt response: ok=${res.ok} status=${res.status} url=${rawUrl} endpoint=${endpoint}`);
        } catch (_) {
            // ignore
        }
    }
    if (!res.ok || !data) {
        const msg = data?.text || data?.error || `Cobalt request failed (${res.status})`;
        throw new Error(msg);
    }

    const directUrl = data?.url || data?.download;
    if (!directUrl) {
        const msg = data?.text || data?.error || 'Cobalt: no download url';
        throw new Error(msg);
    }

    const filename = (data?.filename || data?.fileName || 'sourced.mp4').toString();
    return { directUrl: String(directUrl), filename };
}

async function downloadToBufferWithLimit(directUrl) {
    const res = await fetch(directUrl);
    if (!res.ok) {
        throw new Error(`Download failed (${res.status})`);
    }

    const lengthHeader = res.headers.get('content-length');
    const length = lengthHeader ? Number(lengthHeader) : null;
    if (length && Number.isFinite(length) && length > MAX_BYTES) {
        throw new Error('FILE_TOO_LARGE');
    }

    const reader = res.body?.getReader?.();
    if (!reader) {
        const ab = await res.arrayBuffer();
        if (ab.byteLength > MAX_BYTES) throw new Error('FILE_TOO_LARGE');
        return Buffer.from(ab);
    }

    const chunks = [];
    let total = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;

        total += value.byteLength;
        if (total > MAX_BYTES) {
            throw new Error('FILE_TOO_LARGE');
        }
        chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks, total);
}

function isTikTokUrl(rawUrl) {
    try {
        const u = new URL(rawUrl);
        const host = u.hostname.toLowerCase();
        return host === 'tiktok.com' || host.endsWith('.tiktok.com');
    } catch (_) {
        return false;
    }
}

function rewriteTikTokHostname(rawUrl) {
    const chosen = (process.env.TIKTOK_REWRITE_DOMAIN || 'd.tiktokez.com').trim();
    const domain = chosen || 'd.tiktokez.com';
    try {
        const u = new URL(rawUrl);
        u.hostname = domain;
        return u.toString();
    } catch (_) {
        return rawUrl;
    }
}

function formatCompactNumber(n) {
    if (typeof n !== 'number' || !Number.isFinite(n)) return null;
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`;
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`;
    return String(n);
}

async function buildSourcedPayload({ message, url }) {
    const resolvedUrl = await resolveFinalUrl(url);
    const stats = await getSocialStats(url);

    let dl;
    try {
        dl = await cobaltDownload(resolvedUrl);
    } catch (e) {
        if (isTikTokUrl(resolvedUrl)) {
            const rewritten = rewriteTikTokHostname(resolvedUrl);
            if (DEBUG) {
                console.debug(`[SOCIAL_VIDEO] cobalt failed for tiktok; retry with rewrite: ${resolvedUrl} -> ${rewritten}`);
            }
            dl = await cobaltDownload(rewritten);
        } else {
            throw e;
        }
    }

    const { directUrl, filename } = dl;
    const buffer = await downloadToBufferWithLimit(directUrl);

    const likesText = formatCompactNumber(stats.likes);
    const sharesText = formatCompactNumber(stats.shares);

    return {
        buffer,
        filename: filename.toLowerCase().endsWith('.mp4') ? filename : 'sourced.mp4',
        directUrl,
        likes: likesText,
        shares: sharesText,
        postedByMention: `<@${message.author.id}>`
    };
}

async function buildSourcedDirectUrlPayload({ message, url }) {
    const resolvedUrl = await resolveFinalUrl(url);
    const stats = await getSocialStats(url);

    let dl;
    try {
        dl = await cobaltDownload(resolvedUrl);
    } catch (e) {
        if (isTikTokUrl(resolvedUrl)) {
            const rewritten = rewriteTikTokHostname(resolvedUrl);
            if (DEBUG) {
                console.debug(`[SOCIAL_VIDEO] cobalt failed for tiktok; retry with rewrite: ${resolvedUrl} -> ${rewritten}`);
            }
            dl = await cobaltDownload(rewritten);
        } else {
            throw e;
        }
    }

    const likesText = formatCompactNumber(stats.likes);
    const sharesText = formatCompactNumber(stats.shares);

    const directUrl = String(dl?.directUrl || '');
    const filename = (dl?.filename || 'sourced.mp4').toString();

    return {
        directUrl,
        filename: filename.toLowerCase().endsWith('.mp4') ? filename : 'sourced.mp4',
        likes: likesText,
        shares: sharesText,
        postedByMention: `<@${message.author.id}>`
    };
}

module.exports = {
    extractCandidateUrls,
    isSupportedSocialVideoUrl,
    buildSourcedPayload,
    buildSourcedDirectUrlPayload,
    MAX_BYTES
};

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const notifier = require('node-notifier');

const AVATAR_CACHE = new Map();
const CACHE_TTL_MS = 10 * 60 * 1000;

function isWindows() {
    return process.platform === 'win32';
}

function safeFilename(input) {
    return String(input || '').replace(/[^a-z0-9-_]/gi, '').slice(0, 64) || 'icon';
}

async function downloadToFile(url, destPath) {
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true }).catch(() => { });

    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);
        const request = https.get(url, (res) => {
            if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                file.close(() => {
                    fs.unlink(destPath, () => {
                        downloadToFile(res.headers.location, destPath).then(resolve).catch(reject);
                    });
                });
                return;
            }

            if (res.statusCode !== 200) {
                file.close(() => {
                    fs.unlink(destPath, () => reject(new Error(`HTTP ${res.statusCode}`)));
                });
                return;
            }

            res.pipe(file);
            file.on('finish', () => file.close(() => resolve(destPath)));
        });

        request.on('error', (err) => {
            file.close(() => {
                fs.unlink(destPath, () => reject(err));
            });
        });

        file.on('error', (err) => {
            file.close(() => {
                fs.unlink(destPath, () => reject(err));
            });
        });
    });
}

async function getLocalAvatarIconPath(senderId, avatarUrl) {
    if (!avatarUrl) return null;

    const now = Date.now();
    const cached = AVATAR_CACHE.get(senderId);
    if (cached && cached.path && now - cached.at < CACHE_TTL_MS) {
        return cached.path;
    }

    const tmpDir = path.join(os.tmpdir(), 'elora_hub_notifier');
    const filename = `${safeFilename(senderId)}.png`;
    const iconPath = path.join(tmpDir, filename);

    try {
        await downloadToFile(avatarUrl, iconPath);
        AVATAR_CACHE.set(senderId, { path: iconPath, at: now });
        return iconPath;
    } catch (e) {
        return null;
    }
}

function normalizeBody(text) {
    const clean = String(text || '').trim();
    return clean.length ? clean : 'Sent a message!';
}

async function notifyWindowsToast({ type, senderId, senderName, body, iconUrl }) {
    if (!isWindows()) return;

    const title = `${type}: ${senderName}`;
    const message = normalizeBody(body);
    const iconPath = await getLocalAvatarIconPath(senderId, iconUrl);

    return new Promise((resolve) => {
        notifier.notify(
            {
                title,
                message,
                icon: iconPath || undefined,
                sound: false,
                wait: true,
                actions: ['Open'],
                closeLabel: 'Dismiss',
            },
            () => resolve()
        );
    });
}

module.exports = {
    notifyWindowsToast,
};

const fs = require('fs');
const path = require('path');

const STORAGE_DIR = path.join(__dirname, '..', 'storage');
const STORAGE_FILE = path.join(STORAGE_DIR, 'boostSettings.json');

async function ensureStorage() {
    await fs.promises.mkdir(STORAGE_DIR, { recursive: true });

    try {
        await fs.promises.access(STORAGE_FILE, fs.constants.F_OK);
    } catch (_) {
        const initial = { guilds: {} };
        await writeAtomicJson(STORAGE_FILE, initial);
    }
}

async function readJson() {
    await ensureStorage();
    const raw = await fs.promises.readFile(STORAGE_FILE, 'utf8');

    try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { guilds: {} };
        if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
        return parsed;
    } catch (_) {
        return { guilds: {} };
    }
}

async function writeAtomicJson(filePath, data) {
    const tmpPath = `${filePath}.tmp`;
    const json = JSON.stringify(data, null, 2);

    await fs.promises.writeFile(tmpPath, json, 'utf8');
    await fs.promises.rename(tmpPath, filePath);
}

async function writeJson(data) {
    await ensureStorage();
    await writeAtomicJson(STORAGE_FILE, data);
}

function ensureGuildEntry(db, guildId) {
    if (!db.guilds[guildId] || typeof db.guilds[guildId] !== 'object') {
        db.guilds[guildId] = {
            boosterChannelId: null,
            lastPremiumSubscriptionCount: null
        };
    }
    if (!('boosterChannelId' in db.guilds[guildId])) db.guilds[guildId].boosterChannelId = null;
    if (!('lastPremiumSubscriptionCount' in db.guilds[guildId])) db.guilds[guildId].lastPremiumSubscriptionCount = null;

    return db.guilds[guildId];
}

async function setBoosterChannelId(guildId, channelId) {
    const db = await readJson();
    const entry = ensureGuildEntry(db, guildId);
    entry.boosterChannelId = channelId;
    await writeJson(db);
}

async function getBoosterChannelId(guildId) {
    const db = await readJson();
    const entry = ensureGuildEntry(db, guildId);
    return entry.boosterChannelId;
}

async function setLastPremiumSubscriptionCount(guildId, count) {
    const db = await readJson();
    const entry = ensureGuildEntry(db, guildId);
    entry.lastPremiumSubscriptionCount = typeof count === 'number' ? count : null;
    await writeJson(db);
}

async function getLastPremiumSubscriptionCount(guildId) {
    const db = await readJson();
    const entry = ensureGuildEntry(db, guildId);
    return typeof entry.lastPremiumSubscriptionCount === 'number' ? entry.lastPremiumSubscriptionCount : null;
}

module.exports = {
    setBoosterChannelId,
    getBoosterChannelId,
    setLastPremiumSubscriptionCount,
    getLastPremiumSubscriptionCount
};

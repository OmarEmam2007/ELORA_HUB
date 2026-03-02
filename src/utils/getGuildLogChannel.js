const ModSettings = require('../models/ModSettings');

async function getGuildLogChannel(guild, client) {
    if (!guild) return null;

    // Prefer per-guild ModSettings
    const settings = await ModSettings.findOne({ guildId: guild.id }).catch(() => null);
    const logChannelId = settings?.logChannelId || client?.config?.logChannelId || null;
    if (!logChannelId) return null;

    const ch = await guild.channels.fetch(logChannelId).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return null;

    return ch;
}

module.exports = { getGuildLogChannel };

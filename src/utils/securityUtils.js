const linkRegex = /(https?:\/\/[^\s]+|discord\.gg\/[^\s]+)/gi;
const inviteRegex = /(discord\.gg|discord\.com\/invite)\/.+/i;

// Simple in-memory tracker for anti-nuke (Rate Limits)
// Map<GuildID, Map<UserID, { action: count, lastTime: timestamp }>>
const antiNukeMap = new Map();

function checkLink(content) {
    if (inviteRegex.test(content)) return 'INVITE';
    // if (linkRegex.test(content)) return 'LINK'; // Too aggressive to block all links? Maybe just phishing domains in future.
    return null;
}

function checkRateLimit(guildId, userId, action, limit, timeWindow) {
    if (!antiNukeMap.has(guildId)) antiNukeMap.set(guildId, new Map());
    const guildMap = antiNukeMap.get(guildId);

    if (!guildMap.has(userId)) guildMap.set(userId, {});
    const userStats = guildMap.get(userId);

    const now = Date.now();

    if (!userStats[action] || now - userStats[action].lastTime > timeWindow) {
        userStats[action] = { count: 1, lastTime: now };
    } else {
        userStats[action].count++;
    }

    if (userStats[action].count > limit) {
        return true;
    }
    return false;
}

module.exports = { checkLink, checkRateLimit };

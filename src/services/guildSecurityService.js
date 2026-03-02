const { AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const GuildSecurityConfig = require('../models/GuildSecurityConfig');

function uniq(arr) {
    return Array.from(new Set((arr || []).filter(Boolean)));
}

async function getConfig(guildId) {
    const doc = await GuildSecurityConfig.findOne({ guildId }).catch(() => null);
    if (doc) return doc;
    return await GuildSecurityConfig.create({ guildId }).catch(() => new GuildSecurityConfig({ guildId }));
}

async function updateConfig(guildId, patch) {
    return await GuildSecurityConfig.findOneAndUpdate(
        { guildId },
        { $set: patch, $setOnInsert: { guildId } },
        { upsert: true, new: true }
    );
}

function isWhitelistedMember(member, config) {
    if (!member) return false;
    if (member.id === member.guild.ownerId) return true;
    const userIds = config?.whitelistUsers || [];
    if (userIds.includes(member.id)) return true;
    const roleIds = new Set(config?.whitelistRoles || []);
    return member.roles?.cache?.some(r => roleIds.has(r.id)) || false;
}

async function fetchRecentAuditExecutor({ guild, event, targetId }) {
    try {
        const logs = await guild.fetchAuditLogs({ type: event, limit: 5 });
        const entry = logs.entries.find(e => {
            if (targetId && e?.target?.id && e.target.id !== targetId) return false;
            const ageMs = Date.now() - (e.createdTimestamp || 0);
            return ageMs < 15_000; // 15s window
        });
        if (!entry) return null;
        return {
            executorId: entry.executor?.id || null,
            executor: entry.executor || null,
            reason: entry.reason || null,
            entry
        };
    } catch (_) {
        return null;
    }
}

async function timeoutMember(member, hours, reason) {
    if (!member || !member.moderatable) return false;
    const ms = Math.max(0, Number(hours || 0)) * 60 * 60 * 1000;
    if (!ms) return false;
    await member.timeout(ms, reason).catch(() => null);
    return true;
}

function hasDangerousAdminPermissions(role) {
    if (!role) return false;
    const perms = role.permissions;
    if (!perms) return false;
    return (
        perms.has(PermissionFlagsBits.Administrator) ||
        perms.has(PermissionFlagsBits.ManageGuild) ||
        perms.has(PermissionFlagsBits.ManageRoles) ||
        perms.has(PermissionFlagsBits.ManageChannels) ||
        perms.has(PermissionFlagsBits.BanMembers) ||
        perms.has(PermissionFlagsBits.KickMembers)
    );
}

module.exports = {
    AuditLogEvent,
    getConfig,
    updateConfig,
    isWhitelistedMember,
    fetchRecentAuditExecutor,
    timeoutMember,
    hasDangerousAdminPermissions,
    uniq
};

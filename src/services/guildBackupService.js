const { ChannelType, PermissionsBitField } = require('discord.js');
const GuildBackup = require('../models/GuildBackup');

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function serializeOverwrite(ow) {
    return {
        id: ow.id,
        type: ow.type,
        allow: ow.allow?.bitfield?.toString?.() ?? String(ow.allow ?? '0'),
        deny: ow.deny?.bitfield?.toString?.() ?? String(ow.deny ?? '0')
    };
}

function serializeRole(role) {
    return {
        id: role.id,
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions.bitfield.toString(),
        position: role.position,
        managed: role.managed,
        tags: role.tags ?? null
    };
}

function serializeChannel(ch) {
    return {
        id: ch.id,
        name: ch.name,
        type: ch.type,
        parentId: ch.parentId,
        position: ch.rawPosition,
        nsfw: 'nsfw' in ch ? Boolean(ch.nsfw) : false,
        rateLimitPerUser: 'rateLimitPerUser' in ch ? ch.rateLimitPerUser : null,
        topic: 'topic' in ch ? ch.topic : null,
        bitrate: 'bitrate' in ch ? ch.bitrate : null,
        userLimit: 'userLimit' in ch ? ch.userLimit : null,
        rtcRegion: 'rtcRegion' in ch ? ch.rtcRegion : null,
        permissionOverwrites: ch.permissionOverwrites?.cache?.map(serializeOverwrite) ?? []
    };
}

async function createBackup({ guild, createdBy, note = null }) {
    // Fetch fresh state
    await guild.roles.fetch().catch(() => { });
    await guild.channels.fetch().catch(() => { });

    const roles = guild.roles.cache
        .filter(r => r.id !== guild.id) // exclude @everyone
        .map(serializeRole)
        .sort((a, b) => a.position - b.position);

    const channels = guild.channels.cache
        .map(serializeChannel)
        .sort((a, b) => a.position - b.position);

    const snapshot = {
        guild: {
            id: guild.id,
            name: guild.name
        },
        roles,
        channels
    };

    const doc = await GuildBackup.create({
        guildId: guild.id,
        createdBy,
        note,
        snapshot,
        version: 1
    });

    return doc;
}

function isProtectedRole(guild, role) {
    if (!role) return true;
    if (role.id === guild.id) return true; // @everyone
    if (role.managed) return true; // bot/integration
    return false;
}

function isProtectedChannel(channel) {
    if (!channel) return true;
    return false;
}

async function wipeGuildStructure(guild) {
    await guild.channels.fetch().catch(() => { });
    await guild.roles.fetch().catch(() => { });

    // Delete channels first (children before parents by rawPosition desc is usually safe)
    const channels = [...guild.channels.cache.values()]
        .sort((a, b) => (b.rawPosition ?? 0) - (a.rawPosition ?? 0));

    for (const ch of channels) {
        if (isProtectedChannel(ch)) continue;
        await ch.delete('Guild backup restore: wipe channels').catch(() => { });
        await sleep(350);
    }

    // Delete roles from low to high? must delete below bot role only; attempt safe order by position asc
    const roles = [...guild.roles.cache.values()]
        .filter(r => !isProtectedRole(guild, r))
        .sort((a, b) => a.position - b.position);

    for (const role of roles) {
        await role.delete('Guild backup restore: wipe roles').catch(() => { });
        await sleep(350);
    }
}

async function restoreFromBackup({ guild, backupDoc }) {
    const snap = backupDoc?.snapshot;
    if (!snap?.roles || !snap?.channels) throw new Error('Invalid backup snapshot');

    // 1) wipe
    await wipeGuildStructure(guild);

    // 2) recreate roles (bottom -> top)
    const roleIdMap = new Map(); // oldRoleId -> newRoleId

    const sortedRoles = [...snap.roles].sort((a, b) => a.position - b.position);
    for (const r of sortedRoles) {
        // skip managed roles in snapshot
        if (r.managed) continue;

        const created = await guild.roles.create({
            name: r.name,
            color: r.color,
            hoist: r.hoist,
            mentionable: r.mentionable,
            permissions: new PermissionsBitField(BigInt(r.permissions))
        }).catch(() => null);

        if (created) {
            roleIdMap.set(r.id, created.id);
            await sleep(500);
        }
    }

    // Attempt to set role positions (best-effort)
    try {
        const positions = [];
        for (const r of sortedRoles) {
            const newId = roleIdMap.get(r.id);
            if (!newId) continue;
            const newRole = guild.roles.cache.get(newId);
            if (!newRole) continue;
            positions.push({ role: newId, position: r.position });
        }
        // discord.js expects array sorted high->low sometimes; but best-effort
        await guild.roles.setPositions(positions).catch(() => { });
    } catch (_) {
        // ignore
    }

    // 3) recreate categories first, then other channels
    const channelIdMap = new Map(); // oldChannelId -> newChannelId

    const categories = snap.channels
        .filter(c => c.type === ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

    for (const c of categories) {
        const created = await guild.channels.create({
            name: c.name,
            type: ChannelType.GuildCategory
        }).catch(() => null);

        if (created) {
            channelIdMap.set(c.id, created.id);
            await sleep(500);
        }
    }

    const others = snap.channels
        .filter(c => c.type !== ChannelType.GuildCategory)
        .sort((a, b) => a.position - b.position);

    for (const c of others) {
        const parent = c.parentId ? channelIdMap.get(c.parentId) : null;

        const payload = {
            name: c.name,
            type: c.type,
            parent,
            nsfw: c.nsfw
        };

        if (c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement) {
            if (c.topic) payload.topic = c.topic;
            if (typeof c.rateLimitPerUser === 'number') payload.rateLimitPerUser = c.rateLimitPerUser;
        }

        if (c.type === ChannelType.GuildVoice || c.type === ChannelType.GuildStageVoice) {
            if (typeof c.bitrate === 'number') payload.bitrate = c.bitrate;
            if (typeof c.userLimit === 'number') payload.userLimit = c.userLimit;
            if (c.rtcRegion) payload.rtcRegion = c.rtcRegion;
        }

        const created = await guild.channels.create(payload).catch(() => null);
        if (created) {
            channelIdMap.set(c.id, created.id);
            await sleep(500);
        }
    }

    // 4) Apply overwrites + positions best-effort
    for (const c of snap.channels) {
        const newId = channelIdMap.get(c.id);
        const newCh = newId ? guild.channels.cache.get(newId) : null;
        if (!newCh) continue;

        // overwrites
        try {
            const overwrites = [];
            for (const ow of c.permissionOverwrites || []) {
                const mappedRoleId = roleIdMap.get(ow.id);
                const id = mappedRoleId || ow.id; // members keep same IDs
                overwrites.push({
                    id,
                    allow: new PermissionsBitField(BigInt(ow.allow || '0')),
                    deny: new PermissionsBitField(BigInt(ow.deny || '0')),
                    type: ow.type
                });
            }
            if (overwrites.length) {
                await newCh.permissionOverwrites.set(overwrites).catch(() => { });
            }
        } catch (_) {
            // ignore
        }

        // positions handled after loop
    }

    // set positions best-effort
    try {
        const toSet = [];
        for (const c of snap.channels) {
            const newId = channelIdMap.get(c.id);
            if (!newId) continue;
            const newCh = guild.channels.cache.get(newId);
            if (!newCh) continue;
            toSet.push({ channel: newId, position: c.position });
        }
        // No single API for all positions in v14; do per-channel best-effort
        for (const p of toSet.sort((a, b) => a.position - b.position)) {
            const ch = guild.channels.cache.get(p.channel);
            if (!ch) continue;
            await ch.setPosition(p.position).catch(() => { });
            await sleep(250);
        }
    } catch (_) {
        // ignore
    }
}

module.exports = {
    createBackup,
    restoreFromBackup
};

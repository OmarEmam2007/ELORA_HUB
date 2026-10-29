const { PermissionFlagsBits } = require('discord.js');
const Level = require('../models/Level');
const { buildRankCardAttachment } = require('../utils/rankCard');

const LEVEL_UP_CHANNEL_ID = '1461760293968285879';
const XP_COOLDOWN_MS = 60_000;
const xpCooldown = new Map();

const MILESTONE_ROLES = {
    1: '1565272470225821706',
    5: '1565272544427376680',
    10: '1565272591688667146',
    20: '1565272710341468201',
    30: '1565272748660359258',
    50: '1565272793648463963',
    75: '1565272831619637338',
    100: '1565272867321417808'
};

const MILESTONE_PERKS = {
    5: 'You can now send images and links in the chat.',
    10: 'You have unlocked the ability to change your own nickname.',
    20: 'You can now use external emojis and stickers.',
    30: 'You have been granted access to the secret high-tier chat.',
    50: 'You now have the power to change other members\' nicknames.',
    75: 'You have unlocked the power to Timeout disruptive members.',
    100: 'You have reached the absolute peak. A custom Demigod status is yours.'
};

const MILESTONE_LEVELS = Object.keys(MILESTONE_ROLES)
    .map(Number)
    .sort((a, b) => a - b);

function xpForNext(level) {
    const lv = Math.max(0, Number(level) || 0);
    return 5 * (lv ** 2) + 50 * lv + 100;
}

function randomXp() {
    return Math.floor(Math.random() * 11) + 15;
}

function cooldownKey(guildId, userId) {
    return `${guildId}:${userId}`;
}

function isOnCooldown(guildId, userId) {
    const key = cooldownKey(guildId, userId);
    const last = xpCooldown.get(key);
    if (last && Date.now() - last < XP_COOLDOWN_MS) return true;
    return false;
}

function stampCooldown(guildId, userId) {
    const key = cooldownKey(guildId, userId);
    xpCooldown.set(key, Date.now());
    if (xpCooldown.size > 5000) {
        const cutoff = Date.now() - XP_COOLDOWN_MS;
        for (const [k, ts] of xpCooldown) {
            if (ts < cutoff) xpCooldown.delete(k);
        }
    }
}

function highestMilestoneAtOrBelow(level) {
    let found = null;
    for (const lv of MILESTONE_LEVELS) {
        if (lv <= level) found = lv;
    }
    return found;
}

function buildLevelUpContent(userId, level) {
    const perk = MILESTONE_PERKS[level];
    if (perk) {
        return `<@${userId}> has ascended to **Level ${level}**.\n**Unlocked:** ${perk}`;
    }
    return `<@${userId}> has ascended to **Level ${level}**.`;
}

async function getOrCreateLevel(userId, guildId) {
    let doc = await Level.findOne({ userId, guildId }).exec();
    if (!doc) {
        doc = await Level.create({ userId, guildId, xp: 0, level: 0 });
    }
    return doc;
}

async function getRankPosition(userId, guildId) {
    const doc = await Level.findOne({ userId, guildId }).lean().exec();
    if (!doc) return null;
    const ahead = await Level.countDocuments({
        guildId,
        $or: [
            { level: { $gt: doc.level } },
            { level: doc.level, xp: { $gt: doc.xp } }
        ]
    }).exec();
    return ahead + 1;
}

async function applyMilestoneRoles(member, newLevel) {
    if (!member) return;
    const targetMilestone = highestMilestoneAtOrBelow(newLevel);
    const targetRoleId = targetMilestone ? MILESTONE_ROLES[targetMilestone] : null;
    const allRoleIds = Object.values(MILESTONE_ROLES);

    const me = member.guild.members.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) return;

    const toRemove = allRoleIds.filter((id) => id !== targetRoleId && member.roles.cache.has(id));
    for (const roleId of toRemove) {
        const role = member.guild.roles.cache.get(roleId);
        if (!role) continue;
        if (role.position >= me.roles.highest.position) continue;
        await member.roles.remove(roleId, 'Leveling: previous milestone role').catch(() => {});
    }

    if (targetRoleId && !member.roles.cache.has(targetRoleId)) {
        const role = member.guild.roles.cache.get(targetRoleId);
        if (role && role.position < me.roles.highest.position) {
            await member.roles.add(targetRoleId, 'Leveling: milestone role').catch(() => {});
        }
    }
}

async function buildUserRankCard(memberOrUser, guild, doc) {
    const user = memberOrUser.user || memberOrUser;
    const member = memberOrUser.roles ? memberOrUser : await guild.members.fetch(user.id).catch(() => null);
    const required = xpForNext(doc.level);
    const rank = await getRankPosition(user.id, guild.id);
    const avatarUrl = user.displayAvatarURL({ extension: 'png', size: 256, forceStatic: true });

    return buildRankCardAttachment({
        username: member?.displayName || user.globalName || user.username,
        handle: user.username,
        avatarUrl,
        level: doc.level,
        currentXp: doc.xp,
        requiredXp: required,
        rank: rank || 1,
        status: member?.presence?.status || 'offline'
    });
}

async function announceLevelUps({ guild, member, user, oldLevel, newLevel, doc }) {
    const channel =
        guild.channels.cache.get(LEVEL_UP_CHANNEL_ID) ||
        (await guild.channels.fetch(LEVEL_UP_CHANNEL_ID).catch(() => null));
    if (!channel?.isTextBased?.()) return;

    const content = buildLevelUpContent(user.id, newLevel);

    let files = [];
    try {
        const card = await buildUserRankCard(member || user, guild, doc);
        files = [card];
    } catch (e) {
        console.error('[LEVELING] Rank card failed:', e);
    }

    await channel
        .send({
            content,
            files,
            allowedMentions: { users: [user.id] }
        })
        .catch((e) => console.error('[LEVELING] Failed to send level-up:', e?.message || e));
}

async function handleMessageXp(message) {
    if (!message?.guild || message.author?.bot || message.webhookId) return;
    if (isOnCooldown(message.guild.id, message.author.id)) return;

    stampCooldown(message.guild.id, message.author.id);

    const doc = await getOrCreateLevel(message.author.id, message.guild.id);
    const oldLevel = doc.level || 0;
    doc.xp += randomXp();

    let safety = 0;
    while (doc.xp >= xpForNext(doc.level) && safety < 50) {
        doc.xp -= xpForNext(doc.level);
        doc.level += 1;
        safety += 1;
    }

    await doc.save();

    if (doc.level <= oldLevel) return;

    const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
    try {
        await applyMilestoneRoles(member, doc.level);
    } catch (e) {
        console.error('[LEVELING] Role update failed:', e);
    }

    try {
        await announceLevelUps({
            guild: message.guild,
            member,
            user: message.author,
            oldLevel,
            newLevel: doc.level,
            doc
        });
    } catch (e) {
        console.error('[LEVELING] Announce failed:', e);
    }
}

module.exports = {
    LEVEL_UP_CHANNEL_ID,
    MILESTONE_ROLES,
    MILESTONE_PERKS,
    xpForNext,
    getOrCreateLevel,
    getRankPosition,
    buildUserRankCard,
    handleMessageXp
};

const path = require('path');
const { EmbedBuilder, AttachmentBuilder, ChannelType } = require('discord.js');

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function formatNumber(n) {
    if (typeof n !== 'number') return '0';
    return n.toLocaleString('en-US');
}

function progressBarFromPercent(percent, size = 12, filledChar = '█', emptyChar = '░') {
    const p = clamp(Number(percent) || 0, 0, 100);
    const filled = Math.round((p / 100) * size);
    const empty = size - filled;
    return `${filledChar.repeat(filled)}${emptyChar.repeat(empty)}`;
}

function progressBar(current, total, size = 12, filledChar = '█', emptyChar = '░') {
    const t = Number(total) || 0;
    const c = Number(current) || 0;
    const percent = t <= 0 ? 0 : (c / t) * 100;
    return {
        percent: clamp(Math.round(percent), 0, 100),
        bar: progressBarFromPercent(percent, size, filledChar, emptyChar)
    };
}

function mapVerificationLevel(level) {
    const map = {
        0: 'None',
        1: 'Low',
        2: 'Medium',
        3: 'High',
        4: 'Very High'
    };
    return map[level] ?? 'Unknown';
}

function mapExplicitFilter(level) {
    const map = {
        0: 'Disabled',
        1: 'Members Without Roles',
        2: 'All Members'
    };
    return map[level] ?? 'Unknown';
}

function mapBoostTier(tier) {
    const map = {
        0: 'Tier 0',
        1: 'Tier 1',
        2: 'Tier 2',
        3: 'Tier 3'
    };
    return map[tier] ?? 'Unknown';
}

function safeIconUrl(guild) {
    try {
        return guild.iconURL({ dynamic: true, size: 1024 }) || null;
    } catch (_) {
        return null;
    }
}

module.exports = {
    name: 'sots',
    aliases: ['state', 'serverstate', 'sos'],

    async execute(message, client) {
        try {
            const guild = message.guild;
            if (!guild) {
                return await message.reply('❖ This command can only be used inside a server.');
            }

            const iconUrl = safeIconUrl(guild);

            const bannerName = 'new banner1.png';
            const bannerCandidates = [
                path.join(process.cwd(), 'assets', bannerName),
                path.join(process.cwd(), 'src', 'assets', bannerName)
            ];

            let bannerAttachment = null;
            let bannerAttachmentName = null;

            // AttachmentBuilder: we attach a local file and then reference it via "attachment://<name>".
            // Discord hosts it for this message only, which is perfect for a fixed command banner.
            for (const candidate of bannerCandidates) {
                try {
                    const name = path.basename(candidate);
                    bannerAttachment = new AttachmentBuilder(candidate, { name });
                    bannerAttachmentName = name;
                    break;
                } catch (_) {
                    // ignore invalid paths / unreadable files
                }
            }

            // --- Members / presence intelligence (best-effort) ---
            let memberSource = guild.members.cache;
            let memberFetchSucceeded = false;

            try {
                // Attempt to fetch full member list; may fail on large guilds or insufficient permissions.
                // withPresences gives better online/idle/dnd counts if the bot has GUILD_PRESENCES intent.
                const fetched = await guild.members.fetch({ withPresences: true });
                memberSource = fetched;
                memberFetchSucceeded = true;
            } catch (_) {
                // fallback to cache
            }

            const totalMembers = guild.memberCount ?? memberSource.size;

            let humans = 0;
            let bots = 0;

            let online = 0;
            let idle = 0;
            let dnd = 0;
            let offline = 0;

            for (const [, m] of memberSource) {
                if (m.user?.bot) bots += 1;
                else humans += 1;

                const status = m.presence?.status || 'offline';
                if (status === 'online') online += 1;
                else if (status === 'idle') idle += 1;
                else if (status === 'dnd') dnd += 1;
                else offline += 1;
            }

            // In some caches, memberSource might not include everyone; use memberCount for totals if larger.
            // Keep bot/human totals consistent with what we actually counted.
            const countedMembers = humans + bots;
            const memberTotalForBars = countedMembers > 0 ? countedMembers : (totalMembers || 1);

            const humanBar = progressBar(humans, memberTotalForBars, 12);
            const botBar = progressBar(bots, memberTotalForBars, 12);

            const onlineBar = progressBar(online, memberTotalForBars, 12);
            const idleBar = progressBar(idle, memberTotalForBars, 12);
            const dndBar = progressBar(dnd, memberTotalForBars, 12);
            const offlineBar = progressBar(offline, memberTotalForBars, 12);

            const presenceNote = memberFetchSucceeded
                ? '❖ Presence source: Live fetch'
                : '❖ Presence source: Cache (limited)';

            // --- Channel architecture ---
            const channels = guild.channels?.cache;
            const totalChannels = channels?.size ?? 0;

            const textChannels = channels ? channels.filter(c => c.type === ChannelType.GuildText).size : 0;
            const voiceChannels = channels ? channels.filter(c => c.type === ChannelType.GuildVoice).size : 0;
            const categories = channels ? channels.filter(c => c.type === ChannelType.GuildCategory).size : 0;
            const stages = channels ? channels.filter(c => c.type === ChannelType.GuildStageVoice).size : 0;
            const forums = channels ? channels.filter(c => c.type === ChannelType.GuildForum).size : 0;

            // --- Roles / hierarchy ---
            const roles = guild.roles?.cache;
            const totalRoles = roles?.size ?? 0;
            const highestRole = guild.members?.me?.roles?.highest || guild.roles?.highest;
            const highestRoleText = highestRole ? `${highestRole}` : 'Unknown';

            // --- Boosts ---
            const boostTier = mapBoostTier(guild.premiumTier);
            const boosts = guild.premiumSubscriptionCount ?? 0;
            let boosters = 'Unknown';

            if (memberFetchSucceeded) {
                const boosterCount = memberSource.filter(m => Boolean(m.premiumSince)).size;
                boosters = formatNumber(boosterCount);
            }

            // --- Security ---
            const verification = mapVerificationLevel(guild.verificationLevel);
            const explicitFilter = mapExplicitFilter(guild.explicitContentFilter);

            // --- Customization ---
            const emojiCount = guild.emojis?.cache?.size ?? 0;
            const stickerCount = guild.stickers?.cache?.size ?? 0;

            // --- Timeline ---
            const createdAt = guild.createdAt ? Math.floor(guild.createdAt.getTime() / 1000) : null;
            const createdText = createdAt
                ? `<t:${createdAt}:F>\n<t:${createdAt}:R>`
                : 'Unknown';

            const embed = new EmbedBuilder()
                .setColor('#2B2D31')
                .setAuthor({
                    name: guild.name,
                    iconURL: iconUrl || undefined
                })
                .setTitle('✧ ELORA Server Intelligence & State ✧')
                .setThumbnail(iconUrl || null)
                .setFooter({
                    text: `Requested by ${message.author.tag}`,
                    iconURL: message.author.displayAvatarURL({ dynamic: true })
                })
                .setTimestamp();

            const populationLines = [
                `❖ Total: ${formatNumber(totalMembers)}`,
                `❖ Humans: [${humanBar.bar}] ${humanBar.percent}% (${formatNumber(humans)})`,
                `❖ Bots:   [${botBar.bar}] ${botBar.percent}% (${formatNumber(bots)})`,
                '◈ Status Matrix',
                `❖ Online:  [${onlineBar.bar}] ${onlineBar.percent}% (${formatNumber(online)})`,
                `❖ Idle:    [${idleBar.bar}] ${idleBar.percent}% (${formatNumber(idle)})`,
                `❖ DND:     [${dndBar.bar}] ${dndBar.percent}% (${formatNumber(dnd)})`,
                `❖ Offline: [${offlineBar.bar}] ${offlineBar.percent}% (${formatNumber(offline)})`,
                presenceNote
            ].join('\n');

            const channelsLines = [
                `⊞ Total: ${formatNumber(totalChannels)}`,
                `⊞ Text: ${formatNumber(textChannels)}`,
                `⊞ Voice: ${formatNumber(voiceChannels)}`,
                `⊞ Categories: ${formatNumber(categories)}`,
                `⊞ Stage: ${formatNumber(stages)}`,
                `⊞ Forums: ${formatNumber(forums)}`
            ].join('\n');

            const rolesLines = [
                `⟡ Total Roles: ${formatNumber(totalRoles)}`,
                `⟡ Highest Role: ${highestRoleText}`
            ].join('\n');

            const boostsLines = [
                `◈ Tier: ${boostTier}`,
                `◈ Boosts: ${formatNumber(boosts)}`,
                `◈ Boosters: ${boosters}`
            ].join('\n');

            const securityLines = [
                `⛊ Verification: ${verification}`,
                `⛊ Explicit Filter: ${explicitFilter}`
            ].join('\n');

            const customizationLines = [
                `✦ Emojis: ${formatNumber(emojiCount)}`,
                `✦ Stickers: ${formatNumber(stickerCount)}`
            ].join('\n');

            const timelineLines = [
                `◷ Created`,
                createdText
            ].join('\n');

            embed.addFields(
                { name: '❖ Population Details', value: populationLines, inline: false },
                { name: '⊞ Channel Architecture', value: channelsLines, inline: true },
                { name: '⟡ Roles & Hierarchy', value: rolesLines, inline: true },
                { name: '◈ Boost Status', value: boostsLines, inline: true },
                { name: '⛊ Security', value: securityLines, inline: true },
                { name: '✦ Customization', value: customizationLines, inline: true },
                { name: '◷ Timeline', value: timelineLines, inline: true }
            );

            if (bannerAttachment && bannerAttachmentName) {
                embed.setImage(`attachment://${bannerAttachmentName}`);
            }

            const payload = {
                embeds: [embed],
                files: bannerAttachment ? [bannerAttachment] : []
            };

            return await message.reply(payload);
        } catch (error) {
            console.error('[SOTS] Error:', error);
            try {
                return await message.reply('❖ System fault. Unable to generate server intelligence at this time.');
            } catch (_) {
                return;
            }
        }
    }
};

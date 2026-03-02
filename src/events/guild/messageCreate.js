const { PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { checkLink, checkRateLimit } = require('../../utils/securityUtils');
const { unfurlSocialLink } = require('../../services/socialUnfurlService');
const User = require('../../models/User');
const CustomReply = require('../../models/CustomReply');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const { detectProfanitySmart, detectProfanityHybrid } = require('../../utils/moderation/coreDetector');
const THEME = require('../../utils/theme');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // --- Language filter: block Arabic in specific channel ---
        try {
            if (message.channelId === '1462025794481164461') {
                const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
                if (!isAdministrator) {
                    const hasArabic = /[\u0600-\u06FF]/.test(String(message.content || ''));
                    if (hasArabic) {
                        await message.delete().catch(() => {});
                        const warn = await message.channel.send({
                            content: 'Please use the Arabic language channel here: <#1462079159332372480>'
                        }).catch(() => null);
                        if (warn) setTimeout(() => warn.delete().catch(() => {}), 7000);
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[LANG FILTER] Error:', e);
        }

        // --- Anti-Link / Anti-Invite ---
        try {
            const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
            const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
            const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];

            const isServerOwner = message.guild?.ownerId === message.author.id;
            const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
            const isWhitelisted = Boolean(
                (message.channelId && whitelistChannels.includes(message.channelId)) ||
                (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
            );

            if (!isServerOwner && !isAdministrator && !isWhitelisted) {
                const linkType = checkLink(String(message.content || ''));
                if (linkType) {
                    await message.delete().catch(() => {});
                    const warn = await message.channel.send({
                        content: `⚠️ ${message.author}, links are not allowed in this server.`
                    }).catch(() => null);
                    if (warn) setTimeout(() => warn.delete().catch(() => {}), 5000);
                    return;
                }
            }
        } catch (e) {
            console.error('[ANTILINK] Error:', e);
        }

        // --- Smart Anti-Swearing ---
        try {
            const modSettings = await ModSettings.findOne({ guildId: message.guild.id }).catch(() => null);
            const antiSwearEnabled = modSettings?.antiSwearEnabled !== false;

            const isServerOwner = message.guild?.ownerId === message.author.id;
            const isAdministrator = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

            const whitelistRoles = Array.isArray(modSettings?.whitelistRoles) ? modSettings.whitelistRoles : [];
            const whitelistChannels = Array.isArray(modSettings?.whitelistChannels) ? modSettings.whitelistChannels : [];
            const isWhitelisted = Boolean(
                (message.channelId && whitelistChannels.includes(message.channelId)) ||
                (message.member?.roles?.cache && whitelistRoles.some(r => message.member.roles.cache.has(r)))
            );

            // Avoid moderating emoji/sticker-only messages.
            const hasStickers = Boolean(message.stickers && message.stickers.size > 0);
            const rawText = String(message.content || '');
            const withoutCustomEmoji = rawText.replace(/<a?:\w+:\d+>/g, ' ');
            const withoutUnicodeEmoji = withoutCustomEmoji.replace(/[\p{Extended_Pictographic}\uFE0F\u200D]+/gu, ' ');
            const textForModeration = withoutUnicodeEmoji.replace(/\s+/g, ' ').trim();
            if (hasStickers && !textForModeration) {
                // do nothing
            } else if (antiSwearEnabled && !isServerOwner && !isAdministrator && !isWhitelisted) {
                const detector = typeof detectProfanityHybrid === 'function'
                    ? detectProfanityHybrid
                    : async (c, o) => detectProfanitySmart(c, o);

                const detection = await detector(textForModeration || message.content, {
                    extraTerms: Array.isArray(modSettings?.customBlacklist) ? modSettings.customBlacklist : [],
                    whitelist: Array.isArray(modSettings?.antiSwearWhitelist) ? modSettings.antiSwearWhitelist : []
                });

                if (detection?.isViolation) {
                    await message.delete().catch(() => {});
                    return;
                }
            }
        } catch (e) {
            console.error('[ANTISWEAR] Error:', e);
        }

        // --- Social Embedding Rewrite (TikTok/Instagram) ---
        // Rewrites to embed-friendly domains and reposts while mentioning the author.
        try {
            const fixed = await unfurlSocialLink(message.content);
            if (fixed && fixed !== message.content) {
                const canDelete = message.guild.members.me?.permissions?.has(PermissionFlagsBits.ManageMessages);
                if (canDelete) {
                    await message.delete().catch(() => {});
                }
                await message.channel.send({
                    content: `${message.author}: ${fixed}`
                }).catch(() => {});
                return;
            }
        } catch (e) {
            console.error('[SOCIAL REWRITE] Error:', e);
        }

        // --- Social Unfurl (Download + Reupload) limits ---
        const SOCIAL_MAX_BYTES = 10 * 1024 * 1024;
        const SOCIAL_RATE_LIMIT_MS = 20_000;

        // --- Social Unfurl (TikTok/Instagram) ---
        try {
            const socialUrl = await unfurlSocialLink(message.content);
            if (socialUrl) {
                // Basic per-user rate limit so we don't spam downloads.
                if (!global.__socialUnfurlLastAt) global.__socialUnfurlLastAt = new Map();
                const now = Date.now();
                const last = global.__socialUnfurlLastAt.get(message.author.id) || 0;
                if (now - last < SOCIAL_RATE_LIMIT_MS) return;
                global.__socialUnfurlLastAt.set(message.author.id, now);

                const canDelete = message.guild.members.me?.permissions?.has(PermissionFlagsBits.ManageMessages);
                if (!canDelete) {
                    await message.reply({ content: socialUrl }).catch(() => {});
                    return;
                }

                const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'elora-social-'));
                const outTemplate = path.join(tmpDir, 'video.%(ext)s');

                try {
                    // Use yt-dlp to download a single video file.
                    await ytDlpExec(socialUrl, {
                        output: outTemplate,
                        restrictFilenames: true,
                        noPlaylist: true,
                        maxFilesize: SOCIAL_MAX_BYTES,
                        // Prefer mp4 if possible.
                        format: 'mp4/best',
                        // Keep it bounded.
                        socketTimeout: 10,
                        retries: 1,
                        fragmentRetries: 1,
                        // Reduce noise.
                        noWarnings: true,
                        quiet: true
                    });

                    const files = fs.readdirSync(tmpDir).filter(f => !f.endsWith('.part'));
                    const first = files[0];
                    if (!first) throw new Error('Download produced no file');

                    const filePath = path.join(tmpDir, first);
                    const stat = fs.statSync(filePath);
                    if (stat.size > SOCIAL_MAX_BYTES) throw new Error('File too large');

                    await message.delete().catch(() => {});

                    const attachment = new AttachmentBuilder(filePath, { name: 'video.mp4' });
                    await message.channel.send({ files: [attachment] });
                    return;
                } catch (e) {
                    // Fallback: if download/reupload fails, just reply with the original URL.
                    // This avoids the dead mirror domains and keeps behavior usable.
                    console.error('[UNFURL] Download/Reupload Error:', e);
                    await message.reply({ content: socialUrl }).catch(() => {});
                    return;
                } finally {
                    try {
                        // Best-effort cleanup.
                        fs.rmSync(tmpDir, { recursive: true, force: true });
                    } catch (_) {}
                }
            }
        } catch (e) {
            console.error('[UNFURL] Error:', e);
        }

        // --- Custom Auto-Replies ---
        try {
            const customReplies = await CustomReply.find({ guildId: message.guild.id, enabled: true }).catch(() => []);
            const triggerText = message.content.trim().toLowerCase();

            for (const cr of customReplies) {
                const trigger = cr.trigger.toLowerCase();
                let isMatch = false;

                if (cr.matchType === 'startsWith') {
                    isMatch = triggerText.startsWith(trigger);
                } else {
                    isMatch = triggerText === trigger;
                }

                if (isMatch) {
                    return await message.reply(cr.reply);
                }
            }
        } catch (e) {
            console.error('[CUSTOM REPLIES] Error:', e);
        }

        // --- Chat Leveling System (XP) ---
        try {
            const now = Date.now();
            let profile = await User.findOne({ userId: message.author.id, guildId: message.guild.id }).catch(() => null);
            if (!profile) {
                profile = new User({ userId: message.author.id, guildId: message.guild.id });
            }

            const lastXP = profile.lastMessageTimestamp || 0;
            if (now - lastXP > 60000) {
                const xpGain = Math.floor(Math.random() * 10) + 15;
                profile.xp = (profile.xp || 0) + xpGain;
                profile.lastMessageTimestamp = now;

                let needed = (profile.level || 1) * 100;
                if (profile.xp >= needed) {
                    profile.xp -= needed;
                    profile.level = (profile.level || 1) + 1;
                }
                await profile.save().catch(() => {});
            }
        } catch (e) {
            console.error('[LEVELING] Error:', e);
        }

        // --- 🎮 Prefix Commands (after filters/systems) ---
        try {
            if (typeof handlePrefixCommand === 'function') {
                const wasCommand = await handlePrefixCommand(message, client);
                if (wasCommand) return;
            }
        } catch (e) {
            console.error('[PREFIX] Error:', e);
        }

        // --- Mention Response ---
        let isReplyToBot = false;
        if (message.reference?.messageId) {
            try {
                const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                isReplyToBot = Boolean(refMsg && refMsg.author?.id === client.user.id);
            } catch (_) {
                isReplyToBot = false;
            }
        }

        const botMentioned = Boolean(message.mentions?.users?.has(client.user.id)) || isReplyToBot;

        if (botMentioned && !message.author.bot) {
            const cleanContent = String(message.content || '').replace(/<@!?\d+>/g, '').trim().toLowerCase();

            if (cleanContent.includes('i love you') || cleanContent.includes('love you') || cleanContent.includes('بحبك')) {
                return await message.reply('بحبك أكتر يا قلبي ❤️');
            }
        }
    }
};

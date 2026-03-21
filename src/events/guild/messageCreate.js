const { unfurlSocialLink } = require('../../services/socialUnfurlService');
const User = require('../../models/User');
const CustomReply = require('../../models/CustomReply');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');
const { EmbedBuilder } = require('discord.js');
const { notifyWindowsToast } = require('../../services/windowsNotifyService');

const INCOGNITO_CHANNEL_ID = '1484939016351645808';
const INCOGNITO_LOGS_CHANNEL_ID = '1484940148994084934';
const INCOGNITO_WEBHOOK_NAME = 'Incognito Room';
const INCOGNITO_AVATAR_URL = 'https://singlecolorimage.com/get/808080/128x128';

function randomIncognitoName() {
    const prefixes = ['User', 'Ghost', 'Shadow', 'Anon', 'Wisp', 'Null'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const num = Math.floor(Math.random() * 900) + 100;
    return `${prefix}-${num}`;
}

function chunkString(str, maxLen) {
    const s = String(str || '');
    const limit = Number(maxLen) > 0 ? Number(maxLen) : 2000;
    if (!s.length) return [''];
    const chunks = [];
    for (let i = 0; i < s.length; i += limit) chunks.push(s.slice(i, i + limit));
    return chunks;
}

async function getOrCreateIncognitoWebhook(channel, client) {
    const hooks = await channel.fetchWebhooks();
    let hook = hooks.find((w) => w?.owner?.id === client.user.id && w?.name === INCOGNITO_WEBHOOK_NAME);
    if (!hook) {
        hook = await channel.createWebhook({
            name: INCOGNITO_WEBHOOK_NAME,
            avatar: INCOGNITO_AVATAR_URL,
            reason: 'Incognito Room webhook',
        });
    }
    return hook;
}

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || message.webhookId || !message.guild) return;

        try {
            if (message.channelId === INCOGNITO_CHANNEL_ID) {
                const originalContent = message.content ?? '';
                const attachments = Array.from(message.attachments?.values?.() || []);
                const files = attachments.map((a) => ({
                    attachment: a.url,
                    name: a.name || 'file',
                    description: a.description || undefined,
                }));

                try {
                    await message.delete();
                } catch (e) {
                    console.error('[INCOGNITO] Failed to delete message:', e);
                }

                let webhook = null;
                try {
                    webhook = await getOrCreateIncognitoWebhook(message.channel, client);
                } catch (e) {
                    console.error('[INCOGNITO] Failed to fetch/create webhook:', e);
                    return;
                }

                const username = randomIncognitoName();
                const chunks = chunkString(originalContent, 2000);

                for (let i = 0; i < chunks.length; i++) {
                    const chunk = chunks[i];
                    const hasFilesThisSend = i === 0 && files.length > 0;
                    const hasContentThisSend = Boolean(chunk && String(chunk).length > 0);
                    if (!hasFilesThisSend && !hasContentThisSend) continue;

                    try {
                        await webhook.send({
                            content: hasContentThisSend ? String(chunk) : undefined,
                            username,
                            avatarURL: INCOGNITO_AVATAR_URL,
                            files: hasFilesThisSend ? files : undefined,
                            allowedMentions: { parse: [] },
                        });
                    } catch (e) {
                        console.error('[INCOGNITO] Failed to send webhook message:', e);
                        break;
                    }
                }

                try {
                    const logsChannel = await client.channels.fetch(INCOGNITO_LOGS_CHANNEL_ID).catch(() => null);
                    if (logsChannel && logsChannel.isTextBased?.()) {
                        const attachmentLinks = attachments.map((a) => a.url);
                        const trimmed = originalContent.length > 1024
                            ? `${originalContent.slice(0, 1021)}...`
                            : originalContent;

                        const embed = new EmbedBuilder()
                            .setColor(0x2b2d31)
                            .setAuthor({
                                name: `${message.author.tag} (${message.author.id})`,
                                iconURL: message.author.displayAvatarURL?.() || undefined,
                            })
                            .addFields(
                                {
                                    name: 'Channel',
                                    value: `<#${INCOGNITO_CHANNEL_ID}> (${INCOGNITO_CHANNEL_ID})`,
                                    inline: false,
                                },
                                {
                                    name: 'Content',
                                    value: trimmed && trimmed.trim().length ? trimmed : '*No text content*',
                                    inline: false,
                                },
                                {
                                    name: 'Attachments',
                                    value: attachmentLinks.length
                                        ? (attachmentLinks.join('\n').length > 1024 ? `${attachmentLinks.join('\n').slice(0, 1021)}...` : attachmentLinks.join('\n'))
                                        : '*None*',
                                    inline: false,
                                }
                            )
                            .setTimestamp(new Date());

                        await logsChannel.send({ embeds: [embed] }).catch(() => {});
                    }
                } catch (e) {
                    console.error('[INCOGNITO] Failed to send log message:', e);
                }

                return;
            }
        } catch (e) {
            console.error('[INCOGNITO] Error:', e);
        }

        // --- Music Links Only Channel ---
        try {
            const MUSIC_LINKS_ONLY_CHANNEL_ID = '1483817618291818536';
            if (message.channelId === MUSIC_LINKS_ONLY_CHANNEL_ID) {
                const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);
                if (hasAttachments) return;

                const content = String(message.content || '').trim();
                if (!content) {
                    await message.delete().catch(() => { });
                    return;
                }

                const urlMatches = content.match(/https?:\/\/\S+/gi) || [];
                if (!urlMatches.length) {
                    await message.delete().catch(() => { });
                    return;
                }

                const allowedHosts = new Set([
                    'youtube.com', 'www.youtube.com', 'youtu.be', 'music.youtube.com', 'm.youtube.com',
                    'open.spotify.com', 'spotify.com',
                    'soundcloud.com', 'www.soundcloud.com', 'on.soundcloud.com',
                    'music.apple.com',
                    'deezer.com', 'www.deezer.com',
                    'tidal.com', 'www.tidal.com',
                    'bandcamp.com', 'www.bandcamp.com',
                    'audiomack.com', 'www.audiomack.com',
                    'mixcloud.com', 'www.mixcloud.com',
                    'vimeo.com', 'www.vimeo.com',
                    'twitch.tv', 'www.twitch.tv'
                ]);

                const allUrlsAllowed = urlMatches.every((u) => {
                    try {
                        const host = new URL(u).hostname.toLowerCase();
                        return allowedHosts.has(host);
                    } catch (_) {
                        return false;
                    }
                });

                const remainingText = content.replace(/https?:\/\/\S+/gi, '').replace(/\s+/g, '').trim();
                const hasNonLinkText = Boolean(remainingText);

                if (!allUrlsAllowed || hasNonLinkText) {
                    await message.delete().catch(() => { });
                    return;
                }

                return;
            }
        } catch (_) {
            // ignore
        }

        // --- Windows Toast Notifications (Owner Mentions / Replies) ---
        try {
            const TARGET_GUILD_ID = '1461451253606383810';
            const TARGET_USER_ID = '1085496418745200730';
            const DEBUG = process.env.WIN_NOTIFY_DEBUG === '1';

            if (message.guild.id === TARGET_GUILD_ID) {
                let shouldNotify = true;

                // Skip notifications if the target user is currently online/in Discord.
                // This requires Presence Intent enabled in the Developer Portal.
                try {
                    const targetMember = await message.guild.members.fetch(TARGET_USER_ID).catch(() => null);
                    const status = targetMember?.presence?.status;
                    if (status && status !== 'offline') {
                        // online / idle / dnd => user is in Discord, no Windows toast.
                        // If status is missing, we fall back to notifying.
                        shouldNotify = false;
                        if (DEBUG) {
                            console.log(`[WIN_NOTIFY] skipped: target status is ${status}`);
                        }
                    }
                    if (DEBUG && shouldNotify) {
                        console.log(`[WIN_NOTIFY] target status: ${status || 'unknown'} (will notify)`);
                    }
                } catch (_) {
                    // ignore and continue
                    if (DEBUG) {
                        console.log('[WIN_NOTIFY] target presence fetch failed (will notify)');
                    }
                }

                let type = null;

                // Mention trigger
                if (message.mentions?.has?.(TARGET_USER_ID)) {
                    type = 'Mention';
                }

                // Reply trigger (replying to a message authored by TARGET_USER_ID)
                if (!type && message.reference?.messageId) {
                    const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    if (refMsg?.author?.id === TARGET_USER_ID) {
                        type = 'Reply';
                    }
                }

                if (DEBUG && !type) {
                    console.log('[WIN_NOTIFY] skipped: no mention/reply trigger');
                }

                if (type && shouldNotify) {
                    const mentionRegex = new RegExp(`<@!?${TARGET_USER_ID}>`, 'g');
                    let body = String(message.content || '').replace(mentionRegex, '').trim();
                    if (!body) body = 'Sent a message!';

                    const iconUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

                    if (DEBUG) {
                        console.log(`[WIN_NOTIFY] send: type=${type} from=${message.author.tag} body=${JSON.stringify(body)}`);
                    }

                    notifyWindowsToast({
                        type,
                        senderId: message.author.id,
                        senderName: message.author.username,
                        body,
                        iconUrl,
                    }).catch(() => { });
                } else if (type && !shouldNotify && DEBUG) {
                    console.log(`[WIN_NOTIFY] skipped: trigger=${type} but target is not offline`);
                }
            } else {
                if (process.env.WIN_NOTIFY_DEBUG === '1') {
                    console.log(`[WIN_NOTIFY] skipped: guild mismatch ${message.guild.id}`);
                }
            }
        } catch (e) {
            console.error('[WIN_NOTIFY] Error:', e);
        }

        // --- Media Only Channel ---
        try {
            if (message.channelId === MEDIA_ONLY_CHANNEL_ID) {
                const hasAttachments = Boolean(message.attachments && message.attachments.size > 0);
                if (!hasAttachments) {
                    await message.delete().catch(() => { });
                    return;
                }

                await message.react(MEDIA_REACTION_EMOJI).catch(() => { });

                try {
                    if (!message.hasThread) {
                        await message.startThread({ name: 'Discussion' }).catch(() => { });
                    }
                } catch (_) {
                    // ignore
                }

                return;
            }
        } catch (e) {
            console.error('[MEDIA ONLY] Error:', e);
        }

        // --- Messenger Bridge (Mirror messages from SOURCE to TARGET) ---
        try {
            if (SOURCE_CHANNEL_ID && TARGET_CHANNEL_ID && message.channelId === SOURCE_CHANNEL_ID) {
                const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
                if (!targetChannel || !targetChannel.isTextBased?.()) return;

                const files = Array.from(message.attachments?.values?.() || []).map((att) => ({
                    attachment: att.url,
                    name: att.name || undefined,
                    description: att.description || undefined,
                }));

                const content = message.content || '';

                await message.delete().catch(() => {});
                await targetChannel.send({ content, files }).catch(() => {});

                return;
            }
        } catch (e) {
            console.error('[MESSENGER] Error:', e);
        }

        // --- Global Message Logger (HUB) ---
        try {
            if (LOG_CHANNEL_ID && message.channelId !== LOG_CHANNEL_ID) {
                const logChannel = await client.channels.fetch(LOG_CHANNEL_ID).catch(() => null);
                if (logChannel && logChannel.isTextBased?.()) {
                    const attachments = Array.from(message.attachments?.values?.() || []);
                    const attachmentLinks = attachments.map((a) => a.url);

                    const embed = new EmbedBuilder()
                        .setColor(0x2b2d31)
                        .setAuthor({
                            name: `${message.author.tag} (${message.author.id})`,
                            iconURL: message.author.displayAvatarURL?.() || undefined,
                        })
                        .addFields(
                            {
                                name: 'Channel',
                                value: `<#${message.channelId}> (${message.channelId})`,
                                inline: false,
                            },
                            {
                                name: 'Content',
                                value: message.content && message.content.trim().length
                                    ? (message.content.length > 1024 ? `${message.content.slice(0, 1021)}...` : message.content)
                                    : '*No text content*',
                                inline: false,
                            },
                            {
                                name: 'Attachments',
                                value: attachmentLinks.length
                                    ? (attachmentLinks.join('\n').length > 1024 ? `${attachmentLinks.join('\n').slice(0, 1021)}...` : attachmentLinks.join('\n'))
                                    : '*None*',
                                inline: false,
                            }
                        )
                        .setTimestamp(message.createdAt || new Date());

                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            }
        } catch (e) {
            console.error('[LOGGER] Error:', e);
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

        // --- Social Unfurl (TikTok Only) ---
        try {
            const unfurled = await unfurlSocialLink(message.content);
            if (unfurled) {
                const userTag = message.author.tag;
                await message.channel.send({
                    content: `**${userTag}:** ${unfurled}`
                }).catch(() => { });
                await message.delete().catch(() => { });
                return; // منع تكرار المعالجة
            }
        } catch (e) {
            console.error('[UNFURL] Error:', e);
        }

        // --- Prefix Commands (after filters/systems) ---
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


            if (cleanContent.includes('you want hazem or mohamed ?') || cleanContent.includes('you want hazem or mohamed ?') || cleanContent.includes('عايزه حازم ولا محمد ؟')) {
                return await message.reply('ولا حازم ولا محمد انا عايزاه انت يا عمر, مش ناوي بقا ولا ايهه انا زهقت اويي 😩🤍');
            }

            if (cleanContent.includes('هي البيضة الاول ولا الفرخه ؟') || cleanContent.includes('هي البيضة الاول ولا الفرخه') || cleanContent.includes('هي البيضة الاول ولا الفرخه ؟')) {
                return await message.reply('السكس الاول');
            }
        }

    }
};

const SOURCE_CHANNEL_ID = '1478469400418975947';
const TARGET_CHANNEL_ID = '1462025794481164461';
const LOG_CHANNEL_ID = '1478469400418975947';
const MEDIA_ONLY_CHANNEL_ID = '1461761296218456074';
const MEDIA_REACTION_EMOJI = '<:__:1479604142367572069>';

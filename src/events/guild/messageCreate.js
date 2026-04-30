const { extractCandidateUrls, isSupportedSocialVideoUrl, buildSourcedPayload, buildSourcedDirectUrlPayload } = require('../../services/socialVideoPreviewService');
const User = require('../../models/User');
const CustomReply = require('../../models/CustomReply');
const Bump = require('../../models/Bump');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const { notifyWindowsToast } = require('../../services/windowsNotifyService');
const { unfurlSocialLink } = require('../../services/socialUnfurlService');

const SOCIAL_VIDEO_DEBUG = process.env.SOCIAL_VIDEO_DEBUG === '1';

const INCOGNITO_CHANNEL_ID = '1484939016351645808';
const INCOGNITO_LOGS_CHANNEL_ID = '1484940148994084934';
const INCOGNITO_WEBHOOK_NAME = 'Incognito Room';
const INCOGNITO_AVATAR_URL = 'https://singlecolorimage.com/get/808080/128x128';

const SOCIAL_VIDEO_COOLDOWN_MS = 10_000;
const socialVideoCooldownByUser = new Map();

const DISBOARD_BOT_ID = '302050872383242240';
const BUMP_NOTIFY_ROLE_ID = '1494109618413113415';
const BUMP_REMINDER_CHANNEL_ID = '1461760293968285879';

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
        if (!message.guild) return;

        const isDisboardMessage = message.author?.id === DISBOARD_BOT_ID;
        if (!isDisboardMessage && (message.author?.bot || message.webhookId)) return;

        // --- Disboard bump reminder (2-hour timer) ---
        try {
            const isDisboard = message.author?.id === DISBOARD_BOT_ID;
            if (isDisboard) {
                const content = String(message.content || '').toLowerCase();
                const embedText = (message.embeds || [])
                    .map((e) => {
                        const parts = [];
                        if (e?.title) parts.push(e.title);
                        if (e?.description) parts.push(e.description);
                        if (e?.author?.name) parts.push(e.author.name);
                        if (e?.footer?.text) parts.push(e.footer.text);
                        const fields = Array.isArray(e?.fields) ? e.fields : [];
                        for (const f of fields) {
                            if (f?.name) parts.push(f.name);
                            if (f?.value) parts.push(f.value);
                        }
                        return parts.join('\n');
                    })
                    .join('\n')
                    .toLowerCase();

                try {
                    const preview = (embedText || content || '').replace(/\s+/g, ' ').slice(0, 160);
                    console.log(`[BUMP] DISBOARD msg received. guild=${message.guild.id} channel=${message.channelId} hasEmbeds=${(message.embeds || []).length} preview=${JSON.stringify(preview)}`);
                } catch (_) {
                    // ignore
                }

                const looksLikeBumpConfirm = content.includes('bump done') || embedText.includes('bump done');
                if (looksLikeBumpConfirm) {
                    console.log(`[BUMP] Disboard bump confirmed. guild=${message.guild.id} srcChannel=${message.channelId}`);
                    const guildId = message.guild.id;
                    const nextBump = new Date(Date.now() + 2 * 60 * 60 * 1000);

                    try {
                        const ch = await client.channels.fetch(BUMP_REMINDER_CHANNEL_ID).catch(() => null);
                        if (ch && ch.isTextBased?.()) {
                            const bumperId =
                                message.interaction?.user?.id ||
                                message.mentions?.users?.first?.()?.id ||
                                (String(message.content || '').match(/<@!?(\d+)>/)?.[1] || null);

                            const thanksEmbed = new EmbedBuilder()
                                .setColor('#000000')
                                .setDescription('**Thanks for bumping the server**');

                            await ch.send({
                                content: bumperId ? `<@${bumperId}>` : undefined,
                                embeds: [thanksEmbed],
                                allowedMentions: bumperId ? { users: [bumperId] } : { parse: [] }
                            }).catch((e) => {
                                console.error(`[BUMP] Failed to send thanks message in channel=${BUMP_REMINDER_CHANNEL_ID}`, e);
                            });
                        } else {
                            console.error(`[BUMP] Reminder channel not found or not text-based: ${BUMP_REMINDER_CHANNEL_ID}`);
                        }
                    } catch (_) {
                        // ignore
                    }

                    await Bump.findOneAndUpdate(
                        { guildId },
                        { $set: { nextBumpTime: nextBump, reminded: false } },
                        { upsert: true, new: true }
                    ).catch(() => { });
                }
            }
        } catch (_) {
            // ignore
        }

        // --- Auto-delete Discord invites (except in ticket channels/threads) ---
        try {
            const PARTNERS_CHANNEL_ID = '1475546263977066606';
            const TICKET_PARENT_CHANNEL_ID = '1461997428218794099';
            const TICKET_CATEGORY_ID = '1461484271142174790';

            if (message.channelId === PARTNERS_CHANNEL_ID) {
                // partners channel: allow invite links
                return;
            }

            const isTicketLocation = (() => {
                const ch = message.channel;
                if (!ch) return false;
                if (typeof ch.isThread === 'function' && ch.isThread()) {
                    return ch.parentId === TICKET_PARENT_CHANNEL_ID;
                }
                if (ch.parentId && ch.parentId === TICKET_CATEGORY_ID) return true;
                if (typeof ch.name === 'string' && /^ticket-/.test(ch.name)) return true;
                if (typeof ch.topic === 'string' && ch.topic.toLowerCase().includes('ticket:')) return true;
                return false;
            })();

            if (!isTicketLocation) {
                const content = String(message.content || '');
                const inviteRegex = /(?:https?:\/\/)?(?:www\.)?(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-]+/i;
                if (inviteRegex.test(content)) {
                    if (message.deletable) {
                        await message.delete().catch(() => { });
                    }
                    return;
                }
            }
        } catch (_) {
            // ignore
        }

        // --- Prefix Avatar Command (.av) ---
        try {
            const text = String(message.content || '').trim();
            if (/^\.av(\s|$)/i.test(text)) {
                const mentioned = message.mentions?.users?.first?.() || null;
                let targetUser = mentioned;

                if (!targetUser && message.reference?.messageId) {
                    const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    targetUser = refMsg?.author || null;
                }

                if (!targetUser) targetUser = message.author;

                const avatarUrl = targetUser.displayAvatarURL({ dynamic: true, size: 1024 });

                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('**❖ User Avatar**')
                    .setDescription(`**⤿ Here is the profile picture for <@${targetUser.id}>**`)
                    .setImage(avatarUrl);

                await message.reply({ embeds: [embed] }).catch(() => {});
                return;
            }
        } catch (e) {
            console.error('[AVATAR] Error:', e);
        }

        try {
            const text = String(message.content || '').trim();
            if (/^\.ba(\s|$)/i.test(text)) {
                const mentioned = message.mentions?.users?.first?.() || null;
                let targetUser = mentioned;

                if (!targetUser && message.reference?.messageId) {
                    const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                    targetUser = refMsg?.author || null;
                }

                if (!targetUser) targetUser = message.author;

                const fetchedUser = await message.client.users.fetch(targetUser.id, { force: true }).catch(() => null);
                const bannerUrl = fetchedUser?.bannerURL?.({ size: 4096, forceStatic: false });

                if (!bannerUrl) {
                    await message.reply({ content: `**⤿ <@${targetUser.id}> doesn't have a banner.**`, allowedMentions: { parse: ['users'] } }).catch(() => {});
                    return;
                }

                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setAuthor({
                        name: `${targetUser.tag}'s Banner`,
                        iconURL: targetUser.displayAvatarURL({ dynamic: true, size: 256 })
                    })
                    .setTitle('**❖ PROFILE BANNER**')
                    .setDescription(`**⤿ Banner for <@${targetUser.id}>**\n[**Open Banner**](${bannerUrl})`)
                    .setImage(bannerUrl)
                    .setFooter({ text: `Requested by ${message.author.tag}` });

                await message.reply({ embeds: [embed], allowedMentions: { parse: ['users'] } }).catch(() => {});
                return;
            }
        } catch (e) {
            console.error('[BANNER] Error:', e);
        }

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
                            console.debug(`[WIN_NOTIFY] skipped: target status is ${status}`);
                        }
                    }
                    if (DEBUG && shouldNotify) {
                        console.debug(`[WIN_NOTIFY] target status: ${status || 'unknown'} (will notify)`);
                    }
                } catch (_) {
                    // ignore and continue
                    if (DEBUG) {
                        console.debug('[WIN_NOTIFY] target presence fetch failed (will notify)');
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
                    console.debug('[WIN_NOTIFY] skipped: no mention/reply trigger');
                }

                if (type && shouldNotify) {
                    const mentionRegex = new RegExp(`<@!?${TARGET_USER_ID}>`, 'g');
                    let body = String(message.content || '').replace(mentionRegex, '').trim();
                    if (!body) body = 'Sent a message!';

                    const iconUrl = message.author.displayAvatarURL({ extension: 'png', size: 128 });

                    if (DEBUG) {
                        console.debug(`[WIN_NOTIFY] send: type=${type} from=${message.author.tag} body=${JSON.stringify(body)}`);
                    }

                    notifyWindowsToast({
                        type,
                        senderId: message.author.id,
                        senderName: message.author.username,
                        body,
                        iconUrl,
                    }).catch(() => { });
                } else if (type && !shouldNotify && DEBUG) {
                    console.debug(`[WIN_NOTIFY] skipped: trigger=${type} but target is not offline`);
                }
            } else {
                if (process.env.WIN_NOTIFY_DEBUG === '1') {
                    console.debug(`[WIN_NOTIFY] skipped: guild mismatch ${message.guild.id}`);
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

        // --- Social Video Preview (Download + Upload) ---
        try {
            const content = String(message.content || '').trim();
            if (content) {
                const urls = extractCandidateUrls(content);
                const url = urls.find((u) => isSupportedSocialVideoUrl(u));

                if (SOCIAL_VIDEO_DEBUG) {
                    try {
                        console.debug(`[SOCIAL_VIDEO] msg=${message.id} author=${message.author?.id} channel=${message.channelId} urls=${urls.length} chosen=${url || 'none'}`);
                    } catch (_) {
                        // ignore
                    }
                }

                if (url) {
                    const now = Date.now();
                    const last = socialVideoCooldownByUser.get(message.author.id) || 0;
                    if (now - last < SOCIAL_VIDEO_COOLDOWN_MS) {
                        if (SOCIAL_VIDEO_DEBUG) {
                            console.debug(`[SOCIAL_VIDEO] cooldown: author=${message.author.id} remainingMs=${SOCIAL_VIDEO_COOLDOWN_MS - (now - last)}`);
                        }
                        return;
                    }
                    socialVideoCooldownByUser.set(message.author.id, now);

                    if (SOCIAL_VIDEO_DEBUG) {
                        console.debug(`[SOCIAL_VIDEO] downloading: url=${url}`);
                    }
                    const sourced = await buildSourcedPayload({ message, url });

                    if (SOCIAL_VIDEO_DEBUG) {
                        console.debug(`[SOCIAL_VIDEO] downloaded: bytes=${sourced?.buffer?.length || 0} filename=${sourced?.filename || 'unknown'}`);
                    }

                    const embed = new EmbedBuilder()
                        .setColor(0x000000)
                        .setTitle('✦ Sourced (Minimalist).')
                        .setDescription(`> **Posted by:** ${sourced.postedByMention}`);

                    embed.addFields(
                        {
                            name: 'Stats',
                            value: `Likes: \`${sourced.likes ?? '—'}\` | Shares: \`${sourced.shares ?? '—'}\``,
                            inline: true
                        }
                    );

                    const attachment = new AttachmentBuilder(sourced.buffer, { name: sourced.filename });

                    let sentOk = false;
                    try {
                        await message.channel.send({
                            content: `**Sent by: ${sourced.postedByMention}**`,
                            embeds: [embed],
                            files: [attachment],
                            allowedMentions: { users: [message.author.id] }
                        });
                        sentOk = true;
                    } catch (sendErr) {
                        if (SOCIAL_VIDEO_DEBUG) {
                            try {
                                console.error('[SOCIAL_VIDEO] failed to send attachment:', sendErr);
                            } catch (_) {
                                // ignore
                            }
                        }
                    }

                    if (!sentOk) {
                        try {
                            const direct = await buildSourcedDirectUrlPayload({ message, url });
                            if (direct?.directUrl) {
                                await message.channel.send({
                                    content: `**Sent by: ${direct.postedByMention}**\n${direct.directUrl}`,
                                    allowedMentions: { users: [message.author.id] }
                                }).catch(() => { });
                                return;
                            }
                        } catch (_) {
                            // ignore
                        }

                        const rewritten = await unfurlSocialLink(url).catch(() => null);
                        if (rewritten) {
                            await message.channel.send({
                                content: `**Sent by: ${sourced.postedByMention}**\n${rewritten}`,
                                allowedMentions: { users: [message.author.id] }
                            }).catch(() => { });
                        }
                        return;
                    }

                    if (SOCIAL_VIDEO_DEBUG) {
                        console.debug(`[SOCIAL_VIDEO] sent: channel=${message.channelId} deletedOriginal=${Boolean(message.deletable)}`);
                    }

                    if (message.deletable) {
                        await message.delete().catch(() => { });
                    }
                    return;
                }
            }
        } catch (e) {
            try {
                const content = String(message.content || '').trim();
                const urls = extractCandidateUrls(content);
                const url = urls.find((u) => isSupportedSocialVideoUrl(u));

                if (url) {
                    try {
                        const direct = await buildSourcedDirectUrlPayload({ message, url });
                        if (direct?.directUrl) {
                            await message.channel.send({
                                content: `**Sent by: ${direct.postedByMention}**\n${direct.directUrl}`,
                                allowedMentions: { users: [message.author.id] }
                            }).catch(() => { });
                            return;
                        }
                    } catch (_) {
                        // ignore
                    }

                    const rewritten = await unfurlSocialLink(url).catch(() => null);
                    if (rewritten) {
                        await message.channel.send({
                            content: `**Sent by: <@${message.author.id}>**\n${rewritten}`,
                            allowedMentions: { users: [message.author.id] }
                        }).catch(() => { });
                    }
                }
            } catch (_) {
                // ignore
            }

            if (String(e?.message || '') === 'FILE_TOO_LARGE') {
                return;
            }
            console.error('[SOCIAL_VIDEO] Error:', e);
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

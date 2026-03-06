const User = require('../../models/User');
const CustomReply = require('../../models/CustomReply');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');
const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

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

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { spawn } = require('child_process');
let ffmpegPath = null;
try {
    ffmpegPath = require('ffmpeg-static');
} catch (_) {
    ffmpegPath = null;
}
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { recordDismissal } = require('../../utils/moderation/patternLearner');
const { generateDashboard } = require('../../utils/moderation/modDashboard');
const CustomReply = require('../../models/CustomReply');
const THEME = require('../../utils/theme');
const HelpCommand = require('../../commands/utility/help');
const SettingsCommand = require('../../commands/utility/settings');
const TraCommand = require('../../commands/utility/tra');
const User = require('../../models/User');
const MarriageProposal = require('../../models/MarriageProposal');
const { withTransaction } = require('../../services/marriageService');
const giveawayService = require('../../services/giveawayService');
const StaffApplication = require('../../models/StaffApplication');

const deletingTicketChannels = new Set();
const partnershipTicketState = new Map();
const partnershipAdminRequests = new Map();
const girlsVerificationRequests = new Map();
const girlsVerificationAdminIndex = new Map();
const ticketLanguageByChannel = new Map();

const TVCP = {
    PREFIX: 'tvcp_',
    lastChannelByUser: new Map(),
    toSmallCaps(input) {
        const map = {
            a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
            n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
        };
        return String(input || '').split('').map((ch) => {
            const lower = ch.toLowerCase();
            return map[lower] || ch;
        }).join('');
    },
    async findOwnedTempChannel(guild, ownerId, client) {
        if (!guild || !ownerId) return null;

        const registryId = client?.tempVoice?.ownerChannels?.get?.(ownerId);
        if (registryId) {
            const fromCache = guild.channels.cache.get(registryId);
            if (fromCache?.type === ChannelType.GuildVoice) return fromCache;
            const fetched = await guild.channels.fetch(registryId).catch(() => null);
            if (fetched?.type === ChannelType.GuildVoice) return fetched;
        }

        const cachedId = TVCP.lastChannelByUser.get(ownerId);
        if (cachedId) {
            const cached = guild.channels.cache.get(cachedId);
            if (cached?.type === ChannelType.GuildVoice) return cached;
        }

        return null;
    },
    async requireOwnerAndChannel(interaction, safeReply, client) {
        if (!interaction.guild) {
            await safeReply({ content: '▫️ This interaction can only be used in a server.', ephemeral: true });
            return { ok: false };
        }

        const selfMember = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
        const currentVoice = selfMember?.voice?.channel;

        // Prefer the voice channel the user is currently in.
        if (currentVoice?.type === ChannelType.GuildVoice) {
            const ownerId = client?.tempVoice?.channelOwners?.get?.(currentVoice.id);
            if (ownerId && ownerId === interaction.user.id) {
                TVCP.lastChannelByUser.set(interaction.user.id, currentVoice.id);
                return { ok: true, channel: currentVoice };
            }
            // If they are in a voice channel but not the owner of that temp channel.
            if (ownerId && ownerId !== interaction.user.id) {
                await safeReply({ content: '▫️ You are not the owner of this temp voice channel.', ephemeral: true });
                return { ok: false };
            }
        }

        // Otherwise resolve by registry (rename-safe) for users not currently connected.
        const ch = await TVCP.findOwnedTempChannel(interaction.guild, interaction.user.id, client);
        if (!ch) {
            await safeReply({ content: '▫️ You do not have an active temp voice channel.', ephemeral: true });
            return { ok: false };
        }

        const chOwner = client?.tempVoice?.channelOwners?.get?.(ch.id);
        if (chOwner && chOwner !== interaction.user.id) {
            await safeReply({ content: '▫️ You are not the owner of this temp voice channel.', ephemeral: true });
            return { ok: false };
        }

        TVCP.lastChannelByUser.set(interaction.user.id, ch.id);

        const me = interaction.guild.members.me;
        if (!me?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
            await safeReply({ content: '▫️ Missing bot permission: Manage Channels.', ephemeral: true });
            return { ok: false };
        }

        return { ok: true, channel: ch };
    }
};

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // --- 🕌 Gamified Dhikr System ---
        try {
            const dhikrService = require('../../services/dhikrService');
            const DhikrProfile = require('../../models/DhikrProfile');
            const AzkarCmd = require('../../commands/utility/اذكار');

            const DHIKR_CHANNEL_ID = '1498787130250625065';
            const ROLE_MOAZEB = '1499003787979915364';

            const safeReply = async (payload) => {
                try {
                    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                    return await interaction.reply(payload);
                } catch (_) { }
            };

            const safeUpdate = async (payload) => {
                try {
                    return await interaction.update(payload);
                } catch (_) {
                    return safeReply(payload);
                }
            };

            if (interaction.isButton?.()) {
                const id = String(interaction.customId || '');

                if (id.startsWith('welcome_say_hi_')) {
                    const targetId = id.slice('welcome_say_hi_'.length).trim();
                    await interaction.deferUpdate().catch(() => { });
                    if (!interaction.channel || !interaction.channel.isTextBased?.()) return;

                    const stickerId = '749054660769218631';
                    await interaction.channel
                        .send({ content: `👋 <@${targetId}>`, stickers: [stickerId] })
                        .catch(async () => {
                            await interaction.channel.send({ content: `👋 <@${targetId}>` }).catch(() => { });
                        });
                    return;
                }

                // Global counter buttons
                if (id.startsWith('dhikr_global:')) {
                    if (!interaction.guild) return;
                    if (interaction.channelId !== DHIKR_CHANNEL_ID) {
                        return safeReply({ content: '❌ This panel can only be used in the dhikr channel.', ephemeral: true });
                    }

                    const type = id.split(':')[1];
                    if (!['subhan', 'hamd', 'takbir'].includes(type)) {
                        return safeReply({ content: '❌ Invalid button.', ephemeral: true });
                    }

                    await interaction.deferReply({ ephemeral: true }).catch(() => { });

                    const doc = await dhikrService.incGlobal({
                        guildId: interaction.guild.id,
                        channelId: interaction.channelId,
                        type
                    });

                    await dhikrService.incUserPoints({
                        guildId: interaction.guild.id,
                        userId: interaction.user.id,
                        points: 1
                    });

                    await dhikrService.scheduleGlobalMessageRefresh({ client: interaction.client, doc });
                    return safeReply({ content: '✅ +1', ephemeral: true });
                }

                // DM personal mode
                if (id.startsWith('dhikr_dm:')) {
                    if (interaction.inGuild?.()) {
                        await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    } else {
                        await interaction.deferUpdate().catch(() => { });
                    }

                    const parts = id.split(':');
                    const action = parts[1];
                    const mode = parts[2];
                    const idxRaw = parts[3];
                    const idx = idxRaw ? Number(idxRaw) : 0;
                    const explicitGuildId = parts[4] || null;

                    if (action === 'start' && (mode === 'morning' || mode === 'evening')) {
                        const pages = AzkarCmd.PAGES?.[mode] || [];
                        if (!pages.length) return safeReply({ content: '❌ No pages configured.', ephemeral: true });

                        const guildId = interaction.guild?.id || explicitGuildId;
                        if (!guildId) {
                            return safeReply({ content: '❌ Missing guild context.', ephemeral: true });
                        }

                        const prof = await DhikrProfile.findOneAndUpdate(
                            { guildId, userId: interaction.user.id },
                            { $setOnInsert: { guildId, userId: interaction.user.id } },
                            { upsert: true, new: true }
                        ).catch(() => null);

                        const embed = AzkarCmd.buildSessionEmbed({
                            mode,
                            pageIndex: 0,
                            totalPages: pages.length,
                            text: pages[0],
                            pointsWeekly: prof?.pointsWeekly || 0
                        });

                        const row = new (require('discord.js').ActionRowBuilder)().addComponents(
                            new (require('discord.js').ButtonBuilder)()
                                .setCustomId(`dhikr_dm:done:${mode}:0:${guildId}`)
                                .setStyle(require('discord.js').ButtonStyle.Secondary)
                                .setLabel('تم'),
                            new (require('discord.js').ButtonBuilder)()
                                .setCustomId(`dhikr_dm:close:${mode}:0:${guildId}`)
                                .setStyle(require('discord.js').ButtonStyle.Secondary)
                                .setLabel('إغلاق')
                        );

                        await safeUpdate({ embeds: [embed], components: [row] });
                        return;
                    }

                    if (action === 'close') {
                        return safeUpdate({ content: '✅ تم الإغلاق.', embeds: [], components: [] });
                    }

                    if (action === 'done' && (mode === 'morning' || mode === 'evening')) {
                        const pages = AzkarCmd.PAGES?.[mode] || [];
                        if (!pages.length) return safeReply({ content: '❌ No pages configured.', ephemeral: true });

                        const guildId = interaction.guild?.id || explicitGuildId;
                        if (!guildId) {
                            return safeReply({ content: '❌ Missing guild context.', ephemeral: true });
                        }

                        const nextIndex = idx + 1;

                        // Completed full session
                        if (nextIndex >= pages.length) {
                            await dhikrService.incUserPoints({ guildId, userId: interaction.user.id, points: 50 });

                            const key = dhikrService.getDateKey(new Date());
                            const update = mode === 'morning'
                                ? { $set: { lastMorningCompleteKey: key, lastUpdatedAt: new Date() } }
                                : { $set: { lastEveningCompleteKey: key, lastUpdatedAt: new Date() } };
                            await DhikrProfile.findOneAndUpdate(
                                { guildId, userId: interaction.user.id },
                                { $setOnInsert: { guildId, userId: interaction.user.id }, ...update },
                                { upsert: true, new: true }
                            ).catch(() => null);

                            const g = await interaction.client.guilds.fetch(guildId).catch(() => null);
                            const m = g ? await g.members.fetch(interaction.user.id).catch(() => null) : null;
                            if (m) {
                                await m.roles.add(ROLE_MOAZEB).catch(() => { });
                            }

                            const doneEmbed = new (require('discord.js').EmbedBuilder)()
                                .setColor(require('../../utils/theme').COLORS.SUCCESS)
                                .setTitle('تقبل الله')
                                .setDescription('✅ تم إنهاء الأذكار كاملة. تم إضافة النقاط.')
                                .setTimestamp();

                            return safeUpdate({ embeds: [doneEmbed], components: [] });
                        }

                        await dhikrService.incUserPoints({ guildId, userId: interaction.user.id, points: 1 });

                        const prof = await DhikrProfile.findOne({ guildId, userId: interaction.user.id }).catch(() => null);

                        const embed = AzkarCmd.buildSessionEmbed({
                            mode,
                            pageIndex: nextIndex,
                            totalPages: pages.length,
                            text: pages[nextIndex],
                            pointsWeekly: prof?.pointsWeekly || 0
                        });

                        const row = new (require('discord.js').ActionRowBuilder)().addComponents(
                            new (require('discord.js').ButtonBuilder)()
                                .setCustomId(`dhikr_dm:done:${mode}:${nextIndex}:${guildId}`)
                                .setStyle(require('discord.js').ButtonStyle.Secondary)
                                .setLabel('تم'),
                            new (require('discord.js').ButtonBuilder)()
                                .setCustomId(`dhikr_dm:close:${mode}:${nextIndex}:${guildId}`)
                                .setStyle(require('discord.js').ButtonStyle.Secondary)
                                .setLabel('إغلاق')
                        );

                        await safeUpdate({ embeds: [embed], components: [row] });
                        return;
                    }
                }
            }
        } catch (e) {
            console.error('[DHIKR] Interaction error:', e);
        }

        // --- ▫️ Giveaway System Interactions (Staff + Public) ---
        try {
            if (interaction.isButton() || interaction.isModalSubmit()) {
                const handledStaff = await giveawayService.handleStaffInteraction(interaction, client);
                if (handledStaff) return;

                const handledEntries = await giveawayService.handleStaffEntriesInteraction(interaction, client);
                if (handledEntries) return;

                const handledPublic = await giveawayService.handlePublicInteraction(interaction, client);
                if (handledPublic) return;
            }
        } catch (_) {
            // ignore
        }

        // --- ▪ Translation (.tra) Interactions ---
        try {
            const safeReply = async (payload) => {
                try {
                    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                    return await interaction.reply(payload);
                } catch (_) { }
            };

            const safeUpdate = async (payload) => {
                try {
                    return await interaction.update(payload);
                } catch (_) {
                    return safeReply(payload);
                }
            };

            const id = String(interaction.customId || '');
            if (id.startsWith(TraCommand.ID_PREFIX)) {
                if (interaction.isStringSelectMenu?.() && id.startsWith(`${TraCommand.ID_PREFIX}select:`)) {
                    const parts = id.split(':');
                    const requesterId = parts[2];
                    const channelId = parts[3];
                    const repliedMessageId = parts[4];

                    if (interaction.user.id !== requesterId) {
                        return safeReply({ content: '▫️ This menu is not for you.', ephemeral: true });
                    }

                    const targetLang = String(interaction.values?.[0] || '').trim();
                    if (!targetLang) {
                        return safeReply({ content: '▫️ Invalid language.', ephemeral: true });
                    }

                    await interaction.deferReply({ ephemeral: true }).catch(() => { });

                    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
                    if (!channel?.isTextBased?.()) {
                        return safeReply({ content: '▫️ Channel not found.', ephemeral: true });
                    }

                    const replied = await channel.messages.fetch(repliedMessageId).catch(() => null);
                    if (!replied) {
                        return safeReply({ content: '▫️ The replied message was deleted.', ephemeral: true });
                    }

                    const tempMsg = {
                        reference: { messageId: repliedMessageId },
                        channel,
                        author: interaction.user
                    };

                    const result = await TraCommand.translateFromMessage({ message: tempMsg, user: interaction.user, targetLang });
                    if (!result.ok) {
                        return safeReply({ content: `✖ Failed: \`${result.error}\``, ephemeral: true });
                    }

                    const translationEmbed = TraCommand.buildTranslationEmbed({
                        original: result.original,
                        translated: result.translated,
                        from: result.detected,
                        to: targetLang,
                        user: interaction.user
                    });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`${TraCommand.ID_PREFIX}clear:${interaction.user.id}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('✖ Clear Favorite'),
                        new ButtonBuilder()
                            .setCustomId(`${TraCommand.ID_PREFIX}thread:${interaction.user.id}:${String(result.detected || 'auto')}:${String(targetLang)}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('🌐 Open Bilingual Thread')
                    );

                    await channel.send({
                        embeds: [translationEmbed],
                        components: [row],
                        reply: { messageReference: replied.id },
                        allowedMentions: { repliedUser: false }
                    }).catch(() => null);

                    const nextComponents = TraCommand.buildSelectComponents({
                        requesterId,
                        channelId,
                        repliedMessageId,
                        disabledSave: false,
                        savedLang: targetLang
                    });

                    nextComponents[1].components[0]
                        .setCustomId(`${TraCommand.ID_PREFIX}save:${requesterId}:${String(targetLang)}`)
                        .setDisabled(false);

                    await safeUpdate({ components: nextComponents }).catch(() => null);

                    return safeReply({ content: '▫️ Translation posted.', ephemeral: true });
                }

                if (interaction.isButton?.() && id.startsWith(`${TraCommand.ID_PREFIX}save:`)) {
                    const parts = id.split(':');
                    const requesterId = parts[2];
                    const lang = parts[3];

                    if (interaction.user.id !== requesterId) {
                        return safeReply({ content: '▫️ This button is not for you.', ephemeral: true });
                    }

                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const res = await TraCommand.safeSetFavorite(requesterId, lang);
                    if (!res.ok) {
                        return safeReply({ content: '✖ Database offline. Favorite not saved.', ephemeral: true });
                    }
                    return safeReply({ content: `▫️ Saved favorite: \`${String(lang).toUpperCase()}\``, ephemeral: true });
                }

                if (interaction.isButton?.() && id.startsWith(`${TraCommand.ID_PREFIX}clear:`)) {
                    const parts = id.split(':');
                    const requesterId = parts[2];
                    if (interaction.user.id !== requesterId) {
                        return safeReply({ content: '▫️ This button is not for you.', ephemeral: true });
                    }
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const res = await TraCommand.safeSetFavorite(requesterId, null);
                    if (!res.ok) {
                        return safeReply({ content: '✖ Database offline. Favorite not cleared.', ephemeral: true });
                    }
                    return safeReply({ content: '▫️ Favorite cleared.', ephemeral: true });
                }

                if (interaction.isButton?.() && id.startsWith(`${TraCommand.ID_PREFIX}thread:`)) {
                    const parts = id.split(':');
                    const requesterId = parts[2];
                    const langA = parts[3] || 'auto';
                    const langB = parts[4] || 'en';

                    if (interaction.user.id !== requesterId) {
                        return safeReply({ content: '▫️ This button is not for you.', ephemeral: true });
                    }

                    if (!interaction.inGuild?.() || !interaction.channel?.isTextBased?.()) {
                        return safeReply({ content: '▫️ Server only.', ephemeral: true });
                    }

                    await interaction.deferReply({ ephemeral: true }).catch(() => { });

                    const me = interaction.guild.members.me;
                    if (!me?.permissions?.has?.(PermissionFlagsBits.CreatePublicThreads)) {
                        return safeReply({ content: '▫️ Missing bot permission: Create Public Threads.', ephemeral: true });
                    }

                    const baseMsg = await interaction.channel.messages.fetch(interaction.message.id).catch(() => null);
                    if (!baseMsg) {
                        return safeReply({ content: '▫️ Message not found.', ephemeral: true });
                    }

                    const thread = await baseMsg.startThread({
                        name: `bilingual-${String(langA).toLowerCase()}-${String(langB).toLowerCase()}`.slice(0, 90),
                        autoArchiveDuration: 60
                    }).catch(() => null);

                    if (!thread) {
                        return safeReply({ content: '▫️ Failed to create thread.', ephemeral: true });
                    }

                    const state = {
                        threadId: thread.id,
                        guildId: interaction.guild.id,
                        channelId: thread.parentId,
                        lang1: String(langA),
                        lang2: String(langB),
                        webhookId: null
                    };

                    interaction.client.bilingualThreads?.set(thread.id, state);

                    await thread.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#000000')
                                .setTitle('▪ Bilingual Thread')
                                .setDescription(`▫️ Auto-translate is active.\n▫️ Mode: [${String(langA).toUpperCase()}] ↔ [${String(langB).toUpperCase()}]`)
                        ]
                    }).catch(() => null);

                    return safeReply({ content: '▫️ Thread opened.', ephemeral: true });
                }

                if (interaction.isButton?.() && id.startsWith(`${TraCommand.ID_PREFIX}save_pending:`)) {
                    return safeReply({ content: '▫️ Select a language first.', ephemeral: true });
                }
            }
        } catch (e) {
            console.error('[TRA] Interaction error:', e);
        }

        // HUB must not handle moderation/security interactions (owned by SHIELD)
        try {
            const id = String(interaction.customId || '');
            if (id.startsWith('mod_') || id.startsWith('dash_') || id.startsWith('settings_') || id === 'settings_menu') {
                return;
            }

        // --- 🎛️ TEMPVOICE CONTROL PANEL (TVCP) MODALS ---
        if (interaction.isModalSubmit() && interaction.customId && interaction.customId.startsWith(`${TVCP.PREFIX}modal_`)) {
            const safeReply = async (payload) => {
                try {
                    if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                    return await interaction.reply(payload);
                } catch (_) { }
            };

            if (!interaction.guild) return safeReply({ content: '▫️ This interaction can only be used in a server.', ephemeral: true });

            const req = await TVCP.requireOwnerAndChannel(interaction, safeReply, client);
            if (!req.ok) return;
            const ch = req.channel;

            if (interaction.customId === `${TVCP.PREFIX}modal_rename`) {
                const name = interaction.fields.getTextInputValue('name')?.trim();
                if (!name || name.length < 1 || name.length > 80) {
                    return safeReply({ content: '▫️ Invalid name length.', ephemeral: true });
                }
                await ch.setName(name, `TempVoice rename by ${interaction.user.tag}`).catch(() => null);
                return safeReply({ content: '▫️ Channel renamed.', ephemeral: true });
            }

            if (interaction.customId === `${TVCP.PREFIX}modal_limit`) {
                const raw = interaction.fields.getTextInputValue('limit')?.trim();
                const num = Number(raw);
                if (!Number.isFinite(num) || num < 0 || num > 99) {
                    return safeReply({ content: '▫️ Limit must be a number between 0 and 99 (0 = unlimited).', ephemeral: true });
                }
                await ch.setUserLimit(Math.floor(num), `TempVoice limit by ${interaction.user.tag}`).catch(() => null);
                return safeReply({ content: '▫️ User limit updated.', ephemeral: true });
            }

            if (interaction.customId === `${TVCP.PREFIX}modal_bitrate`) {
                const raw = interaction.fields.getTextInputValue('bitrate')?.trim();
                const kbps = Number(raw);
                if (!Number.isFinite(kbps) || kbps < 8 || kbps > 384) {
                    return safeReply({ content: '▫️ Bitrate must be between 8 and 384 (kbps).', ephemeral: true });
                }
                const bps = Math.floor(kbps) * 1000;
                await ch.setBitrate(bps, `TempVoice bitrate by ${interaction.user.tag}`).catch(() => null);
                return safeReply({ content: '▫️ Bitrate updated.', ephemeral: true });
            }

            if (interaction.customId === `${TVCP.PREFIX}modal_transfer_owner`) {
                const raw = interaction.fields.getTextInputValue('user_id')?.trim();
                const nextOwnerId = raw?.replace(/[^0-9]/g, '');
                if (!nextOwnerId) {
                    return safeReply({ content: '▫️ Invalid user id.', ephemeral: true });
                }
                if (nextOwnerId === interaction.user.id) {
                    return safeReply({ content: '▫️ You are already the owner.', ephemeral: true });
                }

                const nextMember = await interaction.guild.members.fetch(nextOwnerId).catch(() => null);
                if (!nextMember) {
                    return safeReply({ content: '▫️ Member not found in this server.', ephemeral: true });
                }

                const prevOwnerId = interaction.user.id;

                try {
                    await ch.permissionOverwrites.edit(prevOwnerId, {
                        ManageChannels: null,
                        MoveMembers: null
                    }, { reason: `TempVoice ownership transfer: remove perms from ${prevOwnerId}` }).catch(() => null);

                    await ch.permissionOverwrites.edit(nextOwnerId, {
                        ManageChannels: true,
                        MoveMembers: true
                    }, { reason: `TempVoice ownership transfer: grant perms to ${nextOwnerId}` }).catch(() => null);
                } catch (_) {
                    // ignore
                }

                return safeReply({ content: `▫️ Ownership transferred to ${nextMember.user.tag}.`, ephemeral: true });
            }
        }
        } catch (_) {
            // ignore
        }

        const safeReply = async (payload) => {
            try {
                if (interaction.deferred || interaction.replied) return await interaction.followUp(payload);
                return await interaction.reply(payload);
            } catch (_) { }
        };

        const safeEdit = async (payload) => {
            try {
                if (interaction.deferred || interaction.replied) return await interaction.editReply(payload);
                return await interaction.reply(payload);
            } catch (_) { }
        };

        const safeUpdate = async (payload) => {
            try {
                return await interaction.update(payload);
            } catch (_) {
                return safeReply(payload);
            }
        };

        // --- 🧾 Staff Applications ---
        try {
            const APPLY_CATEGORY_ID = '1499425507257876580';
            const ADMIN_LOGS_CHANNEL_ID = '1499431280356622336';
            const MODERATOR_ROLE_ID = '1461767579361349826';
            const TICKET_PANEL_CHANNEL_ID = '1461997428218794099';

            const DEPARTMENTS = {
                moderator: { label: 'Moderator', roleId: '1461767579361349826' },
                developer: { label: 'Developer', roleId: '1480301421176950987' },
                partner_manager: { label: 'Partner Manager', roleId: '1484963266177531986' },
                girls_verifier: { label: 'Girls Verifier', roleId: '1480220933187829881' }
            };

            const VERIFIED_ROLE_ID = '1480220142213267476';
            const HEHIM_ROLE_ID = '1480007171214151820';

            const isOwnerOrAdmin = async (guild, userId) => {
                if (!guild || !userId) return false;
                if (guild.ownerId && userId === guild.ownerId) return true;
                const m = await guild.members.fetch(userId).catch(() => null);
                return Boolean(m?.permissions?.has?.(PermissionFlagsBits.Administrator));
            };

            const canStaffInteract = async (guild, userId, deptRoleId) => {
                const m = await guild.members.fetch(userId).catch(() => null);
                if (!m) return false;
                if (guild.ownerId && userId === guild.ownerId) return true;
                if (m.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
                if (deptRoleId && m.roles?.cache?.has?.(deptRoleId)) return true;
                if (m.roles?.cache?.has?.(MODERATOR_ROLE_ID)) return true;
                return false;
            };

            const postLog = async (guild, embed) => {
                try {
                    const ch = await guild.channels.fetch(ADMIN_LOGS_CHANNEL_ID).catch(() => null);
                    if (ch?.isTextBased?.()) {
                        await ch.send({ embeds: [embed] }).catch(() => { });
                    }
                } catch (_) {
                    // ignore
                }
            };

            const buildApplyEmbed = () => new EmbedBuilder()
                .setColor('#000000')
                .setTitle('✦ STAFF APPLICATIONS')
                .setDescription(
                    [
                        '**Choose a department to begin.**',
                        '',
                        '- One active application at a time.',
                        '- Cooldown: `3 days` between applications.',
                        '- Auto-close if no staff response within `24h`.',
                        '',
                        '**Final step (required):**',
                        '- If accepted, you must join a VC chat interview with the staff team. This is mandatory.'
                    ].join('\n')
                )
                .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined });

            const buildReviewEmbed = (app) => {
                const votes = app?.votes || {};
                const approve = Object.values(votes).filter((v) => v === 'approve').length;
                const reject = Object.values(votes).filter((v) => v === 'reject').length;
                const avgRating = (() => {
                    const vals = Object.values(app?.ratingByUser || {}).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
                    if (!vals.length) return null;
                    const sum = vals.reduce((a, b) => a + b, 0);
                    return (sum / vals.length).toFixed(2);
                })();

                const deptLabel = DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey;
                const lines = [];
                lines.push(`**Applicant:** <@${app.userId}>`);
                lines.push(`**Department:** \`${deptLabel}\``);
                lines.push(`**Status:** \`${app.status}\``);
                lines.push('');
                lines.push(`**Votes:** Approve \`${approve}\` | Reject \`${reject}\``);
                lines.push(`**Avg Rating:** \`${avgRating ?? '—'}\``);
                if (app?.rejectionReasonDraft) {
                    lines.push('');
                    lines.push(`**Reject Reason Draft:** ${String(app.rejectionReasonDraft).slice(0, 250)}`);
                }

                return new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('✦ APPLICATION REVIEW')
                    .setDescription(lines.join('\n'))
                    .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined });
            };

            const buildAnswersEmbed = (app) => {
                const a = app?.answers || {};
                const pick = (k) => String(a?.[k] ?? '—').slice(0, 900);

                return new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('✦ APPLICATION ANSWERS')
                    .addFields(
                        { name: 'Basics', value: `Name: \`${pick('name')}\`\nAge: \`${pick('age')}\`\nCountry: \`${pick('country')}\`\nTimezone: \`${pick('timezone')}\`\nAvailability: \`${pick('availability')}\`` },
                        { name: 'Q1', value: pick('q1') },
                        { name: 'Q2', value: pick('q2') },
                        { name: 'Q3', value: pick('q3') },
                        { name: 'Q4', value: pick('q4') },
                        { name: 'Q5', value: pick('q5') },
                        { name: 'Q6', value: pick('q6') },
                        { name: 'Q7', value: pick('q7') },
                        { name: 'Q8', value: pick('q8') },
                        { name: 'Q9', value: pick('q9') },
                        { name: 'Q10', value: pick('q10') }
                    );
            };

            const buildTranscriptEmbed = (app, { decidedById, decision } = {}) => {
                const a = app?.answers || {};
                const votes = app?.votes || {};
                const approve = Object.values(votes).filter((v) => v === 'approve').length;
                const reject = Object.values(votes).filter((v) => v === 'reject').length;
                const avgRating = (() => {
                    const vals = Object.values(app?.ratingByUser || {}).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n >= 1 && n <= 5);
                    if (!vals.length) return null;
                    const sum = vals.reduce((x, y) => x + y, 0);
                    return (sum / vals.length).toFixed(2);
                })();

                const deptLabel = DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey;
                const notes = Array.isArray(app?.internalNotes) ? app.internalNotes : [];
                const notesText = notes
                    .slice(-5)
                    .map((n) => `- <@${n.by}>: ${String(n.note || '').slice(0, 120)}`)
                    .join('\n') || '—';

                const basics = [
                    `Applicant: <@${app.userId}>`,
                    `Department: \`${deptLabel}\``,
                    `Status: \`${app.status}\``,
                    decision ? `Decision: \`${decision}\`` : null,
                    decidedById ? `By: <@${decidedById}>` : null,
                    app.channelId ? `Channel: <#${app.channelId}>` : null,
                    `Votes: Approve \`${approve}\` | Reject \`${reject}\``,
                    `Avg Rating: \`${avgRating ?? '—'}\``
                ].filter(Boolean).join('\n');

                const qa = (k, label) => {
                    const v = String(a?.[k] ?? '—');
                    return { name: label, value: v.length ? v.slice(0, 1024) : '—' };
                };

                const embed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('✦ APPLICATION TRANSCRIPT')
                    .setDescription(basics)
                    .addFields(
                        { name: 'Basics', value: `Name: \`${String(a?.name ?? '—').slice(0, 64)}\`\nAge: \`${String(a?.age ?? '—').slice(0, 16)}\`\nCountry: \`${String(a?.country ?? '—').slice(0, 64)}\`\nTimezone: \`${String(a?.timezone ?? '—').slice(0, 32)}\`\nAvailability: \`${String(a?.availability ?? '—').slice(0, 64)}\`` },
                        qa('q1', 'Q1'),
                        qa('q2', 'Q2'),
                        qa('q3', 'Q3'),
                        qa('q4', 'Q4'),
                        qa('q5', 'Q5'),
                        qa('q6', 'Q6'),
                        qa('q7', 'Q7'),
                        qa('q8', 'Q8'),
                        qa('q9', 'Q9'),
                        qa('q10', 'Q10'),
                        { name: 'Internal Notes (last 5)', value: notesText.slice(0, 1024) }
                    )
                    .setTimestamp();

                if (app?.rejectionReason) {
                    embed.addFields({ name: 'Rejection Reason', value: String(app.rejectionReason).slice(0, 1024) });
                }

                return embed;
            };

            const buildReviewComponents = (appId) => {
                const row1 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`staffapp:vote:approve:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Vote Approve'),
                    new ButtonBuilder().setCustomId(`staffapp:vote:reject:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Vote Reject'),
                    new ButtonBuilder().setCustomId(`staffapp:rate:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Rate 1-5'),
                    new ButtonBuilder().setCustomId(`staffapp:note:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Internal Note')
                );

                const row2 = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`staffapp:reason:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Reject Reason (Draft)'),
                    new ButtonBuilder().setCustomId(`staffapp:accept:${appId}`).setStyle(ButtonStyle.Success).setLabel('Accept'),
                    new ButtonBuilder().setCustomId(`staffapp:reject:${appId}`).setStyle(ButtonStyle.Danger).setLabel('Reject'),
                    new ButtonBuilder().setCustomId(`staffapp:close:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Close')
                );

                return [row1, row2];
            };

            const refreshReviewMessage = async (channel, messageId, app) => {
                try {
                    const msg = await channel.messages.fetch(messageId).catch(() => null);
                    if (!msg) return;
                    await msg.edit({ embeds: [buildAnswersEmbed(app), buildReviewEmbed(app)], components: buildReviewComponents(String(app._id)) }).catch(() => { });
                } catch (_) {
                    // ignore
                }
            };

            // Apply panel button
            if (interaction.isButton?.() && interaction.customId === 'staffapp:open') {
                if (!interaction.guild) return safeReply({ content: '✗ Server only.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true }).catch(() => { });

                const deptRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('staffapp:dept')
                        .setPlaceholder('Select a department')
                        .addOptions(
                            { label: 'Moderator', value: 'moderator' },
                            { label: 'Developer', value: 'developer' },
                            { label: 'Partner Manager', value: 'partner_manager' },
                            { label: 'Girls Verifier', value: 'girls_verifier' }
                        )
                );

                return safeEdit({ embeds: [buildApplyEmbed()], components: [deptRow] });
            }

            // Department select -> create draft + open modal 1
            if (interaction.isStringSelectMenu?.() && interaction.customId === 'staffapp:dept') {
                if (!interaction.guild) return safeReply({ content: '✗ Server only.', ephemeral: true });

                const deptKey = String(interaction.values?.[0] || '');
                const dept = DEPARTMENTS[deptKey];
                if (!dept) return safeReply({ content: '✗ Invalid department.', ephemeral: true });

                if (deptKey === 'girls_verifier') {
                    const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    const hasVerified = Boolean(member?.roles?.cache?.has?.(VERIFIED_ROLE_ID));
                    const hasHeHim = Boolean(member?.roles?.cache?.has?.(HEHIM_ROLE_ID));
                    if (!hasVerified) {
                        return safeReply({ content: `✗ You must be verified first.\nOpen a verification ticket here: <#${TICKET_PANEL_CHANNEL_ID}>`, ephemeral: true });
                    }
                    if (hasHeHim) {
                        return safeReply({ content: '✗ This department requires a verified female account.', ephemeral: true });
                    }
                }

                const existingActive = await StaffApplication.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, status: { $in: ['draft', 'submitted', 'under_review'] } }).catch(() => null);
                if (existingActive) {
                    const chId = existingActive?.channelId;
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId(`staffapp:close_active:${String(existingActive._id)}`)
                            .setStyle(ButtonStyle.Secondary)
                            .setLabel('Close the active application')
                    );
                    return safeReply({ content: `✗ You already have an active application.${chId ? `\nChannel: <#${chId}>` : ''}`, components: [row], ephemeral: true });
                }

                const last = await StaffApplication.findOne({ guildId: interaction.guild.id, userId: interaction.user.id, status: { $in: ['accepted', 'rejected', 'closed'] } })
                    .sort({ decidedAt: -1, closedAt: -1, updatedAt: -1 })
                    .lean()
                    .catch(() => null);

                const lastAt = last?.lastAppliedAt || last?.submittedAt || last?.createdAt;
                if (lastAt) {
                    const ms = Date.now() - new Date(lastAt).getTime();
                    const cooldownMs = 3 * 24 * 60 * 60 * 1000;
                    if (ms < cooldownMs) {
                        const hrs = Math.ceil((cooldownMs - ms) / (60 * 60 * 1000));
                        return safeReply({ content: `✗ Cooldown active. Try again in ~${hrs} hour(s).`, ephemeral: true });
                    }
                }

                const app = await StaffApplication.create({
                    guildId: interaction.guild.id,
                    userId: interaction.user.id,
                    departmentKey: deptKey,
                    departmentRoleId: dept.roleId,
                    status: 'draft',
                    applicantTag: interaction.user.tag,
                    lastAppliedAt: new Date()
                }).catch(() => null);

                if (!app) return safeReply({ content: '✗ Failed to start application.', ephemeral: true });

                const appId = String(app._id);

                const modal = new ModalBuilder()
                    .setCustomId(`staffapp:modal:part1:${appId}`)
                    .setTitle('Staff Application (1/3)');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('name').setLabel('Your Name').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Your Age').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(16)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('country').setLabel('Country').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('timezone').setLabel('Timezone (e.g. UTC+3)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(32)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('availability').setLabel('Availability (hours/day)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(64))
                );

                try {
                    return await interaction.showModal(modal);
                } catch (e) {
                    await StaffApplication.deleteOne({ _id: app._id }).catch(() => { });
                    return safeReply({ content: '✗ Failed to open the application form. Please try again.', ephemeral: true });
                }
            }

            // Modal 1
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:part1:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app || app.userId !== interaction.user.id) return safeEdit({ content: '✗ Application not found.' });

                app.answers = {
                    ...(app.answers || {}),
                    name: interaction.fields.getTextInputValue('name'),
                    age: interaction.fields.getTextInputValue('age'),
                    country: interaction.fields.getTextInputValue('country'),
                    timezone: interaction.fields.getTextInputValue('timezone'),
                    availability: interaction.fields.getTextInputValue('availability')
                };
                await app.save().catch(() => { });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`staffapp:continue2:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Continue (2/3)')
                );
                return safeEdit({ content: '✓ Saved. Continue.', components: [row] });
            }

            // Continue -> Modal 2 (Q1-Q5)
            if (interaction.isButton?.() && String(interaction.customId || '').startsWith('staffapp:continue2:')) {
                const appId = String(interaction.customId).split(':')[2];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app || app.userId !== interaction.user.id) return safeReply({ content: '✗ Application not found.', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId(`staffapp:modal:part2:${appId}`)
                    .setTitle('Staff Application (2/3)');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q1').setLabel('Q1: Why do you want this position?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q2').setLabel('Q2: What makes you a good fit?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q3').setLabel('Q3: Past experience (if any)?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q4').setLabel('Q4: How do you handle conflict?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q5').setLabel('Q5: What are your rules/values as staff?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900))
                );

                return interaction.showModal(modal);
            }

            // Modal 2 submit
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:part2:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app || app.userId !== interaction.user.id) return safeEdit({ content: '✗ Application not found.' });

                app.answers = {
                    ...(app.answers || {}),
                    q1: interaction.fields.getTextInputValue('q1'),
                    q2: interaction.fields.getTextInputValue('q2'),
                    q3: interaction.fields.getTextInputValue('q3'),
                    q4: interaction.fields.getTextInputValue('q4'),
                    q5: interaction.fields.getTextInputValue('q5')
                };
                await app.save().catch(() => { });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`staffapp:continue3:${appId}`).setStyle(ButtonStyle.Secondary).setLabel('Continue (3/3)')
                );
                return safeEdit({ content: '✓ Saved. Continue.', components: [row] });
            }

            // Continue -> Modal 3 (Q6-Q10)
            if (interaction.isButton?.() && String(interaction.customId || '').startsWith('staffapp:continue3:')) {
                const appId = String(interaction.customId).split(':')[2];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app || app.userId !== interaction.user.id) return safeReply({ content: '✗ Application not found.', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId(`staffapp:modal:part3:${appId}`)
                    .setTitle('Staff Application (3/3)');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q6').setLabel('Q6: Your strengths (3 points).').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q7').setLabel('Q7: Your weaknesses (and how you improve).').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q8').setLabel('Q8: Scenario: member breaks rules publicly.').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q9').setLabel('Q9: Scenario: staff abuse of power.').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q10').setLabel('Q10: Anything else?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900))
                );

                return interaction.showModal(modal);
            }

            // Modal 3 submit -> create channel and post review
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:part3:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app || app.userId !== interaction.user.id) return safeEdit({ content: '✗ Application not found.' });

                app.answers = {
                    ...(app.answers || {}),
                    q6: interaction.fields.getTextInputValue('q6'),
                    q7: interaction.fields.getTextInputValue('q7'),
                    q8: interaction.fields.getTextInputValue('q8'),
                    q9: interaction.fields.getTextInputValue('q9'),
                    q10: interaction.fields.getTextInputValue('q10')
                };
                app.status = 'under_review';
                app.submittedAt = new Date();
                app.lastApplicantActivityAt = new Date();
                await app.save().catch(() => { });

                const guild = interaction.guild;
                const userSlug = String(interaction.user.username || 'user').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 16) || interaction.user.id;
                const channelName = `app-${app.departmentKey}-${userSlug}`.slice(0, 100);

                const overwrites = [
                    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] }
                ];

                const deptRole = await guild.roles.fetch(app.departmentRoleId).catch(() => null);
                if (deptRole) {
                    overwrites.push({ id: deptRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
                }

                const modRole = await guild.roles.fetch(MODERATOR_ROLE_ID).catch(() => null);
                if (modRole) {
                    overwrites.push({ id: modRole.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory] });
                }

                const created = await guild.channels.create({
                    name: channelName,
                    type: ChannelType.GuildText,
                    parent: APPLY_CATEGORY_ID,
                    permissionOverwrites: overwrites,
                    topic: `Staff Application | User: ${interaction.user.tag} (${interaction.user.id}) | Dept: ${app.departmentKey} | AppId: ${String(app._id)}`
                }).catch(() => null);

                const appChannel = created;
                if (!appChannel || !appChannel.isTextBased?.()) return safeEdit({ content: '✗ Failed to create application channel.' });

                app.channelId = appChannel.id;
                await app.save().catch(() => { });

                const reviewMsg = await appChannel.send({
                    content: `Applicant: <@${app.userId}> | Department: **${DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey}**`,
                    embeds: [buildAnswersEmbed(app), buildReviewEmbed(app)],
                    components: buildReviewComponents(String(app._id))
                }).catch(() => null);

                if (reviewMsg) {
                    app.reviewMessageId = reviewMsg.id;
                    await app.save().catch(() => { });
                }

                return safeEdit({ content: `✓ Submitted. Channel: <#${appChannel.id}>`, components: [] });
            }

            // Applicant closes their own active application (ephemeral button)
            if (interaction.isButton?.() && String(interaction.customId || '').startsWith('staffapp:close_active:')) {
                if (!interaction.guild) return safeReply({ content: '✗ Server only.', ephemeral: true });
                await interaction.deferReply({ ephemeral: true }).catch(() => { });

                const appId = String(interaction.customId).split(':')[2];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app) return safeEdit({ content: '✗ Application not found.' });
                if (app.guildId !== interaction.guild.id) return safeEdit({ content: '✗ Invalid application.' });
                if (app.userId !== interaction.user.id) return safeEdit({ content: '✗ You can only close your own application.' });
                if (!['draft', 'submitted', 'under_review'].includes(app.status)) {
                    return safeEdit({ content: '✗ This application is not active.' });
                }

                app.status = 'closed';
                app.closedAt = new Date();
                app.lastApplicantActivityAt = new Date();
                await app.save().catch(() => { });

                if (app.channelId) {
                    const ch = await interaction.guild.channels.fetch(app.channelId).catch(() => null);
                    if (ch?.isTextBased?.()) {
                        await ch.permissionOverwrites.edit(app.userId, { ViewChannel: false }).catch(() => { });
                        await ch.send({ content: '▫️ Application closed by the applicant.' }).catch(() => { });
                    }
                }

                await postLog(interaction.guild, buildTranscriptEmbed(app, { decidedById: interaction.user.id, decision: 'closed_by_applicant' }));
                return safeEdit({ content: '✓ Closed your active application.' });
            }

            // Staff actions in application channel
            if (interaction.isButton?.() && String(interaction.customId || '').startsWith('staffapp:')) {
                const parts = String(interaction.customId).split(':');
                const action = parts[1];
                const appId = parts[parts.length - 1];

                const needsApp = ['vote', 'rate', 'note', 'reason', 'accept', 'reject', 'close'].includes(action);
                if (needsApp) {
                    if (!interaction.guild) return;
                    const app = await StaffApplication.findById(appId).catch(() => null);
                    if (!app) return safeReply({ content: '✗ Application not found.', ephemeral: true });
                    if (interaction.channelId !== app.channelId) return safeReply({ content: '✗ Use this in the application channel.', ephemeral: true });

                    if (interaction.user.id === app.userId) {
                        return safeReply({ content: '✗ Applicants cannot use staff controls.', ephemeral: true });
                    }

                    if (action === 'vote') {
                        await interaction.deferReply({ ephemeral: true }).catch(() => { });
                        const voteValue = parts[2];
                        if (voteValue !== 'approve' && voteValue !== 'reject') return safeEdit({ content: '✗ Invalid vote.' });
                        const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                        if (!ok) return safeEdit({ content: '✗ Staff only.' });

                        app.votes = { ...(app.votes || {}), [interaction.user.id]: voteValue };
                        app.lastStaffActivityAt = new Date();
                        await app.save().catch(() => { });
                        await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                        return safeEdit({ content: `✓ Vote saved: \`${voteValue}\`` });
                    }

                    if (action === 'rate') {
                        await interaction.deferReply({ ephemeral: true }).catch(() => { });
                        const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                        if (!ok) return safeEdit({ content: '✗ Staff only.' });

                        const menu = new ActionRowBuilder().addComponents(
                            new StringSelectMenuBuilder()
                                .setCustomId(`staffapp:rate_select:${appId}`)
                                .setPlaceholder('Select rating')
                                .addOptions(
                                    { label: '1', value: '1' },
                                    { label: '2', value: '2' },
                                    { label: '3', value: '3' },
                                    { label: '4', value: '4' },
                                    { label: '5', value: '5' }
                                )
                        );
                        return safeEdit({ content: 'Select rating:', components: [menu] });
                    }

                    if (action === 'note') {
                        const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                        if (!ok) return safeEdit({ content: '✗ Staff only.' });

                        const modal = new ModalBuilder()
                            .setCustomId(`staffapp:modal:note:${appId}`)
                            .setTitle('Internal Note');
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('note').setLabel('Note').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)
                            )
                        );
                        return interaction.showModal(modal).catch(() => safeReply({ content: '✗ Failed to open modal.', ephemeral: true }));
                    }

                    if (action === 'reason') {
                        const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                        if (!ok) return safeEdit({ content: '✗ Staff only.' });

                        const modal = new ModalBuilder()
                            .setCustomId(`staffapp:modal:reason:${appId}`)
                            .setTitle('Reject Reason (Draft)');
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('reason').setLabel('Draft reason (for staff)')
                                    .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)
                            )
                        );
                        return interaction.showModal(modal).catch(() => safeReply({ content: '✗ Failed to open modal.', ephemeral: true }));
                    }

                    if (action === 'accept') {
                        await interaction.deferReply({ ephemeral: true }).catch(() => { });
                        const ok = await isOwnerOrAdmin(interaction.guild, interaction.user.id);
                        if (!ok) return safeEdit({ content: '✗ Owner/Admin only.' });

                        const approve = Object.values(app.votes || {}).filter((v) => v === 'approve').length;
                        if (approve < 2 && !(interaction.guild.ownerId && interaction.user.id === interaction.guild.ownerId)) {
                            return safeEdit({ content: '✗ Need at least 2 approve votes.' });
                        }

                        const member = await interaction.guild.members.fetch(app.userId).catch(() => null);
                        if (member) {
                            await member.roles.add(app.departmentRoleId).catch(() => { });
                        }

                        app.status = 'accepted';
                        app.decidedAt = new Date();
                        app.lastStaffActivityAt = new Date();
                        await app.save().catch(() => { });

                        await interaction.channel.permissionOverwrites.edit(app.userId, { ViewChannel: false }).catch(() => { });

                        try {
                            const user = await interaction.client.users.fetch(app.userId).catch(() => null);
                            if (user) {
                                const deptLabel = DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey;
                                const dm = new EmbedBuilder()
                                    .setColor('#000000')
                                    .setTitle('✦ APPLICATION ACCEPTED')
                                    .setDescription(
                                        [
                                            `You have been **accepted** as **${deptLabel}**.`,
                                            '',
                                            '**Instructions:**',
                                            '- Read all staff channels and pinned messages.',
                                            '- Follow server rules and staff chain of command.',
                                            '- Use the ticket panel for reports: <#1461997428218794099>.',
                                            '- If you need help, contact the owner/admin team.',
                                            '',
                                            'Welcome aboard.'
                                        ].join('\n')
                                    );
                                await user.send({ embeds: [dm] }).catch(() => { });
                            }
                        } catch (_) {
                            // ignore
                        }

                        const logEmbed = new EmbedBuilder()
                            .setColor('#000000')
                            .setTitle('✦ APPLICATION ACCEPTED')
                            .setDescription(`Applicant: <@${app.userId}>\nDepartment: \`${DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey}\`\nBy: <@${interaction.user.id}>\nChannel: <#${app.channelId}>`)
                            .setTimestamp();
                        await postLog(interaction.guild, logEmbed);

                        await postLog(interaction.guild, buildTranscriptEmbed(app, { decidedById: interaction.user.id, decision: 'accepted' }));

                        await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                        return safeEdit({ content: '✓ Accepted and role assigned.', components: [] });
                    }

                    if (action === 'reject') {
                        const ok = await isOwnerOrAdmin(interaction.guild, interaction.user.id);
                        if (!ok) return safeEdit({ content: '✗ Owner/Admin only.' });

                        const modal = new ModalBuilder().setCustomId(`staffapp:modal:reject:${appId}`).setTitle('Reject Reason');
                        modal.addComponents(
                            new ActionRowBuilder().addComponents(
                                new TextInputBuilder().setCustomId('reason').setLabel('Reason (sent to applicant)')
                                    .setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)
                            )
                        );
                        return interaction.showModal(modal).catch(() => safeReply({ content: '✗ Failed to open modal.', ephemeral: true }));
                    }

                    if (action === 'close') {
                        await interaction.deferReply({ ephemeral: true }).catch(() => { });
                        const ok = await isOwnerOrAdmin(interaction.guild, interaction.user.id);
                        if (!ok) return safeEdit({ content: '✗ Owner/Admin only.' });

                        app.status = 'closed';
                        app.closedAt = new Date();
                        app.lastStaffActivityAt = new Date();
                        await app.save().catch(() => { });

                        await interaction.channel.permissionOverwrites.edit(app.userId, { ViewChannel: false }).catch(() => { });
                        await postLog(interaction.guild, buildTranscriptEmbed(app, { decidedById: interaction.user.id, decision: 'closed' }));
                        await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                        return safeEdit({ content: '✓ Closed.' });
                    }
                }
            }

            // Rating select
            if (interaction.isStringSelectMenu?.() && String(interaction.customId || '').startsWith('staffapp:rate_select:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[2];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app) return safeEdit({ content: '✗ Application not found.' });
                if (interaction.channelId !== app.channelId) return safeEdit({ content: '✗ Use this in the application channel.' });

                if (interaction.user.id === app.userId) return safeEdit({ content: '✗ Applicants cannot use staff controls.' });

                const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                if (!ok) return safeEdit({ content: '✗ Staff only.' });

                const val = Number(interaction.values?.[0]);
                if (!Number.isFinite(val) || val < 1 || val > 5) return safeEdit({ content: '✗ Invalid rating.' });

                app.ratingByUser = { ...(app.ratingByUser || {}), [interaction.user.id]: val };
                app.lastStaffActivityAt = new Date();
                await app.save().catch(() => { });
                await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                return safeEdit({ content: `✓ Rating saved: ${val}/5`, components: [] });
            }

            // Internal note modal
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:note:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app) return safeEdit({ content: '✗ Application not found.' });
                if (interaction.channelId !== app.channelId) return safeEdit({ content: '✗ Use this in the application channel.' });

                if (interaction.user.id === app.userId) return safeEdit({ content: '✗ Applicants cannot use staff controls.' });

                const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                if (!ok) return safeEdit({ content: '✗ Staff only.' });

                const note = String(interaction.fields.getTextInputValue('note') || '').trim();
                if (!note) return safeEdit({ content: '✗ Empty note.' });

                app.internalNotes = Array.isArray(app.internalNotes) ? app.internalNotes : [];
                app.internalNotes.push({ by: interaction.user.id, at: new Date(), note: note.slice(0, 900) });
                app.lastStaffActivityAt = new Date();
                await app.save().catch(() => { });
                return safeEdit({ content: '✓ Note saved.' });
            }

            // Reject reason draft modal
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:reason:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app) return safeEdit({ content: '✗ Application not found.' });
                if (interaction.channelId !== app.channelId) return safeEdit({ content: '✗ Use this in the application channel.' });

                if (interaction.user.id === app.userId) return safeEdit({ content: '✗ Applicants cannot use staff controls.' });

                const ok = await canStaffInteract(interaction.guild, interaction.user.id, app.departmentRoleId);
                if (!ok) return safeEdit({ content: '✗ Staff only.' });

                const reason = String(interaction.fields.getTextInputValue('reason') || '').trim();
                if (!reason) return safeEdit({ content: '✗ Empty reason.' });

                app.rejectionReasonDraft = reason.slice(0, 900);
                app.lastStaffActivityAt = new Date();
                await app.save().catch(() => { });
                await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                return safeEdit({ content: '✓ Draft reason saved.' });
            }

            // Reject final modal
            if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('staffapp:modal:reject:')) {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const appId = String(interaction.customId).split(':')[3];
                const app = await StaffApplication.findById(appId).catch(() => null);
                if (!app) return safeEdit({ content: '✗ Application not found.' });
                if (interaction.channelId !== app.channelId) return safeEdit({ content: '✗ Use this in the application channel.' });

                if (interaction.user.id === app.userId) return safeEdit({ content: '✗ Applicants cannot use staff controls.' });

                const ok = await isOwnerOrAdmin(interaction.guild, interaction.user.id);
                if (!ok) return safeEdit({ content: '✗ Owner/Admin only.' });

                const reason = String(interaction.fields.getTextInputValue('reason') || '').trim();
                if (!reason) return safeEdit({ content: '✗ Reason required.' });

                app.status = 'rejected';
                app.rejectionReason = reason.slice(0, 900);
                app.decidedAt = new Date();
                app.lastStaffActivityAt = new Date();
                await app.save().catch(() => { });

                await interaction.channel.permissionOverwrites.edit(app.userId, { ViewChannel: false }).catch(() => { });

                try {
                    const user = await interaction.client.users.fetch(app.userId).catch(() => null);
                    if (user) {
                        const deptLabel = DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey;
                        const dm = new EmbedBuilder()
                            .setColor('#000000')
                            .setTitle('✦ APPLICATION REJECTED')
                            .setDescription(
                                [
                                    `Your application for **${deptLabel}** was **rejected**.`,
                                    '',
                                    `**Reason:** ${app.rejectionReason}`,
                                    '',
                                    'You may apply again after the cooldown.'
                                ].join('\n')
                            );
                        await user.send({ embeds: [dm] }).catch(() => { });
                    }
                } catch (_) {
                    // ignore
                }

                const logEmbed = new EmbedBuilder()
                    .setColor('#000000')
                    .setTitle('✦ APPLICATION REJECTED')
                    .setDescription(`Applicant: <@${app.userId}>\nDepartment: \`${DEPARTMENTS?.[app.departmentKey]?.label || app.departmentKey}\`\nBy: <@${interaction.user.id}>\nReason: ${app.rejectionReason}\nChannel: <#${app.channelId}>`)
                    .setTimestamp();
                await postLog(interaction.guild, logEmbed);

                await postLog(interaction.guild, buildTranscriptEmbed(app, { decidedById: interaction.user.id, decision: 'rejected' }));

                await refreshReviewMessage(interaction.channel, app.reviewMessageId, app);
                return safeEdit({ content: '✓ Rejected and DM sent.', components: [] });
            }
        } catch (e) {
            console.error('[STAFFAPP] error:', e);
        }

        const getDynEmoji = () => `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
        const genGirlsCode = () => `ELORA-${Math.floor(100 + Math.random() * 900)}`;

        const downloadUrlToFile = async (url, outPath) => {
            const u = new URL(url);
            const lib = u.protocol === 'http:' ? http : https;

            await new Promise((resolve, reject) => {
                const req = lib.get(u, (res) => {
                    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.resume();
                        downloadUrlToFile(res.headers.location, outPath).then(resolve).catch(reject);
                        return;
                    }

                    if (res.statusCode !== 200) {
                        res.resume();
                        reject(new Error(`Failed to download audio. Status: ${res.statusCode}`));
                        return;
                    }

                    const file = fs.createWriteStream(outPath);
                    res.pipe(file);
                    file.on('finish', () => file.close(resolve));
                    file.on('error', (err) => {
                        try { file.close(() => { }); } catch (_) { }
                        reject(err);
                    });
                });

                req.on('error', reject);
                req.setTimeout(20_000, () => {
                    try { req.destroy(new Error('Download timeout')); } catch (_) { }
                });
            });

            return outPath;
        };

        const tryConvertToMp3 = async (inputPath, outputPath) => {
            await new Promise((resolve, reject) => {
                const args = ['-y', '-i', inputPath, '-vn', '-ar', '48000', '-ac', '2', '-b:a', '128k', outputPath];
                const bin = ffmpegPath || 'ffmpeg';
                const p = spawn(bin, args, { windowsHide: true });

                let stderr = '';
                p.stderr?.on?.('data', (d) => { stderr += String(d); });

                p.on('error', reject);
                p.on('close', (code) => {
                    if (code === 0) return resolve();
                    reject(new Error(`ffmpeg exited with code ${code}. ${stderr.slice(0, 500)}`));
                });
            });

            return outputPath;
        };

        const isAudioAttachment = (att) => {
            const ct = String(att?.contentType || '').toLowerCase();
            const name = String(att?.name || '').toLowerCase();
            if (ct.startsWith('audio/')) return true;
            return Boolean(name.match(/\.(ogg|mp3|m4a|wav|webm)$/i));
        };

        const isImageAttachment = (att) => {
            const ct = String(att?.contentType || '').toLowerCase();
            const name = String(att?.name || '').toLowerCase();
            if (ct.startsWith('image/')) return true;
            return Boolean(name.match(/\.(png|jpe?g|gif|webp)$/i));
        };

        const parseTicketOwnerFromTopic = (topic) => {
            const t = String(topic || '');
            const match = t.match(/User:\s*[^()]*\((\d+)\)/i);
            return match?.[1] || null;
        };

        const getTicketTypeFromTopic = (topic) => {
            const t = String(topic || '');
            const match = t.match(/Ticket:\s*([a-z0-9_\-]+)\b/i);
            return match?.[1] || null;
        };

        const boldArabic = (text) => {
            const t = String(text || '').trim();
            if (!t) return t;
            return `**${t.replace(/\*\*/g, '*\\*')}**`;
        };

        const buildTicketLanguagePicker = ({ ticketType }) => {
            const embed = new EmbedBuilder()
                .setColor(THEME?.COLORS?.ACCENT || 0x9b5cff)
                .setTitle('✦  Language / اللغة')
                .setDescription(
                    `**English:** Select a language to continue this ticket.\n` +
                    `${boldArabic('اختر اللغة التي ترغب أن يتابع بها البوت هذه التذكرة.')}`
                )
                .setFooter(THEME?.FOOTER || null);

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`ticket_lang_en_${ticketType}`)
                    .setLabel('English')
                    .setStyle(ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`ticket_lang_ar_${ticketType}`)
                    .setLabel('العربية')
                    .setStyle(ButtonStyle.Secondary)
            );

            return { embed, row };
        };

        const TICKET_CONTROL_ALLOWED_ROLE_IDS = new Set([
            '1461766927306457109',
            '1461767579361349826',
            '1484963266177531986'
        ]);
        const TICKET_CONTROL_OWNER_USER_ID = '1085496418745200730';

        const canUseTicketControls = (interaction) => {
            if (!interaction?.member) return false;
            if (interaction.user?.id === TICKET_CONTROL_OWNER_USER_ID) return true;

            const roles = interaction.member?.roles?.cache;
            if (!roles) return false;
            return roles.some((r) => TICKET_CONTROL_ALLOWED_ROLE_IDS.has(r.id));
        };

        const buildTicketControlPanel = () => {
            const toSmallCaps = (input) => {
                const map = {
                    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                    n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
                };
                return String(input || '').split('').map((ch) => {
                    const lower = ch.toLowerCase();
                    return map[lower] || ch;
                }).join('');
            };

            const embed = new EmbedBuilder()
                .setColor(0x2b2d31)
                .setTitle(`⟡  ${toSmallCaps('Ticket Control')}  ⟡`)
                .setDescription(
                    `**${toSmallCaps('Staff Panel')}**\n` +
                    `━━━━━━━━━━━━━━━━━━━━━━\n` +
                    `${toSmallCaps('Lock')}    ⟡    ${toSmallCaps('Unlock')}    ⟡    ${toSmallCaps('Close')}`
                )
                .setFooter(THEME?.FOOTER || null);

            const row1 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_ctrl_lock')
                    .setLabel(`${toSmallCaps('Lock')}`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('ticket_ctrl_unlock')
                    .setLabel(`${toSmallCaps('Unlock')}`)
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId('ticket_ctrl_close')
                    .setLabel(`${toSmallCaps('Close')}`)
                    .setStyle(ButtonStyle.Secondary)
            );

            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_ctrl_get_verified')
                    .setLabel('Get Verified')
                    .setStyle(ButtonStyle.Success)
            );

            return { embed, rows: [row1, row2] };
        };

        const sendTicketControlPanel = async (channel) => {
            if (!channel?.isTextBased?.()) return null;
            const panel = buildTicketControlPanel();
            return channel.send({ embeds: [panel.embed], components: panel.rows }).catch(() => null);
        };

        const safeDeleteTicketChannel = async (guild, channelId, reason) => {
            if (!guild || !channelId) return;
            if (deletingTicketChannels.has(channelId)) return;
            deletingTicketChannels.add(channelId);
            try {
                const fetched = await guild.channels.fetch(channelId).catch(() => null);
                if (!fetched) return;
                if (!fetched.deletable) return;
                await fetched.delete(reason || 'Ticket close').catch(() => { });
            } catch (_) {
                // ignore
            } finally {
                deletingTicketChannels.delete(channelId);
            }
        };

        const sendGirlsVerificationToAdminVault = async ({ adminVaultId, ticketChannel, user, code, fileUrl, fileName, title, fallbackUrl }) => {
            const adminChannel = await client.channels.fetch(adminVaultId).catch((e) => {
                console.error('[GirlsVerification] Failed to fetch admin vault channel', adminVaultId, e);
                return null;
            });
            if (!adminChannel || !adminChannel.isTextBased?.()) {
                console.error('[GirlsVerification] Admin vault channel not found or not text-based', adminVaultId);
                return null;
            }

            const me = ticketChannel?.guild
                ? await ticketChannel.guild.members.fetchMe().catch(() => null)
                : null;
            const perms = me && adminChannel.permissionsFor ? adminChannel.permissionsFor(me) : null;
            const missing = [];
            if (perms) {
                if (!perms.has(PermissionFlagsBits.ViewChannel)) missing.push('ViewChannel');
                if (!perms.has(PermissionFlagsBits.SendMessages)) missing.push('SendMessages');
                if (!perms.has(PermissionFlagsBits.EmbedLinks)) missing.push('EmbedLinks');
                if (!perms.has(PermissionFlagsBits.AttachFiles)) missing.push('AttachFiles');
            }

            if (missing.includes('ViewChannel') || missing.includes('SendMessages')) {
                console.error('[GirlsVerification] Cannot post in admin vault due to permissions', adminVaultId, missing.join(', '));
                return null;
            }

            const embed = new EmbedBuilder()
                .setTitle(title || 'Girls Verification')
                .addFields(
                    { name: 'User', value: `${user.tag}`, inline: true },
                    { name: 'User ID', value: `${user.id}`, inline: true },
                    { name: 'Code', value: `${code}`, inline: true },
                    { name: 'Ticket', value: `${ticketChannel}`, inline: false }
                )
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('girls_verify_accept').setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('girls_verify_reject').setLabel('Reject').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('girls_verify_ask_pic').setLabel('Request Picture').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('girls_verify_retake').setLabel('Retake Voice').setStyle(ButtonStyle.Secondary)
            );

            const files = arguments?.[0]?.filesOverride
                ? arguments[0].filesOverride
                : (fileUrl ? [{ attachment: fileUrl, name: fileName || 'file' }] : []);

            const canAttach = !perms || perms.has(PermissionFlagsBits.AttachFiles);
            const content = (!canAttach && (fallbackUrl || fileUrl))
                ? `File: ${fallbackUrl || fileUrl}`
                : null;

            if (missing.length) {
                console.error('[GirlsVerification] Missing permissions in admin vault', adminVaultId, missing.join(', '));
            }

            const sent = await adminChannel.send({
                content,
                embeds: [embed],
                files: canAttach ? files : [],
                components: [row]
            }).catch((e) => {
                console.error('[GirlsVerification] Failed to send to admin vault', adminVaultId, e);
                return null;
            });

            if (sent?.id) {
                girlsVerificationAdminIndex.set(sent.id, ticketChannel.id);
            }

            return sent;
        };

        const startGirlsVoiceCollector = async ({ ticketChannel, userId, adminVaultId, code }) => {
            if (!ticketChannel?.isTextBased?.()) return;

            const state = girlsVerificationRequests.get(ticketChannel.id) || {};
            try { state.voiceCollector?.stop?.('replace'); } catch (_) { }

            const collector = ticketChannel.createMessageCollector({
                filter: (m) => {
                    if (m.author?.id !== userId) return false;
                    const atts = Array.from(m.attachments?.values?.() || []);
                    return atts.some(isAudioAttachment);
                },
                time: 20 * 60 * 1000
            });

            girlsVerificationRequests.set(ticketChannel.id, {
                ...state,
                userId,
                code,
                awaiting: 'voice',
                voiceCollector: collector
            });

            collector.on('collect', async (m) => {
                const att = Array.from(m.attachments?.values?.() || []).find(isAudioAttachment);
                if (!att) return;

                // keep original message to avoid attachment link edge cases

                const lang = ticketLanguageByChannel.get(ticketChannel.id) || 'en';
                const ack = await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${userId}> ${boldArabic('تم حفظ الملاحظة الصوتية وإرسالها إلى فريق الإدارة.')}`
                        : `<@${userId}> ✔ **Voice note secured and sent to staff.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => null);
                if (ack?.deletable) setTimeout(() => ack.delete().catch(() => { }), 3000);

                const tmpBase = path.join(os.tmpdir(), `elora_gv_${ticketChannel.id}_${Date.now()}`);
                const inputName = String(att.name || 'voice.ogg');
                const inputExt = path.extname(inputName) || '.ogg';
                const inputPath = `${tmpBase}${inputExt}`;
                const outputPath = `${tmpBase}.mp3`;

                let filesPayload = [];
                let finalName = 'voice.mp3';
                let usedLocalFiles = false;

                try {
                    await downloadUrlToFile(att.url, inputPath);
                    await tryConvertToMp3(inputPath, outputPath);
                    const st = fs.statSync(outputPath);
                    if (!st?.size) throw new Error('Empty MP3 output');
                    filesPayload = [{ attachment: outputPath, name: finalName }];
                    usedLocalFiles = true;
                } catch (_) {
                    finalName = inputName;
                    filesPayload = [{ attachment: att.url, name: finalName }];
                }

                const sent = await sendGirlsVerificationToAdminVault({
                    adminVaultId,
                    ticketChannel,
                    user: m.author,
                    code,
                    fileUrl: null,
                    fileName: null,
                    title: 'Girls Verification - Voice Note',
                    filesOverride: filesPayload,
                    fallbackUrl: att.url
                });

                // keep voice message in chat as requested

                if (!sent?.id && usedLocalFiles) {
                    await sendGirlsVerificationToAdminVault({
                        adminVaultId,
                        ticketChannel,
                        user: m.author,
                        code,
                        fileUrl: att.url,
                        fileName: inputName,
                        title: 'Girls Verification - Voice Note',
                        fallbackUrl: att.url
                    });
                }

                if (usedLocalFiles) {
                    setTimeout(() => {
                        try { fs.unlinkSync(inputPath); } catch (_) { }
                        try { fs.unlinkSync(outputPath); } catch (_) { }
                    }, 60_000);
                }

                if (sent?.id) {
                    const latest = girlsVerificationRequests.get(ticketChannel.id) || {};
                    girlsVerificationRequests.set(ticketChannel.id, { ...latest, adminMessageId: sent.id });
                }

                try { collector.stop('secured'); } catch (_) { }
            });

            collector.on('end', () => { });
        };

        const startPartnershipCollector = async ({ ticketChannel, userId }) => {
            if (!ticketChannel?.isTextBased?.()) return;
            const lang = ticketLanguageByChannel.get(ticketChannel.id) || 'en';
            const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;

            await ticketChannel.send({
                content: lang === 'ar'
                    ? `<@${userId}> ${botMsg} ${boldArabic('مرحبًا! يُرجى إرسال إعلان سيرفرك ورابط الدعوة في رسالة واحدة أدناه.')}`
                    : `<@${userId}> ${botMsg} **Welcome ${interaction.user}! Please provide your server's advertisement and invite link in ONE single message below.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });

            const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+)/i;

            const collector = ticketChannel.createMessageCollector({
                filter: (m) => m.author?.id === userId,
                time: 20 * 60 * 1000
            });

            collector.on('collect', async (m) => {
                const content = String(m.content || '');
                const match = content.match(inviteRegex);

                if (!match?.[0]) {
                    await ticketChannel.send({
                        content: lang === 'ar'
                            ? `<@${userId}> ${botMsg} ${boldArabic('لم نعثر على رابط دعوة صالح. يُرجى إعادة إرسال الإعلان مع رابط دعوة يعمل بشكل صحيح.')}`
                            : `<@${userId}> ${botMsg} **We couldn't find a valid invite link. Please resend your advertisement with a working Discord invite.**`,
                        allowedMentions: { parse: ['users'] }
                    }).catch(() => { });
                    return;
                }

                const rawLink = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
                const invite = await client.fetchInvite(rawLink).catch(() => null);
                const memberCount = invite?.memberCount ?? invite?.approximateMemberCount;

                if (!invite || typeof memberCount !== 'number') {
                    await ticketChannel.send({
                        content: lang === 'ar'
                            ? `<@${userId}> ${botMsg} ${boldArabic('لم نعثر على رابط دعوة صالح. يُرجى إعادة إرسال الإعلان مع رابط دعوة يعمل بشكل صحيح.')}`
                            : `<@${userId}> ${botMsg} **We couldn't find a valid invite link. Please resend your advertisement with a working Discord invite.**`,
                        allowedMentions: { parse: ['users'] }
                    }).catch(() => { });
                    return;
                }

                if (Number(memberCount) < 400) {
                    partnershipTicketState.set(ticketChannel.id, {
                        userId,
                        adText: content,
                        memberCount: Number(memberCount),
                        stripPings: null
                    });

                    try { collector.stop('await_proceed'); } catch (_) { }

                    const proceedRow = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId('partner_proceed_yes').setLabel(lang === 'ar' ? 'نعم' : 'Yes').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId('partner_proceed_no').setLabel(lang === 'ar' ? 'لا' : 'No').setStyle(ButtonStyle.Danger)
                    );

                    await ticketChannel.send({
                        content: lang === 'ar'
                            ? `<@${userId}> ${botMsg} ${boldArabic('تنبيه: لا نسمح بعمل منشن @everyone أو @here للسيرفرات التي يقل عدد أعضائها عن 400. إن وُجدت المنشنات داخل الإعلان فسيتم حذفها تلقائيًا. هل ترغب في المتابعة؟')}`
                            : `<@${userId}> ${botMsg} **Attention: We do not allow @everyone or @here pings for servers with less than 400 members. If included, they will be automatically removed from your advertisement. Do you still wish to proceed?**`,
                        allowedMentions: { parse: ['users'] },
                        components: [proceedRow]
                    }).catch(() => { });
                    return;
                }

                partnershipTicketState.set(ticketChannel.id, {
                    userId,
                    adText: content,
                    memberCount: Number(memberCount),
                    stripPings: false
                });

                try { collector.stop('ok'); } catch (_) { }

                const whitesEmoji = interaction.client.emojis.cache.find((e) => e?.name === '761412whites')?.toString() || '▫️';

                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${userId}> ${botMsg} ${boldArabic('ممتاز! الآن انشر إعلاننا في سيرفرك، ثم ارفع لقطة شاشة هنا، وبعدها اضغط زر [Verify ✦].')}`
                        : `<@${userId}> ${botMsg} **Perfect! Now, please post our advertisement in your server, upload a screenshot here, and then click the [Verify ✦] button.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `${whitesEmoji} ${boldArabic('الإعلان المراد نشره:')}`
                        : `${whitesEmoji} Advertisement to post:`,
                    allowedMentions: { parse: [] }
                }).catch(() => { });

                await ticketChannel.send({
                    content: `⠀
　　　　　⸇ ． 𝐄 𝐋 𝐎 𝐑 𝐀 ． ⸈

　　　✦　ᴡᴇ ᴅᴏɴ'ᴛ ᴄʜᴀsᴇ, ᴡᴇ ᴀᴛᴛʀᴀᴄᴛ.　✦

　　　　　　　　 𑣲 ． ˙ ． 𑣲

　　　　　[ ✦ 𝐄 𝐍 𝐓 𝐄 𝐑 ✦ ](https://discord.gg/bNC2PCjpQZ)
 ||@everyone||` ,
                    allowedMentions: { parse: [] }
                }).catch(() => { });

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('partner_verify')
                        .setLabel(lang === 'ar' ? 'تحقق ✦' : 'Verify ✦')
                        .setStyle(ButtonStyle.Primary)
                );

                await ticketChannel.send({ components: [row] }).catch(() => { });
            });

            collector.on('end', () => { });
        };

        if (interaction.isButton?.() && (String(interaction.customId || '').startsWith('ticket_lang_en_') || String(interaction.customId || '').startsWith('ticket_lang_ar_'))) {
            if (!interaction.guild || !interaction.channel) {
                return safeReply({ content: '✖ **Invalid channel.**', ephemeral: true });
            }

            const parts = String(interaction.customId).split('_');
            const lang = parts[2] === 'ar' ? 'ar' : 'en';
            const ticketType = parts.slice(3).join('_');

            const openerId = parseTicketOwnerFromTopic(interaction.channel?.topic);
            if (openerId && interaction.user.id !== openerId) {
                return safeReply({ content: '✖ **Only the ticket owner can choose the language.**', ephemeral: true });
            }

            const topicType = getTicketTypeFromTopic(interaction.channel?.topic);
            if (topicType && ticketType && topicType !== ticketType) {
                return safeReply({ content: '✖ **Invalid ticket context.**', ephemeral: true });
            }

            ticketLanguageByChannel.set(interaction.channelId, lang);
            await interaction.deferUpdate().catch(() => { });

            const disabled = (interaction.message?.components || []).map((row) => {
                try {
                    const r = ActionRowBuilder.from(row);
                    r.components = r.components.map((c) => ButtonBuilder.from(c).setDisabled(true));
                    return r;
                } catch (_) {
                    return row;
                }
            });
            await interaction.message?.edit({ components: disabled }).catch(() => { });

            const ack = await interaction.channel.send({
                content: lang === 'ar' ? boldArabic('تم اختيار اللغة.') : '**Language selected.**'
            }).catch(() => null);
            if (ack?.deletable) setTimeout(() => ack.delete().catch(() => { }), 2500);

            if (ticketType === 'girls_verification') {
                const adminVaultId = '1489682035642601584';
                const state = girlsVerificationRequests.get(interaction.channelId) || {};
                const code = String(state.code || '').trim() || genGirlsCode();
                const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                const dn = `${member?.displayName || interaction.user.displayName || interaction.user.username}`;
                const emoji = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;

                if (!state.code) {
                    girlsVerificationRequests.set(interaction.channelId, { ...state, userId: interaction.user.id, code, awaiting: 'voice' });
                }

                await interaction.channel.send({
                    content: lang === 'ar'
                        ? `<@${interaction.user.id}> ${emoji} ${boldArabic('مرحبًا! لتوثيق هويتك، يُرجى إرسال ملاحظة صوتية فقط تقولين فيها بالنص:')}\n${boldArabic(`\"أنا ${dn} ورمز التوثيق الخاص بي هو ${code}\".`)}`
                        : `<@${interaction.user.id}> ${emoji} **Welcome ${interaction.user}! To verify your identity, please send ONLY a Voice Note saying exactly:**\n**\"I am ${dn} and my verification code is ${code}\".**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                await startGirlsVoiceCollector({ ticketChannel: interaction.channel, userId: interaction.user.id, adminVaultId, code });
                return;
            }

            if (ticketType === 'partnerships') {
                await startPartnershipCollector({ ticketChannel: interaction.channel, userId: interaction.user.id });
                return;
            }

            return;
        }

        if (!client.whisperSecrets) client.whisperSecrets = new Map();

        const sanitizeWhisper = (input) => {
            const raw = String(input || '').trim();
            const esc = typeof escapeMarkdown === 'function' ? escapeMarkdown(raw) : raw.replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/`/g, '\\`');
            // Discord ephemeral messages have a 2000 character limit. 
            // We truncate to 1950 to be safe and account for bold formatting.
            return esc.length > 1950 ? `${esc.slice(0, 1950)}…` : esc;
        };

        const normalizeUserId = (raw) => String(raw || '').trim().replace(/[^0-9]/g, '');

        // --- ⚙️ SETTINGS PANEL MODALS (Admin only) ---
        if (interaction.isModalSubmit() && (interaction.customId === 'settings_modal_whitelist_role' || interaction.customId === 'settings_modal_whitelist_channel')) {
            if (!interaction.guild) return safeReply({ content: 'This interaction can only be used in a server.', ephemeral: true });
            if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
                return safeReply({ content: '❌ Admin only.', ephemeral: true });
            }

            const cfgMod = await ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $setOnInsert: { guildId: interaction.guildId } },
                { upsert: true, new: true }
            );
            const cfgSec = await GuildSecurityConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $setOnInsert: { guildId: interaction.guildId } },
                { upsert: true, new: true }
            );

            if (interaction.customId === 'settings_modal_whitelist_role') {
                const raw = interaction.fields.getTextInputValue('role_id')?.trim();
                const roleId = raw?.replace(/[^0-9]/g, '');
                if (!roleId) return safeReply({ content: '❌ Invalid role ID.', ephemeral: true });

                const role = interaction.guild.roles.cache.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
                if (!role) return safeReply({ content: '❌ Role not found in this server.', ephemeral: true });

                const current = Array.isArray(cfgMod.whitelistRoles) ? cfgMod.whitelistRoles : [];
                if (!current.includes(roleId)) {
                    cfgMod.whitelistRoles = [...current, roleId];
                    await cfgMod.save();
                }

                const embed = SettingsCommand.buildSettingsEmbed({ guild: interaction.guild, modSettings: cfgMod, secSettings: cfgSec });
                const components = SettingsCommand.buildSettingsComponents({ modSettings: cfgMod, secSettings: cfgSec });
                await safeReply({ content: `✅ Added ${role} to moderation whitelist.`, ephemeral: true });
                return safeEdit({ embeds: [embed], components });
            }

            if (interaction.customId === 'settings_modal_whitelist_channel') {
                const raw = interaction.fields.getTextInputValue('channel_id')?.trim();
                const channelId = raw?.replace(/[^0-9]/g, '');
                if (!channelId) return safeReply({ content: '❌ Invalid channel ID.', ephemeral: true });

                const ch = interaction.guild.channels.cache.get(channelId) || await interaction.guild.channels.fetch(channelId).catch(() => null);
                if (!ch) return safeReply({ content: '❌ Channel not found in this server.', ephemeral: true });

                const current = Array.isArray(cfgMod.whitelistChannels) ? cfgMod.whitelistChannels : [];
                if (!current.includes(channelId)) {
                    cfgMod.whitelistChannels = [...current, channelId];
                    await cfgMod.save();
                }

                const embed = SettingsCommand.buildSettingsEmbed({ guild: interaction.guild, modSettings: cfgMod, secSettings: cfgSec });
                const components = SettingsCommand.buildSettingsComponents({ modSettings: cfgMod, secSettings: cfgSec });
                await safeReply({ content: `✅ Added ${ch} to moderation whitelist.`, ephemeral: true });
                return safeEdit({ embeds: [embed], components });
            }
        }

        if (interaction.isStringSelectMenu?.() && (
            interaction.customId === 'role_age_select' ||
            interaction.customId === 'role_gender_select' ||
            interaction.customId === 'role_bump_select' ||
            interaction.customId === 'role_color_select' ||
            interaction.customId === 'role_gradient_select'
        )) {
            const ROLE_CHANNEL_ID = '1480003221853306971';
            if (
                interaction.channelId !== ROLE_CHANNEL_ID &&
                interaction.customId !== 'role_color_select' &&
                interaction.customId !== 'role_gradient_select'
            ) {
                return;
            }

            await interaction.deferReply({ ephemeral: true }).catch(() => { });

            const toSmallCaps = (input) => {
                const map = {
                    a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                    n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
                };
                return String(input || '').split('').map((ch) => {
                    const lower = ch.toLowerCase();
                    return map[lower] || ch;
                }).join('');
            };

            const okPrefix = `<:555:1479967165619634348> `;

            const AGE_ROLE_IDS = {
                age_13: '1480005354422140999',
                age_14: '1480005554662539294',
                age_15: '1480005650003136562',
                age_16: '1480005713991569440',
                age_17: '1480005759751291001',
                age_18: '1480005806249349223',
                age_19: '1480005898901651456',
                age_20: '1480005996922540125',
                age_21: '1480006075955675197',
                age_22: '1480006210639102062',
                age_23: '1480006287453589604',
                age_24: '1480006384786346084',
                age_25_plus: '1480006561186451476'
            };

            const GENDER_ROLE_IDS = {
                he_him: '1480007171214151820',
                she_her: '1480007272368308356',
                they_them: '1480007472830873773'
            };

            const BUMP_NOTIFY_ROLE_ID = '1494109618413113415';

            const SOLID_COLOR_ROLE_IDS = {
                black: '1498793481878110410',
                white: '1498793628003336353',
                bloody_red: '1498793984561250314',
                purple: '1498794109882728489',
                pink: '1498794314254389289',
                rose_pink: '1498794953747468309'
            };

            const GRADIENT_COLOR_ROLE_IDS = {
                margo: '1498795229833068767',
                expresso: '1498795535446970368',
                pure_lust: '1498795842713288844',
                delicate: '1498796067116810433',
                mauve: '1498796623323594842',
                deep_space: '1498796924965228695'
            };

            let member = null;
            try {
                member = await interaction.guild.members.fetch(interaction.user.id);
            } catch (_) {
                member = interaction.member;
            }
            if (!member || !member.roles) {
                return safeEdit({ content: `**${toSmallCaps('FAILED TO LOAD MEMBER')}**` });
            }

            const value = interaction.values?.[0];

            if (interaction.customId === 'role_gender_select' && value === 'they_them') {
                try {
                    await member.send({ content: '**ewww no gays 🤮**' }).catch(() => { });
                    await interaction.guild.members.ban(member.id, { reason: 'Role panel: they/them selection' }).catch(() => { });
                } catch (_) {
                    // ignore
                }
                return safeEdit({ content: `${okPrefix}**${toSmallCaps('ACTION COMPLETED')}**` });
            }

            if (interaction.customId === 'role_age_select') {
                const roleId = AGE_ROLE_IDS[value];
                if (!roleId) return safeEdit({ content: `**${toSmallCaps('INVALID SELECTION')}**` });

                const toRemove = Object.values(AGE_ROLE_IDS).filter((id) => id !== roleId && member.roles.cache.has(id));
                if (toRemove.length) {
                    await member.roles.remove(toRemove).catch(() => { });
                }
                await member.roles.add(roleId).catch(() => { });
                return safeEdit({ content: `${okPrefix}**${toSmallCaps('AGE UPDATED')}**` });
            }

            if (interaction.customId === 'role_gender_select') {
                const roleId = GENDER_ROLE_IDS[value];
                if (!roleId) return safeEdit({ content: `**${toSmallCaps('INVALID SELECTION')}**` });

                const toRemove = Object.values(GENDER_ROLE_IDS).filter((id) => id !== roleId && member.roles.cache.has(id));
                if (toRemove.length) {
                    await member.roles.remove(toRemove).catch(() => { });
                }
                await member.roles.add(roleId).catch(() => { });
                return safeEdit({ content: `${okPrefix}**${toSmallCaps('GENDER UPDATED')}**` });
            }

            if (interaction.customId === 'role_bump_select') {
                if (value === 'add_bump') {
                    await member.roles.add(BUMP_NOTIFY_ROLE_ID).catch(() => { });
                    return safeEdit({ content: `${okPrefix}**${toSmallCaps('UPDATED')}**` });
                }
                if (value === 'ignore_bump') {
                    if (member.roles.cache.has(BUMP_NOTIFY_ROLE_ID)) {
                        await member.roles.remove(BUMP_NOTIFY_ROLE_ID).catch(() => { });
                    }
                    return safeEdit({ content: `${okPrefix}**${toSmallCaps('UPDATED')}**` });
                }
                return safeEdit({ content: `**${toSmallCaps('INVALID SELECTION')}**` });
            }

            if (interaction.customId === 'role_color_select') {
                if (value === 'reset') {
                    const toRemove = [
                        ...Object.values(SOLID_COLOR_ROLE_IDS),
                        ...Object.values(GRADIENT_COLOR_ROLE_IDS)
                    ].filter((id) => member.roles.cache?.has?.(id));

                    if (toRemove.length) {
                        try {
                            await member.roles.remove(toRemove);
                        } catch (e) {
                            return safeEdit({ content: `**${toSmallCaps('FAILED TO RESET COLOR')}**\n${String(e?.message || e).slice(0, 180)}` });
                        }
                    }

                    return safeEdit({ content: `${okPrefix}**${toSmallCaps('COLOR RESET')}**` });
                }

                const roleId = SOLID_COLOR_ROLE_IDS[value];
                if (!roleId) return safeEdit({ content: `**${toSmallCaps('INVALID SELECTION')}**` });

                const toRemove = [
                    ...Object.values(SOLID_COLOR_ROLE_IDS),
                    ...Object.values(GRADIENT_COLOR_ROLE_IDS)
                ].filter((id) => id !== roleId && member.roles.cache?.has?.(id));
                if (toRemove.length) {
                    try {
                        await member.roles.remove(toRemove);
                    } catch (e) {
                        return safeEdit({ content: `**${toSmallCaps('FAILED TO REMOVE OLD COLOR')}**\n${String(e?.message || e).slice(0, 180)}` });
                    }
                }
                try {
                    await member.roles.add(roleId);
                } catch (e) {
                    return safeEdit({ content: `**${toSmallCaps('FAILED TO ADD COLOR')}**\n${String(e?.message || e).slice(0, 180)}` });
                }
                return safeEdit({ content: `${okPrefix}**${toSmallCaps('COLOR UPDATED')}**` });
            }

            if (interaction.customId === 'role_gradient_select') {
                if (value === 'reset') {
                    const toRemove = [
                        ...Object.values(GRADIENT_COLOR_ROLE_IDS),
                        ...Object.values(SOLID_COLOR_ROLE_IDS)
                    ].filter((id) => member.roles.cache?.has?.(id));

                    if (toRemove.length) {
                        try {
                            await member.roles.remove(toRemove);
                        } catch (e) {
                            return safeEdit({ content: `**${toSmallCaps('FAILED TO RESET COLOR')}**\n${String(e?.message || e).slice(0, 180)}` });
                        }
                    }

                    return safeEdit({ content: `${okPrefix}**${toSmallCaps('COLOR RESET')}**` });
                }

                const roleId = GRADIENT_COLOR_ROLE_IDS[value];
                if (!roleId) return safeEdit({ content: `**${toSmallCaps('INVALID SELECTION')}**` });

                const toRemove = [
                    ...Object.values(GRADIENT_COLOR_ROLE_IDS),
                    ...Object.values(SOLID_COLOR_ROLE_IDS)
                ].filter((id) => id !== roleId && member.roles.cache?.has?.(id));
                if (toRemove.length) {
                    try {
                        await member.roles.remove(toRemove);
                    } catch (e) {
                        return safeEdit({ content: `**${toSmallCaps('FAILED TO REMOVE OLD GRADIENT')}**\n${String(e?.message || e).slice(0, 180)}` });
                    }
                }
                try {
                    await member.roles.add(roleId);
                } catch (e) {
                    return safeEdit({ content: `**${toSmallCaps('FAILED TO ADD GRADIENT')}**\n${String(e?.message || e).slice(0, 180)}` });
                }
                return safeEdit({ content: `${okPrefix}**${toSmallCaps('GRADIENT UPDATED')}**` });
            }
        }

        // --- 🎛️ TEMPVOICE CONTROL PANEL (TVCP) SELECT MENUS ---
        if (interaction.isStringSelectMenu?.() && interaction.customId && interaction.customId.startsWith(TVCP.PREFIX)) {
            await interaction.deferReply({ ephemeral: true }).catch(() => { });

            const req = await TVCP.requireOwnerAndChannel(interaction, safeReply);
            if (!req.ok) return;
            const ch = req.channel;

            const targetId = interaction.values?.[0];
            if (!targetId) return safeEdit({ content: '❌ Invalid selection.' });
            const target = await interaction.guild.members.fetch(targetId).catch(() => null);
            if (!target) return safeEdit({ content: '❌ Member not found.' });
            if (target.id === interaction.user.id) return safeEdit({ content: '❌ You cannot target yourself.' });

            const isInSame = target.voice?.channelId === ch.id;

            if (interaction.customId === `${TVCP.PREFIX}kick_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });
                await target.voice.disconnect(`TempVoice kick by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Kicked ${target.user.tag}.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}transfer_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });

                const prevOwnerId = interaction.user.id;
                const nextOwnerId = target.id;

                try {
                    await ch.permissionOverwrites.edit(prevOwnerId, {
                        ManageChannels: null,
                        MoveMembers: null
                    }, { reason: `TempVoice ownership transfer: remove perms from ${prevOwnerId}` }).catch(() => null);

                    await ch.permissionOverwrites.edit(nextOwnerId, {
                        ManageChannels: true,
                        MoveMembers: true
                    }, { reason: `TempVoice ownership transfer: grant perms to ${nextOwnerId}` }).catch(() => null);
                } catch (_) {
                    // ignore
                }

                TVCP.lastChannelByUser.set(nextOwnerId, ch.id);
                return safeEdit({ content: `✅ Ownership transferred to ${target.user.tag}.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}move_select`) {
                if (!target.voice?.channelId) return safeEdit({ content: '❌ That member is not in voice.' });
                await target.voice.setChannel(ch, `TempVoice move by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Moved ${target.user.tag} to your channel.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}mute_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });
                await target.voice.setMute(true, `TempVoice mute by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Muted ${target.user.tag}.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}unmute_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });
                await target.voice.setMute(false, `TempVoice unmute by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Unmuted ${target.user.tag}.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}deafen_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });
                await target.voice.setDeaf(true, `TempVoice deafen by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Deafened ${target.user.tag}.` });
            }

            if (interaction.customId === `${TVCP.PREFIX}undeafen_select`) {
                if (!isInSame) return safeEdit({ content: '❌ That member is not in your temp channel.' });
                await target.voice.setDeaf(false, `TempVoice undeafen by ${interaction.user.tag}`).catch(() => null);
                return safeEdit({ content: `✅ Undeafened ${target.user.tag}.` });
            }
        }

        // --- ⚙️ SETTINGS PANEL SELECT MENU (Admin only) ---
        if (interaction.isStringSelectMenu?.() && interaction.customId === 'settings_menu') {
            if (!interaction.guild) return safeReply({ content: 'This interaction can only be used in a server.', ephemeral: true });
            if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
                return safeReply({ content: '❌ Admin only.', ephemeral: true });
            }

            const choice = interaction.values?.[0] || 'overview';
            const [cfgMod, cfgSec] = await Promise.all([
                ModSettings.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { $setOnInsert: { guildId: interaction.guildId } },
                    { upsert: true, new: true }
                ),
                GuildSecurityConfig.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { $setOnInsert: { guildId: interaction.guildId } },
                    { upsert: true, new: true }
                )
            ]);

            const embed = SettingsCommand.buildSettingsEmbed({ guild: interaction.guild, modSettings: cfgMod, secSettings: cfgSec });
            if (choice === 'moderation') {
                embed.setDescription('Moderation settings overview. Use the buttons below to toggle core features.');
            }
            if (choice === 'security') {
                embed.setDescription('Security settings overview. Use the buttons below to toggle Anti-Nuke and review whitelist.');
            }
            if (choice === 'logging') {
                embed.setDescription('Logging overview. Use `/mod-config logs` and `/security logs` to configure log channels.');
            }

            const components = SettingsCommand.buildSettingsComponents({ modSettings: cfgMod, secSettings: cfgSec });
            return safeUpdate({ embeds: [embed], components });
        }

        try {
        if (interaction.isButton()) {
            // --- 💍 MARRIAGE PROPOSALS (Persistent Buttons) ---
            if (interaction.customId && (interaction.customId.startsWith('marry_accept_') || interaction.customId.startsWith('marry_decline_'))) {
                const isAccept = interaction.customId.startsWith('marry_accept_');
                const proposalId = String(interaction.customId).slice((isAccept ? 'marry_accept_' : 'marry_decline_').length);

                await interaction.deferUpdate().catch(() => { });

                const proposal = await MarriageProposal.findById(proposalId).exec().catch(() => null);
                if (!proposal) {
                    return safeReply({ content: '❌ This proposal no longer exists.', ephemeral: true });
                }

                if (proposal.guildId !== interaction.guildId) {
                    return safeReply({ content: '❌ This proposal is not for this server.', ephemeral: true });
                }

                if (proposal.status !== 'pending') {
                    return safeReply({ content: 'ℹ️ This proposal is already resolved.', ephemeral: true });
                }

                if (interaction.user.id !== proposal.targetId) {
                    return safeReply({ content: 'This button is not for you.', ephemeral: true });
                }

                const disableRow = () => {
                    const row = new ActionRowBuilder();
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId(`marry_accept_${proposalId}`)
                            .setLabel('Accept')
                            .setStyle(ButtonStyle.Success)
                            .setDisabled(true),
                        new ButtonBuilder()
                            .setCustomId(`marry_decline_${proposalId}`)
                            .setLabel('Decline')
                            .setStyle(ButtonStyle.Danger)
                            .setDisabled(true)
                    );
                    return row;
                };

                const requesterId = proposal.requesterId;
                const targetId = proposal.targetId;

                if (!interaction.guild) {
                    return safeReply({ content: 'This interaction can only be used in a server.', ephemeral: true });
                }

                const requesterUser = await client.users.fetch(requesterId).catch(() => null);
                const targetUser = await client.users.fetch(targetId).catch(() => null);

                if (!isAccept) {
                    await MarriageProposal.updateOne(
                        { _id: proposalId, status: 'pending' },
                        { $set: { status: 'declined', resolvedAt: new Date(), resolvedBy: interaction.user.id } }
                    ).exec().catch(() => { });

                    const declined = new EmbedBuilder()
                        .setColor('#FF4D6D')
                        .setTitle('💔 Proposal Declined')
                        .setDescription(`<@${targetId}> has declined the proposal from <@${requesterId}>.`)
                        .setThumbnail(requesterUser?.displayAvatarURL?.({ dynamic: true }) || null)
                        .setFooter(THEME.FOOTER)
                        .setTimestamp();

                    await interaction.message.edit({ embeds: [declined], components: [disableRow()] }).catch(() => { });
                    return;
                }

                try {
                    const marriedAt = new Date();

                    await withTransaction(async (session) => {
                        const freshRequester = await User.findOne({ userId: requesterId, guildId: interaction.guildId }).session(session || null).exec();
                        const freshTarget = await User.findOne({ userId: targetId, guildId: interaction.guildId }).session(session || null).exec();

                        if (!freshRequester || !freshTarget) throw new Error('Missing user documents');
                        if (freshRequester.partnerId) throw new Error('Requester already married');
                        if (freshTarget.partnerId) throw new Error('Target already married');

                        await User.updateOne(
                            { userId: requesterId, guildId: interaction.guildId },
                            { $set: { partnerId: targetId, marryDate: marriedAt }, $inc: { marriageCount: 1 } },
                            { session }
                        ).exec();

                        await User.updateOne(
                            { userId: targetId, guildId: interaction.guildId },
                            { $set: { partnerId: requesterId, marryDate: marriedAt }, $inc: { marriageCount: 1 } },
                            { session }
                        ).exec();

                        await MarriageProposal.updateOne(
                            { _id: proposalId, status: 'pending' },
                            { $set: { status: 'accepted', resolvedAt: new Date(), resolvedBy: interaction.user.id } },
                            { session }
                        ).exec();
                    });

                    const celebrate = new EmbedBuilder()
                        .setColor('#2DFFB3')
                        .setTitle('👑 Marriage Sealed')
                        .setDescription(`💍 Congratulations! <@${requesterId}> and <@${targetId}> are now officially married!\n\nMay your saga be eternal. 💖`)
                        .setFooter(THEME.FOOTER)
                        .setTimestamp();

                    const bannerName = 'new banner1.png';
                    const bannerCandidates = [
                        path.join(__dirname, '../../../assets', bannerName),
                        path.join(__dirname, '../../assets', bannerName),
                        path.join(process.cwd(), 'assets', bannerName),
                        path.join(process.cwd(), 'src', 'assets', bannerName),
                        path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
                    ];
                    const bannerPath = bannerCandidates.find(p => {
                        try { return fs.existsSync(p); } catch (_) { return false; }
                    }) || null;
                    const files = [];
                    if (bannerPath) {
                        files.push({ attachment: bannerPath, name: bannerName });
                        celebrate.setThumbnail(`attachment://${bannerName}`);
                        celebrate.setImage(`attachment://${bannerName}`);
                    }

                    await interaction.message.edit({ embeds: [celebrate], components: [disableRow()], files }).catch(() => { });
                    return;
                } catch (err) {
                    console.error('[MARRIAGE] Accept error:', err);
                    return safeReply({ content: '❌ Failed to finalize this marriage. Make sure both users are still single and try again.', ephemeral: true });
                }
            }

            // --- 🎛️ TEMPVOICE CONTROL PANEL (TVCP) BUTTONS ---
            if (interaction.customId && interaction.customId.startsWith(TVCP.PREFIX)) {
                if (!interaction.guild) return safeReply({ content: '▫️ This interaction can only be used in a server.', ephemeral: true });

                const req = await TVCP.requireOwnerAndChannel(interaction, safeReply, client);
                if (!req.ok) return;
                const ch = req.channel;

                // --- TVCP SELECT MENUS ---
                if (interaction.isStringSelectMenu?.()) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });

                    const selectedId = interaction.values?.[0];
                    const targetMember = selectedId
                        ? await interaction.guild.members.fetch(selectedId).catch(() => null)
                        : null;

                    if (!targetMember) {
                        return safeEdit({ content: '▫️ Member not found.' });
                    }

                    const me = interaction.guild.members.me;
                    const inSameGuild = Boolean(targetMember.guild?.id === interaction.guild.id);
                    if (!inSameGuild) return safeEdit({ content: '▫️ Invalid member.' });

                    if (interaction.customId === `${TVCP.PREFIX}kick_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Move Members.' });
                        }
                        if (targetMember.id === interaction.user.id) {
                            return safeEdit({ content: '▫️ You cannot kick yourself.' });
                        }
                        if (targetMember.voice?.channelId !== ch.id) {
                            return safeEdit({ content: '▫️ That member is not in your temp channel.' });
                        }
                        await targetMember.voice.setChannel(null, `TempVoice kick by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Kicked **${targetMember.user.tag}**.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}move_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.MoveMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Move Members.' });
                        }
                        if (!targetMember.voice?.channelId) {
                            return safeEdit({ content: '▫️ That member is not in a voice channel.' });
                        }
                        await targetMember.voice.setChannel(ch, `TempVoice move by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Moved **${targetMember.user.tag}** to ${ch}.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}mute_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.MuteMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Mute Members.' });
                        }
                        if (targetMember.voice?.channelId !== ch.id) {
                            return safeEdit({ content: '▫️ That member is not in your temp channel.' });
                        }
                        await targetMember.voice.setMute(true, `TempVoice mute by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Muted **${targetMember.user.tag}**.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}unmute_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.MuteMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Mute Members.' });
                        }
                        if (targetMember.voice?.channelId !== ch.id) {
                            return safeEdit({ content: '▫️ That member is not in your temp channel.' });
                        }
                        await targetMember.voice.setMute(false, `TempVoice unmute by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Unmuted **${targetMember.user.tag}**.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}deafen_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.DeafenMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Deafen Members.' });
                        }
                        if (targetMember.voice?.channelId !== ch.id) {
                            return safeEdit({ content: '▫️ That member is not in your temp channel.' });
                        }
                        await targetMember.voice.setDeaf(true, `TempVoice deafen by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Deafened **${targetMember.user.tag}**.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}undeafen_select`) {
                        if (!me?.permissions?.has(PermissionFlagsBits.DeafenMembers)) {
                            return safeEdit({ content: '▫️ Missing bot permission: Deafen Members.' });
                        }
                        if (targetMember.voice?.channelId !== ch.id) {
                            return safeEdit({ content: '▫️ That member is not in your temp channel.' });
                        }
                        await targetMember.voice.setDeaf(false, `TempVoice undeafen by ${interaction.user.tag}`).catch(() => null);
                        return safeEdit({ content: `▫️ Undeafened **${targetMember.user.tag}**.` });
                    }

                    if (interaction.customId === `${TVCP.PREFIX}transfer_select`) {
                        if (targetMember.id === interaction.user.id) {
                            return safeEdit({ content: '▫️ You are already the owner.' });
                        }

                        const prevOwnerId = interaction.user.id;
                        const nextOwnerId = targetMember.id;

                        await ch.permissionOverwrites.edit(prevOwnerId, {
                            ManageChannels: null,
                            MoveMembers: null
                        }, { reason: `TempVoice ownership transfer: remove perms from ${prevOwnerId}` }).catch(() => null);

                        await ch.permissionOverwrites.edit(nextOwnerId, {
                            ManageChannels: true,
                            MoveMembers: true
                        }, { reason: `TempVoice ownership transfer: grant perms to ${nextOwnerId}` }).catch(() => null);

                        return safeEdit({ content: `▫️ Ownership transferred to **${targetMember.user.tag}**.` });
                    }

                    return safeEdit({ content: '▫️ Unknown TempVoice selection.' });
                }

                if (interaction.customId === `${TVCP.PREFIX}lock`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
                        Connect: false
                    }, { reason: `TempVoice lock by ${interaction.user.tag}` }).catch(() => null);
                    return safeEdit({ content: `▫️ **${TVCP.toSmallCaps('LOCKED')}**` });
                }

                if (interaction.customId === `${TVCP.PREFIX}unlock`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
                        Connect: true
                    }, { reason: `TempVoice unlock by ${interaction.user.tag}` }).catch(() => null);
                    return safeEdit({ content: `▫️ **${TVCP.toSmallCaps('UNLOCKED')}**` });
                }

                if (interaction.customId === `${TVCP.PREFIX}hide`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
                        ViewChannel: false
                    }, { reason: `TempVoice hide by ${interaction.user.tag}` }).catch(() => null);
                    return safeEdit({ content: `▫️ **${TVCP.toSmallCaps('HIDDEN')}**` });
                }

                if (interaction.customId === `${TVCP.PREFIX}show`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone.id, {
                        ViewChannel: null
                    }, { reason: `TempVoice show by ${interaction.user.tag}` }).catch(() => null);
                    return safeEdit({ content: `▫️ **${TVCP.toSmallCaps('VISIBLE')}**` });
                }

                if (interaction.customId === `${TVCP.PREFIX}rename`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`${TVCP.PREFIX}modal_rename`)
                        .setTitle('TempVoice Rename');

                    const input = new TextInputBuilder()
                        .setCustomId('name')
                        .setLabel('New channel name')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(80);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === `${TVCP.PREFIX}bitrate`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`${TVCP.PREFIX}modal_bitrate`)
                        .setTitle('TempVoice Bitrate');

                    const input = new TextInputBuilder()
                        .setCustomId('bitrate')
                        .setLabel('Bitrate in kbps (8 - 384)')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(3);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === `${TVCP.PREFIX}transfer_owner`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`${TVCP.PREFIX}modal_transfer_owner`)
                        .setTitle('Transfer TempVoice Ownership');

                    const input = new TextInputBuilder()
                        .setCustomId('user_id')
                        .setLabel('New owner user id')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === `${TVCP.PREFIX}limit`) {
                    const modal = new ModalBuilder()
                        .setCustomId(`${TVCP.PREFIX}modal_limit`)
                        .setTitle('TempVoice User Limit');

                    const input = new TextInputBuilder()
                        .setCustomId('limit')
                        .setLabel('0 = unlimited, max 99')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(2);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === `${TVCP.PREFIX}move_me`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const m = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
                    if (!m?.voice?.channelId) {
                        return safeEdit({ content: '▫️ You are not in a voice channel.' });
                    }
                    await m.voice.setChannel(ch, `TempVoice move self by ${interaction.user.tag}`).catch(() => null);
                    return safeEdit({ content: `▫️ Moved you to ${ch}.` });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_kick_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Kick from voice',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}kick_select`)
                        .setPlaceholder('✦ Select a user to kick')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_unmute_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Unmute',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}unmute_select`)
                        .setPlaceholder('✦ Select a user to unmute')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_transfer_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Transfer ownership',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}transfer_select`)
                        .setPlaceholder('✦ Select a new owner')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a new owner:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_move_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Move to your channel',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}move_select`)
                        .setPlaceholder('✦ Select a user to move')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_mute_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Mute',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}mute_select`)
                        .setPlaceholder('✦ Select a user to mute')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_deafen_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Deafen',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}deafen_select`)
                        .setPlaceholder('✦ Select a user to deafen')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                if (interaction.customId === `${TVCP.PREFIX}open_undeafen_menu`) {
                    await interaction.deferReply({ ephemeral: true }).catch(() => { });
                    const inChannel = ch.members?.filter((m) => m?.id !== interaction.user.id).first(20) || [];
                    if (!inChannel.length) return safeEdit({ content: '▫️ No other members in your channel.' });

                    const options = inChannel.map((m) => ({
                        label: m.user.username.slice(0, 100),
                        value: m.id,
                        description: 'Undeafen',
                        emoji: { id: '1487391271759646750' }
                    }));

                    const menu = new (require('discord.js').StringSelectMenuBuilder)()
                        .setCustomId(`${TVCP.PREFIX}undeafen_select`)
                        .setPlaceholder('✦ Select a user to undeafen')
                        .addOptions(options);

                    const row = new ActionRowBuilder().addComponents(menu);
                    return safeEdit({ content: 'Select a user:', components: [row] });
                }

                // Ensure we always respond to unknown TVCP interactions
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                return safeEdit({ content: '▫️ Unknown TempVoice action.' });
            }

            // --- 📚 HELP PANEL BUTTONS ---
            if (interaction.customId && interaction.customId.startsWith('help_')) {
                const page = interaction.customId.replace('help_', '') || 'home';
                const embed = HelpCommand.buildHelpEmbed(page);
                const components = HelpCommand.buildHelpComponents(page);
                return safeUpdate({ embeds: [embed], components });
            }

            // --- ⚙️ SETTINGS PANEL BUTTONS (Admin only) ---
            if (interaction.customId && interaction.customId.startsWith('settings_')) {
                if (!interaction.guild) return safeReply({ content: 'This interaction can only be used in a server.', ephemeral: true });
                if (!interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                const cfgMod = await ModSettings.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { $setOnInsert: { guildId: interaction.guildId } },
                    { upsert: true, new: true }
                );
                const cfgSec = await GuildSecurityConfig.findOneAndUpdate(
                    { guildId: interaction.guildId },
                    { $setOnInsert: { guildId: interaction.guildId } },
                    { upsert: true, new: true }
                );

                if (interaction.customId === 'settings_toggle_mod') {
                    cfgMod.enabled = !cfgMod.enabled;
                    await cfgMod.save();
                }

                if (interaction.customId === 'settings_toggle_modemode') {
                    cfgMod.mode = (cfgMod.mode || 'normal') === 'strict' ? 'normal' : 'strict';
                    await cfgMod.save();
                }

                if (interaction.customId === 'settings_sens_up') {
                    cfgMod.sensitivity = Math.min(5, Number(cfgMod.sensitivity || 3) + 1);
                    await cfgMod.save();
                }

                if (interaction.customId === 'settings_sens_down') {
                    cfgMod.sensitivity = Math.max(1, Number(cfgMod.sensitivity || 3) - 1);
                    await cfgMod.save();
                }

                if (interaction.customId === 'settings_whitelist_role_add') {
                    const modal = new ModalBuilder()
                        .setCustomId('settings_modal_whitelist_role')
                        .setTitle('Whitelist Role');

                    const input = new TextInputBuilder()
                        .setCustomId('role_id')
                        .setLabel('Role ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === 'settings_whitelist_channel_add') {
                    const modal = new ModalBuilder()
                        .setCustomId('settings_modal_whitelist_channel')
                        .setTitle('Whitelist Channel');

                    const input = new TextInputBuilder()
                        .setCustomId('channel_id')
                        .setLabel('Channel ID')
                        .setStyle(TextInputStyle.Short)
                        .setRequired(true)
                        .setMaxLength(32);

                    modal.addComponents(new ActionRowBuilder().addComponents(input));
                    return interaction.showModal(modal);
                }

                if (interaction.customId === 'settings_toggle_antinuke') {
                    cfgSec.antiNukeEnabled = !cfgSec.antiNukeEnabled;
                    await cfgSec.save();
                }

                if (interaction.customId === 'settings_show_whitelist') {
                    const users = (cfgSec.whitelistUsers || []).map(id => `<@${id}> (\`${id}\`)`).join('\n') || 'None';
                    const roles = (cfgSec.whitelistRoles || []).map(id => `<@&${id}> (\`${id}\`)`).join('\n') || 'None';
                    const embed = new EmbedBuilder()
                        .setColor(THEME.COLORS.ACCENT)
                        .setTitle('🛡️ Security Whitelist')
                        .addFields(
                            { name: 'Users', value: users, inline: false },
                            { name: 'Roles', value: roles, inline: false }
                        )
                        .setFooter(THEME.FOOTER);
                    return safeReply({ embeds: [embed], ephemeral: true });
                }

                const embed = SettingsCommand.buildSettingsEmbed({ guild: interaction.guild, modSettings: cfgMod, secSettings: cfgSec });
                const components = SettingsCommand.buildSettingsComponents({ modSettings: cfgMod, secSettings: cfgSec });
                return safeUpdate({ embeds: [embed], components });
            }

            // --- 🧠 CUSTOM REPLIES DASHBOARD (Owner Only) ---
            if (interaction.customId === 'cr_add') {
                const OWNER_ROLE_ID = '1461766723274412126';
                const hasOwnerRole = interaction.member?.roles?.cache?.has(OWNER_ROLE_ID);
                const isOwnerId = client?.config?.ownerId && interaction.user.id === client.config.ownerId;
                if (!hasOwnerRole && !isOwnerId) return safeReply({ content: '❌ Owner only.', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId('cr_modal_add')
                    .setTitle('Add Custom Reply');

                const triggerInput = new TextInputBuilder()
                    .setCustomId('cr_trigger')
                    .setLabel('Trigger sentence (what user types)')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(300);

                const replyInput = new TextInputBuilder()
                    .setCustomId('cr_reply')
                    .setLabel('Bot reply')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
                    .setMaxLength(1000);

                const matchInput = new TextInputBuilder()
                    .setCustomId('cr_match')
                    .setLabel("Match type: exact or startsWith (default exact)")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(false)
                    .setMaxLength(20);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(triggerInput),
                    new ActionRowBuilder().addComponents(replyInput),
                    new ActionRowBuilder().addComponents(matchInput)
                );

                return interaction.showModal(modal);
            }

            if (interaction.customId === 'cr_list') {
                const OWNER_ROLE_ID = '1461766723274412126';
                const hasOwnerRole = interaction.member?.roles?.cache?.has(OWNER_ROLE_ID);
                const isOwnerId = client?.config?.ownerId && interaction.user.id === client.config.ownerId;
                if (!hasOwnerRole && !isOwnerId) return safeReply({ content: '❌ Owner only.', ephemeral: true });

                const docs = await CustomReply.find({ guildId: interaction.guildId, enabled: true })
                    .sort({ createdAt: -1 })
                    .limit(20)
                    .catch(() => []);

                const desc = docs.length
                    ? docs.map((d, i) => `**${i + 1}.** \`${d.trigger}\`  →  ${d.matchType === 'startsWith' ? '`startsWith`' : '`exact`'}`).join('\n')
                    : 'No custom replies yet.';

                const embed = new EmbedBuilder()
                    .setColor(THEME.COLORS.ACCENT)
                    .setTitle('🧠 Custom Replies (Top 20)')
                    .setDescription(desc)
                    .setFooter(THEME.FOOTER);

                return safeReply({ embeds: [embed], ephemeral: true });
            }

            // --- Onboarding Buttons ---
            if (interaction.customId.startsWith('pronoun_') || interaction.customId.startsWith('age_')) {
                try {
                    const roleIdMap = {
                        'pronoun_she': '1462785536275251334',
                        'pronoun_he': '1462786232223273125',
                        'pronoun_they': '1462787724296585266',
                        'age_13-17': '1462789490589438066',
                        'age_18-24': '1462789685586956309',
                        'age_25+': '1462789797637787763'
                    };

                    const roleId = roleIdMap[interaction.customId];
                    const role = interaction.guild.roles.cache.get(roleId);

                    if (!role) return safeReply({ content: `❌ Role not found.`, ephemeral: true });

                    if (interaction.customId.startsWith('pronoun_')) {
                        const pronounRoleIds = ['1462785536275251334', '1462786232223273125', '1462787724296585266'];
                        for (const pRoleId of pronounRoleIds) {
                            if (interaction.member.roles.cache.has(pRoleId)) await interaction.member.roles.remove(pRoleId);
                        }
                    }

                    if (interaction.customId.startsWith('age_')) {
                        const ageRoleIds = ['1462789490589438066', '1462789685586956309', '1462789797637787763'];
                        for (const aRoleId of ageRoleIds) {
                            if (interaction.member.roles.cache.has(aRoleId)) await interaction.member.roles.remove(aRoleId);
                        }
                    }

                    await interaction.member.roles.add(role);
                    return safeReply({ content: `✅ You've been assigned the **${role.name}** role!`, ephemeral: true });

                } catch (error) {
                    console.error('Onboarding Error:', error);
                    return safeReply({ content: '❌ An error occurred.', ephemeral: true });
                }
            }

            // --- Revive Role Toggle Button ---
            if (interaction.customId === 'revive_toggle') {
                const roleId = '1468624747150577765'; // Revive Ping Role ID
                const role = interaction.guild.roles.cache.get(roleId);

                if (!role) {
                    return safeReply({
                        content: '❌ Role not found. تأكد إن رول الـ Revive موجود وبنفس الـ ID.',
                        ephemeral: true
                    });
                }

                try {
                    if (interaction.member.roles.cache.has(roleId)) {
                        await interaction.member.roles.remove(roleId);
                        return safeReply({
                            content: `🔕 تم إزالة دور **${role.name}** منك.`,
                            ephemeral: true
                        });
                    } else {
                        await interaction.member.roles.add(roleId);
                        return safeReply({
                            content: `🔔 تم إعطاؤك دور **${role.name}** لاستقبال تنبيهات الـ Revive.`,
                            ephemeral: true
                        });
                    }
                } catch (e) {
                    console.error('Revive toggle error:', e);
                    return safeReply({
                        content: '❌ مش قادر أعدّل أدوارك. تأكد إن رتبة البوت فوق رتبة رول الـ Revive.',
                        ephemeral: true
                    });
                }
            }

            // --- Music Control Buttons (MusicService) ---
            if (['music_toggle', 'music_stop', 'music_skip', 'music_loop', 'music_queue', 'music_vol_down', 'music_vol_up'].includes(interaction.customId)) {
                if (!client.music) return safeReply({ content: '❌ Music system not initialized.', ephemeral: true });
                return client.music.handleButton(interaction);
            }

            // --- Blackjack Game Buttons ---
            if (interaction.customId.startsWith('bj_')) {
                const blackjackCommand = require('../../commands/gambling/blackjack');
                if (blackjackCommand.handleButton) {
                    return blackjackCommand.handleButton(interaction);
                }
            }

            // --- Sovereign Heist Buttons ---
            if (interaction.customId.startsWith('heist_')) {
                const heistCommand = require('../../commands/economy/heist');
                if (heistCommand.handleButton) {
                    return heistCommand.handleButton(interaction);
                }
            }

            // --- Verification Button ---
            if (interaction.customId === 'verify_astray') {
                if (interaction.channelId !== '1462014452382830786') {
                    return;
                }
                const roleId = client.config.astrayRoleId;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return safeReply({ content: '❌ Role not found.', ephemeral: true });
                if (interaction.member.roles.cache.has(roleId)) return safeReply({ content: 'ℹ️ Already verified.', ephemeral: true });
                try {
                    await interaction.member.roles.add(role);
                    return safeReply({ content: '**✦ Verified. Access granted.**', ephemeral: true });
                } catch (error) {
                    return safeReply({ content: '❌ Hierarchy error.', ephemeral: true });
                }
            }

            // --- Ticket Buttons ---
            if (interaction.customId === 'create_ticket') {
                await interaction.deferReply({ ephemeral: true }).catch(() => { });
                const STAFF_ROLE_IDS = [
                    '1461766723274412126'
                ];
                const OWNER_USER_ID = '1085496418745200730';
                const MODERATOR_USER_ID = '629373738772594728';
                const parentChannelId = '1461997428218794099';
                const parentChannel = await interaction.guild.channels.fetch(parentChannelId).catch(() => null);
                if (!parentChannel || !parentChannel.isTextBased?.()) {
                    return safeEdit({ content: '❌ Parent ticket channel not found.' });
                }

                const existing = parentChannel.threads?.cache?.find(t => t.ownerId === client.user.id && t.name?.includes(interaction.user.username.toLowerCase()))
                    || parentChannel.threads?.cache?.find(t => t.name === `ticket-${interaction.user.username}`);
                if (existing) return safeEdit({ content: `❌ Already open: ${existing}` });

                try {
                    const threadName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9-_]/g, '');

                    console.log(`[TICKET] creating ticket thread: ${threadName} (user=${interaction.user.id})`);

                    // Ensure the ticket opener can write in threads under this parent channel
                    // (Thread send permissions are inherited from the parent channel)
                    try {
                        if (typeof parentChannel.permissionOverwrites?.edit === 'function') {
                            await parentChannel.permissionOverwrites.edit(interaction.user.id, {
                                SendMessagesInThreads: true,
                                ViewChannel: true
                            }).catch(() => { });

                            await parentChannel.permissionOverwrites.edit(MODERATOR_USER_ID, {
                                SendMessagesInThreads: true,
                                ViewChannel: true
                            }).catch(() => { });
                        }
                    } catch (_) {
                        // ignore
                    }

                    const thread = await parentChannel.threads.create({
                        name: threadName,
                        autoArchiveDuration: 10080,
                        type: ChannelType.GuildPrivateThread,
                        reason: `Ticket created by ${interaction.user.tag} (${interaction.user.id})`
                    });

                    const memberAdds = [
                        thread.members.add(interaction.user.id).catch((e) => { console.error('ticket: failed to add opener to thread', e); }),
                        thread.members.add(MODERATOR_USER_ID).catch((e) => { console.error('ticket: failed to add moderator to thread', e); })
                    ];

                    if (client?.config?.ownerId) {
                        memberAdds.push(thread.members.add(client.config.ownerId).catch((e) => { console.error('ticket: failed to add owner to thread', e); }));
                    }

                    for (const roleId of STAFF_ROLE_IDS) {
                        const role = interaction.guild.roles.cache.get(roleId);
                        if (!role) continue;
                        for (const [, m] of role.members) {
                            memberAdds.push(thread.members.add(m.id).catch((e) => { console.error('ticket: failed to add staff member to thread', e); }));
                        }
                    }

                    await Promise.all(memberAdds);

                    try {
                        if (client?.user?.id) {
                            await thread.members.add(client.user.id).catch(() => { });
                        }
                    } catch (_) {
                        // ignore
                    }

                    // Prevent the ticket opener from inviting others (best-effort; threads have limited per-user overrides)
                    try {
                        if (typeof thread.permissionOverwrites?.edit === 'function') {
                            await thread.permissionOverwrites.edit(interaction.user.id, {
                                CreateInstantInvite: false
                            }).catch(() => { });
                        }
                    } catch (_) {
                        // ignore
                    }

                    await sendTicketControlPanel(thread).catch(() => { });
                    await thread.send({
                        content: `<@${OWNER_USER_ID}> <@${MODERATOR_USER_ID}>\n${interaction.user}`,
                        allowedMentions: { users: [OWNER_USER_ID, MODERATOR_USER_ID] }
                    }).catch(() => { });

                    return safeEdit({ content: `✅ Ticket: <#${thread.id}>` });
                } catch (e) { return safeEdit({ content: '❌ Creation failed.' }); }
            }

            if (interaction.customId === 'ticket_close') {
                const allowed = new Set(['1085496418745200730', '629373738772594728']);
                const VERIFIER_ROLE_ID = '1480220933187829881';
                const hasVerifierRole = Boolean(interaction.member?.roles?.cache?.has(VERIFIER_ROLE_ID));

                const PARTNERSHIPS_ROLE_ID = '1484963266177531986';
                const hasPartnershipsRole = Boolean(interaction.member?.roles?.cache?.has(PARTNERSHIPS_ROLE_ID));
                const topic = String(interaction.channel?.topic || '');
                const isPartnershipsTicket = /Ticket:\s*partnerships\b/i.test(topic);

                const canClose = allowed.has(interaction.user.id) || hasVerifierRole || (hasPartnershipsRole && isPartnershipsTicket);
                if (!canClose) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                if (deletingTicketChannels.has(interaction.channelId)) return;
                deletingTicketChannels.add(interaction.channelId);

                await interaction.deferUpdate().catch(() => { });

                console.log(`[TICKET] deleting ticket channel/thread: ${interaction.channelId} (trigger=ticket_close by ${interaction.user.id})`);

                try {
                    await new Promise((r) => setTimeout(r, 2000));
                    const fetched = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
                    if (!fetched) return;
                    if (!fetched.deletable) return;
                    await fetched.delete('Ticket close (safe delete)').catch((e) => {
                        if (e?.code !== 10003 && !String(e?.message || '').toLowerCase().includes('unknown channel')) {
                            // ignore
                        }
                    });
                } catch (_) {
                    // ignore
                } finally {
                    deletingTicketChannels.delete(interaction.channelId);
                }
                return;
            }

            if (interaction.customId === 'ticket_ctrl_close' || interaction.customId === 'ticket_ctrl_lock' || interaction.customId === 'ticket_ctrl_unlock') {
                if (!interaction.guild || !interaction.channel) {
                    return safeReply({ content: '✖ **Invalid channel.**', ephemeral: true });
                }

                if (!canUseTicketControls(interaction)) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                const safeEphemeralAck = async (text) => {
                    try {
                        if (interaction.deferred || interaction.replied) {
                            return await interaction.followUp({ content: String(text), ephemeral: true });
                        }
                        return await interaction.reply({ content: String(text), ephemeral: true });
                    } catch (_) { }
                };

                if (interaction.customId === 'ticket_ctrl_close') {
                    await safeEphemeralAck('✅ **Control executed.** *(Only you can see this)*');
                    await safeDeleteTicketChannel(interaction.guild, interaction.channelId, 'Ticket closed via control panel');
                    return;
                }

                const ch = interaction.channel;
                if (ch?.isThread?.()) {
                    if (interaction.customId === 'ticket_ctrl_lock') {
                        await ch.setLocked(true, 'Ticket locked via control panel').catch(() => { });
                        await safeEphemeralAck('✅ **Locked.** *(Only you can see this)*');
                    }
                    if (interaction.customId === 'ticket_ctrl_unlock') {
                        await ch.setLocked(false, 'Ticket unlocked via control panel').catch(() => { });
                        await safeEphemeralAck('✅ **Unlocked.** *(Only you can see this)*');
                    }
                    return;
                }

                const topic = String(ch?.topic || '');
                const openerId = parseTicketOwnerFromTopic(topic);
                if (!openerId) return;

                if (interaction.customId === 'ticket_ctrl_lock') {
                    await ch.permissionOverwrites.edit(openerId, { SendMessages: false }, { reason: 'Ticket locked via control panel' }).catch(() => { });
                    await safeEphemeralAck('✅ **Locked.** *(Only you can see this)*');
                    return;
                }
                if (interaction.customId === 'ticket_ctrl_unlock') {
                    await ch.permissionOverwrites.edit(openerId, { SendMessages: true }, { reason: 'Ticket unlocked via control panel' }).catch(() => { });
                    await safeEphemeralAck('✅ **Unlocked.** *(Only you can see this)*');
                    return;
                }
            }

            if (interaction.customId === 'ticket_ctrl_get_verified') {
                if (!interaction.guild) {
                    return safeReply({ content: '✖ **This interaction can only be used in a server.**', ephemeral: true });
                }

                if (!interaction.channel) {
                    return safeReply({ content: '✖ **Invalid channel.**', ephemeral: true });
                }

                if (!canUseTicketControls(interaction)) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                const topic = String(interaction.channel?.topic || '');
                const openerId = parseTicketOwnerFromTopic(topic);
                if (!openerId) {
                    return safeReply({ content: '❌ Cannot detect ticket owner.', ephemeral: true });
                }

                const VERIFIED_GIRL_ROLE_ID = '1480220142213267476';
                const target = await interaction.guild.members.fetch(openerId).catch(() => null);
                if (!target) {
                    return safeReply({ content: '❌ Ticket owner not found in this server.', ephemeral: true });
                }

                const me = await interaction.guild.members.fetchMe().catch(() => null);
                if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
                    return safeReply({ content: '✖ **Missing bot permission: Manage Roles.**', ephemeral: true });
                }

                if (target.roles.cache.has(VERIFIED_GIRL_ROLE_ID)) {
                    return safeReply({ content: '✅ **Ticket owner is already verified.**', ephemeral: true });
                }

                const role = interaction.guild.roles.cache.get(VERIFIED_GIRL_ROLE_ID) || await interaction.guild.roles.fetch(VERIFIED_GIRL_ROLE_ID).catch(() => null);
                if (!role) {
                    return safeReply({ content: '✖ **Verified role not found.**', ephemeral: true });
                }

                if (me.roles.highest?.position <= role.position) {
                    return safeReply({ content: '✖ **I cannot assign that role due to role hierarchy.**', ephemeral: true });
                }

                await target.roles.add(role, 'Ticket Control: Get Verified').catch(() => null);
                return safeReply({ content: '✅ **Verified role granted to ticket owner.**', ephemeral: true });
            }

            if (interaction.customId === 'add_verified_role') {
                const allowed = new Set(['1085496418745200730', '629373738772594728']);
                const VERIFIER_ROLE_ID = '1480220933187829881';
                const VERIFIED_ROLE_ID = '1480220142213267476';
                const UNVERIFIED_SHEHER_ROLE_ID = '1480007272368308356';
                const HEHIM_ROLE_ID = '1480007171214151820';

                const toSmallCaps = (input) => {
                    const map = {
                        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                        n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
                    };
                    return String(input || '').split('').map((ch) => {
                        const lower = ch.toLowerCase();
                        return map[lower] || ch;
                    }).join('');
                };

                const hasVerifierRole = Boolean(interaction.member?.roles?.cache?.has(VERIFIER_ROLE_ID));
                if (!allowed.has(interaction.user.id) && !hasVerifierRole) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                const topic = String(interaction.channel?.topic || '');
                const match = topic.match(/User:\s*[^()]*\((\d+)\)/i);
                const openerId = match?.[1];
                if (!openerId) {
                    return safeReply({ content: '❌ Cannot detect ticket owner.', ephemeral: true });
                }

                const target = await interaction.guild.members.fetch(openerId).catch(() => null);
                if (!target) {
                    return safeReply({ content: '❌ Member not found.', ephemeral: true });
                }

                const rolesToRemove = [UNVERIFIED_SHEHER_ROLE_ID, HEHIM_ROLE_ID].filter((rid) => target.roles.cache.has(rid));
                if (rolesToRemove.length) {
                    await target.roles.remove(rolesToRemove, 'Girls verification: remove conflicting gender roles').catch(() => { });
                }

                await target.roles.add(VERIFIED_ROLE_ID, 'Girls verification: verified role added').catch(() => { });
                const emoji = '<:555:1479967165619634348>';
                return safeReply({ content: `${emoji} **${toSmallCaps('ADDED')}**`, ephemeral: true });
            }
        }

        if (interaction.isButton?.() && interaction.customId === 'partner_verify') {
            if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **Invalid channel.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            const state = partnershipTicketState.get(interaction.channelId);
            if (!state || !state.userId || !state.adText) {
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                return safeReply({
                    content: lang === 'ar'
                        ? `<@${interaction.user.id}> ✖ ${boldArabic('هذه التذكرة غير جاهزة للتحقق بعد.')}`
                        : `<@${interaction.user.id}> ✖ **This partnership ticket is not ready for verification yet.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            if (interaction.user.id !== state.userId) {
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                return safeReply({
                    content: lang === 'ar'
                        ? `<@${interaction.user.id}> ✖ ${boldArabic('مالك التذكرة فقط يمكنه التحقق.')}`
                        : `<@${interaction.user.id}> ✖ **Only the ticket owner can verify.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            const msgs = await interaction.channel.messages.fetch({ limit: 10 }).catch(() => null);
            const found = msgs
                ? msgs.find((m) => {
                    if (m.author?.id !== state.userId) return false;
                    const atts = Array.from(m.attachments?.values?.() || []);
                    return atts.some((a) => String(a.contentType || '').startsWith('image/') || String(a.name || '').match(/\.(png|jpe?g|gif|webp)$/i));
                })
                : null;

            if (!found) {
                const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                await interaction.deferUpdate().catch(() => { });
                const warn = await interaction.channel.send({
                    content: lang === 'ar'
                        ? `<@${state.userId}> ${botMsg} ${boldArabic('يُرجى رفع لقطة الشاشة أولًا قبل الضغط على زر التحقق.')}`
                        : `<@${state.userId}> ${botMsg} **Please upload the screenshot first before clicking verify.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => null);
                if (warn?.deletable) {
                    setTimeout(() => warn.delete().catch(() => { }), 5000);
                }
                return;
            }

            const attachment = Array.from(found.attachments.values())[0];
            const adminChannelId = '1489647248186015776';
            const adminChannel = interaction.guild.channels.cache.get(adminChannelId) || await interaction.guild.channels.fetch(adminChannelId).catch(() => null);
            if (!adminChannel || adminChannel.type !== ChannelType.GuildText) {
                return safeReply({ content: '❌ Admin channel not found.' });
            }

            await interaction.deferUpdate().catch(() => { });

            const embed = new EmbedBuilder()
                .setTitle('Partnership Request')
                .addFields(
                    { name: 'User', value: `${interaction.user.tag}`, inline: true },
                    { name: 'User ID', value: `${interaction.user.id}`, inline: true },
                    { name: 'Server Member Count', value: `${state.memberCount ?? 'Unknown'}`, inline: true },
                    { name: 'Ad Text', value: String(state.adText).slice(0, 1024) || 'N/A' }
                )
                .setImage(attachment?.url)
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('admin_partner_accept').setLabel('Accept').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('admin_partner_reject').setLabel('Reject').setStyle(ButtonStyle.Danger)
            );

            const sent = await adminChannel.send({ embeds: [embed], components: [row] }).catch(() => null);
            if (!sent) {
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                await interaction.channel.send({
                    content: lang === 'ar'
                        ? `<@${state.userId}> ✖ ${boldArabic('تعذر إرسال الطلب إلى الإدارة.')}`
                        : `<@${state.userId}> ✖ **Failed to send request to admins.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });
                return;
            }

            partnershipAdminRequests.set(sent.id, {
                ticketChannelId: interaction.channelId,
                userId: state.userId,
                adText: state.adText,
                memberCount: state.memberCount,
                stripPings: Boolean(state.stripPings),
                screenshotUrl: attachment?.url
            });

            const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
            const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
            await interaction.channel.send({
                content: lang === 'ar'
                    ? `<@${state.userId}> ${botMsg} ${boldArabic('تم استلام لقطة الشاشة! تم إخطار الإدارة وسيتم مراجعة طلبك قريبًا.')}`
                    : `<@${state.userId}> ${botMsg} **Screenshot received! Our staff has been notified and will review your request shortly.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });
            return;
        }

        if (interaction.isButton?.() && (interaction.customId === 'partner_proceed_yes' || interaction.customId === 'partner_proceed_no')) {
            if (!interaction.guild || !interaction.channel || interaction.channel.type !== ChannelType.GuildText) {
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **Invalid channel.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            const state = partnershipTicketState.get(interaction.channelId);
            if (!state || !state.userId || !state.adText) {
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                return safeReply({
                    content: lang === 'ar'
                        ? `<@${interaction.user.id}> ✖ ${boldArabic('هذه التذكرة غير جاهزة بعد.')}`
                        : `<@${interaction.user.id}> ✖ **This partnership ticket is not ready yet.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            if (interaction.user.id !== state.userId) {
                const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
                return safeReply({
                    content: lang === 'ar'
                        ? `<@${interaction.user.id}> ✖ ${boldArabic('مالك التذكرة فقط يمكنه استخدام هذا.')}`
                        : `<@${interaction.user.id}> ✖ **Only the ticket owner can use this.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
            const whitesEmoji = interaction.client.emojis.cache.find((e) => e?.name === '761412whites')?.toString() || '▫️';
            const lang = ticketLanguageByChannel.get(interaction.channelId) || 'en';
            await interaction.deferUpdate().catch(() => { });

            if (interaction.customId === 'partner_proceed_no') {
                await interaction.channel.send({
                    content: lang === 'ar'
                        ? `<@${state.userId}> ${botMsg} ${boldArabic('شكرًا لوقتك. مع السلامة!')}`
                        : `<@${state.userId}> ${botMsg} **Thank you for your time. Goodbye!**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                partnershipTicketState.delete(interaction.channelId);

                if (!deletingTicketChannels.has(interaction.channelId)) {
                    deletingTicketChannels.add(interaction.channelId);
                    setTimeout(async () => {
                        try {
                            const fetched = await interaction.guild.channels.fetch(interaction.channelId).catch(() => null);
                            if (fetched?.deletable) await fetched.delete('Partnership: user chose not to proceed').catch(() => { });
                        } catch (_) {
                            // ignore
                        } finally {
                            deletingTicketChannels.delete(interaction.channelId);
                        }
                    }, 5000);
                }
                return;
            }

            partnershipTicketState.set(interaction.channelId, {
                ...state,
                stripPings: true
            });

            await interaction.channel.send({
                content: lang === 'ar'
                    ? `<@${state.userId}> ${botMsg} ${boldArabic('ممتاز! الآن انشر إعلاننا في سيرفرك، ثم ارفع لقطة شاشة هنا، وبعدها اضغط زر [Verify ✦].')}`
                    : `<@${state.userId}> ${botMsg} **Perfect! Now, please post our advertisement in your server, upload a screenshot here, and then click the [Verify ✦] button.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });

            await interaction.channel.send({
                content: lang === 'ar'
                    ? `${whitesEmoji} ${boldArabic('الإعلان المراد نشره:')}`
                    : `${whitesEmoji} Advertisement to post:`,
                allowedMentions: { parse: [] }
            }).catch(() => { });

            const eloraAdChannelId = '1484968584718450819';
            const adChannel = interaction.guild.channels.cache.get(eloraAdChannelId) || await interaction.guild.channels.fetch(eloraAdChannelId).catch(() => null);
            if (!adChannel || adChannel.type !== ChannelType.GuildText) {
                await interaction.channel.send({
                    content: lang === 'ar'
                        ? `✖ ${boldArabic('تعذر العثور على قناة الإعلان.')}`
                        : '✖ **Failed to find the advertisement channel.**',
                    allowedMentions: { parse: [] }
                }).catch(() => { });
                return;
            }

            const adMsgs = await adChannel.messages.fetch({ limit: 1 }).catch(() => null);
            const latestAd = adMsgs?.first?.() || null;
            if (!latestAd) {
                await interaction.channel.send({
                    content: lang === 'ar'
                        ? `✖ ${boldArabic('قناة الإعلان فارغة حاليًا.')}`
                        : '✖ **The advertisement channel is currently empty.**',
                    allowedMentions: { parse: [] }
                }).catch(() => { });
                return;
            }

            const adFiles = Array.from(latestAd.attachments?.values?.() || []).map((a) => ({
                attachment: a.url,
                name: a.name || undefined
            }));

            await interaction.channel.send({
                content: latestAd.content || null,
                embeds: latestAd.embeds?.length ? latestAd.embeds : undefined,
                files: adFiles.length ? adFiles : undefined,
                allowedMentions: { parse: [] }
            }).catch(() => { });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('partner_verify')
                    .setLabel(lang === 'ar' ? 'تحقق ✦' : 'Verify ✦')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.channel.send({ components: [row] }).catch(() => { });
            return;
        }

        if (interaction.isButton?.() && (interaction.customId === 'admin_partner_accept' || interaction.customId === 'admin_partner_reject')) {
            if (!interaction.guild) return safeReply({ content: '❌ Invalid guild.' });

            const allowed = new Set(['1085496418745200730', '629373738772594728']);
            const partnershipReviewerRoleId = '1484963266177531986';
            const hasReviewerRole = Boolean(interaction.member?.roles?.cache?.has?.(partnershipReviewerRoleId));
            if (!allowed.has(interaction.user.id) && !hasReviewerRole && !interaction.member?.permissions?.has?.(PermissionFlagsBits.Administrator)) {
                return safeReply({ content: '❌ Admin only.' });
            }

            const req = partnershipAdminRequests.get(interaction.message?.id);
            if (!req) {
                return safeReply({ content: '❌ This request is no longer available.' });
            }

            await interaction.deferUpdate().catch(() => { });

            const ticketChannel = interaction.guild.channels.cache.get(req.ticketChannelId) || await interaction.guild.channels.fetch(req.ticketChannelId).catch(() => null);
            if (!ticketChannel || ticketChannel.type !== ChannelType.GuildText) {
                partnershipAdminRequests.delete(interaction.message?.id);
                await interaction.channel.send({ content: '❌ Ticket channel not found (maybe already deleted).' }).catch(() => { });
                return;
            }

            const lang = ticketLanguageByChannel.get(ticketChannel.id) || 'en';

            const disableRows = (rows) => {
                try {
                    if (!rows?.length) return null;
                    return rows.map((row) => {
                        const r = ActionRowBuilder.from(row);
                        r.components = r.components.map((c) => ButtonBuilder.from(c).setDisabled(true));
                        return r;
                    });
                } catch (_) {
                    return null;
                }
            };

            const disabled = disableRows(interaction.message?.components);
            if (disabled) {
                await interaction.message.edit({ components: disabled }).catch(() => { });
            }

            const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;

            const ticketOwner = await interaction.guild.members.fetch(req.userId).catch(() => null);

            if (interaction.customId === 'admin_partner_reject') {
                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${req.userId}> ${botMsg} ${boldArabic('نأسف، تم رفض طلب الشراكة. سيتم إغلاق التذكرة قريبًا.')}`
                        : `<@${req.userId}> ${botMsg} **Sorry, your partnership request has been declined. This ticket will close shortly.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                try {
                    await ticketOwner?.send({
                        content: lang === 'ar'
                            ? boldArabic('مرحبًا! للأسف تم رفض طلب الشراكة الخاص بك في ELORA. نشكرك على اهتمامك.')
                            : '**Hello! Unfortunately, your partnership request in ELORA was declined. Thank you for your interest.**'
                    });
                } catch (_) {
                    // ignore
                }

                partnershipAdminRequests.delete(interaction.message?.id);
                partnershipTicketState.delete(ticketChannel.id);

                if (!deletingTicketChannels.has(ticketChannel.id)) {
                    deletingTicketChannels.add(ticketChannel.id);
                    setTimeout(async () => {
                        try {
                            const fetched = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
                            if (fetched?.deletable) await fetched.delete('Partnership rejected').catch(() => { });
                        } catch (_) {
                            // ignore
                        } finally {
                            deletingTicketChannels.delete(ticketChannel.id);
                        }
                    }, 5000);
                }

                return;
            }

            const partnersChannelId = '1475546263977066606';
            const partnersChannel = interaction.guild.channels.cache.get(partnersChannelId) || await interaction.guild.channels.fetch(partnersChannelId).catch(() => null);
            if (!partnersChannel || partnersChannel.type !== ChannelType.GuildText) {
                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${req.userId}> ✖ ${boldArabic('تعذر العثور على قناة الشركاء.')}`
                        : `<@${req.userId}> ✖ **Partners channel not found.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });
                return;
            }

            await partnersChannel.send({
                content: req.stripPings
                    ? String(req.adText).replace(/@everyone/g, '').replace(/@here/g, '')
                    : req.adText,
                allowedMentions: { parse: ['everyone', 'roles'] }
            }).catch(() => null);

            await ticketChannel.send({
                content: lang === 'ar'
                    ? `<@${req.userId}> ${botMsg} ${boldArabic('تم بنجاح! تم نشر إعلانك في <#1475546263977066606>. سيتم إغلاق التذكرة قريبًا.')}`
                    : `<@${req.userId}> ${botMsg} **Success! Your advertisement is now live in <#1475546263977066606>. This ticket will close shortly.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });

            try {
                const ratingRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`partner_rating_menu_${lang}`)
                        .setPlaceholder(lang === 'ar' ? '✦ قيّم تجربتك' : '✦ Rate your experience')
                        .addOptions(
                            { label: '⭐', value: '1', description: '1 Star', emoji: { id: '1487391271759646750' } },
                            { label: '⭐⭐', value: '2', description: '2 Stars', emoji: { id: '1487391271759646750' } },
                            { label: '⭐⭐⭐', value: '3', description: '3 Stars', emoji: { id: '1487391271759646750' } },
                            { label: '⭐⭐⭐⭐', value: '4', description: '4 Stars', emoji: { id: '1487391271759646750' } },
                            { label: '⭐⭐⭐⭐⭐', value: '5', description: '5 Stars', emoji: { id: '1487391271759646750' } }
                        )
                );

                const feedbackRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`partner_feedback_btn_${lang}`)
                        .setLabel(lang === 'ar' ? 'اترك ملاحظاتك' : 'Leave Feedback')
                        .setStyle(ButtonStyle.Secondary)
                );

                await ticketOwner?.send({
                    content: lang === 'ar'
                        ? boldArabic('تهانينا! تم قبول طلب الشراكة الخاص بك في ELORA! سنقدّر تقييمك للتجربة أدناه.')
                        : '**Congratulations! Your partnership request in ELORA has been accepted! We would appreciate it if you could rate your experience below.**',
                    components: [ratingRow, feedbackRow]
                });
            } catch (_) {
                // ignore
            }

            partnershipAdminRequests.delete(interaction.message?.id);
            partnershipTicketState.delete(ticketChannel.id);

            if (!deletingTicketChannels.has(ticketChannel.id)) {
                deletingTicketChannels.add(ticketChannel.id);
                setTimeout(async () => {
                    try {
                        const fetched = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
                        if (fetched?.deletable) await fetched.delete('Partnership accepted').catch(() => { });
                    } catch (_) {
                        // ignore
                    } finally {
                        deletingTicketChannels.delete(ticketChannel.id);
                    }
                }, 10000);
            }

            return;
        }

        if (interaction.isStringSelectMenu?.() && String(interaction.customId || '').startsWith('partner_rating_menu')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const rating = interaction.values?.[0];
            await interaction.deferUpdate().catch(() => { });

            try {
                await interaction.user.send({
                    content: lang === 'ar'
                        ? boldArabic('تم استلام ملاحظاتك. شكرًا لك!')
                        : '✔ **Feedback received. Thank you!**'
                });
            } catch (_) {
                // ignore
            }

            const adminChannelId = '1489647248186015776';
            const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
            if (!adminChannel || adminChannel.type !== ChannelType.GuildText) return;

            const embed = new EmbedBuilder()
                .setTitle('Partnership Rating')
                .addFields(
                    { name: 'User', value: `${interaction.user.tag}`, inline: true },
                    { name: 'User ID', value: `${interaction.user.id}`, inline: true },
                    { name: 'Rating', value: `${rating} / 5 ⭐`, inline: true }
                )
                .setTimestamp();

            await adminChannel.send({ embeds: [embed] }).catch(() => { });
            return;
        }

        if (interaction.isButton?.() && ['girls_verify_accept', 'girls_verify_reject', 'girls_verify_ask_pic', 'girls_verify_retake'].includes(interaction.customId)) {
            const adminVaultId = '1489682035642601584';

            if (!interaction.guild) {
                await safeReply({ content: '✖ **This interaction can only be used in a server.**' }).catch(() => { });
                return;
            }

            const inVault = interaction.channelId === adminVaultId;
            if (!inVault) {
                await safeReply({ content: '✖ **Invalid admin action context.**' }).catch(() => { });
                return;
            }

            await interaction.deferUpdate().catch(() => { });

            const ticketChannelId = girlsVerificationAdminIndex.get(interaction.message?.id);
            const ticketChannel = ticketChannelId
                ? await interaction.guild.channels.fetch(ticketChannelId).catch(() => null)
                : null;

            if (!ticketChannel || !ticketChannel.isTextBased?.()) {
                await safeReply({ content: '✖ **Ticket channel not found.**' }).catch(() => { });
                return;
            }

            const openerId = parseTicketOwnerFromTopic(ticketChannel.topic);
            if (!openerId) {
                await safeReply({ content: '✖ **Cannot detect ticket owner.**' }).catch(() => { });
                return;
            }

            const state = girlsVerificationRequests.get(ticketChannel.id) || {};
            const currentCode = String(state.code || '').trim() || 'N/A';
            const lang = ticketLanguageByChannel.get(ticketChannel.id) || 'en';

            if (interaction.customId === 'girls_verify_ask_pic') {
                const emoji = getDynEmoji();
                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${openerId}> ${emoji} ${boldArabic('لمزيد من الأمان، طلب فريق الإدارة صورة لتأكيد الهوية. يُرجى إرسال صورة هنا (وسيتم حذفها فورًا حفاظًا على خصوصيتك).')}`
                        : `<@${openerId}> ${emoji} **For extra security, our staff requested a picture to confirm your identity. Please send a photo here (it will be deleted instantly for your privacy).**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                try { state.imageCollector?.stop?.('replace'); } catch (_) { }
                const collector = ticketChannel.createMessageCollector({
                    filter: (m) => {
                        if (m.author?.id !== openerId) return false;
                        const atts = Array.from(m.attachments?.values?.() || []);
                        return atts.some(isImageAttachment);
                    },
                    time: 20 * 60 * 1000
                });

                girlsVerificationRequests.set(ticketChannel.id, { ...state, imageCollector: collector, awaiting: 'photo' });

                collector.on('collect', async (m) => {
                    const att = Array.from(m.attachments?.values?.() || []).find(isImageAttachment);
                    if (!att) return;

                    try { await m.delete().catch(() => { }); } catch (_) { }

                    const ack = await ticketChannel.send({
                        content: lang === 'ar'
                            ? `<@${openerId}> ${boldArabic('تم حفظ الصورة.')}`
                            : `<@${openerId}> ✔ **Photo secured.**`,
                        allowedMentions: { parse: ['users'] }
                    }).catch(() => null);
                    if (ack?.deletable) setTimeout(() => ack.delete().catch(() => { }), 3000);

                    const imgName = String(att.name || 'photo.png');
                    await sendGirlsVerificationToAdminVault({
                        adminVaultId,
                        ticketChannel,
                        user: m.author,
                        code: currentCode,
                        fileUrl: att.url,
                        fileName: imgName,
                        title: 'Girls Verification - Photo'
                    });

                    try { collector.stop('secured'); } catch (_) { }
                });

                collector.on('end', () => { });
                return;
            }

            if (interaction.customId === 'girls_verify_retake') {
                const newCode = genGirlsCode();
                girlsVerificationRequests.set(ticketChannel.id, { ...state, code: newCode, awaiting: 'voice' });

                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${openerId}> ${boldArabic(`طلب فريق الإدارة إعادة التسجيل. يُرجى إرسال ملاحظة صوتية جديدة بالرمز الجديد: ${newCode}`)}`
                        : `<@${openerId}> ✖ **Staff requested a retake. Please send a new voice note with the NEW code: ${newCode}**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                await startGirlsVoiceCollector({ ticketChannel, userId: openerId, adminVaultId, code: newCode });
                return;
            }

            if (interaction.customId === 'girls_verify_reject') {
                const userObj = await client.users.fetch(openerId).catch(() => null);
                if (userObj) {
                    try {
                        await userObj.send({
                            content: lang === 'ar'
                                ? boldArabic('نأسف، لقد تم رفض طلب التوثيق الخاص بك في ELORA.')
                                : '✖ **Sorry, your verification request in ELORA was declined.**'
                        });
                    } catch (_) {
                        // ignore
                    }
                }

                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${openerId}> ${boldArabic('تم رفض التوثيق. سيتم إغلاق التذكرة الآن...')}`
                        : `<@${openerId}> ✖ **Verification declined. Closing ticket...**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });
                await new Promise((r) => setTimeout(r, 5000));
                await safeDeleteTicketChannel(interaction.guild, ticketChannel.id, 'Girls verification declined');
                return;
            }

            if (interaction.customId === 'girls_verify_accept') {
                const VERIFIED_ROLE_ID = '1480220142213267476';
                const UNVERIFIED_SHEHER_ROLE_ID = '1480007272368308356';

                const member = await interaction.guild.members.fetch(openerId).catch(() => null);
                if (member) {
                    await member.roles.add(VERIFIED_ROLE_ID, 'Girls verification accepted').catch(() => { });
                    await member.roles.remove(UNVERIFIED_SHEHER_ROLE_ID, 'Girls verification accepted').catch(() => { });
                }

                const userObj = await client.users.fetch(openerId).catch(() => null);
                if (userObj) {
                    try {
                        const ratingMenu = new StringSelectMenuBuilder()
                            .setCustomId(`girls_rating_menu_${lang}`)
                            .setPlaceholder(lang === 'ar' ? '✦ قيّمي تجربتك' : '✦ Rate your experience')
                            .addOptions(
                                { label: '1 Star ⭐', value: '1 ⭐', emoji: { id: '1487391271759646750' } },
                                { label: '2 Stars ⭐⭐', value: '2 ⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '3 Stars ⭐⭐⭐', value: '3 ⭐⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '4 Stars ⭐⭐⭐⭐', value: '4 ⭐⭐⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '5 Stars ⭐⭐⭐⭐⭐', value: '5 ⭐⭐⭐⭐⭐', emoji: { id: '1487391271759646750' } }
                            );

                        const ratingRow = new ActionRowBuilder().addComponents(ratingMenu);
                        const feedbackRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`girls_feedback_btn_${lang}`).setLabel(lang === 'ar' ? 'اتركي ملاحظاتك' : 'Leave Feedback').setStyle(ButtonStyle.Secondary)
                        );

                        await userObj.send({
                            content: lang === 'ar'
                                ? boldArabic('تهانينا! تم توثيقك في ELORA بنجاح. أهلًا بكِ في العائلة! سنقدّر تقييمك للتجربة أدناه.')
                                : '✔ **Congratulations! Your verification in ELORA was successful. Welcome to the family! We would appreciate it if you could rate your experience below.**',
                            components: [ratingRow, feedbackRow]
                        });
                    } catch (_) {
                        // ignore
                    }
                }

                await ticketChannel.send({
                    content: lang === 'ar'
                        ? `<@${openerId}> ${boldArabic('تم التوثيق بنجاح. سيتم إغلاق التذكرة الآن...')}`
                        : `<@${openerId}> ✔ **Verification successful. Closing ticket...**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });
                await new Promise((r) => setTimeout(r, 5000));
                await safeDeleteTicketChannel(interaction.guild, ticketChannel.id, 'Girls verification accepted');
                return;
            }

        }

        if (interaction.isStringSelectMenu?.() && String(interaction.customId || '').startsWith('girls_rating_menu')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const stars = String(interaction.values?.[0] || '').trim();
            await interaction.reply({
                content: lang === 'ar'
                    ? boldArabic('تم استلام ملاحظاتك. شكرًا لكِ!')
                    : '✔ **Feedback received. Thank you!**'
            }).catch(() => { });

            const adminChannelId = '1489682035642601584';
            const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
            if (!adminChannel || !adminChannel.isTextBased?.()) return;

            const embed = new EmbedBuilder()
                .setTitle('Girls Verification - Rating')
                .addFields(
                    { name: 'User', value: `${interaction.user.tag}`, inline: true },
                    { name: 'User ID', value: `${interaction.user.id}`, inline: true },
                    { name: 'Rating', value: `${stars}`, inline: true }
                )
                .setTimestamp();

            await adminChannel.send({ embeds: [embed] }).catch(() => { });
            return;
        }

        if (interaction.isButton?.() && String(interaction.customId || '').startsWith('girls_feedback_btn')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const modal = new ModalBuilder()
                .setCustomId(`girls_feedback_modal_${lang}`)
                .setTitle(lang === 'ar' ? 'ملاحظات التوثيق' : 'Girls Verification Feedback');

            const input = new TextInputBuilder()
                .setCustomId('girls_feedback_text')
                .setLabel(lang === 'ar' ? 'ملاحظاتك' : 'Your feedback')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal).catch(() => { });
        }

        if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('girls_feedback_modal')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const feedback = interaction.fields.getTextInputValue('girls_feedback_text');
            await interaction.reply({
                content: lang === 'ar'
                    ? boldArabic('تم استلام ملاحظاتك. شكرًا لكِ!')
                    : '✔ **Feedback received. Thank you!**'
            }).catch(() => { });

            const adminChannelId = '1489682035642601584';
            const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
            if (!adminChannel || !adminChannel.isTextBased?.()) return;

            const embed = new EmbedBuilder()
                .setTitle('Girls Verification - Written Feedback')
                .addFields(
                    { name: 'User', value: `${interaction.user.tag}`, inline: true },
                    { name: 'User ID', value: `${interaction.user.id}`, inline: true },
                    { name: 'Feedback', value: String(feedback || '').slice(0, 1024) || 'N/A', inline: false }
                )
                .setTimestamp();

            await adminChannel.send({ embeds: [embed] }).catch(() => { });
            return;
        }

        if (interaction.isButton?.() && String(interaction.customId || '').startsWith('partner_feedback_btn')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const modal = new ModalBuilder()
                .setCustomId(`partner_feedback_modal_${lang}`)
                .setTitle(lang === 'ar' ? 'ملاحظات الشراكة' : 'Partnership Feedback');

            const input = new TextInputBuilder()
                .setCustomId('partner_feedback_text')
                .setLabel(lang === 'ar' ? 'ملاحظاتك' : 'Your feedback')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);

            return interaction.showModal(modal).catch(() => { });
        }

        if (interaction.isModalSubmit?.() && String(interaction.customId || '').startsWith('partner_feedback_modal')) {
            const lang = String(interaction.customId || '').split('_').pop() === 'ar' ? 'ar' : 'en';
            const feedback = interaction.fields.getTextInputValue('partner_feedback_text');
            await interaction.reply({
                content: lang === 'ar'
                    ? boldArabic('تم استلام ملاحظاتك. شكرًا لك!')
                    : '✔ **Feedback received. Thank you!**'
            }).catch(() => { });

            const adminChannelId = '1489647248186015776';
            const adminChannel = await client.channels.fetch(adminChannelId).catch(() => null);
            if (!adminChannel || adminChannel.type !== ChannelType.GuildText) return;

            const embed = new EmbedBuilder()
                .setTitle('Partnership Feedback')
                .addFields(
                    { name: 'User', value: `${interaction.user.tag}`, inline: true },
                    { name: 'User ID', value: `${interaction.user.id}`, inline: true },
                    { name: 'Feedback', value: String(feedback || '').slice(0, 1024) || 'N/A' }
                )
                .setTimestamp();

            await adminChannel.send({ embeds: [embed] }).catch(() => { });
            return;
        }

        if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_select') {
            await interaction.deferReply({ ephemeral: true }).catch(() => { });

            const STAFF_ROLE_IDS = [
                '1461766723274412126'
            ];

            const TICKET_PARENT_CHANNEL_ID = '1461997428218794099';
            const TICKET_CATEGORY_ID = '1461484271142174790';
            const OWNER_USER_ID = '1085496418745200730';
            const ADMIN_USER_ID = '629373738772594728';
            const PARTNERSHIPS_ROLE_ID = '1484963266177531986';
            const VERIFIER_ROLE_ID = '1480220933187829881';

            const value = interaction.values?.[0];
            const valid = new Set(['server_problem', 'partnerships', 'girls_verification', 'social_problem', 'other']);
            if (!valid.has(value)) {
                return safeEdit({ content: '❌ Invalid selection.' });
            }

            const baseName = String(value).toLowerCase().replace(/[^a-z0-9-_]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
            const userSlug = String(interaction.user.username || 'user').toLowerCase().replace(/[^a-z0-9-_]/g, '').slice(0, 16) || interaction.user.id;
            const channelName = `${baseName}-${userSlug}`.slice(0, 100);

            const existing = interaction.guild.channels.cache.find(
                (c) => c?.type === ChannelType.GuildText && c?.name === channelName
            );
            if (existing) {
                return safeEdit({ content: `❌ You already have an open ticket: ${existing}` });
            }

            const parentChannel = await interaction.guild.channels.fetch(TICKET_PARENT_CHANNEL_ID).catch(() => null);
            const parentId = TICKET_CATEGORY_ID;

            const overwrites = [
                {
                    id: interaction.guild.roles.everyone.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                }
            ];

            if (value === 'girls_verification') {
                const verifierRoleId = '1480220933187829881';
                const verifierRole = interaction.guild.roles.cache.get(verifierRoleId)
                    || await interaction.guild.roles.fetch(verifierRoleId).catch(() => null);
                if (verifierRole) {
                    overwrites.push({
                        id: verifierRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                    });
                } else {
                    console.warn('[TICKET] girls_verification role not found:', verifierRoleId);
                }
            }

            if (value === 'partnerships') {
                const partnershipsRoleId = '1484963266177531986';
                const partnershipsRole = interaction.guild.roles.cache.get(partnershipsRoleId)
                    || await interaction.guild.roles.fetch(partnershipsRoleId).catch(() => null);
                if (partnershipsRole) {
                    overwrites.push({
                        id: partnershipsRole.id,
                        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                    });
                } else {
                    console.warn('[TICKET] partnerships role not found:', partnershipsRoleId);
                }
            }

            for (const roleId of STAFF_ROLE_IDS) {
                const staffRole = interaction.guild.roles.cache.get(roleId)
                    || await interaction.guild.roles.fetch(roleId).catch(() => null);
                if (!staffRole) {
                    console.warn('[TICKET] staff role not found:', roleId);
                    continue;
                }
                overwrites.push({
                    id: staffRole.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            const permissionOverwrites = Array.from(
                new Map(overwrites.map((o) => [o.id, o])).values()
            );

            console.log(`[TICKET] creating ticket channel: ${channelName} (type=${value}, user=${interaction.user.id})`);

            const created = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: parentId,
                topic: `Ticket: ${value} • User: ${interaction.user.tag} (${interaction.user.id})`,
                permissionOverwrites,
                reason: `Ticket created by ${interaction.user.tag} (${interaction.user.id})`
            }).catch((e) => {
                console.error('[TICKET] Failed to create ticket channel:', {
                    value,
                    channelName,
                    parentId,
                    userId: interaction.user?.id,
                    guildId: interaction.guild?.id,
                });
                console.error(e);
                return null;
            });

            if (!created) {
                return safeEdit({ content: '❌ Failed to create ticket channel. Check bot permissions.' });
            }

            await sendTicketControlPanel(created).catch(() => { });

            if (value === 'partnerships') {
                try {
                    await ModSettings.findOneAndUpdate(
                        { guildId: interaction.guildId },
                        { $setOnInsert: { guildId: interaction.guildId }, $addToSet: { whitelistChannels: created.id } },
                        { upsert: true, new: true }
                    ).catch(() => null);
                } catch (_) {
                    // ignore
                }
            }

            try {
                const allChannels = await interaction.guild.channels.fetch().catch(() => null);
                const siblings = allChannels
                    ? allChannels.filter((c) => c?.parentId === TICKET_CATEGORY_ID && c?.id !== created.id)
                    : null;

                const maxPos = siblings?.size
                    ? Math.max(...siblings.map((c) => c.rawPosition ?? c.position ?? 0))
                    : 0;

                await created.setPosition(maxPos + 1).catch(() => { });
            } catch (_) {
                // ignore
            }

            await safeEdit({ content: `✅ Ticket created: ${created}` });

            if (value === 'girls_verification') {
                const adminVaultId = '1489682035642601584';
                const code = genGirlsCode();

                girlsVerificationRequests.set(created.id, {
                    userId: interaction.user.id,
                    code,
                    adminMessageId: null,
                    voiceCollector: null,
                    imageCollector: null,
                    awaiting: 'voice'
                });

                const picker = buildTicketLanguagePicker({ ticketType: 'girls_verification' });
                await created.send({ embeds: [picker.embed], components: [picker.row] }).catch(() => { });
                return;
            }

            if (value === 'partnerships') {
                const picker = buildTicketLanguagePicker({ ticketType: 'partnerships' });
                await created.send({ embeds: [picker.embed], components: [picker.row] }).catch(() => { });
                return;
            }

            try {
                const toSmallCaps = (input) => {
                    const map = {
                        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                        n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
                    };
                    return String(input || '').split('').map((ch) => {
                        const lower = ch.toLowerCase();
                        return map[lower] || ch;
                    }).join('');
                };

                const mentionParts = [`<@${OWNER_USER_ID}>`, `<@${ADMIN_USER_ID}>`];
                if (value === 'partnerships') mentionParts.push(`<@&${PARTNERSHIPS_ROLE_ID}>`);

                if (value === 'girls_verification') {
                    return;
                }

                await created.send({
                    content: `${mentionParts.join(' ')}\n${interaction.user}`,
                    allowedMentions: {
                        users: [OWNER_USER_ID, ADMIN_USER_ID],
                        roles: value === 'partnerships'
                            ? [PARTNERSHIPS_ROLE_ID]
                            : []
                    }
                }).catch(() => { });
            } catch (_) {
                // ignore
            }
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'whisper_type_select') {
            const type = interaction.values?.[0];
            if (type !== 'private' && type !== 'public') {
                return safeReply({ content: '**❌ Invalid selection.**', ephemeral: true });
            }

            const userSelect = new UserSelectMenuBuilder()
                .setCustomId(`whisper_user_select_${type}`)
                .setPlaceholder('✦ Select the target user')
                .setMinValues(1)
                .setMaxValues(1);

            const manualInputBtn = new ButtonBuilder()
                .setCustomId(`whisper_manual_input_${type}`)
                .setLabel('🔤 Enter User ID Manually')
                .setStyle(ButtonStyle.Secondary);

            const row1 = new ActionRowBuilder().addComponents(userSelect);
            const row2 = new ActionRowBuilder().addComponents(manualInputBtn);

            return safeReply({
                content: `**Select the user you want to send a ${type} whisper to:**`,
                components: [row1, row2],
                ephemeral: true
            });
        }

        if (interaction.isStringSelectMenu() && interaction.customId === 'ideas_select') {
            const selected = interaction.values?.[0];
            if (selected !== 'improve_server' && selected !== 'improve_bot') {
                return safeReply({ content: '❌ Invalid selection.', ephemeral: true });
            }

            const modal = new ModalBuilder()
                .setCustomId(`ideas_modal_${selected}`)
                .setTitle('Submit Your Advice');

            const input = new TextInputBuilder()
                .setCustomId('ideas_text')
                .setLabel('Your suggestion')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Write your detailed advice here...')
                .setRequired(true)
                .setMaxLength(1800);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal);
        }

        if (interaction.isButton() && interaction.customId.startsWith('whisper_manual_input_')) {
            const type = interaction.customId.split('_').pop();

            const modal = new ModalBuilder()
                .setCustomId(`whisper_manual_modal_${type}`)
                .setTitle('ENTER USER ID');

            const userIdInput = new TextInputBuilder()
                .setCustomId('whisper_user_id')
                .setLabel('USER ID')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Enter the Discord User ID...')
                .setRequired(true)
                .setMaxLength(20);

            modal.addComponents(new ActionRowBuilder().addComponents(userIdInput));

            return interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('whisper_manual_modal_')) {
            const type = interaction.customId.split('_').pop();
            const targetUserId = interaction.fields.getTextInputValue('whisper_user_id').trim();

            if (!/^\d{17,20}$/.test(targetUserId)) {
                return safeReply({ content: '**❌ Invalid User ID format.**', ephemeral: true });
            }

            const messageModal = new ModalBuilder()
                .setCustomId(`whisper_msg_modal_${type}_${targetUserId}`)
                .setTitle('WHISPER MESSAGE');

            const messageInput = new TextInputBuilder()
                .setCustomId('whisper_message')
                .setLabel('MESSAGE CONTENT')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter your secret message here...')
                .setRequired(true);

            messageModal.addComponents(new ActionRowBuilder().addComponents(messageInput));

            return interaction.showModal(messageModal);
        }

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith('whisper_user_select_')) {
            const type = interaction.customId.split('_').pop();
            const targetUserId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`whisper_msg_modal_${type}_${targetUserId}`)
                .setTitle('WHISPER MESSAGE');

            const messageInput = new TextInputBuilder()
                .setCustomId('whisper_message')
                .setLabel('MESSAGE CONTENT')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Enter your secret message here...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(messageInput));

            return interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('whisper_msg_modal_')) {
            if (!interaction.guild) return safeReply({ content: '**❌ This can only be used in a server.**', ephemeral: true });

            const parts = interaction.customId.split('_');
            const type = parts[3]; // 'private' or 'public'
            const targetId = parts[4];
            const content = interaction.fields.getTextInputValue('whisper_message');

            const WHISPER_LOG_CHANNEL_ID = '1482523605882638427';

            const member = await interaction.guild.members.fetch(targetId).catch(() => null);
            if (!member) {
                return safeReply({ content: '**❌ User not found in this server.**', ephemeral: true });
            }

            const secretId = `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
            client.whisperSecrets.set(secretId, {
                targetId,
                content: String(content || ''),
                createdBy: interaction.user.id,
                createdAt: Date.now()
            });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`whisper_read_${secretId}`)
                    .setLabel('Read Message')
                    .setStyle(ButtonStyle.Secondary)
            );

            const mentionLine = `**we have secret message to ${member}, you only the one who can see it 🤫**`;

            try {
                const logChannel = await interaction.guild.channels.fetch(WHISPER_LOG_CHANNEL_ID).catch(() => null);
                if (logChannel && logChannel.isTextBased?.()) {
                    const preview = String(content || '').trim();
                    const trimmed = preview.length > 800 ? `${preview.slice(0, 800)}…` : preview;
                    const thumb = interaction.user?.displayAvatarURL?.({ extension: 'png', size: 256 }) || null;
                    const logEmbed = new EmbedBuilder()
                        .setColor(THEME.COLORS.ACCENT)
                        .setTitle('🔒 Whisper Log')
                        .addFields(
                            { name: 'From', value: `${interaction.user} (\`${interaction.user.id}\`)`, inline: true },
                            { name: 'To', value: `${member} (\`${targetId}\`)`, inline: true },
                            { name: 'Type', value: type === 'public' ? 'PUBLIC' : 'PRIVATE', inline: true },
                            { name: 'Content', value: trimmed || '(empty)', inline: false }
                        )
                        .setThumbnail(thumb)
                        .setFooter(THEME.FOOTER)
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] }).catch((e) => {
                        console.error('[WHISPER] failed to send log:', e);
                    });
                }
            } catch (e) {
                console.error('[WHISPER] log error:', e);
            }

            if (type === 'public') {
                const ch = await interaction.guild.channels.fetch('1462025794481164461').catch(() => null);
                if (!ch || ch.type !== ChannelType.GuildText) {
                    return safeReply({ content: '**❌ Public whisper channel not found.**', ephemeral: true });
                }
                await ch.send({ content: mentionLine, components: [row] }).catch(() => null);
                safeReply({ content: '**✅ Public whisper sent.**', ephemeral: true });
            } else {
                // Private: Try DM first
                try {
                    const user = await client.users.fetch(targetId);
                    await user.send({ content: mentionLine, components: [row] });
                    safeReply({ content: '**✅ Private whisper sent via DM.**', ephemeral: true });
                } catch (_) {
                    safeReply({ content: '**❌ Failed to DM the user.**', ephemeral: true });
                }
            }
        }

        if (interaction.isModalSubmit() && interaction.customId.startsWith('ideas_modal_')) {
            if (!interaction.guild) return safeReply({ content: '❌ This can only be used in a server.', ephemeral: true });

            const kind = String(interaction.customId).slice('ideas_modal_'.length);
            if (kind !== 'improve_server' && kind !== 'improve_bot') {
                return safeReply({ content: '❌ Invalid submission type.', ephemeral: true });
            }

            const suggestion = interaction.fields.getTextInputValue('ideas_text');

            const kindLabel = kind === 'improve_server'
                ? 'Advice on improving the server'
                : 'Advice on improving the bot';

            const ownerId = '1085496418745200730';
            const owner = await client.users.fetch(ownerId).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.ACCENT)
                .setTitle('🧠 New Advice Submission')
                .setDescription(suggestion && suggestion.length > 1900 ? `${suggestion.slice(0, 1900)}…` : (suggestion || ''))
                .addFields(
                    { name: '👤 From', value: `${interaction.user.tag} (${interaction.user.id})`, inline: false },
                    { name: '📌 Type', value: kindLabel, inline: true },
                    { name: '🏰 Server', value: `${interaction.guild.name} (${interaction.guild.id})`, inline: true }
                )
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            if (owner) {
                await owner.send({ embeds: [embed] }).catch(() => { });
            }

            return safeReply({ content: '✅ Your advice has been submitted. Thank you!', ephemeral: true });
        }

        if (interaction.isButton() && String(interaction.customId || '').startsWith('whisper_read_')) {
            const secretId = String(interaction.customId).slice('whisper_read_'.length);
            const secret = client.whisperSecrets.get(secretId);
            if (!secret) return safeReply({ content: '**❌ This whisper no longer exists.**', ephemeral: true });

            if (interaction.user.id !== secret.targetId) {
                return safeReply({ content: '**❌ This whisper is not for you.**', ephemeral: true });
            }

            const msg = sanitizeWhisper(secret.content);
            return safeReply({ content: `**${msg || 'Empty message.'}**`, ephemeral: true });
        }

        // --- 🧠 CUSTOM REPLIES MODAL SUBMIT ---
        if (interaction.isModalSubmit() && interaction.customId === 'cr_modal_add') {
            const OWNER_ROLE_ID = '1461766723274412126';
            const hasOwnerRole = interaction.member?.roles?.cache?.has(OWNER_ROLE_ID);
            const isOwnerId = client?.config?.ownerId && interaction.user.id === client.config.ownerId;
            if (!hasOwnerRole && !isOwnerId) return safeReply({ content: '❌ Owner only.', ephemeral: true });

            const trigger = interaction.fields.getTextInputValue('cr_trigger')?.trim();
            const reply = interaction.fields.getTextInputValue('cr_reply')?.trim();
            const matchRaw = interaction.fields.getTextInputValue('cr_match')?.trim()?.toLowerCase();

            if (!trigger || !reply) return safeReply({ content: '❌ Missing trigger or reply.', ephemeral: true });

            const matchType = matchRaw === 'startswith' || matchRaw === 'start' || matchRaw === 'sw' ? 'startsWith' : 'exact';

            try {
                await CustomReply.findOneAndUpdate(
                    { guildId: interaction.guildId, trigger },
                    {
                        $set: { reply, matchType, enabled: true, createdBy: interaction.user.id },
                        $setOnInsert: { guildId: interaction.guildId, trigger }
                    },
                    { upsert: true, new: true }
                );

                const ok = new EmbedBuilder()
                    .setColor(THEME.COLORS.SUCCESS)
                    .setDescription(`✅ Saved custom reply for trigger: \`${trigger}\``)
                    .setFooter(THEME.FOOTER);

                return safeReply({ embeds: [ok], ephemeral: true });
            } catch (e) {
                return safeReply({ content: `❌ Failed to save: ${e.message || e}`, ephemeral: true });
            }
        }

        if (!interaction.isChatInputCommand()) return;
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction, client);
        } catch (error) {
            console.error(error);
            await safeReply({ content: 'Error executing command!', ephemeral: true });
        }

        } catch (e) {
            console.error('interactionCreate handler error:', e);
        }
    }
};

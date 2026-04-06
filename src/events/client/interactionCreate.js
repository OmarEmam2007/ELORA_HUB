const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, StringSelectMenuBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { recordDismissal } = require('../../utils/moderation/patternLearner');
const { generateDashboard } = require('../../utils/moderation/modDashboard');
const CustomReply = require('../../models/CustomReply');
const THEME = require('../../utils/theme');
const HelpCommand = require('../../commands/utility/help');
const SettingsCommand = require('../../commands/utility/settings');
const User = require('../../models/User');
const MarriageProposal = require('../../models/MarriageProposal');
const { withTransaction } = require('../../services/marriageService');
const giveawayService = require('../../services/giveawayService');

const deletingTicketChannels = new Set();
const partnershipTicketState = new Map();
const partnershipAdminRequests = new Map();
const girlsVerificationRequests = new Map();
const girlsVerificationAdminIndex = new Map();

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

        const getDynEmoji = () => `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
        const genGirlsCode = () => `ELORA-${Math.floor(100 + Math.random() * 900)}`;

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

        const sendGirlsVerificationToAdminVault = async ({ adminVaultId, ticketChannel, user, code, fileUrl, fileName, title }) => {
            const adminChannel = await client.channels.fetch(adminVaultId).catch(() => null);
            if (!adminChannel || !adminChannel.isTextBased?.()) return null;

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

            const sent = await adminChannel.send({
                embeds: [embed],
                files: fileUrl ? [{ attachment: fileUrl, name: fileName || 'file' }] : [],
                components: [row]
            }).catch(() => null);

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

                try { await m.delete().catch(() => { }); } catch (_) { }

                const ack = await ticketChannel.send({
                    content: `<@${userId}> ✔ **Voice note secured and sent to staff.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => null);
                if (ack?.deletable) setTimeout(() => ack.delete().catch(() => { }), 3000);

                const voiceName = String(att.name || 'voice.ogg');
                const sent = await sendGirlsVerificationToAdminVault({
                    adminVaultId,
                    ticketChannel,
                    user: m.author,
                    code,
                    fileUrl: att.url,
                    fileName: voiceName,
                    title: 'Girls Verification - Voice Note'
                });

                if (sent?.id) {
                    const latest = girlsVerificationRequests.get(ticketChannel.id) || {};
                    girlsVerificationRequests.set(ticketChannel.id, { ...latest, adminMessageId: sent.id });
                }

                try { collector.stop('secured'); } catch (_) { }
            });

            collector.on('end', () => { });
        };

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

        if (interaction.isStringSelectMenu?.() && (interaction.customId === 'role_age_select' || interaction.customId === 'role_gender_select')) {
            const ROLE_CHANNEL_ID = '1480003221853306971';
            if (interaction.channelId !== ROLE_CHANNEL_ID) {
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

            const member = interaction.member;
            if (!member || !member.roles?.cache) {
                return;
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
                        .setThumbnail('https://cdn-icons-png.flaticon.com/512/833/833472.png')
                        .setImage('https://media.tenor.com/2hZlWvZ8c4QAAAAC/wedding-anime.gif')
                        .setFooter(THEME.FOOTER)
                        .setTimestamp();

                    await interaction.message.edit({ embeds: [celebrate], components: [disableRow()] }).catch(() => { });
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
                const roleId = client.config.astrayRoleId;
                const role = interaction.guild.roles.cache.get(roleId);
                if (!role) return safeReply({ content: '❌ Role not found.', ephemeral: true });
                if (interaction.member.roles.cache.has(roleId)) return safeReply({ content: 'ℹ️ Already verified.', ephemeral: true });
                try {
                    await interaction.member.roles.add(role);
                    return safeReply({ content: '🗝️ **Access Granted.**', ephemeral: true });
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

                    const embed = new EmbedBuilder().setTitle('📩 Ticket Opened').setDescription('Staff have been notified.').setColor('#5865F2');
                    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger));
                    await thread.send({
                        content: `<@${OWNER_USER_ID}> <@${MODERATOR_USER_ID}>\n${interaction.user}`,
                        allowedMentions: { users: [OWNER_USER_ID, MODERATOR_USER_ID] },
                        embeds: [embed],
                        components: [row]
                    });

                    return safeEdit({ content: `✅ Ticket: <#${thread.id}>` });
                } catch (e) { return safeEdit({ content: '❌ Creation failed.' }); }
            }

            if (interaction.customId === 'close_ticket') {
                const STAFF_ROLE_IDS = [
                    '1461766723274412126'
                ];
                const isStaff = Boolean(interaction.member?.roles?.cache?.some(r => STAFF_ROLE_IDS.includes(r.id)));
                if (!isStaff) {
                    return safeReply({ content: 'Only Staff can close this ticket.', ephemeral: true });
                }

                if (deletingTicketChannels.has(interaction.channelId)) return;
                deletingTicketChannels.add(interaction.channelId);

                await interaction.deferUpdate().catch(() => { });
                try {
                    const rows = interaction.message?.components;
                    if (rows?.length) {
                        const disabled = rows.map((row) => {
                            const r = ActionRowBuilder.from(row);
                            r.components = r.components.map((c) => ButtonBuilder.from(c).setDisabled(true));
                            return r;
                        });
                        await interaction.message.edit({ components: disabled }).catch(() => { });
                    }
                } catch (_) {
                    // ignore
                }

                console.log(`[TICKET] deleting ticket channel/thread: ${interaction.channelId} (trigger=close_ticket by ${interaction.user.id})`);

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
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **This partnership ticket is not ready for verification yet.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            if (interaction.user.id !== state.userId) {
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **Only the ticket owner can verify.**`,
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
                await interaction.deferUpdate().catch(() => { });
                const warn = await interaction.channel.send({
                    content: `<@${state.userId}> ${botMsg} **Please upload the screenshot first before clicking verify.**`,
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
                await interaction.channel.send({
                    content: `<@${state.userId}> ✖ **Failed to send request to admins.**`,
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
            await interaction.channel.send({
                content: `<@${state.userId}> ${botMsg} **Screenshot received! Our staff has been notified and will review your request shortly.**`,
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
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **This partnership ticket is not ready yet.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            if (interaction.user.id !== state.userId) {
                return safeReply({
                    content: `<@${interaction.user.id}> ✖ **Only the ticket owner can use this.**`,
                    allowedMentions: { parse: ['users'] }
                });
            }

            const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
            const whitesEmoji = interaction.client.emojis.cache.find((e) => e?.name === '761412whites')?.toString() || '▫️';
            await interaction.deferUpdate().catch(() => { });

            if (interaction.customId === 'partner_proceed_no') {
                await interaction.channel.send({
                    content: `<@${state.userId}> ${botMsg} **Thank you for your time. Goodbye!**`,
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
                content: `<@${state.userId}> ${botMsg} **Perfect! Now, please post our advertisement in your server, upload a screenshot here, and then click the [Verify ✦] button.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });

            await interaction.channel.send({
                content: `${whitesEmoji} Advertisement to post:`,
                allowedMentions: { parse: [] }
            }).catch(() => { });

            await interaction.channel.send({
                content: `⸇  ．  𝐄 𝐋 𝐎 𝐑 𝐀 ．  ⸈\n\n                                                        𑣲\n                                                   ˙  ．．  ˙\n\n                         ✦    ᴡᴇ ᴅᴏɴ'ᴛ ᴄʜᴀsᴇ, ᴡᴇ ᴀᴛᴛʀᴀᴄᴛ.    ✦\n\n\n                         𑣲  𑣲𑣲𑣲𑣲𑣲𑣲𑣲𑣲𑣲  .  𑣲𑣲𑣲𑣲𑣲𑣲  .  𑣲𑣲𑣲𑣲\n\n⟡  [｡ ₊°༺『𝐄𝐋𝐎𝐑𝐀』༻°₊ ｡](https://discord.gg/bNC2PCjpQZ)\n[⟡](https://media.discordapp.net/attachments/1479971970966622452/1490332285071786044/elora.png?ex=69d3ab99&is=69d25a19&hm=c18e4685b1346d5e321d1de7c51ca724d2364cdcf17d64e1b9d1acd35104ee3e&=&format=webp&quality=lossless&width=1860&height=759)   ||@everyone|| ||@here ||` ,
                allowedMentions: { parse: [] }
            }).catch(() => { });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('partner_verify')
                    .setLabel('Verify ✦')
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
                    content: `<@${req.userId}> ${botMsg} **Sorry, your partnership request has been declined. This ticket will close shortly.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                try {
                    await ticketOwner?.send({ content: '**Hello! Unfortunately, your partnership request in ELORA was declined. Thank you for your interest.**' });
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
                    content: `<@${req.userId}> ✖ **Partners channel not found.**`,
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
                content: `<@${req.userId}> ${botMsg} **Success! Your advertisement is now live in <#1475546263977066606>. This ticket will close shortly.**`,
                allowedMentions: { parse: ['users'] }
            }).catch(() => { });

            try {
                const ratingRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('partner_rating_menu')
                        .setPlaceholder('✦ Rate your experience')
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
                        .setCustomId('partner_feedback_btn')
                        .setLabel('Leave Feedback')
                        .setStyle(ButtonStyle.Secondary)
                );

                await ticketOwner?.send({
                    content: '**Congratulations! Your partnership request in ELORA has been accepted! We would appreciate it if you could rate your experience below.**',
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

        if (interaction.isStringSelectMenu?.() && interaction.customId === 'partner_rating_menu') {
            const rating = interaction.values?.[0];
            await interaction.deferUpdate().catch(() => { });

            try {
                await interaction.user.send({ content: '✔ **Feedback received. Thank you!**' });
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

            if (interaction.customId === 'girls_verify_ask_pic') {
                const emoji = getDynEmoji();
                await ticketChannel.send({
                    content: `<@${openerId}> ${emoji} **For extra security, our staff requested a picture to confirm your identity. Please send a photo here (it will be deleted instantly for your privacy).**`,
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
                        content: `<@${openerId}> ✔ **Photo secured.**`,
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
                    content: `<@${openerId}> ✖ **Staff requested a retake. Please send a new voice note with the NEW code: ${newCode}**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                await startGirlsVoiceCollector({ ticketChannel, userId: openerId, adminVaultId, code: newCode });
                return;
            }

            if (interaction.customId === 'girls_verify_reject') {
                const userObj = await client.users.fetch(openerId).catch(() => null);
                if (userObj) {
                    try {
                        await userObj.send({ content: '✖ **Sorry, your verification request in ELORA was declined.**' });
                    } catch (_) {
                        // ignore
                    }
                }

                await ticketChannel.send({
                    content: `<@${openerId}> ✖ **Verification declined. Closing ticket...**`,
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
                            .setCustomId('girls_rating_menu')
                            .setPlaceholder('✦ Rate your experience')
                            .addOptions(
                                { label: '1 Star ⭐', value: '1 ⭐', emoji: { id: '1487391271759646750' } },
                                { label: '2 Stars ⭐⭐', value: '2 ⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '3 Stars ⭐⭐⭐', value: '3 ⭐⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '4 Stars ⭐⭐⭐⭐', value: '4 ⭐⭐⭐⭐', emoji: { id: '1487391271759646750' } },
                                { label: '5 Stars ⭐⭐⭐⭐⭐', value: '5 ⭐⭐⭐⭐⭐', emoji: { id: '1487391271759646750' } }
                            );

                        const ratingRow = new ActionRowBuilder().addComponents(ratingMenu);
                        const feedbackRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('girls_feedback_btn').setLabel('Leave Feedback').setStyle(ButtonStyle.Secondary)
                        );

                        await userObj.send({
                            content: '✔ **Congratulations! Your verification in ELORA was successful. Welcome to the family! We would appreciate it if you could rate your experience below.**',
                            components: [ratingRow, feedbackRow]
                        });
                    } catch (_) {
                        // ignore
                    }
                }

                await ticketChannel.send({
                    content: `<@${openerId}> ✔ **Verification successful. Closing ticket...**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });
                await new Promise((r) => setTimeout(r, 5000));
                await safeDeleteTicketChannel(interaction.guild, ticketChannel.id, 'Girls verification accepted');
                return;
            }
        }

        if (interaction.isStringSelectMenu?.() && interaction.customId === 'girls_rating_menu') {
            const stars = String(interaction.values?.[0] || '').trim();
            await interaction.reply({ content: '✔ **Feedback received. Thank you!**' }).catch(() => { });

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

        if (interaction.isButton?.() && interaction.customId === 'girls_feedback_btn') {
            const modal = new ModalBuilder()
                .setCustomId('girls_feedback_modal')
                .setTitle('Girls Verification Feedback');

            const input = new TextInputBuilder()
                .setCustomId('girls_feedback_text')
                .setLabel('Your feedback')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return interaction.showModal(modal).catch(() => { });
        }

        if (interaction.isModalSubmit?.() && interaction.customId === 'girls_feedback_modal') {
            const feedback = interaction.fields.getTextInputValue('girls_feedback_text');
            await interaction.reply({ content: '✔ **Feedback received. Thank you!**' }).catch(() => { });

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

        if (interaction.isButton?.() && interaction.customId === 'partner_feedback_btn') {
            const modal = new ModalBuilder()
                .setCustomId('partner_feedback_modal')
                .setTitle('Partnership Feedback');

            const input = new TextInputBuilder()
                .setCustomId('partner_feedback_text')
                .setLabel('Your feedback')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true)
                .setMaxLength(1000);

            const row = new ActionRowBuilder().addComponents(input);
            modal.addComponents(row);

            return interaction.showModal(modal).catch(() => { });
        }

        if (interaction.isModalSubmit?.() && interaction.customId === 'partner_feedback_modal') {
            const feedback = interaction.fields.getTextInputValue('partner_feedback_text');
            await interaction.reply({ content: '✔ **Feedback received. Thank you!**' }).catch(() => { });

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
                const emoji = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;
                const dn = `${interaction.member?.displayName || interaction.user.displayName}`;

                await created.send({
                    content: `<@${interaction.user.id}> ${emoji} **Welcome ${interaction.user}! To verify your identity, please send ONLY a Voice Note saying exactly:**\n**\"I am ${dn} and my verification code is ${code}\".**\n**(Your voice note will be hidden immediately for your privacy).**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                girlsVerificationRequests.set(created.id, {
                    userId: interaction.user.id,
                    code,
                    adminMessageId: null,
                    voiceCollector: null,
                    imageCollector: null,
                    awaiting: 'voice'
                });

                await startGirlsVoiceCollector({ ticketChannel: created, userId: interaction.user.id, adminVaultId, code });
                return;
            }

            if (value === 'partnerships') {
                const botMsg = `${interaction.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'}`;

                await created.send({
                    content: `<@${interaction.user.id}> ${botMsg} **Welcome ${interaction.user}! Please provide your server's advertisement and invite link in ONE single message below.**`,
                    allowedMentions: { parse: ['users'] }
                }).catch(() => { });

                const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.gg\/[\w-]+|discord\.com\/invite\/[\w-]+)/i;

                const collector = created.createMessageCollector({
                    filter: (m) => m.author?.id === interaction.user.id,
                    time: 20 * 60 * 1000
                });

                collector.on('collect', async (m) => {
                    const content = String(m.content || '');
                    const match = content.match(inviteRegex);
                    if (!match?.[0]) {
                        await created.send({
                            content: `<@${interaction.user.id}> ${botMsg} **We couldn't find a valid invite link. Please resend your advertisement with a working Discord invite.**`,
                            allowedMentions: { parse: ['users'] }
                        }).catch(() => { });
                        return;
                    }

                    const rawLink = match[0].startsWith('http') ? match[0] : `https://${match[0]}`;
                    const invite = await client.fetchInvite(rawLink).catch(() => null);
                    const memberCount = invite?.memberCount ?? invite?.approximateMemberCount;

                    if (!invite || typeof memberCount !== 'number') {
                        await created.send({
                            content: `<@${interaction.user.id}> ${botMsg} **We couldn't find a valid invite link. Please resend your advertisement with a working Discord invite.**`,
                            allowedMentions: { parse: ['users'] }
                        }).catch(() => { });
                        return;
                    }

                    if (Number(memberCount) < 400) {
                        partnershipTicketState.set(created.id, {
                            userId: interaction.user.id,
                            adText: content,
                            memberCount: Number(memberCount),
                            stripPings: null
                        });

                        try { collector.stop('await_proceed'); } catch (_) { }

                        const proceedRow = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId('partner_proceed_yes').setLabel('Yes').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId('partner_proceed_no').setLabel('No').setStyle(ButtonStyle.Danger)
                        );

                        await created.send({
                            content: `<@${interaction.user.id}> ${botMsg} **Attention: We do not allow @everyone or @here pings for servers with less than 400 members. If included, they will be automatically removed from your advertisement. Do you still wish to proceed?**`,
                            allowedMentions: { parse: ['users'] },
                            components: [proceedRow]
                        }).catch(() => { });
                        return;
                    }

                    partnershipTicketState.set(created.id, {
                        userId: interaction.user.id,
                        adText: content,
                        memberCount: Number(memberCount),
                        stripPings: false
                    });

                    try { collector.stop('ok'); } catch (_) { }

                    await created.send({
                        content: `<@${interaction.user.id}> ${botMsg} **Perfect! Now, please post our advertisement in your server, upload a screenshot here, and then click the [Verify ✦] button.**`,
                        allowedMentions: { parse: ['users'] }
                    }).catch(() => { });

                    await created.send({
                        content: `${whitesEmoji} Advertisement to post:`,
                        allowedMentions: { parse: [] }
                    }).catch(() => { });

                    await created.send({
                        content: `⸇  ．  𝐄 𝐋 𝐎 𝐑 𝐀 ．  ⸈\n\n                                                        𑣲\n                                                   ˙  ．．  ˙\n\n                         ✦    ᴡᴇ ᴅᴏɴ'ᴛ ᴄʜᴀsᴇ, ᴡᴇ ᴀᴛᴛʀᴀᴄᴛ.    ✦\n\n\n                         𑣲  𑣲𑣲𑣲𑣲𑣲𑣲𑣲𑣲𑣲  .  𑣲𑣲𑣲𑣲𑣲𑣲  .  𑣲𑣲𑣲𑣲\n\n⟡  [｡ ₊°༺『𝐄𝐋𝐎 𝐑 𝐀』༻°₊ ｡](https://discord.gg/bNC2PCjpQZ)\n[⟡](https://media.discordapp.net/attachments/1479971970966622452/1490332285071786044/elora.png?ex=69d3ab99&is=69d25a19&hm=c18e4685b1346d5e321d1de7c51ca724d2364cdcf17d64e1b9d1acd35104ee3e&=&format=webp&quality=lossless&width=1860&height=759)   ||@everyone|| ||@here ||` ,
                        allowedMentions: { parse: [] }
                    }).catch(() => { });

                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder()
                            .setCustomId('partner_verify')
                            .setLabel('Verify ✦')
                            .setStyle(ButtonStyle.Primary)
                    );

                    await created.send({ components: [row] }).catch(() => { });
                });

                collector.on('end', () => { });
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

                const row = new ActionRowBuilder();
                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel(toSmallCaps('CLOSE TICKET'))
                        .setStyle(ButtonStyle.Danger)
                );

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
                    },
                    components: [row]
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

            const row = new ActionRowBuilder().addComponents(userSelect);

            return safeReply({
                content: `**Select the user you want to send a ${type} whisper to:**`,
                components: [row],
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

        if (interaction.isUserSelectMenu() && interaction.customId.startsWith('whisper_user_select_')) {
            const type = interaction.customId.split('_').pop();
            const targetUserId = interaction.values[0];

            const modal = new ModalBuilder()
                .setCustomId(`whisper_modal_${type}_${targetUserId}`)
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

        if (interaction.isModalSubmit() && interaction.customId.startsWith('whisper_modal_')) {
            if (!interaction.guild) return safeReply({ content: '**❌ This can only be used in a server.**', ephemeral: true });

            const parts = interaction.customId.split('_');
            const type = parts[2]; // 'private' or 'public'
            const targetId = parts[3];
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

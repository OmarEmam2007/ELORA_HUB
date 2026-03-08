const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const { recordDismissal } = require('../../utils/moderation/patternLearner');
const { generateDashboard } = require('../../utils/moderation/modDashboard');
const CustomReply = require('../../models/CustomReply');
const THEME = require('../../utils/theme');
const HelpCommand = require('../../commands/utility/help');
const SettingsCommand = require('../../commands/utility/settings');

module.exports = {
    name: 'interactionCreate',
    async execute(interaction, client) {
        // HUB must not handle moderation/security interactions (owned by SHIELD)
        try {
            const id = String(interaction.customId || '');
            if (id.startsWith('mod_') || id.startsWith('dash_') || id.startsWith('settings_') || id === 'settings_menu') {
                return;
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
                    await thread.send({ content: `${interaction.user}`, embeds: [embed], components: [row] });

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

                await safeReply({ content: '🔒 Closing...' });
                if (interaction.channel?.isThread?.()) {
                    return interaction.channel.delete().catch(() => { });
                }
                return setTimeout(() => interaction.channel.delete().catch(() => { }), 5000);
            }

            if (interaction.customId === 'ticket_close') {
                const allowed = new Set(['1085496418745200730', '629373738772594728']);
                if (!allowed.has(interaction.user.id)) {
                    return safeReply({ content: '❌ Admin only.', ephemeral: true });
                }

                await safeReply({ content: '🔒 Closing...' , ephemeral: true });
                try {
                    if (interaction.channel && interaction.channel.deletable) {
                        return interaction.channel.delete().catch(() => { });
                    }
                } catch (_) {
                    // ignore
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

        if (interaction.isStringSelectMenu?.() && interaction.customId === 'ticket_select') {
            await interaction.deferReply({ ephemeral: true }).catch(() => { });

            const STAFF_ROLE_IDS = [
                '1461766723274412126'
            ];

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

            const parentChannelId = '1461997428218794099';
            const parentChannel = await interaction.guild.channels.fetch(parentChannelId).catch(() => null);
            const parentId = parentChannel?.parentId || null;

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
                overwrites.push({
                    id: '1480220933187829881',
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            for (const roleId of STAFF_ROLE_IDS) {
                overwrites.push({
                    id: roleId,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory]
                });
            }

            const created = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: parentId,
                topic: `Ticket: ${value} • User: ${interaction.user.tag} (${interaction.user.id})`,
                permissionOverwrites: overwrites,
                reason: `Ticket created by ${interaction.user.tag} (${interaction.user.id})`
            }).catch(() => null);

            if (!created) {
                return safeEdit({ content: '❌ Failed to create ticket channel. Check bot permissions.' });
            }

            await safeEdit({ content: `✅ Ticket created: ${created}` });
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
                if (value === 'girls_verification') {
                    row.addComponents(
                        new ButtonBuilder()
                            .setCustomId('add_verified_role')
                            .setLabel(toSmallCaps('ADD THE VERIFIED ROLE'))
                            .setStyle(ButtonStyle.Success)
                    );
                }

                row.addComponents(
                    new ButtonBuilder()
                        .setCustomId('ticket_close')
                        .setLabel(toSmallCaps('CLOSE TICKET'))
                        .setStyle(ButtonStyle.Danger)
                );

                await created.send({ content: `${interaction.user}`, components: [row] }).catch(() => { });
            } catch (_) {
                // ignore
            }
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
        }
        catch (e) {
            console.error('interactionCreate handler error:', e);
        }
    }
};

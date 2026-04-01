const User = require('../../models/User');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, ChannelType } = require('discord.js');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const path = require('path');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const member = newState.member || oldState.member;
            if (!member || member.user?.bot) return;

            const MASTER_CHANNEL_ID = '1479241475845001381';
            // Temp channels are tracked by ID. Never rely on the channel name.
            if (!client.tempVoice) {
                client.tempVoice = {
                    channelOwners: new Map(), // channelId -> ownerId
                    ownerChannels: new Map(), // ownerId -> channelId
                };
            }

            const userId = member.id;
            const guildId = guild.id;

            const now = Date.now();

            // --- Dynamic Voice (temp channels) ---
            try {
                const oldCh = oldState.channel;
                const newCh = newState.channel;

                // Auto-delete empty temp channels (delay + API refetch to avoid race conditions)
                if (oldCh?.type === ChannelType.GuildVoice && client.tempVoice.channelOwners.has(oldCh.id)) {
                    setTimeout(async () => {
                        const ownerId = client.tempVoice.channelOwners.get(oldCh.id);
                        const fetched = await guild.channels.fetch(oldCh.id).catch(() => null);

                        // If it no longer exists, treat it as deleted and clean registry.
                        if (!fetched) {
                            client.tempVoice.channelOwners.delete(oldCh.id);
                            if (ownerId && client.tempVoice.ownerChannels.get(ownerId) === oldCh.id) {
                                client.tempVoice.ownerChannels.delete(ownerId);
                            }
                            return;
                        }

                        if (fetched.type !== ChannelType.GuildVoice) return;

                        // Re-check member count after refetch.
                        if (fetched.members?.size > 0) return;

                        try {
                            await fetched.delete('Dynamic voice: temp channel empty');
                        } catch (e) {
                            if (e?.code !== 10003 && !String(e?.message || '').toLowerCase().includes('unknown channel')) {
                                // Best-effort; ignore only Unknown Channel errors
                            }
                        } finally {
                            client.tempVoice.channelOwners.delete(oldCh.id);
                            if (ownerId && client.tempVoice.ownerChannels.get(ownerId) === oldCh.id) {
                                client.tempVoice.ownerChannels.delete(ownerId);
                            }
                        }
                    }, 2000);
                }

                if (newCh?.id === MASTER_CHANNEL_ID && oldCh?.id !== MASTER_CHANNEL_ID) {
                    console.log(`[TempVoice] ${member.user.tag} joined master (${MASTER_CHANNEL_ID}). Creating temp channel...`);
                    const parentId = newCh.parentId || null;

                    const created = await guild.channels.create({
                        name: `Temp - ${member.user.username}`,
                        type: 2,
                        reason: `Dynamic voice created for ${member.user.tag} (${member.id})`,
                        permissionOverwrites: [
                            {
                                id: guild.roles.everyone.id,
                                deny: ['ManageChannels', 'MoveMembers']
                            },
                            {
                                id: member.id,
                                allow: ['ManageChannels', 'MoveMembers']
                            }
                        ]
                    }).catch((e) => {
                        console.error('[TempVoice] failed to create channel:', e);
                        return null;
                    });

                    if (created && parentId) {
                        await created.setParent(parentId, { lockPermissions: false, reason: 'Dynamic voice: set parent category' }).catch(() => { });
                    }

                    if (created) {
                        // Track by ID so renames never break logic
                        client.tempVoice.channelOwners.set(created.id, member.id);
                        client.tempVoice.ownerChannels.set(member.id, created.id);

                        await newState.setChannel(created).catch(() => { });
                        console.log(`[TempVoice] Created ${created.id} for ${member.user.tag} and moved them.`);

                        try {
                            const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/1234.png'), { name: '1234.png' });
                            const embed = new EmbedBuilder()
                                .setColor(client?.config?.colors?.primary || THEME?.COLORS?.PRIMARY || '#111827')
                                .setDescription('**Temp Voice Control**')
                                .setImage('attachment://1234.png');

                            const row1 = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('tvcp_lock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Lock'),
                                new ButtonBuilder().setCustomId('tvcp_unlock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unlock'),
                                new ButtonBuilder().setCustomId('tvcp_hide').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Hide'),
                                new ButtonBuilder().setCustomId('tvcp_show').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unhide'),
                                new ButtonBuilder().setCustomId('tvcp_bitrate').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Bitrate')
                            );

                            const row2 = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('tvcp_open_transfer_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Transfer Owner'),
                                new ButtonBuilder().setCustomId('tvcp_limit').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('User Limit'),
                                new ButtonBuilder().setCustomId('tvcp_rename').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Rename'),
                                new ButtonBuilder().setCustomId('tvcp_move_me').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Move Me'),
                                new ButtonBuilder().setCustomId('tvcp_open_move_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Move Member')
                            );

                            const row3 = new ActionRowBuilder().addComponents(
                                new ButtonBuilder().setCustomId('tvcp_open_mute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Mute Member'),
                                new ButtonBuilder().setCustomId('tvcp_open_unmute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unmute Member'),
                                new ButtonBuilder().setCustomId('tvcp_open_deafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Deafen Member'),
                                new ButtonBuilder().setCustomId('tvcp_open_undeafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Undeafen Member'),
                                new ButtonBuilder().setCustomId('tvcp_open_kick_menu').setStyle(ButtonStyle.Danger).setEmoji('▫️').setLabel('Kick Member')
                            );

                            if (typeof created.send === 'function') {
                                await created.send({
                                    content: `<@${member.id}>`,
                                    allowedMentions: { users: [member.id] },
                                    files: [banner],
                                    embeds: [embed],
                                    components: [row1, row2, row3]
                                }).catch(() => { });
                            }
                        } catch (_) {
                            // Best-effort
                        }
                    } else {
                        console.log(`[TempVoice] Create returned null for ${member.user.tag}. Check permission/errors above.`);
                    }
                }
            } catch (_) {
                // Best-effort
            }

            // --- Advanced Voice Logs (join/leave/move) ---
            try {
                const oldCh = oldState.channel;
                const newCh = newState.channel;
                if (oldCh?.id !== newCh?.id) {
                    const logChannel = await getGuildLogChannel(guild, client);
                    if (logChannel) {
                        let title = '🔊 Voice State Updated';
                        const fields = [{ name: 'User', value: `${member.user.tag} (\`${member.id}\`)`, inline: true }];

                        if (!oldCh && newCh) {
                            title = '🔊 Voice Joined';
                            fields.push({ name: 'Channel', value: `${newCh} (\`${newCh.id}\`)`, inline: true });
                        } else if (oldCh && !newCh) {
                            title = '🔇 Voice Left';
                            fields.push({ name: 'Channel', value: `${oldCh} (\`${oldCh.id}\`)`, inline: true });
                        } else if (oldCh && newCh) {
                            title = '🔁 Voice Moved';
                            fields.push({ name: 'From', value: `${oldCh} (\`${oldCh.id}\`)`, inline: true });
                            fields.push({ name: 'To', value: `${newCh} (\`${newCh.id}\`)`, inline: true });
                        }

                        const embed = new EmbedBuilder()
                            .setTitle(title)
                            .setColor(client?.config?.colors?.info || '#5865F2')
                            .addFields(fields)
                            .setTimestamp();

                        await logChannel.send({ embeds: [embed] }).catch(() => { });
                    }
                }
            } catch (_) {
                // Best-effort
            }

            // Joined a voice channel
            if (!oldState.channelId && newState.channelId) {
                const profile = await User.findOneAndUpdate(
                    { userId, guildId },
                    { $setOnInsert: { userId, guildId }, $set: { voiceSessionStart: now } },
                    { upsert: true, new: true }
                );

                if (profile && !profile.voiceLevel) {
                    profile.voiceLevel = 1;
                    await profile.save().catch(() => { });
                }

                return;
            }

            // Left voice channel
            if (oldState.channelId && !newState.channelId) {
                const profile = await User.findOne({ userId, guildId }).catch(() => null);
                if (!profile) return;

                const start = profile.voiceSessionStart || 0;
                if (!start) return;

                const sessionMs = Math.max(0, now - start);

                // Anti-AFK: require at least 60s in voice to count
                if (sessionMs < 60 * 1000) {
                    profile.voiceSessionStart = 0;
                    await profile.save().catch(() => { });
                    return;
                }

                // Cap per session to prevent farming (2 hours max per leave event)
                const cappedMs = Math.min(sessionMs, 2 * 60 * 60 * 1000);

                // XP rule: 1 XP per minute (rounded down)
                const minutes = Math.floor(cappedMs / (60 * 1000));
                const xpGain = Math.max(0, minutes);

                profile.voiceTotalMs = (profile.voiceTotalMs || 0) + cappedMs;
                profile.voiceXp = (profile.voiceXp || 0) + xpGain;
                profile.voiceSessionStart = 0;

                if (!profile.voiceLevel) profile.voiceLevel = 1;
                let needed = profile.voiceLevel * 120;

                while (profile.voiceXp >= needed) {
                    profile.voiceXp -= needed;
                    profile.voiceLevel++;
                    needed = profile.voiceLevel * 120;
                }

                await profile.save().catch(() => { });
                return;
            }

            // Switched channels: treat as leave + join
            if (oldState.channelId && newState.channelId && oldState.channelId !== newState.channelId) {
                const profile = await User.findOne({ userId, guildId }).catch(() => null);
                if (profile && profile.voiceSessionStart) {
                    const start = profile.voiceSessionStart;
                    const sessionMs = Math.max(0, now - start);
                    if (sessionMs >= 60 * 1000) {
                        const cappedMs = Math.min(sessionMs, 2 * 60 * 60 * 1000);
                        const minutes = Math.floor(cappedMs / (60 * 1000));
                        const xpGain = Math.max(0, minutes);

                        profile.voiceTotalMs = (profile.voiceTotalMs || 0) + cappedMs;
                        profile.voiceXp = (profile.voiceXp || 0) + xpGain;

                        if (!profile.voiceLevel) profile.voiceLevel = 1;
                        let needed = profile.voiceLevel * 120;
                        while (profile.voiceXp >= needed) {
                            profile.voiceXp -= needed;
                            profile.voiceLevel++;
                            needed = profile.voiceLevel * 120;
                        }
                    }
                }

                await User.findOneAndUpdate(
                    { userId, guildId },
                    { $setOnInsert: { userId, guildId }, $set: { voiceSessionStart: now } },
                    { upsert: true, new: true }
                );

                if (profile) {
                    profile.voiceSessionStart = now;
                    await profile.save().catch(() => { });
                }
            }
        } catch (e) {
            console.error('voiceStateUpdate leveling error:', e);
        }
    }
};

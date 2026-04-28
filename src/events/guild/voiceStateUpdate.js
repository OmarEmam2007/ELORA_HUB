const User = require('../../models/User');
const { EmbedBuilder, ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');
const THEME = require('../../utils/theme');

const deletingChannels = new Set();

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const member = newState.member || oldState.member;
            if (!member || member.user?.bot) return;

            const AFK_CHANNEL_ID = '1473884345780535419';

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

            // --- AFK Auto Mute (Admin excluded, persistent tracking) ---
            try {
                const moved = oldState.channelId !== newState.channelId;
                if (moved) {
                    const wasInAfk = oldState.channelId === AFK_CHANNEL_ID;
                    const isInAfk = newState.channelId === AFK_CHANNEL_ID;

                    // On enter AFK: server mute (unless Administrator)
                    if (isInAfk && !wasInAfk) {
                        if (!member.permissions?.has?.('Administrator') && !member.permissions?.has?.(8n)) {
                            const me = guild.members.me;
                            if (me?.permissions?.has?.('MuteMembers')) {
                                const profile = await User.findOneAndUpdate(
                                    { userId, guildId },
                                    {
                                        $setOnInsert: { userId, guildId },
                                        $set: {
                                            afkAutoMuted: true,
                                            afkAutoDeafened: false,
                                            afkAutoAppliedAt: now,
                                            afkAutoChannelId: AFK_CHANNEL_ID
                                        }
                                    },
                                    { upsert: true, new: true }
                                );

                                await member.voice.setMute(true, 'AFK auto-mute').catch(() => { });

                                // If API calls failed (e.g., missing permission), revert tracking
                                if (!member.voice?.serverMute) {
                                    if (profile) {
                                        profile.afkAutoMuted = Boolean(member.voice?.serverMute);
                                        profile.afkAutoDeafened = false;
                                        await profile.save().catch(() => { });
                                    }
                                }
                            }
                        }
                    }

                    // On leave AFK: only undo if bot applied it
                    if (wasInAfk && !isInAfk) {
                        const profile = await User.findOne({ userId, guildId }).catch(() => null);
                        if (profile?.afkAutoChannelId === AFK_CHANNEL_ID) {
                            if (profile.afkAutoMuted && member.voice?.serverMute) {
                                await member.voice.setMute(false, 'AFK auto-unmute').catch(() => { });
                            }

                            profile.afkAutoMuted = false;
                            profile.afkAutoDeafened = false;
                            profile.afkAutoAppliedAt = 0;
                            profile.afkAutoChannelId = null;
                            await profile.save().catch(() => { });
                        }
                    }
                }
            } catch (_) {
                // Best-effort
            }

            // --- Dynamic Voice (temp channels) ---
            try {
                const oldCh = oldState.channel;
                const newCh = newState.channel;

                const movedVoiceChannel = oldState.channelId !== newState.channelId;

                // Auto-delete empty temp channels (delay + API refetch to avoid race conditions)
                if (movedVoiceChannel && oldCh?.type === ChannelType.GuildVoice && client.tempVoice.channelOwners.has(oldCh.id)) {
                    if (deletingChannels.has(oldCh.id)) {
                        // duplicate fire while deletion is in progress
                    } else {
                        deletingChannels.add(oldCh.id);

                        console.log(`[TempVoice] scheduling delete check for ${oldCh.id} (user moved/left).`);

                        setTimeout(async () => {
                            const ownerId = client.tempVoice.channelOwners.get(oldCh.id);
                            try {
                                const fetched = await guild.channels.fetch(oldCh.id).catch(() => null);

                            if (!fetched) {
                                client.tempVoice.channelOwners.delete(oldCh.id);
                                if (ownerId && client.tempVoice.ownerChannels.get(ownerId) === oldCh.id) {
                                    client.tempVoice.ownerChannels.delete(ownerId);
                                }
                                return;
                            }

                            if (fetched.type !== ChannelType.GuildVoice) return;
                            if (fetched.members?.size > 0) return;

                            console.log(`[TempVoice] deleting empty temp voice ${fetched.id}`);
                            try {
                                await fetched.delete('Dynamic voice: temp channel empty');
                            } catch (e) {
                                if (e?.code !== 10003 && !String(e?.message || '').toLowerCase().includes('unknown channel')) {
                                }
                            } finally {
                                client.tempVoice.channelOwners.delete(oldCh.id);
                                if (ownerId && client.tempVoice.ownerChannels.get(ownerId) === oldCh.id) {
                                    client.tempVoice.ownerChannels.delete(ownerId);
                                }
                            }
                            } finally {
                                deletingChannels.delete(oldCh.id);
                            }
                        }, 2000);
                    }
                }

                if (newCh?.id === MASTER_CHANNEL_ID && oldCh?.id !== MASTER_CHANNEL_ID) {
                    console.log(`[TempVoice] ${member.user.tag} joined master (${MASTER_CHANNEL_ID}). Creating temp channel...`);
                    const parentId = newCh.parentId || null;

                    const displayName = String(member.displayName || '').trim();
                    const channelName = (displayName.length ? displayName : String(member.user.username || 'Voice')).slice(0, 100);

                    const created = await guild.channels.create({
                        name: channelName,
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
                            const embed = new EmbedBuilder()
                                .setColor(client?.config?.colors?.primary || THEME?.COLORS?.PRIMARY || '#111827')
                                .setDescription('**Temp Voice Control**');

                            const buttons = [
                                new ButtonBuilder().setCustomId('tvcp_lock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('LOCK'),
                                new ButtonBuilder().setCustomId('tvcp_unlock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('OPEN'),
                                new ButtonBuilder().setCustomId('tvcp_hide').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('HIDE'),
                                new ButtonBuilder().setCustomId('tvcp_show').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('SHOW'),
                                new ButtonBuilder().setCustomId('tvcp_bitrate').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('RATE'),

                                new ButtonBuilder().setCustomId('tvcp_open_transfer_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('XFER'),
                                new ButtonBuilder().setCustomId('tvcp_limit').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('LIMT'),
                                new ButtonBuilder().setCustomId('tvcp_rename').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('NAME'),
                                new ButtonBuilder().setCustomId('tvcp_move_me').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('JOIN'),
                                new ButtonBuilder().setCustomId('tvcp_open_move_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('MOVE'),

                                new ButtonBuilder().setCustomId('tvcp_open_mute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('MUTE'),
                                new ButtonBuilder().setCustomId('tvcp_open_unmute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('UNMT'),
                                new ButtonBuilder().setCustomId('tvcp_open_deafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('DEAF'),
                                new ButtonBuilder().setCustomId('tvcp_open_undeafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('UNDF'),
                                new ButtonBuilder().setCustomId('tvcp_open_kick_menu').setStyle(ButtonStyle.Danger).setEmoji('▫️').setLabel('KICK')
                            ];

                            const rows = [];
                            for (let i = 0; i < buttons.length; i += 5) {
                                rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
                            }

                            const payload = {
                                content: `<@${member.id}>`,
                                allowedMentions: { users: [member.id] },
                                embeds: [embed],
                                components: rows
                            };

                            if (typeof created.send === 'function') {
                                await created.send(payload).catch(() => { });
                            } else {
                                await member.send({ embeds: [embed], components: rows }).catch(() => { });
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

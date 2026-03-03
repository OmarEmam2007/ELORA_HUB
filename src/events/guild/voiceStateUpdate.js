const User = require('../../models/User');
const { EmbedBuilder } = require('discord.js');
const { getGuildLogChannel } = require('../../utils/getGuildLogChannel');

module.exports = {
    name: 'voiceStateUpdate',
    async execute(oldState, newState, client) {
        try {
            const guild = newState.guild || oldState.guild;
            if (!guild) return;

            const member = newState.member || oldState.member;
            if (!member || member.user?.bot) return;

            const userId = member.id;
            const guildId = guild.id;

            const now = Date.now();

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

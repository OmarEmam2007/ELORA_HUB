const { EmbedBuilder } = require('discord.js');
const InviteStats = require('../../models/InviteStats');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            // --- 🔢 Member Count Voice Channel Update (best-effort) ---
            try {
                if (typeof client.queueMemberCountUpdate === 'function') {
                    client.queueMemberCountUpdate(member.guild.id);
                }
            } catch (_) {
                // ignore
            }

            // --- 🎫 Invite Leave Tracking ---
            // Best-effort: never block goodbye message.
            try {
                const guildId = member.guild.id;
                const leaverId = member.id;

                const inviterStats = await InviteStats.findOne({ guildId, 'invitedUsers.userId': leaverId });
                if (inviterStats) {
                    const record = inviterStats.invitedUsers.find(u => u.userId === leaverId);
                    if (record && !record.left) {
                        record.left = true;
                        inviterStats.leaves = (inviterStats.leaves || 0) + 1;

                        if (!record.isFake) {
                            inviterStats.regularInvites = Math.max(0, (inviterStats.regularInvites || 0) - 1);
                            inviterStats.inviteCount = Math.max(0, (inviterStats.inviteCount || 0) - 1);
                        }

                        await inviterStats.save().catch(() => { });

                        // Update inviter roles after subtraction (cumulative, optional cleanup not done here)
                        const roleTiers = [
                            { invites: 5, roleId: '1472157647804432528' },
                            { invites: 10, roleId: '1472158092035751988' },
                            { invites: 25, roleId: '1472158530256502848' },
                            { invites: 50, roleId: '1472163006740959395' },
                            { invites: 100, roleId: '1472160112205365278' }
                        ];

                        const inviterMember = await member.guild.members.fetch(inviterStats.userId).catch(() => null);
                        if (inviterMember) {
                            const netInvites = Math.max(0, (inviterStats.regularInvites || 0) - (inviterStats.leaves || 0));
                            const eligibleTiers = roleTiers.filter(t => netInvites >= t.invites);
                            const highestTier = eligibleTiers.length ? eligibleTiers[eligibleTiers.length - 1] : null;

                            const tierRoleIds = roleTiers.map(t => t.roleId);
                            const rolesToRemove = tierRoleIds.filter(roleId => roleId !== highestTier?.roleId);

                            if (highestTier && !inviterMember.roles.cache.has(highestTier.roleId)) {
                                await inviterMember.roles.add(highestTier.roleId, 'Invite rewards: tier adjusted after leave').catch(() => { });
                            }

                            for (const roleId of rolesToRemove) {
                                if (inviterMember.roles.cache.has(roleId)) {
                                    await inviterMember.roles.remove(roleId, 'Invite rewards: keep only highest tier role').catch(() => { });
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.error('Invite leave tracking error:', e);
            }

            const goodbyeChannelId = client.config.goodbyeChannelId;
            if (!goodbyeChannelId) return; // No goodbye channel configured

            const channel = member.guild.channels.cache.get(goodbyeChannelId);
            if (!channel) {
                console.error(`Goodbye channel ${goodbyeChannelId} not found.`);
                return;
            }

            const embed = new EmbedBuilder()
                .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━\n**Farewell, ${member.user.tag}.**\nYour presence will be missed.\n━━━━━━━━━━━━━━━━━━━━━━━━`)
                .setColor(client.config.colors.primary)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member Count: ${member.guild.memberCount}` })
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            console.log(`👋 Goodbye message sent for ${member.user.tag} (${member.id})`);
        } catch (error) {
            console.error('Error sending goodbye message:', error);
        }
    }
};

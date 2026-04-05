const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const InviteStats = require('../../models/InviteStats');
const giveawayService = require('../../services/giveawayService');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
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

                // --- ▫️ Giveaway Invite Leave Tracking (JSON, active giveaway only) ---
                try {
                    giveawayService.recordInviteLeaveForActive(leaverId);
                } catch (_) {
                    // ignore
                }

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
            const channel = goodbyeChannelId ? member.guild.channels.cache.get(goodbyeChannelId) : null;

            if (goodbyeChannelId && !channel) {
                console.error(`Goodbye channel ${goodbyeChannelId} not found.`);
            }

            if (channel) {
                const bannerName = client?.config?.goodbyeBanner || 'bye.png';
                const bannerCandidates = [
                    path.join(process.cwd(), 'ELORA NEW THEME', bannerName),
                    path.join(__dirname, '../../assets', bannerName),
                    path.join(__dirname, '../../../assets', bannerName),
                    path.join(process.cwd(), 'assets', bannerName),
                    path.join(process.cwd(), 'src', 'assets', bannerName)
                ];
                const bannerPath = bannerCandidates.find(p => {
                    try { return fs.existsSync(p); } catch (_) { return false; }
                }) || null;
                const bannerFile = bannerPath ? new AttachmentBuilder(bannerPath, { name: bannerName }) : null;

                const header = "**We don't chase, we attract**";
                const memberCount = Math.max(0, (member.guild.memberCount || 0) - 1);
                const body = [
                    `**${toSmallCaps('USER')}:** ${member}`,
                    `**${toSmallCaps('MEMBER COUNT')}:** ${memberCount}`
                ].join('\n');

                const embed = new EmbedBuilder()
                    .setColor(client?.config?.colors?.primary || 0x2b2d31)
                    .setTitle(header)
                    .setDescription(body)
                    .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
                    .setImage(bannerFile ? `attachment://${bannerName}` : null)
                    .setTimestamp();

                await channel.send({ embeds: [embed], files: bannerFile ? [bannerFile] : [] }).catch(() => { });
            }

            console.log(`[EVENT] guildMemberRemove triggered for ${member.user.tag}`);
            try {
                await member.send(`${member.client.emojis.cache.get('1487391271759646750')?.toString() || '✦'} **You stepped out of ELORA.**\n\n***We don't chase, we attract.***\n**See you when the other servers get boring.**\n\n**[ ✦ Return ](https://discord.gg/bNC2PCjpQZ)**`);
                console.log(`[SUCCESS] Farewell DM sent to ${member.user.tag}`);
            } catch (error) {
                console.log(`[FAILED] Could not send DM to ${member.user.tag}. They likely have DMs disabled.`);
            }
        } catch (error) {
            console.error('Error sending goodbye message:', error);
        }
    }
};

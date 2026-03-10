const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const InviteStats = require('../../models/InviteStats');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            if (member.user?.bot) return;

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

            try {
                const extraChannelIds = ['1462025794481164461', '1462079159332372480'];
                const emoji = `<:316591done:1480173440140054528>`;
                const text = `**${toSmallCaps('WELCOME TO ELORA')} ${member}, ${toSmallCaps('ENJOY')} ${emoji}**`;

                for (const channelId of extraChannelIds) {
                    const ch = await member.guild.channels.fetch(channelId).catch(() => null);
                    if (ch && ch.isTextBased?.()) {
                        await ch.send({ content: text }).catch(() => { });
                    }
                }
            } catch (_) {
                // ignore
            }

            const welcomeChannelId = client?.config?.welcomeChannelId;
            if (!welcomeChannelId) return;

            const channel = member.guild.channels.cache.get(welcomeChannelId);
            if (!channel || !channel.isTextBased?.()) return;

            const guild = member.guild;
            const guildId = guild.id;

            let inviterText = '@DISBOARD';
            let detectedInviterId = null;
            let joinUsedInviteCode = null;

            try {
                if (!client.inviteCache) client.inviteCache = new Map();
                const oldInvites = client.inviteCache.get(guildId) || new Map();
                const invites = await guild.invites.fetch().catch(() => null);

                if (invites) {
                    let usedInvite = null;
                    for (const inv of invites.values()) {
                        const prev = oldInvites.get(inv.code) || 0;
                        const nowUses = inv.uses || 0;
                        if (nowUses > prev) {
                            usedInvite = inv;
                            break;
                        }
                    }

                    const inviteMap = new Map();
                    for (const inv of invites.values()) inviteMap.set(inv.code, inv.uses || 0);
                    client.inviteCache.set(guildId, inviteMap);

                    if (usedInvite?.inviter) {
                        inviterText = `${usedInvite.inviter}`;
                        detectedInviterId = usedInvite.inviter.id;
                        joinUsedInviteCode = usedInvite.code;
                    }
                }
            } catch (_) {
                inviterText = '@DISBOARD';
            }

            // --- 🎫 Invite Join Tracking (MongoDB) ---
            // Best-effort: never block welcome message.
            try {
                if (detectedInviterId && detectedInviterId !== member.id) {
                    const now = new Date();
                    const isFake = (now.getTime() - member.user.createdAt.getTime()) < (24 * 60 * 60 * 1000);

                    const stats = await InviteStats.findOneAndUpdate(
                        { guildId, userId: detectedInviterId },
                        { $setOnInsert: { guildId, userId: detectedInviterId } },
                        { new: true, upsert: true }
                    ).catch(() => null);

                    if (stats) {
                        const already = stats.invitedUsers?.some(u => u.userId === member.id);
                        if (!already) {
                            stats.invitedUsers.push({ userId: member.id, joinedAt: now, isFake, left: false });
                            if (isFake) stats.fakeInvites = (stats.fakeInvites || 0) + 1;
                            else stats.regularInvites = (stats.regularInvites || 0) + 1;
                            stats.inviteCount = (stats.inviteCount || 0) + 1;
                            await stats.save().catch(() => { });
                        }
                    }
                }
            } catch (_) {
                // ignore
            }

            const bannerName = String(client?.config?.welcomeBanner || '1.png');
            const bannerPath = path.join(__dirname, '../../assets', bannerName);
            const bannerFile = new AttachmentBuilder(bannerPath);

            const header = '**' + toSmallCaps('WELCOME TO ELORA') + '**';
            const body = [
                `**${toSmallCaps('USER')}:** ${member}`,
                `**${toSmallCaps('INVITED BY')}:** ${inviterText}`,
                `**${toSmallCaps('MEMBER COUNT')}:** ${guild.memberCount}`
            ].join('\n');

            const embed = new EmbedBuilder()
                .setColor(client?.config?.colors?.primary || 0x2b2d31)
                .setTitle(header)
                .setDescription(body)
                .setThumbnail(member.user.displayAvatarURL({ extension: 'png', size: 256 }))
                .setImage(`attachment://${bannerName}`);

            await channel.send({ embeds: [embed], files: [bannerFile] }).catch(() => { });

            // 8. Assign Nickname? (Requires permissions, risky if owner)
            // if (member.manageable) {
            //    member.setNickname(loreData.title).catch(e => console.log('Cannot set nick'));
            // }

        } catch (error) {
            console.error('❌ Sentient Entry Error:', error);
        }
    },
};

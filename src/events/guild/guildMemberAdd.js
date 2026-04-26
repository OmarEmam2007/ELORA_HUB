const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const InviteStats = require('../../models/InviteStats');
const giveawayService = require('../../services/giveawayService');

let Canvas = null;
try {
    Canvas = require('@napi-rs/canvas');
} catch (_) {
    Canvas = null;
}

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            if (member.user?.bot) return;

            try {
                const roleId = client?.config?.astrayRoleId;
                if (roleId && !member.roles.cache.has(roleId)) {
                    await member.roles.add(roleId, 'Auto verification on join').catch(() => { });
                }
            } catch (_) {
                // ignore
            }

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
                const emoji = `<a:316591done:1487391271759646750>`;
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

                    // --- ▫️ Giveaway Invite Tracking (JSON, active giveaway only) ---
                    try {
                        giveawayService.recordInviteJoinForActive(detectedInviterId, member.id, now.getTime());
                    } catch (_) {
                        // ignore
                    }

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

            const bannerName = 'new banner1.png';
            const bannerCandidates = [
                path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
            ];

            const bannerPath = bannerCandidates.find((p) => {
                try {
                    return fs.existsSync(p);
                } catch (_) {
                    return false;
                }
            }) || null;

            let bannerFile = bannerPath ? new AttachmentBuilder(bannerPath, { name: bannerName }) : null;

            // Build a dynamic welcome image (banner background + circular avatar + welcome text)
            try {
                if (Canvas && bannerPath) {
                    const bg = await Canvas.loadImage(bannerPath);

                    const width = bg.width || 1600;
                    const height = bg.height || 900;
                    const canvas = Canvas.createCanvas(width, height);
                    const ctx = canvas.getContext('2d');

                    ctx.drawImage(bg, 0, 0, width, height);

                    // --- avatar ---
                    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
                    const av = await Canvas.loadImage(avatarUrl);

                    const centerX = Math.floor(width / 2);
                    const centerY = Math.floor(height / 2) + Math.floor(height * 0.05);
                    const radius = Math.floor(Math.min(width, height) * 0.14);

                    // soft shadow
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 10, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.shadowColor = 'rgba(0,0,0,0.55)';
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = 'rgba(0,0,0,0.15)';
                    ctx.fill();
                    ctx.restore();

                    // clip circle
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();

                    ctx.drawImage(av, centerX - radius, centerY - radius, radius * 2, radius * 2);
                    ctx.restore();

                    // ring
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 6, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.lineWidth = 8;
                    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
                    ctx.stroke();
                    ctx.restore();

                    // --- text ---
                    const username = member.user.globalName || member.user.username;
                    const title = `WELCOME ${username}`;

                    const fontSize = Math.floor(Math.min(width, height) * 0.06);
                    ctx.font = `800 ${fontSize}px Sans`;
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    ctx.fillStyle = 'rgba(255,255,255,0.95)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = Math.max(2, Math.floor(fontSize * 0.12));

                    const textY = Math.floor(height * 0.18);
                    ctx.strokeText(title, centerX, textY);
                    ctx.fillText(title, centerX, textY);

                    const out = canvas.toBuffer('image/png');
                    bannerFile = new AttachmentBuilder(out, { name: bannerName });
                }
            } catch (_) {
                // fallback to static bannerFile
            }

            const header = '**' + toSmallCaps('WELCOME TO ELORA') + '**';
            const body = [
                `**${toSmallCaps('USER')}:** ${member}`,
                `**${toSmallCaps('INVITED BY')}:** ${inviterText}`,
                `**${toSmallCaps('MEMBER COUNT')}:** ${guild.memberCount}`
            ].join('\n');

            const content = [header, body]
                .join('\n')
                .split('\n')
                .map((line) => `> ${line}`)
                .join('\n');

            await channel.send({ content, files: bannerFile ? [bannerFile] : [] }).catch(() => { });

            // 8. Assign Nickname? (Requires permissions, risky if owner)
            // if (member.manageable) {
            //    member.setNickname(loreData.title).catch(e => console.log('Cannot set nick'));
            // }

        } catch (error) {
            console.error('❌ Sentient Entry Error:', error);
        }
    },
};

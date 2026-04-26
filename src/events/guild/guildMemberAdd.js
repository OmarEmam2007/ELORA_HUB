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

                    const roundRect = (x, y, w, h, r) => {
                        const radius = Math.max(0, Math.min(r, w / 2, h / 2));
                        ctx.beginPath();
                        ctx.moveTo(x + radius, y);
                        ctx.arcTo(x + w, y, x + w, y + h, radius);
                        ctx.arcTo(x + w, y + h, x, y + h, radius);
                        ctx.arcTo(x, y + h, x, y, radius);
                        ctx.arcTo(x, y, x + w, y, radius);
                        ctx.closePath();
                    };

                    const fitText = (text, maxWidth, startSize, minSize) => {
                        let size = startSize;
                        while (size > minSize) {
                            ctx.font = `900 ${size}px Sans`;
                            const m = ctx.measureText(text);
                            if (m.width <= maxWidth) break;
                            size -= 2;
                        }
                        return size;
                    };

                    const ellipsis = (s, maxLen) => {
                        const str = String(s || '').trim();
                        if (!maxLen || str.length <= maxLen) return str;
                        return `${str.slice(0, Math.max(0, maxLen - 1))}…`;
                    };

                    const drawSpacedText = (text, x, y, spacing, strokeFirst = true) => {
                        const chars = String(text || '').split('');
                        const widths = chars.map((ch) => ctx.measureText(ch).width);
                        const total = widths.reduce((a, b) => a + b, 0) + spacing * Math.max(0, chars.length - 1);
                        let cursor = x - total / 2;

                        for (let i = 0; i < chars.length; i++) {
                            const ch = chars[i];
                            const w = widths[i];
                            const cx = cursor + w / 2;
                            if (strokeFirst) ctx.strokeText(ch, cx, y);
                            ctx.fillText(ch, cx, y);
                            cursor += w + spacing;
                        }
                    };

                    const drawPill = ({ x, y, text, paddingX = 16, paddingY = 10, radius = 16 }) => {
                        const t = String(text || '').trim();
                        const m = ctx.measureText(t);
                        const w = Math.ceil(m.width + paddingX * 2);
                        const h = Math.ceil((m.actualBoundingBoxAscent + m.actualBoundingBoxDescent) + paddingY * 2);

                        ctx.save();
                        roundRect(x, y, w, h, radius);
                        ctx.fillStyle = 'rgba(255,255,255,0.08)';
                        ctx.fill();
                        ctx.lineWidth = 2;
                        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
                        ctx.stroke();
                        ctx.restore();

                        ctx.save();
                        ctx.fillStyle = 'rgba(255,255,255,0.92)';
                        ctx.textAlign = 'left';
                        ctx.textBaseline = 'middle';
                        ctx.fillText(t, x + paddingX, y + h / 2);
                        ctx.restore();

                        return { w, h };
                    };

                    // Cinematic overlays to ensure readability + premium look
                    const leftFade = ctx.createLinearGradient(0, 0, Math.floor(width * 0.65), 0);
                    leftFade.addColorStop(0, 'rgba(0,0,0,0.72)');
                    leftFade.addColorStop(0.55, 'rgba(0,0,0,0.35)');
                    leftFade.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = leftFade;
                    ctx.fillRect(0, 0, width, height);

                    const topFade = ctx.createLinearGradient(0, 0, 0, Math.floor(height * 0.35));
                    topFade.addColorStop(0, 'rgba(0,0,0,0.65)');
                    topFade.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = topFade;
                    ctx.fillRect(0, 0, width, height);

                    // Vignette (focus center-left)
                    const vignette = ctx.createRadialGradient(
                        Math.floor(width * 0.33),
                        Math.floor(height * 0.55),
                        Math.floor(Math.min(width, height) * 0.25),
                        Math.floor(width * 0.33),
                        Math.floor(height * 0.55),
                        Math.floor(Math.min(width, height) * 0.78)
                    );
                    vignette.addColorStop(0, 'rgba(0,0,0,0)');
                    vignette.addColorStop(1, 'rgba(0,0,0,0.55)');
                    ctx.fillStyle = vignette;
                    ctx.fillRect(0, 0, width, height);

                    // Subtle grain
                    try {
                        const img = ctx.getImageData(0, 0, width, height);
                        const d = img.data;
                        const strength = 10;
                        for (let i = 0; i < d.length; i += 4) {
                            const n = (Math.random() * 2 - 1) * strength;
                            d[i] = Math.max(0, Math.min(255, d[i] + n));
                            d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
                            d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
                        }
                        ctx.putImageData(img, 0, 0);
                    } catch (_) {
                        // ignore grain failures
                    }

                    // --- avatar ---
                    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
                    const av = await Canvas.loadImage(avatarUrl);

                    // Position tuned for this banner: keep the right-side character visible.
                    const centerX = Math.floor(width * 0.34);
                    const centerY = Math.floor(height * 0.58);
                    const radius = Math.floor(Math.min(width, height) * 0.17);

                    // Glass card behind avatar
                    const cardW = Math.floor(radius * 3.0);
                    const cardH = Math.floor(radius * 2.35);
                    const cardX = Math.floor(centerX - cardW / 2);
                    const cardY = Math.floor(centerY - cardH / 2);

                    ctx.save();
                    roundRect(cardX, cardY, cardW, cardH, Math.floor(radius * 0.35));
                    ctx.fillStyle = 'rgba(255,255,255,0.06)';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
                    ctx.stroke();
                    ctx.restore();

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

                    // Shine / highlight overlay (adds a premium feel)
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();

                    const shine = ctx.createLinearGradient(
                        centerX - radius,
                        centerY - radius,
                        centerX + radius,
                        centerY + radius
                    );
                    shine.addColorStop(0, 'rgba(255,255,255,0.35)');
                    shine.addColorStop(0.35, 'rgba(255,255,255,0.10)');
                    shine.addColorStop(0.7, 'rgba(255,255,255,0.00)');
                    ctx.fillStyle = shine;
                    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);

                    // subtle diagonal streak
                    ctx.globalAlpha = 0.22;
                    ctx.fillStyle = 'rgba(106,228,255,1)';
                    ctx.translate(centerX, centerY);
                    ctx.rotate(-0.45);
                    ctx.fillRect(-radius * 2, -radius * 0.15, radius * 4, radius * 0.24);
                    ctx.restore();

                    // ring
                    ctx.save();
                    const ringGrad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
                    ringGrad.addColorStop(0, 'rgba(106,228,255,0.95)');
                    ringGrad.addColorStop(0.55, 'rgba(255,255,255,0.85)');
                    ringGrad.addColorStop(1, 'rgba(106,228,255,0.95)');
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.lineWidth = 10;
                    ctx.strokeStyle = ringGrad;
                    ctx.shadowColor = 'rgba(106,228,255,0.35)';
                    ctx.shadowBlur = 14;
                    ctx.stroke();
                    ctx.restore();

                    // --- text ---
                    const username = member.user.globalName || member.user.username;
                    const title = `WELCOME ${username}`;

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const titleMaxWidth = Math.floor(width * 0.55);
                    const titleSize = fitText(title.toUpperCase(), titleMaxWidth, Math.floor(height * 0.085), Math.floor(height * 0.05));
                    ctx.font = `900 ${titleSize}px Sans`;

                    const textY = Math.floor(height * 0.26);
                    ctx.shadowColor = 'rgba(0,0,0,0.85)';
                    ctx.shadowBlur = 22;
                    ctx.fillStyle = 'rgba(255,255,255,0.96)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
                    ctx.lineWidth = Math.max(3, Math.floor(titleSize * 0.12));

                    // pseudo letter-spacing
                    const spaced = title.toUpperCase();
                    const spacing = Math.max(1, Math.floor(titleSize * 0.06));
                    drawSpacedText(spaced, centerX, textY, spacing, true);

                    // subtitle
                    const sub = 'WELCOME TO ELORA';
                    const subSize = Math.floor(titleSize * 0.45);
                    ctx.shadowBlur = 14;
                    ctx.font = `700 ${subSize}px Sans`;
                    ctx.fillStyle = 'rgba(106,228,255,0.92)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = Math.max(2, Math.floor(subSize * 0.12));
                    ctx.strokeText(sub, centerX, Math.floor(textY + titleSize * 0.75));
                    ctx.fillText(sub, centerX, Math.floor(textY + titleSize * 0.75));

                    // Badges (premium pills)
                    ctx.save();
                    const badgeFont = Math.max(14, Math.floor(height * 0.028));
                    ctx.font = `800 ${badgeFont}px Sans`;
                    ctx.shadowColor = 'rgba(0,0,0,0.65)';
                    ctx.shadowBlur = 14;

                    const topLeftX = Math.floor(width * 0.06);
                    const topY = Math.floor(height * 0.06);
                    const b1 = drawPill({ x: topLeftX, y: topY, text: 'NEW MEMBER' });

                    const idShort = String(member.id || '').slice(-6);
                    drawPill({ x: topLeftX + b1.w + 12, y: topY, text: `ID • ${idShort}` });
                    ctx.restore();

                    // Info line (Invited by + member count) - minimal and clean
                    const invitedByClean = ellipsis(String(inviterText || '@DISBOARD').replace(/\s+/g, ' ').trim(), 22);
                    const infoText = `INVITED BY ${invitedByClean}  •  MEMBER #${guild.memberCount || 0}`;
                    const infoSize = Math.max(16, Math.floor(subSize * 0.58));
                    ctx.shadowBlur = 10;
                    ctx.font = `700 ${infoSize}px Sans`;
                    ctx.fillStyle = 'rgba(255,255,255,0.82)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = Math.max(2, Math.floor(infoSize * 0.10));
                    ctx.strokeText(infoText, centerX, Math.floor(centerY + radius + infoSize * 2.2));
                    ctx.fillText(infoText, centerX, Math.floor(centerY + radius + infoSize * 2.2));

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

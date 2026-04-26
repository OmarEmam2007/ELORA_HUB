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
                path.join(process.cwd(), 'src', 'assets', bannerName),
                path.join(process.cwd(), 'assets', bannerName),
                path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
            ];

            const bannerPath = bannerCandidates.find((p) => {
                try {
                    return fs.existsSync(p);
                } catch (_) {
                    return false;
                }
            }) || null;

            if (bannerPath) {
                console.log('[welcome] Using banner:', bannerPath);
            }

            const welcomeOutName = `welcome-${member.id}.png`;
            let bannerFile = bannerPath ? new AttachmentBuilder(bannerPath, { name: bannerName }) : null;

            // Build a dynamic welcome image (banner background + circular avatar + welcome text)
            try {
                if (Canvas && bannerPath) {
                    // Optional custom fonts (for consistent premium typography)
                    // Put the following files in: src/assets/fonts/
                    // - Montserrat-Black.ttf
                    // - Inter-SemiBold.ttf
                    try {
                        const fontsDir = path.join(process.cwd(), 'src', 'assets', 'fonts');
                        const montserratPath = path.join(fontsDir, 'Montserrat-Black.ttf');
                        const interPath = path.join(fontsDir, 'Inter-SemiBold.ttf');
                        const cinzelPath = path.join(fontsDir, 'Cinzel-SemiBold.ttf');
                        const cinzelBoldPath = path.join(fontsDir, 'Cinzel-Bold.ttf');

                        if (fs.existsSync(montserratPath)) {
                            Canvas.GlobalFonts.registerFromPath(montserratPath, 'Montserrat');
                        }
                        if (fs.existsSync(interPath)) {
                            Canvas.GlobalFonts.registerFromPath(interPath, 'Inter');
                        }
                        if (fs.existsSync(cinzelBoldPath)) {
                            Canvas.GlobalFonts.registerFromPath(cinzelBoldPath, 'Cinzel');
                        } else if (fs.existsSync(cinzelPath)) {
                            Canvas.GlobalFonts.registerFromPath(cinzelPath, 'Cinzel');
                        }
                    } catch (_) {
                        // ignore font loading errors; fallback to system fonts
                    }

                    const bg = await Canvas.loadImage(bannerPath);

                    const width = 1024;
                    const height = 576;
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
                            ctx.font = `800 ${size}px Cinzel, Montserrat, Serif`;
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
                        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
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

                    const ACCENT = 'rgba(197, 160, 72, 0.92)';

                    // Monochrome overlays (match the banner: black/white only)
                    const leftFade = ctx.createLinearGradient(0, 0, Math.floor(width * 0.7), 0);
                    leftFade.addColorStop(0, 'rgba(0,0,0,0.64)');
                    leftFade.addColorStop(0.55, 'rgba(0,0,0,0.32)');
                    leftFade.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = leftFade;
                    ctx.fillRect(0, 0, width, height);

                    const topFade = ctx.createLinearGradient(0, 0, 0, Math.floor(height * 0.30));
                    topFade.addColorStop(0, 'rgba(0,0,0,0.54)');
                    topFade.addColorStop(1, 'rgba(0,0,0,0)');
                    ctx.fillStyle = topFade;
                    ctx.fillRect(0, 0, width, height);

                    // Vignette (subtle, monochrome)
                    const vignette = ctx.createRadialGradient(
                        Math.floor(width * 0.55),
                        Math.floor(height * 0.52),
                        Math.floor(Math.min(width, height) * 0.20),
                        Math.floor(width * 0.55),
                        Math.floor(height * 0.52),
                        Math.floor(Math.max(width, height) * 0.70)
                    );
                    vignette.addColorStop(0, 'rgba(0,0,0,0)');
                    vignette.addColorStop(0.62, 'rgba(0,0,0,0.22)');
                    vignette.addColorStop(1, 'rgba(0,0,0,0.62)');
                    ctx.fillStyle = vignette;
                    ctx.fillRect(0, 0, width, height);

                    // Film grain (very subtle, monochrome)
                    ctx.save();
                    ctx.globalAlpha = 0.04;
                    const grainCount = Math.min(12000, Math.floor((width * height) / 180));
                    for (let i = 0; i < grainCount; i++) {
                        const x = (Math.random() * width) | 0;
                        const y = (Math.random() * height) | 0;
                        const v = (Math.random() * 255) | 0;
                        ctx.fillStyle = `rgb(${v},${v},${v})`;
                        ctx.fillRect(x, y, 1, 1);
                    }
                    ctx.restore();

                    ctx.globalAlpha = 1;
                    ctx.filter = 'none';
                    ctx.shadowBlur = 0;
                    ctx.shadowColor = 'rgba(0,0,0,0)';

                    // --- avatar ---
                    const avatarUrl = member.user.displayAvatarURL({ extension: 'png', size: 512 });
                    const av = await Canvas.loadImage(avatarUrl);

                    // Position tuned for this banner: keep the right-side character visible.
                    const centerX = Math.floor(width * 0.34);
                    const centerY = Math.floor(height * 0.58);
                    const radius = Math.floor(Math.min(width, height) * 0.17);

                    // Minimal plate behind avatar (keep monochrome + subtle)
                    const cardW = Math.floor(radius * 2.85);
                    const cardH = Math.floor(radius * 2.15);
                    const cardX = Math.floor(centerX - cardW / 2);
                    const cardY = Math.floor(centerY - cardH / 2);

                    ctx.save();
                    roundRect(cardX, cardY, cardW, cardH, Math.floor(radius * 0.30));
                    ctx.fillStyle = 'rgba(0,0,0,0.28)';
                    ctx.fill();
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
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

                    // Draw avatar as grayscale to match the banner
                    ctx.filter = 'saturate(0.88) contrast(1.12) brightness(1.02)';
                    ctx.drawImage(av, centerX - radius, centerY - radius, radius * 2, radius * 2);
                    ctx.filter = 'none';
                    ctx.restore();

                    // Subtle monochrome highlight
                    ctx.save();
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.clip();

                    const shine = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
                    shine.addColorStop(0, 'rgba(255,255,255,0.22)');
                    shine.addColorStop(0.35, 'rgba(255,255,255,0.08)');
                    shine.addColorStop(0.7, 'rgba(255,255,255,0.00)');
                    ctx.fillStyle = shine;
                    ctx.fillRect(centerX - radius, centerY - radius, radius * 2, radius * 2);
                    ctx.restore();

                    // ring
                    ctx.save();
                    const ringGrad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
                    ringGrad.addColorStop(0, 'rgba(255,255,255,0.92)');
                    ringGrad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
                    ringGrad.addColorStop(1, 'rgba(255,255,255,0.92)');
                    ctx.beginPath();
                    ctx.arc(centerX, centerY, radius + 7, 0, Math.PI * 2);
                    ctx.closePath();
                    ctx.lineWidth = 10;
                    ctx.strokeStyle = ringGrad;
                    ctx.shadowColor = 'rgba(255,255,255,0.10)';
                    ctx.shadowBlur = 6;
                    ctx.stroke();
                    ctx.restore();

                    // --- text ---
                    const username = member.user.globalName || member.user.username;
                    const title = `WELCOME ${username}`;

                    ctx.globalAlpha = 1;
                    ctx.filter = 'none';

                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';

                    const titleMaxWidth = Math.floor(width * 0.58);
                    const titleSize = fitText(title.toUpperCase(), titleMaxWidth, Math.floor(height * 0.085), Math.floor(height * 0.05));
                    ctx.font = `800 ${titleSize}px Cinzel, Montserrat, Serif`;

                    const textY = Math.floor(height * 0.26);
                    ctx.shadowColor = 'rgba(0,0,0,0.85)';
                    ctx.shadowBlur = 18;
                    ctx.fillStyle = 'rgba(255,255,255,0.96)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
                    ctx.lineWidth = Math.max(3, Math.floor(titleSize * 0.12));

                    // pseudo letter-spacing
                    const spaced = title.toUpperCase();
                    const spacing = Math.max(1, Math.floor(titleSize * 0.06));
                    drawSpacedText(spaced, centerX, textY, spacing, true);

                    // Accent underline (adds a bit of life without ruining the theme)
                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 0.95;
                    const underlineW = Math.floor(Math.min(titleMaxWidth, ctx.measureText(spaced).width) * 0.26);
                    const underlineH = Math.max(3, Math.floor(titleSize * 0.06));
                    const underlineX = Math.floor(centerX - underlineW / 2);
                    const underlineY = Math.floor(textY + titleSize * 0.52);
                    ctx.fillStyle = ACCENT;
                    roundRect(underlineX, underlineY, underlineW, underlineH, Math.floor(underlineH / 2));
                    ctx.fill();
                    ctx.restore();

                    ctx.save();
                    ctx.shadowBlur = 0;
                    ctx.globalAlpha = 0.70;
                    ctx.lineWidth = 2;
                    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
                    const ornamentY = Math.floor(underlineY + underlineH / 2);
                    const gap = Math.floor(Math.max(14, titleSize * 0.22));
                    const leftX1 = Math.floor(centerX - underlineW / 2 - gap);
                    const leftX0 = Math.floor(Math.max(0, leftX1 - Math.min(140, Math.floor(titleMaxWidth * 0.18))));
                    const rightX0 = Math.floor(centerX + underlineW / 2 + gap);
                    const rightX1 = Math.floor(Math.min(width, rightX0 + Math.min(140, Math.floor(titleMaxWidth * 0.18))));
                    ctx.beginPath();
                    ctx.moveTo(leftX0, ornamentY);
                    ctx.lineTo(leftX1, ornamentY);
                    ctx.moveTo(rightX0, ornamentY);
                    ctx.lineTo(rightX1, ornamentY);
                    ctx.stroke();

                    ctx.globalAlpha = 0.85;
                    ctx.fillStyle = ACCENT;
                    const d = Math.max(4, Math.floor(titleSize * 0.08));
                    const drawDiamond = (x, y) => {
                        ctx.beginPath();
                        ctx.moveTo(x, y - d);
                        ctx.lineTo(x + d, y);
                        ctx.lineTo(x, y + d);
                        ctx.lineTo(x - d, y);
                        ctx.closePath();
                        ctx.fill();
                    };
                    drawDiamond(leftX1 + Math.floor(gap * 0.35), ornamentY);
                    drawDiamond(rightX0 - Math.floor(gap * 0.35), ornamentY);
                    ctx.restore();

                    // subtitle
                    
                    const subSize = Math.max(18, Math.min(36, Math.floor(titleSize * 0.45)));
                    ctx.shadowBlur = 10;
                    ctx.font = `650 ${subSize}px Inter, Sans`;
                    ctx.fillStyle = 'rgba(255,255,255,0.72)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = Math.max(2, Math.floor(subSize * 0.12));
                    ctx.strokeText(sub, centerX, Math.floor(textY + titleSize * 0.75));
                    ctx.fillText(sub, centerX, Math.floor(textY + titleSize * 0.75));

                    // Badges (minimal mono tags)
                    ctx.save();
                    const badgeFont = Math.max(13, Math.min(18, Math.floor(height * 0.026)));
                    ctx.font = `700 ${badgeFont}px Inter, Sans`;
                    ctx.shadowColor = 'rgba(0,0,0,0.55)';
                    ctx.shadowBlur = 10;

                    const topLeftX = Math.floor(width * 0.06);
                    const topY = Math.floor(height * 0.06);
                    const b1 = drawPill({ x: topLeftX, y: topY, text: 'NEW MEMBER', paddingX: 14, paddingY: 8, radius: 14 });

                    // Subtle accent stroke on first badge
                    ctx.save();
                    ctx.globalAlpha = 0.8;
                    ctx.lineWidth = 2;
                    roundRect(topLeftX, topY, b1.w, b1.h, 14);
                    ctx.strokeStyle = ACCENT;
                    ctx.stroke();
                    ctx.restore();
                    ctx.restore();

                    // Info line (Invited by + member count) - minimal and clean
                    const invitedByClean = ellipsis(String(inviterText || '@DISBOARD').replace(/\s+/g, ' ').trim(), 22);
                    const infoText = `INVITED BY ${invitedByClean}  •  MEMBER #${guild.memberCount || 0}`;
                    const infoSize = Math.max(16, Math.min(26, Math.floor(subSize * 0.58)));
                    ctx.shadowBlur = 8;
                    ctx.font = `650 ${infoSize}px Inter, Sans`;
                    ctx.fillStyle = 'rgba(255,255,255,0.78)';
                    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                    ctx.lineWidth = Math.max(2, Math.floor(infoSize * 0.10));
                    ctx.strokeText(infoText, centerX, Math.floor(centerY + radius + infoSize * 2.2));
                    ctx.fillText(infoText, centerX, Math.floor(centerY + radius + infoSize * 2.2));

                    const out = canvas.toBuffer('image/png');
                    bannerFile = new AttachmentBuilder(out, { name: welcomeOutName });
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

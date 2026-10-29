const { AttachmentBuilder } = require('discord.js');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const COLORS = {
    bg: '#0B0D10',
    surface: '#12151A',
    stroke: '#2A2F38',
    accent: '#C8CDD6',
    muted: '#8B919A',
    barBg: '#1A1E24',
    barFill: '#E6E8EC',
    white: '#F4F5F7'
};

let canvacordReady = false;
let RankCardBuilder = null;
let Font = null;

try {
    ({ RankCardBuilder, Font } = require('canvacord'));
    if (Font?.loadDefault) Font.loadDefault();
    canvacordReady = Boolean(RankCardBuilder);
} catch (_) {
    canvacordReady = false;
}

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function formatXp(n) {
    const v = Math.max(0, Number(n) || 0);
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return String(Math.floor(v));
}

async function buildCanvasRankCard({ username, avatarUrl, level, currentXp, requiredXp, rank, status }) {
    const width = 934;
    const height = 282;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, width, height);

    roundedRect(ctx, 18, 18, width - 36, height - 36, 22);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = COLORS.stroke;
    ctx.stroke();

    const avatarSize = 168;
    const ax = 48;
    const ay = (height - avatarSize) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    try {
        const avatar = await loadImage(avatarUrl);
        ctx.drawImage(avatar, ax, ay, avatarSize, avatarSize);
    } catch (_) {
        ctx.fillStyle = '#1C2128';
        ctx.fillRect(ax, ay, avatarSize, avatarSize);
    }
    ctx.restore();

    ctx.beginPath();
    ctx.arc(ax + avatarSize / 2, ay + avatarSize / 2, avatarSize / 2 + 3, 0, Math.PI * 2);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    ctx.stroke();

    const statusColor =
        status === 'online'
            ? '#3BA55D'
            : status === 'idle'
              ? '#FAA81A'
              : status === 'dnd'
                ? '#ED4245'
                : '#747F8D';
    ctx.beginPath();
    ctx.arc(ax + avatarSize - 16, ay + avatarSize - 16, 16, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.surface;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax + avatarSize - 16, ay + avatarSize - 16, 11, 0, Math.PI * 2);
    ctx.fillStyle = statusColor;
    ctx.fill();

    const textX = 250;
    ctx.fillStyle = COLORS.white;
    ctx.font = '700 42px sans-serif';
    const safeName = String(username || 'Unknown').slice(0, 22);
    ctx.fillText(safeName, textX, 92);

    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 22px sans-serif';
    ctx.fillText(`RANK  #${rank || '?'}`, textX, 132);

    ctx.fillStyle = COLORS.accent;
    ctx.font = '600 22px sans-serif';
    const levelLabel = `LEVEL  ${level}`;
    const levelWidth = ctx.measureText(levelLabel).width;
    ctx.fillText(levelLabel, width - 48 - levelWidth, 92);

    const xpLabel = `${formatXp(currentXp)} / ${formatXp(requiredXp)} XP`;
    ctx.fillStyle = COLORS.muted;
    ctx.font = '500 20px sans-serif';
    const xpWidth = ctx.measureText(xpLabel).width;
    ctx.fillText(xpLabel, width - 48 - xpWidth, 132);

    const barX = textX;
    const barY = 178;
    const barW = width - textX - 48;
    const barH = 28;
    roundedRect(ctx, barX, barY, barW, barH, 14);
    ctx.fillStyle = COLORS.barBg;
    ctx.fill();

    const ratio = requiredXp > 0 ? Math.max(0, Math.min(1, currentXp / requiredXp)) : 0;
    if (ratio > 0) {
        roundedRect(ctx, barX, barY, Math.max(18, barW * ratio), barH, 14);
        ctx.fillStyle = COLORS.barFill;
        ctx.fill();
    }

    return canvas.toBuffer('image/png');
}

async function buildCanvacordRankCard(opts) {
    const card = new RankCardBuilder()
        .setDisplayName(String(opts.username || 'Unknown').slice(0, 32))
        .setUsername(`@${String(opts.handle || opts.username || 'user').slice(0, 32)}`)
        .setAvatar(opts.avatarUrl)
        .setCurrentXP(Math.max(0, Number(opts.currentXp) || 0))
        .setRequiredXP(Math.max(1, Number(opts.requiredXp) || 1))
        .setLevel(Math.max(0, Number(opts.level) || 0))
        .setRank(Math.max(1, Number(opts.rank) || 1))
        .setBackground(COLORS.bg)
        .setOverlay(82);

    if (typeof card.setStatus === 'function' && opts.status) {
        try {
            card.setStatus(opts.status);
        } catch (_) {}
    }

    if (typeof card.setStyles === 'function') {
        try {
            card.setStyles({
                container: { backgroundColor: COLORS.bg },
                username: { color: COLORS.white },
                progressbar: { thumb: COLORS.barFill, track: COLORS.barBg }
            });
        } catch (_) {}
    }

    return card.build({ format: 'png' });
}

async function buildRankCardAttachment(opts) {
    let buffer = null;
    if (canvacordReady) {
        try {
            buffer = await buildCanvacordRankCard(opts);
        } catch (e) {
            console.error('[RANK CARD] canvacord failed, using canvas fallback:', e?.message || e);
        }
    }
    if (!buffer) {
        buffer = await buildCanvasRankCard(opts);
    }
    return new AttachmentBuilder(buffer, { name: 'rank.png' });
}

module.exports = {
    COLORS,
    buildRankCardAttachment
};

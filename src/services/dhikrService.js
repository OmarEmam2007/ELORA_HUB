const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const DhikrGlobal = require('../models/DhikrGlobal');
const DhikrProfile = require('../models/DhikrProfile');
const THEME = require('../utils/theme');

const UPDATE_DEBOUNCE_MS = 2500;
const pendingEdits = new Map();

function getDateKey(d = new Date()) {
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day = String(d.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function clamp(n, min, max) {
    return Math.max(min, Math.min(max, n));
}

function formatNumber(n) {
    try {
        return Intl.NumberFormat('en-US').format(Number(n) || 0);
    } catch (_) {
        return String(n || 0);
    }
}

function progressBar(value, goal, size = 18) {
    const g = Math.max(1, Number(goal) || 1);
    const v = clamp(Number(value) || 0, 0, g);
    const ratio = v / g;
    const filled = Math.round(ratio * size);
    const empty = Math.max(0, size - filled);
    return `\`${'█'.repeat(filled)}${'░'.repeat(empty)}\` ${Math.round(ratio * 100)}%`;
}

function buildGlobalEmbed(doc) {
    const total = doc?.total || 0;
    const goal = doc?.goal || 10000;
    const by = doc?.byType || {};

    const embed = new EmbedBuilder()
        .setColor(THEME.COLORS.PRIMARY)
        .setTitle('سِبَاقُ الْحَسَنَات')
        .setDescription(
            `**Goal Today:** \`${formatNumber(goal)}\`\n` +
            `**Total:** \`${formatNumber(total)}\`\n` +
            `${progressBar(total, goal)}`
        )
        .addFields(
            {
                name: 'Counters',
                value:
                    `Subhan Allah: \`${formatNumber(by.subhan || 0)}\`\n` +
                    `Alhamdulillah: \`${formatNumber(by.hamd || 0)}\`\n` +
                    `Allahu Akbar: \`${formatNumber(by.takbir || 0)}\``,
                inline: false
            }
        )
        .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL })
        .setTimestamp(new Date());

    return embed;
}

function buildGlobalButtons() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('dhikr_global:subhan')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('سبحان الله'),
        new ButtonBuilder()
            .setCustomId('dhikr_global:hamd')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('الحمد لله'),
        new ButtonBuilder()
            .setCustomId('dhikr_global:takbir')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('الله أكبر')
    );

    return [row];
}

async function getOrCreateGlobal({ guildId, channelId, goal }) {
    const dateKey = getDateKey(new Date());
    const update = {
        $setOnInsert: {
            guildId,
            dateKey,
            channelId,
            messageId: null,
            goal: Number(goal) > 0 ? Number(goal) : 10000,
            total: 0,
            byType: { subhan: 0, hamd: 0, takbir: 0 },
            updatedAt: new Date()
        }
    };

    const doc = await DhikrGlobal.findOneAndUpdate(
        { guildId, dateKey },
        update,
        { upsert: true, new: true }
    );

    if (Number(goal) > 0 && doc.goal !== Number(goal)) {
        doc.goal = Number(goal);
        await doc.save().catch(() => { });
    }

    if (doc.channelId !== channelId) {
        doc.channelId = channelId;
        await doc.save().catch(() => { });
    }

    return doc;
}

async function ensureGlobalMessage({ channel, goal }) {
    const guildId = channel.guild.id;
    const doc = await getOrCreateGlobal({ guildId, channelId: channel.id, goal });

    const embed = buildGlobalEmbed(doc);
    const components = buildGlobalButtons();

    if (doc.messageId) {
        const msg = await channel.messages.fetch(doc.messageId).catch(() => null);
        if (msg) {
            await msg.edit({ embeds: [embed], components }).catch(() => { });
            return { doc, message: msg };
        }
    }

    const sent = await channel.send({ embeds: [embed], components }).catch(() => null);
    if (sent) {
        doc.messageId = sent.id;
        await doc.save().catch(() => { });
    }

    return { doc, message: sent };
}

async function incGlobal({ guildId, channelId, type }) {
    const dateKey = getDateKey(new Date());
    const inc = { total: 1 };
    if (type === 'subhan') inc['byType.subhan'] = 1;
    if (type === 'hamd') inc['byType.hamd'] = 1;
    if (type === 'takbir') inc['byType.takbir'] = 1;

    return DhikrGlobal.findOneAndUpdate(
        { guildId, dateKey },
        {
            $setOnInsert: {
                guildId,
                dateKey,
                channelId,
                messageId: null,
                goal: 10000,
                byType: { subhan: 0, hamd: 0, takbir: 0 },
                total: 0
            },
            $inc: inc,
            $set: { updatedAt: new Date(), channelId }
        },
        { upsert: true, new: true }
    );
}

async function incUserPoints({ guildId, userId, points }) {
    const p = Math.max(0, Number(points) || 0);
    return DhikrProfile.findOneAndUpdate(
        { guildId, userId },
        {
            $setOnInsert: { guildId, userId },
            $inc: { pointsTotal: p, pointsWeekly: p, pressesTotal: p > 0 ? 1 : 0 },
            $set: { lastUpdatedAt: new Date() }
        },
        { upsert: true, new: true }
    );
}

async function scheduleGlobalMessageRefresh({ client, doc }) {
    if (!doc?.guildId || !doc?.messageId || !doc?.channelId) return;

    const key = `${doc.guildId}:${doc.channelId}:${doc.messageId}`;

    const existing = pendingEdits.get(key);
    if (existing?.t) {
        existing.lastAt = Date.now();
        return;
    }

    const state = { t: null, lastAt: Date.now() };
    state.t = setTimeout(async () => {
        pendingEdits.delete(key);
        const fresh = await DhikrGlobal.findOne({ guildId: doc.guildId, dateKey: doc.dateKey }).catch(() => null);
        if (!fresh) return;

        const ch = await client.channels.fetch(fresh.channelId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) return;

        const msg = await ch.messages.fetch(fresh.messageId).catch(() => null);
        if (!msg) return;

        const embed = buildGlobalEmbed(fresh);
        const components = buildGlobalButtons();
        await msg.edit({ embeds: [embed], components }).catch(() => { });
    }, UPDATE_DEBOUNCE_MS);

    pendingEdits.set(key, state);
}

module.exports = {
    getDateKey,
    ensureGlobalMessage,
    incGlobal,
    incUserPoints,
    scheduleGlobalMessageRefresh,
    buildGlobalEmbed,
    buildGlobalButtons
};

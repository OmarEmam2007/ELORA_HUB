const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const TranslateUser = require('../../models/TranslateUser');
const THEME = require('../../utils/theme');
const { TOP_LANGUAGES, clampText, translateText } = require('../../services/translationService');

const ID_PREFIX = 'tra:';

function buildBaseEmbed({ title, description }) {
    const embed = new EmbedBuilder()
        .setColor('#000000')
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined })
        .setTimestamp();
    return embed;
}

function buildTranslationEmbed({ original, translated, from, to, user }) {
    return new EmbedBuilder()
        .setColor('#000000')
        .setTitle('▪ Translation')
        .addFields(
            { name: `▪ Original [${String(from || 'AUTO').toUpperCase()}]`, value: clampText(original || '—', 1024) || '—' },
            { name: `▪ Translated [${String(to || '—').toUpperCase()}]`, value: clampText(translated || '—', 1024) || '—' }
        )
        .setFooter({ text: `🔲 Translated for ${user?.tag || user?.username || 'User'}` })
        .setTimestamp();
}

function buildSelectComponents({ requesterId, channelId, repliedMessageId, disabledSave = true, savedLang = null }) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(`${ID_PREFIX}select:${requesterId}:${channelId}:${repliedMessageId}`)
        .setPlaceholder('Select a language')
        .addOptions(
            TOP_LANGUAGES.map((l) => ({
                label: l.label,
                value: l.value,
                default: savedLang ? l.value === savedLang : false
            }))
        );

    const row1 = new ActionRowBuilder().addComponents(select);

    const saveBtn = new ButtonBuilder()
        .setCustomId(`${ID_PREFIX}save_pending:${requesterId}`)
        .setStyle(ButtonStyle.Secondary)
        .setLabel('◽ Save as my favorite')
        .setDisabled(Boolean(disabledSave));

    const row2 = new ActionRowBuilder().addComponents(saveBtn);

    return [row1, row2];
}

async function safeGetFavorite(userId) {
    if (!mongoose.connection?.readyState) return null;
    const doc = await TranslateUser.findOne({ userId }).catch(() => null);
    return doc?.favoriteLang || null;
}

async function safeSetFavorite(userId, lang) {
    if (!mongoose.connection?.readyState) return { ok: false, error: 'DB_OFFLINE' };
    const update = lang ? { favoriteLang: lang } : { favoriteLang: null };
    await TranslateUser.findOneAndUpdate(
        { userId },
        { $set: update, $setOnInsert: { userId } },
        { upsert: true, new: true }
    ).catch(() => null);
    return { ok: true };
}

async function fetchRepliedMessage(message) {
    const refId = message?.reference?.messageId;
    if (!refId) return null;
    const channel = message.channel;
    if (!channel?.messages?.fetch) return null;
    return await channel.messages.fetch(refId).catch(() => null);
}

async function translateFromMessage({ message, user, targetLang }) {
    const replied = await fetchRepliedMessage(message);
    if (!replied) {
        return { ok: false, error: 'MISSING_REFERENCE' };
    }

    const rawText = String(replied.content || '').trim();
    if (!rawText) {
        return { ok: false, error: 'NO_TEXT' };
    }

    const res = await translateText(rawText, { to: targetLang, from: 'auto' });
    if (!res.ok) {
        return { ok: false, error: res.error };
    }

    return {
        ok: true,
        repliedMessage: replied,
        original: rawText,
        translated: res.text,
        detected: res.detected,
        to: targetLang,
        user
    };
}

async function execute(message, client, args) {
    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'reset') {
        const r = await safeSetFavorite(message.author.id, null);
        const embed = buildBaseEmbed({
            title: '▫ Translation',
            description: r.ok ? '✖ Favorite language cleared.' : '✖ Favorite not cleared (database offline).'
        });
        await message.reply({ embeds: [embed] }).catch(() => null);
        return;
    }

    const replied = await fetchRepliedMessage(message);
    if (!replied) {
        const embed = buildBaseEmbed({
            title: '▫ Translation',
            description: '▫ Reply to a text message, then type `.tra`.'
        });
        await message.reply({ embeds: [embed] }).catch(() => null);
        return;
    }

    const originalText = String(replied.content || '').trim();
    if (!originalText) {
        const embed = buildBaseEmbed({
            title: '▫ Translation',
            description: '▫ The replied message has no text content.'
        });
        await message.reply({ embeds: [embed] }).catch(() => null);
        return;
    }

    const fav = await safeGetFavorite(message.author.id);

    if (fav) {
        const result = await translateFromMessage({ message, user: message.author, targetLang: fav });
        if (!result.ok) {
            const embed = buildBaseEmbed({
                title: '▫ Translation',
                description: `✖ Failed: \`${result.error}\``
            });
            await message.reply({ embeds: [embed] }).catch(() => null);
            return;
        }

        const translationEmbed = buildTranslationEmbed({
            original: result.original,
            translated: result.translated,
            from: result.detected,
            to: fav,
            user: message.author
        });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(`${ID_PREFIX}clear:${message.author.id}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('✖ Clear Favorite'),
            new ButtonBuilder()
                .setCustomId(`${ID_PREFIX}thread:${message.author.id}:${String(result.detected || 'auto')}:${String(fav)}`)
                .setStyle(ButtonStyle.Secondary)
                .setLabel('🌐 Open Bilingual Thread')
        );

        await message.reply({
            embeds: [translationEmbed],
            components: [row],
            allowedMentions: { repliedUser: false }
        }).catch(() => null);

        return;
    }

    const menuEmbed = buildBaseEmbed({
        title: '▫ Translation',
        description: '▪ Select a target language.'
    });

    const components = buildSelectComponents({
        requesterId: message.author.id,
        channelId: message.channel.id,
        repliedMessageId: replied.id
    });

    const sent = await message.reply({
        embeds: [menuEmbed],
        components,
        allowedMentions: { repliedUser: false }
    }).catch(() => null);

    if (sent) {
        setTimeout(() => {
            sent.delete().catch(() => null);
        }, 60_000);
    }
}

module.exports = {
    name: 'tra',
    aliases: ['translate'],
    execute,
    ID_PREFIX,
    buildTranslationEmbed,
    buildSelectComponents,
    translateFromMessage,
    safeSetFavorite
};

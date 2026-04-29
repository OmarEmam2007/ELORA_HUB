const { PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const DhikrProfile = require('../../models/DhikrProfile');
const dhikrService = require('../../services/dhikrService');
const THEME = require('../../utils/theme');

const PAGES = {
    morning: [
        'أَصْـبَحْنا وَأَصْـبَحَ المُـلْكُ للهِ، وَالحَمدُ للهِ...'
    ],
    evening: [
        'أَمْسَيْـنا وَأَمْسـى المُـلْكُ للهِ، وَالحَمدُ للهِ...'
    ]
};

function toSmallCaps(input) {
    const map = {
        a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
        n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
    };
    return String(input || '').split('').map((ch) => map[ch.toLowerCase()] || ch).join('');
}

function buildSessionEmbed({ mode, pageIndex, totalPages, text, pointsWeekly }) {
    return new EmbedBuilder()
        .setColor(THEME.COLORS.SECONDARY)
        .setTitle(`✦ ${mode === 'morning' ? 'أذكار الصباح' : 'أذكار المساء'}`)
        .setDescription(`${text}\n\n**${toSmallCaps('progress')}**: \`${pageIndex + 1}/${totalPages}\`\n**${toSmallCaps('weekly points')}**: \`${pointsWeekly}\``)
        .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL });
}

module.exports = {
    name: 'اذكار',
    aliases: ['azkar', 'adhkar'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const guildId = message.guild.id;

        const modeRaw = String(args?.[0] || '').toLowerCase();
        const mode = modeRaw.includes('m') || modeRaw.includes('ص') ? 'morning' : modeRaw.includes('e') || modeRaw.includes('م') ? 'evening' : null;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`dhikr_dm:start:morning:0:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('أذكار الصباح'),
            new ButtonBuilder().setCustomId(`dhikr_dm:start:evening:0:${guildId}`).setStyle(ButtonStyle.Secondary).setLabel('أذكار المساء')
        );

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.PRIMARY)
            .setTitle('✦ أذكار (وضع شخصي)')
            .setDescription('اضغط لاختيار أذكار الصباح أو المساء. سيتم المتابعة في الخاص (DM).')
            .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL });

        if (mode) {
            try {
                await message.author.send({ embeds: [embed], components: [row] });
                await message.reply('✅ تم إرسال لوحة الأذكار في الخاص.').catch(() => { });
            } catch (_) {
                await message.reply('❌ لا أستطيع إرسال رسالة خاصة لك. افتح الـ DM ثم حاول مرة أخرى.').catch(() => { });
            }
            if (message.deletable) await message.delete().catch(() => { });
            return;
        }

        try {
            await message.author.send({ embeds: [embed], components: [row] });
            await message.reply('✅ تم إرسال لوحة الأذكار في الخاص.').catch(() => { });
        } catch (_) {
            await message.reply('❌ لا أستطيع إرسال رسالة خاصة لك. افتح الـ DM ثم حاول مرة أخرى.').catch(() => { });
        }

        if (message.deletable) await message.delete().catch(() => { });
    },

    buildSessionEmbed,
    PAGES,
    toSmallCaps
};

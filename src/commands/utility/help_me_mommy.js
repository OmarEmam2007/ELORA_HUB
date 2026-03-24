const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

function uniqueByRef(map) {
    const out = [];
    const seen = new Set();
    for (const [, v] of map || []) {
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(v);
    }
    return out;
}

function chunkLines(lines, maxLen = 1000) {
    const chunks = [];
    let buf = '';
    for (const line of lines) {
        const next = buf.length ? `${buf}\n${line}` : line;
        if (next.length > maxLen) {
            if (buf.length) chunks.push(buf);
            buf = line;
        } else {
            buf = next;
        }
    }
    if (buf.length) chunks.push(buf);
    return chunks;
}

function buildUltimateBookEmbed(client) {
    const slashNames = Array.from(client?.commands?.keys?.() || []).map(String);
    slashNames.sort((a, b) => a.localeCompare(b));

    const prefixCmds = uniqueByRef(client?.prefixCommands);
    const prefixNames = prefixCmds
        .map((cmd) => String(cmd?.name || cmd?.data?.name || '').trim())
        .filter(Boolean);

    prefixNames.sort((a, b) => a.localeCompare(b));

    const slashLines = slashNames.map((n) => `▫️ /${n}`);
    const dotLines = prefixNames.map((n) => `▫️ .${n}`);
    const eloraLines = prefixNames.map((n) => `▫️ elora ${n}`);

    const embed = new EmbedBuilder()
        .setColor(THEME?.COLORS?.ACCENT || 0x2b2d31)
        .setTitle('▤ ELORA\'s Ultimate Book')
        .setDescription('✦ A quiet grimoire of every spell you can cast.')
        .setTimestamp();

    const botAvatar = client?.user?.displayAvatarURL?.({ extension: 'png', size: 128 })
        || client?.user?.displayAvatarURL?.()
        || undefined;

    embed.setFooter({
        text: "ELORA's Ultimate Guide",
        iconURL: botAvatar
    });

    const slashChunks = chunkLines(slashLines, 1024);
    const dotChunks = chunkLines(dotLines, 1024);
    const eloraChunks = chunkLines(eloraLines, 1024);

    embed.addFields({
        name: '▫️ Slash Commands',
        value: slashChunks[0] || '▫️ *None*',
        inline: false
    });

    for (let i = 1; i < slashChunks.length; i++) {
        embed.addFields({ name: '▫️ Slash Commands (cont.)', value: slashChunks[i], inline: false });
    }

    embed.addFields({
        name: '▫️ Dot Commands',
        value: dotChunks[0] || '▫️ *None*',
        inline: false
    });

    for (let i = 1; i < dotChunks.length; i++) {
        embed.addFields({ name: '▫️ Dot Commands (cont.)', value: dotChunks[i], inline: false });
    }

    embed.addFields({
        name: '▫️ ELORA Commands',
        value: eloraChunks[0] || '▫️ *None*',
        inline: false
    });

    for (let i = 1; i < eloraChunks.length; i++) {
        embed.addFields({ name: '▫️ ELORA Commands (cont.)', value: eloraChunks[i], inline: false });
    }

    return embed;
}

async function executePrefix(message, client) {
    const embed = buildUltimateBookEmbed(client);
    return message.reply({ embeds: [embed] }).catch(() => null);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help_me_mommy')
        .setDescription('Open ELORA\'s Ultimate Book (full command guide).'),

    async execute(interaction, client) {
        const embed = buildUltimateBookEmbed(client);
        return interaction.reply({ embeds: [embed], ephemeral: false }).catch(() => null);
    },

    // Prefix hook
    name: 'help_me_mommy',
    aliases: [],
    executePrefix,

    buildUltimateBookEmbed
};

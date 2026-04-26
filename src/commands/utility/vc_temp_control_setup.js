const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const THEME = require('../../utils/theme');

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

const scLabel = (input) => `${toSmallCaps(input)}`;

 const buildButtonRows = (buttons, perRow = 5) => {
     const rows = [];
     const safePerRow = Math.max(1, Math.min(5, Number(perRow) || 5));

     for (let i = 0; i < buttons.length; i += safePerRow) {
         const slice = buttons.slice(i, i + safePerRow);
         while (slice.length < safePerRow) {
             slice.push(
                 new ButtonBuilder()
                     .setCustomId(`tvcp_spacer_setup_${rows.length}_${slice.length}`)
                     .setStyle(ButtonStyle.Secondary)
                     .setLabel('\u200b')
                     .setDisabled(true)
             );
         }
         rows.push(new ActionRowBuilder().addComponents(slice));
     }

     return rows;
 };

module.exports = {
    data: new SlashCommandBuilder()
        .setName('vc_temp_control_setup')
        .setDescription('Deploy the TempVoice control panel to a channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the control panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel', true);

        const bannerName = 'new banner1.png';
        const bannerCandidates = [
            path.join(__dirname, '../../assets', bannerName),
            path.join(__dirname, '../../../assets', bannerName),
            path.join(process.cwd(), 'assets', bannerName),
            path.join(process.cwd(), 'src', 'assets', bannerName),
            path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
        ];
        const bannerPath = bannerCandidates.find(p => {
            try { return fs.existsSync(p); } catch (_) { return false; }
        }) || bannerCandidates[0];
        const banner = new AttachmentBuilder(bannerPath, { name: bannerName });

        const embed = new EmbedBuilder()
            .setColor(client?.config?.colors?.primary || THEME?.COLORS?.PRIMARY || '#111827')
            .setDescription('**Temp Voice Control**')
            .setImage(`attachment://${bannerName}`);

        const buttons = [
            new ButtonBuilder().setCustomId('tvcp_lock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('LOCK'),
            new ButtonBuilder().setCustomId('tvcp_unlock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('OPEN'),
            new ButtonBuilder().setCustomId('tvcp_hide').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('HIDE'),
            new ButtonBuilder().setCustomId('tvcp_show').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('SHOW'),
            new ButtonBuilder().setCustomId('tvcp_bitrate').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('RATE'),

            new ButtonBuilder().setCustomId('tvcp_open_transfer_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('XFER'),
            new ButtonBuilder().setCustomId('tvcp_limit').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('LIMT'),
            new ButtonBuilder().setCustomId('tvcp_rename').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('NAME'),
            new ButtonBuilder().setCustomId('tvcp_move_me').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('JOIN'),
            new ButtonBuilder().setCustomId('tvcp_open_move_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('MOVE'),

            new ButtonBuilder().setCustomId('tvcp_open_mute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('MUTE'),
            new ButtonBuilder().setCustomId('tvcp_open_unmute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('UNMT'),
            new ButtonBuilder().setCustomId('tvcp_open_deafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('DEAF'),
            new ButtonBuilder().setCustomId('tvcp_open_undeafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('UNDF'),
            new ButtonBuilder().setCustomId('tvcp_open_kick_menu').setStyle(ButtonStyle.Danger).setEmoji('▫️').setLabel('KICK')
        ];

        const rows = buildButtonRows(buttons, 5);

        await channel.send({ files: [banner] });
        await channel.send({ files: [banner], embeds: [embed], components: rows });
        await interaction.reply({ content: `✅ TempVoice control panel deployed in ${channel}`, ephemeral: true });
    }
};

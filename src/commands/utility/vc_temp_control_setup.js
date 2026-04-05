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

        const bannerName = 'panel.png';
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

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_lock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Lock'),
            new ButtonBuilder().setCustomId('tvcp_unlock').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unlock'),
            new ButtonBuilder().setCustomId('tvcp_hide').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Hide'),
            new ButtonBuilder().setCustomId('tvcp_show').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unhide'),
            new ButtonBuilder().setCustomId('tvcp_bitrate').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Bitrate')
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_open_transfer_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Transfer Owner'),
            new ButtonBuilder().setCustomId('tvcp_limit').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('User Limit'),
            new ButtonBuilder().setCustomId('tvcp_rename').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Rename'),
            new ButtonBuilder().setCustomId('tvcp_move_me').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Move Me'),
            new ButtonBuilder().setCustomId('tvcp_open_move_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Move Member')
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_open_mute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Mute Member'),
            new ButtonBuilder().setCustomId('tvcp_open_unmute_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Unmute Member'),
            new ButtonBuilder().setCustomId('tvcp_open_deafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Deafen Member'),
            new ButtonBuilder().setCustomId('tvcp_open_undeafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('▫️').setLabel('Undeafen Member'),
            new ButtonBuilder().setCustomId('tvcp_open_kick_menu').setStyle(ButtonStyle.Danger).setEmoji('▫️').setLabel('Kick Member')
        );

        await channel.send({ files: [banner] });
        await channel.send({ files: [banner], embeds: [embed], components: [row1, row2, row3] });
        await interaction.reply({ content: `✅ TempVoice control panel deployed in ${channel}`, ephemeral: true });
    }
};

const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
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

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/downlfffffoad.png'));

        const title = `**${toSmallCaps('TEMPVOICE CONTROL PANEL')}**`;

        const embed = new EmbedBuilder()
            .setColor(client?.config?.colors?.primary || THEME?.COLORS?.PRIMARY || '#111827')
            .setTitle(title)
            .setDescription(
                [
                    `Use the buttons below to control **your** temporary voice channel.`,
                    `Only the channel owner can use these controls.`,
                ].join('\n')
            )
            .setImage('attachment://downlfffffoad.png');

        const row1 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_lock').setStyle(ButtonStyle.Secondary).setEmoji('🔒').setLabel(scLabel('Lock')),
            new ButtonBuilder().setCustomId('tvcp_unlock').setStyle(ButtonStyle.Secondary).setEmoji('🔓').setLabel(scLabel('Unlock')),
            new ButtonBuilder().setCustomId('tvcp_hide').setStyle(ButtonStyle.Secondary).setEmoji('🫥').setLabel(scLabel('Hide')),
            new ButtonBuilder().setCustomId('tvcp_show').setStyle(ButtonStyle.Secondary).setEmoji('👁️').setLabel(scLabel('Show')),
            new ButtonBuilder().setCustomId('tvcp_bitrate').setStyle(ButtonStyle.Secondary).setEmoji('🎚️').setLabel(scLabel('Bitrate'))
        );

        const row2 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_transfer_owner').setStyle(ButtonStyle.Secondary).setEmoji('👑').setLabel(scLabel('Owner')),
            new ButtonBuilder().setCustomId('tvcp_limit').setStyle(ButtonStyle.Secondary).setEmoji('👥').setLabel(scLabel('Limit')),
            new ButtonBuilder().setCustomId('tvcp_rename').setStyle(ButtonStyle.Secondary).setEmoji('✏️').setLabel(scLabel('Rename')),
            new ButtonBuilder().setCustomId('tvcp_move_me').setStyle(ButtonStyle.Secondary).setEmoji('📌').setLabel(scLabel('Join')),
            new ButtonBuilder().setCustomId('tvcp_open_move_menu').setStyle(ButtonStyle.Secondary).setEmoji('🧲').setLabel(scLabel('Move'))
        );

        const row3 = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('tvcp_open_mute_menu').setStyle(ButtonStyle.Secondary).setEmoji('🔇').setLabel(scLabel('Mute')),
            new ButtonBuilder().setCustomId('tvcp_open_deafen_menu').setStyle(ButtonStyle.Secondary).setEmoji('🎧').setLabel(scLabel('Deafen')),
            new ButtonBuilder().setCustomId('tvcp_open_kick_menu').setStyle(ButtonStyle.Danger).setEmoji('🗑️').setLabel(scLabel('Kick'))
        );

        await channel.send({ files: [banner], embeds: [embed], components: [row1, row2, row3] });
        await interaction.reply({ content: `✅ TempVoice control panel deployed in ${channel}`, ephemeral: true });
    }
};

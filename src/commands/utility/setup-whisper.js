const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-whisper')
        .setDescription('Deploy the Whisper panel to a channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the whisper panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel', true);

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/1111.png'));

        const embed = new EmbedBuilder()
            .setColor(client?.config?.colors?.primary || THEME?.COLORS?.PRIMARY || '#111827')
            .setDescription('**Choose the type of message below.**')
            .setImage('attachment://1111.png');

        const select = new StringSelectMenuBuilder()
            .setCustomId('whisper_type_select')
            .setPlaceholder('Choose the type of message')
            .addOptions(
                {
                    label: 'Private Whisper',
                    value: 'private',
                    description: 'Only the mentioned user can read it.'
                },
                {
                    label: 'Public Whisper',
                    value: 'public',
                    description: 'Send to the public whisper channel.'
                }
            );

        const row = new ActionRowBuilder().addComponents(select);

        await channel.send({ files: [banner], embeds: [embed], components: [row] });
        await interaction.reply({ content: `**✅ Whisper panel deployed in ${channel}.**`, ephemeral: true });
    }
};

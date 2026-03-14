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

        await interaction.deferReply({ ephemeral: true });

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/555.png'), { name: 'whisper.png' });

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

        await channel.send({ files: [banner], components: [row] });

        try {
            await interaction.deleteReply();
        } catch (_) {
            // ignore
        }
    }
};

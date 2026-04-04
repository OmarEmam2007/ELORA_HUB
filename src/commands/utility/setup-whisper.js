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

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/1234.png'), { name: '1234.png' });

        const select = new StringSelectMenuBuilder()
            .setCustomId('whisper_type_select')
            .setPlaceholder('✦ Choose the type of message')
            .addOptions(
                {
                    label: 'Private Message',
                    value: 'private',
                    description: 'Send a secret message to someone in DM',
                    emoji: { id: '1487391271759646750' }
                },
                {
                    label: 'Public Message',
                    value: 'public',
                    description: 'Send a secret message to someone in main chat',
                    emoji: { id: '1487391271759646750' }
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

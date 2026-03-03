const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const THEME = require('../../utils/theme');
const ConfessionsConfig = require('../../models/ConfessionsConfig');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-confessions')
        .setDescription('Sends the confessions info panel to the channel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('The channel where anonymous confessions will be posted')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option
                .setName('log_channel')
                .setDescription('Optional private logs channel for staff (stores author + message)')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(false)
        ),
    
    async execute(interaction, client) {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.options.getChannel('channel');
        const logChannel = interaction.options.getChannel('log_channel');

        try {
            await ConfessionsConfig.findOneAndUpdate(
                { guildId: interaction.guild.id },
                {
                    confessionsChannelId: channel?.id,
                    confessionLogsChannelId: logChannel?.id || null
                },
                { upsert: true, new: true }
            );
        } catch (e) {
            console.error('ConfessionsConfig save error:', e);
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setDescription(`💭 **confessions are anonymous**\n\nuse /confess to share your thoughts\nno one will know it's you\n\n*stay safe, be kind*`)
            .setTimestamp();

        // Send to channel
        await interaction.channel.send({ embeds: [embed] });
        await interaction.editReply({ content: '✅ Confessions panel deployed.' });
    },
};

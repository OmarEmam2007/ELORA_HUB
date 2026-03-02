const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ChannelType } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-confessions')
        .setDescription('Configure the confessions system for this server.')
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

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');
        const logChannel = interaction.options.getChannel('log_channel');

        process.env.CONFESSIONS_CHANNEL_ID = channel?.id;
        process.env.CONFESSIONS_LOG_CHANNEL_ID = logChannel?.id || '';

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.SUCCESS)
            .setTitle('✅ Confessions Configured')
            .setDescription(
                `**Confessions Channel:** ${channel ? `<#${channel.id}>` : '**Not set**'}\n` +
                `**Log Channel:** ${logChannel ? `<#${logChannel.id}>` : '**Disabled**'}\n\n` +
                `Users can now use \/confess to submit anonymous confessions.`
            )
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};

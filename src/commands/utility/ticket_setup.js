const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket_setup')
        .setDescription('Creates a ticket panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the ticket panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),
    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel', true);

        const embed = new EmbedBuilder()
            .setTitle('📩 SUPPORT')
            .setDescription('**How can we help you?**\n\nCreate a ticket below to contact our staff team privately.')
            .setColor(client?.config?.colors?.primary || 0x2b2d31)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('create_ticket')
                .setLabel('Create Ticket')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('📩')
        );

        await channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: `✅ Ticket panel sent to ${channel}`, ephemeral: true });
    }
};

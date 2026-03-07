const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
const path = require('path');

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
            .setColor(client?.config?.colors?.primary || 0x2b2d31)
            .setImage('attachment://2.png');

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/2.png'));

        const toSmallCaps = (s) => String(s || '').replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
        const placeholder = toSmallCaps('HOW CAN I HELP YOU?');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_select')
            .setPlaceholder(placeholder)
            .addOptions(
                { label: toSmallCaps('A PROBLEM IN THE SERVER'), value: 'server_problem' },
                { label: toSmallCaps('PARTNERSHIPS'), value: 'partnerships' },
                { label: toSmallCaps('SOCIAL PROBLEM'), value: 'social_problem' },
                { label: toSmallCaps('OTHER'), value: 'other' }
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await channel.send({ embeds: [embed], components: [row], files: [banner] });
        await interaction.reply({ content: `✅ Ticket panel sent to ${channel}`, ephemeral: true });
    }
};

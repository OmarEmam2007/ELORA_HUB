const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('replypanel')
        .setDescription('Owner: open the custom replies panel (textbox modal).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {
        const OWNER_ROLE_ID = '1461766723274412126';
        const hasOwnerRole = interaction.member?.roles?.cache?.has(OWNER_ROLE_ID);
        const isOwnerId = client?.config?.ownerId && interaction.user.id === client.config.ownerId;
        if (!hasOwnerRole && !isOwnerId) {
            return interaction.reply({
                embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ Owner only.')],
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setTitle('🧠 Custom Replies Dashboard')
            .setDescription('Use the buttons below to add / manage custom auto-replies.')
            .setFooter(THEME.FOOTER);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cr_add').setLabel('Add Reply').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('cr_list').setLabel('List Replies').setStyle(ButtonStyle.Primary)
        );

        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
    }
};

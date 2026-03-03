const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-revive')
        .setDescription('Deploy the Revive Ping panel for members to opt-in/out.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction, client) {
        const embed = new EmbedBuilder()
            .setTitle('🌑 Revive Pings Panel')
            .setDescription(
                [
                    '**عايز يجيلك إشعار لما السيرفر يكون نايم وهنحييه؟**',
                    '',
                    'بالضغط على الزرار تحت تقدر:',
                    '🔔 **تفعيل** أو 🔕 **إلغاء** دور تنبيهات الـ Revive.',
                    '',
                    'لو معاك الدور → هيوصلك منشن لما الإدارة تستخدم أمر الـ revive.',
                ].join('\n')
            )
            .setColor(THEME.COLORS.PRIMARY)
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('revive_toggle')
                .setLabel('Toggle Revive Pings')
                .setEmoji('🔔')
                .setStyle(ButtonStyle.Secondary)
        );

        await interaction.channel.send({ embeds: [embed], components: [row] });
        await interaction.reply({ content: '✅ Revive panel deployed in this channel.', ephemeral: true });
    },
};

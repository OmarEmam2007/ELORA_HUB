const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const THEME = require('../../utils/theme');

const APPLY_CHANNEL_ID = '1499425743225098440';

function isAdminOrOwner(message) {
    const member = message.member;
    if (!member) return false;
    if (message.guild?.ownerId && message.author?.id === message.guild.ownerId) return true;
    return Boolean(member.permissions?.has?.('Administrator') || member.permissions?.has?.(8n));
}

module.exports = {
    name: 'staff_apply_setup',
    aliases: ['apply_setup', 'staffapps_setup', 'staffapp_setup'],

    async execute(message) {
        if (!message?.guild) return;
        if (!isAdminOrOwner(message)) return;

        const ch = await message.guild.channels.fetch(APPLY_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased?.()) {
            return message.reply('❌ Apply channel not found or not text-based.').catch(() => null);
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.PRIMARY || '#000000')
            .setTitle('✦ STAFF APPLICATIONS')
            .setDescription(
                [
                    '**Read before applying:**',
                    '- Answer seriously and fully.',
                    '- One active application at a time.',
                    '- Cooldown: `3 days` between applications.',
                    '- Incomplete / troll applications will be rejected.',
                    '',
                    '**Start below.**'
                ].join('\n')
            )
            .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('staffapp:open')
                .setStyle(ButtonStyle.Secondary)
                .setLabel('Apply Now')
        );

        await ch.send({ embeds: [embed], components: [row] }).catch(() => null);
        return message.reply(`✅ Panel sent in <#${APPLY_CHANNEL_ID}>`).catch(() => null);
    }
};

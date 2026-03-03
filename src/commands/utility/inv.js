const { EmbedBuilder } = require('discord.js');
const InviteStats = require('../../models/InviteStats');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'inv',
    aliases: ['invlb', 'invites'],
    async execute(message, client, args) {
        const sub = (args[0] || '').toLowerCase();

        if (sub !== 'lb' && sub !== 'leaderboard' && sub !== 'top') {
            const guide = new EmbedBuilder()
                .setColor(THEME.COLORS.INFO)
                .setDescription(`**Usage:**\n\`elora invite [@user]\`\n\`elora inv lb\``)
                .setFooter(THEME.FOOTER);
            await message.reply({ embeds: [guide] });
            return;
        }

        const top = await InviteStats.find({ guildId: message.guild.id })
            .sort({ inviteCount: -1, regularInvites: -1 })
            .limit(10)
            .catch(() => []);

        if (!top.length) {
            const err = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setDescription('❌ No invite data found yet.')
                .setFooter(THEME.FOOTER);
            await message.reply({ embeds: [err] });
            return;
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let desc = '';

        for (let i = 0; i < top.length; i++) {
            const row = top[i];
            const user = await client.users.fetch(row.userId).catch(() => null);
            const tag = user ? user.username : row.userId;
            desc += `${medals[i] || `${i + 1}.`} **${tag}** — **${row.inviteCount || 0}** invites\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setTitle('🎫 Invite Leaderboard (Top 10)')
            .setDescription(desc)
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};

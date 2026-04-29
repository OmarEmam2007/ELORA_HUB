const { EmbedBuilder } = require('discord.js');
const DhikrProfile = require('../../models/DhikrProfile');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'اذكار_top',
    aliases: ['azkar_top', 'adhkar_top', 'dhikr_top'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const top = await DhikrProfile.find({ guildId: message.guild.id })
            .sort({ pointsWeekly: -1, pointsTotal: -1 })
            .limit(10)
            .catch(() => []);

        if (!top.length) {
            const e = new EmbedBuilder()
                .setColor(THEME.COLORS.SECONDARY)
                .setDescription('لا يوجد بيانات أذكار بعد.')
                .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL });
            await message.reply({ embeds: [e] }).catch(() => { });
            return;
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];
        let desc = '';

        for (let i = 0; i < top.length; i++) {
            const row = top[i];
            const u = await client.users.fetch(row.userId).catch(() => null);
            const name = u ? u.username : row.userId;
            desc += `${medals[i] || `${i + 1}.`} **${name}** — \`${row.pointsWeekly || 0}\` pts\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.PRIMARY)
            .setTitle('لوحة شرف الذاكرين (هذا الأسبوع)')
            .setDescription(desc)
            .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL })
            .setTimestamp();

        await message.reply({ embeds: [embed] }).catch(() => { });
    }
};

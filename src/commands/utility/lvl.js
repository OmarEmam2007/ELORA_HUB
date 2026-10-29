const { EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'lvl',
    aliases: ['levels', 'level', 'ranks', 'leaderboard'],
    async execute(message, client, args) {
        const top = await User.find({ guildId: message.guild.id })
            .sort({ level: -1, xp: -1, voiceLevel: -1, voiceXp: -1 })
            .limit(10)
            .catch(() => []);

        if (!top.length) {
            const err = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setDescription('❌ No level data found yet.')
                .setFooter(THEME.FOOTER);
            return message.reply({ embeds: [err] });
        }

        const medals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

        let desc = '';
        for (let i = 0; i < top.length; i++) {
            const row = top[i];
            const user = await client.users.fetch(row.userId).catch(() => null);
            const name = user ? user.username : row.userId;

            const chatLevel = row.level || 1;
            const chatXp = row.xp || 0;
            const voiceLevel = row.voiceLevel || 1;
            const voiceXp = row.voiceXp || 0;

            const medal = medals[i] || `${i + 1}.`;
            desc += `${medal} **${name}**\n` +
                `Chat: **Lvl ${chatLevel}** (${chatXp} XP) | Voice: **Lvl ${voiceLevel}** (${voiceXp} XP)\n\n`;
        }

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setTitle('📈 Levels Leaderboard (Chat + Voice)')
            .setDescription(desc)
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};

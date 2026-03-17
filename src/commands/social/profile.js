const { EmbedBuilder } = require('discord.js');

const THEME = require('../../utils/theme');
const User = require('../../models/User');

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

function formatDuration(ms) {
    if (!Number.isFinite(ms) || ms <= 0) return '0m';

    const totalMinutes = Math.floor(ms / 60000);
    const days = Math.floor(totalMinutes / (60 * 24));
    const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
    const minutes = totalMinutes % 60;

    const parts = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (!days && !hours) parts.push(`${minutes}m`);
    else if (minutes) parts.push(`${minutes}m`);

    return parts.join(' ');
}

module.exports = {
    name: 'profile',
    aliases: ['social', 'card'],

    async execute(message, client, args) {
        const guildId = message.guild.id;
        const targetId = parseUserId(args[0]) || message.author.id;

        let targetUser;
        try {
            targetUser = await client.users.fetch(targetId);
        } catch (_) {
            targetUser = message.author;
        }

        const doc = await User.findOne({ userId: targetUser.id, guildId }).exec();
        if (!doc) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📜 Social Profile')
                .setDescription(`<@${targetUser.id}> is not registered yet.\n\nUse any social command (like \`.marrying\`) to initialize your profile.`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const isMarried = Boolean(doc.partnerId);
        const status = isMarried ? `Married to <@${doc.partnerId}> 💍` : 'Single 💔';

        const statsLine = `Married **${doc.marriageCount || 0}** time(s) • Divorced **${doc.divorceCount || 0}** time(s)`;

        const denom = (doc.marriageCount || 0) + (doc.divorceCount || 0);
        const reliability = denom > 0 ? Math.round(((doc.marriageCount || 0) / denom) * 100) : null;

        const duration = isMarried && doc.marryDate
            ? formatDuration(Date.now() - new Date(doc.marryDate).getTime())
            : null;

        const embed = new EmbedBuilder()
            .setColor(isMarried ? '#FF69B4' : '#5865F2')
            .setAuthor({ name: `${targetUser.username}'s Profile`, iconURL: targetUser.displayAvatarURL({ dynamic: true }) })
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '💖 Marital Status', value: status, inline: false },
                {
                    name: '⏳ Relationship Age',
                    value: isMarried ? `Married for **${duration || 'Unknown'}**` : 'N/A',
                    inline: false,
                },
                { name: '📜 Relationship Statistics', value: statsLine, inline: false },
                {
                    name: '🧠 Reliability Factor',
                    value: reliability === null ? 'N/A' : `**${reliability}%**`,
                    inline: false,
                }
            )
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        return message.reply({ embeds: [embed] });
    },
};

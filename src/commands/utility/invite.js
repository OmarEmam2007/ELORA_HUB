const { EmbedBuilder } = require('discord.js');
const InviteStats = require('../../models/InviteStats');
const THEME = require('../../utils/theme');

module.exports = {
    name: 'invite',
    aliases: [],
    async execute(message, client, args) {
        const target = message.mentions.users.first() || message.author;

        const stats = await InviteStats.findOne({ guildId: message.guild.id, userId: target.id }).catch(() => null);

        const total = stats?.inviteCount || 0;
        const regular = stats?.regularInvites || 0;
        const fake = stats?.fakeInvites || 0;
        const leaves = stats?.leaves || 0;

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setAuthor({ name: `🎫 Invite Stats`, iconURL: target.displayAvatarURL({ dynamic: true }) })
            .setDescription(`**User:** ${target}`)
            .addFields(
                { name: 'Total Invites', value: `${total}`, inline: true },
                { name: 'Regular', value: `${regular}`, inline: true },
                { name: 'Fake (<24h)', value: `${fake}`, inline: true },
                { name: 'Leaves', value: `${leaves}`, inline: true }
            )
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};

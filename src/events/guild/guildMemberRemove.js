const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'guildMemberRemove',
    async execute(member, client) {
        try {
            if (!member?.guild || member.user?.bot) return;

            const goodbyeChannelId = client?.config?.goodbyeChannelId || process.env.GOODBYE_CHANNEL_ID;
            if (!goodbyeChannelId) return;

            const channel = member.guild.channels.cache.get(goodbyeChannelId) || await member.guild.channels.fetch(goodbyeChannelId).catch(() => null);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━\n**Farewell, ${member.user.tag}.**\nYour presence will be missed.\n━━━━━━━━━━━━━━━━━━━━━━━━`)
                .setColor(client?.config?.colors?.primary || 0x2b2d31)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member Count: ${member.guild.memberCount}` })
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(() => { });
        } catch (e) {
            console.error('[HUB] guildMemberRemove error:', e);
        }
    }
};

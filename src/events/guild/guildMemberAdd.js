const { EmbedBuilder } = require('discord.js');

module.exports = {
    name: 'guildMemberAdd',
    async execute(member, client) {
        try {
            if (!member?.guild || member.user?.bot) return;

            const welcomeChannelId = client?.config?.welcomeChannelId || process.env.WELCOME_CHANNEL_ID;
            if (!welcomeChannelId) return;

            const channel = member.guild.channels.cache.get(welcomeChannelId) || await member.guild.channels.fetch(welcomeChannelId).catch(() => null);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setTitle('👋 Welcome')
                .setDescription(`Welcome to the server, ${member}!`)
                .setColor(client?.config?.colors?.primary || 0x2b2d31)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Member Count: ${member.guild.memberCount}` })
                .setTimestamp();

            await channel.send({ embeds: [embed] }).catch(() => { });
        } catch (e) {
            console.error('[HUB] guildMemberAdd error:', e);
        }
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nowplaying')
        .setDescription('Show the currently playing track'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });

        const now = client.music.getNowPlaying(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.GRAVITY)
            .setTitle('▤ NOW PLAYING')
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        embed.setDescription(now ? now.title : 'Nothing');
        if (now?.thumbnail) embed.setThumbnail(now.thumbnail);

        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => { });
    }
};

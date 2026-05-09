const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('queue')
        .setDescription('Show the current queue'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });

        const snapshot = client.music.getQueue(interaction.guildId);
        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.GRAVITY)
            .setTitle('▤ QUEUE')
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        if (snapshot.nowPlaying) {
            embed.addFields({ name: 'Now Playing', value: snapshot.nowPlaying.title || 'Unknown', inline: false });
        }

        const lines = snapshot.queue.slice(0, 15).map((t, i) => `${i + 1}. ${t.title}`).join('\n');
        embed.addFields({ name: 'Up Next', value: lines || 'Empty', inline: false });

        await interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => { });
    }
};

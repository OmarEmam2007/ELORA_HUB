const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

function isAbortLikeError(err) {
    const msg = String(err?.message || err || '').toLowerCase();
    return msg.includes('aborted') || msg.includes('abort') || msg.includes('timeout') || msg.includes('timed out');
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('play')
        .setDescription('Play or queue a song (SoundCloud/YouTube depending on host)')
        .addStringOption((opt) =>
            opt
                .setName('query')
                .setDescription('Song name or link')
                .setRequired(true)
        ),

    async execute(interaction, client) {
        const query = interaction.options.getString('query', true);

        if (!client?.music) {
            return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        }

        if (!interaction.inGuild()) {
            return interaction.reply({ content: '❌ This command can only be used in a server.', ephemeral: true });
        }

        const member = interaction.member;
        const voiceChannel = member?.voice?.channel;
        if (!voiceChannel) {
            return interaction.reply({ content: '❌ ادخل روم فويس الأول.', ephemeral: true });
        }

        await interaction.deferReply().catch(() => { });

        try {
            const track = await client.music.enqueueByIds({
                guildId: interaction.guildId,
                voiceChannelId: voiceChannel.id,
                textChannelId: interaction.channelId,
                userId: interaction.user.id,
                query
            });

            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.GRAVITY)
                .setTitle('▤ MUSIC')
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            embed.setDescription(`**⬜ Requested**\n${track?.title || query}`);
            if (track?.thumbnail) embed.setThumbnail(track.thumbnail);

            return interaction.editReply({ embeds: [embed] });
        } catch (e) {
            if (isAbortLikeError(e)) {
                return interaction.editReply({
                    content: '❌ الطلب اتقطع (Timeout/Aborted). جرب تاني، ولو بتشغل من YouTube على استضافة بتمنعه خلّيه SoundCloud أو فعّل Cookies.'
                });
            }
            return interaction.editReply({ content: `❌ ${e?.message || 'Failed to play.'}` });
        }
    }
};

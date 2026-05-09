const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('volume')
        .setDescription('Set volume (0 - 200%)')
        .addIntegerOption((opt) =>
            opt
                .setName('percent')
                .setDescription('Volume percent (0-200)')
                .setMinValue(0)
                .setMaxValue(200)
                .setRequired(true)
        ),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        const percent = interaction.options.getInteger('percent', true);
        client.music.setVolume(interaction.guildId, percent / 100);
        await interaction.reply({ content: `🔊 Volume set to ${percent}%`, ephemeral: true }).catch(() => { });
    }
};

const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skip current track'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        client.music.skip(interaction.guildId);
        await interaction.reply({ content: '⏭ Skipped.', ephemeral: true }).catch(() => { });
    }
};

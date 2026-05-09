const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pause the current track'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        client.music.pause(interaction.guildId);
        await interaction.reply({ content: '⏸ Paused.', ephemeral: true }).catch(() => { });
    }
};

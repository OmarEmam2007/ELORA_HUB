const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('loop')
        .setDescription('Toggle loop for the current track'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        client.music.toggleLoop(interaction.guildId);
        await interaction.reply({ content: '🔁 Toggled loop.', ephemeral: true }).catch(() => { });
    }
};

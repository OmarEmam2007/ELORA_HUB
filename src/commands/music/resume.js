const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resume the current track'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        client.music.resume(interaction.guildId);
        await interaction.reply({ content: '⏵ Resumed.', ephemeral: true }).catch(() => { });
    }
};

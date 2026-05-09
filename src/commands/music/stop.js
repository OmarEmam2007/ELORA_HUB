const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('stop')
        .setDescription('Stop music and clear the queue'),

    async execute(interaction, client) {
        if (!client?.music) return interaction.reply({ content: '❌ Music system not initialized.', ephemeral: true });
        client.music.stop(interaction.guildId);
        await interaction.reply({ content: '⏹ Stopped and cleared queue.', ephemeral: true }).catch(() => { });
    }
};

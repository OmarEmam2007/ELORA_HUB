const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const ModSettings = require('../../models/ModSettings');
const boostSettingsStore = require('../../services/boostSettingsStore');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boost')
        .setDescription('Setup the booster notification channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('The channel to send booster notifications in')
                .setRequired(true)
        ),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel');

        await boostSettingsStore.setBoosterChannelId(interaction.guild.id, channel.id);

        if (mongoose.connection?.readyState === 1) {
            let settings = await ModSettings.findOne({ guildId: interaction.guild.id });
            if (!settings) {
                settings = new ModSettings({ guildId: interaction.guild.id });
            }

            settings.boosterChannelId = channel.id;
            await settings.save();
        }

        const embed = new EmbedBuilder()
            .setColor('#000000')
            .setTitle('**✓ Boost Channel Saved**')
            .setDescription(`**⤿ Boost notifications will be sent to ${channel}.**`)
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    },
};

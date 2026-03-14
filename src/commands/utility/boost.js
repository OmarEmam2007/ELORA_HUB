const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

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

        let settings = await ModSettings.findOne({ guildId: interaction.guild.id });
        if (!settings) {
            settings = new ModSettings({ guildId: interaction.guild.id });
        }

        settings.boosterChannelId = channel.id;
        await settings.save();

        const embed = new EmbedBuilder()
            .setColor('#ff73fa')
            .setTitle('✅ Setup Successful')
            .setDescription(`Booster notifications will now be sent to ${channel}.\nNew boosters will automatically receive the role and a welcome message here.`)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};

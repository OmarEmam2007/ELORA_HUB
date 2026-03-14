const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('boost')
        .setDescription('ضبط قناة إشعارات البوستر')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('القناة التي سيتم إرسال إشعارات البوست فيها')
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
            .setTitle('✅ تم الضبط بنجاح')
            .setDescription(`سيتم الآن إرسال إشعارات السيرفر بوست في قناة ${channel}.\nأي شخص يقوم بعمل بوست سيحصل على الرتبة تلقائياً وسيتم الترحيب به هنا.`)
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    },
};

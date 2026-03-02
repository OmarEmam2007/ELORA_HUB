const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Bump = require('../../models/Bump');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bumpreminder')
        .setDescription('Manage the Disboard bump timer.')
        .addSubcommand(subcommand =>
            subcommand
                .setName('check')
                .setDescription('Check how much time is left until the next bump.')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Manually restart the 2-hour timer (if you just bumped).')
        ),

    async execute(interaction) {
        await interaction.deferReply();
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            let bumpData = await Bump.findOne({ guildId });

            if (subcommand === 'check') {
                if (!bumpData || !bumpData.nextBumpTime) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(THEME.COLORS.SUCCESS)
                                .setTitle('🚀 Ready to Bump!')
                                .setDescription('No timer is currently active. You can bump now!')
                                .setFooter(THEME.FOOTER)
                        ]
                    });
                }

                const now = Date.now();
                const nextTime = new Date(bumpData.nextBumpTime).getTime();
                const diff = nextTime - now;

                if (diff <= 0) {
                    return interaction.editReply({
                        embeds: [
                            new EmbedBuilder()
                                .setColor(THEME.COLORS.SUCCESS)
                                .setTitle('🚀 Ready to Bump!')
                                .setDescription('The timer has expired. Go ahead and `/bump`!')
                                .setFooter(THEME.FOOTER)
                        ]
                    });
                }

                // Format time left
                const minutes = Math.floor((diff / (1000 * 60)) % 60);
                const hours = Math.floor((diff / (1000 * 60 * 60)) % 24);

                interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(THEME.COLORS.PRIMARY)
                            .setTitle('⏳ Bump Timer')
                            .setDescription(`Next bump available in: **${hours}h ${minutes}m**`)
                            .setTimestamp(bumpData.nextBumpTime)
                            .setFooter(THEME.FOOTER)
                    ]
                });

            } else if (subcommand === 'reset') {
                const nextBump = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 Hours

                if (!bumpData) {
                    bumpData = new Bump({ guildId, nextBumpTime: nextBump, reminded: false });
                } else {
                    bumpData.nextBumpTime = nextBump;
                    bumpData.reminded = false;
                }

                await bumpData.save();

                interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(THEME.COLORS.SUCCESS)
                            .setTitle('✅ Timer Reset')
                            .setDescription(`Timer set! I will remind you in **2 hours**.\n📅 Next Bump: <t:${Math.floor(nextBump.getTime() / 1000)}:R>`)
                            .setFooter(THEME.FOOTER)
                    ]
                });
            }

        } catch (error) {
            console.error('Bump Reminder Error:', error);
            interaction.editReply({ content: '❌ An error occurred while accessing the database.', ephemeral: true });
        }
    }
};

const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rizz')
        .setDescription('Scanning target charisma levels.')
        .addUserOption(option => option.setName('target').setDescription('User to scan')),

    async execute(interaction, client) {
        const user = interaction.user;
        const targetUser = interaction.options.getUser('target') || user;

        const rng = Math.floor(Math.random() * 101);
        let title, desc, color;

        if (rng > 90) { title = '🔥 GODLY RIZZ'; desc = 'Absolute Gigachad energy.'; color = THEME.COLORS.SUCCESS; }
        else if (rng > 70) { title = '✨ High Rizz'; desc = 'Smooth operator.'; color = THEME.COLORS.ACCENT; }
        else if (rng > 40) { title = '😐 Mid Rizz'; desc = 'Just average.'; color = THEME.COLORS.WARNING; }
        else { title = '💀 Negative Rizz'; desc = 'Please stop talking.'; color = THEME.COLORS.ERROR; }

        const frames = ['📡 Scanning Pheromones...', '🧬 Analyzing DNA...', '💘 Calculating Appeal...'];
        const initEmbed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[0]}`);

        await interaction.reply({ embeds: [initEmbed] });

        for (let i = 1; i < frames.length; i++) {
            await new Promise(r => setTimeout(r, 600));
            const embed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[i]}`);
            await interaction.editReply({ embeds: [embed] });
        }

        const resultEmbed = new EmbedBuilder()
            .setColor(color)
            .setAuthor({
                name: title,
                iconURL: targetUser.displayAvatarURL({ dynamic: true })
            })
            .setDescription(
                `**${targetUser.username}** is **${rng}%** Rizzed up\n\n${desc}`
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        await interaction.editReply({ embeds: [resultEmbed] });
    },
};

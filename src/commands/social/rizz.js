const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rizz')
        .setDescription('Scanning target charisma levels.')
        .addUserOption(option => option.setName('target').setDescription('User to scan')),

    async execute(interaction, client, args) {
        // --- 1. Hybrid Input ---
        const isSlash = interaction.isChatInputCommand?.();
        const user = isSlash ? interaction.user : interaction.author;
        let targetUser;

        if (isSlash) {
            targetUser = interaction.options.getUser('target') || user;
        } else {
            // !rizz [@User]
            const targetId = args[0]?.replace(/[<@!>]/g, '');
            if (targetId) {
                try {
                    targetUser = await client.users.fetch(targetId);
                } catch { targetUser = user; }
            } else {
                targetUser = user;
            }
        }

        // --- 2. Calculation ---
        const rng = Math.floor(Math.random() * 101);
        let title, desc, color;

        if (rng > 90) { title = '🔥 GODLY RIZZ'; desc = 'Absolute Gigachad energy.'; color = THEME.COLORS.SUCCESS; }
        else if (rng > 70) { title = '✨ High Rizz'; desc = 'Smooth operator.'; color = THEME.COLORS.ACCENT; }
        else if (rng > 40) { title = '😐 Mid Rizz'; desc = 'Just average.'; color = THEME.COLORS.WARNING; }
        else { title = '💀 Negative Rizz'; desc = 'Please stop talking.'; color = THEME.COLORS.ERROR; }

        // --- 3. Animation ---
        const frames = ['📡 Scanning Pheromones...', '🧬 Analyzing DNA...', '💘 Calculating Appeal...'];
        let msg;
        const initEmbed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[0]}`);

        if (isSlash) {
            await interaction.reply({ embeds: [initEmbed] });
            msg = interaction;
        } else {
            msg = await interaction.reply({ embeds: [initEmbed] });
        }

        for (let i = 1; i < frames.length; i++) {
            await new Promise(r => setTimeout(r, 600));
            const embed = new EmbedBuilder().setColor(THEME.COLORS.ACCENT).setDescription(`${frames[i]}`);
            if (isSlash) await interaction.editReply({ embeds: [embed] });
            else await msg.edit({ embeds: [embed] });
        }

        // --- 4. Result ---
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

        if (isSlash) await interaction.editReply({ embeds: [resultEmbed] });
        else await msg.edit({ embeds: [resultEmbed] });
    },
};

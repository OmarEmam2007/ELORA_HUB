const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, AttachmentBuilder } = require('discord.js');

const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup-intro')
        .setDescription('Sends the Aesthetic Intro Panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    async execute(interaction, client) {

        await interaction.deferReply({ ephemeral: true });

        const bannerName = 'new banner1.png';
        const bannerCandidates = [
            path.join(__dirname, '../../assets', bannerName),
            path.join(__dirname, '../../../assets', bannerName),
            path.join(process.cwd(), 'assets', bannerName),
            path.join(process.cwd(), 'src', 'assets', bannerName),
            path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
        ];
        const bannerPath = bannerCandidates.find(p => {
            try { return fs.existsSync(p); } catch (_) { return false; }
        }) || null;
        const files = [];
        if (bannerPath) files.push(new AttachmentBuilder(bannerPath, { name: bannerName }));

        const embed = new EmbedBuilder()
            .setTitle('🍷 WHO ARE YOU?')
            .setDescription(
                `**drop ur intro below.**\ndon't be a ghost. let us know the vibe.\n\n` +
                `**📋 THE TEMPLATE**\n(copy & paste this)\n\n` +
                `name:\nage:\nsign:\nmbti:\nstatus:\ncurrent obsession:\nanthem (song):`
            )
            .setColor(client.config.colors.primary)
            .setTimestamp();

        if (files.length) {
            embed.setImage(`attachment://${bannerName}`);
        }

        await interaction.channel.send({ embeds: [embed], files });
        await interaction.editReply({ content: '✅ Intro panel deployed.' });
    },
};

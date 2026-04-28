const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('color_setup')
        .setDescription('Creates a color selection panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the color panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),

    async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);

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
        }) || bannerCandidates[0];

        const banner = new AttachmentBuilder(bannerPath, { name: bannerName });

        const solidMenu = new StringSelectMenuBuilder()
            .setCustomId('role_color_select')
            .setPlaceholder('✦ SELECT YOUR COLOR')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: '⬛ Black', value: 'black' },
                { label: '⬜ White', value: 'white' },
                { label: '🟥 Bloody Red', value: 'bloody_red' },
                { label: '🟪 Purple', value: 'purple' },
                { label: '🩷 Pink', value: 'pink' },
                { label: '🩷🟥 Rose Pink', value: 'rose_pink' }
            );

        const gradientMenu = new StringSelectMenuBuilder()
            .setCustomId('role_gradient_select')
            .setPlaceholder('✦ SELECT YOUR GRADIENT')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: '🩷🟪 Margo', value: 'margo' },
                { label: '🟫⬛ Expresso', value: 'expresso' },
                { label: '🟥🟪 Pure Lust', value: 'pure_lust' },
                { label: '🩷⬜ Delicate', value: 'delicate' },
                { label: '🟪🩷 Mauve', value: 'mauve' },
                { label: '🟦⬛ Deep Space', value: 'deep_space' }
            );

        const row1 = new ActionRowBuilder().addComponents(solidMenu);
        const row2 = new ActionRowBuilder().addComponents(gradientMenu);

        await channel.send({ content: ' ', files: [banner] }).catch(() => { });
        await channel.send({ components: [row1, row2] }).catch(() => { });

        await interaction.reply({ content: 'OK', ephemeral: true }).catch(() => { });
    }
};

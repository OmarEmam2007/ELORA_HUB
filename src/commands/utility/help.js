const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const THEME = require('../../utils/theme');

function buildHelpEmbed(page) {
    const embed = new EmbedBuilder()
        .setColor(THEME.COLORS.ACCENT)
        .setFooter(THEME.FOOTER)
        .setTimestamp();

    if (page === 'home') {
        embed
            .setTitle('📚 Elora Help')
            .setDescription('Use the buttons below to browse command categories.');
    }

    if (page === 'moderation') {
        embed
            .setTitle('🔨 Moderation')
            .setDescription(
                [
                    '`/warn add` - Warn a user (auto-timeout at 3 warns)',
                    '`/warn list` - List warnings for a user',
                    '`/warn clear` - Clear warnings for a user',
                    '`/clear` - Bulk delete messages (filters supported)',
                    '`/mod-config logs` - Set moderation log channel',
                    '`/mod-config toggle` - Enable/disable smart moderation'
                ].join('\n')
            );
    }

    if (page === 'security') {
        embed
            .setTitle('🛡️ Security / Anti-Nuke')
            .setDescription(
                [
                    '`/security logs` - Set security log channel',
                    '`/security toggle` - Enable/disable anti-nuke guards',
                    '`/security whitelist-add` - Add user/role to whitelist',
                    '`/security whitelist-remove` - Remove user/role from whitelist',
                    '`/security whitelist-list` - Show whitelist'
                ].join('\n')
            );
    }

    if (page === 'music') {
        embed
            .setTitle('🎵 Music')
            .setDescription(
                [
                    '`/play` - Play or queue a song',
                    'Note: On Railway, YouTube is disabled. SoundCloud is used instead.'
                ].join('\n')
            );
    }

    if (page === 'utility') {
        embed
            .setTitle('🧰 Utility')
            .setDescription(
                [
                    '`/leaderboard` - Show top users (levels/economy)',
                    '`lvl` (prefix) - Levels leaderboard (chat + voice)'
                ].join('\n')
            );
    }

    return embed;
}

function buildHelpComponents(active) {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('help_home').setStyle(active === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel('Home'),
        new ButtonBuilder().setCustomId('help_moderation').setStyle(active === 'moderation' ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel('Moderation'),
        new ButtonBuilder().setCustomId('help_security').setStyle(active === 'security' ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel('Security'),
        new ButtonBuilder().setCustomId('help_music').setStyle(active === 'music' ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel('Music'),
        new ButtonBuilder().setCustomId('help_utility').setStyle(active === 'utility' ? ButtonStyle.Primary : ButtonStyle.Secondary).setLabel('Utility')
    );

    return [row];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Open the interactive help panel.'),

    async execute(interaction) {
        const embed = buildHelpEmbed('home');
        const components = buildHelpComponents('home');
        await interaction.reply({ embeds: [embed], components });
    },

    buildHelpEmbed,
    buildHelpComponents
};

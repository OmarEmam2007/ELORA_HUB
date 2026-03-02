const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    EmbedBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
    ButtonBuilder,
    ButtonStyle
} = require('discord.js');

const ModSettings = require('../../models/ModSettings');
const GuildSecurityConfig = require('../../models/GuildSecurityConfig');
const THEME = require('../../utils/theme');

function buildSettingsEmbed({ guild, modSettings, secSettings }) {
    const embed = new EmbedBuilder()
        .setColor(THEME.COLORS.ACCENT)
        .setTitle('⚙️ Server Control Panel')
        .setDescription('Use the menu and buttons below to manage key settings.')
        .addFields(
            {
                name: 'Moderation',
                value: `Smart Moderation: **${modSettings?.enabled ? 'ON' : 'OFF'}**\nMode: **${modSettings?.mode || 'normal'}**\nSensitivity: **${modSettings?.sensitivity ?? 3}**\nMod Logs: ${modSettings?.logChannelId ? `<#${modSettings.logChannelId}>` : '**Not set**'}`,
                inline: true
            },
            {
                name: 'Security',
                value: `Anti-Nuke: **${secSettings?.antiNukeEnabled ? 'ON' : 'OFF'}**\nSecurity Logs: ${secSettings?.securityLogChannelId ? `<#${secSettings.securityLogChannelId}>` : '**Not set**'}\nTimeout: **${secSettings?.punishmentTimeoutHours || 12}h**`,
                inline: true
            }
        )
        .setFooter(THEME.FOOTER)
        .setTimestamp();

    return embed;
}

function buildSettingsComponents({ modSettings, secSettings }) {
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_toggle_mod')
            .setStyle(modSettings?.enabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setLabel(modSettings?.enabled ? 'Disable Moderation' : 'Enable Moderation'),
        new ButtonBuilder()
            .setCustomId('settings_toggle_modemode')
            .setStyle(ButtonStyle.Secondary)
            .setLabel(`Mode: ${(modSettings?.mode || 'normal') === 'strict' ? 'Strict' : 'Normal'}`),
        new ButtonBuilder()
            .setCustomId('settings_sens_up')
            .setStyle(ButtonStyle.Primary)
            .setLabel('Sensitivity +')
    );

    const row3 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_sens_down')
            .setStyle(ButtonStyle.Primary)
            .setLabel('Sensitivity -'),
        new ButtonBuilder()
            .setCustomId('settings_whitelist_role_add')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Whitelist Role'),
        new ButtonBuilder()
            .setCustomId('settings_whitelist_channel_add')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Whitelist Channel')
    );

    const row4 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('settings_toggle_antinuke')
            .setStyle(secSettings?.antiNukeEnabled ? ButtonStyle.Danger : ButtonStyle.Success)
            .setLabel(secSettings?.antiNukeEnabled ? 'Disable Anti-Nuke' : 'Enable Anti-Nuke'),
        new ButtonBuilder()
            .setCustomId('settings_show_whitelist')
            .setStyle(ButtonStyle.Secondary)
            .setLabel('Show Whitelist')
    );

    return [row2, row3, row4];
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('settings')
        .setDescription('Open the server settings control panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild) return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });

        const [modSettings, secSettings] = await Promise.all([
            ModSettings.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $setOnInsert: { guildId: interaction.guildId } },
                { upsert: true, new: true }
            ),
            GuildSecurityConfig.findOneAndUpdate(
                { guildId: interaction.guildId },
                { $setOnInsert: { guildId: interaction.guildId } },
                { upsert: true, new: true }
            )
        ]);

        const embed = buildSettingsEmbed({ guild: interaction.guild, modSettings, secSettings });
        const components = buildSettingsComponents({ modSettings, secSettings });

        await interaction.reply({ embeds: [embed], components });
    },

    buildSettingsEmbed,
    buildSettingsComponents
};

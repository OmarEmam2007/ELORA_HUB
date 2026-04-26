const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const ModSettings = require('../../models/ModSettings');
const ModLog = require('../../models/ModLog');

/**
 * Generates the Smart Moderation Dashboard
 */
async function generateDashboard(guildId) {
    let settings = await ModSettings.findOne({ guildId });
    if (!settings) {
        settings = await ModSettings.create({ guildId });
    }

    const stats = await ModLog.aggregate([
        { $match: { guildId } },
        { $group: { _id: null, total: { $sum: 1 }, severe: { $sum: { $cond: [{ $eq: ["$severity", "Extreme"] }, 1, 0] } } } }
    ]);

    const totalViolations = stats.length > 0 ? stats[0].total : 0;
    const extremeViolations = stats.length > 0 ? stats[0].severe : 0;

    const bannerName = 'new banner1.png';
    const repoRoot = path.join(__dirname, '..', '..', '..');
    const bannerCandidates = [
        path.join(repoRoot, 'assets', bannerName),
        path.join(repoRoot, 'src', 'assets', bannerName),
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
        .setTitle('🛰️  𝐄 𝐋 𝐎 𝐑 𝐀  𝐒 𝐌 𝐀 𝐑 𝐓  𝐃 𝐀 𝐒 𝐇 𝐁 𝐎 𝐀 𝐑 𝐃  🛰️')
        .setColor('#5865F2')
        .setDescription(`━━━━━━━━━━━━━━━━━━━━━━━━\n**Nexus Intelligent Defense Overview**\n━━━━━━━━━━━━━━━━━━━━━━━━`)
        .addFields(
            { name: '🛡️ Filter Status', value: settings.enabled ? '✅ **ONLINE**' : '❌ **OFFLINE**', inline: true },
            { name: '⚡ Sensitivity', value: `Level **${settings.sensitivity}/5**`, inline: true },
            { name: '🌐 Multilingual', value: settings.multilingual ? '✅ Enabled' : '❌ Disabled', inline: true },
            { name: '🧠 Adaptive Learning', value: settings.learningMode ? '✅ Active' : '❌ Inactive', inline: true },
            { name: '📊 Total Violations', value: `\`${totalViolations}\``, inline: true },
            { name: '🔥 Extreme Alerts', value: `\`${extremeViolations}\``, inline: true }
        );

    if (files.length) {
        embed.setImage(`attachment://${bannerName}`);
    }

    embed
        .setFooter({ text: 'Sovereign Nexus • Sentient Entry System' })
        .setTimestamp();

    const row1 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('dash_toggle_filter')
                .setLabel(settings.enabled ? 'Disable Filter' : 'Enable Filter')
                .setStyle(settings.enabled ? ButtonStyle.Danger : ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('dash_sensitivity_up')
                .setLabel('Increase Sensitivity')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('dash_sensitivity_down')
                .setLabel('Decrease Sensitivity')
                .setStyle(ButtonStyle.Secondary)
        );

    const row2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('dash_toggle_learning')
                .setLabel('Toggle Learning')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('dash_view_logs')
                .setLabel('View Latest Logs')
                .setStyle(ButtonStyle.Secondary)
        );

    return { embeds: [embed], components: [row1, row2], files };
}

module.exports = { generateDashboard };

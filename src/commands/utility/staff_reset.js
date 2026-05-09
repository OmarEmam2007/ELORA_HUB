const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const StaffApplication = require('../../models/StaffApplication');
const THEME = require('../../utils/theme');

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

function isAdminOrOwner(message, client) {
    const member = message.member;
    if (!member) return false;
    const ownerId = client?.config?.ownerId || process.env.OWNER_ID;
    if (ownerId && message.author?.id === ownerId) return true;
    if (message.guild?.ownerId && message.author?.id === message.guild.ownerId) return true;
    return Boolean(member.permissions?.has?.('Administrator') || member.permissions?.has?.(8n));
}

function buildEmbed(ok, text) {
    return new EmbedBuilder()
        .setColor(ok ? '#000000' : (THEME.COLORS?.ERROR || '#FF0000'))
        .setTitle('Staff Reset')
        .setDescription(text)
        .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined })
        .setTimestamp();
}

module.exports = {
    name: 'staff_reset',
    aliases: ['staffreset', 'reset_staff', 'resetstaff'],

    async execute(message, client, args) {
        if (!message?.guild) return;
        if (!isAdminOrOwner(message, client)) return;

        if (mongoose.connection?.readyState !== 1) {
            const embed = buildEmbed(false, 'Database offline.');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        const targetId = parseUserId(args?.[0]);
        if (!targetId) {
            const embed = buildEmbed(false, 'Usage: `.staff_reset @user`');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        try {
            const active = await StaffApplication.findOne({
                guildId: message.guild.id,
                userId: targetId,
                status: { $in: ['draft', 'submitted', 'under_review'] }
            }).catch(() => null);

            if (active?.channelId) {
                const ch = await message.guild.channels.fetch(active.channelId).catch(() => null);
                if (ch?.isTextBased?.()) {
                    await ch.permissionOverwrites.edit(targetId, { ViewChannel: false }).catch(() => { });
                    await ch.send({ content: '▫️ Application reset by staff.' }).catch(() => { });
                }
            }

            await StaffApplication.deleteMany({
                guildId: message.guild.id,
                userId: targetId
            }).catch(() => null);

            const embed = buildEmbed(true, `Reset complete for <@${targetId}>. They can apply again now.`);
            return message.reply({ embeds: [embed] }).catch(() => null);
        } catch (e) {
            console.error('[STAFF_RESET] Error:', e);
            const embed = buildEmbed(false, 'Failed to reset staff application state.');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }
    }
};

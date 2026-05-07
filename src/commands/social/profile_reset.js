const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const User = require('../../models/User');
const { withTransaction } = require('../../services/marriageService');
const THEME = require('../../utils/theme');

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

function isOwnerOnly(message, client) {
    const ownerId = client?.config?.ownerId || process.env.OWNER_ID;
    if (ownerId && message.author?.id === ownerId) return true;
    if (message.guild?.ownerId && message.author?.id === message.guild.ownerId) return true;
    return false;
}

function buildEmbed(ok, text) {
    return new EmbedBuilder()
        .setColor(ok ? '#000000' : (THEME.COLORS?.ERROR || '#FF0000'))
        .setTitle('Profile Reset')
        .setDescription(text)
        .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined })
        .setTimestamp();
}

module.exports = {
    name: 'profile_reset',
    aliases: ['profilereset', 'resetprofile', 'marriage_reset', 'mreset'],

    async execute(message, client, args) {
        if (!message?.guild) return;
        if (!isOwnerOnly(message, client)) return;

        if (mongoose.connection?.readyState !== 1) {
            const embed = buildEmbed(false, 'Database offline.');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        const targetId = parseUserId(args?.[0]) || message.author.id;

        try {
            let partnerIdToClear = null;

            await withTransaction(async (session) => {
                const fresh = await User.findOne({ userId: targetId, guildId: message.guild.id })
                    .session(session || null)
                    .exec();

                partnerIdToClear = fresh?.partnerId || null;

                await User.updateOne(
                    { userId: targetId, guildId: message.guild.id },
                    {
                        $set: {
                            partnerId: null,
                            marryDate: null,
                            lastDivorceDate: null,
                            marriageCount: 0,
                            divorceCount: 0
                        }
                    },
                    { upsert: true, session }
                ).exec();

                if (partnerIdToClear) {
                    await User.updateOne(
                        { userId: partnerIdToClear, guildId: message.guild.id, partnerId: targetId },
                        { $set: { partnerId: null, marryDate: null } },
                        { session }
                    ).exec();
                }
            });

            const embed = buildEmbed(true, `Reset complete for <@${targetId}>.`);
            return message.reply({ embeds: [embed] }).catch(() => null);
        } catch (e) {
            console.error('[PROFILE_RESET] Error:', e);
            const embed = buildEmbed(false, 'Failed to reset profile.');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }
    }
};

const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

const THEME = require('../../utils/theme');
const User = require('../../models/User');
const MarriageProposal = require('../../models/MarriageProposal');
const { withTransaction } = require('../../services/marriageService');

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

module.exports = {
    name: 'reset',
    aliases: ['resetprofile', 'wipeprofile'],

    async execute(message, client, args) {
        if (!message.guild) return;

        const member = message.member;
        if (!member?.permissions?.has(PermissionFlagsBits.Administrator)) {
            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setTitle('⛔ Access Denied')
                .setDescription('Admin only.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const targetId = parseUserId(args[0]) || message.mentions?.users?.first?.()?.id;
        if (!targetId) {
            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.WARNING)
                .setTitle('🧹 Reset Profile')
                .setDescription(`You must mention a user.\n\nExample:\n\`.reset @user\``)
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const guildId = message.guild.id;

        try {
            const result = await withTransaction(async (session) => {
                const targetDoc = await User.findOne({ userId: targetId, guildId }).session(session || null).exec();
                if (!targetDoc) {
                    return { ok: false, reason: 'not_found' };
                }

                const partnerId = targetDoc.partnerId;

                // Break any marriage ties safely.
                if (partnerId) {
                    await User.updateOne(
                        { userId: partnerId, guildId },
                        { $set: { partnerId: null, marryDate: null } },
                        { session }
                    ).exec();
                }

                // Extra safety: clear anyone pointing to target.
                await User.updateMany(
                    { guildId, partnerId: targetId },
                    { $set: { partnerId: null, marryDate: null } },
                    { session }
                ).exec();

                // Remove pending proposals involving target.
                await MarriageProposal.updateMany(
                    {
                        guildId,
                        status: 'pending',
                        $or: [{ requesterId: targetId }, { targetId }],
                    },
                    { $set: { status: 'cancelled', resolvedAt: new Date(), resolvedBy: message.author.id } },
                    { session }
                ).exec();

                // Delete the entire profile document (resets all fields to defaults when recreated).
                await User.deleteOne({ userId: targetId, guildId }, { session }).exec();

                return { ok: true, partnerId };
            });

            if (!result.ok) {
                const embed = new EmbedBuilder()
                    .setColor(THEME.COLORS.WARNING)
                    .setTitle('🧹 Reset Profile')
                    .setDescription('That user does not have a saved profile in the database.')
                    .setFooter(THEME.FOOTER)
                    .setTimestamp();
                return message.reply({ embeds: [embed] });
            }

            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.SUCCESS)
                .setTitle('✅ Profile Reset Complete')
                .setDescription(
                    `Profile reset for <@${targetId}> was completed.` +
                    (result.partnerId ? `\n\n💍 Previous marriage link to <@${result.partnerId}> was cleared.` : '')
                )
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        } catch (err) {
            console.error('[RESET] Error:', err);
            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setTitle('❌ Reset Failed')
                .setDescription('Something went wrong while resetting the profile. Please try again.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }
    },
};

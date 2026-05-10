const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

const THEME = require('../../utils/theme');
const MarriageProposal = require('../../models/MarriageProposal');

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

async function tryUpdateProposalMessage(client, proposal, embed) {
    try {
        if (!proposal?.channelId || !proposal?.messageId) return;
        const ch = await client.channels.fetch(proposal.channelId).catch(() => null);
        if (!ch || !('messages' in ch)) return;
        const msg = await ch.messages.fetch(proposal.messageId).catch(() => null);
        if (!msg) return;
        await msg.edit({ embeds: [embed], components: [] }).catch(() => { });
    } catch (_) { }
}

module.exports = {
    name: 'refuse',
    aliases: ['reject', 'decline', 'no'],

    async execute(message, client, args) {
        if (!message.guild) return;

        if (mongoose?.connection?.readyState !== 1) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💍 Marriage System Offline')
                .setDescription('Database is not connected right now. Please contact the bot owner to configure MongoDB.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const guildId = message.guild.id;
        const targetId = message.author.id;
        const requesterIdFilter = parseUserId(args?.[0]);

        const query = {
            guildId,
            targetId,
            status: 'pending',
        };
        if (requesterIdFilter) query.requesterId = requesterIdFilter;

        const proposal = await MarriageProposal.findOne(query).sort({ createdAt: -1 }).exec().catch(() => null);
        if (!proposal) {
            const embed = new EmbedBuilder()
                .setColor('#FFD36A')
                .setTitle('ℹ️ No Pending Proposal')
                .setDescription('You have no pending marriage proposal to refuse.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        await MarriageProposal.updateOne(
            { _id: proposal._id, status: 'pending' },
            { $set: { status: 'declined', resolvedAt: new Date(), resolvedBy: targetId } }
        ).exec().catch(() => { });

        const embed = new EmbedBuilder()
            .setColor('#FF4D6D')
            .setTitle('💔 Proposal Declined')
            .setDescription(`<@${targetId}> has declined the proposal from <@${proposal.requesterId}>.`)
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await tryUpdateProposalMessage(client, proposal, embed);
        return message.reply({ embeds: [embed] });
    },
};

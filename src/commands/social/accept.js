const { EmbedBuilder, AttachmentBuilder } = require('discord.js');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');

const THEME = require('../../utils/theme');
const User = require('../../models/User');
const MarriageProposal = require('../../models/MarriageProposal');
const { withTransaction } = require('../../services/marriageService');

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
    name: 'accept',
    aliases: ['approve', 'yes'],

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
                .setDescription('You have no pending marriage proposal to accept.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const requesterId = proposal.requesterId;

        try {
            const marriedAt = new Date();

            await withTransaction(async (session) => {
                const freshRequester = await User.findOne({ userId: requesterId, guildId }).session(session || null).exec();
                const freshTarget = await User.findOne({ userId: targetId, guildId }).session(session || null).exec();

                if (!freshRequester || !freshTarget) throw new Error('Missing user documents');
                if (freshRequester.partnerId) throw new Error('Requester already married');
                if (freshTarget.partnerId) throw new Error('Target already married');

                await User.updateOne(
                    { userId: requesterId, guildId },
                    { $set: { partnerId: targetId, marryDate: marriedAt }, $inc: { marriageCount: 1 } },
                    { session }
                ).exec();

                await User.updateOne(
                    { userId: targetId, guildId },
                    { $set: { partnerId: requesterId, marryDate: marriedAt }, $inc: { marriageCount: 1 } },
                    { session }
                ).exec();

                await MarriageProposal.updateOne(
                    { _id: proposal._id, status: 'pending' },
                    { $set: { status: 'accepted', resolvedAt: new Date(), resolvedBy: targetId } },
                    { session }
                ).exec();
            });

            const embed = new EmbedBuilder()
                .setColor('#2DFFB3')
                .setTitle('👑 Marriage Sealed')
                .setDescription(`💍 Congratulations! <@${requesterId}> and <@${targetId}> are now officially married!`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            const bannerName = 'new banner1.png';
            const bannerCandidates = [
                path.join(__dirname, '../../../assets', bannerName),
                path.join(__dirname, '../../assets', bannerName),
                path.join(process.cwd(), 'assets', bannerName),
                path.join(process.cwd(), 'src', 'assets', bannerName),
                path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
            ];
            const bannerPath = bannerCandidates.find(p => {
                try { return fs.existsSync(p); } catch (_) { return false; }
            }) || null;

            const files = [];
            if (bannerPath) {
                files.push(new AttachmentBuilder(bannerPath, { name: bannerName }));
                embed.setThumbnail(`attachment://${bannerName}`);
                embed.setImage(`attachment://${bannerName}`);
            }

            await tryUpdateProposalMessage(client, proposal, embed);
            return message.reply({ embeds: [embed], files });
        } catch (err) {
            console.error('[MARRIAGE] .accept error:', err);
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('❌ Accept Failed')
                .setDescription('Failed to finalize this marriage. Make sure both users are still single and try again.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }
    },
};

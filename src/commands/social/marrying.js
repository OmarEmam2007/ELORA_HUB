const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder,
} = require('discord.js');

const mongoose = require('mongoose');

const path = require('path');
const fs = require('fs');

const THEME = require('../../utils/theme');
const { getOrCreateUser } = require('../../services/marriageService');
const MarriageProposal = require('../../models/MarriageProposal');

const COOLDOWN_MS = 60 * 60 * 1000;

function proposalRow(proposalId) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`marry_accept_${proposalId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`marry_decline_${proposalId}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
    );
}

function parseUserId(raw) {
    if (!raw) return null;
    return String(raw).replace(/[<@!>]/g, '').trim() || null;
}

module.exports = {
    name: 'marrying',
    aliases: ['marry', 'proposal'],

    async execute(message, client, args) {
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
        const requester = message.author;

        const targetId = parseUserId(args[0]);
        if (!targetId) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💍 Marriage Protocol')
                .setDescription(`You must mention a target user.\n\nExample:\n\`.marrying @user\``)
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        let targetUser;
        try {
            targetUser = await client.users.fetch(targetId);
        } catch (_) {
            targetUser = null;
        }

        if (!targetUser) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💍 Marriage Protocol')
                .setDescription('Target user not found.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        if (requester.id === targetUser.id) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('🪞 Impossible Vow')
                .setDescription('You cannot marry yourself. Find a real partner.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const requesterDoc = await getOrCreateUser(requester.id, guildId);
        if (requesterDoc.partnerId) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💍 Already Bound')
                .setDescription(`You are already married to <@${requesterDoc.partnerId}>! You cannot marry again.`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const targetDoc = await getOrCreateUser(targetUser.id, guildId);
        if (targetDoc.partnerId) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💍 Target Unavailable')
                .setDescription(`<@${targetUser.id}> is already married! Find someone else.`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        if (requesterDoc.lastDivorceDate) {
            const diff = Date.now() - new Date(requesterDoc.lastDivorceDate).getTime();
            if (diff < COOLDOWN_MS) {
                const minutesLeft = Math.ceil((COOLDOWN_MS - diff) / 60000);
                const embed = new EmbedBuilder()
                    .setColor('#FFD36A')
                    .setTitle('⏳ Remarriage Cooldown')
                    .setDescription(`You must wait at least **1 hour** since your last divorce before you can marry again.\n\nTime left: **${minutesLeft} min**`)
                    .setFooter(THEME.FOOTER)
                    .setTimestamp();
                return message.reply({ embeds: [embed] });
            }
        }

        const divorceWarning = requesterDoc.divorceCount > 0
            ? `\n\n⚠️ **WARNING:** This user has been divorced **${requesterDoc.divorceCount}** time(s).`
            : '';

        // Prevent multiple pending proposals between the same pair.
        const existing = await MarriageProposal.findOne({
            guildId,
            requesterId: requester.id,
            targetId: targetUser.id,
            status: 'pending',
        }).exec().catch(() => null);

        if (existing) {
            const embed = new EmbedBuilder()
                .setColor('#FFD36A')
                .setTitle('⏳ Proposal Already Pending')
                .setDescription(`You already have a pending proposal to <@${targetUser.id}>.\n\nThey can accept or decline whenever they are ready.`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const proposal = await MarriageProposal.create({
            guildId,
            requesterId: requester.id,
            targetId: targetUser.id,
            channelId: message.channel.id,
            messageId: null,
            status: 'pending',
        });

        const proposalEmbed = new EmbedBuilder()
            .setColor('#FF69B4')
            .setTitle('💍 Legendary Proposal')
            .setDescription(
                `💖 <@${requester.id}> is proposing marriage to <@${targetUser.id}>!${divorceWarning}\n\n` +
                `Choose your fate, <@${targetUser.id}>...\n\n` +
                `🕯️ This proposal has **no expiration**. Take your time.`
            )
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
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
            proposalEmbed.setThumbnail(`attachment://${bannerName}`);
            proposalEmbed.setImage(`attachment://${bannerName}`);
        }

        const sent = await message.reply({ embeds: [proposalEmbed], components: [proposalRow(proposal.id)], files });

        await MarriageProposal.updateOne(
            { _id: proposal._id },
            { $set: { messageId: sent?.id || null } }
        ).exec().catch(() => { });

        return;
    },
};

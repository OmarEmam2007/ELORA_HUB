const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const path = require('path');
const fs = require('fs');

const THEME = require('../../utils/theme');
const User = require('../../models/User');
const { getOrCreateUser, withTransaction } = require('../../services/marriageService');

module.exports = {
    name: 'divorce',
    aliases: ['breakup', 'separate'],

    async execute(message) {
        const guildId = message.guild.id;
        const author = message.author;

        const authorDoc = await getOrCreateUser(author.id, guildId);

        if (!authorDoc.partnerId) {
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('💔 Divorce Request Rejected')
                .setDescription('You are not married to get divorced!')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }

        const partnerId = authorDoc.partnerId;

        try {
            await withTransaction(async (session) => {
                const freshAuthor = await User.findOne({ userId: author.id, guildId }).session(session || null).exec();
                if (!freshAuthor?.partnerId) throw new Error('Author not married');

                const freshPartner = await User.findOne({ userId: partnerId, guildId }).session(session || null).exec();

                const now = new Date();

                await User.updateOne(
                    { userId: author.id, guildId },
                    {
                        $set: { partnerId: null, marryDate: null, lastDivorceDate: now },
                        $inc: { divorceCount: 1 },
                    },
                    { session }
                ).exec();

                if (freshPartner) {
                    await User.updateOne(
                        { userId: partnerId, guildId },
                        { $set: { partnerId: null, marryDate: null }, $inc: { divorceCount: 1 } },
                        { session }
                    ).exec();
                }
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📜 Divorce Finalized')
                .setDescription(`The divorce between <@${author.id}> and <@${partnerId}> has been finalized.\nWe wish you both a peaceful life (apart).`)
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

            return message.reply({ embeds: [embed], files });
        } catch (err) {
            console.error('[DIVORCE] Error:', err);
            const embed = new EmbedBuilder()
                .setColor('#FF4D6D')
                .setTitle('⚠️ Divorce Failed')
                .setDescription('Something went wrong while processing your divorce. Please try again.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();
            return message.reply({ embeds: [embed] });
        }
    },
};

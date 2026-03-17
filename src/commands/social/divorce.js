const { EmbedBuilder } = require('discord.js');

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
                .setThumbnail('https://cdn-icons-png.flaticon.com/512/2760/2760203.png')
                .setImage('https://media.tenor.com/zrZr8EoA3WIAAAAC/crying-anime.gif')
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            return message.reply({ embeds: [embed] });
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

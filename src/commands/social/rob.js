const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const User = require('../../models/User');
const THEME = require('../../utils/theme');

const GAMBLING_HALL_ID = '1467465229675003925';
const CASINO_LOGS_ID = '1467466000214655150';
const SAFE_KEEPER_ROLE = '1467468825803882589';

module.exports = {
    name: 'rob',
    aliases: ['steal'],
    async execute(message, client, args) {
        // Channel restriction
        if (message.channel.id !== GAMBLING_HALL_ID) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription(`❌ This command can only be used in <#${GAMBLING_HALL_ID}>`)] });
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser || targetUser.bot) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ Please mention a valid user to rob.')] });
        }

        if (targetUser.id === message.author.id) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ You cannot rob yourself.')] });
        }

        // Check if target has Safe Keeper role
        const targetMember = await message.guild.members.fetch(targetUser.id).catch(() => null);
        if (targetMember && targetMember.roles.cache.has(SAFE_KEEPER_ROLE)) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ This user is protected by a Safe Keeper license.')] });
        }

        let robberProfile = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
        if (!robberProfile) {
            robberProfile = new User({ userId: message.author.id, guildId: message.guild.id });
        }

        let targetProfile = await User.findOne({ userId: targetUser.id, guildId: message.guild.id });
        if (!targetProfile) {
            targetProfile = new User({ userId: targetUser.id, guildId: message.guild.id });
        }

        const targetWallet = targetProfile.wallet || 0;
        if (targetWallet < 100) {
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.ERROR).setDescription('❌ This user doesn\'t have enough money to rob (minimum 100 coins).')] });
        }

        // 50% chance of success
        const success = Math.random() < 0.5;

        if (success) {
            // Success: steal 20-50% of target's wallet
            const stealPercent = Math.random() * 0.3 + 0.2; // 20-50%
            const stolen = Math.floor(targetWallet * stealPercent);

            targetProfile.wallet = targetWallet - stolen;
            robberProfile.wallet = (robberProfile.wallet || 0) + stolen;

            await targetProfile.save();
            await robberProfile.save();

            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.SUCCESS)
                .setTitle('💰 Robbery Successful!')
                .setDescription(`You successfully robbed **${targetUser.username}** and stole \`${stolen.toLocaleString()}\` coins!`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            const logChannel = message.guild.channels.cache.get(CASINO_LOGS_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.ERROR)
                    .setDescription(`💰 **Robbery** | ${message.author} robbed ${targetUser} | Stolen: \`${stolen.toLocaleString()}\` coins`)
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
            }
        } else {
            // Failure: lose 10% of your wallet or 500 coins, whichever is less
            const robberWallet = robberProfile.wallet || 0;
            const fine = Math.min(Math.floor(robberWallet * 0.1), 500);

            if (fine > 0) {
                robberProfile.wallet = robberWallet - fine;
                await robberProfile.save();
            }

            const embed = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setTitle('🚨 Robbery Failed!')
                .setDescription(`You were caught trying to rob **${targetUser.username}**!${fine > 0 ? `\n\n💸 You were fined \`${fine.toLocaleString()}\` coins.` : ''}`)
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            await message.reply({ embeds: [embed] });

            const logChannel = message.guild.channels.cache.get(CASINO_LOGS_ID);
            if (logChannel) {
                const logEmbed = new EmbedBuilder()
                    .setColor(THEME.COLORS.WARNING)
                    .setDescription(`🚨 **Failed Robbery** | ${message.author} tried to rob ${targetUser} | Fine: \`${fine.toLocaleString()}\` coins`)
                    .setTimestamp();
                await logChannel.send({ embeds: [logEmbed] }).catch(() => { });
            }
        }
    }
};

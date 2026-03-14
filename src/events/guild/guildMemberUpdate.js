const { EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

const BOOSTER_ROLE_ID = '1482180640291029052';

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        const guild = newMember.guild;

        // التحقق من حالة البوست (هل بدأ بعمل بوست الآن؟)
        const oldStatus = oldMember.premiumSince;
        const newStatus = newMember.premiumSince;

        if (!oldStatus && newStatus) {
            // الشخص عمل بوست الآن
            try {
                // 1. إعطاء الرتبة
                if (!newMember.roles.cache.has(BOOSTER_ROLE_ID)) {
                    await newMember.roles.add(BOOSTER_ROLE_ID).catch(err => console.error('Error adding booster role:', err));
                }

                // 2. إرسال الإشعار في القناة المحددة
                const settings = await ModSettings.findOne({ guildId: guild.id });
                if (settings && settings.boosterChannelId) {
                    const channel = await guild.channels.fetch(settings.boosterChannelId).catch(() => null);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#ff73fa')
                            .setTitle('💎 New Server Booster!')
                            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                            .setDescription(`شكراً لك يا ${newMember} على دعم السيرفر بعمل بوست! 💖\nلقد حصلت على رتبة <@&${BOOSTER_ROLE_ID}> تلقائياً.`)
                            .setImage('https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJndXpueXF4ZzR6NHJndXpueXF4ZzR6NHJndXpueXF4ZzR6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif') // اختيار صورة مناسبة للبوست
                            .setTimestamp();

                        await channel.send({ content: `${newMember}`, embeds: [embed] }).catch(err => console.error('Error sending booster message:', err));
                    }
                }
            } catch (error) {
                console.error('Error in guildMemberUpdate (Booster Logic):', error);
            }
        }
    }
};

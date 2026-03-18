const { EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

const BOOSTER_ROLE_ID = '1482180640291029052';

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        const guild = newMember.guild;
        const DEBUG = process.env.BOOST_DEBUG === '1';

        // التحقق من حالة البوست (هل بدأ بعمل بوست الآن؟)
        const oldStatus = oldMember.premiumSince;
        const newStatus = newMember.premiumSince;

        const isBoostingNow = Boolean(newStatus);
        const wasBoostingBefore = Boolean(oldStatus);
        const isNewBoost = !wasBoostingBefore && isBoostingNow;
        const missingBoosterRole = isBoostingNow && !newMember.roles.cache.has(BOOSTER_ROLE_ID);

        if (DEBUG) {
            console.log(
                `[BOOST] guildMemberUpdate user=${newMember.user?.tag || newMember.id} ` +
                `oldPremium=${oldStatus ? 'yes' : 'no'} newPremium=${newStatus ? 'yes' : 'no'} ` +
                `isNewBoost=${isNewBoost} missingRole=${missingBoosterRole}`
            );
        }

        // If they are not boosting, nothing to do.
        if (!isBoostingNow) return;

        // Main path: they just boosted OR we detected they are boosting but don't have the role.
        if (isNewBoost || missingBoosterRole) {
            try {
                // 1. إعطاء الرتبة
                if (!newMember.roles.cache.has(BOOSTER_ROLE_ID)) {
                    await newMember.roles.add(BOOSTER_ROLE_ID).catch(err => console.error('Error adding booster role:', err));
                    if (DEBUG) console.log('[BOOST] booster role add attempted');
                }

                // 2. إرسال الإشعار في القناة المحددة
                const settings = await ModSettings.findOne({ guildId: guild.id });
                if (isNewBoost && settings && settings.boosterChannelId) {
                    const channel = await guild.channels.fetch(settings.boosterChannelId).catch(() => null);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#ff73fa')
                            .setTitle('💎 New Server Booster!')
                            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true }))
                            .setDescription(`Thank you ${newMember} for boosting the server! 💖\nYou have automatically received the <@&${BOOSTER_ROLE_ID}> role.`)
                            .setImage('https://i.giphy.com/media/v1.Y2lkPTc5MGI3NjExNHJndXpueXF4ZzR6NHJndXpueXF4ZzR6NHJndXpueXF4ZzR6JmVwPXYxX2ludGVybmFsX2dpZl9ieV9pZCZjdD1n/3o7TKVUn7iM8FMEU24/giphy.gif')
                            .setTimestamp();

                        await channel.send({ content: `${newMember}`, embeds: [embed] }).catch(err => console.error('Error sending booster message:', err));
                    }
                } else if (DEBUG && !isNewBoost) {
                    console.log('[BOOST] no announcement sent (not a new boost event)');
                }
            } catch (error) {
                console.error('Error in guildMemberUpdate (Booster Logic):', error);
            }
        }
    }
};

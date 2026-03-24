const { EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');

const BOOSTER_ROLE_ID = '1482180640291029052';

 const GIRLS_ROLE_ID = '1480220142213267476';
 const GIRLS_WELCOME_MESSAGES = {
     '1471217893936074762': '**Welcome to the main girls chat <@{userId}>, enjoy your stay ˚🎀༘⋆**',
     '1480355583117885573': "**Welcome to girls discussions <@{userId}>, let's talk ˚🎀༘⋆**",
     '1480356130663432353': '**Welcome to the selfie zone <@{userId}>, show us your glow ˚🎀༘⋆**',
     '1480356614400770068': '**Welcome to girls tips <@{userId}>, share your magic ˚🎀༘⋆**',
     '1480356879396896882': '**Welcome to our secrets chat <@{userId}>, your secrets are safe here ˚🎀༘⋆**'
 };

module.exports = {
    name: 'guildMemberUpdate',
    async execute(oldMember, newMember) {
        const guild = newMember.guild;
        const DEBUG = process.env.BOOST_DEBUG === '1';

         // Girls role-based welcome system (trigger only when the role is added)
         try {
             const hadGirlsRoleBefore = oldMember?.roles?.cache?.has(GIRLS_ROLE_ID);
             const hasGirlsRoleNow = newMember?.roles?.cache?.has(GIRLS_ROLE_ID);

             if (!hadGirlsRoleBefore && hasGirlsRoleNow) {
                 const userId = newMember.id;
                 for (const [channelId, template] of Object.entries(GIRLS_WELCOME_MESSAGES)) {
                     try {
                         const channel = guild.channels.cache.get(channelId) || await guild.channels.fetch(channelId).catch(() => null);
                         if (!channel || !channel.isTextBased()) continue;
                         const message = template.replace('{userId}', userId);
                         await channel.send(message);
                     } catch (err) {
                         console.error(`[Girls Welcome] Failed to send welcome message in channel ${channelId}:`, err);
                     }
                 }
             }
         } catch (err) {
             console.error('[Girls Welcome] Unexpected error in girls welcome system:', err);
         }

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

const { EmbedBuilder } = require('discord.js');
const ModSettings = require('../../models/ModSettings');
const mongoose = require('mongoose');
const boostSettingsStore = require('../../services/boostSettingsStore');
const NicknameLock = require('../../models/NicknameLock');

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

        // --- ▫ Nickname Lock Enforcement ---
        try {
            const oldNick = oldMember?.nickname ?? null;
            const newNick = newMember?.nickname ?? null;

            if (oldNick !== newNick && mongoose.connection?.readyState === 1) {
                const lock = await NicknameLock.findOne({ guildId: guild.id, userId: newMember.id }).catch(() => null);
                if (lock?.locked) {
                    const lockedNick = lock.nickname ?? null;
                    if ((newNick ?? null) !== (lockedNick ?? null)) {
                        if (newMember.manageable) {
                            await newMember.setNickname(lockedNick, 'Nickname lock enforcement').catch(() => null);
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[NICK_LOCK] Enforcement error:', e);
        }

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

        // Boost tracking
        const oldPremiumSince = oldMember.premiumSince;
        const newPremiumSince = newMember.premiumSince;

        const premiumSinceTransition = !oldPremiumSince && !!newPremiumSince;

        let oldCount = await boostSettingsStore.getLastPremiumSubscriptionCount(guild.id);
        const currentCount = typeof guild.premiumSubscriptionCount === 'number' ? guild.premiumSubscriptionCount : null;

        if (oldCount === null && mongoose.connection?.readyState === 1) {
            const mongoSettings = await ModSettings.findOne({ guildId: guild.id }).catch(() => null);
            if (mongoSettings && typeof mongoSettings.lastPremiumSubscriptionCount === 'number') {
                oldCount = mongoSettings.lastPremiumSubscriptionCount;
            }
        }

        const countIncreased = typeof oldCount === 'number' && typeof currentCount === 'number' && currentCount > oldCount;
        const isBoostDetected = premiumSinceTransition || countIncreased;

        if (DEBUG) {
            console.log(
                `[BOOST] guildMemberUpdate user=${newMember.user?.tag || newMember.id} ` +
                `oldPremium=${oldPremiumSince ? 'yes' : 'no'} newPremium=${newPremiumSince ? 'yes' : 'no'} ` +
                `transition=${premiumSinceTransition} oldCount=${oldCount} currentCount=${currentCount} increased=${countIncreased}`
            );
        }

        if (!isBoostDetected) {
            if (typeof currentCount === 'number') {
                await boostSettingsStore.setLastPremiumSubscriptionCount(guild.id, currentCount);
                if (mongoose.connection?.readyState === 1) {
                    await ModSettings.updateOne(
                        { guildId: guild.id },
                        { $setOnInsert: { guildId: guild.id }, $set: { lastPremiumSubscriptionCount: currentCount } },
                        { upsert: true }
                    ).catch(() => null);
                }
            }
            return;
        }

        try {
            let boostChannelId = await boostSettingsStore.getBoosterChannelId(guild.id);
            if (!boostChannelId && mongoose.connection?.readyState === 1) {
                const settings = await ModSettings.findOne({ guildId: guild.id }).catch(() => null);
                boostChannelId = settings?.boosterChannelId || null;
                if (boostChannelId) {
                    await boostSettingsStore.setBoosterChannelId(guild.id, boostChannelId);
                }
            }

            if (!newMember.roles.cache.has(BOOSTER_ROLE_ID)) {
                await newMember.roles.add(BOOSTER_ROLE_ID).catch(() => null);
            }

            if (!boostChannelId) return;

            const channel = await guild.channels.fetch(boostChannelId).catch(() => null);
            if (!channel || !channel.isTextBased()) return;

            const memberId = newMember.id;

            await channel.send({ content: `**✓ <@${memberId}> just boosted the server!**` });

            const embed = new EmbedBuilder()
                .setColor('#000000')
                .setTitle('**❖ New Server Boost**')
                .setDescription(`**⤿ Thank you <@${memberId}> for supporting ELORA.**\n**▫️ The server now has ${guild.premiumSubscriptionCount || 0} total boosts.**`)
                .setThumbnail(newMember.user.displayAvatarURL({ size: 256 }))
                .setTimestamp();

            await channel.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error in guildMemberUpdate (Boost Tracking):', error);
        } finally {
            if (typeof currentCount === 'number') {
                await boostSettingsStore.setLastPremiumSubscriptionCount(guild.id, currentCount);
                if (mongoose.connection?.readyState === 1) {
                    await ModSettings.updateOne(
                        { guildId: guild.id },
                        { $setOnInsert: { guildId: guild.id }, $set: { lastPremiumSubscriptionCount: currentCount } },
                        { upsert: true }
                    ).catch(() => null);
                }
            }
        }
    }
};

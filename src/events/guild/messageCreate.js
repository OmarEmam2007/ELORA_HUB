const User = require('../../models/User');
const CustomReply = require('../../models/CustomReply');
const { handlePrefixCommand } = require('../../handlers/prefixCommandHandler');

module.exports = {
    name: 'messageCreate',
    async execute(message, client) {
        if (message.author.bot || !message.guild) return;

        // --- Custom Auto-Replies ---
        try {
            const customReplies = await CustomReply.find({ guildId: message.guild.id, enabled: true }).catch(() => []);
            const triggerText = message.content.trim().toLowerCase();

            for (const cr of customReplies) {
                const trigger = cr.trigger.toLowerCase();
                let isMatch = false;

                if (cr.matchType === 'startsWith') {
                    isMatch = triggerText.startsWith(trigger);
                } else {
                    isMatch = triggerText === trigger;
                }

                if (isMatch) {
                    return await message.reply(cr.reply);
                }
            }
        } catch (e) {
            console.error('[CUSTOM REPLIES] Error:', e);
        }

        // --- Chat Leveling System (XP) ---
        try {
            const now = Date.now();
            let profile = await User.findOne({ userId: message.author.id, guildId: message.guild.id }).catch(() => null);
            if (!profile) {
                profile = new User({ userId: message.author.id, guildId: message.guild.id });
            }

            const lastXP = profile.lastMessageTimestamp || 0;
            if (now - lastXP > 60000) {
                const xpGain = Math.floor(Math.random() * 10) + 15;
                profile.xp = (profile.xp || 0) + xpGain;
                profile.lastMessageTimestamp = now;

                let needed = (profile.level || 1) * 100;
                if (profile.xp >= needed) {
                    profile.xp -= needed;
                    profile.level = (profile.level || 1) + 1;
                }
                await profile.save().catch(() => {});
            }
        } catch (e) {
            console.error('[LEVELING] Error:', e);
        }

        // --- Prefix Commands (after filters/systems) ---
        try {
            if (typeof handlePrefixCommand === 'function') {
                const wasCommand = await handlePrefixCommand(message, client);
                if (wasCommand) return;
            }
        } catch (e) {
            console.error('[PREFIX] Error:', e);
        }

        // --- Mention Response ---
        let isReplyToBot = false;
        if (message.reference?.messageId) {
            try {
                const refMsg = await message.channel.messages.fetch(message.reference.messageId).catch(() => null);
                isReplyToBot = Boolean(refMsg && refMsg.author?.id === client.user.id);
            } catch (_) {
                isReplyToBot = false;
            }
        }

        const botMentioned = Boolean(message.mentions?.users?.has(client.user.id)) || isReplyToBot;

        if (botMentioned && !message.author.bot) {
            const cleanContent = String(message.content || '').replace(/<@!?\d+>/g, '').trim().toLowerCase();   

            if (cleanContent.includes('i love you') || cleanContent.includes('love you') || cleanContent.includes('بحبك')) {
                return await message.reply('بحبك أكتر يا قلبي ❤️');
            }


            if (cleanContent.includes('you want hazem or mohamed ?') || cleanContent.includes('you want hazem or mohamed ?') || cleanContent.includes('عايزه حازم ولا محمد ؟')) {
                return await message.reply('ولا حازم ولا محمد انا عايزاه انت يا عمر, مش ناوي بقا ولا ايهه انا زهقت اويي 😩🤍');
            }

            if (cleanContent.includes('هي البيضة الاول ولا الفرخه ؟') || cleanContent.includes('هي البيضة الاول ولا الفرخه') || cleanContent.includes('هي البيضة الاول ولا الفرخه ؟')) {
                return await message.reply('السكس الاول');
            }
        }

    }
};




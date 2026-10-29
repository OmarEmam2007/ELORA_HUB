const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const levelingService = require('../../services/levelingService');

async function replyRank(ctx, targetUser) {
    const guild = ctx.guild;
    if (!guild) {
        const payload = { content: 'Rank cards are only available in servers.', ephemeral: true };
        if (ctx.reply) return ctx.reply(payload);
        return;
    }

    const member = await guild.members.fetch(targetUser.id).catch(() => null);
    const doc = await levelingService.getOrCreateLevel(targetUser.id, guild.id);
    const required = levelingService.xpForNext(doc.level);
    const rank = await levelingService.getRankPosition(targetUser.id, guild.id);

    let files = [];
    try {
        const card = await levelingService.buildUserRankCard(member || targetUser, guild, doc);
        files = [card];
    } catch (e) {
        console.error('[RANK] Card render failed:', e);
        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.ACCENT)
            .setTitle(`${member?.displayName || targetUser.username}`)
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setDescription(
                `**Rank** #${rank || '?'}\n**Level** ${doc.level}\n**XP** ${doc.xp} / ${required}`
            )
            .setFooter(THEME.FOOTER)
            .setTimestamp();
        return ctx.reply({ embeds: [embed] });
    }

    return ctx.reply({ files });
}

module.exports = {
    name: 'rank',
    aliases: ['rankcard', 'xp'],
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('Show a member\'s rank card and XP progress')
        .addUserOption((option) =>
            option.setName('user').setDescription('Member to inspect').setRequired(false)
        ),

    async execute(first, second, third) {
        try {
            if (first?.isChatInputCommand?.()) {
                const interaction = first;
                const target = interaction.options.getUser('user') || interaction.user;
                const ctx = {
                    guild: interaction.guild,
                    reply: (payload) => {
                        if (interaction.deferred || interaction.replied) {
                            return interaction.followUp(payload);
                        }
                        return interaction.reply(payload);
                    }
                };
                return replyRank(ctx, target);
            }

            const message = first;
            const args = Array.isArray(second) ? second : third;
            const mention = message.mentions?.users?.first?.();
            const raw = args?.[0];
            let target = mention || message.author;
            if (!mention && raw) {
                const id = String(raw).replace(/[<@!>]/g, '');
                target = await message.client.users.fetch(id).catch(() => message.author);
            }
            const ctx = {
                guild: message.guild,
                reply: (payload) => message.reply(payload)
            };
            return replyRank(ctx, target);
        } catch (e) {
            console.error('[RANK] Command failed:', e);
            try {
                if (first?.isChatInputCommand?.()) {
                    const payload = { content: 'Failed to generate rank card.', ephemeral: true };
                    if (first.replied || first.deferred) return first.followUp(payload);
                    return first.reply(payload);
                }
                return first.reply('Failed to generate rank card.');
            } catch (_) {}
        }
    }
};

const { PermissionsBitField, EmbedBuilder } = require('discord.js');
const DhikrProfile = require('../../models/DhikrProfile');
const THEME = require('../../utils/theme');

const ROLE_GOLD = '1499002581618397214';
const ROLE_SILVER = '1499003195412844704';
const ROLE_BRONZE = '1499003503606108230';

module.exports = {
    name: 'اذكار_award',
    aliases: ['azkar_award', 'adhkar_award', 'dhikr_award'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const hasAdmin = Boolean(message.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
        if (!hasAdmin) return;

        const guild = message.guild;

        const top = await DhikrProfile.find({ guildId: guild.id })
            .sort({ pointsWeekly: -1, pointsTotal: -1 })
            .limit(3)
            .catch(() => []);

        const roleIds = [ROLE_GOLD, ROLE_SILVER, ROLE_BRONZE];

        const roles = {
            gold: guild.roles.cache.get(ROLE_GOLD) || (await guild.roles.fetch(ROLE_GOLD).catch(() => null)),
            silver: guild.roles.cache.get(ROLE_SILVER) || (await guild.roles.fetch(ROLE_SILVER).catch(() => null)),
            bronze: guild.roles.cache.get(ROLE_BRONZE) || (await guild.roles.fetch(ROLE_BRONZE).catch(() => null))
        };

        const allWinnersRoleIds = roleIds.filter(Boolean);
        const members = await guild.members.fetch().catch(() => null);

        if (members) {
            for (const m of members.values()) {
                const remove = allWinnersRoleIds.filter((id) => m.roles.cache.has(id));
                if (remove.length) await m.roles.remove(remove).catch(() => { });
            }
        }

        const winnerMentions = [];
        for (let i = 0; i < top.length; i++) {
            const row = top[i];
            const member = await guild.members.fetch(row.userId).catch(() => null);
            if (!member) continue;

            const roleId = roleIds[i];
            if (roleId) await member.roles.add(roleId).catch(() => { });
            winnerMentions.push(`<@${member.id}>`);
        }

        await DhikrProfile.updateMany(
            { guildId: guild.id },
            { $set: { pointsWeekly: 0, lastUpdatedAt: new Date() } }
        ).catch(() => { });

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.SUCCESS)
            .setTitle('تم توزيع رولات الذاكرين الأسبوعية')
            .setDescription(winnerMentions.length ? winnerMentions.join('\n') : 'لا يوجد فائزون هذا الأسبوع.')
            .setFooter({ text: THEME.FOOTER.text, iconURL: THEME.FOOTER.iconURL })
            .setTimestamp();

        await message.reply({ embeds: [embed] }).catch(() => { });
    }
};

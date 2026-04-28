const JailRecord = require('../../models/JailRecord');

const JAILED_ROLE_ID = '1498649099644178532';

async function unjailMember(guild, userId, opts = {}) {
    const reason = opts.reason || 'Unjail';

    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) return { ok: false, code: 'MEMBER_NOT_FOUND' };

    const record = await JailRecord.findOne({ guildId: guild.id, userId, active: true }).catch(() => null);

    // Remove jailed role
    if (member.roles.cache.has(JAILED_ROLE_ID)) {
        await member.roles.remove(JAILED_ROLE_ID, reason).catch(() => { });
    }

    // Restore roles (best-effort)
    const rolesToRestore = (record?.roles || []).filter((id) => id && id !== guild.roles.everyone.id && id !== JAILED_ROLE_ID);
    if (rolesToRestore.length) {
        await member.roles.add(rolesToRestore, reason).catch(() => { });
    }

    if (record) {
        record.active = false;
        await record.save().catch(() => { });
    }

    return { ok: true };
}

module.exports = {
    name: 'unjail',
    aliases: ['اعفاء'],

    async execute(message, client, args) {
        if (!message.guild) return;

        const me = message.guild.members.me;
        if (!me?.permissions?.has?.('ManageRoles')) {
            return message.reply('❌ Missing permission: Manage Roles.').catch(() => { });
        }

        if (!message.member?.permissions?.has?.('ManageRoles')) {
            return message.reply('❌ لازم تكون عندك صلاحية Manage Roles.').catch(() => { });
        }

        const target = message.mentions?.members?.first?.();
        if (!target) return message.reply('❌ منشن الشخص.').catch(() => { });

        const res = await unjailMember(message.guild, target.id, { reason: `Unjail by ${message.author.tag}` });
        if (!res.ok) {
            return message.reply('❌ مش لاقي العضو.').catch(() => { });
        }

        return message.reply(`✅ تم إعفاء ${target}.`).catch(() => { });
    },

    __unjailMemberById: unjailMember,
};

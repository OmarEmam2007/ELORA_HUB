const JailRecord = require('../../models/JailRecord');

const JAIL_CHANNEL_ID = '1498649057898401822';
const JAILED_ROLE_ID = '1498649099644178532';

function parseDurationMs(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return null;

    const parts = raw.match(/(\d+(?:\.\d+)?)(s|sec|secs|second|seconds|m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|week|weeks)/g);
    if (!parts) return null;

    let ms = 0;
    for (const token of parts) {
        const m = token.match(/^(\d+(?:\.\d+)?)([a-z]+)$/);
        if (!m) continue;
        const n = Number(m[1]);
        if (!Number.isFinite(n) || n <= 0) continue;
        const u = m[2];

        if (u === 's' || u === 'sec' || u === 'secs' || u === 'second' || u === 'seconds') ms += n * 1000;
        else if (u === 'm' || u === 'min' || u === 'mins' || u === 'minute' || u === 'minutes') ms += n * 60 * 1000;
        else if (u === 'h' || u === 'hr' || u === 'hrs' || u === 'hour' || u === 'hours') ms += n * 60 * 60 * 1000;
        else if (u === 'd' || u === 'day' || u === 'days') ms += n * 24 * 60 * 60 * 1000;
        else if (u === 'w' || u === 'week' || u === 'weeks') ms += n * 7 * 24 * 60 * 60 * 1000;
    }

    if (!ms) return null;
    return Math.floor(ms);
}

async function ensureJailPermissions(guild) {
    const role = guild.roles.cache.get(JAILED_ROLE_ID) || (await guild.roles.fetch(JAILED_ROLE_ID).catch(() => null));
    const jailChannel = guild.channels.cache.get(JAIL_CHANNEL_ID) || (await guild.channels.fetch(JAIL_CHANNEL_ID).catch(() => null));
    if (!role || !jailChannel) return;

    const channels = Array.from(guild.channels.cache.values());
    for (const ch of channels) {
        try {
            if (!ch || !ch.permissionOverwrites) continue;
            if (ch.id === JAIL_CHANNEL_ID) {
                await ch.permissionOverwrites.edit(role.id, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true,
                    Connect: true,
                    Speak: true
                }).catch(() => { });

                await ch.permissionOverwrites.edit(guild.roles.everyone.id, {
                    ViewChannel: false
                }).catch(() => { });
            } else {
                await ch.permissionOverwrites.edit(role.id, {
                    ViewChannel: false,
                    SendMessages: false,
                    ReadMessageHistory: false,
                    Connect: false,
                    Speak: false
                }).catch(() => { });
            }
        } catch (_) {
        }
    }
}

async function applyJail({ message, member, durationMs }) {
    const guild = message.guild;
    const jailedRole = guild.roles.cache.get(JAILED_ROLE_ID) || (await guild.roles.fetch(JAILED_ROLE_ID).catch(() => null));
    if (!jailedRole) throw new Error('Missing jailed role');

    await ensureJailPermissions(guild);

    const rolesToStore = member.roles.cache
        .filter((r) => r.id !== guild.roles.everyone.id)
        .map((r) => r.id);

    const releaseAt = durationMs ? new Date(Date.now() + durationMs) : null;

    await JailRecord.findOneAndUpdate(
        { guildId: guild.id, userId: member.id, active: true },
        {
            $set: {
                roles: rolesToStore,
                jailedAt: new Date(),
                releaseAt,
                active: true
            }
        },
        { upsert: true, new: true }
    ).catch(() => null);

    const toRemove = rolesToStore.filter((id) => id !== JAILED_ROLE_ID);
    if (toRemove.length) {
        await member.roles.remove(toRemove, `Jail by ${message.author.tag}`).catch(() => { });
    }

    if (!member.roles.cache.has(JAILED_ROLE_ID)) {
        await member.roles.add(JAILED_ROLE_ID, `Jail by ${message.author.tag}`).catch(() => { });
    }

    return { releaseAt };
}

module.exports = {
    name: 'jail',
    aliases: ['سجن'],
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

        if (target.id === message.author.id) return message.reply('❌ مينفعش تسجن نفسك.').catch(() => { });

        const rawDuration = args.find((a) => /\d/.test(String(a)));
        const durationMs = rawDuration ? parseDurationMs(rawDuration) : null;

        try {
            const { releaseAt } = await applyJail({ message, member: target, durationMs });

            if (durationMs && releaseAt) {
                setTimeout(async () => {
                    try {
                        const Unjail = require('./unjail');
                        await Unjail.__unjailMemberById?.(message.guild, target.id, { reason: 'Auto unjail (timer)' });
                    } catch (_) {
                    }
                }, Math.min(durationMs, 2_147_000_000)).unref?.();
            }

            const jailChannel = message.guild.channels.cache.get(JAIL_CHANNEL_ID);
            return message.reply(`✅ تم سجن ${target} ${jailChannel ? `في ${jailChannel}` : ''}${releaseAt ? ` لحد ${releaseAt.toLocaleString()}` : ''}`).catch(() => { });
        } catch (e) {
            return message.reply('❌ حصل خطأ أثناء السجن.').catch(() => { });
        }
    },
};

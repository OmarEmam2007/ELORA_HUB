const giveawayService = require('../../services/giveawayService');

module.exports = {
    name: 'gwy',
    aliases: ['giveaway'],
    async execute(message, client, args) {
        try {
            const sub = String(args?.[0] || '').toLowerCase();

            if (sub !== 'invite' && sub !== 'invites') {
                await message.reply(giveawayService.boldAll('▫️ Usage: .gwy invite @user')).catch(() => { });
                return;
            }

            const member = message.member;
            if (!giveawayService?.boldAll || !member?.permissions) {
                await message.reply(giveawayService.boldAll('▫️ Missing permissions context.')).catch(() => { });
                return;
            }

            const isStaff = member.permissions.has('Administrator') || member.permissions.has('ManageGuild');
            if (!isStaff) {
                await message.reply(giveawayService.boldAll('▫️ You do not have permission to use this.')).catch(() => { });
                return;
            }

            const active = giveawayService.getActiveGiveaway();
            if (!active) {
                await message.reply(giveawayService.boldAll('▫️ No active giveaway.')).catch(() => { });
                return;
            }

            const target = message.mentions.users.first();
            if (!target) {
                await message.reply(giveawayService.boldAll('▫️ Please mention a user.')).catch(() => { });
                return;
            }

            const count = giveawayService.getUserInvitesForActive(target.id);
            await message.reply(giveawayService.boldAll(`▫️ Valid Invites For ${target}: ${count}`)).catch(() => { });
        } catch (_) {
            // ignore
        }
    }
};

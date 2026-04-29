const { PermissionsBitField } = require('discord.js');
const dhikrService = require('../../services/dhikrService');

const DHIKR_CHANNEL_ID = '1498787130250625065';

module.exports = {
    name: 'اذكار_setup',
    aliases: ['azkar_setup', 'dhikr_setup', 'اذكارsetup', 'azkar-setup'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const hasAdmin = Boolean(message.member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
        if (!hasAdmin) return;

        const goalRaw = String(args?.[0] || '').replace(/[^0-9]/g, '');
        const goal = goalRaw ? Number(goalRaw) : 10000;

        const ch = await message.client.channels.fetch(DHIKR_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased?.()) {
            await message.reply('❌ Dhikr channel not found.').catch(() => { });
            return;
        }

        await dhikrService.ensureGlobalMessage({ channel: ch, goal }).catch((e) => {
            console.error('[DHIKR_SETUP] Failed:', e);
        });

        if (message.deletable) await message.delete().catch(() => { });
    }
};

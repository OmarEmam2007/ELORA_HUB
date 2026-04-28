const { PermissionsBitField, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

module.exports = {
    name: 'color_setup',
    aliases: ['colorsetup'],

    async execute(message, client, args) {
        if (!message?.guild) return;

        const member = message.member;
        const hasAdmin = Boolean(member?.permissions?.has?.(PermissionsBitField.Flags.Administrator));
        if (!hasAdmin) {
            await message.reply({ content: '❌ You do not have permission to use this command.' }).catch(() => { });
            return;
        }

        let channel = message.channel;

        const raw = String(args?.[0] || '').trim();
        const mentioned = message.mentions?.channels?.first?.() || null;
        if (mentioned && mentioned.isTextBased?.()) {
            channel = mentioned;
        } else if (raw) {
            const id = raw.replace(/[^0-9]/g, '');
            if (id) {
                const fetched = await message.client.channels.fetch(id).catch(() => null);
                if (fetched && fetched.isTextBased?.()) channel = fetched;
            }
        }

        const bannerName = 'new banner1.png';
        const bannerCandidates = [
            path.join(__dirname, '../../assets', bannerName),
            path.join(__dirname, '../../../assets', bannerName),
            path.join(process.cwd(), 'assets', bannerName),
            path.join(process.cwd(), 'src', 'assets', bannerName),
            path.join(process.cwd(), 'ELORA NEW THEME', bannerName)
        ];
        const bannerPath = bannerCandidates.find(p => {
            try { return fs.existsSync(p); } catch (_) { return false; }
        }) || bannerCandidates[0];

        const banner = new AttachmentBuilder(bannerPath, { name: bannerName });

        const solidMenu = new StringSelectMenuBuilder()
            .setCustomId('role_color_select')
            .setPlaceholder('✦ SELECT YOUR COLOR')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: '⬛ Black', value: 'black' },
                { label: '⬜ White', value: 'white' },
                { label: '🟥 Bloody Red', value: 'bloody_red' },
                { label: '🟪 Purple', value: 'purple' },
                { label: '🩷 Pink', value: 'pink' },
                { label: '🩷🟥 Rose Pink', value: 'rose_pink' }
            );

        const gradientMenu = new StringSelectMenuBuilder()
            .setCustomId('role_gradient_select')
            .setPlaceholder('✦ SELECT YOUR GRADIENT')
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: '🩷🟪 Margo', value: 'margo' },
                { label: '🟫⬛ Expresso', value: 'expresso' },
                { label: '🟥🟪 Pure Lust', value: 'pure_lust' },
                { label: '🩷⬜ Delicate', value: 'delicate' },
                { label: '🟪🩷 Mauve', value: 'mauve' },
                { label: '🟦⬛ Deep Space', value: 'deep_space' }
            );

        const row1 = new ActionRowBuilder().addComponents(solidMenu);
        const row2 = new ActionRowBuilder().addComponents(gradientMenu);

        await channel.send({ content: ' ', files: [banner] }).catch(() => { });
        await channel.send({ components: [row1, row2] }).catch(() => { });

        if (message.deletable) {
            await message.delete().catch(() => { });
        }
    }
};

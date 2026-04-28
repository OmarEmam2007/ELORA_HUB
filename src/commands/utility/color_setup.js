const { PermissionsBitField, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { createCanvas } = require('@napi-rs/canvas');

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

        const toSmallCaps = (input) => {
            const map = {
                a: 'ᴀ', b: 'ʙ', c: 'ᴄ', d: 'ᴅ', e: 'ᴇ', f: 'ꜰ', g: 'ɢ', h: 'ʜ', i: 'ɪ', j: 'ᴊ', k: 'ᴋ', l: 'ʟ', m: 'ᴍ',
                n: 'ɴ', o: 'ᴏ', p: 'ᴘ', q: 'ǫ', r: 'ʀ', s: 'ꜱ', t: 'ᴛ', u: 'ᴜ', v: 'ᴠ', w: 'ᴡ', x: 'x', y: 'ʏ', z: 'ᴢ'
            };
            return String(input || '').split('').map((ch) => {
                const lower = ch.toLowerCase();
                return map[lower] || ch;
            }).join('');
        };

        const SOLID = [
            { key: 'black', name: 'Black', hex: '#121111' },
            { key: 'white', name: 'White', hex: '#ffffff' },
            { key: 'bloody_red', name: 'Bloody Red', hex: '#a30f0f' },
            { key: 'purple', name: 'Purple', hex: '#9043d8' },
            { key: 'pink', name: 'Pink', hex: '#cd1a98' },
            { key: 'rose_pink', name: 'Rose Pink', hex: '#ff66cc' }
        ];

        const GRADIENT = [
            { key: 'pure_lust', name: 'Pure Lust', a: '#333333', b: '#dd1818' },
            { key: 'deep_space', name: 'Deep Space', a: '#000000', b: '#434343' },
            { key: 'mauve', name: 'Mauve', a: '#42275a', b: '#734b6d' },
            { key: 'delicate', name: 'Delicate', a: '#d3cce3', b: '#e9e4f0' },
            { key: 'expresso', name: 'Expresso', a: '#ad5389', b: '#3c1053' },
            { key: 'margo', name: 'Margo', a: '#ffefba', b: '#ffffff' }
        ];

        const paletteW = 1100;
        const paletteH = 520;
        const canvas = createCanvas(paletteW, paletteH);
        const ctx = canvas.getContext('2d');

        ctx.fillStyle = '#0b0b0f';
        ctx.fillRect(0, 0, paletteW, paletteH);
        ctx.textBaseline = 'middle';

        const roundRect = (x, y, w, h, r) => {
            const rr = Math.max(0, Math.min(r, Math.floor(Math.min(w, h) / 2)));
            ctx.beginPath();
            ctx.moveTo(x + rr, y);
            ctx.arcTo(x + w, y, x + w, y + h, rr);
            ctx.arcTo(x + w, y + h, x, y + h, rr);
            ctx.arcTo(x, y + h, x, y, rr);
            ctx.arcTo(x, y, x + w, y, rr);
            ctx.closePath();
        };

        const drawTitle = (text, x, y) => {
            ctx.save();
            ctx.font = '700 22px Sans';
            ctx.fillStyle = 'rgba(255,255,255,0.92)';
            ctx.fillText(String(text), x, y);
            ctx.restore();
        };

        const drawSwatch = ({ x, y, label, fill }) => {
            const w = 480;
            const h = 58;
            const r = 16;
            const pad = 12;

            ctx.save();
            roundRect(x, y, w, h, r);
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fill();
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.10)';
            ctx.stroke();
            ctx.restore();

            const box = 36;
            const bx = x + pad;
            const by = y + Math.floor((h - box) / 2);
            ctx.save();
            roundRect(bx, by, box, box, 10);
            ctx.fillStyle = fill;
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgba(255,255,255,0.14)';
            ctx.stroke();
            ctx.restore();

            ctx.save();
            ctx.font = '650 18px Sans';
            ctx.fillStyle = 'rgba(255,255,255,0.86)';
            ctx.fillText(String(label), bx + box + 14, y + Math.floor(h / 2));
            ctx.restore();
        };

        const leftX = 56;
        const rightX = 56 + 520;
        const titleY = 50;
        const startY = 78;
        const gapY = 68;

        drawTitle('Solid Colors', leftX, titleY);
        drawTitle('Gradient Colors', rightX, titleY);

        for (let i = 0; i < SOLID.length; i++) {
            const c = SOLID[i];
            const y = startY + i * gapY;
            drawSwatch({ x: leftX, y, label: c.name, fill: c.hex });
        }

        for (let i = 0; i < GRADIENT.length; i++) {
            const g = GRADIENT[i];
            const y = startY + i * gapY;
            const grad = ctx.createLinearGradient(rightX, y, rightX + 480, y + 58);
            grad.addColorStop(0, g.a);
            grad.addColorStop(1, g.b);
            drawSwatch({ x: rightX, y, label: g.name, fill: grad });
        }

        const paletteFile = new AttachmentBuilder(canvas.toBuffer('image/png'), { name: 'colors-palette.png' });

        const solidMenu = new StringSelectMenuBuilder()
            .setCustomId('role_color_select')
            .setPlaceholder(`✦ ${toSmallCaps('select your color')}`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: toSmallCaps('Black'), value: 'black' },
                { label: toSmallCaps('White'), value: 'white' },
                { label: toSmallCaps('Bloody Red'), value: 'bloody_red' },
                { label: toSmallCaps('Purple'), value: 'purple' },
                { label: toSmallCaps('Pink'), value: 'pink' },
                { label: toSmallCaps('Rose Pink'), value: 'rose_pink' }
            );

        const gradientMenu = new StringSelectMenuBuilder()
            .setCustomId('role_gradient_select')
            .setPlaceholder(`✦ ${toSmallCaps('select your gradient')}`)
            .setMinValues(1)
            .setMaxValues(1)
            .addOptions(
                { label: toSmallCaps('Margo'), value: 'margo' },
                { label: toSmallCaps('Expresso'), value: 'expresso' },
                { label: toSmallCaps('Pure Lust'), value: 'pure_lust' },
                { label: toSmallCaps('Delicate'), value: 'delicate' },
                { label: toSmallCaps('Mauve'), value: 'mauve' },
                { label: toSmallCaps('Deep Space'), value: 'deep_space' }
            );

        const row1 = new ActionRowBuilder().addComponents(solidMenu);
        const row2 = new ActionRowBuilder().addComponents(gradientMenu);

        await channel.send({ content: ' ', files: [paletteFile], components: [row1, row2] }).catch(() => { });

        if (message.deletable) {
            await message.delete().catch(() => { });
        }
    }
};

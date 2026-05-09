const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    AttachmentBuilder
} = require('discord.js');

const THEME = require('../../utils/theme');
const { createCanvas } = require('@napi-rs/canvas');

const CHOICES = {
    rock: { label: 'Rock', beats: 'scissors' },
    paper: { label: 'Paper', beats: 'rock' },
    scissors: { label: 'Scissors', beats: 'paper' }
};

const activeByUser = new Map();

function pickBotChoice() {
    const keys = Object.keys(CHOICES);
    return keys[Math.floor(Math.random() * keys.length)];
}

function decide(player, bot) {
    if (player === bot) return 'draw';
    if (CHOICES[player]?.beats === bot) return 'win';
    return 'lose';
}

function buildStartEmbed(user) {
    return new EmbedBuilder()
        .setColor(THEME.COLORS.ACCENT)
        .setTitle('▤ Rock Paper Scissors')
        .setDescription(`Choose your move, ${user}...`)
        .setFooter(THEME.FOOTER)
        .setTimestamp();
}

function buildResultEmbed(user, player, bot, result) {
    const title = result === 'win' ? '▤ You Win' : result === 'lose' ? '▤ You Lose' : '▤ Draw';
    const desc = [`**${user}**: ${CHOICES[player]?.label || player}`, `**ELORA**: ${CHOICES[bot]?.label || bot}`].join('\n');

    return new EmbedBuilder()
        .setColor(result === 'win' ? THEME.COLORS.SUCCESS : result === 'lose' ? THEME.COLORS.ERROR : THEME.COLORS.ACCENT)
        .setTitle(title)
        .setDescription(desc)
        .setFooter(THEME.FOOTER)
        .setTimestamp();
}

function buildButtons(disabled = false) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('rps:rock').setLabel('Rock').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('rps:paper').setLabel('Paper').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('rps:scissors').setLabel('Scissors').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
            new ButtonBuilder().setCustomId('rps:cancel').setLabel('Cancel').setStyle(ButtonStyle.Danger).setDisabled(disabled)
        )
    ];
}

function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    if (h.length !== 6) return { r: 0, g: 0, b: 0 };
    const n = parseInt(h, 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgba(hex, a) {
    const { r, g, b } = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

function roundedRect(ctx, x, y, w, h, r) {
    const radius = Math.max(0, Math.min(r, Math.min(w, h) / 2));
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
}

function drawCard(ctx, x, y, w, h, label, accent, side) {
    ctx.save();

    const shadowX = side === 'left' ? -10 : 10;
    ctx.shadowColor = 'rgba(0,0,0,0.55)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = shadowX;
    ctx.shadowOffsetY = 18;

    roundedRect(ctx, x, y, w, h, 26);
    const bg = ctx.createLinearGradient(x, y, x + w, y + h);
    bg.addColorStop(0, 'rgba(18,20,26,0.96)');
    bg.addColorStop(1, 'rgba(10,11,14,0.98)');
    ctx.fillStyle = bg;
    ctx.fill();

    ctx.shadowColor = 'transparent';

    ctx.lineWidth = 2;
    const stroke = ctx.createLinearGradient(x, y, x + w, y);
    stroke.addColorStop(0, rgba(accent, 0.35));
    stroke.addColorStop(0.5, rgba(accent, 0.75));
    stroke.addColorStop(1, rgba(accent, 0.2));
    ctx.strokeStyle = stroke;
    ctx.stroke();

    const shine = ctx.createLinearGradient(x, y, x, y + h);
    shine.addColorStop(0, 'rgba(255,255,255,0.10)');
    shine.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    shine.addColorStop(1, 'rgba(255,255,255,0.00)');
    roundedRect(ctx, x + 10, y + 10, w - 20, h - 20, 22);
    ctx.fillStyle = shine;
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + w / 2, y + 18);

    ctx.fillStyle = rgba(accent, 0.95);
    ctx.font = '800 110px Arial';
    ctx.textBaseline = 'middle';
    ctx.fillText(label === 'Rock' ? '⬣' : label === 'Paper' ? '▭' : '✂', x + w / 2, y + h / 2 + 18);

    ctx.restore();
}

function renderResultImage({ playerName, playerChoice, botChoice, result }) {
    const w = 1100;
    const h = 520;
    const canvas = createCanvas(w, h);
    const ctx = canvas.getContext('2d');

    const bg = ctx.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, '#06070A');
    bg.addColorStop(1, '#0E1220');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const vignette = ctx.createRadialGradient(w / 2, h / 2, 120, w / 2, h / 2, 560);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);

    const accent = result === 'win' ? THEME.COLORS.SUCCESS : result === 'lose' ? THEME.COLORS.ERROR : THEME.COLORS.ACCENT;

    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.ellipse(220, 370, 240, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(880, 370, 240, 120, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawCard(ctx, 90, 90, 420, 340, CHOICES[playerChoice]?.label || String(playerChoice), accent, 'left');
    drawCard(ctx, 590, 90, 420, 340, CHOICES[botChoice]?.label || String(botChoice), accent, 'right');

    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = '700 26px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(playerName, 300, 460);
    ctx.fillText('ELORA', 800, 460);

    ctx.fillStyle = rgba(accent, 0.98);
    ctx.font = '900 38px Arial';
    ctx.textBaseline = 'top';
    const banner = result === 'win' ? 'VICTORY' : result === 'lose' ? 'DEFEAT' : 'DRAW';
    ctx.fillText(banner, w / 2, 26);

    return canvas.toBuffer('image/png');
}

module.exports = {
    name: 'rps',
    aliases: ['rockpaperscissors'],

    async execute(message) {
        const userId = message?.author?.id;
        if (!userId) return;

        const existing = activeByUser.get(userId);
        if (existing && Date.now() - existing < 12_000) {
            return message.reply('⏳ Wait a moment then try again.').catch(() => { });
        }
        activeByUser.set(userId, Date.now());

        const embed = buildStartEmbed(message.author.toString());
        const msg = await message.channel.send({ embeds: [embed], components: buildButtons(false) });

        const collector = msg.createMessageComponentCollector({ time: 25_000 });
        let finished = false;

        const disable = async () => {
            try {
                await msg.edit({ components: buildButtons(true) });
            } catch (_) { }
        };

        collector.on('collect', async (i) => {
            if (finished) {
                try {
                    await i.reply({ content: 'This round is already finished.', ephemeral: true });
                } catch (_) { }
                return;
            }

            if (i.user.id !== userId) {
                try {
                    await i.reply({ content: 'This is not your game.', ephemeral: true });
                } catch (_) { }
                return;
            }

            const id = String(i.customId || '');
            if (id === 'rps:cancel') {
                finished = true;
                collector.stop('cancel');
                await disable();
                try {
                    await i.reply({ content: 'Cancelled.', ephemeral: true });
                } catch (_) { }
                return;
            }

            const player = id.split(':')[1];
            if (!CHOICES[player]) {
                try {
                    await i.reply({ content: 'Invalid choice.', ephemeral: true });
                } catch (_) { }
                return;
            }

            const bot = pickBotChoice();
            const result = decide(player, bot);

            finished = true;
            collector.stop('done');
            await disable();

            const image = renderResultImage({
                playerName: message.author.username,
                playerChoice: player,
                botChoice: bot,
                result
            });

            const file = new AttachmentBuilder(image, { name: 'rps.png' });
            const resEmbed = buildResultEmbed(message.author.toString(), player, bot, result);
            resEmbed.setImage('attachment://rps.png');

            try {
                await i.update({ embeds: [resEmbed], files: [file], components: buildButtons(true) });
            } catch (_) {
                try {
                    await msg.edit({ embeds: [resEmbed], files: [file], components: buildButtons(true) });
                } catch (_) { }
            }
        });

        collector.on('end', async (_, reason) => {
            activeByUser.delete(userId);
            if (finished) return;
            if (reason === 'time') {
                await disable();
                await message.reply('⌛ Time is up.').catch(() => { });
            }
        });
    }
};

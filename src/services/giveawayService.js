const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { AttachmentBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');

const STAFF_DASHBOARD_CHANNEL_ID = '1461762995821609082';
const GIVEAWAY_CHANNEL_ID = '1486378746381340702';

const STAFF_PANEL_CUSTOM_ID_PREFIX = 'gwy_staff_';
const PUBLIC_CUSTOM_ID_PREFIX = 'gwy_pub_';
const STAFF_ENTRIES_CUSTOM_ID_PREFIX = 'gwy_staff_entries_';

const STORAGE_DIR = path.join(__dirname, '..', 'data');
const STORAGE_FILE = path.join(STORAGE_DIR, 'giveaway.json');

function ensureStorage() {
    try {
        fs.mkdirSync(STORAGE_DIR, { recursive: true });
        if (!fs.existsSync(STORAGE_FILE)) {
            fs.writeFileSync(STORAGE_FILE, JSON.stringify({ active: null, ended: null }, null, 2));
        }
    } catch (_) {
        // ignore
    }
}

function readState() {
    ensureStorage();
    try {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { active: null, ended: null };
        if (!('active' in parsed)) parsed.active = null;
        if (!('ended' in parsed)) parsed.ended = null;
        return parsed;
    } catch (_) {
        return { active: null, ended: null };
    }
}

function writeState(next) {
    ensureStorage();
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(next, null, 2));
    } catch (_) {
        // ignore
    }
}

function nowMs() {
    return Date.now();
}

function boldAll(text) {
    return `**${String(text ?? '')}**`;
}

function parseDurationToMs(input) {
    const raw = String(input || '').trim().toLowerCase();
    if (!raw) return null;

    const match = raw.match(/^\s*(\d+)\s*([smhd])\s*$/i);
    if (!match) return null;

    const n = Number(match[1]);
    const unit = match[2];
    if (!Number.isFinite(n) || n <= 0) return null;

    const mult = unit === 's' ? 1000 : unit === 'm' ? 60_000 : unit === 'h' ? 3_600_000 : 86_400_000;
    return n * mult;
}

function pickRandom(array, count) {
    const pool = Array.from(array);
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool.slice(0, Math.max(0, count));
}

function generateTicketId() {
    const buf = crypto.randomBytes(4).toString('hex').toUpperCase();
    return `ELORA-${buf}`;
}

function getBannerPath(name) {
    const repoRoot = path.join(__dirname, '..', '..');
    const rootAssets = path.join(repoRoot, 'assets', name);
    const srcAssets = path.join(__dirname, '..', 'assets', name);

    if (fs.existsSync(rootAssets)) return rootAssets;
    return srcAssets;
}

function buildStaffPanelEmbed(state) {
    const active = state?.active;

    const lines = [];
    if (!active) {
        lines.push(boldAll('▫️ Status: No active giveaway'));
    } else {
        lines.push(boldAll(`▫️ Status: Active`));
        lines.push(boldAll(`▫️ Prize: ${active.prize}`));
        lines.push(boldAll(`▫️ Ends: <t:${Math.floor(active.endAtMs / 1000)}:R>`));
        lines.push(boldAll(`▫️ Winners: ${active.winnersCount}`));
        lines.push(boldAll(`▫️ Required Invites: ${active.requiredInvites}`));
    }

    return new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(boldAll('▫️ Giveaway Staff Dashboard'))
        .setDescription(lines.join('\n'));
}

function buildStaffPanelComponents() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${STAFF_PANEL_CUSTOM_ID_PREFIX}create`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('▫️ Create Giveaway'),
        new ButtonBuilder()
            .setCustomId(`${STAFF_PANEL_CUSTOM_ID_PREFIX}end`)
            .setStyle(ButtonStyle.Danger)
            .setLabel('▫️ End Early'),
        new ButtonBuilder()
            .setCustomId(`${STAFF_PANEL_CUSTOM_ID_PREFIX}reroll`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('▫️ Reroll')
    );

    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${STAFF_PANEL_CUSTOM_ID_PREFIX}view_entries`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('▫️ View Entries')
    );

    return [row, row2];
}

function buildCreateGiveawayModal() {
    const modal = new ModalBuilder()
        .setCustomId(`${STAFF_PANEL_CUSTOM_ID_PREFIX}modal_create`)
        .setTitle('**▫️ Create Giveaway**');

    const prize = new TextInputBuilder()
        .setCustomId('prize')
        .setLabel('**▫️ Prize**')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(200);

    const duration = new TextInputBuilder()
        .setCustomId('duration')
        .setLabel('**▫️ Duration (e.g., 2d / 12h)**')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(10);

    const winners = new TextInputBuilder()
        .setCustomId('winners')
        .setLabel('**▫️ Number Of Winners**')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(3);

    const invites = new TextInputBuilder()
        .setCustomId('invites')
        .setLabel('**▫️ Required Invites**')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(4);

    modal.addComponents(
        new ActionRowBuilder().addComponents(prize),
        new ActionRowBuilder().addComponents(duration),
        new ActionRowBuilder().addComponents(winners),
        new ActionRowBuilder().addComponents(invites)
    );

    return modal;
}

function buildGiveawayEmbed(active) {
    const endUnix = Math.floor(active.endAtMs / 1000);
    const bannerName = '1234.png';

    const totalEntries = Object.keys(active.tickets || {}).length;

    const desc = [
        boldAll(`▫️ Prize: ${active.prize}`),
        boldAll(`▫️ Ends: <t:${endUnix}:R>`),
        boldAll(`▫️ Winners: ${active.winnersCount}`),
        boldAll(`▫️ Total Entries: ${totalEntries}`),
        boldAll(`▫️ Requirement: Invite ${active.requiredInvites} members using your personal link (Counts only after giveaway started)`)
    ].join('\n');

    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(boldAll('▫️ Giveaway'))
        .setDescription(desc)
        .setImage(`attachment://${bannerName}`);

    return embed;
}

function buildGiveawayComponents() {
    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${PUBLIC_CUSTOM_ID_PREFIX}claim`)
            .setStyle(ButtonStyle.Primary)
            .setLabel('✦ Claim Ticket'),
        new ButtonBuilder()
            .setCustomId(`${PUBLIC_CUSTOM_ID_PREFIX}progress`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('▫️ Check Progress')
    );

    return [row];
}

async function updateActiveGiveawayMessage(client) {
    try {
        const state = readState();
        const active = state.active;
        if (!active?.postedMessageId || !active?.postedChannelId) return;

        const ch = await client.channels.fetch(active.postedChannelId).catch(() => null);
        if (!ch || !ch.isTextBased?.()) return;

        const msg = await ch.messages.fetch(active.postedMessageId).catch(() => null);
        if (!msg) return;

        const bannerName = '1234.png';
        const bannerFile = new AttachmentBuilder(getBannerPath(bannerName), { name: bannerName });
        const embed = buildGiveawayEmbed(active);
        const components = buildGiveawayComponents();

        await msg.edit({ embeds: [embed], components, files: [bannerFile] }).catch(() => { });
    } catch (_) {
        // ignore
    }
}

function chunkLinesToPages(lines, maxChars) {
    const pages = [];
    let current = '';
    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxChars && current) {
            pages.push(current);
            current = line;
        } else {
            current = next;
        }
    }
    if (current) pages.push(current);
    return pages;
}

function buildEntriesPaginationRow(page, pageCount) {
    const prevDisabled = page <= 0;
    const nextDisabled = page >= (pageCount - 1);

    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`${STAFF_ENTRIES_CUSTOM_ID_PREFIX}prev_${page}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('▫️ Prev')
            .setDisabled(prevDisabled),
        new ButtonBuilder()
            .setCustomId(`${STAFF_ENTRIES_CUSTOM_ID_PREFIX}next_${page}`)
            .setStyle(ButtonStyle.Secondary)
            .setLabel('▫️ Next')
            .setDisabled(nextDisabled)
    );
}

async function replyEntriesPage(interaction, client, { page }) {
    const active = getActiveGiveaway();
    if (!active) {
        await interaction.reply({ content: boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
        return;
    }

    const ticketUserIds = Object.keys(active.tickets || {});
    const total = ticketUserIds.length;

    const lines = [];
    for (const userId of ticketUserIds) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) {
            lines.push(`▫️ **${userId}**`);
            continue;
        }
        const displayName = user.globalName || user.displayName || user.username;
        lines.push(`▫️ **${displayName}** (@${user.username})`);
    }

    const pages = chunkLinesToPages(lines.length ? lines : ['▫️ **No entries yet.**'], 3800);
    const pageCount = Math.max(1, pages.length);
    const safePage = Math.min(Math.max(0, Number(page) || 0), pageCount - 1);

    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(boldAll(`✦ Giveaway Entries (${total})`))
        .setDescription(pages[safePage] || boldAll('▫️ No entries yet.'))
        .setThumbnail(client.user.displayAvatarURL({ extension: 'png', size: 256 }));

    const row = buildEntriesPaginationRow(safePage, pageCount);

    if (interaction.deferred || interaction.replied) {
        await interaction.editReply({ embeds: [embed], components: [row] }).catch(() => { });
    } else {
        await interaction.reply({ embeds: [embed], components: [row], ephemeral: true }).catch(() => { });
    }
}

async function ensureStaffDashboard(client) {
    const state = readState();

    const ch = await client.channels.fetch(STAFF_DASHBOARD_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;

    const embed = buildStaffPanelEmbed(state);
    const components = buildStaffPanelComponents();

    // Pin-like persistence: find last bot message with our panel title.
    const messages = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const existing = messages?.find(m => m.author?.id === client.user.id && m.embeds?.[0]?.title === embed.data.title);

    if (existing) {
        await existing.edit({ embeds: [embed], components }).catch(() => { });
    } else {
        await ch.send({ embeds: [embed], components }).catch(() => { });
    }
}

async function postGiveawayMessage(client, active) {
    const ch = await client.channels.fetch(GIVEAWAY_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return { ok: false };

    const bannerName = '1234.png';
    const bannerFile = new AttachmentBuilder(getBannerPath(bannerName), { name: bannerName });

    const embed = buildGiveawayEmbed(active);
    const components = buildGiveawayComponents();

    const msg = await ch.send({ content: '@everyone', embeds: [embed], components, files: [bannerFile] }).catch(() => null);
    if (!msg) return { ok: false };

    return { ok: true, messageId: msg.id, channelId: ch.id };
}

let activeTimeout = null;

function clearActiveTimeout() {
    if (activeTimeout) {
        clearTimeout(activeTimeout);
        activeTimeout = null;
    }
}

async function scheduleActiveEnd(client) {
    clearActiveTimeout();

    const state = readState();
    if (!state.active) return;

    const delay = Math.max(0, state.active.endAtMs - nowMs());
    activeTimeout = setTimeout(() => {
        endGiveaway(client, { reason: 'time' }).catch(() => { });
    }, delay);
}

function getActiveGiveaway() {
    const state = readState();
    return state.active;
}

function getUserInvitesForActive(userId) {
    const state = readState();
    const active = state.active;
    if (!active) return 0;
    return Number(active.inviteCounts?.[userId] || 0);
}

function recordInviteJoinForActive(inviterId, inviteeId, joinedAtMs) {
    const state = readState();
    const active = state.active;
    if (!active) return;
    if (!inviterId || !inviteeId) return;
    if (inviterId === inviteeId) return;
    if (joinedAtMs < active.startAtMs) return;

    if (!active.invitedBy) active.invitedBy = {};
    if (!active.inviteCounts) active.inviteCounts = {};

    // Prevent double counting if a member re-triggers.
    if (active.invitedBy[inviteeId]) return;

    active.invitedBy[inviteeId] = inviterId;
    active.inviteCounts[inviterId] = Number(active.inviteCounts[inviterId] || 0) + 1;

    state.active = active;
    writeState(state);
}

function recordInviteLeaveForActive(inviteeId) {
    const state = readState();
    const active = state.active;
    if (!active) return;

    const inviterId = active.invitedBy?.[inviteeId];
    if (!inviterId) return;

    // Mark processed leave so re-processing won’t double decrement.
    if (!active.leftUsers) active.leftUsers = {};
    if (active.leftUsers[inviteeId]) return;
    active.leftUsers[inviteeId] = true;

    if (!active.inviteCounts) active.inviteCounts = {};
    active.inviteCounts[inviterId] = Math.max(0, Number(active.inviteCounts[inviterId] || 0) - 1);

    state.active = active;
    writeState(state);
}

function claimTicketForActive(userId) {
    const state = readState();
    const active = state.active;
    if (!active) return { ok: false, reason: 'no_active' };

    if (!active.tickets) active.tickets = {};

    if (active.tickets[userId]) {
        return { ok: true, ticketId: active.tickets[userId], isNew: false };
    }

    const ticketId = generateTicketId();
    active.tickets[userId] = ticketId;

    state.active = active;
    writeState(state);

    return { ok: true, ticketId, isNew: true };
}

async function createGiveaway(client, { prize, durationMs, winnersCount, requiredInvites, createdById }) {
    const state = readState();
    if (state.active) {
        return { ok: false, reason: 'already_active' };
    }

    const startAtMs = nowMs();
    const endAtMs = startAtMs + durationMs;

    const giveawayId = crypto.randomBytes(8).toString('hex');

    const active = {
        giveawayId,
        prize,
        winnersCount,
        requiredInvites,
        createdById,
        startAtMs,
        endAtMs,
        postedMessageId: null,
        postedChannelId: null,
        tickets: {},
        inviteCounts: {},
        invitedBy: {},
        leftUsers: {}
    };

    const posted = await postGiveawayMessage(client, active);
    if (posted.ok) {
        active.postedMessageId = posted.messageId;
        active.postedChannelId = posted.channelId;
    }

    state.active = active;
    writeState(state);

    await ensureStaffDashboard(client);
    await scheduleActiveEnd(client);

    return { ok: true, active };
}

async function endGiveaway(client, { reason }) {
    const state = readState();
    const active = state.active;
    if (!active) {
        return { ok: false, reason: 'no_active' };
    }

    clearActiveTimeout();

    const required = Number(active.requiredInvites || 0);
    const tickets = active.tickets || {};

    const eligibleUserIds = Object.keys(tickets).filter((userId) => {
        const count = Number(active.inviteCounts?.[userId] || 0);
        return count >= required;
    });

    const winners = pickRandom(eligibleUserIds, Number(active.winnersCount || 1));

    const ended = {
        ...active,
        endedAtMs: nowMs(),
        endedReason: reason || 'manual',
        eligibleUserIds,
        winners
    };

    state.active = null;
    state.ended = ended;
    writeState(state);

    await announceWinners(client, ended);
    await ensureStaffDashboard(client);

    return { ok: true, ended };
}

async function announceWinners(client, ended) {
    const ch = await client.channels.fetch(GIVEAWAY_CHANNEL_ID).catch(() => null);
    if (!ch || !ch.isTextBased?.()) return;

    const winnerName = 'winner.png';
    const winnerFile = new AttachmentBuilder(getBannerPath(winnerName), { name: winnerName });

    const prizeLine = boldAll(`▫️ Prize: ${ended.prize}`);

    let content;
    if (!ended.winners?.length) {
        content = boldAll('▫️ Giveaway Ended: No eligible winners met the invite requirement.');
    } else {
        const mentions = ended.winners.map(id => `<@${id}>`).join(' ');
        content = boldAll(`▫️ Congratulations: ${mentions}`);
    }

    const embed = new EmbedBuilder()
        .setColor(0x2b2d31)
        .setTitle(boldAll('▫️ Giveaway Result'))
        .setDescription([content, prizeLine].join('\n'))
        .setImage(`attachment://${winnerName}`);

    await ch.send({ embeds: [embed], files: [winnerFile] }).catch(() => { });
}

async function rerollLastGiveaway(client) {
    const state = readState();
    const ended = state.ended;
    if (!ended) return { ok: false, reason: 'no_ended' };

    const eligibleUserIds = Array.isArray(ended.eligibleUserIds) ? ended.eligibleUserIds : [];
    const winners = pickRandom(eligibleUserIds, Number(ended.winnersCount || 1));

    ended.winners = winners;
    ended.rerolledAtMs = nowMs();
    state.ended = ended;
    writeState(state);

    await announceWinners(client, ended);
    await ensureStaffDashboard(client);

    return { ok: true, ended };
}

function isStaff(interactionOrMessageMember) {
    try {
        const perms = interactionOrMessageMember?.permissions;
        if (!perms) return false;
        return perms.has(PermissionFlagsBits.Administrator) || perms.has(PermissionFlagsBits.ManageGuild);
    } catch (_) {
        return false;
    }
}

async function handleStaffInteraction(interaction, client) {
    if (!interaction.customId?.startsWith(STAFF_PANEL_CUSTOM_ID_PREFIX)) return false;

    const member = interaction.member;
    if (!isStaff(member)) {
        await interaction.reply({ content: boldAll('▫️ You do not have permission to use this.'), ephemeral: true }).catch(() => { });
        return true;
    }

    if (interaction.isButton()) {
        if (interaction.customId === `${STAFF_PANEL_CUSTOM_ID_PREFIX}create`) {
            const modal = buildCreateGiveawayModal();
            await interaction.showModal(modal).catch(() => { });
            return true;
        }

        if (interaction.customId === `${STAFF_PANEL_CUSTOM_ID_PREFIX}end`) {
            const res = await endGiveaway(client, { reason: 'manual' }).catch(() => null);
            if (!res?.ok) {
                await interaction.reply({ content: boldAll('▫️ No active giveaway to end.'), ephemeral: true }).catch(() => { });
                return true;
            }
            await interaction.reply({ content: boldAll('▫️ Giveaway ended.'), ephemeral: true }).catch(() => { });
            return true;
        }

        if (interaction.customId === `${STAFF_PANEL_CUSTOM_ID_PREFIX}reroll`) {
            const res = await rerollLastGiveaway(client).catch(() => null);
            if (!res?.ok) {
                await interaction.reply({ content: boldAll('▫️ No ended giveaway to reroll.'), ephemeral: true }).catch(() => { });
                return true;
            }
            await interaction.reply({ content: boldAll('▫️ Reroll completed.'), ephemeral: true }).catch(() => { });
            return true;
        }

        if (interaction.customId === `${STAFF_PANEL_CUSTOM_ID_PREFIX}view_entries`) {
            const active = getActiveGiveaway();
            if (!active) {
                await interaction.reply({ content: boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
                return true;
            }

            await replyEntriesPage(interaction, client, { page: 0 }).catch(() => { });
            return true;
        }
    }

    if (interaction.isModalSubmit()) {
        if (interaction.customId === `${STAFF_PANEL_CUSTOM_ID_PREFIX}modal_create`) {
            const prize = interaction.fields.getTextInputValue('prize')?.trim();
            const durationRaw = interaction.fields.getTextInputValue('duration')?.trim();
            const winnersRaw = interaction.fields.getTextInputValue('winners')?.trim();
            const invitesRaw = interaction.fields.getTextInputValue('invites')?.trim();

            const durationMs = parseDurationToMs(durationRaw);
            const winnersCount = Number(winnersRaw);
            const requiredInvites = Number(invitesRaw);

            if (!prize || !durationMs || !Number.isFinite(winnersCount) || winnersCount < 1 || winnersCount > 25 || !Number.isFinite(requiredInvites) || requiredInvites < 0 || requiredInvites > 1000) {
                await interaction.reply({ content: boldAll('▫️ Invalid input. Check duration/winners/invites.'), ephemeral: true }).catch(() => { });
                return true;
            }

            const res = await createGiveaway(client, {
                prize,
                durationMs,
                winnersCount: Math.floor(winnersCount),
                requiredInvites: Math.floor(requiredInvites),
                createdById: interaction.user.id
            }).catch(() => null);

            if (!res?.ok) {
                if (res?.reason === 'already_active') {
                    await interaction.reply({ content: boldAll('▫️ There is already an active giveaway.'), ephemeral: true }).catch(() => { });
                    return true;
                }
                await interaction.reply({ content: boldAll('▫️ Failed to create giveaway.'), ephemeral: true }).catch(() => { });
                return true;
            }

            await interaction.reply({ content: boldAll('▫️ Giveaway created and posted.'), ephemeral: true }).catch(() => { });
            return true;
        }
    }

    return false;
}

async function handleStaffEntriesInteraction(interaction, client) {
    if (!interaction.isButton?.()) return false;
    if (!interaction.customId?.startsWith(STAFF_ENTRIES_CUSTOM_ID_PREFIX)) return false;

    const member = interaction.member;
    if (!isStaff(member)) {
        await interaction.reply({ content: boldAll('▫️ You do not have permission to use this.'), ephemeral: true }).catch(() => { });
        return true;
    }

    const rest = String(interaction.customId || '').slice(STAFF_ENTRIES_CUSTOM_ID_PREFIX.length);
    const parts = rest.split('_');
    const dir = parts[0];
    const current = Number(parts[1] || 0);
    const nextPage = dir === 'prev' ? current - 1 : current + 1;

    // Convert interaction to an editable ephemeral message.
    try {
        await interaction.deferUpdate().catch(() => { });
    } catch (_) {
        // ignore
    }

    await replyEntriesPage(interaction, client, { page: nextPage });
    return true;
}

async function handlePublicInteraction(interaction) {
    if (!interaction.customId?.startsWith(PUBLIC_CUSTOM_ID_PREFIX)) return false;

    if (interaction.customId === `${PUBLIC_CUSTOM_ID_PREFIX}claim`) {
        const res = claimTicketForActive(interaction.user.id);
        if (!res.ok) {
            await interaction.reply({ content: boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
            return true;
        }

        await interaction.reply({ content: boldAll(`▫️ Ticket Issued: ${res.ticketId}`), ephemeral: true }).catch(() => { });

        // Live entries tracker: update public giveaway embed only when a NEW ticket is created.
        try {
            if (res.isNew) {
                await updateActiveGiveawayMessage(interaction.client);
            }
        } catch (_) {
            // ignore
        }
        return true;
    }

    if (interaction.customId === `${PUBLIC_CUSTOM_ID_PREFIX}progress`) {
        const active = getActiveGiveaway();
        if (!active) {
            await interaction.reply({ content: boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
            return true;
        }

        const count = getUserInvitesForActive(interaction.user.id);
        await interaction.reply({ content: boldAll(`▫️ Your Valid Invites (Since Start): ${count} / ${active.requiredInvites}`), ephemeral: true }).catch(() => { });
        return true;
    }

    return false;
}

function buildSlashGwyInvitesCommand() {
    return {
        data: new SlashCommandBuilder()
            .setName('gwy_invites')
            .setDescription('Check a user\'s valid giveaway invites (current active giveaway)')
            .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)),
        async execute(interaction) {
            const active = getActiveGiveaway();
            if (!active) {
                return interaction.reply({ content: boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
            }

            const member = interaction.member;
            if (!isStaff(member)) {
                return interaction.reply({ content: boldAll('▫️ You do not have permission to use this.'), ephemeral: true }).catch(() => { });
            }

            const user = interaction.options.getUser('user', true);
            const count = getUserInvitesForActive(user.id);
            return interaction.reply({ content: boldAll(`▫️ Valid Invites For ${user}: ${count}`), ephemeral: true }).catch(() => { });
        }
    };
}

module.exports = {
    STAFF_DASHBOARD_CHANNEL_ID,
    GIVEAWAY_CHANNEL_ID,
    STAFF_PANEL_CUSTOM_ID_PREFIX,
    PUBLIC_CUSTOM_ID_PREFIX,

    boldAll,
    parseDurationToMs,

    ensureStaffDashboard,
    scheduleActiveEnd,

    getActiveGiveaway,
    getUserInvitesForActive,

    recordInviteJoinForActive,
    recordInviteLeaveForActive,

    handleStaffInteraction,
    handleStaffEntriesInteraction,
    handlePublicInteraction,

    buildSlashGwyInvitesCommand,
};

const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const NicknameLock = require('../../models/NicknameLock');
const THEME = require('../../utils/theme');

function buildEmbed(title, description) {
    return new EmbedBuilder()
        .setColor('#000000')
        .setTitle(title)
        .setDescription(description)
        .setFooter({ text: THEME.FOOTER?.text || 'ELORA', iconURL: THEME.FOOTER?.iconURL || undefined })
        .setTimestamp();
}

async function upsertLock({ guildId, userId, nickname, setBy }) {
    if (!mongoose.connection?.readyState) return { ok: false, error: 'DB_OFFLINE' };

    await NicknameLock.findOneAndUpdate(
        { guildId, userId },
        {
            $setOnInsert: { guildId, userId },
            $set: { nickname: nickname ?? null, locked: true, setBy }
        },
        { upsert: true, new: true }
    ).catch(() => null);

    return { ok: true };
}

async function clearLock({ guildId, userId }) {
    if (!mongoose.connection?.readyState) return { ok: false, error: 'DB_OFFLINE' };
    await NicknameLock.deleteOne({ guildId, userId }).catch(() => null);
    return { ok: true };
}

async function executePrefix(message, client, args) {
    if (!message.guild) return;

    const me = message.guild.members.me;
    if (!me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
        const embed = buildEmbed('▫ Nickname', '✖ Missing bot permission: `Manage Nicknames`.');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const authorMember = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!authorMember?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
        const embed = buildEmbed('▫ Nickname', '✖ You need permission: `Manage Nicknames`.');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const sub = String(args?.[0] || '').toLowerCase();

    if (sub === 'unlock' || sub === 'clearlock') {
        const target = message.mentions.members.first();
        if (!target) {
            const embed = buildEmbed('▫ Nickname', '▫ Usage: `.nick unlock @user`');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        const r = await clearLock({ guildId: message.guild.id, userId: target.id });
        const embed = buildEmbed('▫ Nickname', r.ok ? `▫ Lock cleared for <@${target.id}>.` : '✖ Database offline.');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    if (sub === 'reset' || sub === 'clear') {
        const target = message.mentions.members.first();
        if (!target) {
            const embed = buildEmbed('▫ Nickname', '▫ Usage: `.nick reset @user`');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        if (!target.manageable) {
            const embed = buildEmbed('▫ Nickname', '✖ I cannot edit this member.');
            return message.reply({ embeds: [embed] }).catch(() => null);
        }

        await target.setNickname(null, `Nickname reset by ${message.author.tag}`).catch(() => null);
        await clearLock({ guildId: message.guild.id, userId: target.id });

        const embed = buildEmbed('▫ Nickname', `▫ Nickname reset for <@${target.id}>.`);
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const target = message.mentions.members.first();
    if (!target) {
        const embed = buildEmbed('▫ Nickname', '▫ Usage: `.nick @user <new nickname>`');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const newNick = args.slice(1).join(' ').trim();
    if (!newNick) {
        const embed = buildEmbed('▫ Nickname', '▫ Provide a nickname.');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    if (newNick.length > 32) {
        const embed = buildEmbed('▫ Nickname', '✖ Nickname too long (max 32).');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    if (!target.manageable) {
        const embed = buildEmbed('▫ Nickname', '✖ I cannot edit this member.');
        return message.reply({ embeds: [embed] }).catch(() => null);
    }

    const lockRes = await upsertLock({
        guildId: message.guild.id,
        userId: target.id,
        nickname: newNick,
        setBy: message.author.id
    });

    await target.setNickname(newNick, `Nickname locked by ${message.author.tag}`).catch(() => null);

    const embed = buildEmbed(
        '▫ Nickname',
        lockRes.ok
            ? `▪ Nickname set + locked for <@${target.id}>.`
            : `▪ Nickname set for <@${target.id}>.\n✖ Lock not saved (database offline).`
    );

    return message.reply({ embeds: [embed] }).catch(() => null);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('nick')
        .setDescription('Set and lock a member nickname.')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageNicknames)
        .addUserOption((o) => o.setName('user').setDescription('Target user').setRequired(true))
        .addStringOption((o) => o.setName('nickname').setDescription('Nickname (32 max)').setRequired(true)),

    async execute(interaction, client) {
        const member = interaction.options.getMember('user');
        const nickname = interaction.options.getString('nickname');

        const me = interaction.guild.members.me;
        if (!me?.permissions?.has?.(PermissionFlagsBits.ManageNicknames)) {
            const embed = buildEmbed('▫ Nickname', '✖ Missing bot permission: `Manage Nicknames`.');
            return interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => null);
        }

        if (!member?.manageable) {
            const embed = buildEmbed('▫ Nickname', '✖ I cannot edit this member.');
            return interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => null);
        }

        const lockRes = await upsertLock({
            guildId: interaction.guild.id,
            userId: member.id,
            nickname,
            setBy: interaction.user.id
        });

        await member.setNickname(nickname, `Nickname locked by ${interaction.user.tag}`).catch(() => null);

        const embed = buildEmbed(
            '▫ Nickname',
            lockRes.ok
                ? `▪ Nickname set + locked for <@${member.id}>.`
                : `▪ Nickname set for <@${member.id}>.\n✖ Lock not saved (database offline).`
        );

        return interaction.reply({ embeds: [embed], ephemeral: true }).catch(() => null);
    },

    name: 'nick',
    aliases: ['nickname'],
    executePrefix
};

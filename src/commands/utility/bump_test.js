const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const Bump = require('../../models/Bump');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('bump_test')
        .setDescription('Test the bump thanks + 2-hour reminder flow without DISBOARD.')
        .addIntegerOption((opt) =>
            opt
                .setName('minutes')
                .setDescription('Override the wait time (minutes). Default: 120')
                .setMinValue(1)
                .setMaxValue(1440)
                .setRequired(false)
        ),

    async execute(interaction) {
        const BUMP_NOTIFY_ROLE_ID = '1494109618413113415';
        const BUMP_REMINDER_CHANNEL_ID = '1461760293968285879';

        const minutes = interaction.options.getInteger('minutes') ?? 120;
        const nextBump = new Date(Date.now() + minutes * 60 * 1000);

        await interaction.deferReply({ ephemeral: true }).catch(() => { });

        const guildId = interaction.guild?.id;
        if (!guildId) {
            return interaction.editReply({ content: '❌ This command can only be used in a server.' }).catch(() => { });
        }

        const ch = await interaction.client.channels.fetch(BUMP_REMINDER_CHANNEL_ID).catch(() => null);
        if (!ch || !ch.isTextBased?.()) {
            return interaction.editReply({ content: `❌ Reminder channel not found: ${BUMP_REMINDER_CHANNEL_ID}` }).catch(() => { });
        }

        if (ch.type === ChannelType.GuildText) {
            const me = interaction.guild.members.me;
            const perms = ch.permissionsFor(me);
            if (perms && (!perms.has('ViewChannel') || !perms.has('SendMessages') || !perms.has('EmbedLinks'))) {
                return interaction.editReply({ content: '❌ Missing permissions in reminder channel (ViewChannel/SendMessages/EmbedLinks).' }).catch(() => { });
            }
        }

        const thanksEmbed = new EmbedBuilder()
            .setColor('#000000')
            .setDescription('**Thanks for bumping the server**');

        await ch.send({
            content: `<@${interaction.user.id}>`,
            embeds: [thanksEmbed],
            allowedMentions: { users: [interaction.user.id] }
        }).catch(() => { });

        await Bump.findOneAndUpdate(
            { guildId },
            { $set: { nextBumpTime: nextBump, reminded: false } },
            { upsert: true, new: true }
        ).catch(() => { });

        return interaction.editReply({ content: `✅ Test bump recorded. Reminder scheduled in ${minutes} minute(s).` }).catch(() => { });
    }
};

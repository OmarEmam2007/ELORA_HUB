const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ChannelType, AttachmentBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket_setup')
        .setDescription('Creates a ticket panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the ticket panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),
    async execute(interaction, client) {
        const channel = interaction.options.getChannel('channel', true);

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/2.png'));

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

        const placeholder = toSmallCaps('HOW CAN I HELP YOU?');

        const menu = new StringSelectMenuBuilder()
            .setCustomId('ticket_select')
            .setPlaceholder(placeholder)
            .addOptions(
                { label: toSmallCaps('A PROBLEM IN THE SERVER'), description: toSmallCaps('REPORT BUGS OR RULE ISSUES'), value: 'server_problem' },
                { label: toSmallCaps('PARTNERSHIPS'), description: toSmallCaps('COLLABS, SPONSORS, AND DEALS'), value: 'partnerships' },
                { label: toSmallCaps('SOCIAL PROBLEM'), description: toSmallCaps('CONFLICTS, HARASSMENT, OR DRAMA'), value: 'social_problem' },
                { label: toSmallCaps('OTHER'), description: toSmallCaps('ANYTHING ELSE YOU NEED HELP WITH'), value: 'other' }
            );

        const row = new ActionRowBuilder().addComponents(menu);
        await channel.send({ content: ' ', files: [banner] });
        await channel.send({ components: [row] });
        await interaction.reply({ content: `✅ Ticket panel sent to ${channel}`, ephemeral: true });
    }
};

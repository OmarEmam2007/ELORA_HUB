const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('role_setup')
        .setDescription('Creates a role selection panel.')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option
                .setName('channel')
                .setDescription('Channel to send the role panel')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText)
        ),
    async execute(interaction) {
        const channel = interaction.options.getChannel('channel', true);

        const banner = new AttachmentBuilder(path.join(__dirname, '../../assets/slurns 0001.png'));

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

        const agePlaceholder = 'ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ᴀɢᴇ';
        const genderPlaceholder = 'ꜱᴇʟᴇᴄᴛ ʏᴏᴜʀ ɢᴇɴᴅᴇʀ';

        const ageMenu = new StringSelectMenuBuilder()
            .setCustomId('role_age_select')
            .setPlaceholder(agePlaceholder)
            .addOptions(
                { label: toSmallCaps('13'), value: 'age_13' },
                { label: toSmallCaps('14'), value: 'age_14' },
                { label: toSmallCaps('15'), value: 'age_15' },
                { label: toSmallCaps('16'), value: 'age_16' },
                { label: toSmallCaps('17'), value: 'age_17' },
                { label: toSmallCaps('18'), value: 'age_18' },
                { label: toSmallCaps('19'), value: 'age_19' },
                { label: toSmallCaps('20'), value: 'age_20' },
                { label: toSmallCaps('21'), value: 'age_21' },
                { label: toSmallCaps('22'), value: 'age_22' },
                { label: toSmallCaps('23'), value: 'age_23' },
                { label: toSmallCaps('24'), value: 'age_24' },
                { label: toSmallCaps('25+'), value: 'age_25_plus' }
            );

        const genderMenu = new StringSelectMenuBuilder()
            .setCustomId('role_gender_select')
            .setPlaceholder(genderPlaceholder)
            .addOptions(
                { label: 'ʜᴇ/ʜɪᴍ', value: 'he_him' },
                { label: toSmallCaps('SHE/HER (UNVERIFIED)'), value: 'she_her' },
                { label: 'ᴛʜᴇʏ/ᴛʜᴇᴍ = ʙᴀɴ', value: 'they_them' }
            );

        const row1 = new ActionRowBuilder().addComponents(ageMenu);
        const row2 = new ActionRowBuilder().addComponents(genderMenu);

        await channel.send({ content: ' ', files: [banner] });
        await channel.send({ components: [row1, row2] });

        await interaction.reply({ content: 'OK', ephemeral: true }).catch(() => { });
    }
};

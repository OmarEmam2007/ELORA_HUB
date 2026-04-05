const { SlashCommandBuilder, PermissionFlagsBits, ChannelType, AttachmentBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');

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

        const bannerName = 'roles.png';
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
            .setPlaceholder(`✦ ${agePlaceholder}`)
            .addOptions(
                { label: toSmallCaps('13'), value: 'age_13', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('14'), value: 'age_14', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('15'), value: 'age_15', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('16'), value: 'age_16', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('17'), value: 'age_17', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('18'), value: 'age_18', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('19'), value: 'age_19', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('20'), value: 'age_20', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('21'), value: 'age_21', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('22'), value: 'age_22', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('23'), value: 'age_23', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('24'), value: 'age_24', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('25+'), value: 'age_25_plus', emoji: { id: '1487391271759646750' } }
            );

        const genderMenu = new StringSelectMenuBuilder()
            .setCustomId('role_gender_select')
            .setPlaceholder(`✦ ${genderPlaceholder}`)
            .addOptions(
                { label: 'ʜᴇ/ʜɪᴍ', value: 'he_him', emoji: { id: '1487391271759646750' } },
                { label: toSmallCaps('SHE/HER (UNVERIFIED)'), value: 'she_her', emoji: { id: '1487391271759646750' } },
                { label: 'ᴛʜᴇʏ/ᴛʜᴇᴍ', value: 'they_them', emoji: { id: '1487391271759646750' } }
            );

        const row1 = new ActionRowBuilder().addComponents(ageMenu);
        const row2 = new ActionRowBuilder().addComponents(genderMenu);

        await channel.send({ content: ' ', files: [banner] });
        await channel.send({ components: [row1, row2] });

        await interaction.reply({ content: 'OK', ephemeral: true }).catch(() => { });
    }
};

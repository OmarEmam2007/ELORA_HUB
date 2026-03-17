const path = require('path');
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    AttachmentBuilder,
    ActionRowBuilder,
    StringSelectMenuBuilder,
} = require('discord.js');

const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('setup_ideas')
        .setDescription('Deploy the ideas/advice panel (image + select menu).')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    async execute(interaction) {
        if (!interaction.guild || !interaction.channel) {
            return interaction.reply({ content: 'This command can only be used in a server channel.', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true }).catch(() => { });

        const imagePath = path.join(__dirname, '../../assets/555.png');
        const file = new AttachmentBuilder(imagePath, { name: '555.png' });

        const menu = new StringSelectMenuBuilder()
            .setCustomId('ideas_select')
            .setPlaceholder('Select an option to provide your advice.')
            .addOptions(
                {
                    label: 'Advice on improving the server',
                    value: 'improve_server',
                    description: 'Share your ideas on how we can make this Discord server better.',
                    emoji: '🏗️',
                },
                {
                    label: 'Advice on improving the bot',
                    value: 'improve_bot',
                    description: 'Tell us what features or fixes you want to see in the bot.',
                    emoji: '🤖',
                }
            );

        const row = new ActionRowBuilder().addComponents(menu);

        await interaction.channel.send({
            files: [file],
            components: [row],
        }).catch(async (e) => {
            console.error('[setup_ideas] send error:', e);
            const msg = '❌ Failed to send the setup panel. Make sure the bot can send messages and attach files here.';
            try {
                await interaction.editReply({ content: msg });
            } catch (_) { }
        });

        const ok = `✅ Ideas panel deployed in ${interaction.channel}.`;
        return interaction.editReply({ content: ok }).catch(() => { });
    },
};

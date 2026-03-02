const {
    SlashCommandBuilder,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ComponentType
} = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const THEME = require('../../utils/theme');

// Initialize Gemini
// Ensure GEMINI_API_KEY is in your .env file
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Using flash model for speed on chat interactions
const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

module.exports = {
    data: new SlashCommandBuilder()
        .setName('chat')
        .setDescription('Communicate with the Solar Intelligence.')
        .addStringOption(option =>
            option.setName('prompt')
                .setDescription('Transmission content.')
                .setRequired(true)
        ),

    async execute(interaction) {
        const prompt = interaction.options.getString('prompt');
        const user = interaction.user;

        await interaction.deferReply();

        // --- Pseudo-Animation (Loading) ---
        const frames = THEME.ANIMATIONS.LOADING;
        let loadingMsg = await interaction.editReply({
            embeds: [
                new EmbedBuilder()
                    .setColor(THEME.COLORS.ACCENT)
                    .setDescription(`${frames[0]}`)
            ]
        });

        // Animation Loop
        let frameIndex = 0;
        const animationInterval = setInterval(async () => {
            frameIndex = (frameIndex + 1) % frames.length;
            try {
                await interaction.editReply({
                    embeds: [
                        new EmbedBuilder()
                            .setColor(THEME.COLORS.ACCENT)
                            .setDescription(`${frames[frameIndex]}`)
                    ]
                });
            } catch (ignored) { }
        }, 800);

        try {
            // API Call
            const result = await model.generateContent(prompt);
            const response = await result.response;
            const text = response.text();

            clearInterval(animationInterval);

            // Response Embed
            const truncatedText = text.length > 4000 ? text.substring(0, 3997) + '...' : text;

            const responseEmbed = new EmbedBuilder() // Moon Theme applied
                .setColor(THEME.COLORS.SECONDARY)
                .setAuthor({
                    name: `🌑 ELORA INTELLIGENCE`,
                    iconURL: user.displayAvatarURL({ dynamic: true })
                })
                .setDescription(
                    `${truncatedText}\n\n` +
                    `**Latency:** ${Date.now() - interaction.createdTimestamp}ms`
                )
                .setTimestamp();

            // Interactive Buttons (Moon Styled)
            const actionRow = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId('regenerate')
                        .setLabel('Re-Transmit')
                        .setEmoji('📡')
                        .setStyle(ButtonStyle.Secondary),

                    new ButtonBuilder()
                        .setCustomId('delete')
                        .setLabel('End Transmission')
                        .setEmoji('🗑️')
                        .setStyle(ButtonStyle.Danger)
                );

            const finalMessage = await interaction.editReply({
                content: null,
                embeds: [responseEmbed],
                components: [actionRow]
            });

            const collector = finalMessage.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async i => {
                if (i.user.id !== user.id) {
                    return i.reply({ content: '⛔ Encryption key mismatch. Access denied.', ephemeral: true });
                }

                if (i.customId === 'delete') {
                    await i.update({
                        embeds: [],
                        components: [],
                        content: '`🗑️ Transmission Terminated.`'
                    });
                    setTimeout(() => i.deleteReply().catch(() => { }), 3000);
                }
                else if (i.customId === 'regenerate') {
                    await i.reply({ content: '📡 Re-aligning satellites... (Regeneration placeholder)', ephemeral: true });
                }
            });

            collector.on('end', () => {
                const disabledRow = new ActionRowBuilder();
                actionRow.components.forEach(c => disabledRow.addComponents(ButtonBuilder.from(c).setDisabled(true)));
                interaction.editReply({ components: [disabledRow] }).catch(() => { });
            });

        } catch (error) {
            clearInterval(animationInterval);
            console.error('AI Error:', error);

            const errorEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setTitle('⚠️ Link Severed')
                .setDescription(`Atmospheric interference prevented response.\n${error.message}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed], components: [] });
        }
    }
};

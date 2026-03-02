const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');
const Confession = require('../../models/Confession');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Submit an anonymous confession to the confessions channel.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your confession message (will be posted anonymously)')
                .setRequired(true)
                .setMaxLength(2000)
        ),

    async execute(interaction, client) {
        const confessionText = interaction.options.getString('message');
        const confessionsChannelId = '1467457036395614311';

        // Defer reply to keep it private
        await interaction.deferReply({ ephemeral: true });

        try {
            // Get the confessions channel
            const confessionsChannel = interaction.guild.channels.cache.get(confessionsChannelId);
            
            if (!confessionsChannel) {
                return interaction.editReply({
                    content: '❌ Confessions channel not found. Please contact an administrator.'
                });
            }

            // Check if channel is text-based
            if (!confessionsChannel.isTextBased()) {
                return interaction.editReply({
                    content: '❌ The configured confessions channel is not a text channel.'
                });
            }

            // Generate unique confession ID
            const confessionId = `CONF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

            // Create embed for the confession
            const confessionEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.SECONDARY)
                .setTitle('🌑 Anonymous Confession')
                .setDescription(confessionText)
                .setFooter({ 
                    text: `Confession #${confessionId.split('-')[1].slice(-6)} • ${THEME.FOOTER.text}`, 
                    iconURL: THEME.FOOTER.iconURL 
                })
                .setTimestamp();

            // Send confession to the channel
            const sentMessage = await confessionsChannel.send({ embeds: [confessionEmbed] });

            // Save to database
            const confession = new Confession({
                confessionId: confessionId,
                guildId: interaction.guild.id,
                userId: interaction.user.id,
                content: confessionText,
                messageId: sentMessage.id,
                createdAt: new Date()
            });

            await confession.save();

            // Confirm to user first (ephemeral - only they can see it)
            const successEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.SUCCESS)
                .setTitle('✅ Confession Submitted')
                .setDescription('Your confession has been anonymously posted to the confessions channel.')
                .setFooter(THEME.FOOTER)
                .setTimestamp();

            await interaction.editReply({ embeds: [successEmbed] });

            // Log to confession logs channel
            const confessionLogsChannelId = '1467478374229213269';
            
            try {
                // Use client to get channel (more reliable)
                let confessionLogsChannel = interaction.client.channels.cache.get(confessionLogsChannelId);
                
                if (!confessionLogsChannel) {
                    confessionLogsChannel = await interaction.client.channels.fetch(confessionLogsChannelId).catch(() => null);
                }
                
                if (confessionLogsChannel && confessionLogsChannel.isTextBased()) {
                    // Truncate confession text if too long (field limit is 1024)
                    const maxLength = 1000;
                    const truncatedText = confessionText.length > maxLength 
                        ? confessionText.substring(0, maxLength) + '...' 
                        : confessionText;

                    const logEmbed = new EmbedBuilder()
                        .setColor(THEME.COLORS.ACCENT || '#00F3FF')
                        .setAuthor({ 
                            name: '📝 Confession Log', 
                            iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
                        })
                        .setDescription(
                            `**User:** ${interaction.user} (${interaction.user.id})\n` +
                            `**Confession ID:** #${confessionId.split('-')[1].slice(-6)}\n` +
                            `**Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
                            `**Message:**\n${truncatedText}`
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    await confessionLogsChannel.send({ embeds: [logEmbed] });
                    console.log(`✅ Confession logged successfully for user ${interaction.user.tag} (${interaction.user.id})`);
                } else {
                    console.error(`❌ Confession logs channel ${confessionLogsChannelId} not found or not accessible`);
                }
            } catch (logError) {
                console.error('❌ Error logging confession:', logError);
                console.error('Error message:', logError.message);
                console.error('Channel ID:', confessionLogsChannelId);
            }

        } catch (error) {
            console.error('Confession Error:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.ERROR)
                .setTitle('❌ Submission Failed')
                .setDescription(`An error occurred while posting your confession.\n${error.message}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};

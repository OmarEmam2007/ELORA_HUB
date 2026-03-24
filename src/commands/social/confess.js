const { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const THEME = require('../../utils/theme');
const Confession = require('../../models/Confession');

module.exports = {
    name: 'confess',
    data: new SlashCommandBuilder()
        .setName('confess')
        .setDescription('Submit an anonymous confession to the confessions channel.')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Your confession message (will be posted anonymously)')
                .setRequired(true)
                .setMaxLength(2000)
        ),

    async execute(ctx, client, args) {
        const isInteraction = Boolean(
            ctx &&
            typeof ctx === 'object' &&
            typeof ctx.isChatInputCommand === 'function' &&
            ctx.isChatInputCommand()
        );
        const confessionText = isInteraction
            ? ctx.options.getString('message')
            : (Array.isArray(args) ? args.join(' ').trim() : '').trim();

        const confessionsChannelId = '1467457036395614311';

        if (!confessionText) {
            if (isInteraction) {
                return ctx.reply({ content: '❌ Please provide a confession message.', ephemeral: true });
            }
            return ctx.reply('❌ Please provide a confession message. Example: `.confess i like...`');
        }

        if (isInteraction) {
            // Defer reply to keep it private
            await ctx.deferReply({ ephemeral: true });
        }

        try {
            // Get the confessions channel
            const guild = isInteraction ? ctx.guild : ctx.guild;
            const confessionsChannel = guild?.channels?.cache?.get(confessionsChannelId);
            
            if (!confessionsChannel) {
                if (isInteraction) {
                    return ctx.editReply({
                        content: '❌ Confessions channel not found. Please contact an administrator.'
                    });
                }
                return ctx.reply('❌ Confessions channel not found. Please contact an administrator.');
            }

            // Check if channel is text-based
            if (!confessionsChannel.isTextBased()) {
                if (isInteraction) {
                    return ctx.editReply({
                        content: '❌ The configured confessions channel is not a text channel.'
                    });
                }
                return ctx.reply('❌ The configured confessions channel is not a text channel.');
            }

            // Generate unique confession ID
            const confessionId = `CONF-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

            const jennieGifPath = path.join(__dirname, '../../../assets/jennie2.gif');
            const jennieGifFallbackPath = path.join(__dirname, '../../assets/jennie2.gif');
            const files = [];
            if (fs.existsSync(jennieGifPath)) {
                files.push(new AttachmentBuilder(jennieGifPath, { name: 'jennie2.gif' }));
            } else if (fs.existsSync(jennieGifFallbackPath)) {
                files.push(new AttachmentBuilder(jennieGifFallbackPath, { name: 'jennie2.gif' }));
            } else {
                console.warn(`[CONFESS] Missing GIF file: ${jennieGifPath}`);
            }

            // Create embed for the confession
            const confessionEmbed = new EmbedBuilder()
                .setColor(THEME.COLORS.GRAVITY || THEME.COLORS.PRIMARY)
                .setTitle('▫️ New Confession')
                .setDescription(confessionText)
                .setFooter({ 
                    text: `ELORA Confessions • #${confessionId.split('-')[1].slice(-6)}`
                })
                .setTimestamp();

            if (files.length) {
                confessionEmbed.setImage('attachment://jennie2.gif');
            }

            // Send confession to the channel
            const sentMessage = await confessionsChannel.send({ embeds: [confessionEmbed], files });

            // Save to database
            const confession = new Confession({
                confessionId: confessionId,
                guildId: guild.id,
                userId: isInteraction ? ctx.user.id : ctx.author.id,
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

            if (isInteraction) {
                await ctx.editReply({ embeds: [successEmbed] });
            } else {
                await ctx.reply({ embeds: [successEmbed] });
            }

            // Log to confession logs channel
            const confessionLogsChannelId = '1467478374229213269';
            
            try {
                // Use client to get channel (more reliable)
                const discordClient = isInteraction ? ctx.client : client;
                let confessionLogsChannel = discordClient.channels.cache.get(confessionLogsChannelId);
                
                if (!confessionLogsChannel) {
                    confessionLogsChannel = await discordClient.channels.fetch(confessionLogsChannelId).catch(() => null);
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
                            iconURL: (isInteraction ? ctx.user : ctx.author).displayAvatarURL({ dynamic: true }) 
                        })
                        .setDescription(
                            `**User:** ${(isInteraction ? ctx.user : ctx.author)} (${(isInteraction ? ctx.user : ctx.author).id})\n` +
                            `**Confession ID:** #${confessionId.split('-')[1].slice(-6)}\n` +
                            `**Submitted:** <t:${Math.floor(Date.now() / 1000)}:F>\n\n` +
                            `**Message:**\n${truncatedText}`
                        )
                        .setThumbnail((isInteraction ? ctx.user : ctx.author).displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    await confessionLogsChannel.send({ embeds: [logEmbed] });
                    console.log(`✅ Confession logged successfully for user ${(isInteraction ? ctx.user : ctx.author).tag} (${(isInteraction ? ctx.user : ctx.author).id})`);
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

            if (isInteraction) {
                await ctx.editReply({ embeds: [errorEmbed] });
            } else {
                await ctx.reply({ embeds: [errorEmbed] });
            }
        }
    },
};

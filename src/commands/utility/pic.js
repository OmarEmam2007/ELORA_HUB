const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('../../utils/theme');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pic')
        .setDescription('View a member\'s profile picture or banner.')
        .addStringOption(option =>
            option.setName('target')
                .setDescription('What image do you want to see?')
                .setRequired(true)
                .addChoices(
                    { name: 'Profile Picture (PFP)', value: 'pfp' },
                    { name: 'Banner', value: 'banner' },
                    { name: 'Both', value: 'both' },
                )
        )
        .addUserOption(option =>
            option.setName('user')
                .setDescription('The member to check (defaults to you).')
                .setRequired(false)
        ),

    async execute(interaction) {
        await interaction.deferReply();

        const choice = interaction.options.getString('target');
        const userOption = interaction.options.getUser('user') || interaction.user;

        try {
            // Force fetch user to get the banner
            const user = await interaction.client.users.fetch(userOption.id, { force: true });

            const avatarURL = user.displayAvatarURL({ dynamic: true, size: 1024 });
            const bannerURL = user.bannerURL({ dynamic: true, size: 1024 });

            const embeds = [];

            // Helper to create basic embed structure
            const createEmbed = (title, imageUrl) => {
                return new EmbedBuilder()
                    .setColor(THEME.COLORS.PRIMARY) // Using Primary color from theme
                    .setAuthor({ name: user.username, iconURL: avatarURL })
                    .setTitle(title)
                    .setImage(imageUrl)
                    .setFooter(THEME.FOOTER)
                    .setTimestamp();
            };

            if (choice === 'pfp' || choice === 'both') {
                embeds.push(createEmbed('Profile Picture', avatarURL));
            }

            if (choice === 'banner' || choice === 'both') {
                if (bannerURL) {
                    const bannerEmbed = createEmbed('Banner', bannerURL);
                    // If showing only banner, maybe change color or keep consistent
                    bannerEmbed.setColor(user.hexAccentColor || THEME.COLORS.SECONDARY);
                    embeds.push(bannerEmbed);
                } else {
                    if (choice === 'banner') {
                        // User specifically asked for banner but none exists
                        return interaction.editReply({ 
                            embeds: [
                                new EmbedBuilder()
                                    .setColor(THEME.COLORS.ERROR)
                                    .setDescription(`🚫 **${user.username}** does not have a banner set.`)
                            ]
                        });
                    }
                    // If choice is 'both' and no banner, we just don't add the banner embed
                    // but maybe we should add a small note? 
                    // For now, let's just show the PFP if 'both' is selected and no banner exists.
                }
            }

            await interaction.editReply({ embeds: embeds });

        } catch (error) {
            console.error('Error in /pic command:', error);
            await interaction.editReply({ 
                content: 'An error occurred while fetching the images.', 
                ephemeral: true 
            });
        }
    }
};

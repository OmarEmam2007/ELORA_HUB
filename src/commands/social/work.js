const { EmbedBuilder } = require('discord.js');
const User = require('../../models/User');
const THEME = require('../../utils/theme');

const JOBS = [
    { name: 'Software Developer', min: 200, max: 500 },
    { name: 'Discord Moderator', min: 150, max: 400 },
    { name: 'Content Creator', min: 100, max: 350 },
    { name: 'Gamer', min: 50, max: 250 },
    { name: 'Streamer', min: 300, max: 600 },
    { name: 'Designer', min: 180, max: 450 }
];

module.exports = {
    name: 'work',
    aliases: ['job'],
    async execute(message, client, args) {
        let userProfile = await User.findOne({ userId: message.author.id, guildId: message.guild.id });
        if (!userProfile) {
            userProfile = new User({ userId: message.author.id, guildId: message.guild.id });
        }

        const cooldown = 3 * 60 * 60 * 1000;
        const lastWork = userProfile.lastWorkTimestamp || 0;
        const now = Date.now();

        if (now - lastWork < cooldown) {
            const timeLeft = cooldown - (now - lastWork);
            const hours = Math.floor(timeLeft / (1000 * 60 * 60));
            const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
            return message.reply({ embeds: [new EmbedBuilder().setColor(THEME.COLORS.WARNING).setDescription(`⏳ You can work again in **${hours}h ${minutes}m**.`)] });
        }

        const job = JOBS[Math.floor(Math.random() * JOBS.length)];
        const earnings = Math.floor(Math.random() * (job.max - job.min + 1)) + job.min;

        userProfile.wallet = (userProfile.wallet || 0) + earnings;
        userProfile.lastWorkTimestamp = now;
        await userProfile.save();

        const embed = new EmbedBuilder()
            .setColor(THEME.COLORS.SUCCESS)
            .setTitle('💼 Work Complete!')
            .setDescription(`You worked as a **${job.name}** and earned \`${earnings.toLocaleString()}\` coins!`)
            .setFooter(THEME.FOOTER)
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }
};

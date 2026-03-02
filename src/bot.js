require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, Partials, ActivityType, Collection } = require('discord.js');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction]
});

client.commands = new Collection();
client.config = require('../config.json');

const app = express();
app.get('/', (req, res) => res.send('ELORA HUB is Online'));
app.listen(process.env.PORT || 7860, () => console.log('✅ Web server ready'));

client.once('ready', () => {
    try {
        client.user.setActivity('𝐄𝐋𝐎𝐑𝐀 𝐇𝐔𝐁', { 
            type: ActivityType.Streaming, 
            url: 'https://www.twitch.tv/discord' 
        });
    } catch (_) { }
    console.log(`✅ [ELORA HUB] Logged in as ${client.user.tag}`);
});

(async () => {
    try {
        const token = process.env.DISCORD_TOKEN;
        if (!token) throw new Error('Missing DISCORD_TOKEN');

        const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
        if (mongoUri) {
            await mongoose.connect(mongoUri);
            console.log('✅ MongoDB connected');
        }

        await loadCommands(client);
        console.log('✅ [ELORA HUB] Loaded: Utility Commands');
        console.log('✅ [ELORA HUB] Loaded: Confessions System');
        await loadEvents(client);
        await client.login(token);
    } catch (err) {
        console.error('❌ [ELORA HUB] Startup error:', err);
        process.exitCode = 1;
    }
})();

process.on('unhandledRejection', (reason) => console.error('❌ [Unhandled Rejection]', reason));
process.on('uncaughtException', (error) => console.error('❌ [Uncaught Exception]', error));

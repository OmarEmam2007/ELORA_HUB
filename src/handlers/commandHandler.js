const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

async function loadCommands(client) {
    const { Collection } = require('discord.js');
    if (!client.commands) client.commands = new Collection();
    let commandsArray = [];
    const folders = fs.readdirSync(path.join(__dirname, '../commands'));
    for (const folder of folders) {
        const files = fs
            .readdirSync(path.join(__dirname, `../commands/${folder}`))
            .filter((file) => file.endsWith('.js'))
            .filter((file) => !file.includes('-old') && !file.includes('-new'))
            .filter((file) => file !== 'pic.js');
        for (const file of files) {
            const command = require(`../commands/${folder}/${file}`);
            if (command.data) {
                client.commands.set(command.data.name, command);
                commandsArray.push(command.data.toJSON());
                console.debug(`✅ Successfully loaded: ${file}`);
                if (file === 'confess.js') {
                    console.debug('[SUCCESS] confess.js is no longer empty and has been loaded');
                }
            }
        }
    }

    commandsArray = Array.from(
        commandsArray.reduce((map, cmd) => map.set(cmd.name, cmd), new Map()).values()
    );

    const registerGuildCommandsSafely = async (guild) => {
        try {
            const withTimeout = async (promise, ms, label) => {
                let t;
                const timeout = new Promise((_, reject) => {
                    t = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
                });
                try {
                    return await Promise.race([promise, timeout]);
                } finally {
                    clearTimeout(t);
                }
            };

            const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

            const token = process.env.DISCORD_TOKEN;
            if (!token) throw new Error('Missing DISCORD_TOKEN for slash command registration');
            const rest = new REST({ version: '10' }).setToken(token);

            const appId = client.application?.id;
            if (!appId) throw new Error('Missing application id for slash command registration');

            // Do not clear commands before we know the payload is valid.
            // A failed bulk registration (e.g., 50035) would otherwise wipe all guild commands.
            console.log(`ℹ️ Slash register REST PUT: guild=${guild.id} commands=${commandsArray.length}`);

            const maxAttempts = 3;
            let lastErr;
            for (let attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    if (attempt > 1) console.log(`ℹ️ Slash register retry attempt ${attempt}/${maxAttempts}...`);

                    await withTimeout(
                        rest.put(Routes.applicationGuildCommands(appId, guild.id), { body: commandsArray }),
                        60_000,
                        'Slash command registration (REST PUT)'
                    );

                    lastErr = null;
                    break;
                } catch (e) {
                    lastErr = e;
                    if (attempt < maxAttempts) await sleep(1_500 * attempt);
                }
            }

            if (lastErr) throw lastErr;

            console.log(`✅ Slash Commands Registered to Guild: ${guild.name}`);
            return;
        } catch (error) {
            console.error('❌ Slash command registration failed:', error);
            // If Discord rejects the bulk payload, find the offending command.
            if (error?.code === 50035) {
                console.error('❌ Bulk guild command registration failed (50035). Locating invalid command...');
                console.error('❌ Commands were NOT cleared to avoid losing existing slash commands.');
                console.error('❌ Check the command JSON being generated, especially option lengths/choices/required fields.');

                for (const cmd of commandsArray) {
                    try {
                        await guild.commands.create(cmd);
                    } catch (e) {
                        console.error('❌ Invalid slash command payload detected.');
                        console.error('❌ Command name:', cmd?.name);
                        console.error('❌ Command JSON:', JSON.stringify(cmd));
                        console.error('❌ Discord error:', e);
                        throw e;
                    }
                }
            }
            throw error;
        }
    };

    client.on('ready', async () => {
        try {
            console.log(`ℹ️ Slash command registration check: commands=${commandsArray.length}`);
            if (!client?.application?.id) {
                try {
                    await client.application?.fetch();
                } catch (_) {
                    // ignore
                }
            }

            if (!client?.application?.id) {
                console.log('ℹ️ Skipping slash command registration: missing application id');
                return;
            }

            const guildId = process.env.GUILD_ID || client.config?.guildId;

            console.log(`ℹ️ Slash command registration target: appId=${client.application.id} guildId=${guildId || 'N/A'}`);

            if (!guildId) {
                console.log('ℹ️ Skipping slash command registration: missing GUILD_ID');
                return;
            }

            if (guildId) {
                let guild = client.guilds.cache.get(guildId);
                if (!guild) {
                    try {
                        guild = await client.guilds.fetch(guildId);
                    } catch (_) {
                        guild = null;
                    }
                }

                if (!guild) {
                    console.log(`ℹ️ Skipping slash command registration: bot is not in guild ${guildId} (or missing access)`);
                    return;
                }

                // Register to GUILD (Instant for development/primary server)
                console.log(`ℹ️ Registering slash commands to guild: ${guild.name} (${guild.id})`);
                await registerGuildCommandsSafely(guild);
                console.log(`✅ Slash command registration finished for guild: ${guild.name}`);
            }
        } catch (error) {
            console.error('❌ Error registering slash commands:', error);
        }
    });

    console.log('✅ Commands Loaded');
}

module.exports = { loadCommands };

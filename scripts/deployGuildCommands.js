require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

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

async function main() {
    const token = process.env.DISCORD_TOKEN;
    if (!token) throw new Error('Missing DISCORD_TOKEN');

    const guildId = process.env.GUILD_ID;
    if (!guildId) throw new Error('Missing GUILD_ID');

    const appId = process.env.APP_ID || process.env.CLIENT_ID;
    if (!appId) throw new Error('Missing APP_ID (or CLIENT_ID)');

    const commandsDir = path.join(__dirname, '../src/commands');
    const folders = fs.readdirSync(commandsDir);

    const commandsArray = [];
    for (const folder of folders) {
        const folderPath = path.join(commandsDir, folder);
        if (!fs.statSync(folderPath).isDirectory()) continue;

        const files = fs
            .readdirSync(folderPath)
            .filter((file) => file.endsWith('.js'))
            .filter((file) => !file.includes('-old') && !file.includes('-new'))
            .filter((file) => file !== 'pic.js');

        for (const file of files) {
            const command = require(path.join(folderPath, file));
            if (command?.data?.toJSON) {
                commandsArray.push(command.data.toJSON());
            }
        }
    }

    const unique = Array.from(
        commandsArray.reduce((map, cmd) => map.set(cmd.name, cmd), new Map()).values()
    );

    console.log(`Deploying guild commands: appId=${appId} guildId=${guildId} commands=${unique.length}`);

    const rest = new REST({ version: '10' }).setToken(token);

    const maxAttempts = 3;
    const attemptTimeoutMs = 60_000;
    const hardMaxMs = maxAttempts * attemptTimeoutMs + 15_000;

    const hardWatchdog = setTimeout(() => {
        console.error(
            `❌ Deploy hard-timeout after ${hardMaxMs}ms. ` +
            'This usually means HTTPS requests to discord.com are hanging (firewall/proxy/DNS/ISP).'
        );
        process.exit(1);
    }, hardMaxMs);

    let lastErr;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            console.log(`ℹ️ Deploy attempt ${attempt}/${maxAttempts} (timeout=${attemptTimeoutMs}ms)`);

            await withTimeout(
                rest.put(Routes.applicationGuildCommands(appId, guildId), { body: unique }),
                attemptTimeoutMs,
                'Deploy guild commands (REST PUT)'
            );

            lastErr = null;
            break;
        } catch (e) {
            lastErr = e;
            console.error(`❌ Attempt ${attempt} failed:`, e?.message || e);
            if (attempt < maxAttempts) await sleep(1_500 * attempt);
        }
    }

    clearTimeout(hardWatchdog);

    if (lastErr) throw lastErr;

    console.log('✅ Deployed guild commands successfully');
}

main().catch((e) => {
    console.error('❌ Deploy failed:', e);
    process.exitCode = 1;
});

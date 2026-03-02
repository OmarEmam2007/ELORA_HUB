const fs = require('fs');
const path = require('path');

async function loadPrefixCommands(client) {
    client.prefixCommands = new Map();
    
// 1. دي بتخلي البوت يشوف كل الفولدرات (admin, moderation, utility, etc..) لوحده
    const commandsDir = path.join(__dirname, '../commands');
    const commandFolders = fs.readdirSync(commandsDir).filter(f => 
        fs.statSync(path.join(commandsDir, f)).isDirectory()
    );
    
    for (const folder of commandFolders) {
        const folderPath = path.join(commandsDir, folder);
        
        // 2. دي بتخليه يقرأ أي ملف .js من غير شروط رخمة
        const files = fs.readdirSync(folderPath).filter(file => file.endsWith('.js'));
        
        for (const file of files) {
            try {
                const command = require(`../commands/${folder}/${file}`);
                // Support both prefix-style (.name) and slash-style (.data.name)
                const cmdName = command.name || command.data?.name;
                
                if (cmdName) {
                    client.prefixCommands.set(cmdName.toLowerCase(), command);
                    
                    // Register aliases
                    if (command.aliases && Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            client.prefixCommands.set(alias.toLowerCase(), command);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error loading prefix command ${file}:`, error);
            }
        }
    }
    
    
    // Also load prefix-specific files
    const prefixFiles = [
        path.join(__dirname, '../commands/economy/daily-prefix.js'),
        path.join(__dirname, '../commands/economy/leaderboard-prefix.js')
    ];
    
    for (const filePath of prefixFiles) {
        try {
            if (fs.existsSync(filePath)) {
                const command = require(filePath);
                if (command.name) {
                    client.prefixCommands.set(command.name.toLowerCase(), command);
                    if (command.aliases && Array.isArray(command.aliases)) {
                        for (const alias of command.aliases) {
                            client.prefixCommands.set(alias.toLowerCase(), command);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error loading prefix command ${filePath}:`, error);
        }
    }
    
    console.log(`✅ [${client.user?.tag || 'Bot'}] Loaded ${client.prefixCommands.size} prefix commands`);
}

async function handlePrefixCommand(message, client) {
    if (!message || !client || !message.content) return;
    const text = String(message.content || '').trim();
    if (!text) return;

    const PREFIX_DEBUG = process.env.PREFIX_DEBUG === '1';

    // Main prefix style: "elora <command> ..."
    const eloraPrefixMatch = text.match(/^elora\s+(.+)/i);
    const legacyPrefix = client?.config?.prefix ? String(client.config.prefix) : null;
    const bangPrefix = '!';

    let args = [];
    let commandName = null;

    if (eloraPrefixMatch) {
        args = eloraPrefixMatch[1].trim().split(/\s+/).filter(Boolean);
        commandName = String(args.shift() || '').toLowerCase();
    } else if (legacyPrefix && text.startsWith(legacyPrefix)) {
        const content = text.slice(legacyPrefix.length).trim();
        if (content) {
            args = content.split(/\s+/).filter(Boolean);
            commandName = String(args.shift() || '').toLowerCase();
        }
    } else if (text.startsWith(bangPrefix)) {
        const content = text.slice(bangPrefix.length).trim();
        if (content) {
            args = content.split(/\s+/).filter(Boolean);
            commandName = String(args.shift() || '').toLowerCase();
        }
    }

    if (!commandName) return;

    // Built-in minimal healthcheck command (does not depend on external command modules)
    if (commandName === 'ping' || commandName === 'p') {
        try {
            return await message.reply('pong 🏓');
        } catch (_) {
            return;
        }
    }

    if (commandName === 'debug') {
        try {
            return await message.reply(`✅ **Prefix Handler Active**\n- Bot: ${client.user.tag}\n- Commands Loaded: ${client.prefixCommands.size}`);
        } catch (_) {
            return;
        }
    }

    const cmd = client.prefixCommands?.get(commandName);
    if (!cmd || typeof cmd.execute !== 'function') {
        if (PREFIX_DEBUG) {
            console.log(`[PREFIX] command not found: ${commandName}`);
        }
        return;
    }

    try {
        if (PREFIX_DEBUG) {
            console.log(`[PREFIX] command=${commandName} args=${JSON.stringify(args)} fileExecuteLen=${cmd.execute.length}`);
        }

        // Compatibility: some modules use execute(message, client, args), others use execute(message, args, client)
        // Prefer the newer handler contract first.
        try {
            await cmd.execute(message, client, args);
        } catch (e) {
            // If the command expected (message, args, client) it will often throw when treating client as args.
            if (PREFIX_DEBUG) {
                console.warn(`[PREFIX] retrying signature for ${commandName} due to error:`, e?.message || e);
            }
            await cmd.execute(message, args, client);
        }
    } catch (e) {
        console.error(`[PREFIX] Failed executing ${commandName}:`, e);
    }
}

module.exports = { loadPrefixCommands, handlePrefixCommand };

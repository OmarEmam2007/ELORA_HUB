const fs = require('fs');
const path = require('path');

async function loadEvents(client) {
    const folders = fs.readdirSync(path.join(__dirname, '../events'));
    for (const folder of folders) {
        const files = fs.readdirSync(path.join(__dirname, `../events/${folder}`)).filter((file) => file.endsWith('.js'));
        for (const file of files) {
            if (folder === 'guild' && file !== 'messageCreate.js') continue;
            if (folder === 'client' && !['ready.js', 'interactionCreate.js'].includes(file)) continue;
            const event = require(`../events/${folder}/${file}`);
            if (event.rest) {
                if (event.once)
                    client.rest.once(event.name, (...args) => event.execute(...args, client));
                else
                    client.rest.on(event.name, (...args) => event.execute(...args, client));
            } else {
                if (event.once)
                    client.once(event.name, (...args) => event.execute(...args, client));
                else
                    client.on(event.name, (...args) => event.execute(...args, client));
            }
        }
    }
    console.log('✅ Events Loaded');
}

module.exports = { loadEvents };

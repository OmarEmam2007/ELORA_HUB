const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('./theme');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const ASSET_FILES = {
    wrong: '9596-wrong.gif',
    ok: '28943-check-yes2.gif',
    loading: '1181-maruloader.gif',
    diamond: '8367-white-diamond.gif',
    epic: '557037-whitesilverbowgif.gif',
    role: '1415-roletank.png',
    moon: 'moon.jpg',
    info: '627252-info.png',
    cooldown: '8649-cooldown.png',
    locked: '3409-locked.png',
    unlock: '28110-unlock.png',
    security: '2879-checksecurity.png',
    money: '19128-ice-spice-money.gif'
};

function buildAssetAttachment(key) {
    const fileName = ASSET_FILES[key];
    if (!fileName) return null;

    const filePath = path.join(ASSETS_DIR, fileName);
    const name = fileName;

    const attachment = new AttachmentBuilder(filePath, { name });
    return { attachment, url: `attachment://${name}` };
}

function makeStatusEmbed({
    title,
    description,
    variant = 'PRIMARY',
    assetKey = null,
    assetPlacement = 'image',
    emoji = null,
    author = 'Elora RENDER',
    compact = false
} = {}) {
    const embed = THEME.makeEmbed(EmbedBuilder, variant);

    if (author) embed.setAuthor({ name: author });
    if (title) embed.setTitle(`${emoji ? `${emoji} ` : ''}${title}`);

    if (description) {
        embed.setDescription(compact ? `${description}` : `${description}`);
    }

    const asset = assetKey ? buildAssetAttachment(assetKey) : null;
    if (asset?.url) {
        if (assetPlacement === 'thumbnail') embed.setThumbnail(asset.url);
        else embed.setImage(asset.url);
    }

    const files = asset?.attachment ? [asset.attachment] : [];
    return { embed, files, asset };
}

function makeSuccess({ title = 'Success', description, assetKey = 'ok' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'SUCCESS', assetKey, emoji: '✅', author: 'Elora RENDER' });
}

function makeError({ title = 'Error', description, assetKey = 'wrong' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'ERROR', assetKey, emoji: '❌', author: 'Elora RENDER' });
}

function makeLoading({ title = 'Loading...', description, assetKey = 'loading' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'WARNING', assetKey, emoji: '⏳', author: 'Elora RENDER' });
}

function makeInfo({ title = 'Info', description, assetKey = 'info' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'PRIMARY', assetKey, emoji: 'ℹ️', author: 'Elora RENDER', assetPlacement: 'thumbnail' });
}

function makeCooldown({ title = 'Cooldown', description, assetKey = 'cooldown' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'WARNING', assetKey, emoji: '🕒', author: 'Elora RENDER', assetPlacement: 'thumbnail' });
}

function makeSecurity({ title = 'Security', description, assetKey = 'security' } = {}) {
    return makeStatusEmbed({ title, description, variant: 'SECONDARY', assetKey, emoji: '🛡️', author: 'Elora RENDER', assetPlacement: 'thumbnail' });
}

function toReplyPayload({ embed, files }, { ephemeral = false } = {}) {
    return { embeds: [embed], files: files || [], ephemeral };
}

module.exports = {
    ASSET_FILES,
    buildAssetAttachment,
    makeStatusEmbed,
    makeSuccess,
    makeError,
    makeLoading,
    makeInfo,
    makeCooldown,
    makeSecurity,
    toReplyPayload
};

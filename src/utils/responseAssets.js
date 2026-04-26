const path = require('path');
const { AttachmentBuilder, EmbedBuilder } = require('discord.js');
const THEME = require('./theme');

const ASSETS_DIR = path.join(__dirname, '..', '..', 'assets');

const ASSET_FILES = {
    wrong: 'new banner1.png',
    ok: 'new banner1.png',
    loading: 'new banner1.png',
    diamond: 'new banner1.png',
    epic: 'new banner1.png',
    role: 'new banner1.png',
    moon: 'new banner1.png',
    info: 'new banner1.png',
    cooldown: 'new banner1.png',
    locked: 'new banner1.png',
    unlock: 'new banner1.png',
    security: 'new banner1.png',
    money: 'new banner1.png'
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

const { SlashCommandBuilder } = require('discord.js');
const giveawayService = require('../../services/giveawayService');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('gwy_invites')
        .setDescription('Check a user\'s valid giveaway invites (current active giveaway)')
        .addUserOption(opt => opt.setName('user').setDescription('Target user').setRequired(true)),
    async execute(interaction) {
        try {
            const active = giveawayService.getActiveGiveaway();
            if (!active) {
                return interaction.reply({ content: giveawayService.boldAll('▫️ No active giveaway.'), ephemeral: true }).catch(() => { });
            }

            const member = interaction.member;
            const isStaff = member?.permissions?.has?.('Administrator') || member?.permissions?.has?.('ManageGuild');
            if (!isStaff) {
                return interaction.reply({ content: giveawayService.boldAll('▫️ You do not have permission to use this.'), ephemeral: true }).catch(() => { });
            }

            const user = interaction.options.getUser('user', true);
            const count = giveawayService.getUserInvitesForActive(user.id);
            return interaction.reply({ content: giveawayService.boldAll(`▫️ Valid Invites For ${user}: ${count}`), ephemeral: true }).catch(() => { });
        } catch (_) {
            // ignore
        }
    }
};

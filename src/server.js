import config from './config.js';
import { Client } from 'discord.js-selfbot-v13';
import { joinVoiceChannel } from '@discordjs/voice';

console.log('l1ve709');

for (let index = 0; index < config.TOKENS.length; index++) {
    let token = config.TOKENS[index];
    const client = new Client({ checkUpdate: false });

    client.login(token)
        .then(() => console.log(`[${client.user.tag}] girdi`))
        .catch(() => console.log(index + 1 + '. Token fail xx'));

    client.on('ready', () => {
        const guild = client.guilds.cache.get(config.guildId);
        if (!guild) return console.log('Sunucu bulunamadı.');

        const voiceChannel = guild.channels.cache.get(config.channelIds[index]);
        if (!voiceChannel) return console.log(`Ses kanalı bulunamadı: ${config.channelIds[index]}`);

        joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            group: client.user.id
        });

        console.log(`[${client.user.tag}] Ses kanalına katıldı: ${voiceChannel.name}`);

        if (index < 2) {                                         // ? This area special status place
            client.user.setPresence({
                activities: [{
                    name: 'l1ve709.com',
                    type: 'STREAMING',
                    url: 'https://twitch.tv/edizsonmez'
                }],
                status: 'dnd'
            });
            console.log(`[${client.user.tag}] Yayın açtı.`);
        }

        if (index === 2) {
            client.user.setPresence({
                activities: [{
                    name: 'CAM',
                    type: 'CUSTOM',
                    state: 'l1ve709.com'
                }],
                status: 'dnd'
            });
            console.log(`[${client.user.tag}] .`);
        }
    });
}
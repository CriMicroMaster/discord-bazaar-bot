const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');

// Initialize the Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// Set the bot token
const token = 'YOUR_BOT_TOKEN'; // Replace with your bot's token

client.once('ready', () => {
    console.log('Soundboard bot is ready!');
});

// Command to join a voice channel and play a random sound
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'playsound') {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply('You need to be in a voice channel to use this command!');
        }

        // Get a random sound file from the 'Sounds' folder
        const soundDir = path.join(__dirname, 'Sounds');
        const soundFiles = fs.readdirSync(soundDir);
        const randomSound = soundFiles[Math.floor(Math.random() * soundFiles.length)];
        const soundPath = path.join(soundDir, randomSound);

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        // Create an audio player and play the random sound
        const player = createAudioPlayer();
        const resource = createAudioResource(soundPath);
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy(); // Leave the channel after the sound is finished
        });

        await interaction.reply(`Playing: **${randomSound}**`);
    }
});

client.login(token);

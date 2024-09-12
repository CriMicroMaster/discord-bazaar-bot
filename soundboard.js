const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const { Client, GatewayIntentBits } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { VolumeTransformer } = require('prism-media');

require('dotenv').config();

// Initialize the Discord client
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates] });

// Set the bot token
const token = process.env.token; // Replace with your bot's token

client.once('ready', () => {
    console.log('Soundboard bot is ready!');
});

// Command to join a voice channel and play a random sound
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'playsound') {
        const folder = interaction.options.getString('folder');
        const folders = ['Random', 'British'];

        let soundDir;

        if (folders.includes(folder)) {
            soundDir = path.join(__dirname, 'Sounds', folder);
        } else if (!folder) {
            // Choose a random folder if none is specified
            soundDir = path.join(__dirname, 'Sounds', folders[Math.floor(Math.random() * folders.length)]);
        } else {
            return interaction.reply({ content: 'Invalid folder specified. Use "Random" or "British".', ephemeral: true });
        }

        if (!fs.existsSync(soundDir)) {
            return interaction.reply({ content: 'The specified folder does not exist.', ephemeral: true });
        }

        // Get a random sound file from the chosen folder
        const soundFiles = fs.readdirSync(soundDir);
        if (soundFiles.length === 0) {
            return interaction.reply({ content: 'No sound files found in the folder.', ephemeral: true });
        }
        const randomSound = soundFiles[Math.floor(Math.random() * soundFiles.length)];
        const soundPath = path.join(soundDir, randomSound);
        
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return interaction.reply({ content: 'You need to be in a voice channel to use this command!', ephemeral: true });
        }

        // Get the volume option
        const volume = interaction.options.getNumber('volume') || 1; // Default to 1 if not provided

        // Validate the volume value
        if (volume < 0.1 || volume > 2) {
            return interaction.reply('Volume must be between 0.1 and 2.');
        }

        // Join the voice channel
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: channel.guild.id,
            adapterCreator: channel.guild.voiceAdapterCreator,
        });

        // Create an audio player and play the random sound
        const player = createAudioPlayer();
        const resource = createAudioResource(soundPath, {
            inlineVolume: true // Enable volume control
        });

        resource.volume.setVolume(volume);
        
        player.play(resource);
        connection.subscribe(player);

        player.on(AudioPlayerStatus.Idle, () => {
            connection.destroy(); // Leave the channel after the sound is finished
        });

        await interaction.reply({ content: `Playing: **${randomSound}**`, ephemeral: true });
    }
});

client.login(token);

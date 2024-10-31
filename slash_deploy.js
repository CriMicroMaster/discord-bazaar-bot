const { REST, Routes, SlashCommandBuilder } = require("discord.js");

require('dotenv').config();

const botID = "1278315648493027378"; // Your bot's ID
const serverID = "1278098250330537994"; // Your server's ID
const botToken = process.env.token;

const rest = new REST().setToken(botToken);

const slashRegister = async () => {
  try {
    await rest.put(Routes.applicationGuildCommands(botID, serverID), {
      body: [
        new SlashCommandBuilder()
          .setName("balance")
          .setDescription("Check your wallet balance or another user's balance")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user whose balance you want to check")
              .setRequired(false),
          ),
        new SlashCommandBuilder()
          .setName("give")
          .setDescription("Give gold to another user")
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user to give gold to")
              .setRequired(true),
          )
          .addIntegerOption((option) =>
            option
              .setName("amount")
              .setDescription("The amount of gold to give")
              .setRequired(true),
          ),
        new SlashCommandBuilder()
          .setName("coinflip")
          .setDescription("Flip a coin to double your gold or lose it all")
          .addIntegerOption((option) =>
            option
              .setName("amount")
              .setDescription("The amount of gold to bet")
              .setRequired(true)
              .setMinValue(1),
          ),
        new SlashCommandBuilder()
          .setName("daily")
          .setDescription("Claim your daily reward of 50 gold"),
        new SlashCommandBuilder()
          .setName("leaderboard")
          .setDescription("Show the top users based on their gold balance"),
        new SlashCommandBuilder()
          .setName("manage")
          .setDescription("Administrative command to manage the economy")
          .addSubcommand(subcommand =>
            subcommand
              .setName("add")
              .setDescription("Add gold to a user's balance")
              .addUserOption(option =>
                option
                  .setName("user")
                  .setDescription("The user to add gold to")
                  .setRequired(true))
              .addIntegerOption(option =>
                option
                  .setName("amount")
                  .setDescription("The amount of gold to add")
                  .setRequired(true)))
          .addSubcommand(subcommand =>
            subcommand
              .setName("remove")
              .setDescription("Remove gold from a user's balance")
              .addUserOption(option =>
                option
                  .setName("user")
                  .setDescription("The user to remove gold from")
                  .setRequired(true))
              .addIntegerOption(option =>
                option
                  .setName("amount")
                  .setDescription("The amount of gold to remove")
                  .setRequired(true)))
          .addSubcommand(subcommand =>
            subcommand
              .setName("reset")
              .setDescription("Reset a user's balance to 0")
              .addUserOption(option =>
                option
                  .setName("user")
                  .setDescription("The user to reset")
                  .setRequired(true)))
          .addSubcommand(subcommand =>
              subcommand
                .setName("reset-warnings")
                .setDescription("Reset warnings of an user")
                .addUserOption(option =>
                  option
                    .setName("user")
                    .setDescription("The user to reset")
                    .setRequired(true))),
        new SlashCommandBuilder()
          .setName('stats')
          .setDescription('Displays your stats or the stats of a mentioned user.')
          .addUserOption(option => 
            option.setName('user')
              .setDescription('The user whose stats you want to check.')
              .setRequired(false)),
        new SlashCommandBuilder()
          .setName('blackjack')
          .setDescription('Play a game of blackjack and bet some gold!')
          .addIntegerOption(option =>
            option.setName('bet')
              .setDescription('The amount of gold to bet.')
              .setRequired(true)
              .setMinValue(1)), // Minimum bet of 1 gold
        new SlashCommandBuilder()
          .setName('playsound')
          .setDescription('Play a random sound from the soundboard')
          .addNumberOption(option =>
              option.setName('volume')
                  .setDescription('Volume of the sound (0.1 to 2)')
                  .setRequired(false)
                  .setMinValue(0.1)
                  .setMaxValue(2))
          .addStringOption(option =>
              option.setName('folder')
                  .setDescription('The folder to play sounds')
                  .setRequired(false)
                  .addChoices(
                      { name: 'Random', value: 'Random' },
                      { name: 'British', value: 'British' }
                  )),
        new SlashCommandBuilder()
          .setName('warn')
          .setDescription('Warn Admin Command')
          .addUserOption((option) =>
            option
              .setName("user")
              .setDescription("The user whose balance you want to check")
              .setRequired(false),
          ),
        new SlashCommandBuilder()
          .setName('checkwarnings')
          .setDescription('Admin Command - Check warnings leaderboard'),
      ],
    });

    console.log("Successfully registered application (/) commands.");
  } catch (error) {
    console.error("Error registering commands:", error);
  }
};

slashRegister();

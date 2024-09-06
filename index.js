const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Colors, PermissionsBitField  } = require("discord.js");
const { Sequelize, DataTypes, Op } = require("sequelize");
const slash_deploy = require("./slash_deploy.js")
const keep_alive = require("./keep_alive.js");

require('dotenv').config();

const afkChannelId = "1281677190592725032";
const targetChannelId = '1280899273759916206';

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

async function addXP(userId, amount) {
  const [wallet] = await Wallet.findOrCreate({
    where: { userId: userId },
  });
  
  wallet.xp += amount;

  const levelUpThreshold = 100; // XP required to level up
  let leveledUp = false;

  // Check if user should level up
  while (wallet.xp >= wallet.level * levelUpThreshold) {
    wallet.xp -= wallet.level * levelUpThreshold;
    wallet.level += 1;
    leveledUp = true;
  }

  await wallet.save();

  return { leveledUp, level: wallet.level, xp: wallet.xp };
}

const getRandomReward = (rewards) => {
  const random = Math.random();
  let cumulativeChance = 0;

  for (const reward of rewards) {
    cumulativeChance += reward.chance;
    if (random < cumulativeChance) {
      return reward.item;
    }
  }
};

// Initialize Sequelize with SQLite
const sequelize = new Sequelize({
  dialect: "sqlite",
  storage: "wallets.sqlite", // This is the file where your data will be stored
});

// Define a Wallet model
const Wallet = sequelize.define("Wallet", {
  userId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  gold: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  xp: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    allowNull: false,
  },
  level: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false,
  },
  lastDailyReward: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

// Synchronize the database
sequelize.sync();

const logChannelId = "1278356566999044169"; // Channel ID for logging
const TRAVELING_MERCHANT_ROLE_ID = "1278408050478157854";

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const userId = interaction.user.id;

  if (interaction.commandName === "balance") {
    // Check if a user was mentioned
    const targetUser = interaction.options.getUser("user") || interaction.user;

    // Find or create the wallet for the target user
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: targetUser.id },
    });

    await interaction.reply({
      content: `${targetUser.username} has ${wallet.gold} gold.`,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "manage") {
    const adminRoleId = '1278099156900122666'; // Replace with your admin role ID
    const user = interaction.options.getUser("user");
    const amount = interaction.options.getInteger("amount");
    const subcommand = interaction.options.getSubcommand();
  
    // Check if the user has the admin role
    if (!interaction.member.roles.cache.has(adminRoleId)) {
      return await interaction.reply({
        content: "You don't have permission to use this command.",
        ephemeral: true,
      });
    }
  
    const [wallet] = await Wallet.findOrCreate({ where: { userId: user.id } });
  
    if (subcommand === "add") {
      wallet.gold += amount;
      await interaction.reply({
        content: `Added ${amount} gold to ${user.username}.`,
        ephemeral: true,
      });
    } else if (subcommand === "remove") {
      if (wallet.gold >= amount) {
        wallet.gold -= amount;
        await interaction.reply({
          content: `Removed ${amount} gold from ${user.username}.`,
          ephemeral: true,
        });
      } else {
        await interaction.reply({
          content: `${user.username} doesn't have enough gold to remove that amount.`,
          ephemeral: true,
        });
      }
    } else if (subcommand === "reset") {
      wallet.gold = 0;
      await interaction.reply({
        content: `${user.username}'s balance has been reset to 0.`,
        ephemeral: true,
      });
    }
  
    await wallet.save();
  }

  if (interaction.commandName === "give") {
    const amount = interaction.options.getInteger("amount");
    const targetUser = interaction.options.getUser("user");

    // Find or create the target user's wallet
    const [targetWallet] = await Wallet.findOrCreate({
      where: { userId: targetUser.id },
    });

    // Find or create the sender's wallet
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: userId },
    });

    if (wallet.gold >= amount && amount > 0) {
      // Deduct gold from the sender's wallet
      wallet.gold -= amount;
      await wallet.save();

      // Add gold to the target user's wallet
      targetWallet.gold += amount;
      await targetWallet.save();

      // Reply to the command user
      await interaction.reply({
        content: `You gave ${amount} gold to ${targetUser.username}.`,
        ephemeral: true,
      });

      // Log the transaction to the specified channel
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel) {
        logChannel.send(
          `**Gold Transfer**: ${interaction.user.username} gave ${amount} gold to ${targetUser.username}.`,
        );
      }
    } else {
      await interaction.reply({
        content: "You don't have enough gold or the amount is invalid.",
        ephemeral: true,
      });
    }
  }
    
  if (interaction.commandName === "coinflip") {
    const amount = interaction.options.getInteger("amount");
    const botId = "1278315648493027378";

    const [botWallet] = await Wallet.findOrCreate({ where: { userId: botId } });

    // Find the user's wallet
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: userId },
    });

    if (amount <= 0 || wallet.gold < amount) {
      await interaction.reply({
        content: "Invalid amount or you don't have enough gold.",
        ephemeral: true,
      });
      return;
    }

    // 50/50 chance
    const flipResult = Math.random() < 0.5;

    const xpReward = Math.floor(Math.random() * 3) + 1;
    const { leveledUp, level, xp } = await addXP(userId, xpReward);
    
    if (flipResult) {
      // User wins, double the amount (add the amount to the wallet)
      wallet.gold += amount;
      botWallet.gold -= amount;
      await interaction.reply({
        content: `Congratulations! You won ${amount} gold and now have ${wallet.gold} gold.`,
        ephemeral: true,
      });

      // Log the transaction to the specified channel
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel) {
        logChannel.send(
          `**Coinflip**: ${interaction.user.username} won ${amount} gold.`,
        );
      }
    } else {
      // User loses, subtract the amount
      wallet.gold -= amount;
      botWallet.gold += amount;
      await interaction.reply({
        content: `Sorry! You lost ${amount} gold and now have ${wallet.gold} gold.`,
        ephemeral: true,
      });

      // Log the transaction to the specified channel
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel) {
        logChannel.send(
          `**Coinflip**: ${interaction.user.username} lost ${amount} gold.`,
        );
      }
    }

    if (botWallet.gold < 900) {
      botWallet.gold = Math.floor(Math.random() * 201) + 900;
    }

    await botWallet.save();
    await wallet.save();
  }

  if (interaction.commandName === "leaderboard") {
    // Fetch top 10 users sorted by gold in descending order
    const topUsers = await Wallet.findAll({
      order: [["gold", "DESC"]],
      limit: 10,
    });

    // Build leaderboard message
    let leaderboardMessage = "🏆 **Leaderboard** 🏆\n";
    for (const [index, wallet] of topUsers.entries()) {
      let username = "Unknown";
      try {
        // Attempt to fetch user from cache
        const user = await client.users.fetch(wallet.userId);
        username = user.username;
      } catch (error) {
        console.error(`Failed to fetch user with ID ${wallet.userId}:`, error);
      }

      leaderboardMessage += `**${index + 1}.** ${username} - ${wallet.gold} gold\n`;
    }

    await interaction.reply({
      content: leaderboardMessage,
      ephemeral: true,
    });
  }

  if (interaction.commandName === "daily") {
    try {
      // Find or create the user's wallet
      const [wallet] = await Wallet.findOrCreate({
        where: { userId: userId },
        defaults: { gold: 0, lastDailyReward: null },
      });

      const now = new Date();
      const lastClaim = wallet.lastDailyReward
        ? new Date(wallet.lastDailyReward)
        : null;

      // Check if the user is eligible for the daily reward
      if (!lastClaim || lastClaim.toDateString() !== now.toDateString()) {
        // Update last daily reward date
        wallet.gold += 50; // Reward amount
        wallet.lastDailyReward = now;

        const xpReward = 10;
        const { leveledUp, level, xp } = await addXP(userId, xpReward);
        
        await wallet.save();

        await interaction.reply({
          content: `You've received your daily reward of 50 gold! You now have ${wallet.gold} gold.`,
          ephemeral: true,
        });

        // Log the transaction to the specified channel
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel) {
          logChannel.send(
            `**Daily Reward**: ${interaction.user.username} claimed their daily reward`,
          );
        }
      } else {
        // User has already claimed the reward today
        await interaction.reply({
          content:
            "You've already claimed your daily reward for today. Please try again tomorrow!",
          ephemeral: true,
        });
      }
    } catch (error) {
      console.error("Error handling daily reward:", error);
      await interaction.reply({
        content:
          "An error occurred while processing your daily reward. Please try again later.",
        ephemeral: true,
      });
    }
  }
  if (interaction.commandName === "stats") {
    const targetUser = interaction.options.getUser('user') || interaction.user;
    const userId = targetUser.id;

    // Fetch or create wallet for the target user
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: userId },
      defaults: { level: 1, xp: 0, gold: 0 },
    });

    // Create the embed
    const statsEmbed = new EmbedBuilder()
      .setColor(Colors.Blue)
      .setTitle(`${targetUser.username}'s Profile`)
      .addFields(
        { name: 'Level', value: `${wallet.level || 1}`, inline: true },
        { name: 'XP', value: `${wallet.xp || 0}`, inline: true },
        { name: 'Gold Balance', value: `${wallet.gold || 0} gold`, inline: true }
      )
      .setFooter({ text: `Requested by ${interaction.user.username}` })
      .setTimestamp();

    // Send the embed
    await interaction.reply({ embeds: [statsEmbed], ephemeral: true });
  }
});

const voiceActivity = new Map();

let tempChannelCount = 1;
const tempChannels = new Map();

client.on("voiceStateUpdate", async (oldState, newState) => {
  const userId = newState.id;
  const guild = newState.guild;

  // User joins a voice channel
  if (!oldState.channelId && newState.channelId) {
    if (newState.channelId === targetChannelId) {
      const member = newState.member;

      try {
        // Get the category of the original voice channel
        const originalChannel = guild.channels.cache.get(targetChannelId);
        if (!originalChannel) return;
        const category = originalChannel.parent;
  
        // Create a new temporary voice channel in the same category
        const tempChannel = await guild.channels.create({
          name: `🍺Table ${tempChannelCount}`, // Customize the channel name as needed
          type: 2, // 2 indicates a voice channel
          parent: category, // Set the same category as the original channel
          permissionOverwrites: [
            {
              id: member.user.id,
              allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels], // Give the user permissions to connect and manage the channel
            },
          ],
        });

        tempChannels.set(tempChannel.id, tempChannel);
        tempChannelCount++; // Increment the counter for the next temporary channel
        // Move the user to the new channel
        await member.voice.setChannel(tempChannel);

      } catch (error) {
        console.error(`Error handling voice channel creation or user movement: ${error}`);
      }
    }
    // Update voice activity
    if (newState.channelId !== afkChannelId) {
      voiceActivity.set(userId, Date.now());

      const user = newState.member.user; // Get the user object from the newState
      console.log(`${user.username} joined a channel.`);
    }
  }

  // User switches channels
  if (oldState.channelId && newState.channelId) {
    // Check if the user switched to the target channel
    if (newState.channelId === targetChannelId) {
      const member = newState.member;

      try {
        // Get the category of the original voice channel
        const originalChannel = guild.channels.cache.get(targetChannelId);
        if (!originalChannel) return; // Handle case where channel is not found
        const category = originalChannel.parent;

        // Create a new temporary voice channel in the same category
        const tempChannel = await guild.channels.create({
          name: `🍺Table ${tempChannelCount}`, // Customize the channel name as needed
          type: 2, // 2 indicates a voice channel
          parent: category, // Set the same category as the original channel
          permissionOverwrites: [
            {
              id: member.user.id,
              allow: [PermissionsBitField.Flags.Connect, PermissionsBitField.Flags.ManageChannels], // Allow user to connect and manage the channel
            },
            {
              id: guild.roles.everyone.id,
              deny: [PermissionsBitField.Flags.Connect], // Prevent others from joining initially
            },
          ],
        });

        tempChannels.set(tempChannel.id, tempChannel); // Track the temporary channel
        tempChannelCount++; // Increment the counter for the next temporary channel

        // Move the user to the new channel
        await member.voice.setChannel(tempChannel);

      } catch (error) {
        console.error(`Error handling voice channel creation or user movement: ${error}`);
      }
    }

    if (newState.channelId !== afkChannelId) {
      voiceActivity.set(userId, Date.now());

      const user = newState.member.user; // Get the user object from the newState
      console.log(`${user.username} switched to another channel.`);
    }
  }
    
  // Check if the user left a temporary channel
  if (oldState.channelId) {
     if (tempChannels.has(oldState.channelId)) {
      const tempChannel = tempChannels.get(oldState.channelId);
      if (tempChannel && tempChannel.members.size === 0) {
        try {
          await tempChannel.delete(); // Delete the channel immediately
          tempChannels.delete(tempChannel.id); // Remove from the map
          tempChannelCount = Math.max(1, tempChannelCount - 1); // Ensure tempChannelCount does not go below 1
        } catch (error) {
          console.error(`Error deleting voice channel: ${error}`);
        }
      }
    }
  }

  // User leaves a voice channel
  if (oldState.channelId && !newState.channelId) {
    voiceActivity.delete(userId); // Remove the user from the map
    
    const user = oldState.member.user; // Get the user object from the oldState
    console.log(`${user.username} left a channel.`);
  }
});

client.on("messageCreate", async (message) => {
  if (message.author.bot) return; // Ignore bot messages

  const xpAmount = Math.floor(Math.random() * 3) + 1; // Random XP between 1 and 3
  const { leveledUp, level, xp } = await addXP(message.author.id, xpAmount);
});

client.on("ready", (c) => {
  console.log(`${c.user.tag} is online.`);

  // Function to update the bot's activity based on the time
  const updateActivity = () => {
    const currentHour = new Date().getHours();

    if (currentHour >= 23 || currentHour < 7) {
      // Between 23:00 and 07:00
      client.user.setActivity({
        name: "The Entrance Gates",
        type: ActivityType.Watching,
      });
    } else {
      // Between 07:00 and 23:00
      client.user.setActivity({
        name: "Peasants",
        type: ActivityType.Watching,
      });
    }
  };

  // Initial call to set the activity based on the current time
  updateActivity();

  // Set interval to check and update the activity every 15 minutes
  setInterval(updateActivity, 15 * 60 * 1000); // 15 minutes
});

setInterval(async () => {
  for (const [userId, joinTime] of voiceActivity.entries()) {
    try {
      const [wallet] = await Wallet.findOrCreate({
        where: { userId: userId },
        defaults: { gold: 0 } // Initialize with default values if needed
      });

      wallet.gold += 2;
      await wallet.save();
    } catch (error) {
      console.error(`Error updating wallet for user ${userId}:`, error);
    }
  }
}, 60000);

client.login(process.env.token);

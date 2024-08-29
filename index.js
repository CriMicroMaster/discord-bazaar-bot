const { Client, GatewayIntentBits, ActivityType } = require("discord.js");
const { Sequelize, DataTypes, Op } = require("sequelize");
const slash_deploy = require("./slash_deploy.js")
const keep_alive = require("./keep_alive.js");

require('dotenv').config();

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

const workRewards = {
  mining: { 'Iron Ore': 1, 'Gold Ore': 1 },
  fishing: { 'Fish': 2 },
  foraging: { 'Wood': 3, 'Herbs': 1 },
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
  lastDailyReward: {
    type: DataTypes.DATE,
    allowNull: true,
  },
});

const Inventory = sequelize.define("Inventory", {
  userId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: false,
  },
  items: {
    type: DataTypes.JSONB, // Store items as a JSON object
    defaultValue: {},
    allowNull: false,
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

  if (interaction.commandName === "work") {
    const workType = interaction.options.getString("type");

    if (!workRewards[workType]) {
      return await interaction.reply({
        content: "Invalid work type. Please choose from: mining, fishing, foraging.",
        ephemeral: true,
      });
    }

    const [inventory] = await Inventory.findOrCreate({
      where: { userId: userId },
    });

    const rewards = workRewards[workType];
    const items = inventory.items || {};

    for (const [item, quantity] of Object.entries(items)) {
      inventory.items = {
        ...inventory.items,
        [item]: (inventory.items[item] || 0) + quantity,
      };
    }
    
    await inventory.save();

    console.log(`Updated inventory for user ${userId}:`, inventory.items); // Debug log

    const rewardMessage = Object.entries(rewards)
      .map(([itemName, amount]) => `${amount} ${itemName}`)
      .join(", ");

    await interaction.reply({
      content: `You went ${workType} and received: ${rewardMessage}.`,
      ephemeral: true,
    });
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

  if (interaction.commandName === "inventory") {
    // Fetch the user's inventory
    const [inventory] = await Inventory.findOrCreate({
      where: { userId: userId },
    });

    // Check if the inventory is empty
    if (Object.keys(inventory.items).length === 0) {
      await interaction.reply({
        content: "Your inventory is empty.",
        ephemeral: true,
      });
      return;
    }

    // Build the inventory message
    const itemsList = Object.entries(inventory.items)
      .map(([itemName, amount]) => `${amount} ${itemName}`)
      .join(", ");

    await interaction.reply({
      content: `Your inventory: ${itemsList}`,
      ephemeral: true,
    });
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
        defaults: { gold: 100, lastDailyReward: null },
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
});

const voiceActivity = new Map();

client.on("voiceStateUpdate", (oldState, newState) => {
  const userId = newState.id;

  // User joins a voice channel
  if (!oldState.channelId && newState.channelId) {
    voiceActivity.set(userId, Date.now());
  }

  // User leaves a voice channel
  if (oldState.channelId && !newState.channelId) {
    voiceActivity.delete(userId); // Remove the user from the map
  }
});

client.on("ready", (c) => {
  console.log(`${c.user.tag} is online.`);

  // Function to update the bot's activity based on the time
  const updateActivity = () => {
    const currentHour = new Date().getHours();

    if (currentHour >= 21 || currentHour < 5) {
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
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: userId },
    });
    wallet.gold += 2;
    await wallet.save();
  }
}, 60000); // Run every minute (60000 ms)

client.login(process.env.token);

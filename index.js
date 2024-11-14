const { Client, GatewayIntentBits, ActivityType, EmbedBuilder, Colors, PermissionsBitField, ButtonBuilder, ButtonStyle, ActionRowBuilder, Time, Events, Partials } = require("discord.js");
const { Sequelize, DataTypes, Op } = require("sequelize");
const slash_deploy = require("./slash_deploy.js")
const keep_alive = require("./keep_alive.js");

require('dotenv').config();

const afkChannelId = '1281677190592725032';
const targetChannelId = '1280899273759916206';

let roleMessageId = '1306261565116387382';

const roleAssignments = {
    '🛒': '1306232809215496194',
    '📺': '1305154037439791194',
    '<:umactually:1301946370453671979>': '1305988964104142890',
    '🎮': '1278443312348659823',
};

// Initialize the Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [
    Partials.Message,
    Partials.Channel,
    Partials.Reaction
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

function getRandomCard() {
  const suits = ['♠️', '♥️', '♦️', '♣️'];
  const values = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const value = values[Math.floor(Math.random() * values.length)];
  return { suit, value };
}

function calculateHandValue(hand) {
  let value = 0;
  let aceCount = 0;

  hand.forEach(card => {
    if (card.value === 'A') {
      aceCount++;
      value += 11;
    } else if (['J', 'Q', 'K'].includes(card.value)) {
      value += 10;
    } else {
      value += parseInt(card.value);
    }
  });

  // Adjust for Aces if value exceeds 21
  while (value > 21 && aceCount > 0) {
    value -= 10;
    aceCount--;
  }

  return value;
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
  warnings: {  
    type: DataTypes.INTEGER,
    defaultValue: 0, 
    allowNull: false,
  },
});

// Synchronize the database
async function syncDatabase() {
  try {
    await sequelize.sync();
    console.log('Database synchronized successfully.');
  } catch (error) {
    console.error('Error synchronizing the database:', error);
  }
}
syncDatabase();

// Function to check and create wallets for all users in the server
async function checkWallets(guild) {
  try {
    // Fetch all members in the guild
    const members = await guild.members.fetch();

    // Get all user IDs from members
    const memberIds = members.map(member => member.id);

    // Fetch existing wallets for these user IDs
    const existingWallets = await Wallet.findAll({
      where: {
        userId: memberIds,
      },
    });

    // Create a Set of existing wallet user IDs for quick lookup
    const existingWalletUserIds = new Set(existingWallets.map(wallet => wallet.userId));

    // Iterate through each member
    for (const member of members.values()) {
      // Check if the wallet already exists
      if (!existingWalletUserIds.has(member.id)) {
        const [wallet] = await Wallet.findOrCreate({
          where: { userId: member.id },
          defaults: {
            gold: 0,
            xp: 0,
            level: 1,
            lastDailyReward: null,
            warnings: 0,
          },
        });

        if (wallet) {
          console.log(`Wallet created for user ${member.user.tag} (ID: ${member.id})`);
          const logChannel = await client.channels.fetch(logChannelId);
          if (logChannel) {
            logChannel.send(
              `**Wallet Creation**: Wallet created for user ${member.user.tag} (ID: ${member.id})`,
            );
          }
        }
      }
    }

  } catch (error) {
    console.error('Error checking wallets for all members:', error);
  }
}

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

  if (interaction.commandName === 'edit') {
        const messageId = interaction.options.getString('message_id');
        let newContent = interaction.options.getString('edited_message');

        // Check if both fields are provided
        if (!messageId || !newContent) {
            return;
        }

        try {
            // Replace '\n' (newline escape character) with actual line breaks
            newContent = newContent.replace(/\\n/g, '\n');
            
            // Fetch the message by ID
            const messageToEdit = await interaction.channel.messages.fetch(messageId);

            // Edit the message with the new content
            await messageToEdit.edit(newContent);
        } catch (error) {
            console.error('Error editing message:', error);
     }
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
    } else if (subcommand === "reset-warnings") {
      wallet.warnings = 0;
      await interaction.reply({
        content: `${user.username}'s warnings has been reset to 0.`,
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

  if (interaction.commandName === "warn") {
    const userId = interaction.options.getUser("user").id; // Get the user ID from command options
    const warnedUser = interaction.options.getUser("user"); // Get the User object

    try {
      // Find the wallet for the user
      const [wallet] = await Wallet.findOrCreate({
        where: { userId: userId },
        defaults: {
          gold: 0,
          xp: 0,
          level: 1,
          lastDailyReward: null,
          warnings: 0,
        },
      });
    
      // Increase the warnings count
      wallet.warnings += 1;
      // Save the updated wallet
      await wallet.save();
  
      // Send a direct message to the warned user
      await warnedUser.send(`⚠️ You have been warned! You now have ${wallet.warnings} warnings. Further warnings may lead to a mute, kick or even ban!`);
  
      await interaction.reply({
        content: `✅ User <@${userId}> has been warned. They now have ${wallet.warnings} warnings.`,
        ephemeral: true, 
      });
      const logChannel = await client.channels.fetch(logChannelId);
          if (logChannel) {
            logChannel.send(
              `**Wallet Creation**: Wallet created for user ${userId.user} (ID: ${userId.id})`,
            );
          }
        
      } catch (error) {
        console.error('Error adding warning:', error);
    
        await interaction.reply({
          content: 'There was an error adding the warning.',
          ephemeral: true,
        });
      }
  }

  if (interaction.commandName === 'write') {
      const message = interaction.options.getString('message');
      if (message) {
          await interaction.deferReply({ ephemeral: true }); // Hide user message
          await interaction.deleteReply(); // Deletes user response after sending
          await interaction.channel.send(message); // Sends the message directly in the channel
      } else {
          await interaction.reply({ content: 'Please provide a message to send.', ephemeral: true });
      }
  }

  if (interaction.commandName === "checkwarnings") {
    try {
      // Fetch all wallets
      const wallets = await Wallet.findAll();
  
      // Initialize the warning list message
      let warningList = "⚠️ **Warnings List** ⚠️\n";
  
      if (wallets.length === 0) {
        warningList += "No warnings found.";
      } else {
        for (const wallet of wallets) {
          // Check if userId is valid
          if (wallet.userId) {
            // Check if warnings is null and set it to 0 if it is
            if (wallet.warnings === null) {
              wallet.warnings = 0; // Set warnings to default value
              await wallet.save(); // Save the changes to the database
            }
  
            // Append user warnings to the warning list only if warnings are greater than 0
            if (wallet.warnings > 0) {
              warningList += `User <@${wallet.userId}> has ${wallet.warnings} warnings.\n`;
            }
          } else {
            console.warn(`Wallet entry with null userId found:`, wallet);
          }
        }
  
        // Check if there were no warnings to display
        if (warningList === "⚠️ **Warnings List** ⚠️\n") {
          warningList += "No users have warnings.";
        }
      }
  
      await interaction.reply({
        content: warningList,
        ephemeral: true, // Only show to the user who invoked the command
      });
    } catch (error) {
      console.error('Error fetching warnings:', error);
      await interaction.reply({
        content: 'There was an error fetching the warning list.',
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

  if (interaction.commandName === 'blackjack') {
    const botId = "1278315648493027378";
    const [botWallet] = await Wallet.findOrCreate({ where: { userId: botId } });
    
    const betAmount = interaction.options.getInteger('bet');
    const [wallet] = await Wallet.findOrCreate({
      where: { userId: interaction.user.id },
    });

    if (wallet.gold < betAmount) {
      return interaction.reply({
        content: 'You do not have enough gold to place this bet.',
        ephemeral: true
      });
    }

    // Deduct the bet amount
    wallet.gold -= betAmount;
    botWallet.gold += betAmount;
    await wallet.save();
    await botWallet.save();
    
    const playerHand = [getRandomCard(), getRandomCard()];
    const dealerHand = [getRandomCard(), getRandomCard()];

    const playerValue = calculateHandValue(playerHand);
    const dealerValue = calculateHandValue(dealerHand);

    let playerHasBlackjack = playerValue === 21 && playerHand.length === 2;

     if (playerHasBlackjack) {
      // Player has Blackjack, handle result immediately
      const winnings = Math.ceil(betAmount * 2.5); // Blackjack payout
      wallet.gold += winnings;
      botWallet.gold -= winnings;
      await wallet.save();
      await botWallet.save();
  
      const embed = new EmbedBuilder()
        .setTitle(`${interaction.user.username}'s Blackjack Game`)
        .addFields(
          { name: 'Your Hand', value: `${playerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${playerValue}`, inline: true },
          { name: 'Dealer\'s Hand', value: `${dealerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${dealerValue}`, inline: true },
          { name: 'Result', value: `Blackjack! 🎉 You won ${winnings} gold.` }
        )
        .setColor('#0099ff');
  
      await interaction.reply({ embeds: [embed], ephemeral: true });
  
      const logChannel = await client.channels.fetch(logChannelId);
      if (logChannel) {
        logChannel.send(
          `**Blackjack**: ${interaction.user.username} had a Blackjack and won ${winnings} gold.`
        );
      }
  
      return; // Exit early
    }
    
    // Initial embeds showing hands
    const embed = new EmbedBuilder()
      .setTitle(`${interaction.user.username}'s Blackjack Game`)
      .addFields(
        { name: 'Your Hand', value: `${playerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${calculateHandValue(playerHand)}`, inline: true },
        { name: 'Dealer\'s Hand', value: `${dealerHand[0].value}${dealerHand[0].suit} ??`, inline: true }
      )
      .setColor('#0099ff');

    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('hit')
          .setLabel('Hit')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('stand')
          .setLabel('Stand')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('surrender')
          .setLabel('Surrender')
          .setStyle(ButtonStyle.Danger)
      );
    
    const message = await interaction.reply({ embeds: [embed], components: [row], ephemeral: true, fetchReply: true });
    
    // Continue with the rest of the game if not a Blackjack
    const filter = i => i.user.id === interaction.user.id;
    const collector = message.createMessageComponentCollector({ filter, time: 60000 });

    let playerTurn = true;

    collector.on('collect', async i => {
      const logChannel = await client.channels.fetch(logChannelId);
      
      if (i.customId === 'hit' && playerTurn) {
        playerHand.push(getRandomCard());
        const playerValue = calculateHandValue(playerHand);

        if (playerValue > 21) {
          // Player busts
          embed.setFields(
            { name: 'Your Hand', value: `${playerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${playerValue}`, inline: true },
            { name: 'Dealer\'s Hand', value: `${dealerHand[0].value}${dealerHand[0].suit} ??`, inline: true },
            { name: 'Result', value: `You busted!💥`, inline: false }
          );
          playerTurn = false;
          await i.update({ embeds: [embed], components: [], ephemeral: true });
          if (logChannel) {
            logChannel.send(
              `**Blackjack**: ${interaction.user.username} busted and lost ${betAmount} gold.`
            );
          }
          collector.stop();
        } else {
          // Update the player's hand
          embed.setFields(
            { name: 'Your Hand', value: `${playerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${playerValue}`, inline: true },
            { name: 'Dealer\'s Hand', value: `${dealerHand[0].value}${dealerHand[0].suit} ??`, inline: true }
          );
          await i.update({ embeds: [embed], ephemeral: true });
        }
      } else if (i.customId === 'stand' && playerTurn) {
        playerTurn = false;
        collector.stop();

        // Dealer's turn
        let dealerValue = calculateHandValue(dealerHand);
        while (dealerValue < 17) {
          dealerHand.push(getRandomCard());
          dealerValue = calculateHandValue(dealerHand);
        }

        const playerValue = calculateHandValue(playerHand);

        let winnings = 0;
        let result;
        // Determine the outcome
        
        if (dealerValue > 21 || playerValue > dealerValue) {
          // Player wins
          winnings = betAmount;
          if (playerValue === 21 && playerHand.length === 2) {
          // Player wins with a Blackjack
            winnings = Math.ceil(betAmount * 2.5); // Blackjack pays 2.5 times the bet
          } else {
            winnings = betAmount * 2; // Regular win pays double the bet
          }
          wallet.gold += winnings; // Award the winnings
          botWallet.gold -= winnings;
          result = `Congratulations!🎉 You earned ${winnings} gold.`;
          if (logChannel) {
            logChannel.send(
              `**Blackjack**: ${interaction.user.username} won ${winnings} gold.`
            );
          }
        } else if (playerValue < dealerValue) {
          // Player loses
          result = `Ahh dang it!😢 You lost ${betAmount} gold.`;
          if (logChannel) {
            logChannel.send(
              `**Blackjack**: ${interaction.user.username} lost ${betAmount} gold.`
            );
          }
        } else {
          // It's a tie
          winnings = betAmount;
          wallet.gold += winnings; // Return the bet amount to the player's balance
          botWallet.gold -= winnings;
          result = `It's a tie!🤝 Your ${betAmount} gold bet has been returned.`;
          if (logChannel) {
            logChannel.send(
              `**Blackjack**: ${interaction.user.username} tied and had ${betAmount} gold returned.`
            );
          }
        }
        await botWallet.save();
        await wallet.save();
        
        embed.setFields(
          { name: 'Your Hand', value: `${playerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${playerValue}`, inline: true },
          { name: 'Dealer\'s Hand', value: `${dealerHand.map(card => `${card.value}${card.suit}`).join(' ')}\n**Value:** ${dealerValue}`, inline: true },
          { name: 'Result', value: result, inline: false }
        );

        await i.update({ embeds: [embed], components: [], ephemeral: true });
      } else if (i.customId === 'surrender') {
        playerTurn = false;
        embed.addFields({ name: 'Result', value: 'You surrendered! 🏳️', inline: false });
        await i.update({ embeds: [embed], components: [], ephemeral: true });
        if (logChannel) {
          logChannel.send(
            `**Blackjack**: ${interaction.user.username} surrendered and lost ${betAmount} gold.`
          );
        }
        collector.stop();
      }
    });

    collector.on('end', collected => {
      if (playerTurn) {
        embed.addFields({ name: 'Result', value: 'You took too long and forfeited the game! ⏳', inline: false });
        interaction.editReply({ embeds: [embed], components: [], ephemeral: true });
      }
    });
  }

  if (interaction.commandName === "leaderboard") {
    // Fetch top 10 users sorted by gold in descending order
    const topUsers = await Wallet.findAll({
      order: [["gold", "DESC"]],
      limit: 10,
    });

    // Build leaderboard message
    let leaderboardMessage = "🏆 **Leaderboard** 🏆\n";
    let count = 0;
    
    for (const wallet of topUsers) {
      let username = "Unknown";
      let isBot = false;
      try {
        // Attempt to fetch user from cache
        const user = await client.users.fetch(wallet.userId);
        username = user.username;

        // Check if the user is a bot
        if (user.bot) {
          isBot = true;
        }
      } catch (error) {
        console.error(`Failed to fetch user with ID ${wallet.userId}:`, error);
      }

      // Exclude bots from the leaderboard
      if (!isBot) {
        leaderboardMessage += `**${count + 1}.** ${username} - ${wallet.gold} gold\n`;
        count++;
      }

      // Stop after 10 valid users
      if (count >= 10) break;
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
    } else {
      voiceActivity.delete(userId);
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
    } else {
      voiceActivity.delete(userId);
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

  const guild = client.guilds.cache.get('1278098250330537994');
  if (guild) {
    checkWallets(guild); // Check wallets when the bot starts
  } else {
    console.error('Guild not found.');
  }
  
  client.guilds.cache.forEach(guild => {
    guild.channels.cache.forEach(channel => {
      if (channel.type === 2) { // Check if the channel is a voice channel
        channel.members.forEach(member => {
          if (!voiceActivity.has(member.user.id)) {
            if (channel.id !== afkChannelId) {
              voiceActivity.set(member.user.id, Date.now());
              console.log(`Found user ${member.user.tag} in voice channel ${channel.name}`);
            }
          }
        });
      }
    });
  });
  
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

  addReactionsToMessage()
});

async function addReactionsToMessage() {
  try {
    const channel = await client.channels.fetch('1306259697715777556');
    const roleMessage = await channel.messages.fetch(roleMessageId);

    // Loop through each emoji in roleAssignments and add it as a reaction if missing
    for (const emoji of Object.keys(roleAssignments)) {
      if (!roleMessage.reactions.cache.has(emoji)) {
        try {
          await roleMessage.react(emoji);
          console.log(`Added reaction: ${emoji}`);
        } catch (error) {
          console.error(`Failed to add reaction ${emoji}:`, error);
        }
      }
    }
  } catch (error) {
    console.error('Error fetching channel or message:', error);
  }
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;

    // Only process reactions on the specific message
    if (reaction.message.id !== roleMessageId) return;
    
    const roleId = roleAssignments[reaction.emoji.name] || roleAssignments[`<:${reaction.emoji.name}:${reaction.emoji.id}>`];
    if (roleId) {
        const member = reaction.message.guild.members.cache.get(user.id);
        const role = reaction.message.guild.roles.cache.get(roleId);
        await member.roles.add(roleId);
        console.log(`Assigned role "${role.name}" to ${user.tag}`);
        // Log the transaction to the specified channel
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel) {
            logChannel.send(
                `**Assigned role**: "${role.name}" to ${user.tag}`,
            );
        }
    }
});

client.on('messageReactionRemove', async (reaction, user) => {
    if (user.bot) return;
    
    // Only process reactions on the specific message
    if (reaction.message.id !== roleMessageId) return;
    
    const roleId = roleAssignments[reaction.emoji.name] || roleAssignments[`<:${reaction.emoji.name}:${reaction.emoji.id}>`];
    if (roleId) {
        const member = reaction.message.guild.members.cache.get(user.id);
        const role = reaction.message.guild.roles.cache.get(roleId);
        await member.roles.remove(roleId);
        console.log(`Unassigned role "${role.name}" from ${user.tag}`);
        // Log the transaction to the specified channel
        const logChannel = await client.channels.fetch(logChannelId);
        if (logChannel) {
            logChannel.send(
                `**Unassigned role**: "${role.name}" to ${user.tag}`,
            );
        }
    }
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

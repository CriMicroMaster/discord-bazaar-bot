const { exec } = require('child_process');
const express = require('express');
const bodyParser = require('body-parser');

// Initialize the Express app
const app = express();
app.use(bodyParser.json());

// Define your GitHub webhook endpoint
app.post('/webhook', (req, res) => {
    const payload = req.body;

    // Ensure the request is from GitHub and has the correct event type
    if (payload && payload.ref === 'refs/heads/main') {
        // Reset local changes and pull the latest changes
        exec('cd /home/nex/discord-bazaar-bot && git reset --hard HEAD && git clean -fd && git pull origin main && pm2 restart bot', (err, stdout, stderr) => {
            if (err) {
                console.error('Error executing git commands or PM2 restart:', err);
                console.error(stderr);
                return res.status(500).send('Error executing git commands or PM2 restart');
            }

            console.log('Git pull and PM2 restart successful.');
            res.send('Deployment successful');
        });
    } else {
        res.status(400).send('Invalid payload');
    }
});

// Start the Express server
app.listen(3001, () => {
    console.log('Webhook listener is running on port 3001');
});

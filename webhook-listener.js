const http = require('http');
const { exec } = require('child_process');

const hostname = '0.0.0.0';
const port = 3000; // Change as needed

const requestListener = (req, res) => {
  if (req.method === 'POST' && req.url === '/webhook') {
    let body = '';
    req.on('data', chunk => body += chunk.toString());
    req.on('end', () => {
      const payload = JSON.parse(body);
      if (payload.ref === 'refs/heads/main') { // Check branch name
        exec('cd home/nex/discord-bazaar-bot && git pull origin main && pm2 restart bot', (err, stdout, stderr) => {
          if (err) {
            console.error(`exec error: ${err}`);
            return;
          }
          console.log(`stdout: ${stdout}`);
          console.error(`stderr: ${stderr}`);
        });
      }
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Webhook received');
    });
  } else {
    res.writeHead(404);
    res.end();
  }
};

const server = http.createServer(requestListener);
server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
});

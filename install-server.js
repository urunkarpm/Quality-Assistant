const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.INSTALL_PORT || 3001;

const server = http.createServer((req, res) => {
  const url = req.url.split('?')[0]; // Remove query params
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${url}`);
  
  // Route: Install page
  if (url === '/' || url === '/install' || url === '/install.html') {
    const filePath = path.join(__dirname, 'install.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500, {'Content-Type': 'text/plain'});
        res.end('Error loading install page');
        return;
      }
      res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
      res.end(data);
    });
    return;
  }
  
  // Route: PowerShell setup script
  if (url === '/setup.ps1') {
    const filePath = path.join(__dirname, 'setup.ps1');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, {'Content-Type': 'text/plain'});
        res.end('Setup script not found');
        return;
      }
      res.writeHead(200, {'Content-Type': 'application/x-powershell; charset=utf-8'});
      res.end(data);
    });
    return;
  }
  
  // 404 for everything else
  res.writeHead(404, {'Content-Type': 'text/plain'});
  res.end('Not Found');
});

server.listen(PORT, () => {
  console.log('\n✅ Quality Assistant Installer is running!');
  console.log(`📦 Open in your browser: http://localhost:${PORT}/install`);
  console.log('\nPress Ctrl+C to stop the server\n');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down installer server...');
  server.close(() => {
    console.log('Server stopped.');
    process.exit(0);
  });
});

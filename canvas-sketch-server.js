const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');
const { spawn } = require('child_process');
const net = require('net');

const PORT = process.env.PORT || 3335;
const SKETCH_PORT_START = 9966;

let currentSketchProcess = null;
let currentPort = SKETCH_PORT_START;

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Serve the main browser interface
    if (pathname === '/' || pathname === '/index.html') {
      const content = await fs.readFile(path.join(__dirname, 'canvas-sketch-browser.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    }

    // API to scan sketches directory
    if (pathname === '/api/scan') {
      const sketchPath = parsedUrl.query.path || '../canvas-sketch-projects';
      try {
        const fullPath = path.resolve(sketchPath);
        const files = await fs.readdir(fullPath);
        const sketches = files
          .filter(file => file.endsWith('.js'))
          .map(file => ({
            name: formatSketchName(file),
            filename: file,
            path: file
          }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sketches));
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Cannot access path: ${sketchPath}` }));
      }
      return;
    }

    // API to run a sketch with canvas-sketch-cli
    if (pathname === '/api/run-sketch' && req.method === 'POST') {
      let body = '';
      req.on('data', chunk => {
        body += chunk.toString();
      });
      req.on('end', async () => {
        try {
          const { filename, port } = JSON.parse(body);
          
          // Stop any existing process
          if (currentSketchProcess) {
            currentSketchProcess.kill('SIGTERM');
            currentSketchProcess = null;
          }
          
          // Find an available port
          currentPort = await findAvailablePort(SKETCH_PORT_START);
          
          console.log(`Starting canvas-sketch for ${filename} on port ${currentPort}`);
          
          currentSketchProcess = spawn('canvas-sketch', [filename, '--port', currentPort.toString()], {
            cwd: path.resolve('../canvas-sketch-projects'),
            stdio: ['ignore', 'pipe', 'pipe']
          });

          currentSketchProcess.stdout.on('data', (data) => {
            console.log(`canvas-sketch stdout: ${data}`);
          });

          currentSketchProcess.stderr.on('data', (data) => {
            console.error(`canvas-sketch stderr: ${data}`);
          });

          currentSketchProcess.on('close', (code) => {
            console.log(`canvas-sketch process exited with code ${code}`);
            currentSketchProcess = null;
          });

          currentSketchProcess.on('error', (error) => {
            console.error(`Failed to start canvas-sketch: ${error}`);
            currentSketchProcess = null;
          });

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            success: true, 
            port: currentPort,
            message: `Started canvas-sketch for ${filename}` 
          }));

        } catch (error) {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: error.message }));
        }
      });
      return;
    }

    // API to stop the current sketch
    if (pathname === '/api/stop-sketch' && req.method === 'POST') {
      if (currentSketchProcess) {
        currentSketchProcess.kill('SIGTERM');
        currentSketchProcess = null;
        console.log('Stopped canvas-sketch process');
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, message: 'Sketch stopped' }));
      return;
    }

    // API to get current status
    if (pathname === '/api/status') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ 
        running: !!currentSketchProcess,
        port: currentPort
      }));
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error: ' + error.message);
  }
});

function formatSketchName(filename) {
  return filename
    .replace('.js', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

function findAvailablePort(startPort) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        findAvailablePort(startPort + 1).then(resolve).catch(reject);
      } else {
        reject(err);
      }
    });
    
    server.listen(startPort, () => {
      const port = server.address().port;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

// Clean up on exit
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  if (currentSketchProcess) {
    currentSketchProcess.kill('SIGTERM');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (currentSketchProcess) {
    currentSketchProcess.kill('SIGTERM');
  }
  process.exit(0);
});

server.listen(PORT, () => {
  console.log(`🎨 Canvas Sketch CLI Browser running at http://localhost:${PORT}`);
  console.log(`📁 Will run sketches from ../canvas-sketch-projects using canvas-sketch-cli`);
  console.log(`🔄 Canvas sketches will be served on ports starting from ${SKETCH_PORT_START}`);
});

module.exports = server;
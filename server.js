const http = require('http');
const fs = require('fs').promises;
const path = require('path');
const url = require('url');

const PORT = 3333;

// MIME types
const mimeTypes = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json'
};

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
    // API to scan a directory for sketches
    if (pathname === '/api/scan') {
      const sketchPath = parsedUrl.query.path;
      if (!sketchPath) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Path parameter required' }));
        return;
      }

      try {
        const fullPath = path.resolve(sketchPath);
        const files = await fs.readdir(fullPath);
        const sketches = files
          .filter(file => file.endsWith('.js'))
          .map(file => ({
            name: formatSketchName(file),
            filename: file,
            path: path.join(sketchPath, file),
            relativePath: file
          }));

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(sketches));
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: `Cannot access path: ${sketchPath}` }));
      }
      return;
    }

    // Serve static files
    if (pathname === '/' || pathname === '/index.html') {
      const content = await fs.readFile(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    }

    // Serve sketch files wrapped in HTML with canvas-sketch
    if (pathname.startsWith('/sketch/')) {
      const sketchPath = decodeURIComponent(pathname.replace('/sketch/', ''));
      const fullSketchPath = path.resolve(sketchPath);
      try {
        const sketchContent = await fs.readFile(fullSketchPath, 'utf8');
        
        // Transform require statements to work with browser
        const transformedSketch = sketchContent
          .replace(/const (\w+) = require\(['"]canvas-sketch['"]\);?/g, '')
          .replace(/const { ([^}]+) } = require\(['"]canvas-sketch-util['"]\);?/g, 'const { $1 } = canvasSketchUtil;')
          .replace(/const (\w+) = require\(['"]canvas-sketch-util\/(\w+)['"]\);?/g, 'const $1 = canvasSketchUtil.$2;')
          .replace(/const (\w+) = require\(['"]tweakpane['"]\);?/g, 'const $1 = Tweakpane;')
          .replace(/(createSketch|sketcher)\(/g, 'canvasSketch(');

        const html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Canvas Sketch</title>
    <style>
        body { 
            margin: 0; 
            padding: 0; 
            background: black; 
            overflow: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        canvas { 
            display: block;
            max-width: 100vw;
            max-height: 100vh;
        }
    </style>
</head>
<body>
    <script src="https://unpkg.com/canvas-sketch@0.7.7/dist/canvas-sketch.umd.js"></script>
    <script src="https://unpkg.com/canvas-sketch-util@1.10.0/dist/canvas-sketch-util.umd.js"></script>
    <script src="https://unpkg.com/tweakpane@4.0.3/dist/tweakpane.min.js"></script>
    <script>
        ${transformedSketch}
    </script>
</body>
</html>`;
        
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch (error) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Sketch not found: ' + error.message);
      }
      return;
    }

    // 404 for everything else
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');

  } catch (error) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Server error');
  }
});

function formatSketchName(filename) {
  return filename
    .replace('.js', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, l => l.toUpperCase());
}

server.listen(PORT, () => {
  console.log(`🎨 Canvas Sketch Browser running at http://localhost:${PORT}`);
  console.log(`📁 Can browse any sketches folder - enter path in the UI`);
});

module.exports = server;
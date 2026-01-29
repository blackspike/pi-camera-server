const express = require('express');
const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 3000;
const PHOTOS_DIR = path.join(__dirname, 'photos');

// Create photos directory if it doesn't exist
if (!fs.existsSync(PHOTOS_DIR)) {
  fs.mkdirSync(PHOTOS_DIR);
  console.log('Created photos directory');
}

// Helper function to generate timestamp filename
function getTimestampFilename() {
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  return `photo_${timestamp}.jpg`;
}

// Helper function to detect which camera command is available
function detectCameraCommand(callback) {
  exec('which rpicam-jpeg', (error) => {
    if (!error) {
      callback('rpicam-jpeg');
    } else {
      exec('which raspistill', (error) => {
        if (!error) {
          callback('raspistill');
        } else {
          callback(null);
        }
      });
    }
  });
}

// Endpoint to take a photo
app.get('/take-photo', (req, res) => {
  const filename = getTimestampFilename();
  const filepath = path.join(PHOTOS_DIR, filename);

  detectCameraCommand((cameraCmd) => {
    if (!cameraCmd) {
      return res.status(500).json({
        error: 'Camera command not found',
        message: 'Neither rpicam-jpeg nor raspistill is available'
      });
    }

    // Build camera command based on what's available
    let command;
    if (cameraCmd === 'rpicam-jpeg') {
      command = `rpicam-jpeg -o "${filepath}" --width 1920 --height 1080 -t 1 --nopreview`;
    } else {
      command = `raspistill -o "${filepath}" -w 1920 -h 1080 -t 1 -n`;
    }

    console.log(`Taking photo with ${cameraCmd}: ${filename}`);

    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error taking photo: ${error.message}`);
        return res.status(500).json({
          error: 'Failed to capture photo',
          message: error.message
        });
      }

      if (stderr) {
        console.warn(`Camera stderr: ${stderr}`);
      }

      console.log(`Photo saved: ${filename}`);

      // Send the photo file back to the browser
      res.sendFile(filepath, (err) => {
        if (err) {
          console.error(`Error sending file: ${err.message}`);
          res.status(500).json({
            error: 'Failed to send photo',
            message: err.message
          });
        }
      });
    });
  });
});

// Endpoint to list all photos
app.get('/photos', (req, res) => {
  fs.readdir(PHOTOS_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({
        error: 'Failed to read photos directory',
        message: err.message
      });
    }

    const photoFiles = files.filter(file => file.endsWith('.jpg'));
    const photoList = photoFiles.map(file => ({
      filename: file,
      url: `/photo/${file}`,
      timestamp: file.replace('photo_', '').replace('.jpg', '')
    }));

    res.json({
      count: photoList.length,
      photos: photoList
    });
  });
});

// Endpoint to view a specific photo
app.get('/photo/:filename', (req, res) => {
  const filepath = path.join(PHOTOS_DIR, req.params.filename);

  // Security check: ensure filename doesn't contain path traversal
  if (req.params.filename.includes('..') || req.params.filename.includes('/')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (!fs.existsSync(filepath)) {
    return res.status(404).json({ error: 'Photo not found' });
  }

  res.sendFile(filepath);
});

// Root endpoint with instructions
app.get('/', (req, res) => {
  res.json({
    message: 'Raspberry Pi Camera Server',
    endpoints: {
      takePhoto: '/take-photo - Capture a new photo',
      listPhotos: '/photos - List all photos',
      viewPhoto: '/photo/:filename - View a specific photo'
    }
  });
});

app.listen(PORT, () => {

  console.log(`Photo server running on port ${PORT}`);
  console.log(`Access at: http://0.0.0.0:${PORT}`);
  console.log(`Local: http://localhost:${PORT}`);
  console.log(`Network: http://192.168.2.15:${PORT}`);
  console.log(`Take photo: http://192.168.2.15:${PORT}/take-photo`);
});


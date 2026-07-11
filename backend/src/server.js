const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const db = require('./database');
const converter = require('./converter');

const app = express();
app.use(cors());
app.use(express.json());

// Ensure uploads folder exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Multer storage configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.pptx') {
      return cb(new Error('Only PPTX files are allowed'));
    }
    cb(null, true);
  }
});

// Basic sanity check route
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date() });
});

// Authentication endpoint
app.post('/api/auth/login', (req, res) => {
  const { id, password } = req.body;
  const users = db.getUsers();
  const user = users.find(u => u.id === id);
  
  if (!user) {
    return res.status(401).json({ error: 'Invalid User ID. User not registered.' });
  }
  
  // Simple mockup password check (For demo purposes, any password is fine, or password matches the id)
  // Let's enforce password = "password" or same as ID for convenience
  if (password !== 'admin123' && password !== 'lecturer123' && password !== id) {
    return res.status(401).json({ error: 'Incorrect password. Hint: Use same username or "admin123" / "lecturer123"' });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      role: user.role
    }
  });
});

// User Management API
app.get('/api/users', (req, res) => {
  res.json(db.getUsers());
});

app.post('/api/users', (req, res) => {
  try {
    const { id, name, role } = req.body;
    if (!id || !name || !role) {
      return res.status(400).json({ error: 'Missing required user fields' });
    }
    const newUser = db.addUser({ id, name, role });
    res.status(201).json(newUser);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/users/:id', (req, res) => {
  try {
    db.deleteUser(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Get all presentations (metadata only)
app.get('/api/presentations', (req, res) => {
  const list = db.getPresentations().map(p => ({
    id: p.id,
    title: p.title,
    ownerId: p.ownerId,
    uploadDate: p.uploadDate,
    slideCount: p.slides.length
  }));
  res.json(list);
});

// Get presentation details (secure slides)
app.get('/api/presentations/:id', (req, res) => {
  const pres = db.getPresentationById(req.params.id);
  if (!pres) {
    return res.status(404).json({ error: 'Presentation not found' });
  }
  res.json(pres);
});

// Upload Endpoint with Mock HTML5/SVG slide conversion
app.post('/api/upload', upload.single('file'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { title, ownerId } = req.body;
    console.log(`Received PPTX upload: ${req.file.filename} for owner: ${ownerId}`);

    // Verify owner exists in DB (Security!)
    const users = db.getUsers();
    if (!users.some(u => u.id === ownerId)) {
      return res.status(400).json({ error: 'Owner lecturer is not registered as a verified user' });
    }

    // Real PPTX Parsing & Conversion
    const converted = converter.convertPptxToHtml5(req.file.path, req.file.originalname, title);
    
    if (ownerId) {
      converted.ownerId = ownerId;
    }

    // Add to Mock Database
    db.addPresentation(converted);

    // Security Anti-Theft Policy: Clean up the uploaded raw file immediately from disk!
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
      console.log(`Secured Server State: Raw file ${req.file.filename} unlinked/deleted successfully.`);
    }

    res.status(201).json({
      success: true,
      presentationId: converted.id,
      title: converted.title,
      slideCount: converted.slides.length
    });
  } catch (err) {
    console.error("Upload handler error", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete presentation
app.delete('/api/presentations/:id', (req, res) => {
  try {
    db.deletePresentation(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete presentation error", err);
    res.status(500).json({ error: err.message });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Active sessions state mapping: roomName -> { slideIndex, animationStep }
const activeRooms = {};

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`);

  // Join a room (presentation ID)
  socket.on('join_room', ({ roomId, role }) => {
    socket.join(roomId);
    console.log(`Socket ${socket.id} joined room ${roomId} as ${role}`);

    if (activeRooms[roomId]) {
      socket.emit('sync_state', activeRooms[roomId]);
    } else {
      activeRooms[roomId] = { slideIndex: 1, animationStep: 0 };
    }
  });

  // Handle slide/state updates from Lecturer (Presenter)
  socket.on('lecturer_update', ({ roomId, slideIndex, animationStep }) => {
    console.log(`Lecturer update in room ${roomId}: Slide ${slideIndex}, Step ${animationStep}`);
    activeRooms[roomId] = { slideIndex, animationStep };
    
    socket.to(roomId).emit('sync_state', { slideIndex, animationStep });
  });

  // Handle explicit action commands (e.g. trigger next animation)
  socket.on('action_command', ({ roomId, command, data }) => {
    console.log(`Action command in room ${roomId}: ${command}`, data);
    socket.to(roomId).emit('execute_command', { command, data });
  });

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Secure PPT Sync Server running on port ${PORT}`);
});

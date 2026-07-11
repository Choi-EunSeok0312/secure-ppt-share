const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'mock_db.json');

const defaultUsers = [
  { id: "admin", name: "System Administrator", role: "admin" },
  { id: "lecturer-john", name: "Dr. John Doe", role: "lecturer" },
  { id: "lecturer-sarah", name: "Prof. Sarah Jenkins", role: "lecturer" }
];

// Helper to load database
function loadDb() {
  if (!fs.existsSync(DB_FILE)) {
    // Initial mock data
    const initialData = {
      presentations: [
        {
          id: "demo-pres-1",
          title: "Introduction to Advanced Web Security",
          ownerId: "lecturer-john",
          uploadDate: new Date().toISOString(),
          slides: [
            {
              slideIndex: 1,
              title: "Welcome to Web Security",
              elements: [
                { id: "el1", type: "heading", content: "Web Security 101", x: 10, y: 15, size: 40, color: "#1e293b", animation: "fade-in", step: 0 },
                { id: "el2", type: "text", content: "How to protect your presentations on the modern web.", x: 10, y: 35, size: 20, color: "#475569", animation: "slide-up", step: 1 },
                { id: "el3", type: "shape", shapeType: "rect", x: 10, y: 55, w: 80, h: 30, color: "#e0e7ff", text: "Interactive Sandbox Ready", animation: "fade-in", step: 2 }
              ]
            },
            {
              slideIndex: 2,
              title: "The Problem of Digital Theft",
              elements: [
                { id: "el4", type: "heading", content: "Why Static PDFs Fail", x: 10, y: 15, size: 36, color: "#1e293b", animation: "fade-in", step: 0 },
                { id: "el5", type: "list", items: ["PDFs are easily downloadable", "Right-click is hard to block on raw files", "No custom dynamic watermarks"], x: 10, y: 30, size: 18, color: "#ef4444", animation: "fade-in", step: 1 }
              ]
            },
            {
              slideIndex: 3,
              title: "Our Solution: Converted Canvas",
              elements: [
                { id: "el6", type: "heading", content: "Secure HTML5/SVG Elements", x: 10, y: 15, size: 36, color: "#1e293b", animation: "fade-in", step: 0 },
                { id: "el7", type: "text", content: "Slides are reconstructed using vector elements and text nodes inside an isolated presentation screen.", x: 10, y: 30, size: 20, color: "#475569", animation: "slide-left", step: 1 },
                { id: "el8", type: "text", content: "No direct asset URL exposed. Right click is disabled. Watermark is dynamic.", x: 10, y: 50, size: 20, color: "#10b981", animation: "fade-in", step: 2 }
              ]
            }
          ]
        }
      ],
      users: defaultUsers
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.users) {
      parsed.users = defaultUsers;
      saveDb(parsed);
    }
    return parsed;
  } catch (err) {
    console.error("Error reading database file, returning empty structure", err);
    return { presentations: [], users: defaultUsers };
  }
}

// Helper to save database
function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error("Error saving database file", err);
  }
}

module.exports = {
  getPresentations: () => {
    return loadDb().presentations;
  },
  getPresentationById: (id) => {
    const db = loadDb();
    return db.presentations.find(p => p.id === id) || null;
  },
  addPresentation: (pres) => {
    const db = loadDb();
    db.presentations.push(pres);
    saveDb(db);
    return pres;
  },
  deletePresentation: (id) => {
    const db = loadDb();
    db.presentations = db.presentations.filter(p => p.id !== id);
    saveDb(db);
  },
  
  // User Management Methods
  getUsers: () => {
    return loadDb().users;
  },
  addUser: (user) => {
    const db = loadDb();
    // Prevent duplicate IDs
    if (db.users.some(u => u.id === user.id)) {
      throw new Error(`User ID "${user.id}" already exists.`);
    }
    db.users.push(user);
    saveDb(db);
    return user;
  },
  deleteUser: (id) => {
    const db = loadDb();
    if (id === 'admin') {
      throw new Error("Cannot delete primary system administrator.");
    }
    db.users = db.users.filter(u => u.id !== id);
    saveDb(db);
  }
};

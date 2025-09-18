const express = require('express');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const dotenv = require('dotenv');
const multer = require('multer');
const { nanoid } = require('nanoid');
const { readJSON, writeJSON, ensureDir } = require('./src/storage');
const { sendTelegramMessage } = require('./src/telegram');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// Ensure data directories
ensureDir(path.join(__dirname, 'data'));
ensureDir(path.join(__dirname, 'public'));
ensureDir(path.join(__dirname, 'public', 'uploads'));

// Static serving
app.use(express.static(path.join(__dirname, 'public')));

// Multer for images
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, path.join(__dirname, 'public', 'uploads'));
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.png';
    cb(null, `${Date.now()}-${nanoid(6)}${ext}`);
  },
});
const upload = multer({ storage });

// Simple health
app.get('/api/health', (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// Data files
const WORDS_FILE = path.join(__dirname, 'data', 'words.json');
const PACKS_FILE = path.join(__dirname, 'data', 'packs.json');
const STUDENTS_FILE = path.join(__dirname, 'data', 'students.json');
const ASSIGNMENTS_FILE = path.join(__dirname, 'data', 'assignments.json');
const REPORTS_FILE = path.join(__dirname, 'data', 'reports.json');

// Initialize files if missing
for (const f of [WORDS_FILE, PACKS_FILE, STUDENTS_FILE, ASSIGNMENTS_FILE, REPORTS_FILE]) {
  if (!fs.existsSync(f)) {
    fs.writeFileSync(f, JSON.stringify([], null, 2));
  }
}

// Words CRUD
app.get('/api/words', (req, res) => {
  const words = readJSON(WORDS_FILE);
  res.json(words);
});

app.post('/api/words', upload.single('image'), (req, res) => {
  const { ru, en } = req.body;
  if (!ru || !en) return res.status(400).json({ error: 'ru and en are required' });
  const words = readJSON(WORDS_FILE);
  const id = nanoid();
  let imagePath = null;
  if (req.file) {
    imagePath = `/uploads/${req.file.filename}`;
  }
  const word = { id, ru, en, image: imagePath, createdAt: Date.now() };
  words.push(word);
  writeJSON(WORDS_FILE, words);
  res.json(word);
});

app.delete('/api/words/:id', (req, res) => {
  const { id } = req.params;
  const words = readJSON(WORDS_FILE);
  const idx = words.findIndex((w) => w.id === id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  const [removed] = words.splice(idx, 1);
  writeJSON(WORDS_FILE, words);
  if (removed.image) {
    const p = path.join(__dirname, 'public', removed.image.replace(/^\//, ''));
    fs.unlink(p, () => {});
  }
  res.json({ ok: true });
});

// Packs CRUD { id, name, wordIds: [] }
app.get('/api/packs', (req, res) => {
  res.json(readJSON(PACKS_FILE));
});
app.post('/api/packs', (req, res) => {
  const { name, wordIds } = req.body;
  if (!name || !Array.isArray(wordIds)) return res.status(400).json({ error: 'name and wordIds[] required' });
  const packs = readJSON(PACKS_FILE);
  const pack = { id: nanoid(), name, wordIds, createdAt: Date.now() };
  packs.push(pack);
  writeJSON(PACKS_FILE, packs);
  res.json(pack);
});
app.delete('/api/packs/:id', (req, res) => {
  const packs = readJSON(PACKS_FILE);
  const idx = packs.findIndex((p) => p.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  packs.splice(idx, 1);
  writeJSON(PACKS_FILE, packs);
  res.json({ ok: true });
});

// Students CRUD { id, name, telegramChatId? }
app.get('/api/students', (req, res) => {
  res.json(readJSON(STUDENTS_FILE));
});
app.post('/api/students', (req, res) => {
  const { name, telegramChatId } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  const students = readJSON(STUDENTS_FILE);
  const student = { id: nanoid(), name, telegramChatId: telegramChatId || null, createdAt: Date.now() };
  students.push(student);
  writeJSON(STUDENTS_FILE, students);
  res.json(student);
});
app.delete('/api/students/:id', (req, res) => {
  const students = readJSON(STUDENTS_FILE);
  const idx = students.findIndex((s) => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  students.splice(idx, 1);
  writeJSON(STUDENTS_FILE, students);
  res.json({ ok: true });
});

// Assignments CRUD { id, studentId|null, packId, status}
app.get('/api/assignments', (req, res) => {
  res.json(readJSON(ASSIGNMENTS_FILE));
});
app.post('/api/assignments', async (req, res) => {
  const { studentId, packId } = req.body;
  if (!packId) return res.status(400).json({ error: 'packId required' });
  const assignments = readJSON(ASSIGNMENTS_FILE);
  const assignment = { id: nanoid(), studentId: studentId || null, packId, status: 'assigned', createdAt: Date.now() };
  assignments.push(assignment);
  writeJSON(ASSIGNMENTS_FILE, assignments);
  res.json(assignment);
});
app.delete('/api/assignments/:id', (req, res) => {
  const items = readJSON(ASSIGNMENTS_FILE);
  const idx = items.findIndex((a) => a.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'not found' });
  items.splice(idx, 1);
  writeJSON(ASSIGNMENTS_FILE, items);
  res.json({ ok: true });
});

// Quiz helper: get pack with words and generated options (including 3 distractors)
app.get('/api/quiz/:assignmentId', (req, res) => {
  const { assignmentId } = req.params;
  const assignments = readJSON(ASSIGNMENTS_FILE);
  const packs = readJSON(PACKS_FILE);
  const words = readJSON(WORDS_FILE);
  const assignment = assignments.find((a) => a.id === assignmentId);
  if (!assignment) return res.status(404).json({ error: 'assignment not found' });
  const pack = packs.find((p) => p.id === assignment.packId);
  if (!pack) return res.status(404).json({ error: 'pack not found' });
  const packWords = pack.wordIds.map((id) => words.find((w) => w.id === id)).filter(Boolean);
  const enPool = words.map((w) => w.en);
  function shuffle(arr) { return arr.sort(() => Math.random() - 0.5); }
  const cards = packWords.map((w) => {
    const distractors = shuffle(enPool.filter((x) => x !== w.en)).slice(0, 3);
    const options = shuffle([w.en, ...distractors]);
    return { id: w.id, image: w.image, ru: w.ru, en: w.en, options };
  });
  res.json({ assignmentId, pack: { id: pack.id, name: pack.name }, cards });
});

// Report results { assignmentId, studentName, answers: [{wordId, correctOnFirstTry: boolean, attempts: number}] }
app.post('/api/report', async (req, res) => {
  const { assignmentId, studentName, answers } = req.body;
  if (!assignmentId || !studentName || !Array.isArray(answers)) return res.status(400).json({ error: 'invalid body' });
  const reports = readJSON(REPORTS_FILE);
  const report = { id: nanoid(), assignmentId, studentName, answers, createdAt: Date.now() };
  reports.push(report);
  writeJSON(REPORTS_FILE, reports);

  // Try Telegram notify if teacher chat known via student record
  try {
    const assignments = readJSON(ASSIGNMENTS_FILE);
    const students = readJSON(STUDENTS_FILE);
    const packs = readJSON(PACKS_FILE);
    const assignment = assignments.find((a) => a.id === assignmentId);
    const student = assignment ? students.find((s) => s.id === assignment.studentId) : null;
    const pack = assignment ? packs.find((p) => p.id === assignment.packId) : null;
    const teacherChatId = process.env.TEACHER_CHAT_ID;
    const targetChat = teacherChatId || (student && student.telegramChatId) || null;
    if (process.env.BOT_TOKEN && targetChat) {
      const correct = answers.filter((a) => a.correctOnFirstTry).length;
      const total = answers.length;
      const text = `Отчет ученика: ${studentName}\nНабор: ${pack ? pack.name : assignmentId}\nРезультат: ${correct}/${total} правильных с первой попытки.`;
      await sendTelegramMessage(targetChat, text);
    }
  } catch (e) {
    console.error('Telegram send failed', e.message);
  }

  res.json({ ok: true, reportId: report.id });
});

// Basic index routes to teacher and student UIs
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
app.get('/teacher', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'teacher', 'index.html'));
});
app.get('/student', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'student', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

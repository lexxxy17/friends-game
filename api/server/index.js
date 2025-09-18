const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { createClient } = require('@supabase/supabase-js');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.API_PORT || 4000;
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const upload = multer({ storage: multer.memoryStorage() });

// Simple admin check via header token
function requireAdmin(req, res, next) {
  const token = req.headers['x-admin-key'];
  if (!process.env.ADMIN_KEY || token === process.env.ADMIN_KEY) return next();
  return res.status(401).json({ error: 'unauthorized' });
}

// Telegram auth verify: expects x-telegram-initdata header from TWA
function parseTelegramInitData(initData) {
  // For pilot, accept as-is (verification can be added with bot token and hash)
  try { return new URLSearchParams(initData); } catch { return null; }
}

app.get('/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// Helper: get or create student by Telegram initData
async function getOrCreateStudentFromInit(initData) {
  const params = parseTelegramInitData(initData);
  if (!params) return null;
  const user = params.get('user');
  if (!user) return null;
  const tg = JSON.parse(user);
  const tg_user_id = tg.id;
  const name = tg.first_name + (tg.last_name ? ' ' + tg.last_name : '');
  const username = tg.username || null;
  let { data: student, error } = await supabase.from('students').select('*').eq('tg_user_id', tg_user_id).single();
  if (error && error.code !== 'PGRST116') throw error;
  if (!student) {
    const ins = await supabase.from('students').insert({ tg_user_id, name, username }).select().single();
    if (ins.error) throw ins.error;
    student = ins.data;
  }
  return student;
}

// My assignments (student + public)
app.get('/my-assignments', async (req, res) => {
  try {
    const initData = req.headers['x-telegram-initdata'];
    let student = null;
    try { if (initData) student = await getOrCreateStudentFromInit(initData); } catch {}
    let query = supabase.from('assignments').select('id, pack_id, student_id, created_at, packs(name)').order('created_at', { ascending: false });
    if (student) {
      query = query.or(`student_id.eq.${student.id},student_id.is.null`);
    } else {
      query = query.is('student_id', null);
    }
    const { data, error } = await query;
    if (error) return res.status(500).json({ error: error.message });
    const items = (data||[]).map(a => ({ id: a.id, packId: a.pack_id, packName: a.packs?.name || 'Набор', personal: !!a.student_id }));
    res.json({ assignments: items });
  } catch (e) {
    res.status(500).json({ error: e.message || 'internal error' });
  }
});

// Words
app.get('/words', async (req, res) => {
  const { data, error } = await supabase.from('words').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/words', requireAdmin, upload.single('image'), async (req, res) => {
  const { ru, en } = req.body;
  if (!ru || !en) return res.status(400).json({ error: 'ru and en required' });
  let image_url = null;
  if (req.file) {
    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
    const filePath = `words/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { error: upErr } = await supabase.storage.from('images').upload(filePath, req.file.buffer, { contentType: req.file.mimetype, upsert: false });
    if (upErr) return res.status(500).json({ error: upErr.message });
    const { data: pub } = supabase.storage.from('images').getPublicUrl(filePath);
    image_url = pub.publicUrl;
  }
  const { data, error } = await supabase.from('words').insert({ ru, en, image_url }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/words/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('words').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Packs
app.get('/packs', async (req, res) => {
  const { data, error } = await supabase.from('packs').select('id,name,created_at,pack_words:pack_words(word_id)').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const mapped = data.map(p => ({ id: p.id, name: p.name, wordIds: p.pack_words?.map(x=>x.word_id) || [] }));
  res.json(mapped);
});

app.post('/packs', requireAdmin, async (req, res) => {
  const { name, wordIds } = req.body;
  if (!name || !Array.isArray(wordIds)) return res.status(400).json({ error: 'name and wordIds[] required' });
  const { data: pack, error } = await supabase.from('packs').insert({ name }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (wordIds.length) {
    const links = wordIds.map(wid => ({ pack_id: pack.id, word_id: wid }));
    const { error: linkErr } = await supabase.from('pack_words').insert(links);
    if (linkErr) return res.status(500).json({ error: linkErr.message });
  }
  res.json({ id: pack.id, name: pack.name, wordIds });
});

app.delete('/packs/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('packs').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Students list for admin
app.get('/students', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('students').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

// Students (auto-create via Telegram)
app.get('/me', async (req, res) => {
  const initData = req.headers['x-telegram-initdata'];
  const params = parseTelegramInitData(initData);
  if (!params) return res.status(400).json({ error: 'invalid initData' });
  const user = params.get('user');
  if (!user) return res.status(400).json({ error: 'no user' });
  const tg = JSON.parse(user);
  const tg_user_id = tg.id;
  const name = tg.first_name + (tg.last_name ? ' ' + tg.last_name : '');
  const username = tg.username || null;
  let { data: student, error } = await supabase.from('students').select('*').eq('tg_user_id', tg_user_id).single();
  if (error && error.code !== 'PGRST116') return res.status(500).json({ error: error.message });
  if (!student) {
    const ins = await supabase.from('students').insert({ tg_user_id, name, username }).select().single();
    if (ins.error) return res.status(500).json({ error: ins.error.message });
    student = ins.data;
  }
  res.json(student);
});

// Assignments
app.get('/assignments', requireAdmin, async (req, res) => {
  const { data, error } = await supabase.from('assignments').select('*').order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.post('/assignments', requireAdmin, async (req, res) => {
  const { studentId, packId } = req.body;
  if (!packId) return res.status(400).json({ error: 'packId required' });
  const { data, error } = await supabase.from('assignments').insert({ student_id: studentId || null, pack_id: packId }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
});

app.delete('/assignments/:id', requireAdmin, async (req, res) => {
  const { error } = await supabase.from('assignments').delete().eq('id', req.params.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

// Quiz helper
app.get('/quiz/:assignmentId', async (req, res) => {
  const { assignmentId } = req.params;
  const { data: a, error: e1 } = await supabase.from('assignments').select('id, pack_id').eq('id', assignmentId).single();
  if (e1) return res.status(404).json({ error: 'assignment not found' });
  const { data: pack, error: e2 } = await supabase.from('packs').select('id,name').eq('id', a.pack_id).single();
  if (e2) return res.status(404).json({ error: 'pack not found' });
  const { data: links } = await supabase.from('pack_words').select('word_id').eq('pack_id', pack.id);
  const wordIds = (links||[]).map(l=>l.word_id);
  const { data: words } = await supabase.from('words').select('*').in('id', wordIds);
  const { data: pool } = await supabase.from('words').select('en');
  function shuffle(arr){ return [...arr].sort(()=>Math.random()-0.5); }
  const enPool = (pool||[]).map(x=>x.en);
  const cards = (words||[]).map(w=>{
    const distractors = shuffle(enPool.filter(x=>x!==w.en)).slice(0,3);
    return { id: w.id, image: w.image_url, ru: w.ru, en: w.en, options: shuffle([w.en, ...distractors]) };
  });
  res.json({ assignmentId, pack: { id: pack.id, name: pack.name }, cards });
});

// Report
app.post('/report', async (req, res) => {
  const { assignmentId, studentName, answers } = req.body;
  if (!assignmentId || !Array.isArray(answers)) return res.status(400).json({ error: 'invalid body' });
  const { data, error } = await supabase.from('reports').insert({ assignment_id: assignmentId, student_name: studentName || null, answers }).select().single();
  if (error) return res.status(500).json({ error: error.message });
  // Optional: Telegram notify
  if (process.env.BOT_TOKEN && process.env.TEACHER_CHAT_ID) {
    const correct = answers.filter(a=>a.correctOnFirstTry).length; const total = answers.length;
    const text = `Отчет ученика: ${studentName || 'N/A'}\nЗадание: ${assignmentId}\nРезультат: ${correct}/${total} с первой попытки.`;
    try {
      await fetch(`https://api.telegram.org/bot${process.env.BOT_TOKEN}/sendMessage`, { method:'POST', headers:{'content-type':'application/json'}, body: JSON.stringify({ chat_id: process.env.TEACHER_CHAT_ID, text }) });
    } catch {}
  }
  res.json({ ok: true, reportId: data.id });
});

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});

import React, { useEffect, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || ''

type Word = { id:string, ru:string, en:string, image_url?:string }
type Pack = { id:string, name:string, wordIds:string[] }
type Student = { id:string, name:string, tg_user_id:number|null, username?:string|null }
type Assignment = { id:string, pack_id:string, student_id:string|null }

export default function App(){
  const [words, setWords] = useState<Word[]>([])
  const [packs, setPacks] = useState<Pack[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [name, setName] = useState('')
  const [wordChecks, setWordChecks] = useState<Record<string, boolean>>({})
  const ruRef = useRef<HTMLInputElement>(null)
  const enRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  async function api(path: string, init?: RequestInit){
    return fetch(`${API}${path}`, { ...(init||{}), headers: { ...(init?.headers||{}), 'x-admin-key': ADMIN_KEY } })
  }

  async function loadAll(){
    const [w,p,s,a] = await Promise.all([
      api('/words'), api('/packs'), api('/students'), api('/assignments')
    ])
    setWords(await w.json())
    setPacks(await p.json())
    setStudents(await s.json())
    setAssignments(await a.json())
  }

  useEffect(()=>{ loadAll() },[])

  async function addWord(){
    const fd = new FormData()
    if (!ruRef.current?.value || !enRef.current?.value) return
    fd.append('ru', ruRef.current.value)
    fd.append('en', enRef.current.value)
    const file = fileRef.current?.files?.[0]
    if (file) fd.append('image', file)
    await api('/words', { method: 'POST', body: fd })
    ruRef.current!.value = ''
    enRef.current!.value = ''
    if (fileRef.current) fileRef.current.value = ''
    loadAll()
  }

  async function createPack(){
    const ids = Object.entries(wordChecks).filter(([,v])=>v).map(([k])=>k)
    if (!name || ids.length===0) return alert('Имя и минимум одно слово')
    await api('/packs', { method:'POST', headers:{'content-type':'application/json','x-admin-key':ADMIN_KEY}, body: JSON.stringify({ name, wordIds: ids }) })
    setName(''); setWordChecks({}); loadAll()
  }

  async function createAssignment(packId: string, studentId?: string|null){
    await api('/assignments', { method:'POST', headers:{ 'content-type':'application/json','x-admin-key':ADMIN_KEY }, body: JSON.stringify({ packId, studentId: studentId||null }) })
    loadAll()
  }

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ color:'#a855f7', textShadow:'2px 2px #fff' }}>Админка</h1>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px,1fr))', gap:16 }}>
        <section style={card}>
          <h3>Слова</h3>
          <input placeholder='Русское' ref={ruRef} style={input}/>
          <input placeholder='English' ref={enRef} style={input}/>
          <input type='file' ref={fileRef} style={input}/>
          <button onClick={addWord} style={btn}>Добавить</button>
          <ul>
            {words.map(w=> (
              <li key={w.id}>{w.ru} — <b>{w.en}</b> {w.image_url && <img src={w.image_url} width={80}/>}</li>
            ))}
          </ul>
        </section>
        <section style={card}>
          <h3>Наборы</h3>
          <input placeholder='Имя набора' value={name} onChange={e=>setName(e.target.value)} style={input}/>
          <div>
            {words.map(w=> (
              <label key={w.id} style={{display:'inline-block', marginRight:8}}>
                <input type='checkbox' checked={!!wordChecks[w.id]} onChange={e=>setWordChecks(v=>({ ...v, [w.id]: e.target.checked }))}/> {w.ru}/{w.en}
              </label>
            ))}
          </div>
          <button onClick={createPack} style={btn}>Создать набор</button>
          <ul>
            {packs.map(p => (
              <li key={p.id}>{p.name} — слов: {p.wordIds.length}</li>
            ))}
          </ul>
        </section>
        <section style={card}>
          <h3>Ученики</h3>
          <ul>
            {students.map(s => (
              <li key={s.id}>{s.name} {s.username?`(@${s.username})`:''}</li>
            ))}
          </ul>
        </section>
        <section style={card}>
          <h3>Назначения</h3>
          <div>
            {packs.map(p => (
              <div key={p.id} style={{marginBottom:8}}>
                <b>{p.name}</b>
                <div style={{display:'flex', gap:8, flexWrap:'wrap', marginTop:6}}>
                  <button onClick={()=>createAssignment(p.id, null)} style={miniBtn}>Общий</button>
                  {students.map(s => (
                    <button key={s.id} onClick={()=>createAssignment(p.id, s.id)} style={miniBtn}>{s.name}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <ul>
            {assignments.map(a => (
              <li key={a.id}>ID: {a.id} — pack:{a.pack_id} {a.student_id?`студент:${a.student_id}`:'(общий)'} — ссылка: <code>{`/student?assignment=${a.id}`}</code></li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { background:'#ffffffc8', padding:12, borderRadius:14, boxShadow:'0 8px 20px rgba(0,0,0,.08)' }
const input: React.CSSProperties = { padding:'10px 12px', border:'2px solid #ddd', borderRadius:10, margin:'6px 6px 6px 0' }
const btn: React.CSSProperties = { padding:'10px 14px', borderRadius:12, border:'none', background:'#34d399', color:'#063', fontWeight:700, cursor:'pointer', marginTop:6 }
const miniBtn: React.CSSProperties = { padding:'6px 10px', borderRadius:12, border:'none', background:'#60a5fa', color:'#042', fontWeight:700, cursor:'pointer' }

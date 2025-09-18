import React, { useEffect, useMemo, useState } from 'react'
import WebApp from '@twa-dev/sdk'

type Card = { id: string, image: string | null, ru: string, en: string, options: string[] }

const API = import.meta.env.VITE_API_URL || 'http://localhost:4000'

export default function App(){
  const [assignmentId, setAssignmentId] = useState<string>('')
  const [myAssignments, setMyAssignments] = useState<{id:string, packName:string, packId:string, personal:boolean}[]>([])
  const [packName, setPackName] = useState<string>('')
  const [cards, setCards] = useState<Card[]>([])
  const [i, setI] = useState(0)
  const [answers, setAnswers] = useState<{wordId:string, correctOnFirstTry:boolean, attempts:number}[]>([])
  const [attempts, setAttempts] = useState<Record<string, number>>({})
  const [studentName, setStudentName] = useState('')

  useEffect(()=>{
    try { WebApp.ready(); } catch {}
    // Try to fetch assignments available to this user
    const headers: Record<string, string> = {}
    if (WebApp.initData) headers['x-telegram-initdata'] = WebApp.initData
    fetch(`${API}/my-assignments`, { headers })
      .then(r=>r.json())
      .then(d=>{
        const list = d?.assignments || []
        setMyAssignments(list)
        if (list.length === 1) {
          setAssignmentId(list[0].id);
          loadQuiz(list[0].id)
        }
      })
      .catch(()=>{})
  },[])

  const initData = useMemo(()=> WebApp.initData || '', [])

  async function ensureMe(){
    if (!initData) return
    const res = await fetch(`${API}/me`, { headers: { 'x-telegram-initdata': initData }})
    if (res.ok) {
      const me = await res.json()
      setStudentName(me.name || '')
    }
  }

  async function loadQuiz(id?: string){
    const target = id || assignmentId
    if (!target) return
    await ensureMe()
    const r = await fetch(`${API}/quiz/${target}`)
    if(!r.ok){ alert('Задание не найдено'); return }
    const data = await r.json()
    setPackName(data.pack.name)
    setCards(data.cards)
    setI(0)
    setAnswers([])
    setAttempts({})
  }

  function pick(opt: string){
    const card = cards[i]
    const cur = (attempts[card.id] || 0) + 1
  setAttempts((a: Record<string, number>) => ({ ...a, [card.id]: cur }))
    if (opt === card.en) {
  setAnswers((ans: {wordId:string, correctOnFirstTry:boolean, attempts:number}[]) => [...ans, { wordId: card.id, correctOnFirstTry: cur === 1, attempts: cur }])
    }
  }

  async function next(){
    if (i + 1 >= cards.length) {
      // done
      const body = { assignmentId, studentName, answers }
      await fetch(`${API}/report`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      alert('Готово! Результаты отправлены.')
      return
    }
    setI(i+1)
  }

  const card = cards[i]
  const done = cards.length>0 && answers.length === cards.length

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ color:'#0ea5e9', textShadow:'2px 2px #fff' }}>Friends Game</h1>
      {cards.length === 0 && (
        <div style={panel}>
          <p>Выберите тренировку:</p>
          {myAssignments.length === 0 && <div style={{opacity:.7}}>Пока нет доступных заданий</div>}
          <div style={{display:'grid', gap:8}}>
            {myAssignments.map(a => (
              <button key={a.id} onClick={()=>{ setAssignmentId(a.id); loadQuiz(a.id) }} style={{...btn, background:'#facc15', color:'#7a5300'}}>
                {a.packName} {a.personal ? '👤' : '🌐'}
              </button>
            ))}
          </div>
        </div>
      )}
      {cards.length>0 && (
        <div style={panel}>
          <h3 style={{marginTop:0}}>{packName}</h3>
          <div style={{opacity:.7}}>{i+1} / {cards.length}</div>
          {card && (
            <div>
              {card.image && <img src={card.image} alt='' style={{maxWidth:'100%', borderRadius:16, border:'3px solid #fff'}}/>}
              <div style={{fontSize:28, marginTop:8}}>{card.ru}</div>
              <div style={grid}>
                {card.options.map((o)=>{
                  const isAnswered = answers.find(a=>a.wordId===card.id)
                  const isCorrect = isAnswered && o===card.en
                  const disabled = isAnswered && o!==card.en
                  return (
                    <button key={o} onClick={()=>pick(o)} disabled={!!disabled} style={{...optBtn, ...(isCorrect?correctBtn:{}), ...(disabled?wrongBtn:{})}}>{o}</button>
                  )
                })}
              </div>
              {answers.find(a=>a.wordId===card.id) && (
                <button onClick={next} style={{...btn, marginTop:12}}>Дальше</button>
              )}
            </div>
          )}
        </div>
      )}
      {done && (
        <div style={panel}>
          <h3>Молодец! 🎉</h3>
          <p>Результаты отправлены преподавателю.</p>
        </div>
      )}
    </div>
  )
}

const panel: React.CSSProperties = { background:'#ffffffb8', borderRadius:16, padding:16, boxShadow:'0 8px 20px rgba(0,0,0,.08)' }
const input: React.CSSProperties = { padding:'12px 14px', borderRadius:12, border:'2px solid #bae6fd', marginRight:8 }
const btn: React.CSSProperties = { padding:'12px 16px', borderRadius:12, border:'none', background:'#34d399', color:'#063', fontWeight:700, cursor:'pointer' }
const grid: React.CSSProperties = { display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }
const optBtn: React.CSSProperties = { padding:'14px 10px', borderRadius:14, border:'3px solid #fde68a', background:'#fef9c3', fontWeight:700, cursor:'pointer' }
const correctBtn: React.CSSProperties = { background:'#bbf7d0', borderColor:'#86efac' }
const wrongBtn: React.CSSProperties = { background:'#fecaca', borderColor:'#fca5a5', color:'#7f1d1d' }

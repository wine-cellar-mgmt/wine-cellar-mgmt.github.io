import { T } from '../config/cellars.js'
import { Btn, useIsMobile } from './ui.jsx'

const TABS = [
  { id:'dash',   label:'대시보드', icon:'🏠' },
  { id:'cellar', label:'셀러 뷰',  icon:'🍾' },
  { id:'drinking', label:'음용 적기', icon:'⏰' },
  { id:'log',    label:'음주 기록', icon:'📖' },
  { id:'stats',  label:'통계',     icon:'📊' },
  { id:'producer', label:'생산자', icon:'🏛️' },
  { id:'search', label:'검색',     icon:'🔍' },
  { id:'list',   label:'전체 목록', icon:'📋' },
]

export default function Header({ tab, setTab, onAdd, onBulk, onSettings, syncStatus }) {
  const mobile = useIsMobile()
  // 사용법 안내(public/guide.html) — 배포 base 경로를 붙여 새 탭으로 연다
  const guideUrl = `${import.meta.env.BASE_URL}guide.html`
  const syncDot = { saving:'💾', loading:'☁', synced:'✓', local:'·' }[syncStatus]||'·'
  const syncCol = { saving:T.gold, loading:T.gold, synced:'#4a8a5e', local:T.border }[syncStatus]||T.border

  if (mobile) return (
    <>
      <header style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 14px', height:50, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100 }}>
        <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.3rem', fontWeight:600, color:T.gold }}>🍷 CAVE</span>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:'0.7rem', color:syncCol }}>{syncDot}</span>
          <button onClick={onBulk} style={{ background:T.gold+'22', border:`1px solid ${T.gold}44`, color:T.gold, cursor:'pointer', borderRadius:7, padding:'5px 9px', fontSize:'0.82rem' }}>📷</button>
          <a href={guideUrl} target="_blank" rel="noopener noreferrer" title="사용법 안내" style={{ color:T.muted, textDecoration:'none', fontSize:'1rem', padding:'4px' }}>❓</a>
          <button onClick={onSettings} style={{ background:'none', border:'none', color:T.muted, cursor:'pointer', fontSize:'1rem', padding:'4px' }}>⚙️</button>
        </div>
      </header>
      <nav style={{ position:'fixed', bottom:0, left:0, right:0, background:T.surface, borderTop:`1px solid ${T.border}`, display:'flex', zIndex:100, height:60, paddingBottom:'env(safe-area-inset-bottom,0px)' }}>
        {TABS.map(({ id, label, icon }) => (
          <button key={id} onClick={() => setTab(id)} style={{ flex:1, background:'none', border:'none', cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:3, color:tab===id?T.gold:T.muted, transition:'color 0.15s', position:'relative' }}>
            {tab===id && <div style={{ position:'absolute', top:0, left:'20%', right:'20%', height:2, background:T.gold, borderRadius:'0 0 2px 2px' }} />}
            <span style={{ fontSize:'1.1rem', lineHeight:1 }}>{icon}</span>
            <span style={{ fontSize:'0.52rem', fontWeight:tab===id?600:400 }}>{label}</span>
          </button>
        ))}
      </nav>
      <button onClick={onAdd} style={{ position:'fixed', bottom:70, right:16, zIndex:99, width:52, height:52, borderRadius:'50%', background:`linear-gradient(135deg,${T.wine},${T.wineLight})`, color:T.cream, border:'none', fontSize:'1.5rem', boxShadow:'0 4px 16px rgba(124,30,46,0.5)', display:'flex', alignItems:'center', justifyContent:'center' }}>＋</button>
    </>
  )

  return (
    <header style={{ background:T.surface, borderBottom:`1px solid ${T.border}`, padding:'0 20px', height:56, display:'flex', alignItems:'center', justifyContent:'space-between', position:'sticky', top:0, zIndex:100, gap:8 }}>
      <span style={{ fontFamily:'Cormorant Garamond,serif', fontSize:'1.4rem', fontWeight:600, color:T.gold, flexShrink:0 }}>🍷 CAVE</span>
      <nav style={{ display:'flex', gap:2, flex:1, justifyContent:'center' }}>
        {TABS.map(({ id, label }) => (
          <button key={id} onClick={() => setTab(id)} style={{ background:tab===id?T.gold:'transparent', color:tab===id?T.bg:T.muted, border:'none', padding:'6px 11px', borderRadius:8, fontSize:'0.78rem', fontWeight:tab===id?600:400, whiteSpace:'nowrap' }}>{label}</button>
        ))}
      </nav>
      <div style={{ display:'flex', gap:6, alignItems:'center', flexShrink:0 }}>
        <span style={{ fontSize:'0.85rem', color:syncCol }}>{syncDot}</span>
        <button onClick={onBulk} style={{ background:T.gold+'22', border:`1px solid ${T.gold}44`, color:T.gold, cursor:'pointer', borderRadius:7, padding:'5px 10px', fontSize:'0.8rem' }}>📷 일괄 입력</button>
        <a href={guideUrl} target="_blank" rel="noopener noreferrer" title="사용법 안내" style={{ background:'transparent', border:`1px solid ${T.border}`, color:T.muted, textDecoration:'none', borderRadius:7, padding:'5px 10px', fontSize:'0.8rem', whiteSpace:'nowrap' }}>❓ 사용법</a>
        <button onClick={onSettings} style={{ background:'transparent', border:'none', color:T.muted, cursor:'pointer', fontSize:'1rem', padding:'4px 6px' }}>⚙️</button>
        <Btn variant="wine" onClick={onAdd} size="sm">+ 추가</Btn>
      </div>
    </header>
  )
}

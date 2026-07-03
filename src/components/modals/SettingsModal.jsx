import { useState } from 'react'
import { cellarById, T, bottleLabel } from '../../config/cellars.js'
import { signOut } from '../../lib/supabase.js'
import { Btn } from '../ui.jsx'

// ── CSV 내보내기 (엑셀 호환: UTF-8 BOM + CRLF) ───────────────────
function csvEscape(v) {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

function downloadCsv(filename, headers, rows) {
  const lines = [headers, ...rows].map(r => r.map(csvEscape).join(','))
  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = filename
  a.click()
  URL.revokeObjectURL(a.href)
}

const today = () => new Date().toISOString().split('T')[0]

function exportWinesCsv(wines) {
  downloadCsv(`CAVE_와인목록_${today()}.csv`,
    ['이름', '빈티지', '수량', '용량', '타입', '셀러', '칸', '구매일', '구매가(₩)', '시장가(₩)', 'Vivino($)', 'Vivino평점', '생산자', '지역', '국가', '품종', '음용적기 시작', '음용적기 끝', '메모'],
    wines.map(w => [
      w.name, w.vintage || '', w.qty || 1, bottleLabel(w.bottleSize || 750), w.wineType || '',
      cellarById(w.cellarId)?.name || w.cellarId, w.slot, w.purchaseDate || '',
      w.price || '', w.wineSearcherPrice || '', w.vivinoPrice || '', w.vivinoRating || '',
      w.producer || '', w.region || '', w.country || '', w.grape || '',
      w.drinkingFrom || '', w.drinkingTo || '', w.notes || '',
    ]))
}

function exportDrinkLogCsv(drinkLog) {
  downloadCsv(`CAVE_음주기록_${today()}.csv`,
    ['날짜', '와인', '빈티지', '셀러', '칸', '함께한 사람', '자리', '평점', '한마디'],
    drinkLog.map(r => [
      r.date || '', r.wineName || '', r.wineVintage || '', r.cellarName || '', r.slot || '',
      r.companions || '', r.occasion || '', r.rating || '', r.review || '',
    ]))
}

// ── Settings Modal ──────────────────────────────────────────────
export function SettingsModal({ wines = [], drinkLog = [], onClose }) {
  const [loggingOut, setLoggingOut] = useState(false)
  async function handleLogout() {
    setLoggingOut(true)
    await signOut()
    // onAuthChange 리스너가 로그인 화면으로 전환
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box" style={{ maxWidth: 440 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'Cormorant Garamond, serif', fontSize: '1.3rem', color: T.cream }}>⚙️ 설정</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: T.muted, fontSize: '1.2rem' }}>✕</button>
        </div>
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16, fontSize: '0.8rem', color: T.text, lineHeight: 1.6 }}>
          <strong style={{ color: T.gold }}>AI 기능</strong> (와인 정보 검색, 사진 일괄 입력)은<br />
          서버를 통해 안전하게 처리됩니다.<br />
          <span style={{ color: T.muted, fontSize: '0.75rem' }}>API 키는 더 이상 기기에 저장되지 않습니다.</span>
        </div>

        {/* CSV 내보내기 — 엑셀에서 바로 열 수 있음 (UTF-8 BOM) */}
        <div style={{ background: T.surface, borderRadius: 8, padding: '12px 14px', marginBottom: 16 }}>
          <div style={{ fontSize: '0.72rem', color: T.gold, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 10 }}>📥 내보내기 (CSV · 엑셀 호환)</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => exportWinesCsv(wines)} disabled={wines.length === 0}
              style={{ background: T.gold + '22', color: T.gold, border: `1px solid ${T.gold}44`, borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: wines.length ? 'pointer' : 'not-allowed', opacity: wines.length ? 1 : 0.5 }}>
              🍷 와인 목록 ({wines.length}종)
            </button>
            <button onClick={() => exportDrinkLogCsv(drinkLog)} disabled={drinkLog.length === 0}
              style={{ background: T.wine + '22', color: T.wineLight, border: `1px solid ${T.wine}66`, borderRadius: 8, padding: '8px 14px', fontSize: '0.8rem', fontWeight: 600, cursor: drinkLog.length ? 'pointer' : 'not-allowed', opacity: drinkLog.length ? 1 : 0.5 }}>
              🥂 음주 기록 ({drinkLog.length}건)
            </button>
          </div>
          <div style={{ fontSize: '0.68rem', color: T.muted, marginTop: 8 }}>엑셀에서 바로 열립니다. 보험·자산 기록용으로 활용하세요.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', alignItems: 'center' }}>
          <Btn variant="ghost" onClick={handleLogout} disabled={loggingOut}>{loggingOut ? '로그아웃 중…' : '🚪 로그아웃'}</Btn>
          <Btn variant="gold" onClick={onClose}>닫기</Btn>
        </div>
      </div>
    </div>
  )
}

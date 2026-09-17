import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { BrowserRouter, Routes, Route, NavLink, Link, Outlet } from 'react-router-dom'
import {
  LayoutDashboard, CalendarDays, LineChart, Repeat, BookOpen, ClipboardList,
  Brain, Sparkles, CheckSquare, ListTodo, Upload, Bot, Sun, Moon, Settings,
  Plus, ChevronLeft, ChevronRight, Star, UploadCloud, Boxes, DollarSign, Clock,
  ListChecks, Paperclip, Play, Download, Pencil, Trash2, FileDown, Send, ArrowUpDown,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts'

/* ==================== TYPES ==================== */
type Direction = 'long' | 'short'
type InstrumentType = 'Futuros' | 'Opciones' | 'Forex' | 'Acciones'

interface Trade {
  id: string
  symbol: string
  instrument_type: InstrumentType
  direction: Direction
  entry_price: number
  exit_price: number
  position_size: number
  pnl: number
  risk_amount?: number
  stop_loss?: number
  take_profit?: number
  entry_datetime: string
  exit_datetime: string
  strategy_id?: string | null
  custom_setup?: string
  checklist_id?: string | null
  rating?: number
  screenshots?: string[]
  notes?: string
  created_at: string
}

interface Strategy { id: string; name: string; description?: string; created_at: string }
interface ChecklistItem { id: string; text: string }
interface Checklist { id: string; name: string; items: ChecklistItem[]; created_at: string }
interface HabitRule { id: string; text: string; created_at: string }
interface HabitLog { id: string; rule_id: string; date: string; checked: boolean }
interface UserSettings {
  theme: 'light' | 'dark'
  language: 'es'
  breakeven_threshold: number
  commission_nq: number
  commission_mnq: number
}

/* ==================== UTILS ==================== */
const MONTHS_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DAYS_ES = ['LUN','MAR','MIÉ','JUE','VIE','SÁB','DOM']

function toISODate(d: Date) { return d.toISOString().slice(0, 10) }
function isSameDay(a: Date, b: Date) { return toISODate(a) === toISODate(b) }
function getISOWeek(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
}
function getMonthMatrix(year: number, month: number): Date[][] {
  const firstDay = new Date(year, month, 1)
  const startOffset = (firstDay.getDay() + 6) % 7
  const gridStart = new Date(year, month, 1 - startOffset)
  const weeks: Date[][] = []
  let cursor = new Date(gridStart)
  for (let w = 0; w < 6; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) { week.push(new Date(cursor)); cursor.setDate(cursor.getDate() + 1) }
    weeks.push(week)
  }
  return weeks
}
function fmt(n: number) {
  const sign = n < 0 ? '-' : ''
  return `${sign}$${Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/* ==================== CALCULATIONS ==================== */
function getCommissionPerContract(symbol: string, settings: UserSettings) {
  const s = symbol.toUpperCase()
  if (s.includes('MNQ')) return settings.commission_mnq
  if (s.includes('NQ')) return settings.commission_nq
  return 0
}
function getTradeCommission(trade: Trade, settings: UserSettings) {
  return getCommissionPerContract(trade.symbol, settings) * (trade.position_size || 0)
}
function getNetPnl(trade: Trade, settings: UserSettings) {
  return trade.pnl - getTradeCommission(trade, settings)
}
function classifyTrade(trade: Trade, settings: UserSettings): 'win' | 'loss' | 'be' {
  const net = getNetPnl(trade, settings)
  if (Math.abs(net) <= settings.breakeven_threshold) return 'be'
  return net > 0 ? 'win' : 'loss'
}
function computeMetrics(trades: Trade[], settings: UserSettings) {
  if (trades.length === 0) {
    return { netPnl: 0, grossPnl: 0, totalCommissions: 0, tradingDays: 0, profitFactor: 0,
      bestDay: null as any, worstDay: null as any, winRate: 0, wins: 0, losses: 0, breakevens: 0,
      equityCurve: [] as { date: string; equity: number }[], currentEquity: 0 }
  }
  const sorted = [...trades].sort((a, b) => new Date(a.exit_datetime).getTime() - new Date(b.exit_datetime).getTime())
  const byDay: Record<string, number> = {}
  let grossPnl = 0, totalCommissions = 0, wins = 0, losses = 0, breakevens = 0, grossWin = 0, grossLoss = 0
  for (const t of sorted) {
    const net = getNetPnl(t, settings)
    const day = t.exit_datetime.slice(0, 10)
    byDay[day] = (byDay[day] || 0) + net
    grossPnl += t.pnl
    totalCommissions += getTradeCommission(t, settings)
    const cls = classifyTrade(t, settings)
    if (cls === 'win') { wins++; grossWin += net } else if (cls === 'loss') { losses++; grossLoss += Math.abs(net) } else breakevens++
  }
  const days = Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0]))
  let equity = 0
  const equityCurve = days.map(([date, pnl]) => { equity += pnl; return { date, equity } })
  const bestDayEntry = days.reduce((best, cur) => (cur[1] > (best?.[1] ?? -Infinity) ? cur : best), null as [string, number] | null)
  const worstDayEntry = days.reduce((worst, cur) => (cur[1] < (worst?.[1] ?? Infinity) ? cur : worst), null as [string, number] | null)
  return {
    netPnl: grossPnl - totalCommissions, grossPnl, totalCommissions, tradingDays: days.length,
    profitFactor: grossLoss > 0 ? +(grossWin / grossLoss).toFixed(2) : grossWin > 0 ? Infinity : 0,
    bestDay: bestDayEntry ? { date: bestDayEntry[0], pnl: bestDayEntry[1] } : null,
    worstDay: worstDayEntry ? { date: worstDayEntry[0], pnl: worstDayEntry[1] } : null,
    winRate: wins + losses > 0 ? +((wins / (wins + losses)) * 100).toFixed(1) : 0,
    wins, losses, breakevens, equityCurve, currentEquity: equity,
  }
}
function computePerformanceScore(m: ReturnType<typeof computeMetrics>) {
  const wrScore = Math.min(m.winRate, 100) * 0.4
  const pfScore = Math.min((m.profitFactor === Infinity ? 3 : m.profitFactor) / 3, 1) * 40
  const consistencyScore = Math.min(m.tradingDays / 20, 1) * 20
  const total = wrScore * 0.5 + pfScore + consistencyScore * 0.5
  return Math.round(total > 100 ? 100 : total)
}
function computeExpectancy(trades: Trade[], settings: UserSettings) {
  if (trades.length === 0) return 0
  const total = trades.reduce((acc, t) => acc + getNetPnl(t, settings), 0)
  return +(total / trades.length).toFixed(2)
}
function computeAvgWinLoss(trades: Trade[], settings: UserSettings) {
  const wins = trades.filter(t => classifyTrade(t, settings) === 'win').map(t => getNetPnl(t, settings))
  const losses = trades.filter(t => classifyTrade(t, settings) === 'loss').map(t => getNetPnl(t, settings))
  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0
  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0
  return { avgWin: +avgWin.toFixed(2), avgLoss: +avgLoss.toFixed(2) }
}
function computeMaxDrawdown(equityCurve: { date: string; equity: number }[]) {
  let peak = -Infinity, maxDD = 0
  for (const p of equityCurve) { peak = Math.max(peak, p.equity); maxDD = Math.min(maxDD, p.equity - peak) }
  return maxDD
}

/* ==================== THEME CONTEXT ==================== */
type Theme = 'light' | 'dark'
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void }>({ theme: 'light', toggleTheme: () => {} })
function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('tj_theme') as Theme) || 'light')
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
    localStorage.setItem('tj_theme', theme)
  }, [theme])
  return <ThemeContext.Provider value={{ theme, toggleTheme: () => setTheme(t => (t === 'light' ? 'dark' : 'light')) }}>{children}</ThemeContext.Provider>
}
const useTheme = () => useContext(ThemeContext)

/* ==================== APP DATA CONTEXT ==================== */
function useLocalState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : initial
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(state)) }, [key, state])
  return [state, setState] as const
}
const DEFAULT_SETTINGS: UserSettings = { theme: 'light', language: 'es', breakeven_threshold: 10, commission_nq: 4.0, commission_mnq: 1.04 }

interface AppDataCtx {
  trades: Trade[]; addTrade: (t: Trade) => void
  strategies: Strategy[]; addStrategy: (s: Strategy) => void
  checklists: Checklist[]; addChecklist: (c: Checklist) => void; updateChecklist: (id: string, c: Partial<Checklist>) => void; deleteChecklist: (id: string) => void
  habitRules: HabitRule[]; addHabitRule: (r: HabitRule) => void
  habitLogs: HabitLog[]; toggleHabitLog: (ruleId: string, date: string) => void
  settings: UserSettings; updateSettings: (s: Partial<UserSettings>) => void
}
const AppDataContext = createContext<AppDataCtx | null>(null)
function AppDataProvider({ children }: { children: React.ReactNode }) {
  const [trades, setTrades] = useLocalState<Trade[]>('tj_trades', [])
  const [strategies, setStrategies] = useLocalState<Strategy[]>('tj_strategies', [])
  const [checklists, setChecklists] = useLocalState<Checklist[]>('tj_checklists', [])
  const [habitRules, setHabitRules] = useLocalState<HabitRule[]>('tj_habit_rules', [])
  const [habitLogs, setHabitLogs] = useLocalState<HabitLog[]>('tj_habit_logs', [])
  const [settings, setSettings] = useLocalState<UserSettings>('tj_settings', DEFAULT_SETTINGS)

  const value: AppDataCtx = {
    trades, addTrade: (t) => setTrades(prev => [t, ...prev]),
    strategies, addStrategy: (s) => setStrategies(prev => [s, ...prev]),
    checklists, addChecklist: (c) => setChecklists(prev => [c, ...prev]),
    updateChecklist: (id, c) => setChecklists(prev => prev.map(x => (x.id === id ? { ...x, ...c } : x))),
    deleteChecklist: (id) => setChecklists(prev => prev.filter(x => x.id !== id)),
    habitRules, addHabitRule: (r) => setHabitRules(prev => [...prev, r]),
    habitLogs,
    toggleHabitLog: (ruleId, date) => setHabitLogs(prev => {
      const existing = prev.find(l => l.rule_id === ruleId && l.date === date)
      if (existing) return prev.map(l => (l.id === existing.id ? { ...l, checked: !l.checked } : l))
      return [...prev, { id: crypto.randomUUID(), rule_id: ruleId, date, checked: true }]
    }),
    settings, updateSettings: (s) => setSettings(prev => ({ ...prev, ...s })),
  }
  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}
function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData debe usarse dentro de AppDataProvider')
  return ctx
}

/* ==================== UI COMPONENTS ==================== */
function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white dark:bg-ink-800 border border-black/5 dark:border-white/5 rounded-2xl shadow-soft ${className}`}>{children}</div>
}
function SectionHeader({ eyebrow, title, subtitle, right }: { eyebrow: string; title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
      <div>
        <p className="text-xs font-semibold tracking-widest text-accent uppercase mb-1">{eyebrow}</p>
        <h1 className="serif text-3xl md:text-4xl font-semibold">{title}</h1>
        {subtitle && <p className="text-sm text-ink-900/60 dark:text-bone-100/60 mt-1">{subtitle}</p>}
      </div>
      {right && <div className="flex items-center gap-3">{right}</div>}
    </div>
  )
}
function StatCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean | null }) {
  const color = positive === undefined || positive === null ? 'text-ink-900 dark:text-bone-100' : positive ? 'text-profit' : 'text-loss'
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-ink-900/50 dark:text-bone-100/50 mb-2">{label}</p>
      <p className={`text-2xl font-semibold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mt-1">{sub}</p>}
    </Card>
  )
}
function PillTabs({ tabs, active, onChange }: { tabs: { id: string; label: string }[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="inline-flex bg-black/5 dark:bg-white/5 p-1 rounded-full gap-1 flex-wrap">
      {tabs.map(t => (
        <button key={t.id} onClick={() => onChange(t.id)}
          className={`px-4 py-1.5 text-sm font-medium rounded-full transition ${active === t.id ? 'bg-accent text-white shadow-soft' : 'text-ink-900/60 dark:text-bone-100/60 hover:text-ink-900 dark:hover:text-bone-100'}`}>
          {t.label}
        </button>
      ))}
    </div>
  )
}
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <label className="flex items-center gap-3 cursor-pointer select-none">
      <button type="button" onClick={() => onChange(!checked)} className={`w-11 h-6 rounded-full relative transition ${checked ? 'bg-accent' : 'bg-black/15 dark:bg-white/15'}`}>
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
      {label && <span className="text-sm">{label}</span>}
    </label>
  )
}
function DirectionToggle({ value, onChange }: { value: Direction; onChange: (v: Direction) => void }) {
  return (
    <div className="inline-flex rounded-xl overflow-hidden border border-black/10 dark:border-white/10">
      <button type="button" onClick={() => onChange('long')} className={`px-5 py-2 text-sm font-semibold transition ${value === 'long' ? 'bg-profit text-white' : 'bg-transparent text-ink-900/50 dark:text-bone-100/50'}`}>LONG</button>
      <button type="button" onClick={() => onChange('short')} className={`px-5 py-2 text-sm font-semibold transition ${value === 'short' ? 'bg-loss text-white' : 'bg-transparent text-ink-900/50 dark:text-bone-100/50'}`}>SHORT</button>
    </div>
  )
}
function Gauge({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score))
  const radius = 80
  const circumference = Math.PI * radius
  const offset = circumference * (1 - clamped / 100)
  const color = clamped >= 70 ? '#16A34A' : clamped >= 40 ? '#D97706' : '#DC2626'
  return (
    <div className="relative flex flex-col items-center">
      <svg width="200" height="110" viewBox="0 0 200 110">
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke="currentColor" className="text-black/10 dark:text-white/10" strokeWidth="14" strokeLinecap="round" />
        <path d="M 20 100 A 80 80 0 0 1 180 100" fill="none" stroke={color} strokeWidth="14" strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      </svg>
      <div className="absolute top-8 flex flex-col items-center">
        <span className="serif text-4xl font-semibold">{clamped}</span>
        <span className="text-[10px] uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40">Score</span>
      </div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="block text-xs font-medium text-ink-900/50 dark:text-bone-100/50 mb-1.5">{label}</label>{children}</div>
}
const inputCls = 'w-full bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40'

/* ==================== SIDEBAR & LAYOUT ==================== */
const mainNav = [
  { to: '/', label: 'Panel', icon: LayoutDashboard, end: true },
  { to: '/calendar', label: 'Calendario', icon: CalendarDays },
  { to: '/analytics', label: 'Analítica', icon: LineChart },
  { to: '/trades', label: 'Operaciones', icon: Repeat },
  { to: '/strategies', label: 'Estrategias', icon: BookOpen },
  { to: '/weekly-review', label: 'Resumen Semanal', icon: ClipboardList },
  { to: '/mindset', label: 'Mindset', icon: Brain },
  { to: '/zen', label: 'ZEN', icon: Sparkles },
]
const toolsNav = [
  { to: '/habits', label: 'Hábitos', icon: CheckSquare },
  { to: '/checklists', label: 'Checklists', icon: ListTodo },
  { to: '/import-export', label: 'Importar/Exportar', icon: Upload },
  { to: '/ai', label: 'Nova IA', icon: Bot },
]
function NavItem({ to, label, icon: Icon, end }: { to: string; label: string; icon: any; end?: boolean }) {
  return (
    <NavLink to={to} end={end} className={({ isActive }) =>
      `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition ${isActive ? 'bg-accent text-white shadow-soft' : 'text-ink-900/60 dark:text-bone-100/60 hover:bg-black/5 dark:hover:bg-white/5 hover:text-ink-900 dark:hover:text-bone-100'}`}>
      <Icon size={18} strokeWidth={2} /><span>{label}</span>
    </NavLink>
  )
}
function Sidebar() {
  const { theme, toggleTheme } = useTheme()
  return (
    <aside className="w-64 shrink-0 h-screen sticky top-0 flex flex-col bg-bone-100/60 dark:bg-ink-800/60 border-r border-black/5 dark:border-white/5 backdrop-blur">
      <div className="px-5 pt-6 pb-5">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center text-white font-serif font-bold">t</div>
          <span className="serif text-xl font-semibold">tujournal</span>
        </div>
        <p className="text-[11px] uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 mt-1 ml-1">Cockpit de Rendimiento</p>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 space-y-6">
        <div className="space-y-1">{mainNav.map(item => <NavItem key={item.to} {...item} />)}</div>
        <div>
          <p className="px-3 text-[10px] font-semibold uppercase tracking-widest text-ink-900/35 dark:text-bone-100/35 mb-2">Herramientas</p>
          <div className="space-y-1">{toolsNav.map(item => <NavItem key={item.to} {...item} />)}</div>
        </div>
      </nav>
      <div className="px-3 py-4 border-t border-black/5 dark:border-white/5 space-y-3">
        <button onClick={toggleTheme} className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm hover:bg-black/5 dark:hover:bg-white/5">
          {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          <span>{theme === 'light' ? 'Modo oscuro' : 'Modo claro'}</span>
        </button>
        <div className="flex items-center justify-between px-2">
          <NavLink to="/settings" className="flex items-center gap-2 group">
            <div className="w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">JT</div>
            <div className="leading-tight"><p className="text-sm font-medium">Trader</p><p className="text-[11px] text-ink-900/40 dark:text-bone-100/40">Cuenta fondeada</p></div>
          </NavLink>
          <NavLink to="/settings" className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/5"><Settings size={16} /></NavLink>
        </div>
      </div>
    </aside>
  )
}
function AppLayout() {
  return (
    <div className="flex min-h-screen bg-bone-50 dark:bg-ink-900">
      <Sidebar />
      <main className="flex-1 p-6 md:p-8 max-w-[1600px] mx-auto w-full"><Outlet /></main>
    </div>
  )
}

/* ==================== OVERVIEW PAGE ==================== */
function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-black/5 dark:bg-white/5 rounded-lg px-3 py-2">
      <p className="text-[10px] uppercase tracking-wide text-ink-900/40 dark:text-bone-100/40">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  )
}
function OverviewPage() {
  const { trades, strategies, settings } = useAppData()
  const now = new Date()
  const [month, setMonth] = useState(now.getMonth())
  const [year, setYear] = useState(now.getFullYear())
  const monthTrades = useMemo(() => trades.filter(t => {
    const d = new Date(t.exit_datetime)
    return d.getMonth() === month && d.getFullYear() === year
  }), [trades, month, year])
  const metrics = useMemo(() => computeMetrics(monthTrades, settings), [monthTrades, settings])
  const score = computePerformanceScore(metrics)
  const expectancy = computeExpectancy(monthTrades, settings)
  const maxDD = computeMaxDrawdown(metrics.equityCurve)
  const strategyPerf = useMemo(() => {
    const map: Record<string, { name: string; pnl: number; count: number; wins: number }> = {}
    monthTrades.forEach(t => {
      const strat = strategies.find(s => s.id === t.strategy_id)
      const key = strat?.name || t.custom_setup || 'Sin etiquetar'
      if (!map[key]) map[key] = { name: key, pnl: 0, count: 0, wins: 0 }
      map[key].pnl += t.pnl; map[key].count += 1
      if (t.pnl > 0) map[key].wins += 1
    })
    return Object.values(map).sort((a, b) => b.pnl - a.pnl).slice(0, 5)
  }, [monthTrades, strategies])
  const recentTrades = [...trades].sort((a, b) => new Date(b.exit_datetime).getTime() - new Date(a.exit_datetime).getTime()).slice(0, 5)

  return (
    <div>
      <SectionHeader eyebrow="Dashboard" title="Overview" subtitle="Tu rendimiento consolidado del periodo seleccionado."
        right={
          <div className="flex items-center gap-3">
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="bg-white dark:bg-ink-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm">
              {MONTHS_ES.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="bg-white dark:bg-ink-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm">
              {[year - 1, year, year + 1].map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <Link to="/zen" className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"><Sparkles size={16} /> ZEN</Link>
            <Link to="/trades" className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft hover:bg-accent-light"><Plus size={16} /> New Trade</Link>
          </div>
        } />

      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 mb-6">
        <StatCard label="Net P&L" value={fmt(metrics.netPnl)} positive={metrics.netPnl >= 0} />
        <StatCard label="P&L Bruto" value={fmt(metrics.grossPnl)} sub={`Comisiones: -${metrics.totalCommissions.toFixed(2)}`} positive={metrics.grossPnl >= 0} />
        <StatCard label="Trading Days" value={String(metrics.tradingDays)} />
        <StatCard label="Profit Factor" value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)} positive={metrics.profitFactor >= 1} />
        <StatCard label="Best Day" value={metrics.bestDay ? fmt(metrics.bestDay.pnl) : '—'} positive={metrics.bestDay ? metrics.bestDay.pnl >= 0 : null} />
        <StatCard label="Win Rate" value={`${metrics.winRate}%`} sub={`${metrics.wins}W / ${metrics.losses}L`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        <Card className="xl:col-span-2 p-6">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40">Equity Curve</p>
              <h3 className="serif text-2xl font-semibold">{fmt(metrics.currentEquity)}</h3>
            </div>
            <div className="flex gap-4 text-xs">
              <div className="text-right"><p className="text-ink-900/40 dark:text-bone-100/40">Current</p><p className="font-semibold">{fmt(metrics.currentEquity)}</p></div>
              <div className="text-right"><p className="text-ink-900/40 dark:text-bone-100/40">Best day</p><p className="font-semibold text-profit">{metrics.bestDay ? fmt(metrics.bestDay.pnl) : '—'}</p></div>
              <div className="text-right"><p className="text-ink-900/40 dark:text-bone-100/40">Worst day</p><p className="font-semibold text-loss">{metrics.worstDay ? fmt(metrics.worstDay.pnl) : '—'}</p></div>
            </div>
          </div>
          {metrics.equityCurve.length === 0 ? (
            <div className="h-64 flex items-center justify-center text-ink-900/30 dark:text-bone-100/30 text-sm">No equity data yet</div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={metrics.equityCurve}>
                <defs><linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6D5EF6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#6D5EF6" stopOpacity={0} />
                </linearGradient></defs>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.08} vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="equity" stroke="#6D5EF6" strokeWidth={2} fill="url(#equityGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-6 flex flex-col items-center">
          <p className="text-xs uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 self-start mb-2">Performance Score</p>
          <Gauge score={score} />
          <p className="text-xs text-center text-ink-900/50 dark:text-bone-100/50 mt-3 mb-4">Combina tu winrate, profit factor y consistencia para estimar tu nivel de ejecución este periodo.</p>
          <div className="grid grid-cols-2 gap-3 w-full text-sm">
            <MiniMetric label="Winrate" value={`${metrics.winRate}%`} />
            <MiniMetric label="Max DD" value={fmt(maxDD)} />
            <MiniMetric label="Profit Factor" value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)} />
            <MiniMetric label="Sharpe" value="—" />
            <MiniMetric label="Sortino" value="—" />
            <MiniMetric label="Expectancy" value={fmt(expectancy)} />
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="serif text-xl font-semibold mb-4">Estrategias top</h3>
          {strategyPerf.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Aún no hay trades etiquetados con una estrategia.</p> : (
            <div className="space-y-3">
              {strategyPerf.map(s => (
                <div key={s.name} className="flex items-center justify-between text-sm">
                  <div><p className="font-medium">{s.name}</p><p className="text-xs text-ink-900/40 dark:text-bone-100/40">{s.count} trades · {Math.round((s.wins / s.count) * 100)}% WR</p></div>
                  <span className={`font-semibold ${s.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(s.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="serif text-xl font-semibold">Trades recientes</h3>
            <Link to="/trades" className="text-xs font-medium text-accent hover:underline">Últimos 10</Link>
          </div>
          {recentTrades.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">No hay operaciones registradas todavía.</p> : (
            <div className="space-y-2">
              {recentTrades.map(t => (
                <div key={t.id} className="flex items-center justify-between text-sm py-2 border-b border-black/5 dark:border-white/5 last:border-0">
                  <div className="flex items-center gap-3">
                    <span className={`text-[10px] font-bold px-2 py-1 rounded ${t.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>{t.direction.toUpperCase()}</span>
                    <div><p className="font-medium">{t.symbol}</p><p className="text-xs text-ink-900/40 dark:text-bone-100/40">{new Date(t.exit_datetime).toLocaleDateString()}</p></div>
                  </div>
                  <span className={`font-semibold ${t.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(t.pnl)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ==================== CALENDAR PAGE ==================== */
function CalendarPage() {
  const { trades, settings } = useAppData()
  const today = new Date()
  const [cursor, setCursor] = useState(new Date(today.getFullYear(), today.getMonth(), 1))
  const year = cursor.getFullYear(), month = cursor.getMonth()
  const weeks = useMemo(() => getMonthMatrix(year, month), [year, month])
  const monthTrades = useMemo(() => trades.filter(t => {
    const d = new Date(t.exit_datetime); return d.getMonth() === month && d.getFullYear() === year
  }), [trades, month, year])
  const metrics = useMemo(() => computeMetrics(monthTrades, settings), [monthTrades, settings])
  const pnlByDay = useMemo(() => {
    const map: Record<string, { pnl: number; count: number }> = {}
    trades.forEach(t => {
      const key = t.exit_datetime.slice(0, 10)
      if (!map[key]) map[key] = { pnl: 0, count: 0 }
      map[key].pnl += t.pnl; map[key].count += 1
    })
    return map
  }, [trades])
  const goToToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
  const goPrev = () => setCursor(new Date(year, month - 1, 1))
  const goNext = () => setCursor(new Date(year, month + 1, 1))

  return (
    <div>
      <SectionHeader eyebrow="Calendar" title={`${MONTHS_ES[month]} ${year}`} subtitle={`${metrics.tradingDays} días activos · ${monthTrades.length} trades · Total ${fmt(metrics.netPnl)}`} />
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={goPrev} className="p-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"><ChevronLeft size={18} /></button>
        <button onClick={goToToday} className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Today</button>
        <button onClick={goNext} className="p-2 rounded-lg border border-black/10 dark:border-white/10 hover:bg-black/5 dark:hover:bg-white/5"><ChevronRight size={18} /></button>
      </div>
      <Card className="p-4 overflow-x-auto">
        <div className="min-w-[900px]">
          <div className="grid grid-cols-8 gap-2 mb-2">
            {DAYS_ES.map(d => <div key={d} className="text-center text-[11px] font-semibold uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 py-2">{d}</div>)}
            <div className="text-center text-[11px] font-semibold uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 py-2">SEM</div>
          </div>
          <div className="space-y-2">
            {weeks.map((week, wi) => {
              const weekNum = getISOWeek(week[0])
              let weekPnl = 0, weekCount = 0
              week.forEach(d => { const entry = pnlByDay[toISODate(d)]; if (entry) { weekPnl += entry.pnl; weekCount += entry.count } })
              return (
                <div key={wi} className="grid grid-cols-8 gap-2">
                  {week.map((d, di) => {
                    const inMonth = d.getMonth() === month
                    const entry = pnlByDay[toISODate(d)]
                    const isToday = isSameDay(d, today)
                    return (
                      <div key={di} className={`rounded-xl p-3 min-h-[80px] flex flex-col justify-between ${!inMonth ? 'bg-black/[0.02] dark:bg-white/[0.02] text-ink-900/20 dark:text-bone-100/20' : entry ? (entry.pnl >= 0 ? 'bg-profit/10' : 'bg-loss/10') : 'bg-black/[0.03] dark:bg-white/[0.03]'} ${isToday ? 'ring-2 ring-accent' : ''}`}>
                        <span className="text-xs font-medium">{d.getDate()}</span>
                        {entry && (<div><p className={`text-sm font-semibold ${entry.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(entry.pnl)}</p><p className="text-[10px] text-ink-900/40 dark:text-bone-100/40">{entry.count} trades</p></div>)}
                      </div>
                    )
                  })}
                  <div className="rounded-xl p-3 min-h-[80px] flex flex-col justify-center items-center bg-accent/5">
                    <p className="text-[10px] uppercase tracking-wide text-ink-900/40 dark:text-bone-100/40">Sem {weekNum}</p>
                    <p className={`text-sm font-semibold ${weekPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(weekPnl)}</p>
                    <p className="text-[10px] text-ink-900/40 dark:text-bone-100/40">{weekCount} trades</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>
    </div>
  )
}

/* ==================== TRADES PAGES ==================== */
const emptyForm = {
  symbol: '', instrument_type: 'Futuros' as InstrumentType, direction: 'long' as Direction,
  entry_price: '', exit_price: '', position_size: '', pnl: '', risk_amount: '', stop_loss: '', take_profit: '',
  entry_datetime: '', exit_datetime: '', strategy_id: '', custom_setup: '', checklist_id: '', rating: 0, notes: '',
}
function Block({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <Icon size={16} className="text-accent" />
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-900/50 dark:text-bone-100/50">{title}</h3>
      </div>
      {children}
    </div>
  )
}
function TradeForm({ onSaved }: { onSaved: () => void }) {
  const { strategies, addStrategy, checklists, addTrade } = useAppData()
  const [form, setForm] = useState(emptyForm)
  const [useFreeSetup, setUseFreeSetup] = useState(false)
  const [newStrategyName, setNewStrategyName] = useState('')
  const [showNewStrategy, setShowNewStrategy] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [dragOver, setDragOver] = useState(false)

  const set = (key: keyof typeof form) => (e: any) => {
    const value = e?.target ? e.target.value : e
    setForm(prev => ({ ...prev, [key]: value }))
  }
  const handleFiles = (fileList: FileList | null) => {
    if (!fileList) return
    const valid = Array.from(fileList).filter(f => f.size <= 5 * 1024 * 1024 && /image\/(png|jpe?g)/.test(f.type))
    setFiles(prev => [...prev, ...valid])
  }
  const clearForm = () => { setForm(emptyForm); setFiles([]); setUseFreeSetup(false) }
  const handleCreateStrategy = () => {
    if (!newStrategyName.trim()) return
    const s = { id: crypto.randomUUID(), name: newStrategyName.trim(), created_at: new Date().toISOString() }
    addStrategy(s); setForm(prev => ({ ...prev, strategy_id: s.id })); setNewStrategyName(''); setShowNewStrategy(false)
  }
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trade: Trade = {
      id: crypto.randomUUID(), symbol: form.symbol.toUpperCase(), instrument_type: form.instrument_type, direction: form.direction,
      entry_price: Number(form.entry_price) || 0, exit_price: Number(form.exit_price) || 0, position_size: Number(form.position_size) || 0,
      pnl: Number(form.pnl) || 0, risk_amount: Number(form.risk_amount) || undefined, stop_loss: Number(form.stop_loss) || undefined,
      take_profit: Number(form.take_profit) || undefined, entry_datetime: form.entry_datetime || new Date().toISOString(),
      exit_datetime: form.exit_datetime || new Date().toISOString(), strategy_id: useFreeSetup ? null : (form.strategy_id || null),
      custom_setup: useFreeSetup ? form.custom_setup : undefined, checklist_id: form.checklist_id || null, rating: form.rating,
      screenshots: files.map(f => URL.createObjectURL(f)), notes: form.notes, created_at: new Date().toISOString(),
    }
    addTrade(trade); clearForm(); onSaved()
  }

  return (
    <Card className="p-6 md:p-8">
      <div className="flex items-center gap-3 mb-1">
        <div className="w-9 h-9 rounded-lg bg-accent/10 text-accent flex items-center justify-center"><span className="text-lg font-bold">+</span></div>
        <h2 className="serif text-2xl font-semibold">Registrar Operación</h2>
      </div>
      <p className="text-sm text-ink-900/50 dark:text-bone-100/50 mb-8 ml-12">Añade los detalles de tu trade</p>

      <form onSubmit={handleSubmit} className="space-y-10">
        <Block icon={Boxes} title="Instrumento">
          <div className="grid md:grid-cols-3 gap-4">
            <Field label="Símbolo"><input value={form.symbol} onChange={set('symbol')} placeholder="NQ, MNQ, ES, EURUSD..." className={inputCls} /></Field>
            <Field label="Tipo"><select value={form.instrument_type} onChange={set('instrument_type')} className={inputCls}><option>Futuros</option><option>Opciones</option><option>Forex</option><option>Acciones</option></select></Field>
            <Field label="Dirección"><DirectionToggle value={form.direction} onChange={v => setForm(p => ({ ...p, direction: v }))} /></Field>
          </div>
        </Block>
        <Block icon={DollarSign} title="Precios y Resultado">
          <div className="grid md:grid-cols-4 gap-4">
            <Field label="Precio Entrada"><input type="number" step="0.01" value={form.entry_price} onChange={set('entry_price')} className={inputCls} /></Field>
            <Field label="Precio Salida"><input type="number" step="0.01" value={form.exit_price} onChange={set('exit_price')} className={inputCls} /></Field>
            <Field label="Tamaño Posición (contratos)"><input type="number" value={form.position_size} onChange={set('position_size')} className={inputCls} /></Field>
            <Field label="P&L $ (manual)"><input type="number" step="0.01" placeholder="+250 / -120" value={form.pnl} onChange={set('pnl')} className={inputCls} /></Field>
            <Field label="Riesgo $"><input type="number" step="0.01" value={form.risk_amount} onChange={set('risk_amount')} className={inputCls} /></Field>
            <Field label="Stop Loss"><input type="number" step="0.01" value={form.stop_loss} onChange={set('stop_loss')} className={inputCls} /></Field>
            <Field label="Take Profit"><input type="number" step="0.01" value={form.take_profit} onChange={set('take_profit')} className={inputCls} /></Field>
          </div>
        </Block>
        <Block icon={Clock} title="Tiempo">
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Fecha/Hora Entrada"><input type="datetime-local" value={form.entry_datetime} onChange={set('entry_datetime')} className={inputCls} /></Field>
            <Field label="Fecha/Hora Salida"><input type="datetime-local" value={form.exit_datetime} onChange={set('exit_datetime')} className={inputCls} /></Field>
          </div>
        </Block>
        <Block icon={BookOpen} title="Estrategia">
          <div className="flex items-center gap-2 mb-3">
            <button type="button" onClick={() => setUseFreeSetup(false)} className={`text-xs px-3 py-1 rounded-full ${!useFreeSetup ? 'bg-accent text-white' : 'bg-black/5 dark:bg-white/5'}`}>Playbook</button>
            <button type="button" onClick={() => setUseFreeSetup(true)} className={`text-xs px-3 py-1 rounded-full ${useFreeSetup ? 'bg-accent text-white' : 'bg-black/5 dark:bg-white/5'}`}>Setup libre</button>
          </div>
          {!useFreeSetup ? (
            strategies.length === 0 ? (
              !showNewStrategy ? (
                <button type="button" onClick={() => setShowNewStrategy(true)} className="text-sm text-accent font-medium hover:underline">No hay estrategias guardadas · Crear una</button>
              ) : (
                <div className="flex gap-2">
                  <input value={newStrategyName} onChange={e => setNewStrategyName(e.target.value)} placeholder="Nombre de la estrategia" className={inputCls} />
                  <button type="button" onClick={handleCreateStrategy} className="px-4 rounded-lg bg-accent text-white text-sm font-medium">Crear</button>
                </div>
              )
            ) : (
              <div className="flex gap-2 items-center">
                <select value={form.strategy_id} onChange={set('strategy_id')} className={inputCls}>
                  <option value="">Selecciona un setup del playbook</option>
                  {strategies.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" onClick={() => setShowNewStrategy(true)} className="text-xs text-accent whitespace-nowrap">+ Crear</button>
              </div>
            )
          ) : (
            <Field label="Setup del día (texto libre)"><input value={form.custom_setup} onChange={set('custom_setup')} placeholder="Ej: Ruptura de rango premarket" className={inputCls} /></Field>
          )}
        </Block>
        <Block icon={ListChecks} title="Confluencias y Rating">
          <div className="grid md:grid-cols-2 gap-4 items-end">
            <Field label="Checklist asociado">
              <select value={form.checklist_id} onChange={set('checklist_id')} className={inputCls}>
                <option value="">Sin checklist</option>
                {checklists.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Rating (1-10)">
              <div className="flex gap-1">
                {Array.from({ length: 10 }).map((_, i) => (
                  <button key={i} type="button" onClick={() => setForm(p => ({ ...p, rating: i + 1 }))}>
                    <Star size={20} className={i < form.rating ? 'fill-amber-400 text-amber-400' : 'text-black/15 dark:text-white/15'} />
                  </button>
                ))}
              </div>
            </Field>
          </div>
        </Block>
        <Block icon={Paperclip} title="Adjuntos y Notas">
          <div onDragOver={e => { e.preventDefault(); setDragOver(true) }} onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files) }}
            className={`border-2 border-dashed rounded-xl p-6 text-center mb-4 transition ${dragOver ? 'border-accent bg-accent/5' : 'border-black/10 dark:border-white/10'}`}>
            <UploadCloud className="mx-auto mb-2 text-ink-900/30 dark:text-bone-100/30" />
            <p className="text-sm text-ink-900/50 dark:text-bone-100/50">Arrastra tus screenshots aquí o</p>
            <label className="text-accent text-sm font-medium cursor-pointer hover:underline">
              selecciona archivos
              <input type="file" accept="image/png,image/jpeg" multiple hidden onChange={e => handleFiles(e.target.files)} />
            </label>
            <p className="text-[11px] text-ink-900/30 dark:text-bone-100/30 mt-1">PNG/JPG hasta 5MB</p>
            {files.length > 0 && <p className="text-xs mt-3 text-accent">{files.length} archivo(s) seleccionado(s)</p>}
          </div>
          <Field label="Notas"><textarea value={form.notes} onChange={set('notes')} rows={4} placeholder="¿Qué viste? ¿Cómo gestionaste la operación?" className={inputCls} /></Field>
        </Block>
        <div className="flex justify-end gap-3 pt-2">
          <button type="button" onClick={clearForm} className="px-5 py-2.5 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5">Limpiar</button>
          <button type="submit" className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft hover:bg-accent-light">+ Registrar Trade</button>
        </div>
      </form>
    </Card>
  )
}
function TradeHistory() {
  const { trades, strategies, settings } = useAppData()
  const [search, setSearch] = useState('')
  const [sortKey, setSortKey] = useState<'exit_datetime' | 'symbol' | 'pnl'>('exit_datetime')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const filtered = useMemo(() => {
    let list = trades.filter(t => t.symbol.toLowerCase().includes(search.toLowerCase()))
    list = list.sort((a, b) => {
      let cmp = 0
      if (sortKey === 'symbol') cmp = a.symbol.localeCompare(b.symbol)
      if (sortKey === 'pnl') cmp = a.pnl - b.pnl
      if (sortKey === 'exit_datetime') cmp = new Date(a.exit_datetime).getTime() - new Date(b.exit_datetime).getTime()
      return sortDir === 'asc' ? cmp : -cmp
    })
    return list
  }, [trades, search, sortKey, sortDir])
  const toggleSort = (key: typeof sortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc')); else { setSortKey(key); setSortDir('desc') }
  }
  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="serif text-xl font-semibold">Historial de Operaciones</h3>
        <input placeholder="Buscar símbolo..." value={search} onChange={e => setSearch(e.target.value)} className="bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm w-56" />
      </div>
      {trades.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40 py-10 text-center">Aún no has registrado ninguna operación.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-900/40 dark:text-bone-100/40 border-b border-black/5 dark:border-white/5">
                <th className="py-3 cursor-pointer" onClick={() => toggleSort('exit_datetime')}><span className="flex items-center gap-1">Fecha <ArrowUpDown size={12} /></span></th>
                <th className="py-3 cursor-pointer" onClick={() => toggleSort('symbol')}><span className="flex items-center gap-1">Símbolo <ArrowUpDown size={12} /></span></th>
                <th className="py-3">Dirección</th><th className="py-3">Estrategia</th><th className="py-3">Rating</th>
                <th className="py-3 cursor-pointer" onClick={() => toggleSort('pnl')}><span className="flex items-center gap-1">P&L Bruto <ArrowUpDown size={12} /></span></th>
                <th className="py-3">P&L Neto</th><th className="py-3">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const strat = strategies.find(s => s.id === t.strategy_id)
                const net = getNetPnl(t, settings)
                const cls = classifyTrade(t, settings)
                return (
                  <tr key={t.id} className="border-b border-black/5 dark:border-white/5 last:border-0">
                    <td className="py-3">{new Date(t.exit_datetime).toLocaleString()}</td>
                    <td className="py-3 font-medium">{t.symbol}</td>
                    <td className="py-3"><span className={`text-[10px] font-bold px-2 py-1 rounded ${t.direction === 'long' ? 'bg-profit/10 text-profit' : 'bg-loss/10 text-loss'}`}>{t.direction.toUpperCase()}</span></td>
                    <td className="py-3">{strat?.name || t.custom_setup || '—'}</td>
                    <td className="py-3">{t.rating ? `${t.rating}/10` : '—'}</td>
                    <td className={`py-3 font-medium ${t.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(t.pnl)}</td>
                    <td className={`py-3 font-medium ${net >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(net)}</td>
                    <td className="py-3"><span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${cls === 'win' ? 'bg-profit/10 text-profit' : cls === 'loss' ? 'bg-loss/10 text-loss' : 'bg-amber-400/10 text-amber-500'}`}>{cls === 'be' ? 'breakeven' : cls}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
function TradesPage() {
  const [tab, setTab] = useState('new')
  return (
    <div>
      <SectionHeader eyebrow="Trades" title="Operaciones" subtitle="Registra y revisa cada una de tus operaciones." />
      <div className="mb-6"><PillTabs tabs={[{ id: 'new', label: 'Nuevo Trade' }, { id: 'history', label: 'Historial' }]} active={tab} onChange={setTab} /></div>
      {tab === 'new' ? <TradeForm onSaved={() => setTab('history')} /> : <TradeHistory />}
    </div>
  )
}

/* ==================== ANALYTICS PAGE ==================== */
function AnalyticsPage() {
  const [tab, setTab] = useState('overview')
  const { trades, settings } = useAppData()
  const metrics = computeMetrics(trades, settings)
  const expectancy = computeExpectancy(trades, settings)
  const { avgWin, avgLoss } = computeAvgWinLoss(trades, settings)
  const maxDD = computeMaxDrawdown(metrics.equityCurve)
  const bySymbol = trades.reduce((acc: Record<string, { pnl: number; count: number }>, t) => {
    if (!acc[t.symbol]) acc[t.symbol] = { pnl: 0, count: 0 }
    acc[t.symbol].pnl += t.pnl; acc[t.symbol].count += 1
    return acc
  }, {})
  return (
    <div>
      <SectionHeader eyebrow="Analytics" title="Performance Analytics" subtitle="Métricas profundas sobre tu trading." />
      <div className="mb-6"><PillTabs tabs={[{ id: 'overview', label: 'Overview' }, { id: 'risk', label: 'Risk' }, { id: 'instrument', label: 'Instrument' }, { id: 'session', label: 'Session' }, { id: 'distribution', label: 'Distribution' }]} active={tab} onChange={setTab} /></div>
      {tab === 'overview' && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Net P&L" value={fmt(metrics.netPnl)} positive={metrics.netPnl >= 0} />
          <StatCard label="Profit Factor" value={metrics.profitFactor === Infinity ? '∞' : metrics.profitFactor.toFixed(2)} positive={metrics.profitFactor >= 1} />
          <StatCard label="Expectancy" value={fmt(expectancy)} positive={expectancy >= 0} />
          <StatCard label="Recovery Factor" value={maxDD !== 0 ? (metrics.netPnl / Math.abs(maxDD)).toFixed(2) : '—'} />
          <StatCard label="Avg Win" value={fmt(avgWin)} positive />
          <StatCard label="Avg Loss" value={fmt(avgLoss)} positive={false} />
          <StatCard label="Sharpe" value="—" />
          <StatCard label="Sortino" value="—" />
        </div>
      )}
      {tab === 'risk' && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard label="Max Drawdown" value={fmt(maxDD)} positive={false} />
          <StatCard label="Tamaño posición medio" value={trades.length ? (trades.reduce((a, t) => a + t.position_size, 0) / trades.length).toFixed(1) : '—'} />
          <StatCard label="Ratio Riesgo/Beneficio" value="—" />
        </div>
      )}
      {tab === 'instrument' && (
        <Card className="p-6">
          {Object.keys(bySymbol).length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Aún no hay datos por instrumento.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-ink-900/40 dark:text-bone-100/40 border-b border-black/5 dark:border-white/5"><th className="py-2">Símbolo</th><th className="py-2">Trades</th><th className="py-2">P&L</th></tr></thead>
              <tbody>{Object.entries(bySymbol).map(([sym, d]) => (
                <tr key={sym} className="border-b border-black/5 dark:border-white/5 last:border-0"><td className="py-2 font-medium">{sym}</td><td className="py-2">{d.count}</td><td className={`py-2 font-semibold ${d.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{fmt(d.pnl)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      )}
      {tab === 'session' && <Card className="p-6"><p className="text-sm text-ink-900/40 dark:text-bone-100/40">Rendimiento por sesión de mercado — próximamente.</p></Card>}
      {tab === 'distribution' && <Card className="p-6"><p className="text-sm text-ink-900/40 dark:text-bone-100/40">Histograma de distribución de P&L — próximamente.</p></Card>}
    </div>
  )
}

/* ==================== STRATEGIES PAGE ==================== */
function StrategiesPage() {
  const { strategies, addStrategy, trades } = useAppData()
  const [name, setName] = useState('')
  const create = () => { if (!name.trim()) return; addStrategy({ id: crypto.randomUUID(), name: name.trim(), created_at: new Date().toISOString() }); setName('') }
  const perf = strategies.map(s => {
    const st = trades.filter(t => t.strategy_id === s.id)
    const wins = st.filter(t => t.pnl > 0).length
    return { ...s, count: st.length, wins, pnl: st.reduce((a, t) => a + t.pnl, 0) }
  })
  return (
    <div>
      <SectionHeader eyebrow="Playbook" title="Estrategias" subtitle="Tu librería de setups y su rendimiento real."
        right={<div className="flex gap-2">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de la estrategia" className="bg-white dark:bg-ink-800 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm" />
          <button onClick={create} className="px-4 py-2 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft">+ Nueva estrategia</button>
        </div>} />
      <div className="mb-8">
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 mb-3">Mis estrategias</h3>
        {strategies.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Aún no has creado ninguna estrategia...</p> : (
          <div className="grid md:grid-cols-3 gap-4">
            {strategies.map(s => (<Card key={s.id} className="p-5"><h4 className="font-semibold mb-1">{s.name}</h4><p className="text-xs text-ink-900/40 dark:text-bone-100/40">{s.description || 'Sin descripción todavía.'}</p></Card>))}
          </div>
        )}
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-widest text-ink-900/40 dark:text-bone-100/40 mb-3">Rendimiento por setup</h3>
        <Card className="p-6">
          {perf.every(p => p.count === 0) ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Aún no has etiquetado ninguna estrategia en tus trades.</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs uppercase text-ink-900/40 dark:text-bone-100/40 border-b border-black/5 dark:border-white/5"><th className="py-2">Setup</th><th className="py-2">Trades</th><th className="py-2">Win Rate</th><th className="py-2">P&L</th></tr></thead>
              <tbody>{perf.map(p => (<tr key={p.id} className="border-b border-black/5 dark:border-white/5 last:border-0"><td className="py-2 font-medium">{p.name}</td><td className="py-2">{p.count}</td><td className="py-2">{p.count ? Math.round((p.wins / p.count) * 100) : 0}%</td><td className={`py-2 font-semibold ${p.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>${p.pnl.toFixed(2)}</td></tr>))}</tbody>
            </table>
          )}
        </Card>
      </div>
    </div>
  )
}

/* ==================== WEEKLY REVIEW PAGE ==================== */
function startOfWeek(d: Date) { const day = (d.getDay() + 6) % 7; const res = new Date(d); res.setDate(d.getDate() - day); return res }
function WeeklyReviewPage() {
  const { trades, settings } = useAppData()
  const [cursor, setCursor] = useState(startOfWeek(new Date()))
  const weekEnd = new Date(cursor); weekEnd.setDate(cursor.getDate() + 6)
  const weekTrades = useMemo(() => trades.filter(t => { const d = new Date(t.exit_datetime); return d >= cursor && d <= weekEnd }), [trades, cursor])
  const metrics = computeMetrics(weekTrades, settings)
  return (
    <div>
      <SectionHeader eyebrow="Weekly Review" title="Revisión semanal" subtitle={`${cursor.toLocaleDateString()} — ${weekEnd.toLocaleDateString()}`} />
      <div className="flex items-center justify-center gap-4 mb-6">
        <button onClick={() => setCursor(new Date(cursor.getTime() - 7 * 86400000))} className="p-2 rounded-lg border border-black/10 dark:border-white/10"><ChevronLeft size={18} /></button>
        <button onClick={() => setCursor(startOfWeek(new Date()))} className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium">Esta semana</button>
        <button onClick={() => setCursor(new Date(cursor.getTime() + 7 * 86400000))} className="p-2 rounded-lg border border-black/10 dark:border-white/10"><ChevronRight size={18} /></button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard label="P&L Semana" value={`$${metrics.netPnl.toFixed(2)}`} positive={metrics.netPnl >= 0} />
        <StatCard label="Trades" value={`${weekTrades.length}`} sub={`${metrics.wins}W / ${metrics.losses}L`} />
        <StatCard label="Win Rate" value={`${metrics.winRate}%`} />
        <StatCard label="Días Activos" value={`${metrics.tradingDays}`} />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <Card className="p-5"><p className="text-xs uppercase text-ink-900/40 dark:text-bone-100/40 mb-1">Mejor día</p><p className="text-xl font-semibold text-profit">{metrics.bestDay ? `$${metrics.bestDay.pnl.toFixed(2)}` : '—'}</p></Card>
        <Card className="p-5"><p className="text-xs uppercase text-ink-900/40 dark:text-bone-100/40 mb-1">Peor día</p><p className="text-xl font-semibold text-loss">{metrics.worstDay ? `$${metrics.worstDay.pnl.toFixed(2)}` : '—'}</p></Card>
      </div>
      <Card className="p-6">
        <h3 className="serif text-xl font-semibold mb-3">Diario de la semana</h3>
        {weekTrades.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Esta semana no tienes trades cerrados.</p> : <textarea rows={6} placeholder="¿Qué aprendiste esta semana?" className={inputCls} />}
      </Card>
    </div>
  )
}

/* ==================== MINDSET PAGE ==================== */
function MindsetPage() {
  const [tab, setTab] = useState('pre')
  const [emotion, setEmotion] = useState(7)
  return (
    <div>
      <SectionHeader eyebrow="Mindset" title="Mindset" subtitle="Disciplina mental: ritual premarket y revisión post-sesión."
        right={<button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium"><Download size={16} /> Exportar histórico</button>} />
      <div className="mb-6"><PillTabs tabs={[{ id: 'pre', label: 'Premarket' }, { id: 'post', label: 'Post-sesión' }]} active={tab} onChange={setTab} /></div>
      {tab === 'pre' ? (
        <Card className="p-6 space-y-6">
          <h3 className="serif text-xl font-semibold flex items-center gap-2"><Brain size={18} className="text-accent" /> Ritual Premarket</h3>
          <p className="text-xs text-ink-900/40 dark:text-bone-100/40 -mt-4">Antes de abrir la plataforma. Responde con honestidad.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Fecha"><input type="date" className={inputCls} /></Field>
            <Field label="Día del reto (1-30)"><input type="number" min={1} max={30} className={inputCls} /></Field>
          </div>
          <Field label={`Estado emocional (${emotion}/10)`}>
            <input type="range" min={1} max={10} value={emotion} onChange={e => setEmotion(Number(e.target.value))} className="w-full" />
            <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mt-1">{emotion <= 4 ? 'Alto riesgo' : emotion <= 6 ? 'Precaución' : 'Óptimo'}</p>
          </Field>
          <div className="grid md:grid-cols-3 gap-4">
            <Toggle checked={false} onChange={() => {}} label="¿Más de 7h de sueño?" />
            <Toggle checked={false} onChange={() => {}} label="¿Arrastras carga emocional?" />
            <Toggle checked={false} onChange={() => {}} label="¿Noticias de alto impacto hoy?" />
          </div>
          <Field label="Bias del día"><div className="flex gap-2">{['Alcista', 'Bajista', 'Sin sesgo'].map(b => (<button type="button" key={b} className="px-4 py-1.5 rounded-full border border-black/10 dark:border-white/10 text-sm">{b}</button>))}</div></Field>
          <Card className="p-4 bg-accent/5 border-accent/20">
            <p className="text-sm font-medium mb-2">¿Puedes afirmar con convicción que estás dispuesto a perder el máximo diario en el primer trade, sin que eso cambie tu comportamiento el resto del día?</p>
            <Toggle checked={false} onChange={() => {}} label="Sí / No" />
          </Card>
          <Field label="¿Qué quiero demostrarme hoy con mi forma de operar?"><textarea rows={2} className={inputCls} /></Field>
          <Field label="¿Cuál es mi plan si voy rojo desde el primer trade?"><textarea rows={2} className={inputCls} /></Field>
          <button className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft">Calcular señal y guardar</button>
        </Card>
      ) : (
        <Card className="p-6 space-y-6">
          <h3 className="serif text-xl font-semibold">Post-sesión psicológica</h3>
          <p className="text-xs text-ink-900/40 dark:text-bone-100/40 -mt-4">Al cerrar la plataforma. Sé brutalmente honesto.</p>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Fecha"><input type="date" className={inputCls} /></Field>
            <Field label="Día del reto"><input type="number" className={inputCls} /></Field>
          </div>
          <Field label="Estado emocional al cierre"><input type="range" min={1} max={10} className="w-full" /></Field>
          <Field label="Emoción dominante"><div className="grid grid-cols-4 gap-2">{['Frustración', 'Miedo a perder', 'Codicia', 'Aburrimiento', 'Impaciencia', 'Calma', 'Otra'].map(e => (<button type="button" key={e} className="px-3 py-2 rounded-lg border border-black/10 dark:border-white/10 text-xs">{e}</button>))}</div></Field>
          <Field label="Aprendizaje emocional del día (una frase)"><input className={inputCls} /></Field>
          <Field label="Una cosa concreta que haré diferente mañana"><input className={inputCls} /></Field>
          <button className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft">Guardar post-sesión</button>
        </Card>
      )}
    </div>
  )
}

/* ==================== ZEN PAGE ==================== */
function ZenPage() {
  const step = 0, total = 12
  const pct = Math.round((step / total) * 100)
  return (
    <div className="fixed inset-0 lg:relative lg:inset-auto bg-ink-900 text-bone-100 -m-6 md:-m-8 min-h-screen flex flex-col items-center justify-center p-8">
      <span className="text-[11px] font-semibold tracking-widest uppercase bg-white/10 px-3 py-1 rounded-full mb-6">Ritual Pre-sesión</span>
      <h1 className="serif text-5xl font-semibold mb-3">ZEN</h1>
      <p className="text-sm text-bone-100/50 max-w-md text-center mb-12">Respiración guiada con música ambiental, seguida de 5 minutos de meditación silenciosa.</p>
      <div className="relative w-56 h-56 flex items-center justify-center mb-10">
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent/40 to-purple-600/30 blur-2xl" />
        <div className="relative w-40 h-40 rounded-full border border-white/10 flex items-center justify-center"><span className="text-sm tracking-widest font-medium">LISTO</span></div>
      </div>
      <p className="text-sm text-bone-100/50 mb-6">Pulsa Comenzar ZEN y deja que tu respiración te guíe.</p>
      <div className="w-full max-w-xs mb-8">
        <div className="flex justify-between text-xs text-bone-100/40 mb-2"><span>PASO {step}/{total}</span><span>{pct}%</span></div>
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full" style={{ width: `${pct}%` }} /></div>
      </div>
      <button className="flex items-center gap-2 px-8 py-3 rounded-full bg-accent text-white font-semibold shadow-glow"><Play size={16} /> Comenzar ZEN</button>
    </div>
  )
}

/* ==================== HABITS PAGE ==================== */
function HabitsPage() {
  const { habitRules, addHabitRule, habitLogs, toggleHabitLog } = useAppData()
  const [text, setText] = useState('')
  const today = toISODate(new Date())
  const checkedCount = habitRules.filter(r => habitLogs.find(l => l.rule_id === r.id && l.date === today)?.checked).length
  const pct = habitRules.length ? Math.round((checkedCount / habitRules.length) * 100) : 0
  const add = () => { if (!text.trim()) return; addHabitRule({ id: crypto.randomUUID(), text: text.trim(), created_at: new Date().toISOString() }); setText('') }
  return (
    <div>
      <SectionHeader eyebrow="Herramientas" title="Hábitos" subtitle={new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} />
      <Card className="p-6 mb-6">
        <div className="flex items-center justify-between mb-2"><p className="text-sm font-medium">Progreso de hoy</p><p className="text-sm font-semibold">{checkedCount}/{habitRules.length}</p></div>
        <div className="h-2 bg-black/5 dark:bg-white/5 rounded-full overflow-hidden"><div className="h-full bg-accent rounded-full transition-all" style={{ width: `${pct}%` }} /></div>
      </Card>
      <Card className="p-6">
        <h3 className="serif text-xl font-semibold mb-1">Mis Reglas de Trading</h3>
        <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mb-4">Marca las reglas que seguiste hoy</p>
        {habitRules.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40 mb-4">No tienes reglas configuradas.</p> : (
          <div className="space-y-2 mb-4">
            {habitRules.map(r => {
              const checked = habitLogs.find(l => l.rule_id === r.id && l.date === today)?.checked || false
              return (<label key={r.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 cursor-pointer">
                <input type="checkbox" checked={checked} onChange={() => toggleHabitLog(r.id, today)} className="w-4 h-4 accent-accent" />
                <span className={`text-sm ${checked ? 'line-through text-ink-900/40 dark:text-bone-100/40' : ''}`}>{r.text}</span>
              </label>)
            })}
          </div>
        )}
        <div className="flex gap-2">
          <input value={text} onChange={e => setText(e.target.value)} placeholder="Nueva regla de trading..." className="flex-1 bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm" />
          <button onClick={add} className="px-4 rounded-lg bg-accent text-white text-sm font-semibold">+</button>
        </div>
      </Card>
    </div>
  )
}

/* ==================== CHECKLISTS PAGE ==================== */
function ChecklistsPage() {
  const { checklists, addChecklist, updateChecklist, deleteChecklist } = useAppData()
  const [name, setName] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [itemDraft, setItemDraft] = useState<Record<string, string>>({})
  const create = () => { if (!name.trim()) return; addChecklist({ id: crypto.randomUUID(), name: name.trim(), items: [], created_at: new Date().toISOString() }); setName('') }
  const addItem = (checklistId: string) => {
    const text = itemDraft[checklistId]?.trim()
    if (!text) return
    const cl = checklists.find(c => c.id === checklistId)
    if (!cl) return
    updateChecklist(checklistId, { items: [...cl.items, { id: crypto.randomUUID(), text }] })
    setItemDraft(prev => ({ ...prev, [checklistId]: '' }))
  }
  return (
    <div>
      <SectionHeader eyebrow="Herramientas" title="Checklists" subtitle="Crea checklists para evaluar tus trades según las confluencias que tengan." />
      <Card className="p-6 mb-6">
        <h3 className="serif text-xl font-semibold mb-4">Mis Checklists de Confluencias</h3>
        <div className="flex gap-2 mb-6">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Nombre de nueva checklist..." className="flex-1 bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm" />
          <button onClick={create} className="px-4 rounded-lg bg-accent text-white text-sm font-semibold">+ Crear</button>
        </div>
        {checklists.length === 0 ? <p className="text-sm text-ink-900/40 dark:text-bone-100/40">Aún no tienes checklists creadas.</p> : (
          <div className="space-y-3">
            {checklists.map(cl => (
              <div key={cl.id} className="border border-black/10 dark:border-white/10 rounded-xl">
                <div className="flex items-center justify-between p-4 cursor-pointer" onClick={() => setOpenId(openId === cl.id ? null : cl.id)}>
                  <p className="font-medium">{cl.name} <span className="text-xs text-ink-900/40 dark:text-bone-100/40">({cl.items.length})</span></p>
                  <div className="flex gap-3 text-xs" onClick={e => e.stopPropagation()}>
                    <button className="flex items-center gap-1 text-ink-900/50 dark:text-bone-100/50 hover:text-accent"><Pencil size={12} /> Renombrar</button>
                    <button onClick={() => deleteChecklist(cl.id)} className="flex items-center gap-1 text-loss hover:opacity-80"><Trash2 size={12} /> Eliminar</button>
                  </div>
                </div>
                {openId === cl.id && (
                  <div className="p-4 pt-0 space-y-2">
                    {cl.items.map(it => <p key={it.id} className="text-sm text-ink-900/70 dark:text-bone-100/70 pl-2 border-l-2 border-accent/30">{it.text}</p>)}
                    <div className="flex gap-2 pt-2">
                      <input value={itemDraft[cl.id] || ''} onChange={e => setItemDraft(prev => ({ ...prev, [cl.id]: e.target.value }))} placeholder="Nueva confluencia..." className="flex-1 bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-3 py-2 text-sm" />
                      <button onClick={() => addItem(cl.id)} className="px-4 rounded-lg bg-accent text-white text-sm font-semibold">+</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}

/* ==================== IMPORT/EXPORT PAGE ==================== */
function ImportExportPage() {
  const [tab, setTab] = useState('import')
  return (
    <div>
      <SectionHeader eyebrow="Datos" title="Importar / Exportar" />
      <div className="mb-6"><PillTabs tabs={[{ id: 'import', label: 'Importar' }, { id: 'export', label: 'Exportar' }]} active={tab} onChange={setTab} /></div>
      {tab === 'import' ? (
        <Card className="p-6">
          <h3 className="serif text-xl font-semibold mb-1">Sube tus operaciones</h3>
          <p className="text-sm text-ink-900/50 dark:text-bone-100/50 mb-6">Arrastra un CSV o Excel. Detectamos duplicados automáticamente y solo añadimos lo nuevo.</p>
          <div className="border-2 border-dashed border-black/10 dark:border-white/10 rounded-xl p-10 text-center mb-4">
            <UploadCloud className="mx-auto mb-3 text-ink-900/30 dark:text-bone-100/30" size={32} />
            <p className="text-sm text-ink-900/50 dark:text-bone-100/50">CSV · XLSX · PDF, máx 5MB</p>
          </div>
          <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mb-4">Duplicados detectados por Símbolo + Fecha de entrada + Precio de entrada.</p>
          <button className="px-4 py-2 rounded-lg border border-black/10 dark:border-white/10 text-sm font-medium">CSV ejemplo</button>
        </Card>
      ) : (
        <Card className="p-6">
          <h3 className="serif text-xl font-semibold mb-1">Exporta tus operaciones</h3>
          <p className="text-sm text-ink-900/50 dark:text-bone-100/50 mb-6">Descarga una copia de seguridad con todas tus operaciones.</p>
          <div className="grid md:grid-cols-2 gap-4">
            {['CSV (.csv)', 'Excel (.xlsx)'].map(t => (<div key={t} className="border border-black/10 dark:border-white/10 rounded-xl p-6 flex flex-col items-center gap-3"><FileDown className="text-accent" /><p className="font-medium text-sm">{t}</p><button className="px-4 py-1.5 rounded-lg bg-accent text-white text-xs font-semibold">Descargar</button></div>))}
          </div>
        </Card>
      )}
    </div>
  )
}

/* ==================== AI CHAT PAGE ==================== */
function AIChatPage() {
  const { trades } = useAppData()
  const [messages, setMessages] = useState([{ role: 'assistant', content: '¡Hola! Soy tu mentor de trading. Puedo analizar tus operaciones, identificar patrones en tu comportamiento y darte consejos personalizados basados en tus datos reales. ¿Qué quieres revisar hoy?' }])
  const [input, setInput] = useState('')
  const send = () => {
    if (!input.trim()) return
    setMessages(prev => [...prev, { role: 'user', content: input }, { role: 'assistant', content: `Tienes ${trades.length} operaciones registradas. (Respuesta de ejemplo — conecta la función de IA con contexto real para análisis profundo).` }])
    setInput('')
  }
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <SectionHeader eyebrow="Herramientas" title="Nova IA" subtitle="Tu mentor de trading personal impulsado por IA." right={<Bot className="text-accent" size={28} />} />
      <Card className="flex-1 p-6 flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto space-y-4 mb-4">
          {messages.map((m, i) => (<div key={i} className={`max-w-lg p-3 rounded-xl text-sm ${m.role === 'assistant' ? 'bg-accent/10' : 'bg-black/5 dark:bg-white/5 ml-auto'}`}>{m.content}</div>))}
        </div>
        <div className="flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} placeholder="Pregúntame sobre tu trading..." className="flex-1 bg-bone-50 dark:bg-ink-700 border border-black/10 dark:border-white/10 rounded-lg px-4 py-2.5 text-sm" />
          <button onClick={send} className="px-4 rounded-lg bg-accent text-white"><Send size={16} /></button>
        </div>
      </Card>
    </div>
  )
}

/* ==================== SETTINGS PAGE ==================== */
function SettingsPage() {
  const { settings, updateSettings } = useAppData()
  const { theme, toggleTheme } = useTheme()
  const [form, setForm] = useState(settings)
  const save = () => { updateSettings(form); if (form.theme !== theme) toggleTheme() }
  return (
    <div>
      <SectionHeader eyebrow="Ajustes" title="Ajustes" />
      <Card className="p-6 mb-6">
        <h3 className="serif text-xl font-semibold mb-1">Apariencia</h3>
        <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mb-4">Personaliza cómo se ve tujournal en tu dispositivo.</p>
        <div className="grid md:grid-cols-2 gap-4">
          <Field label="Tema"><select value={form.theme} onChange={e => setForm(p => ({ ...p, theme: e.target.value as any }))} className={inputCls}><option value="light">Claro</option><option value="dark">Oscuro</option></select></Field>
          <Field label="Idioma"><select value={form.language} className={inputCls} disabled><option>🇪🇸 Español</option></select><p className="text-[11px] text-ink-900/40 dark:text-bone-100/40 mt-1">Elige tu idioma preferido para la interfaz.</p></Field>
        </div>
      </Card>
      <Card className="p-6 mb-6">
        <h3 className="serif text-xl font-semibold mb-1">Trading & comisiones</h3>
        <p className="text-xs text-ink-900/40 dark:text-bone-100/40 mb-4">Define qué se considera breakeven y las comisiones por contrato (round-turn) que se restarán automáticamente del P&L de NQ y MNQ.</p>
        <div className="grid md:grid-cols-3 gap-4">
          <Field label="Umbral de breakeven (USD)"><input type="number" value={form.breakeven_threshold} onChange={e => setForm(p => ({ ...p, breakeven_threshold: Number(e.target.value) }))} className={inputCls} /><p className="text-[11px] text-ink-900/40 dark:text-bone-100/40 mt-1">Ej. 10 → trades entre -10$ y +10$ cuentan como breakeven.</p></Field>
          <Field label="Comisión NQ (USD/contrato)"><input type="number" step="0.01" value={form.commission_nq} onChange={e => setForm(p => ({ ...p, commission_nq: Number(e.target.value) }))} className={inputCls} /><p className="text-[11px] text-ink-900/40 dark:text-bone-100/40 mt-1">Típico prop firm: ~$4.00 (Apex), ~$2.80 (Topstep).</p></Field>
          <Field label="Comisión MNQ (USD/contrato)"><input type="number" step="0.01" value={form.commission_mnq} onChange={e => setForm(p => ({ ...p, commission_mnq: Number(e.target.value) }))} className={inputCls} /><p className="text-[11px] text-ink-900/40 dark:text-bone-100/40 mt-1">Típico prop firm: ~$1.04 (Apex), ~$0.74 (Topstep).</p></Field>
        </div>
      </Card>
      <button onClick={save} className="px-6 py-2.5 rounded-lg bg-accent text-white text-sm font-semibold shadow-soft mb-6">💾 Guardar preferencias</button>
      <Card className="p-6">
        <h3 className="serif text-xl font-semibold mb-4">Cuenta</h3>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div><p className="text-ink-900/40 dark:text-bone-100/40 text-xs">Email</p><p>trader@tujournal.app</p></div>
          <div><p className="text-ink-900/40 dark:text-bone-100/40 text-xs">Tipo de cuenta</p><p>Fondeada</p></div>
        </div>
      </Card>
    </div>
  )
}

/* ==================== APP ROOT ==================== */
export default function App() {
  return (
    <ThemeProvider>
      <AppDataProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route index element={<OverviewPage />} />
              <Route path="calendar" element={<CalendarPage />} />
              <Route path="analytics" element={<AnalyticsPage />} />
              <Route path="trades" element={<TradesPage />} />
              <Route path="strategies" element={<StrategiesPage />} />
              <Route path="weekly-review" element={<WeeklyReviewPage />} />
              <Route path="mindset" element={<MindsetPage />} />
              <Route path="zen" element={<ZenPage />} />
              <Route path="habits" element={<HabitsPage />} />
              <Route path="checklists" element={<ChecklistsPage />} />
              <Route path="import-export" element={<ImportExportPage />} />
              <Route path="ai" element={<AIChatPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AppDataProvider>
    </ThemeProvider>
  )
}

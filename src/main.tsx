import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/latin-500-italic.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import { Elm } from './Main.elm'
import { HedwigBridge } from './bridge.ts'
import { timezoneFlags } from './localTime.ts'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

const savedTheme = localStorage.getItem('hedwig-theme')
const theme = savedTheme === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme

const themeColor = theme === 'dark' ? '#141c18' : '#f6f1e6'
document.querySelector('meta[name="theme-color"]')?.setAttribute('content', themeColor)

const app = Elm.Main.init({
  node: root,
  flags: {
    location: window.location.href,
    theme,
    now: Date.now(),
    ...timezoneFlags(Date.now()),
  },
})

app.ports.themeChanged.subscribe((nextTheme: string) => {
  document.documentElement.dataset.theme = nextTheme
  localStorage.setItem('hedwig-theme', nextTheme)
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  themeMeta?.setAttribute('content', nextTheme === 'dark' ? '#141c18' : '#f6f1e6')
})

app.ports.navigateHash.subscribe((hash: string) => {
  const next = hash.startsWith('#') ? hash : `#${hash}`
  if (window.location.hash === next) return
  const url = `${window.location.pathname}${window.location.search}${next}`
  history.pushState(null, '', url)
})

window.addEventListener('popstate', () => {
  app.ports.hashChanged.send(window.location.hash)
})

app.ports.copyText.subscribe((text: string) => {
  void navigator.clipboard.writeText(text).catch(() => undefined)
})

app.ports.downloadIdentity.subscribe((backup: string) => {
  if (!backup) return
  const blob = new Blob([backup], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'hedwig-identity.json'
  link.click()
  URL.revokeObjectURL(url)
})

new HedwigBridge(app)

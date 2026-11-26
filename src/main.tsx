import '@fontsource/fraunces/500.css'
import '@fontsource/fraunces/600.css'
import '@fontsource/outfit/400.css'
import '@fontsource/outfit/500.css'
import '@fontsource/outfit/600.css'
import { Elm } from './Main.elm'
import { HedwigBridge } from './bridge.ts'
import './index.css'

const root = document.getElementById('root')
if (!root) throw new Error('Root element missing')

const savedTheme = localStorage.getItem('hedwig-theme')
const theme = savedTheme === 'light' ? 'light' : 'dark'
document.documentElement.dataset.theme = theme

const app = Elm.Main.init({
  node: root,
  flags: {
    location: window.location.href,
    theme,
  },
})

app.ports.themeChanged.subscribe((nextTheme: string) => {
  document.documentElement.dataset.theme = nextTheme
  localStorage.setItem('hedwig-theme', nextTheme)
  const themeMeta = document.querySelector('meta[name="theme-color"]')
  themeMeta?.setAttribute('content', nextTheme === 'dark' ? '#171713' : '#f3eee4')
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

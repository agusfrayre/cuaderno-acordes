import { useEffect, useState } from 'react'
import Library from './pages/Library'
import SongView from './pages/SongView'
import { requestPersist } from './store/db'

function useHash() {
  const [hash, setHash] = useState(location.hash)
  useEffect(() => {
    const f = () => setHash(location.hash)
    window.addEventListener('hashchange', f)
    return () => window.removeEventListener('hashchange', f)
  }, [])
  return hash
}

export default function App() {
  const hash = useHash()
  useEffect(() => {
    requestPersist()
  }, [])
  const m = hash.match(/^#\/c\/(.+)$/)
  if (m) return <SongView key={m[1]} id={decodeURIComponent(m[1])} onBack={() => (location.hash = '')} />
  return <Library onOpen={(id) => (location.hash = '#/c/' + encodeURIComponent(id))} />
}

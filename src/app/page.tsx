export default function HomePage() {
  return (
    <div style={{ padding: 40, fontFamily: 'Arial, sans-serif' }}>
      <h1>🎯 DPaC Widgets</h1>
      <p>Widget system standalone pour l'intégration sur sites externes.</p>
      
      <h2>📋 Pages disponibles :</h2>
      <ul>
        <li><a href="/dpac/host-test">Test complet (host-test)</a></li>
        <li><a href="/dpac/launcher">Launcher seul</a></li>
        <li><a href="/dpac/modal">Chat modal seul</a></li>
        <li><a href="/dpac/source-picker">Source picker seul</a></li>
        <li><a href="/dpac/file-select">File select seul</a></li>
      </ul>

      <h2>🚀 Démarrage rapide :</h2>
      <pre style={{ background: '#f5f5f5', padding: 15, borderRadius: 5 }}>
{`npm install
npm run dev

# Ouvrir: http://localhost:3001/dpac/host-test`}
      </pre>
    </div>
  )
}


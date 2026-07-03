import Pacer from './components/Pacer'

function App() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div style={{ width: '100%', maxWidth: 420 }}>
        <Pacer />
      </div>
    </main>
  )
}

export default App

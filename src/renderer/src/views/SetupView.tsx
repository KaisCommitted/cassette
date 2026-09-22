export function SetupView({ onChoose }: { onChoose: () => void }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        height: '100vh',
        textAlign: 'center',
        fontFamily: 'system-ui',
        color: '#eee'
      }}
    >
      <div>
        <h1 style={{ marginBottom: 8 }}>Mininetflix</h1>
        <p style={{ opacity: 0.7, marginBottom: 24 }}>
          Choose the folder where your movies and series live.
        </p>
        <button
          onClick={onChoose}
          style={{
            padding: '12px 28px',
            fontSize: 15,
            border: 0,
            borderRadius: 4,
            background: '#e50914',
            color: '#fff',
            cursor: 'pointer'
          }}
        >
          Choose folder
        </button>
      </div>
    </div>
  )
}

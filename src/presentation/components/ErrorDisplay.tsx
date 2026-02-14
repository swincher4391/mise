interface ErrorDisplayProps {
  error: string
}

const isBotBlocked = (error: string) => error.includes('Chrome extension')

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  return (
    <div className="error-display">
      <h2>Couldn't extract recipe</h2>
      <p>{error}</p>
      <div className="error-suggestions">
        {isBotBlocked(error) ? (
          <>
            <p><strong>StorySkip Chrome Extension</strong></p>
            <p>
              The extension extracts recipes directly from your browser, bypassing
              any site protection. Install it once and click the StorySkip icon on any
              recipe page.
            </p>
            <p style={{ marginTop: '0.5rem' }}>Or try <strong>Photo import</strong> — take a screenshot and we'll read it for you.</p>
          </>
        ) : (
          <>
            <p>Try these tips:</p>
            <ul>
              <li>Make sure the URL points directly to a recipe page</li>
              <li>Try a different recipe from the same site</li>
              <li>Some sites don't include structured recipe data</li>
            </ul>
          </>
        )}
      </div>
    </div>
  )
}

interface ErrorDisplayProps {
  error: string
}

const isBotBlocked = (error: string) => error.includes('Chrome extension')
const isInstagram = (error: string) => error.includes('Instagram')

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  return (
    <div className="error-display">
      <h2>Couldn't extract recipe</h2>
      <p>{error}</p>
      <div className="error-suggestions">
        {isBotBlocked(error) ? (
          <>
            <p><strong>Mise Chrome Extension</strong></p>
            <p>
              The extension extracts recipes directly from your browser, bypassing
              any site protection. Install it once and click the Mise icon on any
              recipe page.
            </p>
            <p style={{ marginTop: '0.5rem' }}>Or try <strong>Photo import</strong> — take a screenshot and we'll read it for you.</p>
          </>
        ) : isInstagram(error) ? (
          <>
            <p>This post may have embedding disabled. To import the recipe:</p>
            <ol>
              <li>Open the post in Instagram</li>
              <li>Copy the recipe text from the caption</li>
              <li>Tap <strong>Paste</strong> above and paste it in</li>
            </ol>
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

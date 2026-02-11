interface ErrorDisplayProps {
  error: string
}

export function ErrorDisplay({ error }: ErrorDisplayProps) {
  return (
    <div className="error-display">
      <h2>Couldn't extract recipe</h2>
      <p>{error}</p>
      <div className="error-suggestions">
        <p>Try these tips:</p>
        <ul>
          <li>Make sure the URL points directly to a recipe page</li>
          <li>Try a different recipe from the same site</li>
          <li>Some sites don't include structured recipe data</li>
        </ul>
      </div>
    </div>
  )
}

interface InstallBannerProps {
  onInstall: () => void
  onDismiss: () => void
}

export function InstallBanner({ onInstall, onDismiss }: InstallBannerProps) {
  return (
    <div className="install-banner">
      <span>Add StorySkip to your home screen for the full experience</span>
      <div className="install-banner-actions">
        <button className="install-banner-btn" onClick={onInstall}>Install</button>
        <button className="install-banner-dismiss" onClick={onDismiss}>&times;</button>
      </div>
    </div>
  )
}

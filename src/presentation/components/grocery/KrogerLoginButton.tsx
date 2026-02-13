interface KrogerLoginButtonProps {
  isConnected: boolean
  onConnect: () => void
  onDisconnect: () => void
}

export function KrogerLoginButton({ isConnected, onConnect, onDisconnect }: KrogerLoginButtonProps) {
  if (isConnected) {
    return (
      <div className="kroger-login-status">
        <span className="kroger-connected-badge">Kroger Connected</span>
        <button className="nav-btn kroger-disconnect-btn" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    )
  }

  return (
    <button className="nav-btn kroger-connect-btn" onClick={onConnect}>
      Connect Kroger Account
    </button>
  )
}

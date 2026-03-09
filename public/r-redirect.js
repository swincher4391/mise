// Redirect human visitors from /api/r?d=... to the app with import data.
// External file so it passes CSP script-src 'self'. Bots don't execute JS,
// so they still see the recipe HTML + JSON-LD.
(function () {
  var d = new URLSearchParams(window.location.search).get('d')
  if (d) window.location.replace('https://mise.swinch.dev/?import=' + d)
})()

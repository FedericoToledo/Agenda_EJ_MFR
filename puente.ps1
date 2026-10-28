$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Test-Path '.\node_modules\express')) {
  npm install
}

Write-Host ''
Write-Host 'Agenda del Estudio Reverter' -ForegroundColor DarkGreen
Write-Host 'En esta computadora: http://127.0.0.1:8787'
Write-Host 'El enlace para el celular aparece abajo (https://....trycloudflare.com).'
Write-Host 'Deja esta ventana abierta. Si la cerras, o si la computadora se duerme, el enlace deja de andar.'
Write-Host ''

$node = Start-Process -FilePath 'node' -ArgumentList 'server/index.js' -WorkingDirectory $PSScriptRoot -PassThru -NoNewWindow
try {
  & cloudflared tunnel --url http://127.0.0.1:8787 --no-autoupdate
} finally {
  if ($node -and -not $node.HasExited) {
    Stop-Process -Id $node.Id -Force -ErrorAction SilentlyContinue
  }
}

param(
  [int]$Port = 5173
)

Add-Type -AssemblyName System.Net.HttpListener -ErrorAction SilentlyContinue

$root = $PSScriptRoot
$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $root on http://localhost:$Port/"

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js'   = 'application/javascript; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.ico'  = 'image/x-icon'
}

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $req = $context.Request
  $res = $context.Response
  try {
    $path = $req.Url.AbsolutePath
    if ($path -eq '/') { $path = '/index.html' }
    $filePath = Join-Path $root ($path.TrimStart('/') -replace '/', [IO.Path]::DirectorySeparatorChar)

    if (Test-Path $filePath -PathType Leaf) {
      $ext = [IO.Path]::GetExtension($filePath).ToLower()
      $contentType = $mime[$ext]
      if (-not $contentType) { $contentType = 'application/octet-stream' }
      $bytes = [IO.File]::ReadAllBytes($filePath)
      $res.ContentType = $contentType
      $res.Headers.Add('Cache-Control', 'no-cache, no-store, must-revalidate')
      $res.Headers.Add('Pragma', 'no-cache')
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
      $bytes = [Text.Encoding]::UTF8.GetBytes("404 Not Found: $path")
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.OutputStream.Close()
  }
}

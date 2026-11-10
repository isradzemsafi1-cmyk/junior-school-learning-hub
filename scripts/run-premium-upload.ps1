$ErrorActionPreference = 'Stop'
Write-Host "Private Grade 8 and Grade 9 PDF migration" -ForegroundColor Cyan
Write-Host "Your Service Role Key is read securely and is not saved in the project." -ForegroundColor Yellow
Write-Host ""
$supabaseUrl = Read-Host "Enter your Supabase Project URL (https://....supabase.co)"
if ($supabaseUrl -notmatch '^https://[A-Za-z0-9-]+\.supabase\.co/?$') {
  throw "That does not look like a Supabase project URL. Please check the URL in Supabase Project Settings > API."
}
$secureKey = Read-Host "Paste your Supabase service_role secret key (input is hidden)" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try { $serviceKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
$env:SUPABASE_URL = $supabaseUrl.TrimEnd('/')
$env:SUPABASE_SERVICE_ROLE_KEY = $serviceKey
try {
  node .\scripts\upload-premium-teacher-pdfs.mjs
  if ($LASTEXITCODE -ne 0) { throw "The upload script returned an error. The local PDFs have been retained." }
} finally {
  Remove-Item Env:SUPABASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_SERVICE_ROLE_KEY -ErrorAction SilentlyContinue
  $serviceKey = $null
  $secureKey.Dispose()
}

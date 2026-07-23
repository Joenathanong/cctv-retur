# Hapus node_modules yang gagal/korup
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$dirs = @(
    "$root\backend\node_modules",
    "$root\frontend\node_modules",
    "$root\frontend\.next"
)

foreach ($d in $dirs) {
    if (Test-Path $d) {
        Write-Host "Menghapus: $d"
        Remove-Item -Recurse -Force $d -ErrorAction SilentlyContinue
        Write-Host "  Selesai."
    }
}
Write-Host ""
Write-Host "Clean selesai. Jalankan install-run.bat kembali."

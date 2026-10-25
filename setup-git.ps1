$targetDir = "$env:LOCALAPPDATA\MinGit"
if (-not (Test-Path $targetDir)) { 
    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
}
$zipPath = "$env:TEMP\mingit.zip"
Write-Host "Downloading MinGit (~25MB)..." -ForegroundColor Cyan
curl.exe -L "https://github.com/git-for-windows/git/releases/download/v2.47.1.windows.1/MinGit-2.47.1-64-bit.zip" -o $zipPath

Write-Host "Extracting MinGit..." -ForegroundColor Cyan
Expand-Archive -Path $zipPath -DestinationPath $targetDir -Force
Remove-Item $zipPath -Force

# Test git
$gitExe = "$targetDir\cmd\git.exe"
if (Test-Path $gitExe) {
    Write-Host "Git installed successfully!" -ForegroundColor Green
    & $gitExe --version
    
    # Add to User PATH permanently
    $currentPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentPath -notlike "*$targetDir\cmd*") {
        [Environment]::SetEnvironmentVariable("Path", "$targetDir\cmd;$currentPath", "User")
    }
} else {
    Write-Host "Git installation failed." -ForegroundColor Red
}

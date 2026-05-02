###############################################################################
# NITTE Alumni Merchandise Shop - one-shot Docker setup (Windows PowerShell)
#
# Usage:
#   .\docker-setup.ps1 [start|stop|restart|clean|status|logs|demo|help]
#
# Requirements:
#   - Docker Desktop for Windows (running)
#   - PowerShell 5.1+ (built-in) or PowerShell 7+
###############################################################################

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('start','stop','restart','clean','status','logs','demo','help')]
    [string]$Action = 'start'
)

$ErrorActionPreference = 'Stop'

# Always operate from the script's directory
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# ---------- Pretty printing -------------------------------------------------
function Write-Header($msg) {
    Write-Host ''
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host $msg                                       -ForegroundColor Cyan
    Write-Host '========================================' -ForegroundColor Cyan
    Write-Host ''
}
function Write-Ok   ($msg) { Write-Host "[OK]    $msg" -ForegroundColor Green  }
function Write-Err  ($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red    }
function Write-Info ($msg) { Write-Host "[INFO]  $msg" -ForegroundColor Blue   }
function Write-Step ($msg) { Write-Host "[STEP]  $msg" -ForegroundColor Yellow }

# ---------- Globals ---------------------------------------------------------
$Script:ComposeCmd = $null

$BaseImages = @(
    'mongo:5.0',
    'confluentinc/cp-zookeeper:7.3.0',
    'confluentinc/cp-kafka:7.3.0',
    'quay.io/keycloak/keycloak:20.0.0',
    'jaegertracing/all-in-one:1.52',
    'prom/prometheus:v2.48.0',
    'grafana/grafana:10.2.2',
    'grafana/loki:2.9.4',
    'grafana/promtail:2.9.4',
    'jenkins/jenkins:lts-jdk17',
    'sonatype/nexus3:latest',
    'node:18-alpine',
    'python:3.11-slim'
)

# ---------- Helpers ---------------------------------------------------------
function Invoke-Compose {
    param([Parameter(ValueFromRemainingArguments=$true)]$Args)
    $cmd = "$Script:ComposeCmd $($Args -join ' ')"
    Write-Verbose "Running: $cmd"
    & cmd /c $cmd
    return $LASTEXITCODE
}

function Get-ComposeOutput {
    param([Parameter(ValueFromRemainingArguments=$true)]$Args)
    $cmd = "$Script:ComposeCmd $($Args -join ' ')"
    return (& cmd /c $cmd) 2>$null
}

# ---------- Prerequisites ---------------------------------------------------
function Test-Prerequisites {
    Write-Header 'Checking Prerequisites'

    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        Write-Err 'Docker is not installed.'
        Write-Info 'Install Docker Desktop: https://www.docker.com/products/docker-desktop/'
        exit 1
    }
    Write-Ok ("Docker installed: " + (docker --version))

    try {
        docker info | Out-Null
    } catch {
        Write-Err 'Docker daemon is not running. Please start Docker Desktop.'
        exit 1
    }
    Write-Ok 'Docker daemon is running'

    if (Get-Command docker-compose -ErrorAction SilentlyContinue) {
        $Script:ComposeCmd = 'docker-compose'
    } else {
        try {
            docker compose version | Out-Null
            $Script:ComposeCmd = 'docker compose'
        } catch {
            Write-Err 'Docker Compose is not installed.'
            exit 1
        }
    }
    Write-Ok "Docker Compose detected ($($Script:ComposeCmd))"

    if (-not (Test-Path 'docker-compose.yml')) {
        Write-Err "docker-compose.yml not found in $ScriptDir"
        exit 1
    }
    Write-Ok 'docker-compose.yml present'
}

# ---------- Image pre-pull --------------------------------------------------
# Pulls base images in parallel. Override concurrency with $env:PULL_PARALLEL.
# Skip entirely with $env:SKIP_PULL=1 (compose will fetch on demand).
function Get-BaseImages {
    if ($env:SKIP_PULL -eq '1') {
        Write-Info 'SKIP_PULL=1 set — skipping pre-pull (compose will fetch on demand).'
        return
    }

    Write-Header 'Pulling Base Images'

    $parallel = 4
    if ($env:PULL_PARALLEL) { $parallel = [int]$env:PULL_PARALLEL }

    # Filter out images already cached.
    $pending = @()
    $i = 0
    foreach ($img in $BaseImages) {
        $i++
        docker image inspect $img *> $null
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "[$i/$($BaseImages.Count)] cached: $img"
        } else {
            $pending += $img
        }
    }

    if ($pending.Count -eq 0) {
        Write-Ok 'All base images already cached.'
        return
    }

    Write-Info "Pulling $($pending.Count) image(s) in parallel (max $parallel concurrent)…"
    Write-Info 'Tip: set $env:SKIP_PULL=1 to skip, or $env:PULL_PARALLEL=N to tune.'

    $jobs = @()
    foreach ($img in $pending) {
        # Throttle: wait until a slot opens.
        while (($jobs | Where-Object { $_.State -eq 'Running' }).Count -ge $parallel) {
            Start-Sleep -Milliseconds 250
        }
        Write-Step "queued: $img"
        $jobs += Start-Job -ScriptBlock {
            param($image)
            docker pull $image *> $null
            if ($LASTEXITCODE -ne 0) { throw "pull failed: $image" }
            return $image
        } -ArgumentList $img
    }

    $failed = @()
    foreach ($job in $jobs) {
        try {
            $img = Receive-Job -Job $job -Wait -ErrorAction Stop
            Write-Ok "pulled: $img"
        } catch {
            $failed += $_.Exception.Message
            Write-Err $_.Exception.Message
        } finally {
            Remove-Job -Job $job -Force | Out-Null
        }
    }

    if ($failed.Count -gt 0) {
        Write-Err "$($failed.Count) image pull(s) failed."
        Write-Info 'Check network / Docker Hub access. Re-run to resume (cached images are skipped).'
        exit 1
    }
    Write-Ok 'All base images present.'
}

# ---------- Lifecycle -------------------------------------------------------
function Start-Stack {
    Test-Prerequisites
    Get-BaseImages

    Write-Header 'Building & Starting Services'
    Write-Step "Running: $Script:ComposeCmd up --build -d"
    Invoke-Compose 'up','--build','-d' | Out-Null
    if ($LASTEXITCODE -ne 0) {
        Write-Err 'docker compose failed.'
        Write-Info "Check logs with: $Script:ComposeCmd logs --tail=80"
        exit 1
    }
    Write-Ok 'Containers launched'

    $totalRaw = Get-ComposeOutput 'config','--services'
    $total    = ($totalRaw | Measure-Object -Line).Lines

    Write-Step "Waiting for $total services to report running (up to 90s)…"
    $count = 0
    $ready = 0
    while ($count -lt 90) {
        $running = Get-ComposeOutput 'ps','--services','--filter','status=running'
        $ready   = ($running | Measure-Object -Line).Lines
        Write-Host -NoNewline "`r  Running: $ready/$total services…    "
        if ($ready -ge $total) { break }
        Start-Sleep -Seconds 1
        $count++
    }
    Write-Host ''

    if ($ready -lt $total) {
        Write-Err "Only $ready/$total services running."
        Show-Status
        Write-Info "Tip: run '.\docker-setup.ps1 logs' to inspect failing containers."
        exit 1
    }
    Write-Ok "All $total services are running"

    Write-Step 'Probing API gateway health (up to 60s)…'
    $apiReady = $false
    for ($i = 1; $i -le 60; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/health' -TimeoutSec 2 -UseBasicParsing
            if ($resp.StatusCode -eq 200) { $apiReady = $true; break }
        } catch { }
        Start-Sleep -Seconds 1
    }
    if (-not $apiReady) {
        Write-Err 'API gateway not healthy at http://localhost:3000/api/v1/health'
        Show-Status
        Write-Info "Tip: run '.\docker-setup.ps1 logs' to inspect the backend container."
        exit 1
    }
    Write-Ok 'API gateway is healthy'

    Show-Status
    Show-Summary
}

function Stop-Stack {
    Test-Prerequisites
    Write-Step 'Stopping containers…'
    Invoke-Compose 'down' | Out-Null
    Write-Ok 'Stopped'
}

function Restart-Stack {
    Stop-Stack
    Start-Stack
}

function Clear-Stack {
    Test-Prerequisites
    Write-Host '[!] This removes ALL containers AND volumes (data, MongoDB, Grafana, etc).' -ForegroundColor Red
    $conf = Read-Host 'Type YES to confirm'
    if ($conf -ne 'YES') {
        Write-Info 'Cancelled.'
        return
    }
    Invoke-Compose 'down','-v' | Out-Null
    Write-Ok 'Cleaned'
}

function Show-Status {
    Test-Prerequisites

    $services = @(
        [pscustomobject]@{ Name='MongoDB';             Container='nitte-mongodb';       Port='27017' }
        [pscustomobject]@{ Name='Keycloak';            Container='nitte-keycloak';      Port='8080'  }
        [pscustomobject]@{ Name='Zookeeper';           Container='nitte-zookeeper';     Port='2181'  }
        [pscustomobject]@{ Name='Kafka';               Container='nitte-kafka';         Port='9092'  }
        [pscustomobject]@{ Name='Backend API';         Container='nitte-backend';       Port='3000'  }
        [pscustomobject]@{ Name='Storefront';          Container='nitte-frontend';      Port='5173'  }
        [pscustomobject]@{ Name='Admin / Merchant UI'; Container='nitte-admin';         Port='5174'  }
        [pscustomobject]@{ Name='Notifications';       Container='nitte-notifications'; Port='-'     }
        [pscustomobject]@{ Name='Python Service';      Container='nitte-python';        Port='-'     }
        [pscustomobject]@{ Name='Jenkins';             Container='nitte-jenkins';       Port='8081'  }
        [pscustomobject]@{ Name='Nexus Repository';    Container='nitte-nexus';         Port='8082'  }
        [pscustomobject]@{ Name='Prometheus';          Container='nitte-prometheus';    Port='9090'  }
        [pscustomobject]@{ Name='Grafana';             Container='nitte-grafana';       Port='3001'  }
        [pscustomobject]@{ Name='Jaeger';              Container='nitte-jaeger';        Port='16686' }
        [pscustomobject]@{ Name='Loki';                Container='nitte-loki';          Port='3100'  }
        [pscustomobject]@{ Name='Promtail';            Container='nitte-promtail';      Port='-'     }
    )

    $sep = '  ' + ([string][char]0x2500) * 70
    $runningCount = 0
    $total = $services.Count

    Write-Host ''
    Write-Host ('  {0,-22} {1,-24} {2,-16} {3,-10} {4}' -f 'SERVICE','CONTAINER','STATUS','HEALTH','PORT') -ForegroundColor White
    Write-Host $sep -ForegroundColor Cyan

    foreach ($svc in $services) {
        $state  = ''
        $health = [char]0x2014  # em dash

        try {
            $insp   = docker inspect $svc.Container 2>$null | ConvertFrom-Json
            $state  = $insp[0].State.Status
            $hObj   = $insp[0].State.Health
            if ($hObj) { $health = $hObj.Status }
        } catch { }

        if ([string]::IsNullOrEmpty($state)) { $state = 'absent' }

        $statusText  = ''; $statusColor  = 'Gray'
        $healthColor = 'Gray'

        switch ($state) {
            'running'    { $statusText = [char]0x25CF + ' running';    $statusColor = 'Green';  $runningCount++ }
            'exited'     { $statusText = [char]0x25CF + ' exited';     $statusColor = 'Red'    }
            'dead'       { $statusText = [char]0x25CF + ' dead';       $statusColor = 'Red'    }
            'restarting' { $statusText = [char]0x25CC + ' restarting'; $statusColor = 'Yellow' }
            'paused'     { $statusText = [char]0x25CC + ' paused';     $statusColor = 'Yellow' }
            'absent'     { $statusText = [char]0x25CB + ' absent';     $statusColor = 'DarkRed'}
            default      { $statusText = [char]0x25CC + " $state";     $statusColor = 'Yellow' }
        }

        switch ($health) {
            'healthy'   { $healthColor = 'Green'  }
            'unhealthy' { $healthColor = 'Red'    }
            'starting'  { $healthColor = 'Yellow' }
        }

        $portDisp = if ($svc.Port -eq '-') { '-' } else { ':' + $svc.Port }

        Write-Host -NoNewline ('  {0,-22} {1,-24} ' -f $svc.Name, $svc.Container)
        Write-Host -NoNewline ('{0,-16}' -f $statusText)  -ForegroundColor $statusColor
        Write-Host -NoNewline ('{0,-10}' -f $health)      -ForegroundColor $healthColor
        Write-Host $portDisp
    }

    Write-Host $sep -ForegroundColor Cyan

    if ($runningCount -eq $total) {
        Write-Host ("  [+] All $runningCount/$total services running") -ForegroundColor Green
    } elseif ($runningCount -gt 0) {
        Write-Host ("  [!] $runningCount/$total services running") -ForegroundColor Yellow
    } else {
        Write-Host ("  [x] No services running — run: .\docker-setup.ps1 start") -ForegroundColor Red
    }
    Write-Host ''
}

function Show-Logs {
    Test-Prerequisites
    Invoke-Compose 'logs','-f','--tail=50' | Out-Null
}

function Invoke-Demo {
    Test-Prerequisites
    Write-Header 'Quick Demo Test'

    Write-Step 'Hitting health endpoint…'
    try {
        $resp = Invoke-RestMethod -Uri 'http://localhost:3000/api/v1/health' -TimeoutSec 5
        Write-Host ($resp | ConvertTo-Json -Depth 3)
        Write-Ok 'API healthy'
    } catch {
        Write-Err 'API not reachable. Run: .\docker-setup.ps1 start'
        exit 1
    }

    Write-Step 'Generating a few requests so metrics populate…'
    for ($i = 0; $i -lt 20; $i++) {
        try { Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/products' -UseBasicParsing -TimeoutSec 2 | Out-Null } catch {}
        try { Invoke-WebRequest -Uri 'http://localhost:3000/api/v1/health'   -UseBasicParsing -TimeoutSec 2 | Out-Null } catch {}
    }
    Write-Ok 'Test traffic sent'

    Show-Summary
}

function Show-Summary {
    $sep = '  ' + ([string][char]0x2500) * 62
    Write-Host ''
    Write-Host ('{0}╔══════════════════════════════════════════════════════════════╗{1}' -f '', '') -ForegroundColor Cyan
    Write-Host ('  NITTE Alumni Merchandise Shop — Secure Full-Stack Demo') -ForegroundColor White
    Write-Host ('  Keycloak RBAC · MongoDB · Kafka · Observability · DevOps') -ForegroundColor Gray
    Write-Host ('{0}╚══════════════════════════════════════════════════════════════╝{1}' -f '', '') -ForegroundColor Cyan
    Write-Host ''

    Write-Host '  WHO ACCESSES WHAT' -ForegroundColor White
    Write-Host $sep -ForegroundColor Cyan
    Write-Host ('  {0,-30} -> {1}' -f 'Alumni / Non-Alumni',         'Storefront            http://localhost:5173')
    Write-Host ('  {0,-30} -> {1}' -f 'Platform Admin',              'Admin Console         http://localhost:5174')
    Write-Host ('  {0,-30} -> {1}' -f 'Amazon / Flipkart Merchant',  'Merchant Portal       http://localhost:5174')
    Write-Host ('  {0,-30} -> {1}' -f 'Internal DevOps (full)',      'Jenkins               http://localhost:8081')
    Write-Host ('  {0,-30} -> {1}' -f 'Internal DevOps (read-only)', 'Nexus / Grafana / Jaeger')
    Write-Host ''

    Write-Host '  ALL SERVICE URLS' -ForegroundColor White
    Write-Host $sep -ForegroundColor Cyan
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Storefront',        'http://localhost:5173',  'Alumni merch shop (shopping)')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Admin/Merchant UI', 'http://localhost:5174',  'Role-based management console')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Backend API',       'http://localhost:3000',  'REST API + Kafka + JWT auth')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Keycloak',          'http://localhost:8080',  'Identity & access management')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Jenkins',           'http://localhost:8081',  'CI/CD pipelines (DevOps)')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Nexus Repository',  'http://localhost:8082',  'Artifact & package registry')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Prometheus',        'http://localhost:9090',  'Metrics scraper')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Grafana',           'http://localhost:3001',  'Dashboards & log explorer')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Jaeger',            'http://localhost:16686', 'Distributed trace viewer')
    Write-Host ('  {0,-24} {1,-32} {2}' -f 'Loki',              'http://localhost:3100',  'Log aggregation API')
    Write-Host ''

    Write-Host '  DEMO CREDENTIALS' -ForegroundColor White
    Write-Host $sep -ForegroundColor Cyan

    Write-Host '  [ Storefront -> http://localhost:5173 ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Platform Admin',    'admin@nitte.edu',               'admin@123')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Verified Alumni',   'alumni@nitte.edu',              'alumni@123')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Non-Alumni Guest',  'guest_user@alumni-shop.local',  'Guest@123')
    Write-Host ''

    Write-Host '  [ Admin Console -> http://localhost:5174 ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Platform Admin',    'admin@nitte.edu',               'admin@123')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Amazon Merchant',   'amazon-merchant@amazon.com',    'Amazon@123')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Flipkart Merchant', 'flipkart-merchant@flipkart.com','Flipkart@123')
    Write-Host ''

    Write-Host '  [ Jenkins -> http://localhost:8081  (Keycloak SSO) ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Internal Admin',    'internal-admin@nitte.ac.in',    'InternalAdmin@123  ^ 2FA')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Internal User',     'internal-user@nitte.ac.in',     'InternalUser@123   (read-only)')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Escape Hatch',      'local-admin',                   'LocalAdmin@123     (offline fallback)')
    Write-Host ''

    Write-Host '  [ Nexus -> http://localhost:8082 ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Nexus Admin',       'admin',                         'nexus-admin-123')
    Write-Host ''

    Write-Host '  [ Grafana -> http://localhost:3001  (Keycloak SSO) ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Internal Admin',    'internal-admin@nitte.ac.in',    'InternalAdmin@123  ^ 2FA  -> Grafana Admin')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Internal User',     'internal-user@nitte.ac.in',     'InternalUser@123   -> Grafana Editor')
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Local Fallback',    'admin  (local)',                 'admin123')
    Write-Host ''

    Write-Host '  [ Keycloak -> http://localhost:8080/admin ]' -ForegroundColor Yellow
    Write-Host ('  {0,-18} {1,-38} {2}' -f 'Console Admin',     'admin',                         'admin')
    Write-Host ''

    Write-Host '  QUICK COMMANDS' -ForegroundColor White
    Write-Host $sep -ForegroundColor Cyan
    Write-Host ('  {0,-34} {1}' -f '.\docker-setup.ps1 stop',    'Stop all services')
    Write-Host ('  {0,-34} {1}' -f '.\docker-setup.ps1 restart', 'Restart the full stack')
    Write-Host ('  {0,-34} {1}' -f '.\docker-setup.ps1 logs',    'Tail logs from all containers')
    Write-Host ('  {0,-34} {1}' -f '.\docker-setup.ps1 status',  'Show container health')
    Write-Host ('  {0,-34} {1}' -f '.\docker-setup.ps1 clean',   'Destroy everything including volumes  WARNING: DATA LOSS')
    Write-Host ''
}

function Show-Usage {
    Write-Host @'
NITTE Alumni Merchandise Shop - Docker setup (Windows)

Usage: .\docker-setup.ps1 [command]

Commands:
  start     Pull images, build and start the full stack (default)
  stop      Stop all containers
  restart   Stop then start
  clean     Stop + remove all containers and volumes (DATA LOSS)
  status    Show running services
  logs      Follow logs from all services
  demo      Run a quick self-test against the running stack
  help      Show this message

Examples:
  .\docker-setup.ps1               # equivalent to start
  .\docker-setup.ps1 start
  .\docker-setup.ps1 logs
'@
}

# ---------- Entry -----------------------------------------------------------
switch ($Action) {
    'start'   { Start-Stack }
    'stop'    { Stop-Stack }
    'restart' { Restart-Stack }
    'clean'   { Clear-Stack }
    'status'  { Show-Status }
    'logs'    { Show-Logs }
    'demo'    { Invoke-Demo }
    'help'    { Show-Usage }
}

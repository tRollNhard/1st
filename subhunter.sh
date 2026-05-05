#!/usr/bin/env bash
# =============================================================================
# subhunter.sh — Subdomain Hunter v1.0
#
# Phase 1: Enumeration       — subfinder, amass (passive), assetfinder run in
#                              parallel, then crt.sh certificate transparency,
#                              then optional wordlist bruteforce via dnsx,
#                              then merge + deduplicate everything.
# Phase 2: Liveness          — DNS resolution (A + CNAME) via dnsx, then
#                              HTTP/HTTPS probing via httpx with status codes,
#                              titles, and tech detection. Falls back to
#                              dig/curl if tools aren't installed.
# Phase 3: Takeover          — nuclei takeover templates, then subjack
#                              fingerprint matching, then custom CNAME analysis
#                              against 70+ known vulnerable services (S3,
#                              Heroku, Azure, GitHub Pages, Netlify, Shopify,
#                              etc.), then NXDOMAIN check on CNAME targets
#                              (strongest takeover signal).
# Phase 4: Report            — summary stats + organized output files.
#
# For authorized bug bounty / security testing only.
#
# Requires: bash 4+
# Optional: subfinder amass assetfinder dnsx httpx nuclei subjack jq
# Fallback: dig curl host
# =============================================================================

set -uo pipefail

# ── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
RESET='\033[0m'

# ── Logging helpers ──────────────────────────────────────────────────────────
log()   { echo -e "${BOLD}[*]${RESET} $*"; }
info()  { echo -e "${CYAN}[+]${RESET} $*"; }
warn()  { echo -e "${YELLOW}[!]${RESET} $*"; }
err()   { echo -e "${RED}[✗]${RESET} $*" >&2; }
ok()    { echo -e "${GREEN}[✓]${RESET} $*"; }
skip()  { echo -e "${DIM}[-]${RESET} $*"; }
vlog()  { [[ "${VERBOSE:-false}" == "true" ]] && echo -e "${DIM}[v]${RESET} $*" || true; }

phase_header() {
    echo -e "\n${BOLD}${BLUE}══════════════════════════════════════════════════${RESET}"
    printf  "${BOLD}${BLUE}  ▶  PHASE %s — %s${RESET}\n" "$1" "$2"
    echo -e "${BOLD}${BLUE}══════════════════════════════════════════════════${RESET}\n"
}

# ── Vulnerable service fingerprints ──────────────────────────────────────────
# Format: "cname_suffix|http_fingerprint|service_name"
VULN_SERVICES=(
    # AWS
    "s3.amazonaws.com|NoSuchBucket|AWS S3"
    "s3-website-us-east-1.amazonaws.com|NoSuchBucket|AWS S3 Website (us-east-1)"
    "s3-website-us-west-1.amazonaws.com|NoSuchBucket|AWS S3 Website (us-west-1)"
    "s3-website-us-west-2.amazonaws.com|NoSuchBucket|AWS S3 Website (us-west-2)"
    "s3-website-eu-west-1.amazonaws.com|NoSuchBucket|AWS S3 Website (eu-west-1)"
    "s3-website.ap-southeast-1.amazonaws.com|NoSuchBucket|AWS S3 Website (ap-se-1)"
    "s3-website.ap-northeast-1.amazonaws.com|NoSuchBucket|AWS S3 Website (ap-ne-1)"
    "elasticbeanstalk.com|CNAME Lookup Failed|AWS ElasticBeanstalk"
    "cloudfront.net|ERROR: The request could not be satisfied|AWS CloudFront"
    # Azure
    "azurewebsites.net|404 Web Site not found|Azure App Service"
    "azureedge.net|The resource you are looking for|Azure CDN"
    "azure-api.net|Oops. Something went wrong|Azure API Management"
    "trafficmanager.net|NXDOMAIN|Azure Traffic Manager"
    "cloudapp.azure.com|404 Not Found|Azure Cloud App"
    "azurefd.net|The requested resource does not exist|Azure Front Door"
    "azurecontainer.io|404 Not Found|Azure Container Instances"
    "blob.core.windows.net|The specified blob does not exist|Azure Blob Storage"
    # GCP
    "storage.googleapis.com|NoSuchBucket|Google Cloud Storage"
    "appspot.com|404 Not Found|Google App Engine"
    "run.app|404 Not Found|Google Cloud Run"
    # Heroku
    "herokuapp.com|No such app|Heroku"
    "herokudns.com|No such app|Heroku DNS"
    # GitHub
    "github.io|There isn't a GitHub Pages site here|GitHub Pages"
    # Netlify
    "netlify.app|Not Found|Netlify"
    "netlify.com|Not Found|Netlify"
    # Vercel / Now
    "vercel.app|The deployment could not be found|Vercel"
    "now.sh|The deployment could not be found|Vercel (now.sh)"
    # Render / Fly / Railway
    "onrender.com|404 page not found|Render"
    "fly.dev|404 Not Found|Fly.io"
    "up.railway.app|Application not found|Railway"
    # Shopify
    "myshopify.com|Sorry, this shop is currently unavailable|Shopify"
    "shopifypreview.com|Sorry, this shop is currently unavailable|Shopify Preview"
    # Fastly
    "fastly.net|Fastly error: unknown domain|Fastly"
    "fastlylb.net|Fastly error: unknown domain|Fastly LB"
    # Pantheon / Ghost / Cargo / Tumblr / WP
    "pantheonsite.io|The gods are confused|Pantheon"
    "ghost.io|The thing you were looking for is no longer here|Ghost"
    "cargocollective.com|404 Not Found|Cargo Collective"
    "tumblr.com|There's nothing here|Tumblr"
    "wordpress.com|Do you want to register|WordPress.com"
    # Zendesk / HelpScout / Freshdesk / UserVoice
    "zendesk.com|Help Center Closed|Zendesk"
    "helpscoutdocs.com|No settings were found for this company|HelpScout"
    "freshdesk.com|There is no helpdesk here with this URL|Freshdesk"
    "uservoice.com|This UserVoice subdomain is currently available|UserVoice"
    # Surge / Bitbucket / Acquia
    "surge.sh|project not found|Surge.sh"
    "bitbucket.io|Repository not found|Bitbucket"
    "acquia-sites.com|Web Site Not Found|Acquia"
    # WPEngine / Squarespace / Webflow / Unbounce
    "wpengine.com|The site you were looking for|WP Engine"
    "squarespace.com|No Such Account|Squarespace"
    "webflow.io|The page you are looking for doesn't exist|Webflow"
    "unbouncepages.com|The requested URL was not found|Unbounce"
    # Leadpages / Strikingly
    "lpages.co|404 Not Found|Leadpages"
    "leadpages.net|404 Not Found|Leadpages"
    "strikingly.com|page not found|Strikingly"
    # HubSpot
    "hubspotpagebuilder.com|does not exist|HubSpot"
    "hs-sites.com|does not exist|HubSpot Sites"
    "hubspot.net|does not exist|HubSpot"
    # Intercom / ReadMe / GitBook
    "intercom.help|This page is reserved for artistic expression|Intercom"
    "intercom.io|This page is reserved for artistic expression|Intercom"
    "readme.io|Project doesnt exist|ReadMe"
    "readthedocs.io|no project with that slug|ReadTheDocs"
    "gitbook.io|If you need assistance|GitBook"
    # StatusPage / Kinsta / Flywheel
    "statuspage.io|You are being redirected|StatusPage"
    "kinsta.cloud|No Site For Domain|Kinsta"
    "getflywheel.com|hosted by Flywheel|Flywheel"
    # JetBrains / Teamwork / Wishpond
    "myjetbrains.com|is not a registered InCloud YouTrack|JetBrains"
    "teamwork.com|Oops - We didn't find your site|Teamwork"
    "wishpond.com|page not found|Wishpond"
    # Kajabi / Bigcartel / Aftership
    "kajabi.com|The page you were looking for doesn't exist|Kajabi"
    "bigcartel.com|Oops! We couldn't find that page|Bigcartel"
    "aftership.com|Tracking page not found|Aftership"
    # Misc
    "agilecrm.com|Sorry, this page is no longer available|AgileCRM"
    "simplebooklet.com|We can't find this page|Simplebooklet"
    "uberflip.com|Non-2xx return code|Uberflip"
    "launchrock.com|It looks like you may have taken a wrong turn|Launchrock"
    "surveysparrow.com|Account not found|SurveySparrow"
    "desk.com|Please try again|Desk.com"
    "format.com|If you're moving to Format|Format"
    "thinkific.com|You may have mistyped the address|Thinkific"
    "tictail.com|Building a brand of your own|Tictail"
    "smartling.com|Domain is not configured|Smartling"
    "tilda.ws|Please renew your subscription|Tilda"
    "worksites.net|Hello! Sorry, but the website|Worksites"
    "wufoo.com|Hmmm....something is not right|Wufoo"
)

# ── Defaults ─────────────────────────────────────────────────────────────────
DOMAIN=""
WORDLIST=""
OUTPUT_DIR="./subhunter-output"
THREADS=50
TIMEOUT=10
SKIP_NUCLEI=false
VERBOSE=false
START_TIME=$(date +%s)
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# ── Tool availability flags ──────────────────────────────────────────────────
HAS_SUBFINDER=false
HAS_AMASS=false
HAS_ASSETFINDER=false
HAS_DNSX=false
HAS_HTTPX=false
HAS_NUCLEI=false
HAS_SUBJACK=false
HAS_DIG=false
HAS_CURL=false
HAS_HOST=false
HAS_JQ=false

# ── Usage ────────────────────────────────────────────────────────────────────
usage() {
    cat <<EOF
${BOLD}subhunter.sh${RESET} — Subdomain Enumeration, Liveness & Takeover Detection

${BOLD}USAGE:${RESET}
  ./subhunter.sh -d <domain> [OPTIONS]

${BOLD}OPTIONS:${RESET}
  -d DOMAIN      Target domain (required)
  -w WORDLIST    Wordlist for DNS bruteforce (optional, requires dnsx)
  -o DIR         Output directory (default: ./subhunter-output)
  -t THREADS     Parallelism for tools (default: 50)
  -T TIMEOUT     HTTP timeout in seconds (default: 10)
  --no-nuclei    Skip nuclei takeover scan
  -v             Verbose output
  -h, --help     Show this help

${BOLD}PHASES:${RESET}
  1. Enumeration  — subfinder + amass (passive) + assetfinder in parallel,
                    then crt.sh certificate transparency, optional dnsx brute,
                    finally merge + deduplicate.
  2. Liveness     — dnsx for A + CNAME records, httpx for HTTP/HTTPS probing
                    with status codes, page titles, and tech detection.
                    Falls back to dig/curl when tools aren't installed.
  3. Takeover     — nuclei (takeover templates) + subjack (fingerprints) +
                    custom CNAME analysis against ${#VULN_SERVICES[@]} known vulnerable
                    services + NXDOMAIN-on-CNAME-target check.
  4. Report       — summary stats + Markdown report + organized output files.

${BOLD}EXAMPLES:${RESET}
  ./subhunter.sh -d example.com
  ./subhunter.sh -d example.com -w /usr/share/seclists/DNS/subdomains.txt
  ./subhunter.sh -d example.com -o ~/results -t 100 --no-nuclei
EOF
    exit 0
}

# ── Argument parsing ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        -d)          DOMAIN="${2:-}"; shift 2 ;;
        -w)          WORDLIST="${2:-}"; shift 2 ;;
        -o)          OUTPUT_DIR="${2:-}"; shift 2 ;;
        -t)          THREADS="${2:-50}"; shift 2 ;;
        -T)          TIMEOUT="${2:-10}"; shift 2 ;;
        --no-nuclei) SKIP_NUCLEI=true; shift ;;
        -v)          VERBOSE=true; shift ;;
        -h|--help)   usage ;;
        *)           err "Unknown option: $1"; usage ;;
    esac
done

[[ -z "$DOMAIN" ]] && { err "Domain is required. Use -d <domain>"; usage; }

# Strip protocol / trailing slash if user passed a URL
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN%/}"

# ── Setup output directories ─────────────────────────────────────────────────
RUN_DIR="${OUTPUT_DIR}/${DOMAIN}/${TIMESTAMP}"
RAW_DIR="${RUN_DIR}/raw"
LIVE_DIR="${RUN_DIR}/liveness"
TAKEOVER_DIR="${RUN_DIR}/takeover"
REPORT_DIR="${RUN_DIR}/report"
mkdir -p "$RAW_DIR" "$LIVE_DIR" "$TAKEOVER_DIR" "$REPORT_DIR"

# Output file paths — raw
F_SUBFINDER="${RAW_DIR}/subfinder.txt"
F_AMASS="${RAW_DIR}/amass.txt"
F_ASSETFINDER="${RAW_DIR}/assetfinder.txt"
F_CRTSH="${RAW_DIR}/crtsh.txt"
F_BRUTE="${RAW_DIR}/bruteforce.txt"
F_ALL="${RAW_DIR}/all_subdomains.txt"

# Output file paths — liveness
F_DNSX_RAW="${LIVE_DIR}/dnsx_raw.txt"
F_DNS_RESOLVED="${LIVE_DIR}/dns_resolved.txt"
F_CNAMES="${LIVE_DIR}/cnames.txt"
F_HTTP_LIVE="${LIVE_DIR}/http_live.txt"
F_HTTPS_LIVE="${LIVE_DIR}/https_live.txt"
F_LIVE_ALL="${LIVE_DIR}/live_all.txt"
F_DIG_FALLBACK="${LIVE_DIR}/dig_fallback.txt"

# Output file paths — takeover
F_NUCLEI="${TAKEOVER_DIR}/nuclei_results.txt"
F_SUBJACK="${TAKEOVER_DIR}/subjack_results.txt"
F_CNAME_ANALYSIS="${TAKEOVER_DIR}/cname_analysis.txt"
F_NXDOMAIN="${TAKEOVER_DIR}/nxdomain_cnames.txt"
F_TAKEOVER_CANDIDATES="${TAKEOVER_DIR}/takeover_candidates.txt"

# Output file paths — report
F_SUMMARY="${REPORT_DIR}/summary.txt"
F_REPORT="${REPORT_DIR}/full_report.md"

# ── Banner ───────────────────────────────────────────────────────────────────
echo -e "${BOLD}${CYAN}"
cat <<'BANNER'
 ____        _     _   _             _
/ ___| _   _| |__ | | | |_   _ _ __ | |_ ___ _ __
\___ \| | | | '_ \| |_| | | | | '_ \| __/ _ \ '__|
 ___) | |_| | |_) |  _  | |_| | | | | ||  __/ |
|____/ \__,_|_.__/|_| |_|\__,_|_| |_|\__\___|_|        v1.0
BANNER
echo -e "${RESET}"
echo -e "${BOLD}Target:${RESET}    ${GREEN}${DOMAIN}${RESET}"
echo -e "${BOLD}Output:${RESET}    ${RUN_DIR}"
echo -e "${BOLD}Threads:${RESET}   ${THREADS}"
echo -e "${BOLD}Timeout:${RESET}   ${TIMEOUT}s"
[[ -n "$WORDLIST" ]] && echo -e "${BOLD}Wordlist:${RESET}  ${WORDLIST}"
echo -e "${BOLD}Started:${RESET}   $(date)"
echo

# ── Utilities ────────────────────────────────────────────────────────────────
count_lines() {
    [[ -f "$1" ]] && wc -l < "$1" 2>/dev/null | tr -d ' \t\n\r' || echo 0
}

# ── Tool detection ───────────────────────────────────────────────────────────
check_tools() {
    log "Checking tool availability..."
    local found=() missing=()

    command -v subfinder   &>/dev/null && HAS_SUBFINDER=true   && found+=("subfinder")   || missing+=("subfinder")
    command -v amass       &>/dev/null && HAS_AMASS=true       && found+=("amass")       || missing+=("amass")
    command -v assetfinder &>/dev/null && HAS_ASSETFINDER=true && found+=("assetfinder") || missing+=("assetfinder")
    command -v dnsx        &>/dev/null && HAS_DNSX=true        && found+=("dnsx")        || missing+=("dnsx")
    command -v httpx       &>/dev/null && HAS_HTTPX=true       && found+=("httpx")       || missing+=("httpx")
    command -v nuclei      &>/dev/null && HAS_NUCLEI=true      && found+=("nuclei")      || missing+=("nuclei")
    command -v subjack     &>/dev/null && HAS_SUBJACK=true     && found+=("subjack")     || missing+=("subjack")
    command -v dig         &>/dev/null && HAS_DIG=true         && found+=("dig")
    command -v curl        &>/dev/null && HAS_CURL=true        && found+=("curl")
    command -v host        &>/dev/null && HAS_HOST=true        && found+=("host")
    command -v jq          &>/dev/null && HAS_JQ=true          && found+=("jq")          || missing+=("jq")

    ok "Found: ${found[*]:-none}"
    [[ ${#missing[@]} -gt 0 ]] && warn "Missing: ${missing[*]} (will use fallbacks where possible)"

    if ! $HAS_DIG && ! $HAS_HOST; then
        err "No DNS resolution tool found (need dig or host). Aborting."
        exit 1
    fi
    if ! $HAS_CURL; then
        warn "curl not found — HTTP probing & crt.sh will be limited"
    fi
    echo
}

# ── crt.sh helper ────────────────────────────────────────────────────────────
fetch_crtsh() {
    local url="https://crt.sh/?q=%25.${DOMAIN}&output=json"
    local raw
    raw=$(curl -s --max-time 30 "$url" 2>/dev/null || echo "[]")
    if $HAS_JQ; then
        echo "$raw" | jq -r '.[]?.name_value // empty' 2>/dev/null \
            | sed 's/\*\.//g' \
            | tr '[:upper:]' '[:lower:]' \
            | tr ',' '\n' \
            | grep -E "^[a-z0-9._-]+\.[a-z]{2,}$" \
            | sort -u > "$F_CRTSH"
    else
        echo "$raw" \
            | grep -oE '"name_value":"[^"]*"' \
            | sed 's/"name_value":"//;s/"$//' \
            | sed 's/\\n/\n/g' \
            | sed 's/\*\.//g' \
            | tr '[:upper:]' '[:lower:]' \
            | grep -E "^[a-z0-9._-]+\.[a-z]{2,}$" \
            | sort -u > "$F_CRTSH"
    fi
    info "crt.sh: $(count_lines "$F_CRTSH") subdomains"
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — ENUMERATION
# ─────────────────────────────────────────────────────────────────────────────
phase1_enum() {
    phase_header "1" "SUBDOMAIN ENUMERATION"

    local pids=()

    # subfinder
    if $HAS_SUBFINDER; then
        info "Running subfinder..."
        ( subfinder -d "$DOMAIN" -silent -all -o "$F_SUBFINDER" 2>/dev/null \
            && info "subfinder: $(count_lines "$F_SUBFINDER") subdomains" ) &
        pids+=($!)
    else
        skip "subfinder not installed"
        : > "$F_SUBFINDER"
    fi

    # amass (passive)
    if $HAS_AMASS; then
        info "Running amass (passive)..."
        ( amass enum -passive -d "$DOMAIN" -o "$F_AMASS" 2>/dev/null \
            && info "amass: $(count_lines "$F_AMASS") subdomains" ) &
        pids+=($!)
    else
        skip "amass not installed"
        : > "$F_AMASS"
    fi

    # assetfinder
    if $HAS_ASSETFINDER; then
        info "Running assetfinder..."
        ( assetfinder --subs-only "$DOMAIN" 2>/dev/null > "$F_ASSETFINDER" \
            && info "assetfinder: $(count_lines "$F_ASSETFINDER") subdomains" ) &
        pids+=($!)
    else
        skip "assetfinder not installed"
        : > "$F_ASSETFINDER"
    fi

    # crt.sh
    if $HAS_CURL; then
        info "Querying crt.sh..."
        ( fetch_crtsh ) &
        pids+=($!)
    else
        skip "curl not installed — skipping crt.sh"
        : > "$F_CRTSH"
    fi

    # Wait for all parallel passive sources
    log "Waiting for passive sources to complete..."
    for pid in "${pids[@]}"; do
        wait "$pid" 2>/dev/null || true
    done

    # Optional wordlist bruteforce via dnsx
    : > "$F_BRUTE"
    if [[ -n "$WORDLIST" ]]; then
        if $HAS_DNSX; then
            if [[ ! -f "$WORDLIST" ]]; then
                warn "Wordlist not found: $WORDLIST — skipping bruteforce"
            else
                info "Running wordlist bruteforce via dnsx..."
                awk -v d="$DOMAIN" 'NF{print $1"."d}' "$WORDLIST" \
                    | dnsx -silent -a -resp-only -t "$THREADS" 2>/dev/null \
                    | sort -u > "$F_BRUTE"
                info "bruteforce: $(count_lines "$F_BRUTE") resolved subdomains"
            fi
        else
            warn "Wordlist provided but dnsx missing — skipping bruteforce"
        fi
    else
        skip "No wordlist provided — skipping bruteforce"
    fi

    # Merge + deduplicate
    info "Merging and deduplicating sources..."
    local domain_re="${DOMAIN//./\\.}"
    cat "$F_SUBFINDER" "$F_AMASS" "$F_ASSETFINDER" "$F_CRTSH" "$F_BRUTE" 2>/dev/null \
        | tr '[:upper:]' '[:lower:]' \
        | grep -E "(^|\.)${domain_re}$" \
        | sort -u > "$F_ALL"

    local total
    total=$(count_lines "$F_ALL")
    ok "Phase 1 complete — ${BOLD}${total} unique subdomains${RESET} discovered"
    echo
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — LIVENESS
# ─────────────────────────────────────────────────────────────────────────────
phase2_liveness() {
    phase_header "2" "LIVENESS CHECK"

    local total
    total=$(count_lines "$F_ALL")
    if [[ "$total" -eq 0 ]]; then
        warn "No subdomains discovered — skipping Phase 2"
        : > "$F_DNS_RESOLVED" "$F_CNAMES" "$F_LIVE_ALL"
        return
    fi

    # ── DNS resolution (A + CNAME) ────────────────────────────────────────────
    info "Resolving DNS (A + CNAME records)..."
    : > "$F_DNS_RESOLVED" "$F_CNAMES" "$F_DIG_FALLBACK"

    if $HAS_DNSX; then
        vlog "Using dnsx for DNS resolution"
        dnsx -l "$F_ALL" -silent -a -cname -resp -t "$THREADS" \
             2>/dev/null > "$F_DNSX_RAW" || true
        awk '{print $1}' "$F_DNSX_RAW" | sort -u > "$F_DNS_RESOLVED"
        grep -i "\[CNAME\]" "$F_DNSX_RAW" > "$F_CNAMES" 2>/dev/null || true
        info "DNS resolved:  $(count_lines "$F_DNS_RESOLVED")"
        info "CNAME records: $(count_lines "$F_CNAMES")"
    else
        warn "dnsx missing — falling back to dig (slower)"
        local sub a_result cname_result
        while IFS= read -r sub; do
            [[ -z "$sub" ]] && continue
            if $HAS_DIG; then
                a_result=$(dig +short +timeout=3 +tries=1 A "$sub" 2>/dev/null \
                    | grep -E '^[0-9.]+$' | head -1)
                cname_result=$(dig +short +timeout=3 +tries=1 CNAME "$sub" 2>/dev/null \
                    | head -1 | sed 's/\.$//')
            else
                a_result=$(host -W 3 "$sub" 2>/dev/null \
                    | awk '/has address/{print $4; exit}')
                cname_result=$(host -W 3 "$sub" 2>/dev/null \
                    | awk '/is an alias/{print $NF; exit}' | sed 's/\.$//')
            fi
            if [[ -n "$a_result" ]]; then
                echo "$sub" >> "$F_DNS_RESOLVED"
                echo "$sub -> A -> $a_result" >> "$F_DIG_FALLBACK"
            fi
            if [[ -n "$cname_result" ]]; then
                # Match dnsx output format so Phase 3 parser works uniformly
                echo "$sub [CNAME] $cname_result" >> "$F_CNAMES"
                echo "$sub -> CNAME -> $cname_result" >> "$F_DIG_FALLBACK"
            fi
            vlog "  $sub → A:${a_result:-—} CNAME:${cname_result:-—}"
        done < "$F_ALL"
        sort -u -o "$F_DNS_RESOLVED" "$F_DNS_RESOLVED"
        info "DNS resolved (dig fallback): $(count_lines "$F_DNS_RESOLVED")"
        info "CNAME records: $(count_lines "$F_CNAMES")"
    fi

    # ── HTTP / HTTPS probing ──────────────────────────────────────────────────
    info "Probing HTTP/HTTPS endpoints..."
    : > "$F_HTTP_LIVE" "$F_HTTPS_LIVE" "$F_LIVE_ALL"

    if [[ ! -s "$F_DNS_RESOLVED" ]]; then
        warn "No resolved subdomains to probe — skipping HTTP phase"
    elif $HAS_HTTPX; then
        vlog "Using httpx for HTTP/HTTPS probing"
        httpx -l "$F_DNS_RESOLVED" -silent -ports 80 \
              -status-code -title -tech-detect \
              -threads "$THREADS" -timeout "$TIMEOUT" \
              -o "$F_HTTP_LIVE" 2>/dev/null || true
        httpx -l "$F_DNS_RESOLVED" -silent -ports 443 \
              -status-code -title -tech-detect \
              -threads "$THREADS" -timeout "$TIMEOUT" \
              -o "$F_HTTPS_LIVE" 2>/dev/null || true
        cat "$F_HTTP_LIVE" "$F_HTTPS_LIVE" 2>/dev/null | sort -u > "$F_LIVE_ALL"
        info "Live HTTP:  $(count_lines "$F_HTTP_LIVE")"
        info "Live HTTPS: $(count_lines "$F_HTTPS_LIVE")"
    elif $HAS_CURL; then
        warn "httpx missing — falling back to curl (slower, no tech detection)"
        local sub code
        while IFS= read -r sub; do
            [[ -z "$sub" ]] && continue
            code=$(curl -s -o /dev/null -w "%{http_code}" \
                       --max-time "$TIMEOUT" --connect-timeout 5 \
                       -L -k "https://$sub" 2>/dev/null || echo "000")
            [[ "$code" != "000" ]] && echo "https://$sub [$code]" >> "$F_HTTPS_LIVE"

            code=$(curl -s -o /dev/null -w "%{http_code}" \
                       --max-time "$TIMEOUT" --connect-timeout 5 \
                       -L "http://$sub" 2>/dev/null || echo "000")
            [[ "$code" != "000" ]] && echo "http://$sub [$code]" >> "$F_HTTP_LIVE"

            vlog "  $sub → HTTPS:$code"
        done < "$F_DNS_RESOLVED"
        cat "$F_HTTP_LIVE" "$F_HTTPS_LIVE" 2>/dev/null | sort -u > "$F_LIVE_ALL"
        info "Live HTTP:  $(count_lines "$F_HTTP_LIVE")"
        info "Live HTTPS: $(count_lines "$F_HTTPS_LIVE")"
    else
        warn "Neither httpx nor curl found — skipping HTTP probing"
    fi

    ok "Phase 2 complete — ${BOLD}$(count_lines "$F_LIVE_ALL") live endpoints${RESET} found"
    echo
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — TAKEOVER DETECTION
# ─────────────────────────────────────────────────────────────────────────────
phase3_takeover() {
    phase_header "3" "SUBDOMAIN TAKEOVER DETECTION"

    : > "$F_NUCLEI" "$F_SUBJACK" "$F_CNAME_ANALYSIS" "$F_NXDOMAIN" "$F_TAKEOVER_CANDIDATES"

    # ── Nuclei ────────────────────────────────────────────────────────────────
    if $HAS_NUCLEI && [[ "$SKIP_NUCLEI" == false ]]; then
        info "Running nuclei with takeover templates..."
        nuclei -l "$F_ALL" \
               -tags takeover \
               -silent \
               -timeout "$TIMEOUT" \
               -c "$THREADS" \
               -o "$F_NUCLEI" 2>/dev/null || true
        local n; n=$(count_lines "$F_NUCLEI")
        if [[ "$n" -gt 0 ]]; then
            warn "nuclei: ${n} potential takeovers → $F_NUCLEI"
            cat "$F_NUCLEI" >> "$F_TAKEOVER_CANDIDATES"
        else
            ok "nuclei: no takeovers detected"
        fi
    elif [[ "$SKIP_NUCLEI" == true ]]; then
        skip "nuclei skipped (--no-nuclei)"
    else
        skip "nuclei not installed"
    fi

    # ── Subjack ───────────────────────────────────────────────────────────────
    if $HAS_SUBJACK; then
        info "Running subjack fingerprint matching..."
        local fp_file=""
        for candidate in \
            "$HOME/go/pkg/mod/github.com/haccer/subjack/fingerprints.json" \
            "/usr/local/share/subjack/fingerprints.json" \
            "./fingerprints.json"; do
            [[ -f "$candidate" ]] && fp_file="$candidate" && break
        done

        if [[ -n "$fp_file" ]]; then
            subjack -w "$F_ALL" -t "$THREADS" -timeout 30 -ssl \
                    -c "$fp_file" -o "$F_SUBJACK" 2>/dev/null || true
        else
            subjack -w "$F_ALL" -t "$THREADS" -timeout 30 -ssl \
                    -o "$F_SUBJACK" 2>/dev/null || true
        fi

        local n; n=$(count_lines "$F_SUBJACK")
        if [[ "$n" -gt 0 ]]; then
            warn "subjack: ${n} potential takeovers → $F_SUBJACK"
            cat "$F_SUBJACK" >> "$F_TAKEOVER_CANDIDATES"
        else
            ok "subjack: no takeovers detected"
        fi
    else
        skip "subjack not installed"
    fi

    # ── Custom CNAME analysis ─────────────────────────────────────────────────
    info "Running custom CNAME analysis (${#VULN_SERVICES[@]} service fingerprints)..."
    {
        echo "# Custom CNAME Takeover Analysis"
        echo "# Target: $DOMAIN"
        echo "# Date:   $(date)"
        echo "# Services checked: ${#VULN_SERVICES[@]}"
        echo
    } >> "$F_CNAME_ANALYSIS"

    if [[ ! -s "$F_CNAMES" ]]; then
        skip "No CNAME records to analyze"
        echo "No CNAME records found." >> "$F_CNAME_ANALYSIS"
    else
        local cname_line sub cname_target service_entry cname_suffix http_fp service_name
        local body
        while IFS= read -r cname_line; do
            [[ -z "$cname_line" ]] && continue
            sub=$(awk '{print $1}' <<< "$cname_line")
            cname_target=$(echo "$cname_line" \
                | grep -oE '\[CNAME\][[:space:]]*[^[:space:]]+' \
                | awk '{print $2}' \
                | sed 's/\.$//' \
                | tr '[:upper:]' '[:lower:]')
            [[ -z "$cname_target" ]] && continue

            vlog "  $sub → $cname_target"

            for service_entry in "${VULN_SERVICES[@]}"; do
                IFS='|' read -r cname_suffix http_fp service_name <<< "$service_entry"

                if [[ "$cname_target" == *"$cname_suffix"* ]]; then
                    echo "[CNAME MATCH] $sub → $cname_target ($service_name)" >> "$F_CNAME_ANALYSIS"

                    if $HAS_CURL; then
                        body=$(curl -s -L -k --max-time "$TIMEOUT" --connect-timeout 5 \
                                    "https://$sub" 2>/dev/null)
                        [[ -z "$body" ]] && body=$(curl -s -L --max-time "$TIMEOUT" \
                                                       --connect-timeout 5 "http://$sub" 2>/dev/null)
                        if [[ -n "$body" ]] && echo "$body" | grep -qi "$http_fp"; then
                            echo "  ⚠  CONFIRMED: HTTP body contains '$http_fp'" >> "$F_CNAME_ANALYSIS"
                            echo "[CONFIRMED] $sub → $cname_target | $service_name | fingerprint: '$http_fp'" \
                                >> "$F_TAKEOVER_CANDIDATES"
                        else
                            echo "  ✓  HTTP fingerprint not found (likely claimed)" >> "$F_CNAME_ANALYSIS"
                        fi
                    else
                        echo "  ?  HTTP fingerprint check skipped (curl missing)" >> "$F_CNAME_ANALYSIS"
                        echo "[POSSIBLE] $sub → $cname_target | $service_name | manual verification needed" \
                            >> "$F_TAKEOVER_CANDIDATES"
                    fi
                    echo >> "$F_CNAME_ANALYSIS"
                fi
            done
        done < "$F_CNAMES"
    fi

    # ── NXDOMAIN check on CNAME targets ──────────────────────────────────────
    info "Checking CNAME targets for NXDOMAIN (strongest takeover signal)..."
    {
        echo "# NXDOMAIN CNAME Target Analysis"
        echo "# A CNAME target that returns NXDOMAIN means the destination"
        echo "# domain is unregistered — register it to take over the subdomain."
        echo
    } >> "$F_NXDOMAIN"

    if [[ -s "$F_CNAMES" ]] && ($HAS_DIG || $HAS_HOST); then
        local cname_line sub cname_target nxdomain
        while IFS= read -r cname_line; do
            [[ -z "$cname_line" ]] && continue
            sub=$(awk '{print $1}' <<< "$cname_line")
            cname_target=$(echo "$cname_line" \
                | grep -oE '\[CNAME\][[:space:]]*[^[:space:]]+' \
                | awk '{print $2}' | sed 's/\.$//')
            [[ -z "$cname_target" ]] && continue

            nxdomain=false
            if $HAS_DIG; then
                if dig +noall +comments +timeout=3 +tries=1 "$cname_target" 2>/dev/null \
                       | grep -qi "status: NXDOMAIN"; then
                    nxdomain=true
                fi
            elif $HAS_HOST; then
                if host -W 3 "$cname_target" 2>&1 | grep -qiE "not found|NXDOMAIN|3\(NXDOMAIN\)"; then
                    nxdomain=true
                fi
            fi

            if $nxdomain; then
                warn "NXDOMAIN: $sub → $cname_target (target does not exist!)"
                echo "[NXDOMAIN] $sub → $cname_target" >> "$F_NXDOMAIN"
                echo "[HIGH-CONFIDENCE NXDOMAIN] $sub → $cname_target | unregistered CNAME target → register to take over" \
                    >> "$F_TAKEOVER_CANDIDATES"
            else
                vlog "  $cname_target resolves OK"
            fi
        done < "$F_CNAMES"
    else
        [[ ! -s "$F_CNAMES" ]] && skip "No CNAMEs to NXDOMAIN-check"
    fi

    # Deduplicate consolidated candidates file
    if [[ -s "$F_TAKEOVER_CANDIDATES" ]]; then
        sort -u -o "$F_TAKEOVER_CANDIDATES" "$F_TAKEOVER_CANDIDATES"
    fi

    local candidates; candidates=$(count_lines "$F_TAKEOVER_CANDIDATES")
    if [[ "$candidates" -gt 0 ]]; then
        warn "Phase 3 complete — ${BOLD}${RED}${candidates} takeover candidate(s)${RESET} found!"
    else
        ok "Phase 3 complete — no takeover candidates detected"
    fi
    echo
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — REPORT
# ─────────────────────────────────────────────────────────────────────────────
phase4_report() {
    phase_header "4" "REPORT"

    local end_time elapsed
    end_time=$(date +%s)
    elapsed=$(( end_time - START_TIME ))

    local cnt_subfinder=$(count_lines "$F_SUBFINDER")
    local cnt_amass=$(count_lines "$F_AMASS")
    local cnt_assetfinder=$(count_lines "$F_ASSETFINDER")
    local cnt_crtsh=$(count_lines "$F_CRTSH")
    local cnt_brute=$(count_lines "$F_BRUTE")
    local cnt_all=$(count_lines "$F_ALL")
    local cnt_resolved=$(count_lines "$F_DNS_RESOLVED")
    local cnt_cnames=$(count_lines "$F_CNAMES")
    local cnt_live_http=$(count_lines "$F_HTTP_LIVE")
    local cnt_live_https=$(count_lines "$F_HTTPS_LIVE")
    local cnt_live_all=$(count_lines "$F_LIVE_ALL")
    local cnt_nuclei=$(count_lines "$F_NUCLEI")
    local cnt_subjack=$(count_lines "$F_SUBJACK")
    local cnt_nxdomain=$(count_lines "$F_NXDOMAIN")
    local cnt_candidates=$(count_lines "$F_TAKEOVER_CANDIDATES")

    # ── Terminal summary ──────────────────────────────────────────────────────
    echo -e "${BOLD}${CYAN}╔══════════════════════════════════════════════════╗${RESET}"
    echo -e "${BOLD}${CYAN}║              SUBHUNTER  SUMMARY                  ║${RESET}"
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════╣${RESET}"
    printf "${CYAN}║${RESET}  %-30s %16s ${CYAN}║${RESET}\n" "Target Domain:"   "$DOMAIN"
    printf "${CYAN}║${RESET}  %-30s %16s ${CYAN}║${RESET}\n" "Scan Duration:"   "${elapsed}s"
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════╣${RESET}"
    echo -e "${CYAN}║${RESET}  ${BOLD}PHASE 1 — ENUMERATION${RESET}                          ${CYAN}║${RESET}"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "subfinder:"     "$cnt_subfinder"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "amass:"         "$cnt_amass"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "assetfinder:"   "$cnt_assetfinder"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "crt.sh:"        "$cnt_crtsh"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "bruteforce:"    "$cnt_brute"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "TOTAL (deduped):" "$cnt_all"
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════╣${RESET}"
    echo -e "${CYAN}║${RESET}  ${BOLD}PHASE 2 — LIVENESS${RESET}                             ${CYAN}║${RESET}"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "DNS resolved:"  "$cnt_resolved"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "CNAME records:" "$cnt_cnames"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "Live HTTP:"     "$cnt_live_http"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "Live HTTPS:"    "$cnt_live_https"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "Total live:"    "$cnt_live_all"
    echo -e "${BOLD}${CYAN}╠══════════════════════════════════════════════════╣${RESET}"
    echo -e "${CYAN}║${RESET}  ${BOLD}PHASE 3 — TAKEOVER${RESET}                             ${CYAN}║${RESET}"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "nuclei hits:"     "$cnt_nuclei"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "subjack hits:"    "$cnt_subjack"
    printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "NXDOMAIN CNAMEs:" "$cnt_nxdomain"
    if [[ "$cnt_candidates" -gt 0 ]]; then
        printf "${RED}║    %-28s %16s ║${RESET}\n" "⚠ TAKEOVER CANDIDATES:" "$cnt_candidates"
    else
        printf "${CYAN}║${RESET}    %-28s %16s ${CYAN}║${RESET}\n" "Takeover candidates:" "$cnt_candidates"
    fi
    echo -e "${BOLD}${CYAN}╚══════════════════════════════════════════════════╝${RESET}"

    # ── Plain text summary ────────────────────────────────────────────────────
    cat > "$F_SUMMARY" <<SUMMARY
SUBHUNTER SCAN SUMMARY
======================
Target Domain : $DOMAIN
Scan Date     : $(date)
Duration      : ${elapsed}s
Output Dir    : $RUN_DIR

PHASE 1 — ENUMERATION
---------------------
subfinder         : $cnt_subfinder
amass (passive)   : $cnt_amass
assetfinder       : $cnt_assetfinder
crt.sh            : $cnt_crtsh
bruteforce        : $cnt_brute
TOTAL (deduped)   : $cnt_all

PHASE 2 — LIVENESS
------------------
DNS resolved      : $cnt_resolved
CNAME records     : $cnt_cnames
Live HTTP         : $cnt_live_http
Live HTTPS        : $cnt_live_https
Total live        : $cnt_live_all

PHASE 3 — TAKEOVER
------------------
nuclei hits             : $cnt_nuclei
subjack hits            : $cnt_subjack
NXDOMAIN CNAMEs         : $cnt_nxdomain
Takeover candidates     : $cnt_candidates

OUTPUT FILES
------------
All subdomains       : $F_ALL
DNS resolved         : $F_DNS_RESOLVED
CNAME records        : $F_CNAMES
Live endpoints       : $F_LIVE_ALL
Nuclei results       : $F_NUCLEI
Subjack results      : $F_SUBJACK
CNAME analysis       : $F_CNAME_ANALYSIS
NXDOMAIN targets     : $F_NXDOMAIN
Takeover candidates  : $F_TAKEOVER_CANDIDATES
SUMMARY

    # ── Markdown report ───────────────────────────────────────────────────────
    cat > "$F_REPORT" <<MDREPORT
# Subhunter Scan Report

**Target:** \`${DOMAIN}\`
**Date:** $(date)
**Duration:** ${elapsed} seconds
**Output:** \`${RUN_DIR}\`

---

## Phase 1 — Enumeration

| Source              | Count             |
|---------------------|-------------------|
| subfinder           | ${cnt_subfinder}  |
| amass (passive)     | ${cnt_amass}      |
| assetfinder         | ${cnt_assetfinder}|
| crt.sh              | ${cnt_crtsh}      |
| Bruteforce          | ${cnt_brute}      |
| **Total (deduped)** | **${cnt_all}**    |

## Phase 2 — Liveness

| Metric          | Count               |
|-----------------|---------------------|
| DNS resolved    | ${cnt_resolved}     |
| CNAME records   | ${cnt_cnames}       |
| Live HTTP       | ${cnt_live_http}    |
| Live HTTPS      | ${cnt_live_https}   |
| **Total live**  | **${cnt_live_all}** |

## Phase 3 — Takeover Detection

| Method              | Findings              |
|---------------------|-----------------------|
| nuclei              | ${cnt_nuclei}         |
| subjack             | ${cnt_subjack}        |
| NXDOMAIN CNAMEs     | ${cnt_nxdomain}       |
| **Total candidates**| **${cnt_candidates}** |

MDREPORT

    if [[ "$cnt_candidates" -gt 0 ]]; then
        {
            echo
            echo "### ⚠️ Takeover Candidates"
            echo
            echo '```'
            cat "$F_TAKEOVER_CANDIDATES"
            echo '```'
        } >> "$F_REPORT"
    fi

    {
        echo
        echo "---"
        echo
        echo "## Output Files"
        echo
        echo "| Path | Description |"
        echo "|------|-------------|"
        echo "| \`raw/all_subdomains.txt\` | All discovered subdomains (deduped) |"
        echo "| \`liveness/dns_resolved.txt\` | DNS-resolved subdomains |"
        echo "| \`liveness/cnames.txt\` | CNAME records |"
        echo "| \`liveness/live_all.txt\` | All live HTTP/HTTPS endpoints |"
        echo "| \`takeover/nuclei_results.txt\` | Nuclei takeover scan output |"
        echo "| \`takeover/subjack_results.txt\` | Subjack fingerprint matches |"
        echo "| \`takeover/cname_analysis.txt\` | Custom CNAME analysis detail |"
        echo "| \`takeover/nxdomain_cnames.txt\` | NXDOMAIN CNAME targets |"
        echo "| \`takeover/takeover_candidates.txt\` | Consolidated takeover candidates |"
        echo "| \`report/summary.txt\` | Plain-text summary |"
        echo "| \`report/full_report.md\` | This Markdown report |"
    } >> "$F_REPORT"

    echo
    ok "Reports written:"
    info "  Text summary :  $F_SUMMARY"
    info "  Markdown     :  $F_REPORT"

    if [[ "$cnt_candidates" -gt 0 ]]; then
        echo
        warn "${BOLD}⚠ Takeover candidates require manual verification:${RESET}"
        sed 's/^/    /' "$F_TAKEOVER_CANDIDATES"
    fi
    echo
    ok "${BOLD}Scan complete.${RESET} Duration: ${elapsed}s | Output: ${RUN_DIR}"
}

# ── Main ─────────────────────────────────────────────────────────────────────
main() {
    check_tools
    phase1_enum
    phase2_liveness
    phase3_takeover
    phase4_report
}

main "$@"

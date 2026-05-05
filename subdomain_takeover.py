#!/usr/bin/env python3
"""
Subdomain Takeover Finder
For authorized bug hunting / bug bounty only. Do not run on targets without permission.

Usage:
  python subdomain_takeover.py example.com
  python subdomain_takeover.py example.com -w wordlist.txt
  python subdomain_takeover.py example.com -t 20 -v -o results.json

Tip: grab a bigger wordlist from SecLists:
  subdomains-top1million-5000.txt  (fast)
  subdomains-top1million-20000.txt (thorough)
"""

import sys
import json
import time
import socket
import argparse
import urllib.request
import urllib.error
import ssl
from concurrent.futures import ThreadPoolExecutor, as_completed

# ---------------------------------------------------------------------------
# Known service fingerprints — CNAME substring + HTTP body fingerprint
# If CNAME matches AND body contains the fingerprint → potential takeover
# ---------------------------------------------------------------------------
SERVICES = {
    "GitHub Pages": {
        "cnames": ["github.io"],
        "fingerprints": ["there isn't a github pages site here", "for root url validation"],
    },
    "Heroku": {
        "cnames": ["herokuapp.com", "herokussl.com"],
        "fingerprints": ["no such app", "heroku | no such app"],
    },
    "AWS S3": {
        "cnames": ["s3.amazonaws.com", "s3-website", "s3-ap-", "s3-us-"],
        "fingerprints": ["nosuchbucket", "the specified bucket does not exist",
                         "nosuchbucketpolicy"],
    },
    "Fastly": {
        "cnames": ["fastly.net"],
        "fingerprints": ["fastly error: unknown domain", "please check that this domain"],
    },
    "Azure": {
        "cnames": ["azurewebsites.net", "cloudapp.net", "azureedge.net",
                   "trafficmanager.net", "blob.core.windows.net"],
        "fingerprints": ["404 web site not found", "the resource you are looking for has been removed",
                         "no website is configured at this address"],
    },
    "Netlify": {
        "cnames": ["netlify.com", "netlify.app"],
        "fingerprints": ["not found - request id", "page not found"],
    },
    "Shopify": {
        "cnames": ["myshopify.com"],
        "fingerprints": ["sorry, this shop is currently unavailable",
                         "only if you want to get rid of the shopify"],
    },
    "Surge.sh": {
        "cnames": ["surge.sh"],
        "fingerprints": ["project not found"],
    },
    "Ghost.io": {
        "cnames": ["ghost.io"],
        "fingerprints": ["the thing you were looking for is no longer here"],
    },
    "Webflow": {
        "cnames": ["webflow.io"],
        "fingerprints": ["the page you are looking for doesn't exist",
                         "page not found | webflow"],
    },
    "Pantheon": {
        "cnames": ["pantheonsite.io", "pantheonsupport.io"],
        "fingerprints": ["the gods are wise", "404 pantheon"],
    },
    "WordPress.com": {
        "cnames": ["wordpress.com"],
        "fingerprints": ["do you want to register", "this site is no longer available"],
    },
    "Tumblr": {
        "cnames": ["tumblr.com"],
        "fingerprints": ["whatever you were looking for doesn't currently exist",
                         "there's nothing here"],
    },
    "UserVoice": {
        "cnames": ["uservoice.com"],
        "fingerprints": ["this uservoice subdomain is currently available"],
    },
    "StatusPage": {
        "cnames": ["statuspage.io"],
        "fingerprints": ["you are being redirected", "statuspage.io"],
    },
    "Zendesk": {
        "cnames": ["zendesk.com"],
        "fingerprints": ["help center closed", "page not found"],
    },
    "HelpJuice": {
        "cnames": ["helpjuice.com"],
        "fingerprints": ["we could not find what you're looking for"],
    },
    "Readme.io": {
        "cnames": ["readme.io"],
        "fingerprints": ["project doesnt exist", "project doesn't exist"],
    },
    "Intercom": {
        "cnames": ["custom.intercom.help"],
        "fingerprints": ["this page is reserved for artistic dogs"],
    },
    "Kajabi": {
        "cnames": ["kajabi.com"],
        "fingerprints": ["the page you were looking for doesn't exist"],
    },
    "Unbounce": {
        "cnames": ["unbouncepages.com"],
        "fingerprints": ["the requested url was not found on this server"],
    },
    "Wix": {
        "cnames": ["parastorage.com", "wix.com"],
        "fingerprints": ["error connectyourdomain", "this site can't be reached"],
    },
    "Squarespace": {
        "cnames": ["squarespace.com"],
        "fingerprints": ["no such account"],
    },
    "Strikingly": {
        "cnames": ["strikingly.com", "s.strikinglydns.com"],
        "fingerprints": ["but if you're looking to build your own website"],
    },
    "Feedpress": {
        "cnames": ["feedpress.me"],
        "fingerprints": ["the feed has not been found"],
    },
    "Campaign Monitor": {
        "cnames": ["createsend.com"],
        "fingerprints": ["double check the url"],
    },
    "Launchrock": {
        "cnames": ["launchrock.com"],
        "fingerprints": ["it looks like you may have taken a wrong turn"],
    },
    "Tave": {
        "cnames": ["tave.com"],
        "fingerprints": ["this site is no longer active"],
    },
    "Pingdom": {
        "cnames": ["stats.pingdom.com"],
        "fingerprints": ["pingdom.com/rss"],
    },
    "UptimeRobot": {
        "cnames": ["statuspage.io"],
        "fingerprints": ["uptimerobot.com"],
    },
}

# ---------------------------------------------------------------------------
# Built-in mini wordlist — for when no -w is provided
# ---------------------------------------------------------------------------
BUILTIN_WORDLIST = [
    "www", "mail", "ftp", "api", "dev", "staging", "test", "beta", "app",
    "admin", "portal", "dashboard", "panel", "control", "manage", "cms",
    "blog", "shop", "store", "checkout", "secure", "login", "auth", "sso",
    "id", "identity", "account", "accounts", "help", "support", "docs",
    "status", "monitor", "monitoring", "metrics", "logs", "analytics",
    "cdn", "assets", "images", "img", "media", "upload", "uploads",
    "static", "files", "download", "downloads", "backup", "backups",
    "git", "gitlab", "github", "jenkins", "jira", "confluence", "sonar",
    "s3", "bucket", "archive", "internal", "intranet", "private", "corp",
    "demo", "sandbox", "qa", "uat", "preprod", "preview", "review",
    "v1", "v2", "v3", "api2", "rest", "graphql", "m", "mobile",
    "smtp", "imap", "pop", "mail2", "webmail", "email", "newsletter",
    "ns1", "ns2", "mx", "vpn", "remote",
    "forum", "community", "talk", "chat", "crm", "hr", "legal",
    "track", "tracking", "pixel", "stats", "events", "click",
    "new", "old", "legacy", "classic", "go", "redirect",
    "developers", "developer", "eng", "engineering", "infra",
    "cloud", "k8s", "kube", "docker", "registry", "ci", "cd",
    "data", "db", "mysql", "postgres", "redis", "elastic",
    "search", "ai", "ml", "jobs", "careers", "press", "news",
]


# ---------------------------------------------------------------------------
# DNS helpers
# ---------------------------------------------------------------------------

def resolve_cname(subdomain):
    """Return the CNAME target using nslookup. Returns None if no CNAME."""
    import subprocess
    try:
        result = subprocess.run(
            ["nslookup", "-type=CNAME", subdomain],
            capture_output=True, text=True, timeout=5
        )
        for line in result.stdout.splitlines():
            l = line.lower()
            if "canonical name" in l or ("cname" in l and "=" in l):
                return line.split("=")[-1].strip().rstrip(".").lower()
    except Exception:
        pass
    return None


def is_live(subdomain):
    """Return True if subdomain resolves to an IP address."""
    try:
        socket.setdefaulttimeout(4)
        socket.gethostbyname(subdomain)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# HTTP fingerprint check
# ---------------------------------------------------------------------------

def fetch_body(url, timeout=8):
    """Fetch URL, return (status_code, body_lower) or None on failure."""
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    try:
        req = urllib.request.Request(
            url,
            headers={"User-Agent": "Mozilla/5.0 (compatible; BugHunter/1.0)"}
        )
        resp = urllib.request.urlopen(req, timeout=timeout, context=ctx)
        return resp.getcode(), resp.read(8192).decode("utf-8", errors="ignore").lower()
    except urllib.error.HTTPError as e:
        try:
            return e.code, e.read(8192).decode("utf-8", errors="ignore").lower()
        except Exception:
            return e.code, ""
    except Exception:
        return None, None


def check_fingerprints(subdomain, cname):
    """Return takeover info dict if a known fingerprint is matched."""
    for service_name, service in SERVICES.items():
        if not any(c in cname for c in service["cnames"]):
            continue
        for protocol in ["https", "http"]:
            url = f"{protocol}://{subdomain}"
            status, body = fetch_body(url)
            if body is None:
                continue
            for fp in service["fingerprints"]:
                if fp in body:
                    return {
                        "service": service_name,
                        "url": url,
                        "status_code": status,
                        "fingerprint": fp,
                        "cname": cname,
                    }
    return None


# ---------------------------------------------------------------------------
# Main check pipeline per subdomain
# ---------------------------------------------------------------------------

def check_subdomain(subdomain):
    live = is_live(subdomain)
    cname = resolve_cname(subdomain)
    takeover = None

    if cname:
        takeover = check_fingerprints(subdomain, cname)

    return {
        "subdomain": subdomain,
        "live": live,
        "cname": cname,
        "vulnerable": takeover is not None,
        "takeover": takeover,
    }


# ---------------------------------------------------------------------------
# Output helpers
# ---------------------------------------------------------------------------

RESET = "\033[0m"
RED   = "\033[91m"
GREEN = "\033[92m"
YELLOW= "\033[93m"
CYAN  = "\033[96m"
BOLD  = "\033[1m"


def print_result(r, verbose=False):
    sub = r["subdomain"]
    if r["vulnerable"]:
        t = r["takeover"]
        print(f"\n{RED}{BOLD}[TAKEOVER]{RESET} {sub}")
        print(f"  Service  : {t['service']}")
        print(f"  CNAME    : {t['cname']}")
        print(f"  URL      : {t['url']}")
        print(f"  HTTP     : {t['status_code']}")
        print(f"  Matched  : \"{t['fingerprint']}\"")
    elif verbose:
        if r["live"]:
            cname_str = f"  →  {r['cname']}" if r["cname"] else ""
            print(f"  {GREEN}[live]{RESET}  {sub}{CYAN}{cname_str}{RESET}")
        else:
            print(f"  {YELLOW}[dead]{RESET}  {sub}")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Subdomain Takeover Finder — authorized bug hunting only",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python subdomain_takeover.py example.com
  python subdomain_takeover.py example.com -w subdomains-top1million-5000.txt
  python subdomain_takeover.py example.com -t 20 -v -o results.json

Get a good wordlist (SecLists):
  https://github.com/danielmiessler/SecLists/tree/master/Discovery/DNS
        """
    )
    parser.add_argument("domain", help="Target domain, e.g. example.com")
    parser.add_argument("-w", "--wordlist", help="Path to subdomain wordlist (one per line)")
    parser.add_argument("-t", "--threads", type=int, default=10, help="Thread count (default: 10)")
    parser.add_argument("-v", "--verbose", action="store_true", help="Show all subdomains, not just vulns")
    parser.add_argument("-o", "--output", help="Save JSON results to this file")
    args = parser.parse_args()

    # Load wordlist
    if args.wordlist:
        try:
            with open(args.wordlist) as f:
                words = [l.strip() for l in f if l.strip() and not l.startswith("#")]
            print(f"[*] Loaded {len(words)} words from {args.wordlist}")
        except Exception as e:
            print(f"[!] Could not load wordlist: {e}  — falling back to built-in list")
            words = BUILTIN_WORDLIST
    else:
        words = BUILTIN_WORDLIST
        print(f"[*] Using built-in wordlist ({len(words)} words) — use -w for better coverage")

    subdomains = [f"{w}.{args.domain}" for w in words]

    print(f"[*] Target    : {args.domain}")
    print(f"[*] Threads   : {args.threads}")
    print(f"[*] Checking  : {len(subdomains)} subdomains")
    print(f"[*] Started   : {time.strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"[*] {BOLD}Only run on targets you have written permission to test.{RESET}\n")

    all_results = []
    vulnerable = []
    live_count = 0
    done = 0

    with ThreadPoolExecutor(max_workers=args.threads) as ex:
        futures = {ex.submit(check_subdomain, sub): sub for sub in subdomains}
        for future in as_completed(futures):
            r = future.result()
            all_results.append(r)
            done += 1
            if r["live"]:
                live_count += 1
            if r["vulnerable"]:
                vulnerable.append(r)
            print_result(r, verbose=args.verbose)
            if done % 50 == 0:
                pct = int(done / len(subdomains) * 100)
                print(f"  ... {done}/{len(subdomains)} ({pct}%) | live: {live_count} | takeovers: {len(vulnerable)}")

    # Summary
    print(f"\n{'='*55}")
    print(f"  Checked    : {done}")
    print(f"  Live       : {live_count}")
    print(f"  Takeovers  : {len(vulnerable)}")
    print(f"{'='*55}")

    if vulnerable:
        print(f"\n{RED}{BOLD}POTENTIAL TAKEOVER TARGETS:{RESET}")
        for v in vulnerable:
            t = v["takeover"]
            print(f"  {v['subdomain']}")
            print(f"    → {t['service']}  |  CNAME: {t['cname']}")
        print(f"\n{BOLD}Next steps:{RESET}")
        print("  1. Verify manually (curl the URL, confirm the fingerprint)")
        print("  2. Claim the resource at the service (e.g. create a GitHub Pages site)")
        print("  3. Screenshot proof and report to the program — don't abuse it")
    else:
        print("\n  No obvious takeover candidates found.")
        print("  Tip: use a larger wordlist (SecLists) for better coverage.")
        print("  Tip: also run subfinder/amass to discover real subdomains first,")
        print("       then pass that output as your wordlist with -w.")

    # JSON output
    if args.output:
        output = {
            "domain": args.domain,
            "scan_time": time.strftime("%Y-%m-%d %H:%M:%S"),
            "summary": {
                "checked": done,
                "live": live_count,
                "vulnerable": len(vulnerable),
            },
            "takeover_candidates": vulnerable,
        }
        if args.verbose:
            output["all_results"] = all_results
        with open(args.output, "w") as f:
            json.dump(output, f, indent=2)
        print(f"\n[*] Results saved → {args.output}")


if __name__ == "__main__":
    main()

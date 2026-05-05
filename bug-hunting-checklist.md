# Bug Hunting Checklist (Basic → Medium)

---

## RECON (Before You Touch Anything)

- [ ] Identify the target scope (domains, subdomains, IPs, apps)
- [ ] Read the program's rules, out-of-scope items, and reward table
- [ ] Run subdomain enumeration (subfinder, amass, assetfinder)
- [ ] Check for live hosts (httpx, httprobe)
- [ ] Run port scanning on in-scope IPs (nmap)
- [ ] Directory/file brute-force (ffuf, gobuster, dirsearch)
- [ ] Check robots.txt, sitemap.xml, security.txt
- [ ] Google dork the target (site:, inurl:, filetype:, intitle:)
- [ ] Check Wayback Machine for old endpoints and parameters
- [ ] Look for exposed .git, .env, .DS_Store, backup files
- [ ] Identify tech stack (Wappalyzer, WhatRuns, response headers)
- [ ] Look for API docs (Swagger/OpenAPI, GraphQL introspection)

---

## AUTHENTICATION

- [ ] Test default credentials (admin/admin, test/test)
- [ ] Test for username enumeration (different error messages on login)
- [ ] Test password reset flow (token leaks, host header injection)
- [ ] Check if password reset tokens expire properly
- [ ] Test for brute-force protection (rate limiting on login)
- [ ] Check "remember me" token security
- [ ] Test OAuth/SSO misconfigurations (redirect_uri manipulation)
- [ ] Check for session fixation
- [ ] Test logout — does the session actually get invalidated?
- [ ] Look for JWT issues (none algorithm, weak secret, no expiry)

---

## AUTHORIZATION (IDOR / ACCESS CONTROL)

- [ ] Change IDs in URLs and API requests (user_id, order_id, doc_id)
- [ ] Test horizontal privilege escalation (access another user's data)
- [ ] Test vertical privilege escalation (user acting as admin)
- [ ] Check if API endpoints enforce auth (remove/change auth token)
- [ ] Test direct object references in file downloads
- [ ] Check if deleted/deactivated accounts can still access resources
- [ ] Swap UUIDs/IDs between two accounts you control
- [ ] Test GraphQL queries for unauthorized data access

---

## XSS (Cross-Site Scripting)

- [ ] Test all input fields with basic payloads: `<script>alert(1)</script>`
- [ ] Test URL parameters for reflected XSS
- [ ] Check search bars, comment fields, profile names
- [ ] Test for stored XSS in user-controlled content
- [ ] Try filter bypasses: `<img src=x onerror=alert(1)>`, `<svg/onload=alert(1)>`
- [ ] Check if CSP headers are present and properly configured
- [ ] Test for DOM-based XSS (check JS sinks: innerHTML, document.write)
- [ ] Test file upload names for XSS (filename reflected on page)
- [ ] Check error pages for reflected input

---

## INJECTION

- [ ] Test input fields for SQL injection (`' OR 1=1--`, `" OR ""="`)
- [ ] Try time-based blind SQLi (`' OR SLEEP(5)--`)
- [ ] Test for command injection in input fields (`; ls`, `| whoami`, `` `id` ``)
- [ ] Check for template injection (SSTI): `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`
- [ ] Test for LDAP injection if login uses directory services
- [ ] Test for header injection (CRLF): `%0d%0aInjected-Header:value`
- [ ] Check for log injection / log forging

---

## SSRF (Server-Side Request Forgery)

- [ ] Test URL input fields (webhooks, image URLs, import features)
- [ ] Try internal addresses: `http://127.0.0.1`, `http://localhost`
- [ ] Try cloud metadata endpoints: `http://169.254.169.254`
- [ ] Test with DNS rebinding or your own server (Burp Collaborator, interact.sh)
- [ ] Check PDF generators, screenshot services, URL previews
- [ ] Try file:// protocol

---

## FILE UPLOAD

- [ ] Upload a web shell (.php, .jsp, .aspx) — does it execute?
- [ ] Bypass extension filters (double extension: shell.php.jpg)
- [ ] Change Content-Type header to bypass validation
- [ ] Upload SVG with embedded XSS
- [ ] Upload oversized files (DoS check — just note, don't abuse)
- [ ] Check if uploaded files are served from the same origin
- [ ] Test for path traversal in filename (../../etc/passwd)
- [ ] Upload polyglot files (valid image + valid script)

---

## CSRF (Cross-Site Request Forgery)

- [ ] Check if sensitive actions have CSRF tokens
- [ ] Test if CSRF token is validated server-side (remove it, change it)
- [ ] Check if token is tied to session or reusable
- [ ] Test state-changing GET requests (should be POST)
- [ ] Check SameSite cookie attribute

---

## BUSINESS LOGIC

- [ ] Test negative values in quantity/price fields
- [ ] Test race conditions (send same request simultaneously)
- [ ] Skip steps in multi-step flows (go straight to step 3)
- [ ] Test coupon/discount codes for reuse or stacking
- [ ] Change currency or price in client-side requests
- [ ] Test referral/invite systems for self-referral
- [ ] Check if free-tier users can access paid features via API
- [ ] Test for mass assignment (send extra fields in API requests)

---

## INFORMATION DISCLOSURE

- [ ] Check HTTP response headers for server version leaks
- [ ] Look for stack traces in error messages
- [ ] Check for verbose API error responses
- [ ] Look for exposed admin panels (/admin, /dashboard, /console)
- [ ] Check JavaScript files for API keys, secrets, internal URLs
- [ ] Look for exposed source maps (.map files)
- [ ] Check for directory listing enabled
- [ ] Test for user enumeration via API responses or timing

---

## MISCONFIGURATION

- [ ] Check for missing security headers (X-Frame-Options, HSTS, CSP)
- [ ] Test for clickjacking (can the page be iframed?)
- [ ] Check CORS policy (Access-Control-Allow-Origin: *)
- [ ] Look for open redirects (redirect_url=https://evil.com)
- [ ] Check for HTTP when HTTPS should be enforced
- [ ] Test for subdomain takeover (dangling CNAME records)
- [ ] Check for exposed .env, config files, debug endpoints
- [ ] Check S3 buckets / cloud storage for public access

---

## TOOLS QUICK REFERENCE

| Purpose            | Tools                                      |
|--------------------|--------------------------------------------|
| Subdomain enum     | subfinder, amass, assetfinder              |
| Live hosts         | httpx, httprobe                            |
| Dir brute-force    | ffuf, gobuster, dirsearch                  |
| Port scanning      | nmap, masscan                              |
| Proxy/intercept    | Burp Suite, OWASP ZAP, Caido              |
| Recon framework    | recon-ng, theHarvester                     |
| JS analysis        | LinkFinder, JSParser, SecretFinder         |
| SQLi               | sqlmap                                     |
| XSS                | dalfox, XSStrike                           |
| Subdomain takeover | subjack, nuclei                            |
| Vulnerability scan | nuclei, nikto                              |
| Wordlists          | SecLists, fuzzdb                           |

---

## WORKFLOW ORDER

1. **Recon** — map everything before testing anything
2. **Auth + AuthZ** — highest-impact bugs live here
3. **Injection + XSS** — classic web vulns, always worth checking
4. **Business logic** — think like a user trying to cheat the system
5. **Misconfig + Info disclosure** — easy wins, often overlooked
6. **File upload + SSRF** — if the feature exists, test it

---

*Check boxes as you go. Revisit unchecked items before closing a target.*

# Obsidian Stats scorecard recovery

Snapshot taken **2026-08-03** from
[obsidianstats.com/plugins/leadsheet](https://www.obsidianstats.com/plugins/leadsheet).

## Current reading

| Field | Value |
| --- | --- |
| Score | **35 / 100** (`score: 0.35`) |
| Health | 0.45 |
| Popularity | 0 |
| User rating | 0.0 (0 reviews) |

### Weighted contributions (`scoreReason`)

| Metric | Weight | Contribution | Author control |
| --- | ---: | ---: | --- |
| closedIssuesRatio | 20% | +0.20 | Keep issues closed or resolved |
| resolvedPRRatio | 15% | +0.15 | Keep PRs merged/closed cleanly |
| totalDownloads | 20% | 0.00 | Community installs over time |
| latestReleaseAt | 15% | 0.00 | Ship tagged releases (already true) |
| createdAt | 15% | 0.00 | Ages in; no action |
| commitCountInLastYear | 10% | 0.00 | Ongoing commits on `main` |
| stargazers | 3% | 0.00 | Organic stars / demos (SON-235 loop) |
| forks | 2% | 0.00 | Organic |

Hygiene ratios already max out. The remaining **65 points** need **fresh Stats ingest**
plus **downloads / stars / release age** signals.

## Author-side facts (live GitHub API, same day)

| Field | Value |
| --- | --- |
| Repo | `chrisamber/obsidian-leadsheet` |
| Homepage | `https://community.obsidian.md/plugins/leadsheet` |
| Latest release | **0.6.0** (2026-07-21) |
| Release assets | `main.js`, `manifest.json`, `styles.css` |
| Stars / forks | 0 / 0 |
| Open issues | 0 |
| Merged PRs | 6 |
| Topics | `obsidian`, `obsidian-plugin`, `chordpro`, `leadsheet`, `music`, `guitar`, `chords`, `lyrics`, `setlist`, `autoscroll` |
| License | MIT |
| Case study | https://chrisamber.dev/work/leadsheet |

## Bug: Stats site stale / null scrape

Obsidian Stats currently shows **null** for stars, downloads, latest release,
commit count, and PR totals, and renders **Invalid date** / **NaN** on the page.
That is **not** a Leadsheet release defect — GitHub and the community registry
already list the plugin correctly.

When filing upstream, point at:

- Plugin page: https://www.obsidianstats.com/plugins/leadsheet
- Registry entry id: `leadsheet` → repo `chrisamber/obsidian-leadsheet`
- Latest release API: https://api.github.com/repos/chrisamber/obsidian-leadsheet/releases/latest
- Community list: https://github.com/obsidianmd/obsidian-releases/blob/master/community-plugins.json
- Stats UI source: https://github.com/ganesshkumar/obsidian-plugins-stats-ui

### Draft upstream issue title

`Stale/null GitHub metrics for plugin id leadsheet (score stuck at 35)`

### Draft body

```markdown
## Plugin

- id: `leadsheet`
- name: Leadsheet
- repo: https://github.com/chrisamber/obsidian-leadsheet
- stats page: https://www.obsidianstats.com/plugins/leadsheet

## Observed

Score **35/100**. Stats UI shows blank stars/downloads, 0 commits/PRs,
latest version **Invalid date**, and some **NaN** day fields.

Embedded `scoreReason` zeros out downloads, latestReleaseAt, commits, stars,
and forks even though the public GitHub API returns a normal repo with
release **0.6.0** (2026-07-21) and six historical releases.

## Expected

After the next scrape cycle, populate:

- latestRelease / latestReleaseAt from GitHub Releases
- stargazers, forks, commitCountInLastYear, PR/issue totals
- totalDownloads from community-plugin-stats.json when present

## Author contact

https://github.com/chrisamber
```

## Done / checklist (author)

- [x] Set GitHub `homepage` to the community plugin page
- [x] Expand GitHub topics for discovery
- [x] Point `manifest.json` `authorUrl` at chrisamber.dev and add `helpUrl`
- [x] Document this scorecard recovery path
- [ ] File the upstream Stats issue (optional; wait one scrape cycle first)
- [ ] Re-check score after Stats refresh
- [ ] Drive installs via install link + demos (SON-235 / SON-238), not score gaming
- [ ] Keep shipping tagged releases with `main.js` / `manifest.json` / `styles.css`

## What will not move the needle alone

- Extra README prose without installs
- Opening fake issues/PRs to game ratios (already maxed)
- Replacing release assets under an existing tag (forbidden by ROADMAP)

## Re-check command

```bash
# live GitHub
gh api repos/chrisamber/obsidian-leadsheet --jq '{homepage,topics,stars:.stargazers_count,pushed:.pushed_at}'
gh release view -R chrisamber/obsidian-leadsheet --json tagName,publishedAt,assets

# Stats page score (HTML embedded JSON)
curl -sL 'https://www.obsidianstats.com/plugins/leadsheet' | \
  python3 -c "import sys,re,json; h=sys.stdin.read(); m=re.search(r'<script id=\"__NEXT_DATA__\" type=\"application/json\">(.*?)</script>',h); p=json.loads(m.group(1))['props']['pageProps']['plugin']; print(p['score'], p.get('scoreReason'), p.get('latestRelease'), p.get('totalDownloads'), p.get('stargazers'))"
```

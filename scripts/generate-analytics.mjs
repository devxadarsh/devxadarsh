import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const USERNAME = process.env.PROFILE_USERNAME || 'devxadarsh';
const TOKEN = process.env.GITHUB_TOKEN || '';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = path.join(ROOT, 'assets', 'analytics');

const COLORS = {
  bg0: '#060b16',
  bg1: '#0b1220',
  border: '#1e293b',
  text: '#e2e8f0',
  muted: '#7c8ba1',
  dim: '#44546b',
  neon: '#22d3ee',
  neonSoft: '#67e8f9',
  blue: '#60a5fa',
  violet: '#8b5cf6',
  grid: '#93c5fd',
};

const LANG_COLORS = {
  Java: '#b07219',
  TypeScript: '#3178c6',
  JavaScript: '#f1e05a',
  HTML: '#e34c26',
  CSS: '#563d7c',
  SCSS: '#c6538c',
  Sass: '#a53b70',
  Python: '#3572a5',
  Shell: '#89e051',
  Dockerfile: '#384d54',
  Vue: '#41b883',
  Kotlin: '#a97bff',
  'C#': '#178600',
  C: '#555555',
  'C++': '#f34b7d',
  Go: '#00add8',
  Rust: '#dea584',
  PHP: '#4f5d95',
  Ruby: '#701516',
  Swift: '#f05138',
};

const esc = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

const apiHeaders = {
  'User-Agent': `${USERNAME}-profile-analytics`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
if (TOKEN) apiHeaders.Authorization = `Bearer ${TOKEN}`;

async function fetchJson(url) {
  const response = await fetch(url, { headers: apiHeaders });
  if (!response.ok) throw new Error(`${url} -> HTTP ${response.status}`);
  return response.json();
}

async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

function weekStart(dateString) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date.toISOString().slice(0, 10);
}

function parseContributions(html) {
  const counts = new Map();
  for (const match of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([\s\S]*?)<\/tool-tip>/g)) {
    const text = match[2].replace(/<[^>]+>/g, '').trim();
    const parsed = text.match(/^([\d,]+)\s+contribution/);
    counts.set(match[1], parsed ? Number(parsed[1].replaceAll(',', '')) : 0);
  }

  const days = [];
  for (const match of html.matchAll(
    /<td[^>]*data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="(contribution-day-component-[^"]+)"/g,
  )) {
    days.push({ date: match[1], count: counts.get(match[2]) ?? 0 });
  }
  return days.sort((a, b) => a.date.localeCompare(b.date));
}

function streakStats(days) {
  const active = days.filter((day) => day.count > 0);
  let longest = 0;
  let run = 0;
  let previous = null;
  for (const day of days) {
    const date = new Date(`${day.date}T00:00:00Z`);
    const isNext = previous && date - previous === 86_400_000;
    run = day.count > 0 ? (isNext ? run + 1 : 1) : 0;
    longest = Math.max(longest, run);
    previous = date;
  }

  let current = 0;
  if (active.length) {
    const last = active[active.length - 1];
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const gap = Math.round((today - new Date(`${last.date}T00:00:00Z`)) / 86_400_000);
    if (gap <= 1) current = run;
  }

  return { current, longest, activeDays: active.length };
}

const fmt = new Intl.NumberFormat('en-US');

function defs(prefix) {
  return `
    <linearGradient id="${prefix}bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${COLORS.bg0}"/>
      <stop offset="1" stop-color="${COLORS.bg1}"/>
    </linearGradient>
    <linearGradient id="${prefix}accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${COLORS.neon}"/>
      <stop offset=".55" stop-color="${COLORS.blue}"/>
      <stop offset="1" stop-color="${COLORS.violet}"/>
    </linearGradient>
    <linearGradient id="${prefix}area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${COLORS.neon}" stop-opacity=".34"/>
      <stop offset="1" stop-color="${COLORS.neon}" stop-opacity="0"/>
    </linearGradient>
    <pattern id="${prefix}grid" width="26" height="26" patternUnits="userSpaceOnUse">
      <path d="M26 0H0V26" fill="none" stroke="${COLORS.grid}" stroke-opacity=".055" stroke-width="1"/>
    </pattern>
    <filter id="${prefix}glow" x="-60%" y="-60%" width="220%" height="220%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>`;
}

function card(prefix, title, subtitle, width, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${prefix}title">
  <title id="${prefix}title">${esc(title)}${subtitle ? ` — ${esc(subtitle)}` : ''}</title>
  <defs>${defs(prefix)}
    <clipPath id="${prefix}clip"><rect width="${width}" height="${height}" rx="20"/></clipPath>
  </defs>
  <g clip-path="url(#${prefix}clip)">
    <rect width="${width}" height="${height}" fill="url(#${prefix}bg)"/>
    <rect width="${width}" height="${height}" fill="url(#${prefix}grid)">
      <animate attributeName="opacity" values="1;.55;1" dur="9s" repeatCount="indefinite"/>
    </rect>
    <rect y="0" width="${width}" height="2" fill="url(#${prefix}accent)">
      <animate attributeName="opacity" values=".55;1;.55" dur="4s" repeatCount="indefinite"/>
    </rect>
    <rect x=".5" y=".5" width="${width - 1}" height="${height - 1}" rx="20" fill="none" stroke="${COLORS.border}"/>
    <text x="24" y="32" fill="${COLORS.neonSoft}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="12" letter-spacing="2.6">${esc(title)}</text>
    ${subtitle ? `<text x="24" y="50" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" letter-spacing="1.4">${esc(subtitle)}</text>` : ''}
    ${body}
    <text x="24" y="${height - 13}" fill="${COLORS.dim}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="8.5" letter-spacing="1.6">AUTO-GENERATED · ${new Date().toISOString().slice(0, 10)}</text>
    <circle cx="${width - 24}" cy="${height - 17}" r="2" fill="${COLORS.neon}">
      <animate attributeName="opacity" values="1;.25;1" dur="2.4s" repeatCount="indefinite"/>
    </circle>
  </g>
</svg>
`;
}

function countUpText(value, x, y, size, color, delay = 0.15) {
  const steps = 6;
  let markup = '';
  for (let index = 0; index < steps; index += 1) {
    const shown = Math.round((value * (index + 1)) / steps);
    const start = (index / steps).toFixed(3);
    const end = ((index + 1) / steps).toFixed(3);
    const isLast = index === steps - 1;
    const animation = isLast
      ? `<animate attributeName="opacity" values="0;1;1" keyTimes="0;${start};1" dur="1.3s" begin="${delay}s" fill="freeze"/>`
      : `<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;${start};${end};1" dur="1.3s" begin="${delay}s" fill="freeze"/>`;
    markup += `<text x="${x}" y="${y}" fill="${color}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="${size}" font-weight="750" opacity="0">${fmt.format(shown)}${animation}</text>`;
  }
  return markup;
}

function metric(label, value, x, y, delay) {
  return `
    <circle cx="${x + 3}" cy="${y - 38}" r="2" fill="${COLORS.neon}">
      <animate attributeName="opacity" values=".35;1;.35" dur="2.8s" begin="${delay}s" repeatCount="indefinite"/>
    </circle>
    <text x="${x + 12}" y="${y - 34}" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" letter-spacing="1.6">${esc(label)}</text>
    ${countUpText(value, x, y, 30, COLORS.text, delay + 0.15)}
    <rect x="${x}" y="${y + 10}" width="0" height="2" rx="1" fill="url(#overviewaccent)">
      <animate attributeName="width" from="0" to="${Math.min(120, 38 + String(value).length * 12)}" dur="1s" begin="${delay + 0.2}s" fill="freeze"/>
    </rect>`;
}

function overviewCard({ repositories, stars, followers, contributions }) {
  const body = `
    ${metric('REPOSITORIES', repositories, 28, 112, 0.1)}
    ${metric('STARS EARNED', stars, 330, 112, 0.25)}
    ${metric('FOLLOWERS', followers, 28, 188, 0.4)}
    ${metric('CONTRIBUTIONS', contributions, 330, 188, 0.55)}
    <g transform="translate(520 92)" opacity=".5">
      <circle r="52" fill="none" stroke="${COLORS.border}" stroke-width="1"/>
      <circle r="52" fill="none" stroke="${COLORS.neon}" stroke-width="1.4" stroke-dasharray="34 260" stroke-linecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="14s" repeatCount="indefinite"/>
      </circle>
      <circle r="34" fill="none" stroke="${COLORS.violet}" stroke-width="1" stroke-dasharray="6 10" opacity=".7">
        <animateTransform attributeName="transform" type="rotate" from="360" to="0" dur="20s" repeatCount="indefinite"/>
      </circle>
      <circle r="4" fill="${COLORS.neonSoft}" filter="url(#overviewglow)">
        <animate attributeName="r" values="3;5;3" dur="3s" repeatCount="indefinite"/>
      </circle>
    </g>`;
  return card('overview', 'GITHUB OVERVIEW', 'LIVE SNAPSHOT · PUBLIC DATA', 620, 230, body);
}

function languagesCard(languages) {
  const width = 620;
  const startY = 78;
  const rowHeight = 23;
  const maxBar = 330;
  const maxBytes = languages[0]?.bytes || 1;
  const total = languages.reduce((sum, language) => sum + language.bytes, 0) || 1;

  const rows = languages
    .filter((language) => language.bytes / total >= 0.001)
    .slice(0, 6)
    .map((language, index) => {
      const y = startY + index * rowHeight;
      const percent = (language.bytes / total) * 100;
      const barWidth = Math.max(4, Math.round((language.bytes / maxBytes) * maxBar));
      const color = language.color || COLORS.neon;
      return `
        <text x="24" y="${y + 8}" fill="${COLORS.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="11" font-weight="600" opacity="0">${esc(language.name)}<animate attributeName="opacity" values="0;1" dur=".5s" begin="${0.25 + index * 0.11}s" fill="freeze"/></text>
        <rect x="150" y="${y}" width="${maxBar + 52}" height="8" rx="4" fill="#162034"/>
        <rect x="150" y="${y}" width="0" height="8" rx="4" fill="${color}" filter="url(#languagesglow)" opacity=".9">
          <animate attributeName="width" from="0" to="${barWidth}" dur="1s" begin="${0.2 + index * 0.11}s" fill="freeze"/>
        </rect>
        <circle cx="150" cy="${y + 4}" r="3" fill="${COLORS.neonSoft}" opacity="0">
          <animate attributeName="cx" from="150" to="${150 + barWidth}" dur="1s" begin="${0.2 + index * 0.11}s" fill="freeze"/>
          <animate attributeName="opacity" values="0;1;1;0" keyTimes="0;.1;.8;1" dur="1.2s" begin="${0.2 + index * 0.11}s" fill="freeze"/>
        </circle>
        <text x="${width - 26}" y="${y + 9}" text-anchor="end" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9.5" opacity="0">${percent.toFixed(1)}%<animate attributeName="opacity" values="0;1" dur=".5s" begin="${0.8 + index * 0.11}s" fill="freeze"/></text>`;
    })
    .join('');

  return card('languages', 'TOP LANGUAGES', 'BY BYTES ACROSS PUBLIC REPOSITORIES', width, 230, rows);
}

function activityCard(days, totalContributions) {
  const cell = 9;
  const gap = 2;
  const step = cell + gap;
  const x0 = 24;
  const y0 = 78;
  const weeks = [];
  for (const day of days) {
    const start = weekStart(day.date);
    let week = weeks.find((entry) => entry.start === start);
    if (!week) {
      week = { start, days: [] };
      weeks.push(week);
    }
    week.days.push(day);
  }

  const levelColor = (level) =>
    ['#162034', '#0e4566', '#0e7490', '#06b6d4', '#67e8f9'][Math.min(4, level)];
  const level = (count) => (count === 0 ? 0 : count < 3 ? 1 : count < 6 ? 2 : count < 10 ? 3 : 4);

  const columns = weeks
    .slice(-53)
    .map((week, weekIndex) => {
      const cells = week.days
        .map((day) => {
          const row = (new Date(`${day.date}T00:00:00Z`).getUTCDay() + 6) % 7;
          return `<rect x="${weekIndex * step}" y="${row * step}" width="${cell}" height="${cell}" rx="2" fill="${levelColor(level(day.count))}"/>`;
        })
        .join('');
      return `<g opacity="0">${cells}<animate attributeName="opacity" values="0;1" dur=".45s" begin="${0.15 + weekIndex * 0.018}s" fill="freeze"/></g>`;
    })
    .join('');

  const heatWidth = Math.min(53, weeks.length) * step;
  const legend = [0, 1, 2, 3, 4]
    .map(
      (index) =>
        `<rect x="${x0 + index * 15}" y="192" width="9" height="9" rx="2" fill="${levelColor(index)}"/>`,
    )
    .join('');

  const body = `
    <g transform="translate(${x0} ${y0})">${columns}</g>
    <rect x="${x0}" y="${y0 - 10}" width="${heatWidth}" height="${7 * step}" fill="none" stroke="${COLORS.border}" rx="4"/>
    <rect x="${x0 - 60}" y="${y0 - 6}" width="60" height="${7 * step + 12}" fill="url(#activityarea)" opacity=".14">
      <animate attributeName="x" values="${x0 - 60};${x0 + heatWidth}" dur="9s" repeatCount="indefinite"/>
      <animate attributeName="opacity" values="0;.18;0" dur="9s" repeatCount="indefinite"/>
    </rect>
    <text x="${x0}" y="186" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" letter-spacing="1.3">LESS</text>
    ${legend}
    <text x="${x0 + 82}" y="200" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="9" letter-spacing="1.3">MORE</text>
    <text x="${600 - 26}" y="200" text-anchor="end" fill="${COLORS.text}" font-family="Inter, ui-sans-serif, system-ui, -apple-system, sans-serif" font-size="11" font-weight="650">${fmt.format(totalContributions)} contributions</text>`;

  return card('activity', 'CONTRIBUTION ACTIVITY', 'LAST 53 WEEKS', 620, 230, body);
}

function streakCard(days, stats) {
  const weeks = [];
  for (const day of days) {
    const start = weekStart(day.date);
    let week = weeks.find((entry) => entry.start === start);
    if (!week) {
      week = { start, total: 0 };
      weeks.push(week);
    }
    week.total += day.count;
  }

  const series = weeks.slice(-26);
  const max = Math.max(1, ...series.map((week) => week.total));
  const x0 = 24;
  const x1 = 596;
  const baseY = 204;
  const topY = 120;
  const plotWidth = x1 - x0;
  const plotHeight = baseY - topY;

  const points = series.map((week, index) => {
    const x = x0 + (index / Math.max(1, series.length - 1)) * plotWidth;
    const y = baseY - (week.total / max) * plotHeight;
    return { x, y, total: week.total };
  });

  const line = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
  const area = `${line} L${x1} ${baseY} L${x0} ${baseY} Z`;

  const dots = points
    .map(
      (point, index) =>
        `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="2.4" fill="${COLORS.neonSoft}" opacity="0"><animate attributeName="opacity" values="0;1" dur=".3s" begin="${1 + index * 0.04}s" fill="freeze"/></circle>`,
    )
    .join('');

  const grid = [0, 0.5, 1]
    .map(
      (ratio) =>
        `<line x1="${x0}" x2="${x1}" y1="${baseY - ratio * plotHeight}" y2="${baseY - ratio * plotHeight}" stroke="${COLORS.border}" stroke-dasharray="2 5" opacity=".6"/>`,
    )
    .join('');

  const stat = (label, value, x, delay) => `
    <text x="${x}" y="88" fill="${COLORS.muted}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="8.5" letter-spacing="1.4">${esc(label)}</text>
    ${countUpText(value, x, 112, 24, COLORS.text, delay)}`;

  const body = `
    ${stat('CURRENT STREAK', stats.current, 24, 0.15)}
    ${stat('LONGEST STREAK', stats.longest, 232, 0.3)}
    ${stat('ACTIVE DAYS', stats.activeDays, 440, 0.45)}
    ${grid}
    <path d="${area}" fill="url(#streakarea)" opacity="0">
      <animate attributeName="opacity" values="0;.9" dur="1.1s" begin=".7s" fill="freeze"/>
    </path>
    <path d="${line}" fill="none" stroke="url(#streakaccent)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" pathLength="1" stroke-dasharray="1" stroke-dashoffset="1">
      <animate attributeName="stroke-dashoffset" from="1" to="0" dur="1.8s" begin=".25s" fill="freeze"/>
    </path>
    ${dots}
    <text x="${x1}" y="50" text-anchor="end" fill="${COLORS.dim}" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="8.5" letter-spacing="1.2">26W TREND · PEAK ${fmt.format(max)} / WEEK</text>`;

  return card('streak', 'CONSISTENCY', 'CONTRIBUTION RHYTHM', 620, 230, body);
}

async function main() {
  const [user, repos] = await Promise.all([
    fetchJson(`https://api.github.com/users/${USERNAME}`),
    fetchJson(`https://api.github.com/users/${USERNAME}/repos?per_page=100&sort=pushed&type=owner`),
  ]);

  const languages = new Map();
  const langRepos = repos.filter((repo) => !repo.fork && repo.language);
  await mapLimit(langRepos, 5, async (repo) => {
    try {
      const data = await fetchJson(repo.languages_url);
      for (const [name, bytes] of Object.entries(data)) {
        languages.set(name, (languages.get(name) || 0) + bytes);
      }
    } catch {
      // Ignore repositories whose language data cannot be fetched.
    }
  });

  const languageList = [...languages.entries()]
    .map(([name, bytes]) => ({ name, bytes, color: LANG_COLORS[name] || COLORS.neon }))
    .sort((a, b) => b.bytes - a.bytes);

  const contributionResponse = await fetch(`https://github.com/users/${USERNAME}/contributions`, {
    headers: { 'User-Agent': `${USERNAME}-profile-analytics`, Accept: 'text/html' },
  });
  if (!contributionResponse.ok) {
    throw new Error(`Contribution calendar -> HTTP ${contributionResponse.status}`);
  }
  const days = parseContributions(await contributionResponse.text());
  if (days.length < 300) throw new Error(`Contribution calendar parsed only ${days.length} days`);

  const stars = repos.reduce((sum, repo) => sum + repo.stargazers_count, 0);
  const totalContributions = days.reduce((sum, day) => sum + day.count, 0);
  const stats = streakStats(days);

  await mkdir(OUT_DIR, { recursive: true });
  const files = {
    'overview.svg': overviewCard({
      repositories: user.public_repos,
      stars,
      followers: user.followers,
      contributions: totalContributions,
    }),
    'languages.svg': languagesCard(languageList),
    'activity.svg': activityCard(days, totalContributions),
    'streak.svg': streakCard(days, stats),
  };

  for (const [name, content] of Object.entries(files)) {
    await writeFile(path.join(OUT_DIR, name), content, 'utf8');
  }

  console.log(
    `Generated analytics: ${user.public_repos} repos, ${stars} stars, ${totalContributions} contributions, ` +
      `current streak ${stats.current}d / longest ${stats.longest}d across ${days.length} days.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

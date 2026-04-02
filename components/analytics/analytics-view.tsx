"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from "react";
type ToolkitConnection = {
  slug: string;
  name: string;
  logo?: string;
  isConnected: boolean;
  connectedAccountId?: string;
};

/* ─── Allowed social platforms (same as Postiz) ──────────────── */
const SOCIAL_PLATFORMS = [
  "facebook",
  "instagram",
  "linkedin",
  "tiktok",
  "youtube",
  "twitter",
  "reddit",
  "pinterest",
  "threads",
];

/* ─── Slug → favicon domain for logos ────────────────────────── */
const SLUG_DOMAINS: Record<string, string> = {
  gmail: "gmail.com",
  googlecalendar: "calendar.google.com",
  googlesheets: "sheets.google.com",
  googledrive: "drive.google.com",
  googledocs: "docs.google.com",
  youtube: "youtube.com",
  twitter: "twitter.com",
  reddit: "reddit.com",
  linkedin: "linkedin.com",
  linkedin_ads: "linkedin.com",
  facebook: "facebook.com",
  instagram: "instagram.com",
  tiktok: "tiktok.com",
  pinterest: "pinterest.com",
  threads: "threads.net",
  slack: "slack.com",
  notion: "notion.so",
  github: "github.com",
  stripe: "stripe.com",
  shopify: "shopify.com",
};

function platformLogo(slug: string): string {
  const domain = SLUG_DOMAINS[slug.toLowerCase()];
  return domain
    ? `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
    : "";
}

/* ─── Mock analytics data per platform ───────────────────────── */
type AnalyticsMetric = {
  label: string;
  data: number[];
  total: string;
  change: number;
  isPercentage?: boolean;
};

const MOCK_METRICS: Record<string, AnalyticsMetric[]> = {
  instagram: [
    { label: "Followers", data: [120, 135, 128, 142, 155, 160, 172], total: "12.4K", change: 4.2 },
    { label: "Impressions", data: [3200, 2800, 4100, 3600, 3900, 4200, 4500], total: "26.3K", change: 12.5 },
    { label: "Engagement Rate", data: [3.2, 3.5, 2.8, 3.1, 3.4, 3.6, 3.8], total: "3.34%", change: 0.6, isPercentage: true },
    { label: "Reach", data: [2100, 1900, 2600, 2300, 2500, 2800, 3000], total: "17.2K", change: 8.1 },
    { label: "Profile Views", data: [85, 72, 91, 88, 95, 102, 110], total: "643", change: 5.3 },
    { label: "Saves", data: [12, 15, 10, 18, 14, 20, 22], total: "111", change: 15.0 },
  ],
  linkedin: [
    { label: "Followers", data: [50, 55, 52, 58, 62, 65, 70], total: "2.1K", change: 3.8 },
    { label: "Impressions", data: [1200, 1400, 1100, 1500, 1600, 1800, 2000], total: "10.6K", change: 18.2 },
    { label: "Engagement Rate", data: [5.1, 4.8, 5.5, 5.2, 5.0, 5.6, 5.8], total: "5.29%", change: 1.2, isPercentage: true },
    { label: "Reactions", data: [45, 38, 52, 48, 55, 60, 65], total: "363", change: 10.4 },
    { label: "Comments", data: [8, 6, 10, 7, 9, 12, 11], total: "63", change: 7.1 },
    { label: "Shares", data: [3, 5, 2, 4, 6, 5, 7], total: "32", change: 22.0 },
  ],
  twitter: [
    { label: "Followers", data: [200, 210, 205, 218, 225, 230, 240], total: "8.7K", change: 2.1 },
    { label: "Impressions", data: [5000, 4500, 6200, 5800, 6100, 6500, 7000], total: "41.1K", change: 9.8 },
    { label: "Engagement Rate", data: [1.8, 2.1, 1.5, 1.9, 2.2, 2.0, 2.3], total: "1.97%", change: 0.3, isPercentage: true },
    { label: "Retweets", data: [15, 12, 20, 18, 22, 25, 28], total: "140", change: 14.6 },
    { label: "Likes", data: [45, 38, 55, 50, 58, 62, 70], total: "378", change: 11.2 },
    { label: "Replies", data: [8, 5, 10, 7, 9, 11, 12], total: "62", change: 6.5 },
  ],
  youtube: [
    { label: "Subscribers", data: [30, 35, 32, 38, 40, 42, 48], total: "1.2K", change: 5.5 },
    { label: "Views", data: [800, 950, 720, 1100, 1050, 1200, 1400], total: "7.2K", change: 16.3 },
    { label: "Watch Time (hrs)", data: [12, 14, 10, 16, 15, 18, 20], total: "105", change: 12.8 },
    { label: "Likes", data: [20, 25, 18, 28, 30, 32, 38], total: "191", change: 9.4 },
    { label: "Comments", data: [5, 8, 4, 7, 9, 10, 12], total: "55", change: 18.2 },
    { label: "CTR", data: [4.2, 4.5, 3.8, 4.8, 4.6, 5.0, 5.2], total: "4.59%", change: 0.8, isPercentage: true },
  ],
  facebook: [
    { label: "Followers", data: [80, 85, 82, 90, 95, 98, 105], total: "5.3K", change: 3.2 },
    { label: "Reach", data: [2500, 2200, 3000, 2800, 3100, 3400, 3600], total: "20.6K", change: 10.1 },
    { label: "Engagement", data: [120, 105, 140, 130, 145, 155, 165], total: "960", change: 8.7 },
    { label: "Page Views", data: [60, 55, 70, 65, 72, 78, 82], total: "482", change: 6.4 },
    { label: "Reactions", data: [35, 30, 42, 38, 45, 48, 52], total: "290", change: 11.3 },
    { label: "Shares", data: [8, 6, 10, 9, 12, 14, 15], total: "74", change: 14.0 },
  ],
  tiktok: [
    { label: "Followers", data: [300, 350, 320, 380, 420, 450, 500], total: "15.2K", change: 8.5 },
    { label: "Video Views", data: [8000, 7200, 9500, 8800, 10200, 11000, 12500], total: "67.2K", change: 22.1 },
    { label: "Likes", data: [500, 450, 600, 550, 650, 700, 780], total: "4.2K", change: 15.3 },
    { label: "Comments", data: [25, 20, 30, 28, 35, 38, 42], total: "218", change: 12.0 },
    { label: "Shares", data: [15, 12, 18, 16, 20, 22, 25], total: "128", change: 18.5 },
    { label: "Avg Watch Time", data: [8.2, 7.5, 9.0, 8.8, 9.5, 10.0, 10.5], total: "9.07s", change: 3.2, isPercentage: true },
  ],
  reddit: [
    { label: "Karma", data: [50, 60, 55, 70, 85, 90, 100], total: "2.4K", change: 12.0 },
    { label: "Post Views", data: [1500, 1200, 1800, 1600, 2000, 2200, 2500], total: "12.8K", change: 15.5 },
    { label: "Upvotes", data: [80, 65, 95, 85, 100, 110, 125], total: "660", change: 10.8 },
  ],
  pinterest: [
    { label: "Followers", data: [40, 42, 41, 45, 48, 50, 54], total: "890", change: 4.0 },
    { label: "Impressions", data: [2000, 1800, 2400, 2200, 2500, 2700, 2900], total: "16.5K", change: 11.2 },
    { label: "Saves", data: [30, 25, 35, 32, 38, 40, 45], total: "245", change: 13.5 },
  ],
  threads: [
    { label: "Followers", data: [20, 25, 22, 28, 32, 35, 40], total: "540", change: 8.0 },
    { label: "Impressions", data: [600, 500, 750, 680, 800, 850, 950], total: "5.1K", change: 14.2 },
    { label: "Engagement", data: [15, 12, 18, 16, 20, 22, 25], total: "128", change: 10.5 },
  ],
};

/* ─── Sparkline SVG ──────────────────────────────────────────── */
function Sparkline({
  data,
  color,
  width = 200,
  height = 80,
}: {
  data: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (!data.length) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 4;
  const w = width - padding * 2;
  const h = height - padding * 2;

  const points = data.map((v, i) => {
    const x = padding + (i / (data.length - 1)) * w;
    const y = padding + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const pathD = points.map((p, i) => (i === 0 ? `M${p}` : `L${p}`)).join(" ");
  const areaD = `${pathD} L${padding + w},${padding + h} L${padding},${padding + h} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.3} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Trend Indicator ────────────────────────────────────────── */
function TrendIndicator({ value, isPercentage }: { value: number; isPercentage?: boolean }) {
  if (value === 0) return null;
  const isPositive = value > 0;
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${isPositive ? "text-emerald-500" : "text-red-400"}`}>
      <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className={isPositive ? "" : "rotate-180"}>
        <path d="M6 2.5L10 7.5H2L6 2.5Z" fill="currentColor" />
      </svg>
      {Math.abs(value).toFixed(1)}{isPercentage ? "pp" : "%"}
    </span>
  );
}

/* ─── Analytics Card (Postiz style) ──────────────────────────── */
const CARD_COLORS = ["#000000", "#10b981", "#3b82f6"] as const;

function AnalyticsCard({ metric, index }: { metric: AnalyticsMetric; index: number }) {
  const color = CARD_COLORS[index % CARD_COLORS.length];
  const hasChart = metric.data.length > 1;

  return (
    <div className="group relative">
      <div className="flex flex-col h-full rounded-xl border border-neutral-200 bg-white overflow-hidden transition-all hover:border-neutral-400 hover:shadow-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
          <div className="flex items-center gap-2.5">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-medium text-neutral-700">{metric.label}</span>
          </div>
          <TrendIndicator value={metric.change} isPercentage={metric.isPercentage} />
        </div>

        {hasChart ? (
          <>
            <div className="flex-1 px-3 py-1">
              <div className="h-[100px]">
                <Sparkline data={metric.data} color={color} />
              </div>
            </div>
            <div className="px-4 pb-3.5">
              <div className="text-3xl font-semibold tracking-tight text-neutral-900">{metric.total}</div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center py-8 px-4">
            <div className="text-4xl font-semibold tracking-tight text-neutral-900">{metric.total}</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Date Selector ──────────────────────────────────────────── */
function DateSelector({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const options = [
    { key: 7, label: "7 Days" },
    { key: 30, label: "30 Days" },
    { key: 90, label: "90 Days" },
  ];
  return (
    <div className="flex items-center gap-1 rounded-lg border border-neutral-200 p-1">
      {options.map((opt) => (
        <button
          key={opt.key}
          onClick={() => onChange(opt.key)}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            value === opt.key ? "bg-black text-white" : "text-neutral-500 hover:text-neutral-800"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/* ─── Empty State ────────────────────────────────────────────── */
function EmptyState() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center text-center py-20">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
          <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          <path d="M12 8v4l2 2" />
        </svg>
      </div>
      <h3 className="text-xl font-semibold text-neutral-900 mb-2">No analytics yet</h3>
      <p className="text-sm text-neutral-500 max-w-sm">
        Connect social media channels from the <strong>Apps</strong> tab to see performance analytics here.
      </p>
      <p className="mt-3 text-xs text-neutral-400">
        Supported: Instagram, LinkedIn, X / Twitter, YouTube, Facebook, TikTok, Reddit, Pinterest, Threads
      </p>
    </div>
  );
}

/* ─── Format number for display ──────────────────────────────── */
function formatTotal(value: number): string {
  if (value >= 1_000_000) return (value / 1_000_000).toFixed(1) + "M";
  if (value >= 1_000) return (value / 1_000).toFixed(1) + "K";
  return value.toLocaleString();
}

/* ─── Convert API metrics to display metrics ─────────────────── */
function apiToDisplayMetrics(
  apiMetrics: Array<{ label: string; total: number; change: number }>,
): AnalyticsMetric[] {
  return apiMetrics.map((m) => ({
    label: m.label,
    data: [m.total],
    total: formatTotal(m.total),
    change: m.change,
  }));
}

/* ─── Main Analytics View ────────────────────────────────────── */
type AnalyticsViewProps = {
  toolkits: ToolkitConnection[];
  userId?: string | null;
};

type FetchState = "idle" | "loading" | "done" | "error";

export function AnalyticsView({ toolkits, userId }: AnalyticsViewProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [dateRange, setDateRange] = useState(7);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [fetchState, setFetchState] = useState<FetchState>("idle");
  const [liveMetrics, setLiveMetrics] = useState<AnalyticsMetric[] | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [usingMock, setUsingMock] = useState(false);
  const cacheRef = useRef<Record<string, { metrics: AnalyticsMetric[]; ts: number }>>({}); 

  const socialToolkits = useMemo(() => {
    return toolkits.filter((t) =>
      SOCIAL_PLATFORMS.some((p) => t.slug.toLowerCase().includes(p))
    );
  }, [toolkits]);

  const connectedToolkits = useMemo(() => {
    return socialToolkits.filter((t) => t.isConnected);
  }, [socialToolkits]);

  const currentPlatform = connectedToolkits[selectedIndex] ?? null;

  const platformKey = useMemo(() => {
    if (!currentPlatform) return null;
    return SOCIAL_PLATFORMS.find((p) =>
      currentPlatform.slug.toLowerCase().includes(p)
    ) ?? null;
  }, [currentPlatform]);

  const mockMetrics = useMemo(() => {
    return platformKey ? MOCK_METRICS[platformKey] ?? [] : [];
  }, [platformKey]);

  const fetchAnalytics = useCallback(
    async () => {
      if (!platformKey || !userId) return;

      const cacheKey = `${platformKey}-${dateRange}`;
      const cached = cacheRef.current[cacheKey];
      if (cached && Date.now() - cached.ts < 5 * 60 * 1000) {
        setLiveMetrics(cached.metrics);
        setUsingMock(false);
        setFetchState("done");
        return;
      }

      setFetchState("loading");
      setFetchError(null);

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25_000);

      try {
        const res = await fetch(
          `/api/analytics/${platformKey}?userId=${encodeURIComponent(userId)}&days=${dateRange}`,
          { signal: controller.signal },
        );
        clearTimeout(timeout);

        let data: any;
        try {
          data = await res.json();
        } catch {
          throw new Error(`Server returned non-JSON response (HTTP ${res.status})`);
        }

        if (!res.ok || !data.metrics || data.metrics.length === 0) {
          const errMsg = data?.error || `No metrics returned (HTTP ${res.status})`;
          setFetchError(errMsg);
          setLiveMetrics(null);
          setUsingMock(true);
          setFetchState("done");
          return;
        }

        const converted = apiToDisplayMetrics(data.metrics);
        cacheRef.current[cacheKey] = { metrics: converted, ts: Date.now() };
        setLiveMetrics(converted);
        setUsingMock(false);
        setFetchState("done");
      } catch (err) {
        clearTimeout(timeout);
        const msg = err instanceof DOMException && err.name === "AbortError"
          ? "Request timed out (25s). The platform API may be slow."
          : err instanceof Error ? err.message : "Fetch failed";
        console.error("Analytics fetch failed:", msg);
        setFetchError(msg);
        setLiveMetrics(null);
        setUsingMock(true);
        setFetchState("error");
      }
    },
    [platformKey, userId, dateRange],
  );

  /* Reset live metrics when switching platform (show mock immediately) */
  useEffect(() => {
    setLiveMetrics(null);
    setUsingMock(true);
    setFetchState("idle");
    setFetchError(null);
  }, [platformKey, dateRange]);

  const metrics = liveMetrics ?? mockMetrics;
  const isLoading = fetchState === "loading";

  if (!connectedToolkits.length) {
    return (
      <div className="flex h-full">
        <EmptyState />
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* ─ Left Sidebar: Channels ─ */}
      <div
        className={`shrink-0 border-r border-neutral-200 bg-neutral-50 transition-all ${
          sidebarCollapsed ? "w-[72px]" : "w-[240px]"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-4">
          {!sidebarCollapsed && (
            <h3 className="text-sm font-semibold text-neutral-900">Channels</h3>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="flex h-6 w-6 items-center justify-center rounded-md bg-neutral-200/70 text-neutral-500 hover:bg-neutral-300 transition-colors"
          >
            <svg width="7" height="13" viewBox="0 0 7 13" fill="none" className={sidebarCollapsed ? "rotate-180" : ""}>
              <path d="M6 11.5L1 6.5L6 1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className="flex flex-col gap-1 px-2">
          {connectedToolkits.map((toolkit, idx) => {
            const isActive = idx === selectedIndex;
            const logo = toolkit.logo || platformLogo(toolkit.slug);
            return (
              <button
                key={toolkit.slug}
                onClick={() => setSelectedIndex(idx)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 transition-all ${
                  isActive
                    ? "bg-white shadow-sm border border-neutral-200"
                    : "opacity-40 hover:opacity-100 hover:bg-white/60"
                } ${sidebarCollapsed ? "justify-center" : ""}`}
              >
                <div className="relative shrink-0">
                  {logo ? (
                    <img src={logo} alt={toolkit.name} className="h-9 w-9 rounded-lg" />
                  ) : (
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-neutral-200 text-xs font-bold text-neutral-600">
                      {toolkit.slug.slice(0, 2).toUpperCase()}
                    </div>
                  )}
                </div>
                {!sidebarCollapsed && (
                  <span className="truncate text-sm font-medium text-neutral-800">
                    {toolkit.name}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Show unconnected social platforms */}
        {socialToolkits.filter((t) => !t.isConnected).length > 0 && (
          <>
            {!sidebarCollapsed && (
              <div className="mt-6 px-4">
                <p className="text-[10px] font-medium uppercase tracking-wider text-neutral-400 mb-2">
                  Not connected
                </p>
              </div>
            )}
            <div className="flex flex-col gap-1 px-2">
              {socialToolkits
                .filter((t) => !t.isConnected)
                .map((toolkit) => {
                  const logo = toolkit.logo || platformLogo(toolkit.slug);
                  return (
                    <div
                      key={toolkit.slug}
                      className={`flex items-center gap-3 rounded-lg px-3 py-2 opacity-20 ${
                        sidebarCollapsed ? "justify-center" : ""
                      }`}
                    >
                      <div className="shrink-0">
                        {logo ? (
                          <img src={logo} alt={toolkit.name} className="h-8 w-8 rounded-lg grayscale" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-200 text-xs font-bold text-neutral-500">
                            {toolkit.slug.slice(0, 2).toUpperCase()}
                          </div>
                        )}
                      </div>
                      {!sidebarCollapsed && (
                        <span className="truncate text-xs text-neutral-400">{toolkit.name}</span>
                      )}
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </div>

      {/* ─ Main Content: Analytics Cards ─ */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-5xl">
          {/* Header */}
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-neutral-900">
                {currentPlatform?.name ?? "Analytics"}
              </h2>
              <p className="text-sm text-neutral-500 mt-0.5">
                Performance overview for the last {dateRange} days
              </p>
            </div>
            <DateSelector value={dateRange} onChange={setDateRange} />
          </div>

          {/* Analytics Grid (Postiz layout) */}
          {metrics.length > 0 ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {metrics.map((metric, i) => (
                  <AnalyticsCard key={metric.label} metric={metric} index={i} />
                ))}
              </div>

              {/* Status bar */}
              {isLoading ? (
                <div className="mt-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
                  <p className="text-xs text-blue-700">
                    Fetching live data from {currentPlatform?.name} via Composio… this may take up to 25 seconds.
                  </p>
                </div>
              ) : !usingMock && liveMetrics ? (
                <div className="mt-6 flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
                  <p className="text-xs text-emerald-700">
                    Live data from {currentPlatform?.name} via Composio
                  </p>
                  <button
                    onClick={fetchAnalytics}
                    className="shrink-0 rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-800 hover:bg-emerald-200 transition-colors"
                  >
                    Refresh
                  </button>
                </div>
              ) : (
                <div className="mt-6 flex items-center justify-between rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3">
                  <div>
                    <p className="text-xs font-medium text-neutral-600">
                      Showing sample data{fetchError ? " — last fetch: " + fetchError : ""}
                    </p>
                    <p className="text-xs text-neutral-400">
                      Click "Fetch Live Data" to pull real metrics from the connected platform.
                    </p>
                  </div>
                  <button
                    onClick={fetchAnalytics}
                    disabled={isLoading}
                    className="shrink-0 rounded-md bg-black px-3 py-1.5 text-xs font-medium text-white hover:bg-neutral-800 disabled:opacity-50 transition-colors"
                  >
                    Fetch Live Data
                  </button>
                </div>
              )}
            </>
          ) : !isLoading ? (
            <div className="flex flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white py-16">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-neutral-100">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
                  <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  <path d="M12 8v4l2 2" />
                </svg>
              </div>
              <p className="text-sm text-neutral-500">
                Analytics data will appear here once connected.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

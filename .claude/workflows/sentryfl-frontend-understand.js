export const meta = {
  name: 'sentryfl-frontend-understand',
  description: 'Map SentryFL frontend + backend event flow to plan a full redesign with live experiment progress',
  phases: [{ title: 'Read', detail: 'parallel readers over UI, state, backend events, styling' }],
}

const SCHEMA = {
  type: 'object',
  properties: {
    subsystem: { type: 'string' },
    summary: { type: 'string', description: '3-6 sentence overview of this subsystem as it exists today' },
    findings: {
      type: 'array',
      description: 'Concrete, source-verified facts a redesigner needs',
      items: {
        type: 'object',
        properties: {
          topic: { type: 'string' },
          detail: { type: 'string', description: 'Specific fact, include exact names/signatures/event strings where relevant' },
          file: { type: 'string' },
        },
        required: ['topic', 'detail'],
      },
    },
    liveProgress: {
      type: 'string',
      description: 'Everything relevant to whether/how live experiment progress reaches the user (event names on each hop, mismatches, gaps). Empty string if not applicable to this subsystem.',
    },
    reusable: { type: 'array', items: { type: 'string' }, description: 'Components/utilities/endpoints worth keeping in a redesign' },
    weaknesses: { type: 'array', items: { type: 'string' }, description: 'Visual, UX, or functional weaknesses relevant to the redesign' },
  },
  required: ['subsystem', 'summary', 'findings', 'liveProgress', 'reusable', 'weaknesses'],
}

phase('Read')

const READERS = [
  {
    label: 'backend-event-flow',
    prompt: `You are mapping the SentryFL Node API server to find the ROOT CAUSE of "when I run experiments in the dashboard I see nothing / no sign a process is running."
Read these files fully:
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\index.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\websocket\\index.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\routes\\experiments.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\routes\\internal.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\services\\pythonBackend.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\api-server\\src\\services\\backendProxy.js
Answer precisely:
1. How does starting an experiment from the dashboard work end-to-end? Which HTTP route, what does it do, does it actually launch the Python training process or just create a DB record?
2. What Socket.IO events does the server EMIT to clients, with EXACT event-name strings and payload shape? Which room/namespace? How does a client subscribe (event name for join)?
3. How does progress from the Python backend get back to the API server and then to the socket (internal route? polling? does anything actually push per-round updates)? Is there any real-time push at all, or is the pipeline broken/absent?
4. List the EXACT emitted event names so I can compare them to the frontend listeners.
Report exact strings. If the live-progress pipeline is broken or missing a hop, say exactly where.`,
  },
  {
    label: 'frontend-main-pages',
    prompt: `Map the SentryFL React dashboard's main pages as they exist today (for a full visual+UX redesign).
Read fully:
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\Dashboard.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\ExperimentList.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\ExperimentDetail.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\NewExperiment.jsx
For each page report: what it renders (layout + MUI components), what data it loads and from where, and specifically the "create/run experiment" flow (what NewExperiment submits, where the user lands after, and whether ExperimentDetail shows any live/running status or progress). Note visual/UX weaknesses (generic MUI look, no loading/running feedback, empty states, spacing). Quote key JSX structure briefly.`,
  },
  {
    label: 'frontend-state-api',
    prompt: `Map the SentryFL dashboard's Redux state and API layer (for a redesign that must surface live experiment progress).
Read fully:
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\api\\client.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\store\\slices\\experimentsSlice.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\store\\slices\\metricsSlice.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\store\\slices\\notificationsSlice.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\store\\index.js
Report: every API endpoint the client calls (method + path + purpose), all async thunks and their states (pending/fulfilled/rejected) in each slice, the shape of experiment + metric state, how live websocket metrics are stored (addTrainingMetric/addPrivacyMetric reducers) and how experiment status is updated. Note the exact experiment "status" values used (running/completed/failed/etc). Identify selectors available for building a live dashboard.`,
  },
  {
    label: 'frontend-components-charts',
    prompt: `Inventory the SentryFL dashboard's reusable components and charts (for a redesign — what to keep, what to restyle).
Read fully:
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\index.js
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\TrainingMetricsChart.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\PrivacyBudgetGauge.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\CommunicationCostChart.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\CommunicationEfficiencyMetrics.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\MIAVisualization.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\AnomalyScoreAnalysis.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\LoadingSpinner.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\utils\\chartConfig.js
For each: what props it takes, what it renders, whether it depends on chart.js/react-chartjs-2, and whether it can be reused as-is or needs restyling. Note anything that would help build a "live experiment progress" view (charts that append points, gauges).`,
  },
  {
    label: 'frontend-shell-style',
    prompt: `Assess the SentryFL dashboard's app shell, theming, and styling (for a full visual redesign).
Read fully:
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\index.css
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\App.css
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\main.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\Login.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\Register.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\pages\\Settings.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\NotificationToast.jsx
- C:\\Users\\LENOVO\\kmit\\SentryFL\\dashboard\\src\\components\\OfflineIndicator.jsx
Report: the current MUI theme setup (colors, typography, defaults) and any global CSS, whether there is any dark mode, the visual quality of Login/Register/Settings, and concrete reasons the UI "doesn't look good" (default palette, no design tokens, flat cards, cramped spacing, inconsistent components). List what a redesign theme should establish (palette, typography scale, spacing, elevation, component defaults).`,
  },
]

const results = await parallel(READERS.map(r => () => agent(r.prompt, { label: r.label, phase: 'Read', schema: SCHEMA })))
return results.filter(Boolean)

export const adminOverviewStats = [
  {
    label: "Total Users",
    value: "1060",
    note: "Registered in system",
  },
  {
    label: "Active Users",
    value: "184",
    note: "Logged in today",
  },
  {
    label: "Active States",
    value: "20",
    note: "With activities this week",
  },
  {
    label: "Pending Actions",
    value: "10",
    note: "Last updated: 25 mins ago",
  },
];

export const adminRecentUsers = [
  {
    name: "Khaled Rahman",
    role: "State Administrator",
    state: "Borno",
    action: "Approved Users",
    lastSeen: "08:13 AM",
  },
  {
    name: "Josh Omoniyi",
    role: "State Administrator",
    state: "Ekiti",
    action: "Account Login",
    lastSeen: "07:48 AM",
  },
  {
    name: "Akpan Obiereme",
    role: "State Admin",
    state: "Cross-River",
    action: "Account Login",
    lastSeen: "07:16 AM",
  },
  {
    name: "Maryam Gana",
    role: "State Administrator",
    state: "Kaduna",
    action: "Approved Users",
    lastSeen: "06:54 AM",
  },
  {
    name: "Esosa Ehiana",
    role: "State Admin",
    state: "Edo",
    action: "Account Login",
    lastSeen: "06:30 AM",
  },
];

export const adminPendingActions = [
  { item: "User Approvals", count: 10, action: "View" },
  { item: "Role Assignments", count: 26, action: "View" },
  { item: "Repeated Login Attempts", count: 4, action: "View" },
  { item: "Inactive Admin Accounts", count: 32, action: "View" },
  { item: "Pending Support Requests", count: 12, action: "View" },
];

export const stateActivity = [
  { state: "Abia", value: 136 },
  { state: "Benue", value: 118 },
  { state: "Akwa Ibom", value: 72 },
  { state: "Ebonyi", value: 61 },
  { state: "Adamawa", value: 39 },
  { state: "Delta", value: 28 },
  { state: "Bauchi", value: 16 },
  { state: "Edo", value: 11 },
];

export const userSummaryCards = [
  {
    label: "System Admins",
    value: "3",
    note: "Platform control",
  },
  {
    label: "Ministers",
    value: "4",
    note: "Federal access",
  },
  {
    label: "State Admins",
    value: "71",
    note: "Assigned states",
  },
  {
    label: "Pending Invites",
    value: "23",
    note: "Awaiting setup",
  },
];

export const userRows = [
  {
    name: "Oladele Majekodunmi",
    email: "admin@nedi.gov.ng",
    role: "System Admin",
    state: "Federal",
    status: "Active",
    invite: "Completed",
  },
  {
    name: "Dr. Tunji Alausa",
    email: "minister@nedi.gov.ng",
    role: "Minister",
    state: "Federal",
    status: "Active",
    invite: "Completed",
  },
  {
    name: "Amina Sani",
    email: "stateadmin.kaduna@nedi.gov.ng",
    role: "State Admin",
    state: "Kaduna",
    status: "Active",
    invite: "Completed",
  },
  {
    name: "Ifeanyi Okeke",
    email: "stateadmin.anambra@nedi.gov.ng",
    role: "State Admin",
    state: "Anambra",
    status: "Pending",
    invite: "Expires in 2 days",
  },
  {
    name: "Ruth Bassey",
    email: "stateadmin.crossriver@nedi.gov.ng",
    role: "State Admin",
    state: "Cross River",
    status: "Inactive",
    invite: "Expired",
  },
  {
    name: "Tajudeen Lawal",
    email: "stateadmin.kwara@nedi.gov.ng",
    role: "State Admin",
    state: "Kwara",
    status: "Active",
    invite: "Completed",
  },
];

export const inviteQueueRows = [
  {
    name: "Ifeanyi Okeke",
    state: "Anambra",
    status: "Pending",
    expires: "2 days",
  },
  {
    name: "Ruth Bassey",
    state: "Cross River",
    status: "Expired",
    expires: "Resend needed",
  },
  {
    name: "Josephine Ali",
    state: "Taraba",
    status: "Pending",
    expires: "1 day",
  },
  {
    name: "Bello Musa",
    state: "Kano",
    status: "Pending",
    expires: "4 days",
  },
];

export const activitySummaryCards = [
  { label: "Successful Logins", value: "294", note: "Last 24 hours" },
  { label: "Failed Logins", value: "17", note: "Needs review" },
  { label: "Password Events", value: "31", note: "Reset + setup actions" },
  { label: "Role Changes", value: "5", note: "Tracked this week" },
];

export const activityTimeline = [
  {
    title: "System Admin created a new Kaduna state admin",
    meta: "2 minutes ago",
    tone: "border-emerald-200 bg-emerald-50",
  },
  {
    title: "Invite resent to Cross River state admin",
    meta: "11 minutes ago",
    tone: "border-amber-200 bg-amber-50",
  },
  {
    title: "Password reset completed for minister account",
    meta: "23 minutes ago",
    tone: "border-sky-200 bg-sky-50",
  },
  {
    title: "Three failed logins recorded for one dormant account",
    meta: "38 minutes ago",
    tone: "border-rose-200 bg-rose-50",
  },
];

export const failedLoginRows = [
  {
    account: "stateadmin.plateau@nedi.gov.ng",
    source: "197.210.44.11",
    attempts: 3,
    lastSeen: "07:42 AM",
  },
  {
    account: "r.bassey@nedi.gov.ng",
    source: "105.112.17.89",
    attempts: 2,
    lastSeen: "07:10 AM",
  },
  {
    account: "unknown.user@nedi.gov.ng",
    source: "41.78.54.202",
    attempts: 5,
    lastSeen: "06:49 AM",
  },
];

export const auditRows = [
  {
    action: "User created",
    actor: "Oladele Majekodunmi",
    target: "Amina Sani",
    when: "Today, 09:18 AM",
  },
  {
    action: "Role updated",
    actor: "Oladele Majekodunmi",
    target: "Tajudeen Lawal",
    when: "Today, 08:31 AM",
  },
  {
    action: "Invite resent",
    actor: "Oladele Majekodunmi",
    target: "Ruth Bassey",
    when: "Yesterday, 05:14 PM",
  },
];

export const auditEventRows = [
  {
    actor: "Oladele Majekodunmi",
    action: "Created new state admin",
    target: "Kaduna",
    time: "09:18 AM",
  },
  {
    actor: "Oladele Majekodunmi",
    action: "Resent invite",
    target: "Cross River",
    time: "08:31 AM",
  },
  {
    actor: "System",
    action: "Password setup completed",
    target: "Minister account",
    time: "08:04 AM",
  },
  {
    actor: "System",
    action: "Login attempt flagged",
    target: "Dormant account",
    time: "07:49 AM",
  },
];

export const systemHealthCards = [
  {
    label: "Backend API",
    status: "Healthy",
    note: "Response time normal",
  },
  {
    label: "ClickHouse",
    status: "Connected",
    note: "Live connection",
  },
  {
    label: "Email Delivery",
    status: "Partial",
    note: "2 pending retries",
  },
  {
    label: "Pipelines",
    status: "Monitoring",
    note: "Last run 06:40 AM",
  },
];

export const serverActions = [
  {
    name: "Daily KPI aggregation",
    service: "Pipeline",
    state: "Completed",
    time: "06:40 AM",
  },
  {
    name: "Invitation email dispatch",
    service: "Mailer",
    state: "Queued",
    time: "07:15 AM",
  },
  {
    name: "Password reset mail retry",
    service: "Mailer",
    state: "Retrying",
    time: "07:29 AM",
  },
  {
    name: "User sync validation",
    service: "Backend",
    state: "Running",
    time: "07:41 AM",
  },
];

export const serviceNotes = [
  {
    title: "Recent server actions",
    body: "This panel will later hook into the real backend/system status endpoints so the admin sees what is happening without leaving the portal.",
  },
  {
    title: "Safe first version",
    body: "Everything here is read-only for now. Once the design is approved, we can decide which actions deserve buttons and which ones should stay view-only.",
  },
];

export const systemAlertRows = [
  {
    item: "Email retries",
    status: "2 pending",
    owner: "Mailer",
    action: "View",
  },
  {
    item: "Backend logs",
    status: "Normal",
    owner: "API",
    action: "View",
  },
  {
    item: "Pipeline queue",
    status: "1 running",
    owner: "Scheduler",
    action: "View",
  },
  {
    item: "Database sync",
    status: "Healthy",
    owner: "ClickHouse",
    action: "View",
  },
];

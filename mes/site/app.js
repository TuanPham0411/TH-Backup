import { revealPage, animateDashboard } from "./motion.js";
import { activitySeries, resolutionSummary } from "./analytics.js";
import { createRichEditor } from "./rich-editor.js";
import { documentText, renderDocument } from "./rich-document.js";
import { t, initializeLanguage, getLanguage } from "./i18n.js";
import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import "@fontsource/dm-sans/latin-ext-400.css";
import "@fontsource/dm-sans/latin-ext-500.css";
import "@fontsource/dm-sans/latin-ext-600.css";
import { initializeBackend, setTesterMode, api, watchAuth, ownerLogin, managedLogin, logout, watchRecords, uploadAttachment, downloadAttachment as fetchAttachment } from "./backend.js";
import { configured, previewMode } from "./config.js";
import {
  statuses,
  priorities,
  validateFiles,
  validateIssue,
  filterIssues,
  stats,
  safeUsername,
  makeDemo,
  csvCell,
  attachmentType,
} from "./model.js";
const $ = (id) => document.getElementById(id),
  el = (tag, text, cls) => {
    const n = document.createElement(tag);
    if (text !== undefined) n.textContent = text;
    if (cls) n.className = cls;
    return n;
  };
const colors = [
  "#7d94ed",
  "#aa98dc",
  "#e8be7f",
  "#e0ad96",
  "#7dbba8",
  "#aab6c7",
];
const state = {
  preview: previewMode,
  user: null,
  isOwner: false,
  ready: false,
  requiresWindows: true,
  users: [],
  leaders: [],
  departments: [],
  issues: [],
  myIssues: [],
  devices: [],
  page: "dashboard",
  selected: null,
  tablePage: 1,
  files: [],
  timeline: [],
};
let unsubscribers = [], timelineUnsubscribe, sessionGeneration = 0, toastTimer;
const callable = api;
const stamp = (v) =>
  typeof v === "number" ? v : v?.toMillis ? v.toMillis() : 0;
const date = (v) =>
  stamp(v)
    ? new Date(stamp(v)).toLocaleString(getLanguage() === "vi" ? "vi-VN" : "en-GB", {
        year: "numeric",
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const slug = (v) => String(v).toLowerCase().replace(/\s+/g, "-");
function badge(value, kind = "status") {
  return el("span", value, `badge ${kind}-${slug(value)}`);
}
function showStatus(id, message) {
  $(id).textContent = message;
}
function toast(message) {
  $("toast").textContent = message;
  $("toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ($("toast").hidden = true), 5000);
}
function errorMessage(e) {
  const c = String(e?.code || "");
  if (["invalid-credentials", "rate-limited", "password-policy"].includes(c)) return e.message;
  if (c === "owner-required") return "This Google account is not accepted as the MES owner. Use eric.scorp93@gmail.com. Reset sign-in session to switch accounts.";
  if (c === "backend-not-ready") return "Account service update required. Deploy the MES accounts SQL installer and the matching API.";
  if (c.includes("unauthenticated"))
    return "Sign in to the MES workspace first.";
  if (c.includes("permission-denied")) return "This action is not allowed. Your account may be inactive or its session may have expired. Sign in again or contact the administrator.";
  if (
    c.includes("unavailable") ||
    c.includes("not-found") ||
    c.includes("internal")
  )
    return "MES backend is not reachable or not deployed yet. Ask the owner to deploy the Supabase MES API and database migration.";
  if (c.includes("popup-closed")) return "Google sign-in was cancelled.";
  if (c.includes("unauthorized-domain"))
    return "Add this site domain to Supabase Authentication redirect URLs.";
  if (
    c.includes("failed-precondition") ||
    c.includes("invalid-argument") ||
    c.includes("already-exists") ||
    c.includes("resource-exhausted")
  )
    return (
      e.message?.replace(/^.*?: /, "") || "Check the values and try again."
    );
  return "Could not complete this action. Check the connection and try again.";
}
async function run(id, button, work) {
  if (button?.disabled) return;
  if (button) button.disabled = true;
  showStatus(id, "Working…");
  try {
    await work();
  } catch (e) {
    showStatus(id, errorMessage(e));
  } finally {
    if (button) button.disabled = false;
  }
}
function message(text) {
  $("global-message").hidden = !text;
  $("global-message").textContent = text;
}
function selectOptions(node, items, { placeholder, selected } = {}) {
  const previous = selected ?? node.value;
  node.replaceChildren();
  if (placeholder) {
    const option = el("option", placeholder);
    option.value = "";
    node.append(option);
  }
  for (const item of items) {
    const option = el("option", item.name || item.displayName || item);
    option.value = item.id || item;
    if (typeof item === "object" && !["All", ...statuses, ...priorities].includes(item.id)) option.dataset.userContent = "";
    node.append(option);
  }
  if ([...node.options].some((o) => o.value === previous))
    node.value = previous;
}
function openAccount(owner = false) {
  $("user-login-tab").setAttribute("aria-pressed", String(!owner));
  $("admin-login-tab").setAttribute("aria-pressed", String(owner));
  $("windows-login-form").hidden = true;
  $("password-login-form").hidden = !!state.user;
  $("activation-form").hidden = true;
  $("admin-login-form").hidden = !owner || !!state.user;
  $("signed-in-account").hidden = !state.user;
  showStatus("account-status", "");
  $("signed-in-summary").textContent = state.user
    ? `${state.user.displayName} · ${state.isOwner ? "MES owner" : state.user.username}`
    : "";
  $("account-dialog").showModal();
}
function requireMember() {
  if (state.preview || state.user) return true;
  openAccount();
  return false;
}
function ownerOnly() {
  if (!state.isOwner) {
    toast("Only the MES owner can change this.");
    return false;
  }
  return true;
}
function navigate(page) {
  if (page === "settings" && !state.isOwner) {
    toast("Owner access is required.");
    return;
  }
  if (["create", "profile", "my-dashboard", "my-issues"].includes(page) && !requireMember()) return;
  const section = page === "my-dashboard" ? "dashboard" : page === "my-issues" ? "issues" : page;
  state.page = page;
  document
    .querySelectorAll("main>.page")
    .forEach((s) => (s.hidden = s.id !== `${section}-page`));
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("page-crumb").textContent = {
    "my-dashboard": "My dashboard", "my-issues": "My tickets", profile: "My profile",
    dashboard: "Dashboard",
    issues: "Issue list",
    create: "Submit feedback",
    settings: "Administration",
    detail: "Issue details",
  }[page];
  $("mobile-nav").setAttribute("aria-expanded", "false");
  document.querySelector(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "instant" });
  $("dashboard-title").textContent = page === "my-dashboard" ? "My dashboard" : "Dashboard";
  $("issues-title").textContent = page === "my-issues" ? "My tickets" : "Issue list";
  if (page === "profile") populateProfile();
  $("data-scope").textContent = page === "my-dashboard" ? "Your feedback · updates every 15 seconds." : state.preview ? "Preview only · sample data, no production connection." : "All workspace feedback · updates every 15 seconds.";
  renderAll();
  if (page === "create") renderForm();
  revealPage($(`${section}-page`));
  if (section === "dashboard") animateDashboard($("dashboard-page"));
}
function renderDirectories() {
  const active = (items) => items.filter((x) => x.active !== false);
  selectOptions($("department-select"), active(state.departments), {
    placeholder: "Select department",
  });
  selectOptions($("login-user"), active(state.users), {
    placeholder: "Select your display name",
  });
  selectOptions($("issue-department"), [
    { id: "All", name: "All departments" },
    ...state.departments,
  ]);
  renderForm();
  if (state.isOwner) renderSettings();
}
function renderForm() {
  $("reporter-select").value = state.user?.displayName || "";
  $("require-windows").checked = state.requiresWindows;
  $("identity-notice").textContent = state.preview
    ? "Preview mode. Submitting creates sample feedback only in this browser session."
    : state.user
      ? `${state.user.displayName} · ${t(state.isOwner ? "Owner access" : state.user.isTester ? "Tester access" : state.requiresWindows ? "Signed Windows verification active" : "Managed user access")}. ${t("Your identity is validated by the server.")}`
      : "Sign in with the account provided by your administrator.";
  $("submit-feedback").textContent = state.preview
    ? "Create preview feedback →"
    : "Submit feedback →";
}
function scopedIssues() {
  if (!["my-dashboard", "my-issues"].includes(state.page)) return state.issues;
  return state.preview ? state.issues.filter(i => i.reporterUid === state.user?.uid) : state.myIssues;
}
function selectedPeriod() {
  const days = $("dashboard-period").value;
  return scopedIssues().filter(
    (i) =>
      days === "all" ||
      stamp(i.createdAt) >= Date.now() - Number(days) * 86400000,
  );
}
let dashboardSignature = "";
function renderDashboard() {
  const signature = JSON.stringify([state.page,state.ready,$("dashboard-period").value,scopedIssues(),state.departments]);
  const changed = signature !== dashboardSignature;
  dashboardSignature = signature;
  const issues = selectedPeriod(),
    s = stats(issues);
  $("metrics").replaceChildren();
  for (const [label, key, icon, note] of [
    ["Total feedback", "total", "☷", "Within selected reporting period"],
    ["Open issues", "open", "◷", "Awaiting resolution"],
    ["In progress", "progress", "↻", "Currently being handled"],
    ["Resolved / closed", "resolved", "✓", "Completed feedback"],
    ["Critical open", "critical", "!", "Requires attention"],
  ]) {
    const card = el("article", undefined, "metric");
    card.append(
      el("p", label, "metric-label"),
      el("span", state.ready ? String(s[key]) : "—", "metric-value"),
      el("small", note, "metric-note"),
      el("span", icon, "metric-icon"),
    );
    $("metrics").append(card);
  }
  renderActivity(scopedIssues());
  renderOperations(issues);
  renderDonut(issues);
  renderDepartments(issues);
  $("recent-issues").replaceChildren();
  const recent = [...issues]
    .sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt))
    .slice(0, 5);
  for (const issue of recent) {
    const row = el("button", undefined, "recent-row");
    row.type = "button";
    const content = el("div");
    content.append(
      userEl("h3", issue.subject),
      el("p", `${issue.departmentName} · ${issue.process}`),
    );
    row.append(el("span", "▤", "recent-icon"), content, badge(issue.status));
    row.onclick = () => openIssue(issue.id);
    $("recent-issues").append(row);
  }
  if (!recent.length)
    $("recent-issues").append(
      el(
        "p",
        state.ready
          ? "No feedback in this period."
          : "Sign in to load workspace feedback.",
        "empty",
      ),
    );
  if (changed) animateDashboard($("dashboard-page"));
}
function renderActivity(issues) {
  const counts = activitySeries(issues, $("dashboard-period").value);
  $("activity-caption").textContent = $("dashboard-period").value === "all" ? "Submissions and resolutions · full recorded history" : `Submissions and resolutions · last ${$("dashboard-period").value} days`;
  const max = Math.max(1, ...counts.flatMap((d) => [d.created, d.resolved]));
  const axis = el("div", undefined, "chart-y");
  axis.append(
    el("span", String(max)),
    el("span", max > 1 ? String(Math.floor(max / 2)) : ""),
    el("span", "0"),
  );
  const grid = el("div", undefined, "activity-grid");
  for (const d of counts) {
    const day = el("div", undefined, "activity-day"),
      bars = el("div", undefined, "activity-bars");
    for (const [name, count] of [
      ["Submitted", d.created],
      ["Resolved", d.resolved],
    ]) {
      const bar = el("span");
      bar.style.height = `${(count / max) * 100}%`;
      bar.title = `${d.day.toLocaleDateString(getLanguage() === "vi" ? "vi-VN" : "en-GB")} – ${new Date(d.end.getTime()-1).toLocaleDateString(getLanguage() === "vi" ? "vi-VN" : "en-GB")}: ${count} ${t(name)}`;
      bar.setAttribute("aria-label", bar.title);
      bar.tabIndex = 0;
      bar.dataset.tooltip = bar.title;
      bars.append(bar);
    }
    day.append(
      bars,
      el(
        "small",
        d.day.toLocaleDateString(getLanguage() === "vi" ? "vi-VN" : "en-GB", { day: "2-digit", month: "short" }),
      ),
    );
    grid.append(day);
  }
  $("activity-chart").replaceChildren(axis, grid);
}
function renderDonut(issues) {
  const counts = statuses.map(
    (s) => issues.filter((i) => i.status === s).length,
  );
  let cursor = 0;
  const stops = counts.map((v, n) => {
    const start = cursor;
    cursor += issues.length ? (v / issues.length) * 100 : 0;
    return `${colors[n]} ${start}% ${cursor}%`;
  });
  const donut = el("div", undefined, "donut");
  donut.style.background = issues.length
    ? `conic-gradient(${stops.join(",")})`
    : "#edf1f7";
  donut.setAttribute("role", "img");
  donut.setAttribute(
    "aria-label",
    statuses.map((s, n) => `${s}: ${counts[n]}`).join(", "),
  );
  const center = el(
    "div",
    state.ready ? String(issues.length) : "—",
    "donut-center",
  );
  center.append(el("small", "Total issues"));
  donut.append(center);
  const legend = el("div", undefined, "status-legend");
  statuses.forEach((s, n) => {
    const row = el("div"),
      dot = el("i");
    dot.style.background = colors[n];
    row.append(dot, el("span", s), el("strong", `${counts[n]} · ${issues.length ? Math.round(counts[n] / issues.length * 100) : 0}%`));
    legend.append(row);
  });
  $("status-chart").replaceChildren(donut, legend);
}
function renderDepartments(issues) {
  $("department-chart").replaceChildren();
  const names = new Map(state.departments.map((d) => [d.id, d.name]));
  issues.forEach((i) => names.set(i.departmentId, i.departmentName));
  const values = [...names]
    .map(([id, name]) => ({
      name,
      count: issues.filter((i) => i.departmentId === id).length,
    }))
    .sort((a, b) => b.count - a.count);
  const max = Math.max(1, ...values.map((x) => x.count));
  for (const d of values) {
    const row = el("div", undefined, "department-row"),
      head = el("div");
    head.append(userEl("span", d.name), el("span", String(d.count)));
    const track = el("div", undefined, "bar-track"),
      bar = el("div");
    bar.style.width = `${(d.count / max) * 100}%`;
    track.append(bar);
    row.append(head, track);
    $("department-chart").append(row);
  }
  if (!values.length)
    $("department-chart").append(
      el("p", "Department data will appear here.", "empty"),
    );
}
function renderOperations(issues) {
  const summary = resolutionSummary(issues);
  $("resolution-insights").replaceChildren();
  for (const [value,label,note] of [
    [`${summary.rate}%`, "Completion rate", "Resolved or closed / selected cohort"],
    [summary.averageHours === null ? "—" : summary.averageHours < 24 ? `${summary.averageHours.toFixed(1)}h` : `${(summary.averageHours/24).toFixed(1)}d`, "Average resolution", "Completed tickets with recorded timestamps"],
    [String(summary.aged), "Aging backlog", "Unresolved for 7 days or longer"],
  ]) {
    const item=el("div",undefined,"insight");
    item.append(el("strong",state.ready ? value : "—"),el("span",label),el("small",note));
    $("resolution-insights").append(item);
  }
  $("priority-chart").replaceChildren();
  const max=Math.max(1,...priorities.map(p=>summary.pending.filter(i=>i.priority===p).length));
  for(const priority of [...priorities].reverse()) {
    const count=summary.pending.filter(i=>i.priority===priority).length;
    const row=el("div",undefined,"department-row");
    const head=el("div"); head.append(badge(priority,"priority"),el("strong",String(count)));
    const track=el("div",undefined,"bar-track"); const bar=el("div");
    bar.style.width=`${count/max*100}%`; bar.dataset.priority=priority;
    track.append(bar); row.append(head,track); $("priority-chart").append(row);
  }
  $("priority-empty").hidden = summary.pending.length > 0;
}
function filtered() {
  return filterIssues(scopedIssues(), {
    search: $("issue-search").value,
    status: $("issue-status").value || "All",
    department: $("issue-department").value || "All",
    priority: $("issue-priority").value || "All",
  }).sort((a, b) => stamp(b.updatedAt) - stamp(a.updatedAt));
}
function renderIssues() {
  const issues = filtered(),
    pageSize = 12,
    totalPages = Math.max(1, Math.ceil(issues.length / pageSize));
  state.tablePage = Math.min(state.tablePage, totalPages);
  $("issue-rows").replaceChildren();
  for (const i of issues.slice(
    (state.tablePage - 1) * pageSize,
    state.tablePage * pageSize,
  )) {
    const row = el("tr");
    row.dataset.id = i.id;
    const title = el("td");
    const link = userEl("button", i.subject, "issue-title-button");
    link.onclick = () => openIssue(i.id);
    title.append(link, el("small", i.id.slice(0, 12).toUpperCase()));
    const department = el("td");
    department.append(userEl("strong", i.departmentName), userEl("small", i.process));
    const reporter = userEl("td", i.reporterName),
      priority = el("td"),
      status = el("td");
    priority.append(badge(i.priority, "priority"));
    status.append(badge(i.status));
    const open = el("td"),
      button = el("button", "↗", "text-button");
    button.setAttribute("aria-label", `Open ${i.subject}`);
    button.onclick = () => openIssue(i.id);
    open.append(button);
    row.append(
      title,
      department,
      reporter,
      priority,
      status,
      el("td", date(i.updatedAt)),
      open,
    );
    $("issue-rows").append(row);
  }
  if (!issues.length) {
    const td = el("td", "No feedback matches the current filters.", "empty");
    td.colSpan = 7;
    const row = el("tr");
    row.append(td);
    $("issue-rows").append(row);
  }
  const footer = el(
      "span",
      `${issues.length} issue(s) · Page ${state.tablePage} of ${totalPages}`,
    ),
    controls = el("div");
  for (const [text, offset] of [
    ["Previous", -1],
    ["Next", 1],
  ]) {
    const b = el("button", text, "button");
    b.disabled =
      offset < 0 ? state.tablePage === 1 : state.tablePage === totalPages;
    b.onclick = () => {
      state.tablePage += offset;
      renderIssues();
    };
    controls.append(b);
  }
  $("issue-pagination").replaceChildren(footer, controls);
}
function renderAll() {
  renderDashboard();
  renderIssues();
  $("nav-count").textContent = String(state.issues.length);
  if (state.selected) {
    const issue = state.issues.find((i) => i.id === state.selected);
    if (issue) renderDetail(issue);
    else if (state.page === "detail") navigate("issues");
  }
}
function openIssue(id) {
  state.selected = id;
  const issue = state.issues.find((i) => i.id === id);
  if (!issue) return;
  navigate("detail");
  renderDetail(issue);
  if (timelineUnsubscribe) timelineUnsubscribe();
  if (state.preview) {
    state.timeline = issue.timeline || [];
    renderTimeline();
  } else {
    state.timeline = [];
    renderTimeline();
    timelineUnsubscribe = watchRecords(`issues/${id}/timeline`, (rows) => {
      if (state.selected !== id) return;
      state.timeline = rows;
      renderTimeline();
    }, (e) => showStatus("comment-status", errorMessage(e)), "asc");
  }
}
function renderDetail(issue) {
  const heading = el("div");
  heading.append(
    el("p", issue.id.toUpperCase(), "eyebrow"),
    userEl("h1", issue.subject),
    el(
      "p",
      `${t("Submitted")} ${date(issue.createdAt)} · ${issue.reporterName}`,
      "subtitle",
    ),
  );
  $("detail-heading").replaceChildren(heading, badge(issue.status));
  const data = el("div", undefined, "detail-data");
  for (const [label, value] of [
    ["Requester", issue.reporterName],
    ["Department", issue.departmentName],
    ["Process / Station", issue.process],
  ]) {
    const d = el("div");
    d.append(el("small", label), userEl("span", value));
    data.append(d);
  }
  const attachments = el("div");
  attachments.append(el("h3", "Attachments"));
  const gallery = el("div", undefined, "attachment-gallery");
  for (const f of issue.attachments || []) {
    const card = el("article", undefined, "attachment-card");
    if (["image/jpeg", "image/png", "image/webp"].includes(f.type)) {
      const button = el("button", undefined, "image-thumbnail");
      button.type = "button";
      button.setAttribute("aria-label", `${t("View image")}: ${f.name}`);
      const image = document.createElement("img");
      image.alt = f.name; image.loading = "lazy";
      const hint = el("span", "Loading image…", "image-hint");
      button.append(image, hint);
      imageUrl(f).then(url => { if (button.isConnected) { image.src = url; hint.textContent = t("Click to enlarge"); } }).catch(() => { hint.textContent = t("Image unavailable. Click to retry."); });
      button.onclick = () => openImage(f);
      card.append(button);
    }
    const row = el("div", undefined, "file-row"), button = el("button", state.preview ? "Preview file" : "Download", "text-button");
    button.onclick = () => downloadAttachment(f);
    row.append(userEl("span", `${f.name} · ${(f.size / 1024).toFixed(0)} KB`), button);
    card.append(row); gallery.append(card);
  }
  attachments.append(gallery);
  if (!issue.attachments?.length)
    attachments.append(el("p", "No attachments.", "helper"));
  $("detail-content").replaceChildren(
    el("h2", "Feedback details"),
    data,
    reportBody(issue),
    renderOccurrences(issue.occurrences || []),
    attachments,
  );
  if (!$("handling-form").contains(document.activeElement)) {
    $("handling-status").value = issue.status;
    $("handling-priority").value = issue.priority;
    $("handling-assessment").value = issue.assessment || "";
    $("handling-note").value = "";
  }
  for (const control of $("handling-form").querySelectorAll(
    "input,textarea,select,button",
  ))
    control.disabled = !state.isOwner;
  $("save-handling").hidden = !state.isOwner;
  $("comment-form").hidden = !state.isOwner;
  $("admin-issue-actions").hidden = !state.isOwner;
  $("detail-meta").replaceChildren(
    el("small", "REPORTER"),
    el(
      "p",
      `${issue.reporterName} / ${issue.reporterUsername || "managed user"}`,
    ),
    el("small", "CREATED"),
    el("p", date(issue.createdAt)),
    el("small", "LAST UPDATE"),
    el("p", date(issue.updatedAt)),
    el("small", "OWNER ASSESSMENT"),
    el("p", issue.assessment || "No assessment recorded yet."),
  );
}
function timelineText(event) {
  if (getLanguage() === "en") return event.text;
  if (["created", "edit"].includes(event.kind) && ["Feedback submitted.", "Owner edited the feedback details."].includes(event.text)) return t(event.text);
  if (event.kind === "attachments" && /^\d+ attachment\(s\) added\.$/.test(event.text)) return `${event.text.match(/^\d+/)[0]} tệp đính kèm được thêm.`;
  if (event.kind === "handling") return event.text.replace(/^Status: (.+?) → (.+?)\. Priority: (.+?) → (.+?)\./, (_text,a,b,c,d) => `${t("Status")}: ${t(a)} → ${t(b)}. ${t("Priority")}: ${t(c)} → ${t(d)}.`);
  return event.text;
}
function renderTimeline() {
  $("issue-timeline").replaceChildren();
  for (const event of [...state.timeline].sort(
    (a, b) => stamp(a.createdAt) - stamp(b.createdAt),
  )) {
    const row = el("div", undefined, "timeline-event");
    row.append(
      userEl("strong", event.author),
      el("small", date(event.createdAt)),
      userEl("p", timelineText(event)),
    );
    if (event.before && event.after) {
      const details = el("details", undefined, "audit-details");
      details.append(el("summary", "View edit changes"));
      for (const key of ["subject", "process", "description"]) {
        if (event.before[key] === event.after[key]) continue;
        details.append(
          el("strong", { subject: "Subject", process: "Process", description: "Description" }[key]),
          userEl("p", `${t("Before")}: ${event.before[key]}`),
          userEl("p", `${t("After")}: ${event.after[key]}`),
        );
      }
      if (JSON.stringify(event.before.richDocument || null) !== JSON.stringify(event.after.richDocument || null)) details.append(el("p", "Formatting or inline images updated."));
      row.append(details);
    }
    $("issue-timeline").append(row);
  }
  if (!state.timeline.length)
    $("issue-timeline").append(
      el("p", "No timeline entries loaded yet.", "empty"),
    );
}
async function downloadAttachment(file) {
  if (state.preview) {
    toast("Attachments in preview mode are not uploaded.");
    return;
  }
  try {
    const blob = await fetchAttachment(file.path);
    const url = URL.createObjectURL(blob),
      a = el("a");
    a.href = url;
    a.download = file.name.replace(/[\\/]/g, "_");
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (e) {
    toast(errorMessage(e));
  }
}
function renderSettings() {
  for (const [items, listId, type] of [
    [state.leaders, "leader-list", "teamLeaders"],
    [state.departments, "department-list", "departments"],
  ]) {
    const list = $(listId);
    list.replaceChildren();
    for (const item of items) {
      const row = el("div", undefined, "directory-row"),
        edit = el("button", "Edit", "text-button"),
        toggle = el(
          "button",
          item.active ? "Deactivate" : "Restore",
          "text-button",
        );
      edit.onclick = async () => {
        const name = window.prompt("Update name", item.name);
        if (!name?.trim()) return;
        await run("settings-status", edit, async () => {
          if (state.preview) item.name = name.trim();
          else
            await callable("manageDirectory", {
              type,
              operation: "update",
              id: item.id,
              name: name.trim(),
            });
          renderDirectories();
          showStatus(
            "settings-status",
            state.preview ? "Preview directory updated." : "Directory updated.",
          );
        });
      };
      toggle.onclick = () =>
        run("settings-status", toggle, async () => {
          if (state.preview) item.active = !item.active;
          else
            await callable("manageDirectory", {
              type,
              operation: "deactivate",
              id: item.id,
              active: !item.active,
            });
          renderDirectories();
          showStatus(
            "settings-status",
            "Directory updated. Historical feedback keeps its original label.",
          );
        });
      row.append(
        el("span", item.name),
        badge(item.active ? "Active" : "Inactive", "state"),
        edit,
        toggle,
      );
      list.append(row);
    }
    if (!items.length)
      list.append(
        el("p", "No entries yet. Add the first one above.", "helper"),
      );
  }
  $("user-rows").replaceChildren();
  for (const u of state.users) {
    const row = el("tr");
    row.append(el("td", u.displayName), el("td", u.username));
    const active = el("td");
    active.append(badge(u.active ? "Active" : "Inactive", "state"));
    const controls = el("td"),
      edit = el("button", "Edit", "text-button"),
      toggle = el("button", u.active ? "Deactivate" : "Restore", "text-button");
    edit.onclick = () => openUserAdmin(u);
    const nameButton = el("button", u.displayName, "text-button account-name");
    nameButton.onclick = () => openUserAdmin(u);
    nameButton.disabled = ["mes-owner", "mes-tester"].includes(u.id);
    row.firstChild.replaceChildren(nameButton);
    toggle.onclick = () =>
      run("settings-status", toggle, async () => {
        if (state.preview) u.active = !u.active;
        else
          await callable("manageUser", {
            operation: "deactivate",
            uid: u.id,
            active: !u.active,
          });
        renderDirectories();
        showStatus("settings-status", "User access updated.");
      });
    const reset = el("button", "New activation link", "text-button");
    reset.onclick = () => {
      if (!confirm(t("Reset this account? Its current password and sessions will be revoked."))) return;
      run("settings-status", reset, async () => {
        if (state.preview) { toast("Preview only. No activation link was issued."); return; }
        displayActivation(await callable("resetUserActivation", { uid: u.id }));
        await refreshAccounts();
        $("activation-result").scrollIntoView({block:"center",behavior:matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth"});
        showStatus("settings-status", "Activation link ready. Share it privately with the user.");
      });
    };
    if (u.accountState === "pending") active.append(badge("Pending activation", "state"));
    edit.disabled = toggle.disabled = reset.disabled = ["mes-owner", "mes-tester"].includes(u.id);
    reset.disabled ||= !u.active;
    controls.append(edit, document.createTextNode(" · "), toggle, document.createTextNode(" · "), reset);
    row.append(active, controls);
    $("user-rows").append(row);
  }
}
let editingUser;
function openUserAdmin(user) {
  if (!state.isOwner || ["mes-owner", "mes-tester"].includes(user.id)) return;
  editingUser = user;
  for (const [id, key] of [["admin-username","username"],["admin-name","displayName"],["admin-email","email"],["admin-phone","phone"],["admin-title","jobTitle"]]) $(id).value = user[key] || "";
  $("admin-toggle").textContent = user.active ? "Deactivate" : "Restore";
  $("admin-reset").disabled = !user.active;
  $("admin-activation").hidden = true;
  $("admin-activation-link").value = "";
  $("user-admin-status").textContent = "";
  $("user-admin-dialog").showModal();
}
async function refreshAccounts() {
  if (!state.preview) state.users = (await callable("read", {path:"users"})).rows;
  renderSettings();
}
$("user-admin-form").onsubmit = e => {
  e.preventDefault();
  run("user-admin-status", e.currentTarget.querySelector("button"), async () => {
    const data = {operation:"update", uid:editingUser.id, username:$("admin-username").value.trim().toLowerCase(), displayName:$("admin-name").value.trim(), email:$("admin-email").value.trim(), phone:$("admin-phone").value.trim(), jobTitle:$("admin-title").value.trim()};
    if (state.preview) Object.assign(editingUser,data); else await callable("manageUser",data);
    await refreshAccounts(); showStatus("user-admin-status","Account saved.");
  });
};
$("admin-reset").onclick = () => {
  if (!confirm(t("Reset this account? Its current password and sessions will be revoked."))) return;
  run("user-admin-status",$("admin-reset"),async () => {
    if (state.preview) { toast("Preview only. No activation link was issued."); return; }
    const result = await callable("resetUserActivation",{uid:editingUser.id});
    displayActivation(result);
    $("admin-activation-link").value = $("activation-link").value;
    $("admin-activation").hidden = false;
    await refreshAccounts(); showStatus("user-admin-status","New activation link ready.");
  });
};
$("admin-copy").onclick = () => run("user-admin-status",$("admin-copy"),async () => { await navigator.clipboard.writeText($("admin-activation-link").value); toast("Activation link copied."); });
$("admin-toggle").onclick = () => run("user-admin-status",$("admin-toggle"),async () => {
  if (!state.preview) await callable("manageUser",{operation:"deactivate",uid:editingUser.id,active:!editingUser.active});
  editingUser.active=!editingUser.active; await refreshAccounts(); $("user-admin-dialog").close();
});
$("admin-delete").onclick = () => {
  if (!confirm(`Delete account ${editingUser.username}? This cannot be undone. Historical feedback will be preserved.`)) return;
  run("user-admin-status",$("admin-delete"),async () => {
    if (!state.preview) await callable("manageUser",{operation:"delete",uid:editingUser.id});
    else state.users=state.users.filter(u=>u.id!==editingUser.id);
    await refreshAccounts(); $("user-admin-dialog").close(); showStatus("settings-status","Account deleted. Historical feedback preserved.");
  });
};
async function loadDevices() {
  if (!state.isOwner) return;
  try {
    if (!state.preview) state.devices = (await callable("listDevices")).devices;
    renderDevices();
  } catch (e) {
    showStatus("settings-status", errorMessage(e));
  }
}
function renderDevices() {
  $("device-list").replaceChildren();
  for (const device of state.devices) {
    const row = el("div", undefined, "directory-row"),
      revoke = el(
        "button",
        device.active ? "Revoke" : "Revoked",
        "text-button",
      );
    revoke.disabled = !device.active;
    revoke.onclick = () => {
      if (
        !window.confirm(t("Revoke this device? Its Windows verification will no longer be accepted."))
      )
        return;
      run("settings-status", revoke, async () => {
        if (!state.preview) await callable("revokeDevice", { id: device.id });
        device.active = false;
        renderDevices();
        showStatus("settings-status", "Device revoked.");
      });
    };
    row.append(el("span", device.label), revoke);
    $("device-list").append(row);
  }
  if (!state.devices.length)
    $("device-list").append(el("p", "No devices registered.", "helper"));
}
function updateIdentity() {
  $("start-tester").hidden = !state.isOwner || state.preview;
  $("tester-banner").hidden = !state.user?.isTester;
  $("admin-nav").hidden = !state.isOwner;
  $("account-name").textContent = state.user?.displayName || "Viewer";
  $("account-role").textContent = state.preview
    ? "Preview session"
    : state.isOwner
      ? "MES owner"
      : state.user
        ? "Verified workspace user"
        : "Sign in to load data";
  $("avatar").textContent = (state.user?.displayName || "V")
    .slice(0, 1)
    .toUpperCase();
  $("connection-state").textContent = state.preview
    ? "Sample data · preview"
    : state.ready
      ? "Live workspace"
      : state.user ? "Connecting…" : "Sign in to connect";
  if (!state.isOwner && state.page === "settings") navigate("dashboard");
  renderForm();
}
function stopLive() {
  unsubscribers.forEach((stop) => stop());
  unsubscribers = [];
  if (timelineUnsubscribe) timelineUnsubscribe();
}
function onDataError(error) {
  message(errorMessage(error));
  if (["permission-denied", "unauthenticated"].includes(String(error.code)) && state.user) {
    stopLive();
    toast(
      "This action is not allowed. Your account may be inactive or its session may have expired. Sign in again or contact the administrator.",
    );
    logout().catch(() => handleAuth(null));
  }
}
function subscribeLive() {
  stopLive();
  const add = (path, field, order) => unsubscribers.push(watchRecords(path, (rows) => {
    state[field] = rows;
    if (["issues", "myIssues"].includes(field)) { state.ready = true; renderAll(); updateIdentity(); }
    else renderDirectories();
  }, onDataError, order));
  add("teamLeaders", "leaders");
  add("departments", "departments");
  if (state.isOwner) add("users", "users");
  add("issues", "issues", "desc");
  add("myIssues", "myIssues", "desc");
  unsubscribers.push(watchRecords("settings/policy", (rows) => {
    state.requiresWindows = false;
    renderForm();
  }, onDataError));
  $("data-scope").textContent = "All workspace feedback · updates every 15 seconds.";
}
function demoEvent(issue, kind, text, extra = {}) {
  issue.timeline ??= [];
  issue.timeline.push({
    id: crypto.randomUUID(),
    kind,
    text,
    author: state.user?.displayName || "Demo Owner",
    createdAt: Date.now(),
    ...extra,
  });
  issue.updatedAt = Date.now();
  if (state.selected === issue.id) {
    state.timeline = issue.timeline;
    renderTimeline();
  }
  renderAll();
}
$("feedback-form").onsubmit = (e) => {
  e.preventDefault();
  if (!requireMember()) return;
  run("create-status", $("submit-feedback"), async () => {
    const data = {
      reporterUid: state.user.uid,
      departmentId: $("department-select").value,
      process: $("process-input").value.trim(),
      occurrences: readOccurrences(),
      richDocument: feedbackEditor.getDocument(),
    };
    data.description = documentText(data.richDocument);
    data.subject = data.description.split(/\r?\n/)[0].slice(0, 100);
    const invalid = validateIssue(data) || validateFiles(state.files);
    if (invalid) {
      showStatus("create-status", invalid);
      return;
    }
    if (!data.reporterUid) {
      showStatus("create-status", "Select your display name.");
      return;
    }
    let createdId;
    if (state.preview) {
      const department = state.departments.find((x) => x.id === data.departmentId),
        reporter = state.users.find((x) => x.id === data.reporterUid) || {
          displayName: state.user.displayName || "Demo Owner",
          username: "hpham",
        };
      createdId = "DEMO-" + crypto.randomUUID().slice(0, 6).toUpperCase();
      const issue = {
        ...data,
        id: createdId,

        departmentName: department.name,
        reporterName: reporter.displayName,
        reporterUsername: reporter.username,
        status: "New",
        priority: "Medium",
        assessment: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: state.files.map((f, slotIndex) => ({
          slotIndex,
          name: f.name,
          size: f.size,
          type: attachmentType(f),
          preview: true,
          previewUrl: previewFileUrl(f),
        })),
        timeline: [],
      };
      state.issues.unshift(issue);
      demoEvent(
        issue,
        "created",
        "Preview feedback created. No production data was submitted.",
      );
    } else {
      const result = await callable("createIssue", data);
      createdId = result.id;
      const uploaded = [];
      try {
        for (const [index, file] of state.files.entries()) {
          showStatus(
            "create-status",
            `Feedback saved. Uploading attachment ${index + 1} of ${state.files.length}…`,
          );
          await uploadAttachment(`issues/${createdId}/${result.uploadSlots[index]}`, file, attachmentType(file));
          uploaded.push({ slot: result.uploadSlots[index], name: file.name });
        }
        if (uploaded.length)
          await callable("attachFiles", {
            issueId: createdId,
            files: uploaded,
          });
      } catch (e) {
        if (uploaded.length)
          try {
            await callable("attachFiles", {
              issueId: createdId,
              files: uploaded,
            });
          } catch {
            /* Kept on server; owner can inspect upload slots. */
          }
        showStatus(
          "create-status",
          `Feedback ${createdId} was saved, but one or more attachments failed. Do not resubmit the issue. Contact the owner with this ID.`,
        );
        toast("Feedback saved; attachment upload needs attention.");
        return;
      }
    }
    $("feedback-form").reset();
    feedbackEditor.reset();
    $("occurrence-rows").replaceChildren();
    state.files = [];
    renderFiles();
    renderAll();
    renderForm();
    showStatus(
      "create-status",
      state.preview ? "Preview feedback created." : "Feedback submitted.",
    );
    toast(state.preview ? "Preview feedback created." : "Feedback submitted.");
    if (state.issues.some((x) => x.id === createdId)) openIssue(createdId);
    else navigate("issues");
  });
};
function renderFiles() {
  $("selected-files").replaceChildren();
  state.files.forEach((file, index) => {
    const row = el("div", undefined, "file-row"),
      remove = el("button", "Remove", "text-button");
    remove.type = "button";
    remove.onclick = () => {
      feedbackEditor.removeFile(file);
      state.files.splice(index, 1);
      $("attachment-input").value = "";
      renderFiles();
    };
    row.append(
      el("span", `${file.name} · ${(file.size / 1024).toFixed(0)} KB`),
      remove,
    );
    $("selected-files").append(row);
  });
}
$("attachment-input").onchange = () => {
  const files = [...state.files, ...$("attachment-input").files],
    invalid = validateFiles(files);
  if (invalid) {
    showStatus("create-status", invalid);
    $("attachment-input").value = "";
    return;
  }
  state.files = files;
  renderFiles();
  showStatus("create-status", "");
};
$("handling-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("handling-status-message", $("save-handling"), async () => {
    const data = {
      id: state.selected,
      operation: "handling",
      status: $("handling-status").value,
      priority: $("handling-priority").value,
      assessment: $("handling-assessment").value.trim(),
      note: $("handling-note").value.trim(),
    };
    if (state.preview) {
      const issue = state.issues.find((x) => x.id === data.id);
      const text = `Status: ${issue.status} → ${data.status}. Priority: ${issue.priority} → ${data.priority}. ${data.note}${data.assessment ? "\nAssessment: " + data.assessment : ""}`;
      Object.assign(issue, {
        status: data.status,
        priority: data.priority,
        assessment: data.assessment,
      });
      if (["Resolved", "Closed"].includes(data.status))
        issue.resolvedAt = Date.now();
      else delete issue.resolvedAt;
      demoEvent(issue, "handling", text);
    } else await callable("updateIssue", data);
    $("handling-note").value = "";
    showStatus(
      "handling-status-message",
      state.preview ? "Preview handling updated." : "Handling updated.",
    );
  });
};
$("comment-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("comment-status", $("comment-form").querySelector("button"), async () => {
    const text = $("comment-input").value.trim();
    if (!text) {
      showStatus("comment-status", "Enter a handling note.");
      return;
    }
    if (state.preview)
      demoEvent(
        state.issues.find((x) => x.id === state.selected),
        "comment",
        text,
      );
    else await callable("addComment", { issueId: state.selected, text });
    $("comment-input").value = "";
    showStatus("comment-status", "Update recorded in the timeline.");
  });
};
$("edit-issue").onclick = async () => {
  if (!ownerOnly()) return;
  const issue = state.issues.find((x) => x.id === state.selected);
  $("edit-subject").value = issue.subject;
  $("edit-process").value = issue.process;
  editImageFiles.length = 0; editSlots.clear(); editUploaded.clear();
  $("edit-dialog").showModal();
  $("edit-form").querySelector('button[type="submit"]').disabled = true;
  try { await editEditor.setDocument(issue.richDocument, issue.description); }
  catch { toast("Could not load formatted feedback."); }
  finally { $("edit-form").querySelector('button[type="submit"]').disabled = false; }
};
$("edit-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("edit-status", $("edit-form").querySelector('button[type="submit"]'), async () => {
    const data = {
      id: state.selected,
      operation: "edit",
      subject: $("edit-subject").value.trim(),
      process: $("edit-process").value.trim(),
      richDocument: editEditor.getDocument(),
    };
    data.description = documentText(data.richDocument);
    if (state.preview) {
      const issue = state.issues.find((x) => x.id === state.selected);
      for (const file of editImageFiles) issue.attachments.push({name:file.name,size:file.size,type:attachmentType(file),slotIndex:editSlots.get(file),preview:true,previewUrl:previewFileUrl(file)});
      const before = {
        subject: issue.subject,
        process: issue.process,
        description: issue.description,
        richDocument: issue.richDocument || null,
      };
      Object.assign(issue, data);
      demoEvent(issue, "edit", "Owner edited feedback details (preview).", {
        before,
        after: {
          subject: data.subject,
          process: data.process,
          description: data.description,
          richDocument: data.richDocument,
        },
      });
    } else {
      const issue = state.issues.find(x => x.id === state.selected);
      const files = [];
      for (const file of editImageFiles) {
        const slot = issue.uploadSlots[editSlots.get(file)];
        if (!editUploaded.has(file)) { await uploadAttachment(`issues/${issue.id}/${slot}`,file,attachmentType(file)); editUploaded.add(file); }
        files.push({slot,name:file.name});
      }
      if (files.length) await callable("attachFiles",{issueId:issue.id,files});
      await callable("updateIssue", data);
    }
    editEditor.reset(); editImageFiles.length = 0; editSlots.clear(); editUploaded.clear();
    $("edit-dialog").close();
    toast("Feedback updated.");
  });
};
$("delete-issue").onclick = () => {
  if (
    !ownerOnly() ||
    !window.confirm(t("Permanently delete this issue, all its attachments and its timeline?"))
  )
    return;
  run("handling-status-message", $("delete-issue"), async () => {
    if (state.preview)
      state.issues = state.issues.filter((x) => x.id !== state.selected);
    else await callable("deleteIssue", { id: state.selected });
    state.selected = null;
    navigate("issues");
    renderAll();
    toast("Issue deleted.");
  });
};
for (const [formId, inputId, type, field] of [
  ["leader-form", "leader-name", "teamLeaders", "leaders"],
  ["department-form", "department-name", "departments", "departments"],
])
  $(formId).onsubmit = (e) => {
    e.preventDefault();
    if (!ownerOnly()) return;
    run("settings-status", $(formId).querySelector("button"), async () => {
      const name = $(inputId).value.trim();
      if (!name) return;
      if (state.preview)
        state[field].push({ id: crypto.randomUUID(), name, active: true });
      else
        await callable("manageDirectory", { type, operation: "create", name });
      $(inputId).value = "";
      renderDirectories();
      showStatus("settings-status", "Directory entry added.");
    });
  };
$("user-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("settings-status", $("user-form").querySelector("button"), async () => {
    const username = $("new-username").value.trim().toLowerCase(),
      displayName = $("new-display-name").value.trim();
    if (!safeUsername(username) || username === "hpham") {
      showStatus(
        "settings-status",
        "Use a valid username. hpham is reserved for the owner.",
      );
      return;
    }
    if (state.users.some((u) => u.username === username)) {
      showStatus("settings-status", "This username already exists.");
      return;
    }
    if (state.preview)
      state.users.push({
        id: crypto.randomUUID(),
        username,
        displayName,
        active: true,
      });
    else
      displayActivation(await callable("manageUser", {
        operation: "create", username, displayName,
      }));
    $("user-form").reset();
    await refreshAccounts();
    showStatus("settings-status", "User created.");
  });
};
$("save-policy").onclick = () => {
  if (!ownerOnly()) return;
  const requiresWindows = $("require-windows").checked;
  if (
    !requiresWindows &&
    !window.confirm(t("Disable Windows verification? Anyone who selects an active display name will then be able to sign in as that managed user."))
  ) {
    $("require-windows").checked = state.requiresWindows;
    return;
  }
  run("settings-status", $("save-policy"), async () => {
    if (!state.preview) await callable("setPolicy", { requiresWindows });
    state.requiresWindows = requiresWindows;
    renderForm();
    showStatus("settings-status", "Submission policy updated.");
  });
};
$("device-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("settings-status", $("device-form").querySelector("button"), async () => {
    if (state.preview) {
      showStatus(
        "settings-status",
        "Device credentials are not generated in preview. Configure and deploy the backend first.",
      );
      return;
    }
    const data = await callable("registerDevice", {
      label: $("device-label").value.trim(),
    });
    const result = $("device-result");
    result.replaceChildren(
      el(
        "strong",
        "Device registered. Download this key now; it will not be shown again.",
      ),
      el(
        "p",
        "Install the device configuration on the trusted Windows computer. Do not share it.",
      ),
    );
    const download = el("button", "Download device.json", "button");
    download.type = "button";
    download.onclick = () => {
      const blob = new Blob([JSON.stringify(data, null, 2)], {
          type: "application/json",
        }),
        url = URL.createObjectURL(blob),
        a = el("a");
      a.href = url;
      a.download = "device.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      result.replaceChildren(
        el(
          "p",
          "Key downloaded. Keep device.json protected and close this page after installation.",
        ),
      );
    };
    result.append(download);
    result.hidden = false;
    await loadDevices();
    showStatus("settings-status", "Device registered.");
  });
};
$("password-login-form").onsubmit = e => {
  e.preventDefault();
  run("account-status", e.currentTarget.querySelector("button"), async () => {
    const username = $("account-username").value.trim().toLowerCase();
    const password = $("account-password").value;
    try {
      const result = await callable("passwordLogin", { username, password });
      $("account-password").value = "";
      await managedLogin(result.sessionToken);
    } finally { $("account-password").value = ""; }
  });
};
function showActivation(username = "", code = "") {
  if (!$("account-dialog").open) openAccount();
  $("password-login-form").hidden = true; $("admin-login-form").hidden = true;
  $("activation-form").hidden = false; $("signed-in-account").hidden = true;
  $("activate-username").value = username; $("activate-code").value = code;
}
$("show-activation").onclick = () => showActivation($("account-username").value);
$("back-to-login").onclick = () => { $("activate-password").value = ""; $("activate-confirm").value = ""; $("activate-code").value = ""; $("account-dialog").close(); openAccount(); };
$("activation-form").onsubmit = e => {
  e.preventDefault();
  run("account-status", e.currentTarget.querySelector('button[type="submit"],button:not([type])'), async () => {
    if ($("activate-password").value !== $("activate-confirm").value) throw Object.assign(new Error("Passwords do not match."), { code: "invalid-argument" });
    const result = await callable("activateAccount", { username: $("activate-username").value.trim().toLowerCase(), activationCode: $("activate-code").value.trim(), password: $("activate-password").value });
    $("activation-form").reset(); $("activation-form").hidden = true;
    await managedLogin(result.sessionToken);
  });
};
function displayActivation(result) {
  const link = new URL(location.origin + "/");
  link.hash = new URLSearchParams({ activate: result.activationCode, username: result.username }).toString();
  $("activation-link").value = link.href; $("activation-result").hidden = false;
}
$("copy-activation").onclick = () => run("settings-status", $("copy-activation"), async () => { await navigator.clipboard.writeText($("activation-link").value); toast("Activation link copied. Share it privately."); });
function populateProfile() {
  const user = state.user || {};
  for (const [id, key] of [["profile-username","username"],["profile-name","displayName"],["profile-email","email"],["profile-phone","phone"],["profile-title","jobTitle"]]) $(id).value = user[key] || "";
  $("profile-form").querySelector("button").disabled = !!user.isTester;
  $("password-form").hidden = !!user.isTester;
}
$("profile-form").onsubmit = e => {
  e.preventDefault();
  run("profile-status", e.currentTarget.querySelector("button"), async () => {
    const data = { displayName: $("profile-name").value.trim(), email: $("profile-email").value.trim(), phone: $("profile-phone").value.trim(), jobTitle: $("profile-title").value.trim() };
    if (!state.preview) await callable("saveProfile", data);
    Object.assign(state.user, data); updateIdentity(); showStatus("profile-status", "Profile saved.");
  });
};
$("password-form").onsubmit = e => {
  e.preventDefault();
  run("password-status", e.currentTarget.querySelector("button"), async () => {
    if ($("new-password").value !== $("confirm-password").value) throw Object.assign(new Error("Passwords do not match."), { code: "invalid-argument" });
    if (state.preview) { showStatus("password-status", "Preview only. No password was changed."); return; }
    const result = await callable("changePassword", { currentPassword: $("current-password").value, password: $("new-password").value });
    $("password-form").reset(); await managedLogin(result.sessionToken); navigate("profile"); toast("Password updated. Other sessions were signed out.");
  });
};
$("owner-google-login").onclick = () =>
  run("account-status", $("owner-google-login"), async () => {
    if (state.preview) {
      state.isOwner = true;
      state.user = {
        uid: "preview-owner",
        displayName: "Demo Owner",
        username: "hpham",
      };
      updateIdentity();
      renderDirectories();
      $("account-dialog").close();
      return;
    }
    await ownerLogin();
  });
$("sign-out").onclick = () =>
  run("account-status", $("sign-out"), async () => {
    if (state.preview) {
      state.user = null;
      state.isOwner = false;
      updateIdentity();
    } else await logout();
    $("account-dialog").close();
  });
$("start-tester").onclick = () => run("account-status", $("start-tester"), () => setTesterMode(true));
$("exit-tester").onclick = () => run("account-status", $("exit-tester"), () => setTesterMode(false));
$("reset-session").onclick = () => run("account-status", $("reset-session"), async () => {
  if (!state.preview) await logout();
  showStatus("account-status", "Session cleared. Sign in with your username and password.");
});
$("user-login-tab").onclick = () => {
  if ($("account-dialog").open) $("account-dialog").close();
  openAccount(false);
};
$("admin-login-tab").onclick = () => {
  if ($("account-dialog").open) $("account-dialog").close();
  openAccount(true);
};
$("account-button").onclick = () => openAccount();
$("preview-admin").onclick = () => {
  state.isOwner = !state.isOwner;
  state.user = state.isOwner
    ? { uid: "preview-owner", displayName: "Demo Owner", username: "hpham" }
    : {
        uid: "demo-1",
        displayName: "Demo Operator",
        username: "demo.operator",
      };
  $("preview-admin").textContent = state.isOwner
    ? "Return to user preview"
    : "Explore admin preview";
  updateIdentity();
  renderDirectories();
  renderAll();
  toast(
    state.isOwner
      ? "Admin preview enabled. No real privileges are granted."
      : "User preview enabled.",
  );
};
$("new-feedback").onclick = () => navigate("create");
$("view-all").onclick = () => navigate(state.page === "my-dashboard" ? "my-issues" : "issues");
$("back-to-issues").onclick = () => navigate("issues");
document
  .querySelectorAll("[data-page]")
  .forEach((b) => (b.onclick = () => navigate(b.dataset.page)));
document
  .querySelectorAll("[data-close]")
  .forEach((b) => (b.onclick = () => $(b.dataset.close).close()));
$("dashboard-period").onchange = renderDashboard;
for (const id of [
  "issue-search",
  "issue-status",
  "issue-department",
  "issue-priority",
])
  $(id).addEventListener(id === "issue-search" ? "input" : "change", () => {
    state.tablePage = 1;
    renderIssues();
  });
$("clear-filters").onclick = () => {
  $("issue-search").value = "";
  for (const id of ["issue-status", "issue-department", "issue-priority"])
    $(id).value = "All";
  state.tablePage = 1;
  renderIssues();
};
$("mobile-nav").onclick = () => {
  const open = document.querySelector(".sidebar").classList.toggle("open");
  $("mobile-nav").setAttribute("aria-expanded", String(open));
};
$("export-issues").onclick = () => {
  if (!state.ready) {
    toast("Load the workspace before exporting.");
    return;
  }
  const escape = csvCell;
  const rows = [
    [
      "ID",
      "Subject",
      "Department",
      "Process",
      "Reporter",
      "Priority",
      "Status",
      "Updated",
      "Incident times",
    ].map(t),
    ...filtered().map((i) => [
      i.id,
      i.subject,
      i.departmentName,
      i.process,
      i.reporterName,
      i.priority,
      i.status,
      date(i.updatedAt),
      (i.occurrences || []).map(time => time.start + (time.kind === "range" ? " → " + time.end : "")).join("; "),
    ]),
  ];
  const blob = new Blob(
    ["\ufeff" + rows.map((row) => row.map(escape).join(",")).join("\r\n")],
    { type: "text/csv;charset=utf-8" },
  );
  const url = URL.createObjectURL(blob),
    a = el("a");
  a.href = url;
  a.download = `${state.preview ? "preview-" : ""}mes-feedback.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
$("refresh-button").onclick = async () => {
  if (state.preview) {
    renderAll();
    toast("Preview data refreshed.");
    return;
  }
  if (state.user) {
    subscribeLive();
    toast("Refreshing workspace…");
  } else {
    await loadDirectory();
    openAccount();
  }
};
async function loadDirectory() {
  try {
    const data = await callable("getDirectory");
    if (data.accountVersion !== 1 || data.apiVersion !== "accounts-v1") throw Object.assign(new Error("Account service update required"), { code: "backend-not-ready" });
    state.users = data.users || [];
    state.requiresWindows = false;
    renderDirectories();
    message("");
  } catch (e) {
    message(errorMessage(e));
  }
}
async function handleAuth(user) {
  const generation = ++sessionGeneration;
  stopLive();
  state.user = null;
  state.isOwner = false;
  state.ready = false;
  state.issues = [];
  state.myIssues = [];
  state.users = [];
  $("user-admin-dialog").close();
  $("admin-activation-link").value = "";
  editingUser = undefined;
  state.leaders = [];
  state.departments = [];
  state.devices = [];
  state.timeline = [];
  state.selected = null;
  state.files = [];
  $("activation-result").hidden = true; $("activation-link").value = "";
  $("profile-form").reset(); $("password-form").reset();
  $("device-result").replaceChildren();
  $("device-result").hidden = true;
  renderDevices();
  $("feedback-form").reset();
  feedbackEditor.reset(); editEditor.reset(); editImageFiles.length = 0; editSlots.clear(); editUploaded.clear();
  $("edit-dialog").close();
  $("occurrence-rows").replaceChildren();
  clearImages();
  renderFiles();
  $("detail-content").replaceChildren();
  $("issue-timeline").replaceChildren();
  if (["detail", "create", "settings", "profile", "my-dashboard", "my-issues"].includes(state.page))
    navigate("dashboard");
  renderAll();
  updateIdentity();
  if (!user) {
    await loadDirectory();
    return;
  }
  try {
    const session = await callable("getSession");
    if (generation !== sessionGeneration) return;
    if (session.accountVersion !== 1) throw Object.assign(new Error("Account service update required"), { code: "backend-not-ready" });
    state.user = session.user;
    state.isOwner = session.isOwner;
    state.requiresWindows = false;
    message("");
    updateIdentity();
    renderDirectories();
    subscribeLive();
    if ($("account-dialog").open && $("activation-form").hidden) $("account-dialog").close();
    toast(
      state.isOwner ? "Signed in as MES owner." : state.user.isTester ? "Tester mode. Feedback is saved to the live workspace." : "Signed in successfully.",
    );
  } catch (e) {
    if (generation === sessionGeneration) {
      showStatus("account-status", errorMessage(e));
      message(errorMessage(e));
    }
  }
}
function userEl(tag, text, cls) { const node = el(tag, text, cls); node.dataset.userContent = ""; return node; }
function readOccurrences() {
  return [...$("occurrence-rows").children].map(row => {
    const start = row.querySelector('[name="start"]').value;
    const end = row.querySelector('[name="end"]')?.value;
    return { kind: row.dataset.kind, start: start ? new Date(start).toISOString() : "", ...(row.dataset.kind === "range" ? { end: end ? new Date(end).toISOString() : "" } : {}) };
  });
}
function addOccurrence(kind) {
  if ($("occurrence-rows").children.length >= 20) { toast("Add no more than 20 incident times."); return; }
  const row = el("div", undefined, "occurrence-row"); row.dataset.kind = kind;
  row.append(el("span", kind === "range" ? "Time range" : "Moment", "occurrence-kind"));
  for (const name of kind === "range" ? ["start", "end"] : ["start"]) {
    const label = el("label", name === "end" ? "End time" : kind === "range" ? "Start time" : "Incident time");
    const input = document.createElement("input"); input.type = "datetime-local"; input.name = name; input.required = true;
    input.min = "2000-01-01T00:00"; input.max = "2100-12-31T23:59";
    input.addEventListener("change", () => {
      const end = row.querySelector('[name="end"]'), start = row.querySelector('[name="start"]');
      if (end) { end.min = start.value || "2000-01-01T00:00"; end.setCustomValidity(end.value && start.value && end.value < start.value ? t("The end time must be on or after the start time.") : ""); }
    });
    label.append(input); row.append(label);
  }
  const remove = el("button", "Remove", "text-button"); remove.type = "button"; remove.onclick = () => row.remove(); row.append(remove);
  $("occurrence-rows").append(row); row.querySelector("input").focus();
}
function renderOccurrences(items) {
  const section = el("section", undefined, "incident-summary"); section.append(el("h3", "Incident times"));
  if (!items.length) section.append(el("p", "Not specified", "helper"));
  for (const item of items) {
    const label = item.kind === "range" ? "Time range" : "Moment";
    const text = date(Date.parse(item.start)) + (item.kind === "range" ? ` → ${date(Date.parse(item.end))}` : "");
    const row = el("div", undefined, "incident-chip"); row.append(el("span", label), userEl("time", text)); section.append(row);
  }
  return section;
}
const imageCache = new Map(), previewImages = new Set();
function previewFileUrl(file) { const url = URL.createObjectURL(file); previewImages.add(url); return url; }
function clearImages() {
  for (const entry of imageCache.values()) if (entry.url) URL.revokeObjectURL(entry.url);
  imageCache.clear(); for (const url of previewImages) URL.revokeObjectURL(url); previewImages.clear();
  $("image-viewer").close(); $("image-full").removeAttribute("src");
}
async function imageUrl(file) {
  if (file.previewUrl) return file.previewUrl;
  if (state.preview) throw new Error("No preview image");
  if (imageCache.has(file.path)) return imageCache.get(file.path).promise;
  if (imageCache.size >= 12) { const [key, entry] = imageCache.entries().next().value; if (entry.url) URL.revokeObjectURL(entry.url); imageCache.delete(key); }
  const entry = {}; imageCache.set(file.path, entry);
  entry.promise = fetchAttachment(file.path).then(blob => {
    if (imageCache.get(file.path) !== entry) throw new Error("Session changed");
    entry.url = URL.createObjectURL(blob); return entry.url;
  }).catch(error => { if (imageCache.get(file.path) === entry) imageCache.delete(file.path); throw error; });
  return entry.promise;
}
async function openImage(file) {
  const generation = sessionGeneration;
  try {
    const url = await imageUrl(file);
    if (generation !== sessionGeneration) return;
    $("image-name").textContent = file.name; $("image-full").src = url; $("image-full").alt = file.name;
    $("image-stage").classList.remove("natural-size");
    if (!$("image-viewer").open) $("image-viewer").showModal();
  } catch (error) { toast("Unable to load image. Try again."); }
}
$("add-moment").onclick = () => addOccurrence("point");
$("add-range").onclick = () => addOccurrence("range");
$("image-close").onclick = () => $("image-viewer").close();
$("image-fit").onclick = () => $("image-stage").classList.remove("natural-size");
$("image-zoom").onclick = () => $("image-stage").classList.add("natural-size");
$("image-full").ondblclick = () => $("image-stage").classList.toggle("natural-size");
$("image-viewer").addEventListener("click", event => { if (event.target === $("image-viewer")) $("image-viewer").close(); });
window.addEventListener("beforeunload", clearImages);

const editImageFiles = [], editSlots = new Map(), editUploaded = new Set();
function findImage(issue, slot) {
  return (issue.attachments || []).find(file => file.slotIndex === slot || file.path === `issues/${issue.id}/${issue.uploadSlots?.[slot]}`);
}
function reportBody(issue) {
  if (!issue.richDocument) return userEl("p", issue.description, "feedback-body");
  try { return renderDocument(issue.richDocument, slot => inlineImage(issue, slot)); }
  catch { return userEl("p", issue.description, "feedback-body"); }
}
function inlineImage(issue, slot) {
  const file = findImage(issue,slot);
  if (!file || !["image/jpeg","image/png","image/webp"].includes(file.type)) return el("span", t("Inline image is not available yet."), "inline-image-missing");
  const button=el("button",undefined,"inline-report-image");button.type="button";
  button.setAttribute("aria-label",`${t("View image")}: ${file.name}`);
  const image=document.createElement("img");image.alt=file.name;image.loading="lazy";button.append(image);
  imageUrl(file).then(url=>{if(button.isConnected)image.src=url;}).catch(()=>{button.append(el("span",t("Image unavailable. Click to retry.")));});
  button.onclick=()=>openImage(file);return button;
}
const feedbackEditor = createRichEditor($("description-input"), {
  files:()=>state.files,
  addImages:files=>{const invalid=validateFiles([...state.files,...files]);if(invalid)throw new Error(invalid);if(files.some(file=>!["image/jpeg","image/png","image/webp"].includes(attachmentType(file))))throw new Error("Use JPG, PNG or WEBP images.");state.files.push(...files);renderFiles();return files;},
  slotForFile:file=>state.files.indexOf(file), imageForSlot:()=>Promise.reject(), notice:toast,
});
const editEditor = createRichEditor($("edit-description"), {
  files:()=>editImageFiles,
  addImages:files=>{
    const issue=state.issues.find(x=>x.id===state.selected);
    const invalid=validateFiles([...(issue?.attachments||[]),...editImageFiles,...files]);if(invalid)throw new Error(invalid);
    if(files.some(file=>!["image/jpeg","image/png","image/webp"].includes(attachmentType(file))))throw new Error("Use JPG, PNG or WEBP images.");
    for(const file of files){const slot=Array.from({length:5},(_,i)=>i).find(i=>!findImage(issue,i)&&![...editSlots.values()].includes(i));if(slot===undefined)throw new Error("Attach no more than 5 files.");editSlots.set(file,slot);editImageFiles.push(file);}return files;
  },
  slotForFile:file=>editSlots.get(file), imageForSlot:slot=>{const issue=state.issues.find(x=>x.id===state.selected),file=findImage(issue,slot);return file?imageUrl(file):Promise.reject();},notice:toast,
});
initializeLanguage(() => { feedbackEditor.setLanguage(); editEditor.setLanguage(); renderAll(); renderTimeline(); updateIdentity(); if (state.selected) { const issue = state.issues.find(i => i.id === state.selected); if (issue) renderDetail(issue); } });
selectOptions($("issue-status"), [
  { id: "All", name: "All statuses" },
  ...statuses.map((s) => ({ id: s, name: s })),
]);
selectOptions($("issue-priority"), [
  { id: "All", name: "All priorities" },
  ...priorities.map((s) => ({ id: s, name: s })),
]);
selectOptions($("issue-department"), [{ id: "All", name: "All departments" }]);
selectOptions($("handling-status"), statuses);
selectOptions($("handling-priority"), priorities);
if (state.preview) {
  const demo = makeDemo();
  Object.assign(state, demo, {
    ready: true,
    user: {
      uid: "demo-1",
      displayName: "Demo Operator",
      username: "demo.operator",
    },
  });
  $("preview-banner").hidden = false;
  $("data-scope").textContent =
    "Preview only · sample data, no production connection.";
  renderDirectories();
  renderAll();
  updateIdentity();
} else if (configured) {
  initializeBackend();
  watchAuth(handleAuth);
  renderDirectories();
  renderAll();
  updateIdentity();
} else {
  message(
    "Supabase publishable key is missing. The production backend is not connected.",
  );
  renderAll();
  updateIdentity();
}

const activationParams = new URLSearchParams(location.hash.slice(1));
if (activationParams.has("activate")) {
  const code = activationParams.get("activate"), username = activationParams.get("username") || "";
  history.replaceState(null, "", location.pathname + location.search);
  if (/^[a-f0-9]{64}$/.test(code || "")) showActivation(username, code);
}

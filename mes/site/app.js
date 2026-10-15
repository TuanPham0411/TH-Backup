import "@fontsource/dm-sans/latin-400.css";
import "@fontsource/dm-sans/latin-500.css";
import "@fontsource/dm-sans/latin-600.css";
import { initializeBackend, api, watchAuth, ownerLogin, managedLogin, logout, watchRecords, uploadAttachment, downloadAttachment as fetchAttachment } from "./backend.js";
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
    ? new Date(stamp(v)).toLocaleString("en-GB", {
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
  if (c.includes("unauthenticated"))
    return "Sign in to the MES workspace first.";
  if (c.includes("permission-denied"))
    return e.message?.includes("Windows")
      ? "Your verification has expired or the device was revoked. Verify this computer again."
      : "Access denied. Confirm this user or owner is authorized and the MES access policies are deployed.";
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
    node.append(option);
  }
  if ([...node.options].some((o) => o.value === previous))
    node.value = previous;
}
function openAccount(owner = false) {
  $("user-login-tab").setAttribute("aria-pressed", String(!owner));
  $("admin-login-tab").setAttribute("aria-pressed", String(owner));
  $("windows-login-form").hidden = owner || !!state.user;
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
  if (page === "create" && !requireMember()) return;
  state.page = page;
  document
    .querySelectorAll("main>.page")
    .forEach((s) => (s.hidden = s.id !== `${page}-page`));
  document
    .querySelectorAll("[data-page]")
    .forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  $("page-crumb").textContent = {
    dashboard: "Dashboard",
    issues: "Issue list",
    create: "Submit feedback",
    settings: "Administration",
    detail: "Issue details",
  }[page];
  $("mobile-nav").setAttribute("aria-expanded", "false");
  document.querySelector(".sidebar").classList.remove("open");
  window.scrollTo({ top: 0, behavior: "instant" });
  if (page === "settings") loadDevices();
  if (page === "create") renderForm();
}
function renderDirectories() {
  const active = (items) => items.filter((x) => x.active !== false);
  selectOptions($("leader-select"), active(state.leaders), {
    placeholder: "Select Team Leader",
  });
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
  const people = state.isOwner
    ? [
        {
          id: state.user?.uid || "preview-owner",
          displayName: "MES Owner (hpham)",
        },
        ...state.users.filter((u) => u.active !== false),
      ]
    : state.user
      ? [{ id: state.user.uid, displayName: state.user.displayName }]
      : [];
  selectOptions($("reporter-select"), people, {
    placeholder: "Select your display name",
  });
  if (people.length === 1) $("reporter-select").value = people[0].id;
  $("require-windows").checked = state.requiresWindows;
  $("identity-notice").textContent = state.preview
    ? "Preview mode. Submitting creates sample feedback only in this browser session."
    : state.user
      ? `${state.user.displayName} · ${state.isOwner ? "Owner access" : state.requiresWindows ? "Signed Windows verification active" : "Managed user access"}. Your selected identity is validated by the server.`
      : "Verify this Windows computer before submitting feedback.";
  $("submit-feedback").textContent = state.preview
    ? "Create preview feedback →"
    : "Submit feedback →";
}
function selectedPeriod() {
  const days = $("dashboard-period").value;
  return state.issues.filter(
    (i) =>
      days === "all" ||
      stamp(i.createdAt) >= Date.now() - Number(days) * 86400000,
  );
}
function renderDashboard() {
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
  renderActivity(issues);
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
      el("h3", issue.subject),
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
}
function renderActivity(issues) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Array.from(
    { length: 7 },
    (_, n) => new Date(today.getTime() - (6 - n) * 86400000),
  );
  const counts = days.map((d) => ({
    day: d,
    created: issues.filter(
      (i) =>
        stamp(i.createdAt) >= d.getTime() &&
        stamp(i.createdAt) < d.getTime() + 86400000,
    ).length,
    resolved: issues.filter(
      (i) =>
        stamp(i.resolvedAt) >= d.getTime() &&
        stamp(i.resolvedAt) < d.getTime() + 86400000,
    ).length,
  }));
  const max = Math.max(1, ...counts.flatMap((d) => [d.created, d.resolved]));
  const axis = el("div", undefined, "chart-y");
  axis.append(
    el("span", String(max)),
    el("span", String(Math.round(max / 2))),
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
      bar.title = `${d.day.toLocaleDateString("en-GB")}: ${count} ${name.toLowerCase()}`;
      bar.setAttribute("aria-label", bar.title);
      bars.append(bar);
    }
    day.append(
      bars,
      el(
        "small",
        d.day.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
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
    row.append(dot, el("span", s), el("strong", String(counts[n])));
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
    head.append(el("span", d.name), el("span", String(d.count)));
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
function filtered() {
  return filterIssues(state.issues, {
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
    const link = el("button", i.subject, "issue-title-button");
    link.onclick = () => openIssue(i.id);
    title.append(link, el("small", i.id.slice(0, 12).toUpperCase()));
    const department = el("td");
    department.append(el("strong", i.departmentName), el("small", i.process));
    const reporter = el("td", i.reporterName),
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
    el("h1", issue.subject),
    el(
      "p",
      `Submitted ${date(issue.createdAt)} · ${issue.reporterName}`,
      "subtitle",
    ),
  );
  $("detail-heading").replaceChildren(heading, badge(issue.status));
  const data = el("div", undefined, "detail-data");
  for (const [label, value] of [
    ["Team Leader", issue.teamLeaderName],
    ["Department", issue.departmentName],
    ["Process / Station", issue.process],
  ]) {
    const d = el("div");
    d.append(el("small", label), el("span", value));
    data.append(d);
  }
  const attachments = el("div");
  attachments.append(el("h3", "Attachments"));
  for (const f of issue.attachments || []) {
    const row = el("div", undefined, "file-row"),
      button = el(
        "button",
        state.preview ? "Preview file" : "Download",
        "text-button",
      );
    button.onclick = () => downloadAttachment(f);
    row.append(
      el("span", `${f.name} · ${(f.size / 1024).toFixed(0)} KB`),
      button,
    );
    attachments.append(row);
  }
  if (!issue.attachments?.length)
    attachments.append(el("p", "No attachments.", "helper"));
  $("detail-content").replaceChildren(
    el("h2", "Feedback details"),
    data,
    el("p", issue.description),
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
function renderTimeline() {
  $("issue-timeline").replaceChildren();
  for (const event of [...state.timeline].sort(
    (a, b) => stamp(a.createdAt) - stamp(b.createdAt),
  )) {
    const row = el("div", undefined, "timeline-event");
    row.append(
      el("strong", event.author),
      el("small", date(event.createdAt)),
      el("p", event.text),
    );
    if (event.before && event.after) {
      const details = el("details", undefined, "audit-details");
      details.append(el("summary", "View edit changes"));
      for (const key of ["subject", "process", "description"]) {
        if (event.before[key] === event.after[key]) continue;
        details.append(
          el("strong", key),
          el("p", `Before: ${event.before[key]}`),
          el("p", `After: ${event.after[key]}`),
        );
      }
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
    edit.onclick = () => {
      const name = window.prompt("Display name", u.displayName);
      if (!name?.trim()) return;
      const username = window
        .prompt("Windows username", u.username)
        ?.trim()
        .toLowerCase();
      if (!username) return;
      if (!safeUsername(username) || username === "hpham") {
        showStatus("settings-status", "Enter a valid username.");
        return;
      }
      run("settings-status", edit, async () => {
        if (state.preview) {
          u.displayName = name.trim();
          u.username = username;
        } else
          await callable("manageUser", {
            operation: "update",
            uid: u.id,
            username,
            displayName: name.trim(),
          });
        renderDirectories();
        showStatus("settings-status", "User updated.");
      });
    };
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
    controls.append(edit, document.createTextNode(" · "), toggle);
    row.append(active, controls);
    $("user-rows").append(row);
  }
}
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
        !window.confirm(
          "Revoke this device? Its Windows verification will no longer be accepted.",
        )
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
      : "Not connected";
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
  if (String(error.code).includes("permission-denied") && state.user) {
    stopLive();
    toast(
      "Workspace access was denied. Verify your account or ask the owner to check the deployed MES access policies.",
    );
    logout().catch(() => handleAuth(null));
  }
}
function subscribeLive() {
  stopLive();
  const add = (path, field, order) => unsubscribers.push(watchRecords(path, (rows) => {
    state[field] = rows;
    if (field === "issues") { state.ready = true; renderAll(); updateIdentity(); }
    else renderDirectories();
  }, onDataError, order));
  add("teamLeaders", "leaders");
  add("departments", "departments");
  if (state.isOwner) add("users", "users");
  add("issues", "issues", "desc");
  unsubscribers.push(watchRecords("settings/policy", (rows) => {
    state.requiresWindows = rows[0]?.requiresWindows !== false;
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
      reporterUid: $("reporter-select").value,
      teamLeaderId: $("leader-select").value,
      departmentId: $("department-select").value,
      process: $("process-input").value.trim(),
      subject: $("subject-input").value.trim(),
      description: $("description-input").value.trim(),
    };
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
      const leader = state.leaders.find((x) => x.id === data.teamLeaderId),
        department = state.departments.find((x) => x.id === data.departmentId),
        reporter = state.users.find((x) => x.id === data.reporterUid) || {
          displayName: "Demo Owner",
          username: "hpham",
        };
      createdId = "DEMO-" + crypto.randomUUID().slice(0, 6).toUpperCase();
      const issue = {
        ...data,
        id: createdId,
        teamLeaderName: leader.name,
        departmentName: department.name,
        reporterName: reporter.displayName,
        reporterUsername: reporter.username,
        status: "New",
        priority: "Medium",
        assessment: "",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        attachments: state.files.map((f) => ({
          name: f.name,
          size: f.size,
          type: attachmentType(f),
          preview: true,
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
  const files = [...$("attachment-input").files],
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
$("edit-issue").onclick = () => {
  if (!ownerOnly()) return;
  const issue = state.issues.find((x) => x.id === state.selected);
  $("edit-subject").value = issue.subject;
  $("edit-process").value = issue.process;
  $("edit-description").value = issue.description;
  $("edit-dialog").showModal();
};
$("edit-form").onsubmit = (e) => {
  e.preventDefault();
  if (!ownerOnly()) return;
  run("edit-status", $("edit-form").querySelector("button"), async () => {
    const data = {
      id: state.selected,
      operation: "edit",
      subject: $("edit-subject").value.trim(),
      process: $("edit-process").value.trim(),
      description: $("edit-description").value.trim(),
    };
    if (state.preview) {
      const issue = state.issues.find((x) => x.id === state.selected);
      const before = {
        subject: issue.subject,
        process: issue.process,
        description: issue.description,
      };
      Object.assign(issue, data);
      demoEvent(issue, "edit", "Owner edited feedback details (preview).", {
        before,
        after: {
          subject: data.subject,
          process: data.process,
          description: data.description,
        },
      });
    } else await callable("updateIssue", data);
    $("edit-dialog").close();
    toast("Feedback updated.");
  });
};
$("delete-issue").onclick = () => {
  if (
    !ownerOnly() ||
    !window.confirm(
      "Permanently delete this issue, all its attachments and its timeline?",
    )
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
        "Use a valid Windows username. hpham is reserved for the owner.",
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
      await callable("manageUser", {
        operation: "create",
        username,
        displayName,
      });
    $("user-form").reset();
    renderDirectories();
    showStatus("settings-status", "User created.");
  });
};
$("save-policy").onclick = () => {
  if (!ownerOnly()) return;
  const requiresWindows = $("require-windows").checked;
  if (
    !requiresWindows &&
    !window.confirm(
      "Disable Windows verification? Anyone who selects an active display name will then be able to sign in as that managed user.",
    )
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
$("windows-login-form").onsubmit = (e) => {
  e.preventDefault();
  run(
    "account-status",
    $("windows-login-form").querySelector("button"),
    async () => {
      if (state.preview) {
        state.user = { uid: "demo-1", ...state.users[0] };
        state.isOwner = false;
        updateIdentity();
        $("account-dialog").close();
        return;
      }
      const selected = state.users.find((u) => u.id === $("login-user").value);
      if (!selected) {
        showStatus("account-status", "Select your display name.");
        return;
      }
      let token;
      if (state.requiresWindows) {
        const challenge = await callable("startWindowsChallenge", {
          username: selected.username,
        });
        let response;
        try {
          response = await fetch("http://127.0.0.1:8765/attest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(challenge),
            signal: AbortSignal.timeout(12000),
          });
        } catch {
          showStatus(
            "account-status",
            "Cannot reach the Windows agent. Start the installed TH MES agent and allow local-network access in your browser.",
          );
          return;
        }
        const proof = await response.json();
        if (!response.ok) {
          showStatus(
            "account-status",
            proof.error || "No matching Windows profile found.",
          );
          return;
        }
        token = (await callable("completeWindowsChallenge", proof)).sessionToken;
      } else
        token = (await callable("loginManagedUser", { uid: selected.id }))
          .sessionToken;
      await managedLogin(token);
    },
  );
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
$("view-all").onclick = () => navigate("issues");
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
      "Team Leader",
      "Department",
      "Process",
      "Reporter",
      "Priority",
      "Status",
      "Updated",
    ],
    ...filtered().map((i) => [
      i.id,
      i.subject,
      i.teamLeaderName,
      i.departmentName,
      i.process,
      i.reporterName,
      i.priority,
      i.status,
      date(i.updatedAt),
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
    state.users = data.users;
    state.requiresWindows = data.requiresWindows;
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
  state.users = [];
  state.leaders = [];
  state.departments = [];
  state.devices = [];
  state.timeline = [];
  state.selected = null;
  state.files = [];
  $("device-result").replaceChildren();
  $("device-result").hidden = true;
  renderDevices();
  $("feedback-form").reset();
  renderFiles();
  $("detail-content").replaceChildren();
  $("issue-timeline").replaceChildren();
  if (["detail", "create", "settings"].includes(state.page))
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
    state.user = session.user;
    state.isOwner = session.isOwner;
    state.requiresWindows = session.requiresWindows;
    message("");
    updateIdentity();
    renderDirectories();
    subscribeLive();
    if ($("account-dialog").open) $("account-dialog").close();
    toast(
      state.isOwner ? "Signed in as MES owner." : "Windows identity verified.",
    );
  } catch (e) {
    if (generation === sessionGeneration) {
      showStatus("account-status", errorMessage(e));
      message(errorMessage(e));
    }
  }
}
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

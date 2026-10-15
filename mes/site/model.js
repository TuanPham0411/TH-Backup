export const statuses = [
  "New",
  "Acknowledged",
  "In progress",
  "Awaiting information",
  "Resolved",
  "Closed",
];
export const priorities = ["Low", "Medium", "High", "Critical"];
export const allowedTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
export function attachmentType(file) {
  const extension = file.name?.split(".").pop().toLowerCase();
  const types = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    pdf: "application/pdf",
    txt: "text/plain",
    csv: "text/csv",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  };
  if (allowedTypes.includes(file.type)) return file.type;
  if (
    !file.type ||
    (extension === "csv" && file.type === "application/vnd.ms-excel")
  )
    return types[extension] || "";
  return "";
}
export function validateFiles(files) {
  if (files.length > 5) return "Attach no more than 5 files.";
  for (const file of files) {
    if (!file.name || file.name.length > 180) return "Use filenames of 1–180 characters.";
    if (!allowedTypes.includes(attachmentType(file)))
      return `${file.name}: unsupported file type. Use JPG, PNG, WEBP, PDF, TXT, CSV or XLSX.`;
    if (file.size <= 0) return `${file.name}: empty files cannot be uploaded.`;
    if (file.size > 10 * 1024 * 1024)
      return `${file.name}: maximum file size is 10 MB.`;
  }
  return "";
}
export function validateIssue(value) {
  if (!value.teamLeaderId || !value.departmentId)
    return "Select a team leader and department.";
  if (!value.process?.trim() || value.process.trim().length > 120)
    return "Enter a process or station (up to 120 characters).";
  if (!value.subject?.trim() || value.subject.trim().length > 160)
    return "Enter an issue title (up to 160 characters).";
  if (
    !value.description?.trim() ||
    value.description.trim().length < 10 ||
    value.description.trim().length > 5000
  )
    return "Describe the feedback in 10–5,000 characters.";
  return "";
}
export function filterIssues(
  issues,
  { search = "", status = "All", department = "All", priority = "All" } = {},
) {
  const term = search.trim().toLowerCase();
  return issues.filter(
    (i) =>
      (status === "All" || i.status === status) &&
      (department === "All" || i.departmentId === department) &&
      (priority === "All" || i.priority === priority) &&
      `${i.id} ${i.subject} ${i.description} ${i.process} ${i.reporterName} ${i.teamLeaderName} ${i.departmentName}`
        .toLowerCase()
        .includes(term),
  );
}
export function stats(issues) {
  const open = issues.filter((i) => !["Resolved", "Closed"].includes(i.status));
  return {
    total: issues.length,
    open: open.length,
    progress: issues.filter((i) => i.status === "In progress").length,
    resolved: issues.filter((i) => ["Resolved", "Closed"].includes(i.status))
      .length,
    critical: open.filter((i) => i.priority === "Critical").length,
  };
}
export function safeUsername(value) {
  return (
    typeof value === "string" &&
    /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value) &&
    !value.includes("..")
  );
}
export function makeDemo() {
  const now = Date.now();
  const users = [
    {
      id: "demo-1",
      username: "demo.operator",
      displayName: "Demo Operator",
      active: true,
    },
  ];
  const leaders = [
    { id: "tl-a", name: "Sample Team A", active: true },
    { id: "tl-b", name: "Sample Team B", active: true },
  ];
  const departments = [
    { id: "dep-a", name: "Sample Assembly", active: true },
    { id: "dep-b", name: "Sample Testing", active: true },
    { id: "dep-c", name: "Sample Packaging", active: true },
  ];
  const seed = [
    ["MES response delayed at station", "In progress", "High", 0, 0],
    ["Production order not displayed", "Acknowledged", "Medium", 1, 1],
    ["Incorrect quantity in report", "Resolved", "Medium", 0, 2],
    ["Scanner connection interrupted", "New", "Critical", 1, 0],
    [
      "Request a clearer validation message",
      "Awaiting information",
      "Low",
      0,
      1,
    ],
    ["Report export improvement", "Closed", "Low", 1, 2],
  ];
  const issues = seed.map(([subject, status, priority, l, d], n) => ({
    id: `DEMO-${String(n + 1).padStart(3, "0")}`,
    subject,
    status,
    priority,
    teamLeaderId: leaders[l].id,
    teamLeaderName: leaders[l].name,
    departmentId: departments[d].id,
    departmentName: departments[d].name,
    reporterUid: "demo-1",
    reporterName: "Demo Operator",
    process: `Station ${n + 1}`,
    description:
      "Sample feedback for interface preview. This is not a real production incident.",
    resolvedAt: ["Resolved", "Closed"].includes(status)
      ? now - n * 3600000
      : null,
    createdAt: now - (n + 1) * 86400000,
    updatedAt: now - n * 3600000,
    attachments: [],
    timeline: [
      {
        id: "event-" + n,
        kind: "created",
        text: "Sample feedback created",
        author: "Demo Operator",
        createdAt: now - (n + 1) * 86400000,
      },
    ],
  }));
  return { users, leaders, departments, issues };
}

export function csvCell(value) {
  let s = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(s) || /^[\t\r\n]/.test(s)) s = "\'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}

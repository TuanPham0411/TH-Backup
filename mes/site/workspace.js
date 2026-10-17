import { issueTypeSummary } from "./analytics.js";
import { t, getLanguage } from "./i18n.js";
const $ = (id) => document.getElementById(id);
function node(tag, text, className = "") {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = t(String(text));
  n.className = className;
  return n;
}
function content(tag, text, className = "") {
  const n = node(tag, undefined, className);
  n.dataset.userContent = "";
  n.textContent = text || "";
  return n;
}
const date = (value) =>
  new Date(value).toLocaleString(getLanguage() === "vi" ? "vi-VN" : "en-GB");
export function ticketProgress(issue) {
  if (["Resolved", "Closed"].includes(issue.status)) return 100;
  return Number.isFinite(issue.progress)
    ? Math.max(0, Math.min(100, issue.progress))
    : {
        New: 0,
        Acknowledged: 15,
        "In progress": 50,
        "Awaiting information": 35,
      }[issue.status] || 0;
}
export function progressView(issue, compact = false) {
  const percent = ticketProgress(issue),
    box = node(
      "div",
      undefined,
      compact ? "ticket-progress compact" : "ticket-progress",
    );
  const label = node("div", undefined, "progress-label");
  label.append(
    node("span", compact ? issue.status : "Ticket progress"),
    node("strong", `${percent}%`),
  );
  const track = node("div", undefined, "ticket-track");
  track.setAttribute("role", "progressbar");
  track.setAttribute("aria-label", t("Ticket progress"));
  track.setAttribute("aria-valuenow", percent);
  track.setAttribute("aria-valuemin", "0");
  track.setAttribute("aria-valuemax", "100");
  const fill = node("i");
  fill.style.width = `${percent}%`;
  track.append(fill);
  box.append(label, track);
  return box;
}
export function initWorkspace({ state, toast, run, addEvidence }) {
  let snapshot = {
      announcements: [],
      videos: [],
      issueTypes: [{ id: "general", name: "General", active: true }],
      targets: [],
    },
    timer,
    generation = 0,
    loading = false,
    videoIndex = 0,
    readSequence = 0;
  const request = async (action, data = {}) => {
    const response = await fetch("/api/mes/workspace", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/json",
        ...(state.user?.isTester ? { "X-MES-Tester": "true" } : {}),
      },
      body: JSON.stringify({ action, data }),
    });
    const result = await response.json();
    if (!response.ok)
      throw Object.assign(new Error(result.error || "Request failed"), {
        code: response.status < 500 ? "invalid-argument" : result.code,
        status: response.status,
      });
    return result;
  };
  // A different navigation model: horizontal command strip, branded masthead.
  const sidebar = document.querySelector(".sidebar"),
    topbar = document.querySelector(".topbar");
  const nav = sidebar.querySelector("nav");
  nav.classList.add("command-nav");
  topbar.after(nav);
  topbar.prepend(sidebar.querySelector(".brand"));
  document.querySelector(".topbar-actions").append($("account-button"));
  document
    .querySelector(".breadcrumb")
    .append(sidebar.querySelector(".connection"));
  sidebar.hidden = true;
  $("mobile-nav").addEventListener("click", () => nav.classList.toggle("open"));
  nav.addEventListener("click", () => nav.classList.remove("open"));
  const theme = () => {
    const night = document.documentElement.dataset.theme === "night";
    $("theme-toggle").textContent = night ? "☀" : "◐";
    $("theme-toggle").setAttribute(
      "aria-label",
      t(night ? "Day mode" : "Night mode"),
    );
    $("theme-toggle").title = t(night ? "Day mode" : "Night mode");
    document.querySelector('meta[name="theme-color"]').content = night
      ? "#101317"
      : "#f4f1eb";
  };
  $("theme-toggle").onclick = () => {
    document.documentElement.dataset.theme =
      document.documentElement.dataset.theme === "night" ? "day" : "night";
    localStorage.setItem(
      "th-mes-theme",
      document.documentElement.dataset.theme,
    );
    theme();
  };
  theme();
  async function refresh(force = false) {
    if ((loading && !force) || (!state.user && !state.preview)) return;
    loading = true;
    const sequence = ++readSequence,
      epoch = generation;
    try {
      const data = state.preview ? snapshot : await request("read");
      if (epoch !== generation || sequence !== readSequence) return;
      snapshot = data;
      render();
    } catch (error) {
      if (epoch === generation)
        $("network-targets").textContent = t(
          "Unable to refresh service telemetry.",
        );
    } finally {
      if (sequence === readSequence) loading = false;
    }
  }
  function start() {
    stop();
    refresh();
    timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
  }
  function stop() {
    clearInterval(timer);
    timer = undefined;
  }
  function reset() {
    generation++;
    stop();
    loading = false;
    snapshot = {
      announcements: [],
      videos: [],
      issueTypes: [{ id: "general", name: "General", active: true }],
      targets: [],
    };
    videoIndex = 0;
    $("workspace-video").pause();
    $("workspace-video").removeAttribute("src");
    $("workspace-video").load();
    render();
  }
  function render() {
    theme();
    renderNotices();
    renderVideo();
    renderNetwork();
    renderTypes();
    renderAdmin();
  }
  function renderTypes() {
    const select = $("issue-type-select"),
      selected = select.value;
    select.replaceChildren();
    for (const type of snapshot.issueTypes.filter((x) => x.active)) {
      const option = content("option", type.name);
      option.value = type.id;
      select.append(option);
    }
    if ([...select.options].some((o) => o.value === selected))
      select.value = selected;
  }
  function renderNotices() {
    const box = $("notice-board");
    box.replaceChildren();
    const rows = snapshot.announcements
      .filter((x) => x.active)
      .sort(
        (a, b) =>
          Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt,
      );
    for (const item of rows) {
      const article = node("article", undefined, "notice-item");
      article.append(
        node(
          "small",
          `${item.pinned ? "★ " + t("Pinned") + " · " : ""}${date(item.updatedAt)}`,
        ),
        content("h3", item.title),
        content("p", item.body),
        content("span", item.author, "notice-author"),
      );
      box.append(article);
    }
    if (!rows.length)
      box.append(
        node(
          "div",
          state.user
            ? "No announcements yet."
            : "Sign in to see workspace updates.",
          "workspace-empty",
        ),
      );
  }
  function renderVideo() {
    const videos = snapshot.videos;
    videoIndex = Math.min(videoIndex, Math.max(0, videos.length - 1));
    const current = videos[videoIndex],
      video = $("workspace-video");
    $("video-empty").hidden = !!current;
    video.hidden = !current;
    $("video-previous").disabled = $("video-next").disabled = videos.length < 2;
    $("video-position").textContent = current
      ? `${videoIndex + 1} / ${videos.length}`
      : "—";
    $("workspace-video-title").textContent =
      current?.title || t("Workspace video");
    if (!current) {
      video.pause();
      video.removeAttribute("src");
      video.load();
      return;
    }
    const url = `/api/mes/media/${current.id}`;
    if ($("dashboard-page").hidden) {
      video.pause();
      return;
    }
    if (video.getAttribute("src") !== url) {
      video.src = url;
      video.muted = true;
      video.loop = videos.length === 1;
      video
        .play()
        .then(() => ($("video-state").textContent = t("Autoplay · muted")))
        .catch(() => ($("video-state").textContent = t("Press play to start")));
    }
  }
  const moveVideo = (direction) => {
    if (!snapshot.videos.length) return;
    videoIndex =
      (videoIndex + direction + snapshot.videos.length) %
      snapshot.videos.length;
    renderVideo();
  };
  $("video-next").onclick = () => moveVideo(1);
  $("video-previous").onclick = () => moveVideo(-1);
  $("workspace-video").onended = () => moveVideo(1);
  $("workspace-video").onerror = () => {
    $("video-state").textContent = t(
      "Cannot play this format. Try another video.",
    );
  };
  function renderNetwork() {
    const box = $("network-targets");
    box.replaceChildren();
    for (const target of snapshot.targets.filter((x) => x.active)) {
      const card = node("article", undefined, "service-card"),
        probes = target.probes || [],
        last = probes[0],
        success = probes.filter((p) => p.ok);
      const stale =
        last && Date.now() - new Date(last.checked_at).getTime() > 660000;
      const top = node("div", undefined, "service-heading");
      top.append(
        content("h3", target.name),
        node(
          "span",
          !last
            ? "Not checked"
            : stale
              ? "Stale"
              : last.ok
                ? "Connected"
                : "Disconnected",
          `service-state ${!last || stale ? "unknown" : last.ok ? "online" : "offline"}`,
        ),
      );
      card.append(top);
      const metrics = node("div", undefined, "service-metrics");
      const latencies = success
          .map((p) => Number(p.latency_ms))
          .filter(Number.isFinite),
        jitter =
          latencies.length > 1
            ? latencies
                .slice(1)
                .reduce((sum, n, i) => sum + Math.abs(n - latencies[i]), 0) /
              (latencies.length - 1)
            : null;
      for (const [value, label] of [
        [
          last?.latency_ms == null ? "—" : `${Math.round(last.latency_ms)} ms`,
          "Response latency",
        ],
        [
          last?.mbps == null ? "—" : `${Number(last.mbps).toFixed(2)} Mbps`,
          "Sample throughput",
        ],
        [
          probes.length
            ? `${Math.round((success.length / probes.length) * 100)}%`
            : "—",
          "Availability",
        ],
        [
          jitter === null ? "—" : `${Math.round(jitter)} ms`,
          "Latency variation",
        ],
      ]) {
        const m = node("div");
        m.append(node("strong", value), node("small", label));
        metrics.append(m);
      }
      card.append(metrics);
      const strip = node("div", undefined, "uptime-strip");
      for (const p of [...probes].slice(0, 72).reverse()) {
        const bit = node("i", undefined, p.ok ? "up" : "down");
        bit.title = `${date(p.checked_at)} · ${p.ok ? t("Connected") : p.error}`;
        strip.append(bit);
      }
      card.append(
        strip,
        node(
          "p",
          last
            ? `${t("Last check")}: ${date(last.checked_at)} · ${probes.length} ${t("samples")}`
            : "Waiting for first automatic check.",
          "helper",
        ),
      );
      if (last?.error) card.append(content("p", last.error, "probe-error"));
      box.append(card);
    }
    if (!box.childNodes.length)
      box.append(
        node(
          "p",
          "No monitored services. An administrator can add a URL in Administration.",
          "workspace-empty",
        ),
      );
  }
  const button = (label, handler, className = "text-button") => {
    const b = node("button", label, className);
    b.type = "button";
    b.onclick = handler;
    return b;
  };
  function adminRow(title, actions) {
    const row = node("div", undefined, "admin-item");
    row.append(content("strong", title));
    const controls = node("div");
    controls.append(...actions);
    row.append(controls);
    return row;
  }
  function perform(button, work) {
    return run("workspace-admin-status", button, async () => {
      if (state.preview) {
        toast("Preview only. No production change.");
        return;
      }
      await work();
      await refresh(true);
      $("workspace-admin-status").textContent = t("Workspace updated.");
      toast("Workspace updated.");
    });
  }
  function deleteItem(kind, item, b) {
    if (confirm(`${t("Delete")} ${item.title || item.name}?`))
      perform(b, () => request("delete", { kind, id: item.id }));
  }
  function renderAdmin() {
    if (!state.isOwner) return;
    $("announcement-admin").replaceChildren();
    for (const item of snapshot.announcements) {
      const edit = button("Edit", () => {
          $("announcement-id").value = item.id;
          $("announcement-title").value = item.title;
          $("announcement-body").value = item.body;
          $("announcement-pinned").checked = item.pinned;
          $("announcement-active").checked = item.active;
          $("announcement-title").focus();
        }),
        del = button("Delete", () => deleteItem("announcements", item, del));
      $("announcement-admin").append(
        adminRow(
          `${item.pinned ? "★ " : ""}${item.title}${item.active ? "" : " · " + t("Draft")}`,
          [edit, del],
        ),
      );
    }
    $("issue-type-admin").replaceChildren();
    for (const item of snapshot.issueTypes) {
      const edit = button("Edit", () => {
          const name = prompt(t("Issue type name"), item.name);
          if (name?.trim())
            perform(edit, () =>
              request("save", {
                kind: "issueTypes",
                ...item,
                name: name.trim(),
              }),
            );
        }),
        toggle = button(item.active ? "Deactivate" : "Restore", () =>
          perform(toggle, () =>
            request("save", {
              kind: "issueTypes",
              ...item,
              active: !item.active,
            }),
          ),
        ),
        del = button("Delete", () => deleteItem("issueTypes", item, del));
      del.disabled = item.id === "general";
      $("issue-type-admin").append(adminRow(item.name, [edit, toggle, del]));
    }
    $("video-admin").replaceChildren();
    for (const item of snapshot.videos) {
      const rename = button("Rename", () => {
          const title = prompt(t("Video title"), item.title);
          if (title?.trim())
            perform(rename, () =>
              request("videoUpdate", { id: item.id, title: title.trim() }),
            );
        }),
        del = button("Delete", () => {
          if (confirm(`${t("Delete")} ${item.title}?`))
            perform(del, () => request("videoDelete", { id: item.id }));
        });
      $("video-admin").append(adminRow(item.title, [rename, del]));
    }
    $("network-admin").replaceChildren();
    for (const item of snapshot.targets) {
      const edit = button("Edit", () => {
          const url = prompt(t("URL to check"), item.url);
          if (url?.trim())
            perform(edit, () =>
              request("save", {
                kind: "networkTargets",
                ...item,
                url: url.trim(),
              }),
            );
        }),
        toggle = button(item.active ? "Pause" : "Resume", () =>
          perform(toggle, () =>
            request("save", {
              kind: "networkTargets",
              ...item,
              active: !item.active,
            }),
          ),
        ),
        check = button("Check now", () =>
          perform(check, () => request("probe", { id: item.id })),
        ),
        log = button("Download log", () =>
          perform(log, async () => {
            const { rows } = await request("probeLog", { id: item.id });
            const lines = [
              "checked_at,ok,latency_ms,mbps,bytes,http_status,error",
              ...rows.map((r) =>
                [
                  r.checked_at,
                  r.ok,
                  r.latency_ms,
                  r.mbps,
                  r.bytes,
                  r.status,
                  r.error,
                ]
                  .map((v) => '"' + String(v ?? "").replaceAll('"', '""') + '"')
                  .join(","),
              ),
            ];
            const url = URL.createObjectURL(
              new Blob([lines.join("\r\n")], {
                type: "text/csv;charset=utf-8",
              }),
            );
            const a = document.createElement("a");
            a.href = url;
            a.download = `network-${item.id}.csv`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          }),
        ),
        del = button("Delete", () => deleteItem("networkTargets", item, del));
      check.disabled = !item.active;
      $("network-admin").append(
        adminRow(item.name, [edit, toggle, check, log, del]),
      );
    }
  }
  $("announcement-form").onsubmit = (e) => {
    e.preventDefault();
    perform(e.submitter, async () => {
      await request("save", {
        kind: "announcements",
        ...($("announcement-id").value
          ? { id: $("announcement-id").value }
          : {}),
        title: $("announcement-title").value,
        body: $("announcement-body").value,
        pinned: $("announcement-pinned").checked,
        active: $("announcement-active").checked,
      });
      $("announcement-form").reset();
      $("announcement-id").value = "";
    });
  };
  $("announcement-cancel").onclick = () => {
    $("announcement-form").reset();
    $("announcement-id").value = "";
  };
  $("issue-type-form").onsubmit = (e) => {
    e.preventDefault();
    perform(e.submitter, async () => {
      await request("save", {
        kind: "issueTypes",
        name: $("new-issue-type").value,
      });
      $("issue-type-form").reset();
    });
  };
  $("network-target-form").onsubmit = (e) => {
    e.preventDefault();
    perform(e.submitter, async () => {
      await request("save", {
        kind: "networkTargets",
        name: $("network-target-name").value,
        url: $("network-target-url").value,
      });
      $("network-target-form").reset();
    });
  };
  $("video-publish-form").onsubmit = (e) => {
    e.preventDefault();
    perform(e.submitter, async () => {
      const file = $("video-publish-file").files[0];
      if (!file || file.size > 50 * 1024 * 1024)
        throw new Error(t("Video must be at most 50 MB."));
      const { url } = await request("videoUpload", {
        title: $("video-publish-title").value,
        type: file.type,
        size: file.size,
      });
      $("video-upload-progress").hidden = false;
      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", url);
          xhr.setRequestHeader("Content-Type", file.type);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable)
              $("video-upload-progress").value =
                (event.loaded / event.total) * 100;
          };
          xhr.onload = () =>
            xhr.status === 200
              ? resolve()
              : reject(new Error(t("Video upload failed.")));
          xhr.onerror = () => reject(new Error(t("Video upload failed.")));
          xhr.timeout = 180000;
          xhr.ontimeout = xhr.onerror;
          xhr.send(file);
        });
        $("video-publish-form").reset();
      } finally {
        $("video-upload-progress").hidden = true;
      }
    });
  };
  let stream,
    recorder,
    chunks = [],
    recordTimer,
    size = 0,
    elapsedTimer,
    recordStarted;
  function stopStream() {
    stream?.getTracks().forEach((track) => track.stop());
    stream = undefined;
    $("capture-preview").srcObject = null;
  }
  function closeCapture() {
    if (recorder?.state === "recording") recorder.stop();
    clearTimeout(recordTimer);
    clearInterval(elapsedTimer);
    stopStream();
    $("capture-dialog").close();
  }
  $("capture-close").onclick = closeCapture;
  $("capture-dialog").addEventListener("cancel", (e) => {
    e.preventDefault();
    closeCapture();
  });
  $("open-camera").onclick = async () => {
    const cameraGeneration = generation;
    if (!state.user && !state.preview) return;
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          "Camera is not available. Use Take photo or Record video.",
        );
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (cameraGeneration !== generation || document.hidden) {
        stopStream();
        return;
      }
      $("capture-preview").srcObject = stream;
      $("capture-status").textContent = t("Camera ready.");
      $("capture-record").disabled = !window.MediaRecorder;
      $("capture-photo").disabled = false;
      $("capture-stop").disabled = true;
      $("capture-dialog").showModal();
    } catch (error) {
      stopStream();
      toast(
        t(
          "Camera unavailable or permission denied. Use the device capture buttons.",
        ),
      );
    }
  };
  $("capture-photo").onclick = () => {
    const photoGeneration = generation;
    const video = $("capture-preview");
    if (!video.videoWidth) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob && photoGeneration === generation) {
          const attached = addEvidence([
            new File([blob], `photo-${Date.now()}.jpg`, { type: "image/jpeg" }),
          ]);
          $("capture-status").textContent = t(
            attached
              ? "Photo attached."
              : "Attachment rejected. Check file limits.",
          );
        }
      },
      "image/jpeg",
      0.88,
    );
  };
  $("capture-record").onclick = () => {
    const captureGeneration = generation;
    if (!stream || !window.MediaRecorder) return;
    chunks = [];
    size = 0;
    const mime = ["video/webm;codecs=vp8", "video/webm", "video/mp4"].find(
      (type) => MediaRecorder.isTypeSupported(type),
    );
    try {
      recorder = new MediaRecorder(stream, {
        ...(mime ? { mimeType: mime } : {}),
        videoBitsPerSecond: 1800000,
      });
    } catch {
      toast("Recording is unavailable on this device.");
      return;
    }
    recorder.ondataavailable = (event) => {
      if (event.data.size) {
        chunks.push(event.data);
        size += event.data.size;
        if (size >= 24 * 1024 * 1024 && recorder.state === "recording")
          recorder.stop();
      }
    };
    recorder.onstop = () => {
      clearTimeout(recordTimer);
      clearInterval(elapsedTimer);
      const type = recorder.mimeType.split(";")[0],
        blob = new Blob(chunks, { type });
      if (captureGeneration !== generation) {
        chunks = [];
        return;
      }
      let attached = false;
      if (blob.size && blob.size <= 25 * 1024 * 1024)
        attached = addEvidence([
          new File(
            [blob],
            `recording-${Date.now()}.${type === "video/mp4" ? "mp4" : "webm"}`,
            { type },
          ),
        ]);
      else toast("Recording exceeded 25 MB. Please record a shorter clip.");
      chunks = [];
      $("capture-record").disabled = false;
      $("capture-photo").disabled = false;
      $("capture-stop").disabled = true;
      $("capture-status").textContent = t(
        attached
          ? "Video attached."
          : "Attachment rejected. Check file limits.",
      );
    };
    recorder.start(1000);
    recordStarted = Date.now();
    $("capture-record").disabled = true;
    $("capture-photo").disabled = true;
    $("capture-stop").disabled = false;
    const counter = () => {
      $("capture-status").textContent =
        `● ${t("Recording")} ${Math.floor((Date.now() - recordStarted) / 1000)} / 60s`;
    };
    counter();
    elapsedTimer = setInterval(counter, 1000);
    recordTimer = setTimeout(() => {
      if (recorder.state === "recording") recorder.stop();
    }, 60000);
  };
  $("capture-stop").onclick = () => {
    if (recorder?.state === "recording") recorder.stop();
  };
  for (const id of ["native-photo", "native-video"])
    $(id).onchange = () => {
      addEvidence([...$(id).files]);
      $(id).value = "";
    };
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      if (recorder?.state === "recording") recorder.stop();
      stopStream();
      $("workspace-video").pause();
    } else if (state.user) refresh();
  });
  const originalReset = reset;
  reset = () => {
    closeCapture();
    originalReset();
  };
  function renderCharts(issues) {
    const box = $("issue-type-chart");
    box.replaceChildren();
    const groups = issueTypeSummary(issues, snapshot.issueTypes);
    const max = Math.max(1, ...groups.map((group) => group.count));
    for (const { id, name, count } of groups) {
      const row = node("div", undefined, "type-row"),
        head = node("div");
      head.append(
        content("span", id === "__unclassified" ? t(name) : name),
        node(
          "strong",
          `${count} · ${issues.length ? Math.round((count / issues.length) * 100) : 0}%`,
        ),
      );
      const track = node("div", undefined, "bar-track"),
        fill = node("div");
      fill.style.width = `${(count / max) * 100}%`;
      track.append(fill);
      row.append(head, track);
      box.append(row);
    }
    if (!groups.length)
      box.append(node("p", "No tickets in this period.", "workspace-empty"));
    const departments = new Map();
    for (const issue of issues) {
      const group = departments.get(issue.departmentId) || {
        name: issue.departmentName,
        total: 0,
        done: 0,
      };
      group.total++;
      if (["Resolved", "Closed"].includes(issue.status)) group.done++;
      departments.set(issue.departmentId, group);
    }
    const dep = $("department-progress");
    dep.replaceChildren();
    for (const group of [...departments.values()].sort(
      (a, b) => b.total - a.total,
    )) {
      const row = node("div", undefined, "department-summary"),
        head = node("div");
      head.append(
        content("strong", group.name),
        node("span", `${group.done} / ${group.total} ${t("completed")}`),
      );
      const track = node("div", undefined, "ticket-track"),
        fill = node("i");
      fill.style.width = `${(group.done / group.total) * 100}%`;
      track.append(fill);
      row.append(head, track);
      dep.append(row);
    }
    if (!departments.size)
      dep.append(node("p", "No tickets in this period.", "workspace-empty"));
  }
  render();
  return {
    start,
    stop,
    reset,
    refresh,
    render,
    renderCharts,
    navigate(page) {
      if (["dashboard", "my-dashboard"].includes(page)) {
        renderVideo();
        if (snapshot.videos.length)
          $("workspace-video")
            .play()
            .catch(() => {});
      } else $("workspace-video").pause();
      if (page !== "create" && $("capture-dialog").open) closeCapture();
    },
    get types() {
      return snapshot.issueTypes;
    },
  };
}

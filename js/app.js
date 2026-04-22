(function () {
  "use strict";

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** In JSON, wrap phrases in **double asterisks** for bold. */
  function formatBoldMarkers(s) {
    if (s == null) return "";
    var parts = String(s).split("**");
    var out = "";
    for (var i = 0; i < parts.length; i++) {
      if (i % 2 === 0) {
        out += escapeHtml(parts[i]);
      } else {
        out += "<strong>" + escapeHtml(parts[i]) + "</strong>";
      }
    }
    return out;
  }

  function formatKpiValue(kpi, side) {
    var o = kpi[side];
    if (!o) return "—";
    if (o.display) return o.display;
    if (o.format === "currency") return "$" + Number(o.value).toFixed(2);
    if (o.format === "percent") return (o.value * 100).toFixed(2) + "%";
    return String(o.value);
  }

  function getNumericValue(kpi, side) {
    return kpi[side] && kpi[side].value != null ? Number(kpi[side].value) : null;
  }

  function isDeltaGood(kpi) {
    if (kpi.higherIsBetter) {
      return kpi.test.value > kpi.control.value;
    }
    return kpi.test.value < kpi.control.value;
  }

  function formatSigned(n) {
    var x = Math.round(n * 10) / 10;
    if (x > 0) return "+" + x + "%";
    if (x < 0) return x + "%";
    return "0%";
  }

  function kpiDeltaDisplay(kpi) {
    if (kpi.id === "margin") {
      var c = getNumericValue(kpi, "control");
      var t = getNumericValue(kpi, "test");
      if (c == null || t == null) return { text: "—", cls: "neutral" };
      var pp = (t - c) * 100;
      var cls = t > c ? "good" : t < c ? "bad" : "neutral";
      var tStr = (pp > 0 ? "+" : "") + Math.round(pp * 10) / 10;
      return { text: tStr + " pp vs control (margin %)", cls: cls };
    }
    if (kpi.upliftDisplay) {
      return { text: kpi.upliftDisplay, cls: kpi.upliftColor || "neutral" };
    }
    if (kpi.upliftPct == null) return { text: "—", cls: "neutral" };
    var p = kpi.upliftPct;
    if (kpi.higherIsBetter === false) {
      return { text: formatSigned(p) + " vs control", cls: p <= 0 ? "good" : "bad" };
    }
    return { text: formatSigned(p) + " vs control", cls: isDeltaGood(kpi) ? "good" : "bad" };
  }

  function barWidthRatio(c, t) {
    var a = Math.abs(c);
    var b = Math.abs(t);
    var m = Math.max(a, b, 1e-9);
    return { cPct: (a / m) * 100, tPct: (b / m) * 100 };
  }

  function kpiScaleForBar(kpi, c, t) {
    if (c == null || t == null) return { cPct: 0, tPct: 0 };
    if (kpi.id === "ecpi" || (kpi.control && kpi.control.format === "currency")) {
      return barWidthRatio(c, t);
    }
    if (c < 0 && t < 0) {
      return barWidthRatio(-c, -t);
    }
    if (c >= 0 && t >= 0) {
      return barWidthRatio(c, t);
    }
    var m = Math.max(Math.abs(c), Math.abs(t), 1e-9);
    return { cPct: 50 * (1 + c / m), tPct: 50 * (1 + t / m) };
  }

  var appData = null;
  var appState = {
    selectedId: null,
    search: "",
    month: "all"
  };

  function getFilteredExperiments() {
    var ex = (appData && appData.experiments) || [];
    var out = [];
    for (var i = 0; i < ex.length; i++) {
      var e = ex[i];
      if (appState.month !== "all" && e.month !== appState.month) continue;
      if (appState.search.trim()) {
        var q = appState.search.trim().toLowerCase();
        if (e.name.toLowerCase().indexOf(q) === -1) continue;
      }
      out.push(e);
    }
    return out;
  }

  function groupMonths(experiments) {
    var by = {};
    for (var i = 0; i < experiments.length; i++) {
      var m = experiments[i].month;
      if (!by[m]) by[m] = [];
      by[m].push(experiments[i]);
    }
    return { by: by, order: Object.keys(by).sort().reverse() };
  }

  function uniqueMonthKeys() {
    var ex = (appData && appData.experiments) || [];
    var s = {};
    for (var i = 0; i < ex.length; i++) {
      s[ex[i].month] = true;
    }
    return Object.keys(s).sort().reverse();
  }

  function populateMonthSelect() {
    var sel = document.getElementById("filterMonth");
    if (!sel) return;
    var v = appState.month;
    sel.innerHTML = '<option value="all">All months</option>';
    var months = uniqueMonthKeys();
    for (var j = 0; j < months.length; j++) {
      var key = months[j];
      var label = key;
      for (var i = 0; i < (appData.experiments || []).length; i++) {
        if (appData.experiments[i].month === key) {
          label = appData.experiments[i].monthLabel || key;
          break;
        }
      }
      var o = document.createElement("option");
      o.value = key;
      o.textContent = label;
      sel.appendChild(o);
    }
    if (v !== "all" && months.indexOf(v) === -1) v = "all";
    appState.month = v;
    sel.value = v;
  }

  function showFilterCount() {
    var el = document.getElementById("filterCount");
    if (!el || !appData) return;
    var total = (appData.experiments || []).length;
    var n = getFilteredExperiments().length;
    if (n === 0) {
      el.textContent = "No experiments match. Clear search or month.";
    } else if (appState.search.trim() || appState.month !== "all") {
      el.textContent = "Showing " + n + " of " + total;
    } else {
      el.textContent = n + (n === 1 ? " experiment" : " experiments");
    }
  }

  function pickExperimentInFilterOrFirst() {
    var list = getFilteredExperiments();
    if (!list.length) {
      return null;
    }
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === appState.selectedId) return list[i];
    }
    appState.selectedId = list[0].id;
    return list[0];
  }

  function onFiltersChanged() {
    var ex = pickExperimentInFilterOrFirst();
    var c = document.getElementById("experimentContent");
    renderExperimentList();
    showFilterCount();
    if (!ex) {
      if (c) {
        c.innerHTML =
          '<p class="empty">No experiments match your filters. Try a different <strong>month</strong> or <strong>search</strong> term.</p>';
      }
      return;
    }
    showExperiment(appData, ex);
  }

  function formatExperimentDuration(startIso, endIso) {
    var a = new Date(startIso).getTime();
    var b = new Date(endIso).getTime();
    var ms = b - a;
    if (isNaN(ms) || ms < 0) return "—";
    if (ms < 864e5) {
      var h = Math.floor(ms / 36e5);
      var m = Math.floor((ms % 36e5) / 6e4);
      if (h === 0) {
        return m + (m === 1 ? " minute" : " minutes");
      }
      return h + (h === 1 ? " hour " : " hours ") + m + (m === 1 ? " minute" : " minutes");
    }
    var d = ms / 864e5;
    return d.toFixed(1) + " days";
  }

  function statusToClass(statusId) {
    if (statusId === "validated") return "s-validated";
    if (statusId === "active") return "s-yellow";
    if (statusId === "learning") return "s-learning";
    if (statusId === "halted") return "s-halted";
    return "s-learning";
  }

  function findStatusDef(data, id) {
    var d = data.statusDefinitions || [];
    for (var i = 0; i < d.length; i++) {
      if (d[i].id === id) return d[i];
    }
    return { id: id, label: id, shortLabel: id, description: "", color: "blue" };
  }

  function renderLegend(data) {
    var el = document.getElementById("statusLegend");
    if (!el) return;
    el.innerHTML = (data.statusDefinitions || [])
      .map(function (s) {
        var c =
          s.color === "green"
            ? "var(--st-validated)"
            : s.color === "amber" || s.color === "yellow"
            ? "var(--st-inflight)"
            : s.color === "blue"
            ? "var(--st-learning)"
            : s.color === "red"
            ? "var(--st-halted)"
            : "#94a3b8";
        return (
          '<span class="status-legend-item" title="' +
          escapeHtml(s.description) +
          '"><span class="bar" style="background:' +
          c +
          '"></span>' +
          escapeHtml(s.label) +
          "</span>"
        );
      })
      .join("");
  }

  function buildMiniStatusPill(data, ex) {
    var def = findStatusDef(data, ex.status);
    var c =
      def.color === "green"
        ? "var(--st-validated)"
        : def.color === "amber" || def.color === "yellow"
        ? "var(--st-inflight)"
        : def.color === "blue"
        ? "var(--st-learning)"
        : "var(--st-halted)";
    return (
      '<span style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.7rem"><span style="width:0.45rem;height:0.45rem;border-radius:2px;background:' +
      c +
      '"></span>' +
      escapeHtml(def.shortLabel || def.label) +
      "</span>"
    );
  }

  function renderKpis(ex) {
    return (ex.kpis || [])
      .map(function (k) {
        var cNum = getNumericValue(k, "control");
        var tNum = getNumericValue(k, "test");
        var ratio = kpiScaleForBar(k, cNum, tNum);
        var d = kpiDeltaDisplay(k);
        return (
          '<div class="kpi-card" data-kpi-id="' +
          escapeHtml(k.id) +
          '"><div class="kpi-top"><h4 class="kpi-name">' +
          escapeHtml(k.name) +
          '</h4><span class="kpi-delta ' +
          d.cls +
          '">' +
          escapeHtml(d.text) +
          "</span></div><div class=\"kpi-legend\"><span><i></i> Control</span><span><i class=\"t\"></i> Test</span></div><div class=\"kpi-compare\"><div class=\"kpi-row\"><span class=\"kpi-label-sm\">Control</span><div class=\"kpi-bar-outer\"><div class=\"kpi-bar control\" style=\"width:" +
          ratio.cPct +
          '%\"></div></div><span class=\"kpi-right\">' +
          escapeHtml(formatKpiValue(k, "control")) +
          "</span></div><div class=\"kpi-row\"><span class=\"kpi-label-sm\">Test</span><div class=\"kpi-bar-outer\"><div class=\"kpi-bar test\" style=\"width:" +
          ratio.tPct +
          '%\"></div></div><span class=\"kpi-right\">' +
          escapeHtml(formatKpiValue(k, "test")) +
          "</span></div></div>" +
          (k.context
            ? '<p class="kpi-context">' + escapeHtml(k.context) + (k.upliftNote ? " " + escapeHtml(k.upliftNote) : "") + "</p>"
            : k.upliftNote
            ? '<p class="kpi-context">' + escapeHtml(k.upliftNote) + "</p>"
            : "") +
          "</div>"
        );
      })
      .join("");
  }

  function showExperiment(data, ex) {
    var container = document.getElementById("experimentContent");
    if (!container) return;
    var def = findStatusDef(data, ex.status);
    var statusCls = statusToClass(ex.status);

    var kpiNarr = ex.kpiNarrative
      ? '<p class="footnote" style="margin:0 0 0.6rem 0">' + escapeHtml(ex.kpiNarrative) + "</p>"
      : "";

    var resBlock = "";
    if (ex.resultsNarrative) {
      resBlock =
        '<div class="section"><h3>What happened (results)</h3><div class="card"><ul class="check">' +
        (ex.resultsNarrative.bullets || [])
          .map(function (b) {
            return "<li>" + escapeHtml(b) + "</li>";
          })
          .join("") +
        '</ul><p class="para" style="margin:0.75rem 0 0 0; font-size:0.9rem; color:var(--muted)"><em>Summary (reach, funnel, revenue, efficiency, margin):</em> ' +
        escapeHtml(ex.resultsNarrative.tableSummary) +
        "</p></div></div>";
    }

    var learnBlock = "";
    if (ex.learnings && ex.learnings.length) {
      learnBlock =
        '<div class="section"><h3>Learnings &amp; next steps</h3><div class="card"><ul class="check">' +
        ex.learnings
          .map(function (L) {
            return "<li>" + escapeHtml(L) + "</li>";
          })
          .join("") +
        "</ul></div></div>";
    }

    var isoFmt = function (d) {
      return new Date(d).toISOString().replace("T", " ").replace(".000Z", " ");
    };

    var durationStr = formatExperimentDuration(ex.startUtc, ex.endUtc);

    var designControlBody = (ex.design.control.bullets || [])
      .map(function (t) {
        return '<p class="field-value design-prose">' + formatBoldMarkers(t) + "</p>";
      })
      .join("");
    var designTestBody = (ex.design.test.bullets || [])
      .map(function (t) {
        return '<p class="field-value design-prose">' + formatBoldMarkers(t) + "</p>";
      })
      .join("");

    container.innerHTML =
      '<p class="pill-month">' +
      escapeHtml(ex.monthLabel) +
      "</p><div class=\"experiment-status " +
      statusCls +
      '\"><div class="experiment-status__body"><div class="label">' +
      escapeHtml(def.label) +
      "</div><div class=\"def\">" +
      escapeHtml(def.description) +
      "</div></div></div><h1 class=\"h-title\">" +
      escapeHtml(ex.name) +
      "</h1><p class=\"lead\">" +
      escapeHtml(ex.summary) +
      '</p><div class="section"><h3>What we ran (design)</h3><div class="card two-col"><div><h4 class="h-sub">Control</h4><p class="variant-line">' +
      escapeHtml(ex.design.control.name) +
      "</p>" +
      designControlBody +
      '</div><div><h4 class="h-sub">Test</h4><p class="variant-line">' +
      escapeHtml(ex.design.test.name) +
      "</p>" +
      designTestBody +
      "</div></div></div>" +
      '<div class="section"><h3>Goal, timing &amp; hypothesis</h3><div class="card">' +
      '<div class="field-block"><span class="field-label">Business goal</span><p class="field-value">' +
      escapeHtml(ex.businessGoal) +
      '</p></div><p class="dates" style="margin:0.65rem 0 0.15rem 0"><span><strong>Start</strong> <code class="tiny-code">' +
      escapeHtml(isoFmt(ex.startUtc)) +
      'UTC</code></span> <span><strong>End</strong> <code class="tiny-code">' +
      escapeHtml(isoFmt(ex.endUtc)) +
      'UTC</code></span></p><p class="dates duration-line" style="margin-top:0.35rem"><span class="duration-label">Experiment duration</span><span class="duration-value">' +
      escapeHtml(durationStr) +
      "</span></p>" +
      '<div class="field-block field-block--tight" style="margin-top:0.85rem"><span class="field-label">Description</span><p class="field-value">' +
      escapeHtml(ex.description) +
      '</p></div><div class="field-block field-block--tight" style="margin-top:0.9rem"><span class="field-label">Hypothesis</span><p class="field-value">' +
      escapeHtml(ex.hypothesis) +
      "</p></div></div></div>" +
      '<div class="section"><h3>KPIs: control vs test</h3>' +
      kpiNarr +
      '<div class="kpi-grid">' +
      renderKpis(ex) +
      "</div></div>" +
      resBlock +
      learnBlock;
  }

  function renderExperimentList() {
    if (!appData) return;
    var data = appData;
    var g = groupMonths(getFilteredExperiments());
    var ul = document.getElementById("experimentList");
    if (!ul) return;
    ul.innerHTML = "";
    if (!g.order.length) {
      ul.innerHTML =
        '<li style="list-style:none;font-size:0.85rem;color:var(--muted);padding:0.35rem 0.5rem 0.6rem 0.25rem">No matching experiments. Adjust <strong>search</strong> or <strong>month</strong>.</li>';
      return;
    }
    g.order.forEach(function (month) {
      var label = (g.by[month][0] && g.by[month][0].monthLabel) || month;
      var h = document.createElement("h4");
      h.className = "t-month";
      h.style.cssText = "font-size:0.68rem; text-transform:uppercase; letter-spacing:0.08em; color:var(--muted); margin:0.75rem 0.25rem 0.3rem; font-weight:600;";
      if (g.order[0] !== month) h.style.marginTop = "0.9rem";
      h.textContent = label;
      ul.appendChild(h);
      g.by[month].forEach(function (ex) {
        var li = document.createElement("li");
        li.style.margin = "0";
        li.style.listStyle = "none";
        var b = document.createElement("button");
        b.type = "button";
        b.className = "ex-item" + (appState.selectedId === ex.id ? " active" : "");
        b.setAttribute("data-id", ex.id);
        b.innerHTML =
          '<span class="ex-item-title">' +
          escapeHtml(ex.name) +
          "</span><span class=\"ex-item-meta\">" +
          buildMiniStatusPill(data, ex) +
          "</span>";
        b.addEventListener("click", function () {
          appState.selectedId = ex.id;
          document.querySelectorAll(".ex-item").forEach(function (e) {
            e.classList.toggle("active", e.getAttribute("data-id") === ex.id);
          });
          showExperiment(data, ex);
        });
        li.appendChild(b);
        ul.appendChild(li);
      });
    });
  }

  function loadData(cb) {
    var url = "data/experiments.json" + (window.__BUST__ || "");
    fetch(url)
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(cb)
      .catch(function () {
        if (window.__EMBEDDED_EXPERIMENTS) {
          cb(window.__EMBEDDED_EXPERIMENTS);
          return;
        }
        var m = document.getElementById("loadMessage");
        if (m) {
          m.className = "load-err";
          m.style.display = "block";
          m.innerHTML =
            "Could not load <code>data/experiments.json</code> (browsers block file:// requests). " +
            "From this folder run: <code class='run'>python3 -m http.server 8080</code> then open " +
            "<a href='http://127.0.0.1:8080'>http://127.0.0.1:8080</a>.";
        }
      });
  }

  function init() {
    var searchEl = document.getElementById("searchExperiments");
    var monthEl = document.getElementById("filterMonth");
    if (searchEl) {
      searchEl.addEventListener("input", function () {
        appState.search = searchEl.value;
        onFiltersChanged();
      });
    }
    if (monthEl) {
      monthEl.addEventListener("change", function () {
        appState.month = monthEl.value;
        onFiltersChanged();
      });
    }

    loadData(function (data) {
      var m = document.getElementById("loadMessage");
      if (m) m.style.display = "none";
      appData = data;
      if (data.experiments && data.experiments.length) {
        appState.selectedId = data.experiments[0].id;
        appState.search = (searchEl && searchEl.value) || "";
        appState.month = (monthEl && monthEl.value) || "all";
        renderLegend(data);
        populateMonthSelect();
        var first = pickExperimentInFilterOrFirst();
        renderExperimentList();
        showFilterCount();
        if (first) {
          showExperiment(data, first);
        }
      } else {
        if (searchEl) searchEl.disabled = true;
        if (monthEl) monthEl.disabled = true;
        var c = document.getElementById("experimentContent");
        if (c) c.innerHTML = "<p class=\"empty\">Add experiments in <code>data/experiments.json</code>.</p>";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

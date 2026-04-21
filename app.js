const storageKey = "cinema-circle-state-v4";
const remoteSaveDelay = 450;
const dendyShowtimesUrl = "https://newtown.dendy.com.au/app-showtimes/";
const dendySessionsProxy = "/.netlify/functions/dendy-sessions";
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const slotNames = ["Mat", "Aft", "Eve"];
const slotHours = {
  Mat: [9, 13],
  Aft: [13, 17],
  Eve: [17, 24],
};

const starterState = () => {
  const now = new Date();
  const weekStart = startOfCinemaWeek(now);

  return {
    weekStart: toISODate(weekStart),
    films: [],
    sessions: [],
    friends: [],
  };
};

let state = loadState();
let remoteSaveTimer = null;
let remoteReady = false;
sanitizeImportedFilms();

const els = {
  weekStart: document.querySelector("#weekStart"),
  weekLabel: document.querySelector("#weekLabel"),
  prevWeek: document.querySelector("#prevWeek"),
  nextWeek: document.querySelector("#nextWeek"),
  resetDemo: document.querySelector("#resetDemo"),
  updateMatches: document.querySelector("#updateMatches"),
  importDendy: document.querySelector("#importDendy"),
  importStatus: document.querySelector("#importStatus"),
  matches: document.querySelector("#matches"),
  filmForm: document.querySelector("#filmForm"),
  filmTitle: document.querySelector("#filmTitle"),
  filmEnds: document.querySelector("#filmEnds"),
  filmNote: document.querySelector("#filmNote"),
  filmList: document.querySelector("#filmList"),
  sessionForm: document.querySelector("#sessionForm"),
  sessionFilm: document.querySelector("#sessionFilm"),
  sessionDate: document.querySelector("#sessionDate"),
  sessionTime: document.querySelector("#sessionTime"),
  sessionList: document.querySelector("#sessionList"),
  friendForm: document.querySelector("#friendForm"),
  friendName: document.querySelector("#friendName"),
  friendList: document.querySelector("#friendList"),
  matchTemplate: document.querySelector("#matchTemplate"),
};

wireEvents();
render();
loadRemoteWeekState(state.weekStart);

function wireEvents() {
  els.weekStart.addEventListener("change", () => {
    state.weekStart = toISODate(startOfCinemaWeek(parseDate(els.weekStart.value)));
    saveAndRender();
    loadRemoteWeekState(state.weekStart);
  });

  els.prevWeek.addEventListener("click", () => moveWeek(-7));
  els.nextWeek.addEventListener("click", () => moveWeek(7));
  els.importDendy.addEventListener("click", importDendyShowtimes);
  els.updateMatches.addEventListener("click", updateMatchesFromSchedule);

  els.resetDemo.addEventListener("click", () => {
    localStorage.removeItem(storageKey);
    state = starterState();
    saveAndRender();
  });

  els.filmForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.films.push({
      id: createId(),
      title: els.filmTitle.value.trim(),
      ends: els.filmEnds.value,
      note: els.filmNote.value.trim(),
    });
    els.filmForm.reset();
    saveAndRender();
  });

  els.sessionForm.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!els.sessionFilm.value) return;
    state.sessions.push({
      id: createId(),
      filmId: els.sessionFilm.value,
      date: els.sessionDate.value,
      time: els.sessionTime.value,
    });
    els.sessionForm.reset();
    saveAndRender();
  });

  els.friendForm.addEventListener("submit", (event) => {
    event.preventDefault();
    state.friends.push(friend(els.friendName.value.trim(), [], {}));
    els.friendForm.reset();
    saveAndRender();
  });
}

function render() {
  els.weekStart.value = state.weekStart;
  els.weekLabel.textContent = `Week starting ${formatWeekStart(state.weekStart)}`;
  renderFilmSelect();
  renderFilms();
  renderSessions();
  renderFriends();
  renderMatches();
}

function renderFilmSelect() {
  els.sessionFilm.innerHTML = "";
  els.sessionFilm.disabled = !state.films.length;
  if (!state.films.length) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Add or import films first";
    els.sessionFilm.append(option);
    return;
  }
  state.films.forEach((film) => {
    const option = document.createElement("option");
    option.value = film.id;
    option.textContent = film.title;
    els.sessionFilm.append(option);
  });
}

function sanitizeImportedFilms() {
  let changed = false;
  state.films.forEach((film) => {
    if (film.source === "dendy" && film.ends) {
      film.ends = "";
      changed = true;
    }
  });
  if (changed) saveState();
}

function renderFilms() {
  els.filmList.innerHTML = "";
  if (!state.films.length) {
    els.filmList.append(emptyState("Add the films currently on your radar."));
    return;
  }

  state.films.forEach((film) => {
    const item = document.createElement("article");
    item.className = "list-item";
    const meta = [film.ends ? `Ends ${formatDate(film.ends)}` : "", film.note || ""]
      .filter(Boolean)
      .map(escapeHTML)
      .join(" · ");
    item.innerHTML = `
      <div>
        <strong>${escapeHTML(film.title)}</strong>
        ${meta ? `<p class="meta-line">${meta}</p>` : ""}
      </div>
    `;
    const button = deleteButton("Remove film");
    button.addEventListener("click", () => {
      state.films = state.films.filter((candidate) => candidate.id !== film.id);
      state.sessions = state.sessions.filter((candidate) => candidate.filmId !== film.id);
      state.friends = state.friends.map((candidate) => {
        delete candidate.preferences[film.id];
        return candidate;
      });
      saveAndRender();
    });
    item.append(button);
    els.filmList.append(item);
  });
}

function renderSessions() {
  els.sessionList.innerHTML = "";
  const sessions = weeklySessions().sort(byDateTime);
  if (!sessions.length) {
    els.sessionList.append(emptyState("No sessions for this week yet."));
    return;
  }

  sessions.forEach((show) => {
    const film = findFilm(show.filmId);
    const item = document.createElement("article");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <strong>${escapeHTML(film?.title || "Deleted film")}</strong>
        <p class="meta-line">${formatDate(show.date)} at ${show.time}${show.source === "dendy" ? " · Dendy Newtown" : ""}</p>
      </div>
    `;
    const button = deleteButton("Remove session");
    button.addEventListener("click", () => {
      state.sessions = state.sessions.filter((candidate) => candidate.id !== show.id);
      saveAndRender();
    });
    item.append(button);
    els.sessionList.append(item);
  });
}

function renderFriends() {
  els.friendList.innerHTML = "";
  if (!state.friends.length) {
    els.friendList.append(emptyState("Add friends, then set availability and film preferences."));
    return;
  }

  state.friends.forEach((person) => {
    const card = document.createElement("article");
    card.className = "friend-card";

    const top = document.createElement("div");
    top.className = "friend-topline";
    top.innerHTML = `<strong>${escapeHTML(person.name)}</strong>`;
    const remove = deleteButton("Remove friend");
    remove.addEventListener("click", () => {
      state.friends = state.friends.filter((candidate) => candidate.id !== person.id);
      saveAndRender();
    });
    top.append(remove);
    card.append(top);

    card.append(sectionLabel("Availability"));
    const availability = document.createElement("div");
    availability.className = "availability-grid";
    availabilitySlots().forEach((slot) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `slot-toggle ${person.availability.includes(slot.key) ? "is-on" : ""}`;
      button.innerHTML = `<span>${slot.dateLabel}</span><strong>${slot.label}</strong>`;
      button.addEventListener("click", () => {
        toggle(person.availability, slot.key);
        saveAndRender();
      });
      availability.append(button);
    });
    card.append(availability);

    card.append(sectionLabel("Preferences"));
    const preferences = document.createElement("div");
    preferences.className = "preference-grid";
    state.films.forEach((film) => {
      const row = document.createElement("label");
      row.className = "preference-row";
      row.innerHTML = `<span title="${escapeHTML(film.title)}">${escapeHTML(film.title)}</span>`;
      const select = document.createElement("select");
      [
        ["want", "Want"],
        ["maybe", "Maybe"],
        ["seen", "Seen"],
        ["skip", "Skip"],
      ].forEach(([value, label]) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = label;
        select.append(option);
      });
      select.value = person.preferences[film.id] || "skip";
      select.addEventListener("change", () => {
        person.preferences[film.id] = select.value;
        saveAndRender();
      });
      row.append(select);
      preferences.append(row);
    });
    card.append(preferences);
    els.friendList.append(card);
  });
}

function renderMatches() {
  els.matches.innerHTML = "";
  if (!state.friends.length) {
    els.matches.append(emptyState("Add people first, then import sessions and choose preferences."));
    return;
  }

  const matches = exactMatches();

  if (matches.length) {
    renderExactMatches(matches);
    return;
  }

  const potentialMatches = buildPotentialMatches();
  if (potentialMatches.length) {
    renderPotentialMatches(potentialMatches);
    return;
  }

  els.matches.append(
    emptyState("No matches yet. Mark at least two people available at the same time and choose Want or Maybe for the same film."),
  );
}

function renderExactMatches(matches) {
  matches.slice(0, 6).forEach((match) => {
    const card = els.matchTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".match-time").innerHTML = `
      <span>${dayNames[parseDate(match.session.date).getDay()]}</span>
      <span>${match.session.time}</span>
    `;
    card.querySelector("h3").textContent = match.film.title;
    card.querySelector("p").textContent = `${formatDate(match.session.date)} · ${match.film.note || "No note"}`;

    const chips = card.querySelector(".chips");
    match.available.forEach((person) => {
      chips.append(chip(person.name, "good"));
    });
    match.seenOrSkip.forEach((person) => {
      chips.append(chip(`${person.name}: ${person.preference}`, "muted"));
    });
    if (match.film.ends && daysUntil(match.film.ends) <= 7) {
      chips.append(chip("leaves soon", "warning"));
    }
    els.matches.append(card);
  });
}

function renderPotentialMatches(matches) {
  matches.slice(0, 6).forEach((match) => {
    const card = els.matchTemplate.content.firstElementChild.cloneNode(true);
    card.querySelector(".match-time").innerHTML = `
      <span>${dayNames[parseDate(match.date).getDay()]}</span>
      <span>${match.slot}</span>
    `;
    card.querySelector("h3").textContent = match.film.title;
    card.querySelector("p").textContent = `${formatDate(match.date)} · shared availability window`;

    const chips = card.querySelector(".chips");
    match.people.forEach((person) => {
      chips.append(chip(person.name, "good"));
    });
    chips.append(chip("no exact session yet", "muted"));
    els.matches.append(card);
  });
}

async function updateMatchesFromSchedule() {
  if (!state.friends.length) {
    renderMatches();
    return;
  }

  const checkedSchedule = await importDendySchedule({ renderAfter: false, quiet: false });
  renderMatches();

  if (checkedSchedule && !exactMatches().length && buildPotentialMatches().length) {
    setImportStatus(
      "Dendy sessions were checked, but none exactly match the shared availability windows yet.",
    );
  }
}

async function importDendyShowtimes(options = {}) {
  const { renderAfter = true, quiet = false } = options;
  if (!quiet) setImportStatus("Importing Dendy Newtown films...");
  els.importDendy.disabled = true;
  els.updateMatches.disabled = true;

  try {
    const importedFilms = await fetchDendyFilmList();
    if (!importedFilms.length) {
      throw new Error("No films were found on the Dendy page.");
    }

    const importedFilmIds = syncDendyFilms(importedFilms);
    saveState();
    if (renderAfter) render();
    if (!quiet) {
      setImportStatus(`Imported ${importedFilmIds.size} films from Dendy Newtown.`);
    }
  } catch (error) {
    const message =
      error instanceof TypeError
        ? "Dendy blocks dated schedule requests from static sites. A tiny backend/proxy is needed for true Thu-Wed importing."
        : `Could not import Dendy showtimes: ${error.message}. The site may have changed or be briefly unavailable.`;
    setImportStatus(
      message,
      true,
    );
  } finally {
    els.importDendy.disabled = false;
    els.updateMatches.disabled = false;
  }
}

async function importDendySchedule(options = {}) {
  const { renderAfter = true, quiet = false } = options;
  if (!quiet) setImportStatus("Checking Dendy Newtown sessions for this cinema week...");
  els.importDendy.disabled = true;
  els.updateMatches.disabled = true;

  try {
    const weekStart = parseDate(state.weekStart);
    const sessions = await fetchDendyWeekSessions(weekStart);
    if (!sessions.length) {
      throw new Error("No dated sessions were found for this cinema week.");
    }

    const importedFilmIds = syncDendyFilms(sessions);
    const dendySessions = sessions.map((show) => ({
      id: show.showingId,
      filmId: importedFilmIds.get(normalizeTitle(show.title)),
      date: show.date,
      time: show.time,
      source: "dendy",
      sourceUrl: show.url,
    }));

    state.sessions = state.sessions.filter((show) => {
      if (show.source !== "dendy") return true;
      const date = parseDate(show.date);
      return date < weekStart || date >= addDays(weekStart, 10);
    });
    state.sessions.push(...dendySessions);
    saveState();
    if (renderAfter) render();
    if (!quiet) {
      setImportStatus(`Checked ${dendySessions.length} dated Dendy sessions.`);
    }
    return true;
  } catch (error) {
    if (!quiet) {
      setImportStatus(`Could not check Dendy sessions: ${error.message}`, true);
    }
    return false;
  } finally {
    els.importDendy.disabled = false;
    els.updateMatches.disabled = false;
  }
}

async function fetchDendyFilmList() {
  const response = await fetch(`${dendyShowtimesUrl}?t=${Date.now()}`);
  if (!response.ok) throw new Error(`Dendy returned ${response.status}`);
  const html = await response.text();
  const document = new DOMParser().parseFromString(html, "text/html");
  const links = Array.from(document.querySelectorAll('a[href*="/movie/"]'));
  const filmsByTitle = new Map();
  links.forEach((link) => {
    const title = link.textContent.trim();
    if (!title) return;
    filmsByTitle.set(normalizeTitle(title), {
      title,
      url: link.href,
    });
  });
  return Array.from(filmsByTitle.values());
}

async function fetchDendyWeekSessions(weekStart) {
  const dates = Array.from({ length: 10 }, (_, index) => toISODate(addDays(weekStart, index)));
  const response = await fetch(`${dendySessionsProxy}?dates=${dates.join(",")}`);
  if (!response.ok) throw new Error(`Dendy returned ${response.status}`);
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error);
  return payload.sessions || [];
}

function syncDendyFilms(imported) {
  const idsByTitle = new Map(state.films.map((film) => [normalizeTitle(film.title), film.id]));

  imported.forEach((film) => {
    const key = normalizeTitle(film.title);
    if (idsByTitle.has(key)) return;

    const newFilm = {
      id: createId(),
      title: film.title,
      ends: "",
      note: "Dendy Newtown",
      source: "dendy",
      sourceUrl: film.url,
    };
    state.films.push(newFilm);
    idsByTitle.set(key, newFilm.id);
  });

  return idsByTitle;
}

function normalizeTitle(title) {
  return title
    .toLowerCase()
    .replaceAll("&quot;", '"')
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function setImportStatus(message, isError = false) {
  els.importStatus.textContent = message;
  els.importStatus.classList.toggle("is-visible", Boolean(message));
  els.importStatus.classList.toggle("is-error", isError);
}

function scoreSession(show) {
  const film = findFilm(show.filmId);
  const slot = sessionSlot(show);
  const available = [];
  const seenOrSkip = [];
  let score = 0;

  state.friends.forEach((person) => {
    const preference = person.preferences[show.filmId] || "skip";
    const canAttend = person.availability.includes(slot);
    if (canAttend && preference === "want") {
      score += 3;
      available.push(person);
    } else if (canAttend && preference === "maybe") {
      score += 1;
      available.push(person);
    } else if (canAttend && ["seen", "skip"].includes(preference)) {
      score -= 2;
      seenOrSkip.push({ ...person, preference });
    }
  });

  if (film && daysUntil(film.ends) <= 7) score += 1;
  return { session: show, film, slot, available, seenOrSkip, score };
}

function exactMatches() {
  return weeklySessions()
    .map(scoreSession)
    .filter((match) => match.film && match.available.length)
    .sort((a, b) => b.score - a.score || byDateTime(a.session, b.session));
}

function buildPotentialMatches() {
  return state.films
    .flatMap((film) =>
      availabilitySlots().map((slot) => {
        const people = [];
        let score = 0;

        state.friends.forEach((person) => {
          const preference = person.preferences[film.id] || "skip";
          if (!person.availability.includes(slot.key)) return;
          if (preference === "want") {
            people.push(person);
            score += 3;
          } else if (preference === "maybe") {
            people.push(person);
            score += 1;
          }
        });

        return {
          date: slot.date,
          film,
          people,
          score,
          slot: slot.slot,
        };
      }),
    )
    .filter((match) => match.people.length >= 2)
    .sort((a, b) => b.score - a.score || `${a.date}-${a.slot}`.localeCompare(`${b.date}-${b.slot}`));
}

function weeklySessions() {
  const start = parseDate(state.weekStart);
  const end = addDays(start, 10);
  return state.sessions.filter((show) => {
    const date = parseDate(show.date);
    return date >= start && date < end;
  });
}

function availabilitySlots() {
  const start = parseDate(state.weekStart);
  return Array.from({ length: 10 }, (_, dayOffset) => addDays(start, dayOffset)).flatMap((date) =>
    slotNames.map((slot) => {
      const dateKey = toISODate(date);
      return {
        date: dateKey,
        key: `${dateKey}-${slot}`,
        label: `${dayNames[date.getDay()]} ${slot}`,
        dateLabel: formatShortDate(dateKey),
        slot,
      };
    }),
  );
}

function sessionSlot(show) {
  const date = parseDate(show.date);
  const hour = Number(show.time.split(":")[0]);
  const slot = Object.entries(slotHours).find(([, [start, end]]) => hour >= start && hour < end);
  return `${show.date}-${slot?.[0] || "Eve"}`;
}

function moveWeek(days) {
  state.weekStart = toISODate(addDays(parseDate(state.weekStart), days));
  saveAndRender();
}

function saveAndRender() {
  saveState();
  render();
}

function loadState() {
  const raw = localStorage.getItem(storageKey);
  if (!raw) return starterState();
  try {
    return normalizeState(JSON.parse(raw));
  } catch {
    return starterState();
  }
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  queueRemoteSave();
}

async function loadRemoteWeekState(weekStart) {
  const config = supabaseConfig();
  if (!config) return;

  try {
    const response = await fetch(
      `${config.url}/rest/v1/cinema_planner_weeks?week_start=eq.${encodeURIComponent(weekStart)}&select=data`,
      {
        headers: supabaseHeaders(config),
      },
    );
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);

    const rows = await response.json();
    remoteReady = true;
    if (!rows.length) {
      queueRemoteSave();
      return;
    }

    state = normalizeState({
      ...rows[0].data,
      weekStart,
    });
    localStorage.setItem(storageKey, JSON.stringify(state));
    render();
  } catch (error) {
    console.warn("Could not load shared cinema week", error);
  }
}

function queueRemoteSave() {
  const config = supabaseConfig();
  if (!config || !remoteReady) return;
  clearTimeout(remoteSaveTimer);
  remoteSaveTimer = setTimeout(() => saveRemoteState(config), remoteSaveDelay);
}

async function saveRemoteState(config) {
  try {
    const response = await fetch(`${config.url}/rest/v1/cinema_planner_weeks`, {
      method: "POST",
      headers: {
        ...supabaseHeaders(config),
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({
        week_start: state.weekStart,
        data: state,
        updated_at: new Date().toISOString(),
      }),
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status}`);
    remoteReady = true;
  } catch (error) {
    console.warn("Could not save shared cinema week", error);
  }
}

function supabaseConfig() {
  const config = window.CINEMA_CONFIG || {};
  if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) return null;
  return {
    url: config.SUPABASE_URL.replace(/\/$/, ""),
    key: config.SUPABASE_ANON_KEY,
  };
}

function supabaseHeaders(config) {
  return {
    apikey: config.key,
    authorization: `Bearer ${config.key}`,
    "content-type": "application/json",
  };
}

function normalizeState(candidate) {
  return {
    weekStart: candidate.weekStart || toISODate(startOfCinemaWeek(new Date())),
    films: Array.isArray(candidate.films) ? candidate.films : [],
    sessions: Array.isArray(candidate.sessions) ? candidate.sessions : [],
    friends: Array.isArray(candidate.friends) ? candidate.friends : [],
  };
}

function session(filmId, date, time) {
  return {
    id: createId(),
    filmId,
    date: toISODate(date),
    time,
  };
}

function friend(name, availability, preferences) {
  return {
    id: createId(),
    name,
    availability,
    preferences,
  };
}

function findFilm(id) {
  return state.films.find((film) => film.id === id);
}

function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function startOfCinemaWeek(date) {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  const daysSinceThursday = (copy.getDay() + 3) % 7;
  copy.setDate(copy.getDate() - daysSinceThursday);
  return copy;
}

function addDays(date, days) {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
}

function parseDate(value) {
  if (value instanceof Date) return new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function toISODate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatShortDate(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function formatWeekStart(value) {
  return parseDate(value).toLocaleDateString(undefined, {
    day: "numeric",
    month: "long",
  });
}

function daysUntil(value) {
  const today = startOfCinemaWeek(new Date());
  const target = parseDate(value);
  return Math.round((target - today) / 86400000);
}

function byDateTime(a, b) {
  return `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`);
}

function toggle(list, value) {
  const index = list.indexOf(value);
  if (index >= 0) list.splice(index, 1);
  else list.push(value);
}

function sectionLabel(text) {
  const label = document.createElement("p");
  label.className = "section-label";
  label.textContent = text;
  return label;
}

function deleteButton(label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "danger-button";
  button.setAttribute("aria-label", label);
  button.textContent = "×";
  return button;
}

function chip(text, tone) {
  const element = document.createElement("span");
  element.className = `chip ${tone === "muted" ? "muted" : ""} ${tone === "warning" ? "warning" : ""}`;
  element.textContent = text;
  return element;
}

function emptyState(text) {
  const item = document.createElement("p");
  item.className = "empty-state";
  item.textContent = text;
  return item;
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

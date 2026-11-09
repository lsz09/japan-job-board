"use strict";

const types = { internship: "인턴십", briefing: "회사설명회", early: "조기선고", main: "본선고" };
const sources = { mynavi: "마이나비", rikunabi: "리쿠나비", onecareer: "원커리어", gaishi: "외자취활", official: "기업 공식 채용" };
const regions = {
  hokkaido: "홋카이도", tohoku: "도호쿠", kanto: "간토", chubu: "주부", kinki: "긴키·간사이",
  chugoku: "주고쿠", shikoku: "시코쿠", kyushu: "규슈·오키나와", nationwide: "전국",
  online: "온라인", unknown: "지역 미정",
};
const sourceDomains = { mynavi: "job.mynavi.jp", rikunabi: "job.rikunabi.com", onecareer: "onecareer.jp", gaishi: "gaishishukatsu.com" };
const industries = {
  it: "IT·통신", manufacturing: "제조", finance: "금융", consulting: "컨설팅", "real-estate": "부동산",
  retail: "유통·소매", infrastructure: "인프라·물류", media: "광고·미디어", healthcare: "의료·제약", other: "기타", unknown: "업계 미확인",
};
const dayMs = 86_400_000;
const jst = "Asia/Tokyo";
const dayFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: jst, dateStyle: "short" });
const headingFormatter = new Intl.DateTimeFormat("ko-KR", {
  timeZone: jst, year: "numeric", month: "long", day: "numeric", weekday: "short",
});
const monthFormatter = new Intl.DateTimeFormat("en", { timeZone: jst, month: "short" });

const query = document.querySelector("#query");
const sourceFilter = document.querySelector("#source-filter");
const regionFilter = document.querySelector("#region-filter");
const companyFilter = document.querySelector("#company-filter");
const industryFilter = document.querySelector("#industry-filter");
const formatFilter = document.querySelector("#format-filter");
const sizeFilter = document.querySelector("#size-filter");
const deadlineFilter = document.querySelector("#deadline-filter");
const layoutFilter = document.querySelector("#layout-filter");
const includeClosed = document.querySelector("#include-closed");
const deadlines = document.querySelector("#deadlines");
const viewButtons = document.querySelectorAll("[data-view]");
const typeButtons = document.querySelectorAll("[data-type]");

function deadlineTime({ date, time }) {
  if (!date) return Infinity;
  const clock = time ? `${time}:00` : "23:59:59.999";
  return Date.parse(`${date}T${clock}+09:00`);
}

function httpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function validDate(job) {
  if (job.date == null || job.date === "") return !job.time;
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(job.date)) return false;
  const endOfDay = deadlineTime({ date: job.date });
  return Number.isFinite(endOfDay) && dayFormatter.format(endOfDay) === job.date;
}

function validJob(job) {
  return job && validDate(job) &&
    typeof job.id === "string" && typeof job.company === "string" && typeof job.title === "string" &&
    Object.hasOwn(types, job.type) && Object.hasOwn(sources, job.source) &&
    (!job.time || /^([01]\d|2[0-3]):[0-5]\d$/.test(job.time)) && httpUrl(job.url);
}

const dailyScan = window.dailyScan ?? {};
function validBoardJob(job) {
  if (!validJob(job)) return false;
  const hostname = new URL(job.url).hostname;
  const domain = sourceDomains[job.source];
  const companyUrl = httpUrl(dailyScan.companies?.[job.company]?.url);
  const companyDomain = companyUrl ? new URL(companyUrl).hostname.replace(/^www\./, "") : "";
  const matchesSource = job.source === "official"
    ? companyDomain && (hostname === companyDomain || hostname.endsWith(`.${companyDomain}`))
    : hostname === domain || hostname === `www.${domain}`;
  return matchesSource &&
    Number.isInteger(job.employeeCount) && job.employeeCount >= 300 && httpUrl(job.companySizeUrl) &&
    Array.isArray(job.regions) && job.regions.length > 0 && job.regions.every(region => Object.hasOwn(regions, region));
}

const dailyJobs = (Array.isArray(dailyScan.jobs) ? dailyScan.jobs : []).filter(validBoardJob);
const cloudJobs = dailyJobs.filter(job =>
  /클라우드|\b(?:AWS|Azure|GCP|Google Cloud|Salesforce)\b/i.test(`${job.title} ${job.summary ?? ""}`));
const currentJobs = new Map(dailyJobs.map(job => [job.id, job]));
const applicationPrefix = "japan-job-board:applied:";
const applicationStatus = document.querySelector("#application-status");
const appliedJobs = document.querySelector("#applied-jobs");
const calendarDays = document.querySelector("#calendar-days");
const calendarAgenda = document.querySelector("#calendar-agenda");
let applications = new Map();
let calendarMonth = dayFormatter.format(new Date()).slice(0, 7);
let view = "daily";
let activeType = "";
const expandedCompanies = new Set();

function jobIndustry(job) {
  const industry = dailyScan.companies?.[job.company]?.industry ?? job.industry;
  return Object.hasOwn(industries, industry) ? industry : "unknown";
}

function readApplications() {
  try {
    const storage = window.localStorage;
    const records = new Map();
    for (const key of Object.keys(storage)) {
      if (!key.startsWith(applicationPrefix)) continue;
      try {
        const record = JSON.parse(storage.getItem(key));
        if (validBoardJob(record?.job) && key === applicationPrefix + record.job.id) {
          records.set(record.job.id, record);
        }
      } catch {
        // Keep other records readable if this entry is damaged.
      }
    }
    applications = records;
  } catch {
    applicationStatus.textContent = "브라우저에서 지원 기록을 읽을 수 없어요. 사이트 저장 공간 설정을 확인해 주세요.";
  }
}

function savedApplications() {
  return [...applications.values()].map(record => {
    const job = currentJobs.get(record.job.id) ?? record.job;
    return { job, company: dailyScan.companies?.[job.company] ?? record.company };
  }).sort((a, b) => deadlineTime(a.job) - deadlineTime(b.job));
}

function updateApplication(job, company, button, remove) {
  const key = applicationPrefix + job.id;
  try {
    if (remove) {
      window.localStorage.removeItem(key);
      applications.delete(job.id);
    } else {
      const record = { job, company: company ?? null };
      window.localStorage.setItem(key, JSON.stringify(record));
      applications.set(job.id, record);
    }
  } catch {
    applicationStatus.textContent = "지원 기록을 변경할 수 없어요. 브라우저의 사이트 저장 공간 설정을 확인해 주세요.";
    return;
  }
  applicationStatus.textContent = remove ? "지원 기록에서 삭제했어요." : "지원한 공고와 캘린더에 저장했어요.";
  if (view === "applied") {
    const index = [...appliedJobs.querySelectorAll(".application-button")].indexOf(button);
    renderApplied(new Date());
    const buttons = appliedJobs.querySelectorAll(".application-button");
    (buttons[Math.min(index, buttons.length - 1)] ?? document.querySelector("#applied-title")).focus();
  } else {
    setApplicationButton(button, job, false);
  }
}

function element(tag, className, value) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}

function externalLink(url, label, className, accessibleLabel) {
  const link = element("a", className, label);
  link.href = httpUrl(url);
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  if (accessibleLabel) link.setAttribute("aria-label", accessibleLabel);
  return link;
}

function addDetail(list, label, value) {
  if (!value) return;
  const row = element("div");
  const detail = element("dd");
  detail.append(value);
  row.append(element("dt", "", label), detail);
  list.append(row);
}

function renderCompanyInfo(job, company = dailyScan.companies?.[job.company]) {
  const box = element("div", "company-info");
  const facts = element("dl", "company-facts");
  const sizeLabel = `${company?.sizeApproximate ? "약 " : ""}${job.employeeCount.toLocaleString("ko-KR")}명`;
  const size = externalLink(job.companySizeUrl, sizeLabel, "", `${job.company} 종업원 ${sizeLabel} 근거 (새 탭)`);
  addDetail(facts, "종업원 수", size);
  addDetail(facts, "업계", industries[company?.industry ?? job.industry]);
  addDetail(facts, "본사 주소", company?.address);
  addDetail(facts, "주요 사업", company?.business);
  box.append(facts);
  if (httpUrl(company?.url)) box.append(externalLink(company.url, "회사 자료 ↗", "company-source", `${job.company} 회사 자료 (새 탭)`));
  return box;
}

function renderDailyStatus(today) {
  const date = Date.parse(dailyScan.checkedAt ?? "");
  const note = document.querySelector("#board-note");
  const scannedToday = Number.isFinite(date) && dayFormatter.format(date) === today;
  const lastCheck = Number.isFinite(date) ? headingFormatter.format(date) : "아직 검색 기록 없음";
  note.textContent = `28졸 · IT 엔지니어 · 채용 법인 사원 300명 이상 | 공개 목록 · 최근 확인 ${lastCheck}`;
  if (Number.isFinite(date) && !scannedToday) note.textContent += " · 오늘 검색 기록 없음";

  const statusLabels = { checked: "검색 기록 있음", partial: "일부 확인", unavailable: "확인 어려움" };
  const statusList = document.querySelector("#scan-sources");
  const trackList = document.querySelector("#scan-tracks");
  statusList.replaceChildren();
  trackList.replaceChildren();
  for (const key of Object.keys(sourceDomains)) {
    const name = sources[key];
    const status = dailyScan.sources?.[key];
    const validStatus = Object.hasOwn(statusLabels, status);
    const tracks = dailyScan.coverage?.[key] ?? [];
    const opened = tracks.reduce((count, track) => count + track.pages.length, 0);
    const complete = tracks.length > 0 && tracks.every(track => track.status === "complete");
    const label = tracks.length
      ? `${opened}페이지 열람 · ${complete ? "기록된 목록 순회 완료" : "추가 확인 필요"}`
      : (validStatus ? statusLabels[status] : "검색 기록 없음");
    statusList.append(element("li", tracks.length && !complete ? "partial" : status, `${name} · ${label}`));

    for (const track of tracks) {
      const labels = { pending: "확인 대기", in_progress: "확인 중", partial: "일부 확인", complete: "목록 끝까지 확인", unavailable: "접근 어려움" };
      const row = element("li");
      row.append(element("strong", "", `${name} · ${track.label}`));
      const state = `${labels[track.status] ?? "상태 미기록"} · ${track.pages.length}페이지 열람`;
      const pending = track.pending?.length ? ` · 상세 확인 대기 ${track.pending.length}건` : "";
      row.append(element("span", "", `${state}${pending}${track.checkedOn ? ` · ${track.checkedOn}` : ""}`));
      if (track.note) row.append(element("span", "", track.note));
      const links = element("div", "scan-links");
      for (const page of track.pages) {
        if (httpUrl(page.url)) links.append(externalLink(page.url, page.label, "", `${name} ${track.label} ${page.label} (새 탭)`));
      }
      if (httpUrl(track.nextUrl)) links.append(externalLink(track.nextUrl, "다음 확인 위치 ↗"));
      if (!track.pages.length && !track.nextUrl && httpUrl(track.startUrl)) links.append(externalLink(track.startUrl, "목록 열기 ↗"));
      row.append(links);
      trackList.append(row);
    }
  }
  document.querySelector("#scan-coverage").hidden = !trackList.childElementCount;
}

for (const [key, label] of Object.entries(regions)) {
  const option = element("option", "", label);
  option.value = key;
  regionFilter.append(option);
}
const availableIndustries = new Set(dailyJobs.map(jobIndustry));
for (const [key, label] of Object.entries(industries)) {
  if (!availableIndustries.has(key)) continue;
  const option = element("option", "", label);
  option.value = key;
  industryFilter.append(option);
}
const companies = [...new Set(dailyJobs.map(job => job.company))].sort((a, b) => a.localeCompare(b, "ko"));
for (const company of companies) companyFilter.append(element("option", "", company));

const filterParams = {
  source: sourceFilter, industry: industryFilter, region: regionFilter, format: formatFilter,
  size: sizeFilter, deadline: deadlineFilter, company: companyFilter,
};
const initialParams = new URLSearchParams(window.location.search);
for (const [key, input] of Object.entries(filterParams)) {
  const value = initialParams.get(key);
  if ([...input.options].some(option => option.value === value)) input.value = value;
}
const requestedType = initialParams.get("type");
if (Object.hasOwn(types, requestedType)) activeType = requestedType;
query.value = initialParams.get("q") ?? "";
includeClosed.checked = initialParams.get("closed") === "1";
if (initialParams.get("layout") === "date") layoutFilter.value = "date";

function rememberFilters() {
  if (!/^https?:$/.test(window.location.protocol)) return;
  const url = new URL(window.location.href);
  const values = { ...Object.fromEntries(Object.entries(filterParams).map(([key, input]) => [key, input.value])),
    type: activeType, q: query.value.trim(), closed: includeClosed.checked ? "1" : "", layout: layoutFilter.value === "date" ? "date" : "" };
  for (const [key, value] of Object.entries(values)) {
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
  }
  if (url.href !== window.location.href) history.replaceState(null, "", url);
}

function matchesDailyFilters(job, deadline, now, today) {
  if (regionFilter.value && !job.regions.includes(regionFilter.value)) return false;
  if (companyFilter.value && job.company !== companyFilter.value) return false;
  if (industryFilter.value && jobIndustry(job) !== industryFilter.value) return false;
  if (sizeFilter.value && job.employeeCount < Number(sizeFilter.value)) return false;
  if (formatFilter.value === "online" && !job.regions.includes("online")) return false;
  if (formatFilter.value === "onsite" &&
    (!["internship", "briefing"].includes(job.type) || !job.regions.some(region => !["online", "unknown"].includes(region)))) return false;

  const period = deadlineFilter.value;
  if (!period) return true;
  if (period === "unknown") return !job.date;
  if (!job.date || deadline <= now) return false;
  const days = (Date.parse(job.date) - Date.parse(today)) / dayMs;
  return period === "later" ? days > 30 : days <= Number(period);
}

function setApplicationButton(button, job, inAppliedView) {
  if (inAppliedView) {
    button.textContent = "지원 기록 삭제";
    button.setAttribute("aria-label", `${job.title} 지원 기록 삭제`);
    return;
  }
  const applied = applications.has(job.id);
  button.textContent = applied ? "✓ 지원 기록됨" : "지원한 공고";
  button.setAttribute("aria-label", `${job.title} 지원한 공고로 표시`);
  button.setAttribute("aria-pressed", applied);
}

function renderJob(job, closed, { companyLayout = false, showDate = companyLayout, company } = {}) {
  const card = element("article", "job");
  const details = element("div", "job-details");
  const meta = element("div", "job-meta");
  meta.append(
    element("span", `job-type ${job.type}`, types[job.type]),
    element("span", "", sources[job.source]),
  );
  if (!companyLayout) details.append(element("h4", "job-company-name", job.company), renderCompanyInfo(job, company));
  const location = job.regions.map(region => regions[region]).join(" / ");
  meta.append(element("span", "", job.location ? `${location} (${job.location})` : location));
  if (job.verifiedOn) meta.append(element("span", "", `확인 ${job.verifiedOn}`));
  let timeLabel = job.time ? `${job.time} JST 마감` : "마감 시간은 원문 참고";
  if (!job.date) timeLabel = "마감일 미정·수시 모집 · 원문 참고";
  else if (showDate) timeLabel = `${headingFormatter.format(Date.parse(job.date))} · ${timeLabel}`;
  details.append(meta, element("h4", "job-title", job.title), element("p", "job-time", closed ? `마감 지남 · ${timeLabel}` : timeLabel));
  if (job.audience || job.summary) {
    const description = element("dl", "job-description");
    addDetail(description, job.type === "briefing" ? "참가 대상" : "지원 대상", job.audience);
    const labels = { internship: "체험 내용", briefing: "설명회 내용", early: "채용 직무", main: "채용 직무" };
    addDetail(description, labels[job.type], job.summary);
    details.append(description);
  }
  const actions = element("div", "job-actions");
  const button = element("button", "application-button");
  button.type = "button";
  const inAppliedView = view === "applied";
  setApplicationButton(button, job, inAppliedView);
  button.addEventListener("click", () => {
    updateApplication(job, company ?? dailyScan.companies?.[job.company], button, inAppliedView || applications.has(job.id));
  });
  actions.append(button, externalLink(job.url, "원문 보기 ↗", "job-open", `${job.title} 원문 보기 (새 탭)`));
  card.append(details, actions);
  return card;
}

function renderApplied(now) {
  const saved = savedApplications();
  document.querySelector("#applied-count").textContent = `${saved.length}건 · 마감이 지난 공고도 이곳에 남아요.`;
  appliedJobs.replaceChildren(...saved.map(({ job, company }) => renderJob(job, deadlineTime(job) <= now, { showDate: true, company })));
  if (!saved.length) {
    appliedJobs.append(element("p", "empty", "아직 지원 기록이 없어요. 공고에서 ‘지원한 공고’를 누르면 여기에 저장됩니다."));
  }
}

function renderCalendar(now, today) {
  const [year, month] = calendarMonth.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  document.querySelector("#calendar-month").textContent = `${year}년 ${month}월`;

  const byDay = new Map();
  let undated = 0;
  for (const { job } of savedApplications()) {
    if (!job.date) undated += 1;
    if (!job.date?.startsWith(calendarMonth + "-")) continue;
    if (!byDay.has(job.date)) byDay.set(job.date, []);
    byDay.get(job.date).push(job);
  }

  calendarDays.replaceChildren();
  for (let offset = 0; offset < firstDay + daysInMonth; offset += 7) {
    const week = element("tr");
    for (let weekday = 0; weekday < 7; weekday += 1) {
      const day = offset + weekday - firstDay + 1;
      const cell = element("td");
      if (day >= 1 && day <= daysInMonth) {
        const date = `${calendarMonth}-${String(day).padStart(2, "0")}`;
        const number = element("time", "calendar-number", day);
        number.dateTime = date;
        if (date === today) number.setAttribute("aria-current", "date");
        cell.append(number);
        const jobs = byDay.get(date) ?? [];
        if (jobs.length) {
          const events = element("ul", "calendar-events");
          for (const job of jobs) {
            const event = element("li", deadlineTime(job) <= now ? "past" : "", job.company);
            event.title = job.title;
            events.append(event);
          }
          cell.append(events);
        }
      }
      week.append(cell);
    }
    calendarDays.append(week);
  }

  calendarAgenda.replaceChildren(element("h4", "", "이달의 마감 일정"));
  if (!byDay.size) calendarAgenda.append(element("p", "view-description", "이달에 마감일이 있는 지원 기록이 없어요."));
  for (const [date, jobs] of byDay) {
    const group = element("section", "agenda-day");
    const dayHeading = element("h5", "", headingFormatter.format(Date.parse(date)));
    const list = element("ul");
    for (const job of jobs) {
      const item = element("li");
      const time = job.time ? `${job.time} JST` : "시간 미정";
      item.append(externalLink(job.url, `${job.company} · ${job.title} ↗`, "agenda-link"),
        element("span", "", deadlineTime(job) <= now ? `${time} · 마감 지남` : time));
      list.append(item);
    }
    group.append(dayHeading, list);
    calendarAgenda.append(group);
  }
  if (undated) calendarAgenda.append(element("p", "view-description", `마감일이 미정인 ${undated}건은 ‘지원한 공고’에서 볼 수 있어요.`));
}

function renderEmpty(hasJobs) {
  const empty = element("div", "empty");
  if (hasJobs) {
    empty.append(element("h3", "", "조건에 맞는 공고가 없어요"), element("p", "", "검색어나 필터를 바꿔보세요."));
  } else {
    empty.append(element("h3", "", "표시할 공고가 아직 없어요"), element("p", "", "최근 검색과 출처별 확인 상태는 목록 위에 표시됩니다."));
  }
  deadlines.append(empty);
}

function render() {
  const now = new Date();
  const today = dayFormatter.format(now);
  document.querySelector("#art-day").textContent = today.slice(8);
  document.querySelector("#art-month").replaceChildren(monthFormatter.format(now).toUpperCase(), element("br"), "JST");

  for (const link of viewButtons) {
    if (link.dataset.view === view) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  const cloudView = view === "cloud";
  document.getElementById("daily").hidden = view !== "daily" && !cloudView;
  document.getElementById("cloud-description").hidden = !cloudView;
  for (const name of ["applied", "calendar"]) document.getElementById(name).hidden = name !== view;
  if (view === "applied") {
    renderApplied(now);
    return;
  }
  if (view === "calendar") {
    renderCalendar(now, today);
    return;
  }

  typeButtons.forEach(button => button.setAttribute("aria-pressed", button.dataset.type === activeType));
  renderDailyStatus(today);
  const keyword = query.value.trim().normalize("NFKC").toLowerCase();
  const jobs = cloudView ? cloudJobs : dailyJobs;
  const visible = jobs.map(job => ({ job, deadline: deadlineTime(job) }))
    .filter(({ job, deadline }) => (includeClosed.checked || deadline > now) &&
      (!activeType || job.type === activeType) && (!sourceFilter.value || job.source === sourceFilter.value) &&
      matchesDailyFilters(job, deadline, now, today) &&
      `${job.company} ${job.title}`.normalize("NFKC").toLowerCase().includes(keyword))
    .sort((a, b) => a.deadline - b.deadline);

  const companyCount = new Set(visible.map(({ job }) => job.company)).size;
  const companyLayout = layoutFilter.value === "company";
  const order = companyLayout ? "기업별 · 가까운 마감일순" : "마감일순";
  document.querySelector("#result-count").textContent = `기업 ${companyCount}곳 · 공고 일정 ${visible.length}건 · ${order}`;
  deadlines.replaceChildren();
  if (!visible.length) {
    renderEmpty(jobs.length > 0);
    return;
  }

  if (companyLayout) {
    const grouped = new Map();
    for (const entry of visible) {
      const company = entry.job.company;
      if (!grouped.has(company)) grouped.set(company, []);
      grouped.get(company).push(entry);
    }
    for (const [company, entries] of grouped) {
      const section = element("details", "company-group");
      section.open = expandedCompanies.has(company);
      section.addEventListener("toggle", () => {
        if (!section.isConnected) return;
        if (section.open) expandedCompanies.add(company);
        else expandedCompanies.delete(company);
      });
      const header = element("summary", "company-heading");
      header.append(element("h3", "", company), element("span", "company-job-count", `${entries.length}건`));
      section.append(header, renderCompanyInfo(entries[0].job));
      for (const { job, deadline } of entries) section.append(renderJob(job, deadline <= now, { companyLayout: true }));
      deadlines.append(section);
    }
    return;
  }

  let currentDate;
  let group;
  for (const { job, deadline } of visible) {
    const dateKey = job.date || "";
    if (dateKey !== currentDate) {
      currentDate = dateKey;
      group = element("section", "day");
      const heading = element("h3", "day-heading");
      if (job.date) {
        const days = (Date.parse(job.date) - Date.parse(today)) / dayMs;
        const date = element("time", "", headingFormatter.format(Date.parse(job.date)));
        date.dateTime = job.date;
        const label = days < 0 ? "마감 지남" : days === 0 ? "오늘" : `D-${days}`;
        heading.append(date, element("span", days >= 0 && days <= 3 ? "day-badge urgent" : "day-badge", label));
      } else {
        heading.textContent = "마감일 미정·수시 모집";
      }
      group.append(heading);
      deadlines.append(group);
    }
    group.append(renderJob(job, deadline <= now));
  }
}

function openView() {
  const requestedView = window.location.hash.slice(1);
  view = ["cloud", "applied", "calendar"].includes(requestedView) ? requestedView : "daily";
  render();
  if (view !== "daily") document.querySelector("#board").scrollIntoView();
}

function moveCalendarMonth(offset) {
  const [year, month] = calendarMonth.split("-").map(Number);
  calendarMonth = new Date(Date.UTC(year, month - 1 + offset, 1)).toISOString().slice(0, 7);
  render();
}

document.querySelector("#calendar-prev").addEventListener("click", () => moveCalendarMonth(-1));
document.querySelector("#calendar-next").addEventListener("click", () => moveCalendarMonth(1));
document.querySelector("#calendar-today").addEventListener("click", () => {
  calendarMonth = dayFormatter.format(new Date()).slice(0, 7);
  render();
});
window.addEventListener("hashchange", () => {
  applicationStatus.textContent = "";
  openView();
});
window.addEventListener("storage", event => {
  if (event.key !== null && !event.key.startsWith(applicationPrefix)) return;
  readApplications();
  render();
});
typeButtons.forEach(button => button.addEventListener("click", () => {
  activeType = button.dataset.type;
  applyFilters();
}));

function applyFilters() {
  if (view === "daily" || view === "cloud") rememberFilters();
  render();
}

query.addEventListener("input", applyFilters);
for (const control of [...Object.values(filterParams), includeClosed, layoutFilter]) {
  control.addEventListener("change", applyFilters);
}
document.querySelector("#reset-filters").addEventListener("click", () => {
  activeType = "";
  query.value = "";
  includeClosed.checked = false;
  for (const control of Object.values(filterParams)) control.value = "";
  applyFilters();
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    readApplications();
    render();
  }
});
readApplications();
openView();

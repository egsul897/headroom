import { datedItems, isIsoDate, type CalendarItem } from "@/lib/ux/present";

const KIND_LABEL = { test: "Test", reporting: "Reporting", cure: "Cure" } as const;

function monthLabel(year: number, month: number): string {
  return new Date(Date.UTC(year, month, 1)).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function parseIso(value: string): { year: number; month: number; day: number } {
  const [year, month, day] = value.split("-").map(Number);
  return { year: year ?? 0, month: (month ?? 1) - 1, day: day ?? 1 };
}

/** Month grid of dates the engine supplied. Today is the clock, not a covenant date. */
export function CovenantCalendar({ items, today }: { items: readonly CalendarItem[]; today: string }) {
  const dated = datedItems(items);
  const anchor = isIsoDate(today) ? today : new Date().toISOString().slice(0, 10);
  const { year, month } = parseIso(anchor);
  const first = new Date(Date.UTC(year, month, 1));
  const startPad = first.getUTCDay();
  const days = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const cells = [...Array(startPad).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];
  const byDay = new Map<number, CalendarItem[]>();
  for (const item of dated) {
    if (!isIsoDate(item.date)) continue;
    const parsed = parseIso(item.date);
    if (parsed.year === year && parsed.month === month) {
      const list = byDay.get(parsed.day) ?? [];
      list.push(item);
      byDay.set(parsed.day, list);
    }
  }
  const todayParts = isIsoDate(anchor) ? parseIso(anchor) : null;
  const upcoming = dated
    .filter((item) => isIsoDate(item.date) && item.date >= anchor)
    .slice()
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
  const missing = items.filter((item) => !isIsoDate(item.date));

  return (
    <section className="ux-block" aria-label="Covenant calendar">
      <div className="ux-block-head">
        <h2>Covenant calendar</h2>
        <p>{monthLabel(year, month)}</p>
      </div>
      <div className="calendar-layout">
        <div>
          <div className="calendar-week" aria-hidden="true">
            {["S", "M", "T", "W", "T", "F", "S"].map((day, index) => (
              <span key={`${day}-${index}`}>{day}</span>
            ))}
          </div>
          <div className="calendar-grid">
            {cells.map((day, index) => {
              const isToday = day != null && todayParts?.year === year && todayParts.month === month && todayParts.day === day;
              const events = day == null ? [] : byDay.get(day) ?? [];
              return (
                <div key={index} className={isToday ? "calendar-day is-today" : "calendar-day"} data-today={isToday ? "true" : undefined}>
                  {day != null ? <span>{day}</span> : null}
                  {events.length > 0 ? <i className="calendar-mark" title={events.map((event) => event.label).join(", ")} /> : null}
                </div>
              );
            })}
          </div>
        </div>
        <div className="calendar-upcoming">
          <h3>Upcoming</h3>
          {upcoming.length === 0 ? <p>No dated items.</p> : null}
          <ul>
            {upcoming.map((item) => (
              <li key={item.id}>
                <span>{KIND_LABEL[item.kind]}</span>
                {item.label}
                <time dateTime={item.date ?? undefined}>{item.date}</time>
              </li>
            ))}
          </ul>
          {missing.length > 0 ? (
            <ul className="calendar-missing">
              {missing.map((item) => (
                <li key={item.id}>
                  {item.label}: date is not on file.
                </li>
              ))}
            </ul>
          ) : null}
          {items.length === 0 ? (
            <ul className="calendar-missing">
              <li>Test date is not on file.</li>
              <li>Reporting deadline is not on file.</li>
              <li>Cure period is not on file.</li>
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

/** Today as YYYY-MM-DD in Sam's timezone (the server runs UTC on Railway). */
export function todayLA(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
}

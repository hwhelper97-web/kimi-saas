const { addDays, setHours, setMinutes, setSeconds, setMilliseconds } = require("date-fns");

/**
 * Intelligent Timezone-Aware DateTime Builder
 * Converts natural language dates (today, tomorrow) and times into correct Date objects
 * relative to the business's local timezone.
 */
function buildDateTime(dateText = "", timeText = "", timezone = "UTC") {
  // 1. Get current time in the Business Timezone
  const now = new Date();
  const tzDateStr = now.toLocaleString("en-US", { timeZone: timezone });
  const bizNow = new Date(tzDateStr);
  
  const normalizedDateText = (dateText || "").toLowerCase();
  const normalizedTimeText = (timeText || "").toLowerCase();
  let baseDate = new Date(bizNow);

  // 2. Handle Date component
  if (normalizedDateText.includes("tomorrow")) {
    baseDate = addDays(bizNow, 1);
  } else if (normalizedDateText.includes("today")) {
    baseDate = bizNow;
  } else {
    // Try a direct parse (YYYY-MM-DD or Month Day)
    const direct = new Date(dateText);
    if (!isNaN(direct.getTime())) {
        baseDate = direct;
    }
  }

  // 3. Handle Time component (AM/PM)
  const match = normalizedTimeText.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)/i);
  let hours = 12;
  let minutes = 0;

  if (match) {
    hours = parseInt(match[1], 10);
    minutes = match[2] ? parseInt(match[2], 10) : 0;
    if (match[3].toLowerCase() === "pm" && hours < 12) hours += 12;
    if (match[3].toLowerCase() === "am" && hours === 12) hours = 0;
  } else {
    const altMatch = normalizedTimeText.match(/(\d{1,2}):(\d{2})/);
    if (altMatch) {
        hours = parseInt(altMatch[1], 10);
        minutes = parseInt(altMatch[2], 10);
    }
  }

  baseDate = setHours(baseDate, hours);
  baseDate = setMinutes(baseDate, minutes);
  baseDate = setSeconds(baseDate, 0);
  baseDate = setMilliseconds(baseDate, 0);
  return baseDate;
}

/**
 * Returns YYYY-MM-DD strings for Today and Tomorrow in the business timezone
 */
function getBusinessDates(timezone = "UTC") {
  const now = new Date();
  const tzDateStr = now.toLocaleString("en-US", { timeZone: timezone });
  const bizNow = new Date(tzDateStr);
  
  const todayStr = bizNow.toISOString().split('T')[0];
  const tomorrowStr = addDays(bizNow, 1).toISOString().split('T')[0];
  
  return { todayStr, tomorrowStr };
}

module.exports = { buildDateTime, getBusinessDates };

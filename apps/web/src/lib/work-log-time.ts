import dayjs, { Dayjs } from "dayjs";

type TimingValues = {
  startTime?: Dayjs | null;
  endTime?: Dayjs | null;
  hours?: number | null;
};

function roundHours(value: number) {
  return Number(value.toFixed(2));
}

function durationHours(startTime: Dayjs, endTime: Dayjs) {
  let minutes = endTime.diff(startTime, "minute");
  if (minutes < 0) {
    minutes += 24 * 60;
  }
  return roundHours(minutes / 60);
}

function sameMinute(left?: Dayjs | null, right?: Dayjs | null) {
  if (!left || !right) return left === right;
  return left.hour() === right.hour() && left.minute() === right.minute();
}

function validHours(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 24;
}

export function applyWorkLogTimingAutoFill<T extends TimingValues>(
  changed: Partial<T>,
  values: T,
  setFieldsValue: (values: Partial<T>) => void
) {
  const changedStart = Object.prototype.hasOwnProperty.call(changed, "startTime");
  const changedEnd = Object.prototype.hasOwnProperty.call(changed, "endTime");
  const changedHours = Object.prototype.hasOwnProperty.call(changed, "hours");
  const startTime = values.startTime ?? null;
  const endTime = values.endTime ?? null;
  const hours = validHours(values.hours) ? values.hours : null;
  const next: Partial<T> = {};

  if ((changedStart || changedEnd) && startTime && endTime) {
    const nextHours = durationHours(startTime, endTime);
    if (values.hours !== nextHours) {
      next.hours = nextHours as T["hours"];
    }
  } else if (changedStart && startTime && hours !== null && !endTime) {
    next.endTime = startTime.add(Math.round(hours * 60), "minute") as T["endTime"];
  } else if (changedEnd && endTime && hours !== null && !startTime) {
    next.startTime = endTime.subtract(Math.round(hours * 60), "minute") as T["startTime"];
  } else if (changedHours && hours !== null) {
    if (startTime) {
      const nextEndTime = startTime.add(Math.round(hours * 60), "minute");
      if (!sameMinute(endTime, nextEndTime)) {
        next.endTime = nextEndTime as T["endTime"];
      }
    } else if (endTime) {
      const nextStartTime = endTime.subtract(Math.round(hours * 60), "minute");
      if (!sameMinute(startTime, nextStartTime)) {
        next.startTime = nextStartTime as T["startTime"];
      }
    }
  }

  if (Object.keys(next).length > 0) {
    setFieldsValue(next);
  }
}

function baseDate(date?: string | Dayjs | null) {
  const parsed = dayjs.isDayjs(date) ? date : date ? dayjs(date) : dayjs();
  return parsed.isValid() ? parsed : dayjs();
}

function normalizePeriodHour(period: string | undefined, hour: number) {
  if ((period === "下午" || period === "晚上") && hour < 12) return hour + 12;
  if (period === "中午" && hour < 11) return hour + 12;
  if (period === "凌晨" && hour === 12) return 0;
  return hour;
}

export function parseWorkLogTime(value?: string | null, date?: string | Dayjs | null) {
  if (!value) return undefined;
  const text = String(value).trim();
  const parsed = dayjs(text);
  if (parsed.isValid()) return parsed;

  const match = text.match(/(?:(上午|下午|晚上|中午|凌晨|早上)\s*)?(\d{1,2})(?:(?:[:：])(\d{1,2})|[点时](\d{0,2})?)?/);
  if (!match) return undefined;
  const minute = Number(match[3] || match[4] || 0);
  const hour = normalizePeriodHour(match[1], Number(match[2]));
  if (!Number.isFinite(hour) || !Number.isFinite(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return undefined;
  }
  return baseDate(date).hour(hour).minute(minute).second(0).millisecond(0);
}

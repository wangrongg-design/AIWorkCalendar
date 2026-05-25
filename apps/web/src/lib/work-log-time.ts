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

export function parseWorkLogTime(value?: string | null) {
  return value ? dayjs(value) : undefined;
}

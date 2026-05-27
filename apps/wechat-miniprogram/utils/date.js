function pad(value) {
  return String(value).padStart(2, "0");
}

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthKey(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}`;
}

function addMonths(month, diff) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(year, monthNumber - 1 + diff, 1);
  return monthKey(date);
}

function monthTitle(month) {
  const [year, monthNumber] = String(month).split("-").map(Number);
  if (!year || !monthNumber) return month;
  return `${year}年${monthNumber}月`;
}

function shortDayTitle(day) {
  const parts = String(day || "").split("-").map(Number);
  if (parts.length < 3 || !parts[1] || !parts[2]) return day;
  return `${parts[1]}月${parts[2]}日`;
}

function isFutureDay(day) {
  return String(day || "") > dateKey();
}

function buildMonthGrid(month, days) {
  const [year, monthNumber] = month.split("-").map(Number);
  const first = new Date(year, monthNumber - 1, 1);
  const totalDays = new Date(year, monthNumber, 0).getDate();
  const blanks = Array.from({ length: first.getDay() }, (_, index) => ({
    id: `blank-${index}`,
    blank: true
  }));
  const dayMap = new Map((days || []).map((item) => [item.date, item]));
  const today = dateKey();
  const items = [];
  for (let day = 1; day <= totalDays; day += 1) {
    const key = `${month}-${pad(day)}`;
    const source = dayMap.get(key);
    const data = source || {
      date: key,
      filledCount: 0,
      missingCount: 0,
      fillRate: 0,
      riskCount: 0
    };
    items.push({
      ...data,
      id: key,
      day,
      hasData: Boolean(source),
      isFuture: isFutureDay(key),
      isToday: key === today,
      totalCount: data.filledCount + data.missingCount,
      tone: data.riskCount > 0 ? "risk" : data.fillRate >= 80 ? "good" : data.fillRate > 0 ? "normal" : "empty",
      primaryText: data.riskCount > 0
        ? "风险"
        : data.fillRate >= 80
          ? "已填"
          : data.fillRate > 0
            ? "部分"
            : isFutureDay(key)
              ? "待填"
              : "未填",
      secondaryText: data.riskCount > 0
        ? "需关注"
        : data.filledCount + data.missingCount > 0
          ? `${Math.round(data.fillRate)}%`
          : isFutureDay(key)
            ? "未开始"
            : "无记录"
    });
  }
  const grid = blanks.concat(items);
  while (grid.length < 42) {
    grid.push({
      id: `blank-trailing-${grid.length}`,
      blank: true
    });
  }
  return grid;
}

module.exports = {
  dateKey,
  monthKey,
  addMonths,
  monthTitle,
  shortDayTitle,
  isFutureDay,
  buildMonthGrid
};

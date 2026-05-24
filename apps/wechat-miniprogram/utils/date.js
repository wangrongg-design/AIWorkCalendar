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
    const data = dayMap.get(key) || {
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
      isToday: key === today,
      totalCount: data.filledCount + data.missingCount,
      tone: data.riskCount > 0 ? "risk" : data.fillRate >= 80 ? "good" : data.fillRate > 0 ? "normal" : "empty"
    });
  }
  return blanks.concat(items);
}

module.exports = {
  dateKey,
  monthKey,
  addMonths,
  buildMonthGrid
};

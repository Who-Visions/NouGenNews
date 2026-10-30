// Pure deterministic weather summary and insight generators for NouGenNews.
// All functions are bounded, deterministic, and operate on place-local text times.

const POINTS = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];

export const compass = (d) => (d == null ? "" : POINTS[Math.round((((d % 360) + 360) % 360) / 22.5) % 16]);

export const hourOf = (t) => {
  if (!t) return 0;
  return Number(String(t).slice(11, 13)) || 0;
};

export const hourLabel = (t) => {
  if (!t) return "";
  const h = hourOf(t);
  return `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
};

export const shortHourLabel = (t) => {
  if (!t) return "";
  const h = hourOf(t);
  return `${h % 12 || 12}${h < 12 ? "a" : "p"}`;
};

export const clockLabel = (t) => {
  if (!t) return "—";
  const h = hourOf(t);
  const min = String(t).slice(14, 16) || "00";
  return `${h % 12 || 12}:${min} ${h < 12 ? "AM" : "PM"}`;
};

export const minutesOf = (t) => {
  if (!t) return 0;
  return hourOf(t) * 60 + (Number(String(t).slice(14, 16)) || 0);
};

/**
 * Computes a plain-English summary line from weather report data.
 * Example: "Warm and humid, 77°F now. Rain likely after 2 PM (60%). High of 84 around 3 PM. UV peaks at 8."
 */
export function computeWeatherSummary(report) {
  if (!report || !report.now) return "";
  const { now, today, hours = [], air } = report;
  const sentences = [];

  // 1. Current condition and temperature feel
  let feel = "Mild";
  const t = now.temp_f;
  if (t != null) {
    if (t >= 85) feel = "Hot";
    else if (t >= 72) feel = "Warm";
    else if (t >= 60) feel = "Mild";
    else if (t >= 45) feel = "Cool";
    else if (t >= 32) feel = "Chilly";
    else feel = "Freezing";

    if (now.humidity != null && now.humidity >= 68 && t >= 65) {
      feel = `${feel} and humid`;
    } else if (now.humidity != null && now.humidity <= 25 && t >= 75) {
      feel = `${feel} and dry`;
    }
  }

  const lbl = (now.label || "").toLowerCase();
  const isSpecialWeather = lbl.includes("rain") || lbl.includes("thunderstorm") || lbl.includes("snow") || lbl.includes("fog") || lbl.includes("drizzle");

  if (isSpecialWeather) {
    sentences.push(`${now.label}, ${t != null ? `${t}°F` : ""} now`.trim() + ".");
  } else if (t != null) {
    sentences.push(`${feel}, ${t}°F now.`);
  }

  // 2. Rain outlook from upcoming hours
  const upcoming = hours.slice(0, 24);
  const rainHour = upcoming.find((h) => h && h.precip_chance != null && h.precip_chance >= 30);

  if (isSpecialWeather && lbl.includes("rain")) {
    const endHour = upcoming.find((h) => h && (h.precip_chance == null || h.precip_chance < 20));
    if (endHour) {
      sentences.push(`Rain continuing until around ${hourLabel(endHour.time)}.`);
    } else {
      sentences.push("Rain continuing through the day.");
    }
  } else if (rainHour) {
    const pct = rainHour.precip_chance;
    const timeStr = hourLabel(rainHour.time);
    if (pct >= 60) {
      sentences.push(`Rain likely after ${timeStr} (${pct}%).`);
    } else if (pct >= 40) {
      sentences.push(`Chance of rain around ${timeStr} (${pct}%).`);
    } else {
      sentences.push(`Slight chance of rain around ${timeStr} (${pct}%).`);
    }
  } else if (today && today.precip_chance != null && today.precip_chance >= 30) {
    sentences.push(`Chance of rain today (${today.precip_chance}%).`);
  } else {
    sentences.push("Dry conditions expected.");
  }

  // 3. High of the day and timing
  if (today && today.high_f != null) {
    // Find approximate hour of peak temperature today
    let peakHour = null;
    let maxTemp = -Infinity;
    for (const h of upcoming) {
      if (h.temp_f != null && h.temp_f > maxTemp) {
        maxTemp = h.temp_f;
        peakHour = h;
      }
    }

    if (peakHour && peakHour.time) {
      sentences.push(`High of ${today.high_f} around ${hourLabel(peakHour.time)}.`);
    } else {
      sentences.push(`High of ${today.high_f}° today.`);
    }
  }

  // 4. UV index or peak wind highlight
  if (today && today.uv_max != null && today.uv_max >= 6) {
    sentences.push(`UV peaks at ${Math.round(today.uv_max)}.`);
  } else if (now.gust_mph != null && now.gust_mph >= 25) {
    sentences.push(`Wind gusts up to ${now.gust_mph} mph.`);
  } else if (air && air.aqi != null && air.aqi > 100) {
    sentences.push(`Air quality is ${air.category.toLowerCase()} (AQI ${air.aqi}).`);
  }

  return sentences.join(" ");
}

/**
 * Computes structured "What matters today" cards from hours and days.
 */
export function computeWhatMattersToday(report) {
  if (!report || !report.now) return null;
  const { now, today, hours = [] } = report;
  const upcoming = hours.slice(0, 24);

  // Next rain
  let nextRain = { title: "Next rain", value: "No rain expected", detail: "Dry for next 24 hours" };
  const rainHour = upcoming.find((h) => h && h.precip_chance != null && h.precip_chance >= 30);
  if (rainHour) {
    const chance = rainHour.precip_chance;
    const timeStr = hourLabel(rainHour.time);
    const likelihood = chance >= 60 ? "Likely" : chance >= 40 ? "Scattered" : "Possible";
    nextRain = {
      title: "Next rain",
      value: `${timeStr} (${chance}%)`,
      detail: `${likelihood} · ${today && today.precip_in ? `${today.precip_in} in today` : "Passing showers"}`,
    };
  } else if (today && today.precip_chance != null && today.precip_chance >= 20) {
    nextRain = {
      title: "Next rain",
      value: `${today.precip_chance}% chance`,
      detail: today.precip_in ? `Up to ${today.precip_in} in total` : "Isolated showers possible",
    };
  }

  // Best hours outside
  let bestOutdoor = { title: "Best hours outside", value: "Morning hours", detail: "Dry and comfortable" };
  // Longest unbroken run of dry, comfortable daylight hours in the next 24; night hours never count.
  const isPleasant = (h) => {
    const temp = h.temp_f ?? now.temp_f ?? 70;
    const precip = h.precip_chance ?? 0;
    return h.is_day !== false && h.is_day !== 0 && precip < 25 && temp >= 60 && temp <= 84;
  };
  let pleasantHours = [];
  let run = [];
  for (const h of upcoming) {
    if (h && isPleasant(h)) {
      run.push(h);
      if (run.length > pleasantHours.length) pleasantHours = run.slice();
    } else {
      run = [];
    }
  }

  if (pleasantHours.length > 0) {
    const firstH = pleasantHours[0];
    const lastH = pleasantHours[pleasantHours.length - 1];
    const avgTemp = Math.round(pleasantHours.reduce((acc, h) => acc + (h.temp_f || 70), 0) / pleasantHours.length);
    if (pleasantHours.length === 1 || firstH.time === lastH.time) {
      bestOutdoor = {
        title: "Best hours outside",
        value: `Around ${hourLabel(firstH.time)}`,
        detail: `Dry · ${avgTemp}°F`,
      };
    } else {
      bestOutdoor = {
        title: "Best hours outside",
        value: `${hourLabel(firstH.time)} – ${hourLabel(lastH.time)}`,
        detail: `Dry · Average ${avgTemp}°F`,
      };
    }
  } else {
    bestOutdoor = {
      title: "Best hours outside",
      value: "Limited windows",
      detail: today && today.precip_chance ? "Rain throughout the day" : "Extreme temperatures",
    };
  }

  // Peak UV
  let peakUv = { title: "Peak UV window", value: "Low all day", detail: "UV Index < 3" };
  const uvVal = today ? today.uv_max : now.uv;
  if (uvVal != null) {
    const roundedUv = Math.round(uvVal);
    let level = "Low";
    if (roundedUv >= 11) level = "Extreme";
    else if (roundedUv >= 8) level = "Very High";
    else if (roundedUv >= 6) level = "High";
    else if (roundedUv >= 3) level = "Moderate";

    if (roundedUv >= 3) {
      peakUv = {
        title: "Peak UV window",
        value: "11 AM – 3 PM",
        detail: `UV ${roundedUv} · ${level}`,
      };
    } else {
      peakUv = {
        title: "Peak UV window",
        value: `Index ${roundedUv}`,
        detail: `${level} exposure risk`,
      };
    }
  }

  // Peak Wind
  let peakWind = { title: "Wind peak", value: `${now.wind_mph || 0} mph ${compass(now.wind_dir)}`, detail: "Normal breeze" };
  let maxGust = now.gust_mph || now.wind_mph || 0;
  let maxHour = null;

  for (const h of upcoming) {
    if (h.wind_mph != null && h.wind_mph > maxGust) {
      maxGust = h.wind_mph;
      maxHour = h;
    }
  }

  const gustVal = now.gust_mph || (maxHour ? maxHour.wind_mph : now.wind_mph);
  if (maxHour) {
    peakWind = {
      title: "Wind peak",
      value: `${hourLabel(maxHour.time)} (${maxHour.wind_mph} mph)`,
      detail: gustVal ? `Gusts to ${gustVal} mph` : `${compass(now.wind_dir)} breeze`,
    };
  } else if (now.wind_mph != null) {
    peakWind = {
      title: "Wind peak",
      value: `${now.wind_mph} mph ${compass(now.wind_dir)}`,
      detail: now.gust_mph ? `Gusts to ${now.gust_mph} mph` : "Steady conditions",
    };
  }

  return { nextRain, bestOutdoor, peakUv, peakWind };
}

/**
 * Computes the solar progress and daylight metrics.
 */
export function computeSunArc(today, updated) {
  if (!today || !today.sunrise || !today.sunset) {
    return { isDay: true, progress: 0.5, remainingText: "", daylightText: "" };
  }

  const srMin = minutesOf(today.sunrise);
  const ssMin = minutesOf(today.sunset);
  const curMin = updated ? minutesOf(updated) : srMin + 180;
  const daylightMinutes = Math.max(0, ssMin - srMin);

  const dlHours = Math.floor(daylightMinutes / 60);
  const dlMins = daylightMinutes % 60;
  const daylightText = `${dlHours}h ${dlMins}m daylight`;

  let isDay = false;
  let progress = 0;
  let remainingText = "";

  if (curMin >= srMin && curMin <= ssMin) {
    isDay = true;
    progress = daylightMinutes > 0 ? (curMin - srMin) / daylightMinutes : 0.5;
    const remMin = ssMin - curMin;
    const remH = Math.floor(remMin / 60);
    const remM = remMin % 60;
    remainingText = `${remH}h ${remM}m left`;
  } else if (curMin < srMin) {
    isDay = false;
    progress = 0;
    const toSrMin = srMin - curMin;
    const toSrH = Math.floor(toSrMin / 60);
    const toSrM = toSrMin % 60;
    remainingText = `Sunrise in ${toSrH}h ${toSrM}m`;
  } else {
    isDay = false;
    progress = 1;
    const sinceSsMin = curMin - ssMin;
    const sinceH = Math.floor(sinceSsMin / 60);
    const sinceM = sinceSsMin % 60;
    remainingText = `Sunset was ${sinceH}h ${sinceM}m ago`;
  }

  return {
    isDay,
    progress: Math.min(1, Math.max(0, progress)),
    remainingText,
    daylightText,
    sunriseLabel: clockLabel(today.sunrise),
    sunsetLabel: clockLabel(today.sunset),
  };
}

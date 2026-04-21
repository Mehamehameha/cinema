const DENDY_GRAPHQL_URL = "https://newtown.dendy.com.au/graphql";
const DENDY_HEADERS = {
  "content-type": "application/json",
  "client-type": "consumer",
  "site-id": "36",
  "circuit-id": "15",
};
const DENDY_TIME_ZONE = "Australia/Sydney";

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  const dates = (event.queryStringParameters?.dates || "")
    .split(",")
    .map((date) => date.trim())
    .filter(Boolean);

  if (!dates.length || dates.some((date) => !/^\d{4}-\d{2}-\d{2}$/.test(date))) {
    return json(400, { error: "Provide one or more YYYY-MM-DD dates." });
  }

  try {
    const results = await Promise.all(dates.map(fetchDate));
    return json(200, { sessions: results.flat() });
  } catch (error) {
    return json(502, { error: error.message || "Could not fetch Dendy sessions." });
  }
};

async function fetchDate(date) {
  const response = await fetch(DENDY_GRAPHQL_URL, {
    method: "POST",
    headers: DENDY_HEADERS,
    body: JSON.stringify({
      query: `query($date:String) {
        showingsForDate(date:$date) {
          data {
            id
            time
            movie {
              id
              name
              urlSlug
            }
          }
        }
      }`,
      variables: { date },
    }),
  });

  if (!response.ok) throw new Error(`Dendy returned ${response.status}`);
  const payload = await response.json();
  if (payload.errors?.length) throw new Error(payload.errors[0].message);

  return (payload.data?.showingsForDate?.data || []).map((show) => {
    const local = localDateTime(show.time);
    return {
      showingId: show.id,
      movieId: show.movie.id,
      title: show.movie.name,
      date: local.date,
      time: local.time,
      url: `https://newtown.dendy.com.au/movie/${show.movie.urlSlug}`,
    };
  });
}

function localDateTime(value) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DENDY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${lookup.year}-${lookup.month}-${lookup.day}`,
    time: `${lookup.hour}:${lookup.minute}`,
  };
}

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

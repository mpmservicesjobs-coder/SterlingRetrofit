// Netlify Function: EPC register lookup by postcode
// Keeps the EPC_EMAIL / EPC_API_KEY credentials private on the server side.
// Set these two values in Netlify: Site settings > Environment variables
//   EPC_EMAIL    = the email address you signed up to epc.opendatacommunities.org with
//   EPC_API_KEY  = your personal API key from that site

exports.handler = async function (event) {
  const postcode = (event.queryStringParameters && event.queryStringParameters.postcode || '').trim();

  if (!postcode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing postcode' }),
    };
  }

  const email = process.env.EPC_EMAIL;
  const apiKey = process.env.EPC_API_KEY;

  if (!email || !apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'EPC credentials not configured on the server' }),
    };
  }

  const auth = Buffer.from(`${email}:${apiKey}`).toString('base64');
  const url = `https://epc.opendatacommunities.org/api/v1/domestic/search?postcode=${encodeURIComponent(postcode)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Basic ${auth}`,
        Accept: 'application/json',
        'User-Agent': 'SterlingRetrofitEPCChecker/1.0 (hello@epc-check2030.com)',
      },
    });

    const rawText = await res.text();

    if (!res.ok) {
      // 404 from the API generally just means "no records for this postcode"
      if (res.status === 404) {
        return {
          statusCode: 200,
          body: JSON.stringify({ rows: [] }),
        };
      }
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'EPC register error',
          status: res.status,
          detail: rawText.slice(0, 500),
        }),
      };
    }

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'EPC register returned an unexpected response',
          detail: rawText.slice(0, 500),
        }),
      };
    }

    const raw = data.rows || [];

    // Keep only the most recent certificate per address
    const latestByAddress = {};
    raw.forEach((r) => {
      const addressParts = [r.address1, r.address2, r.address3, r.postcode]
        .filter(Boolean)
        .join(', ');
      const key = addressParts.toLowerCase();
      const existing = latestByAddress[key];
      if (!existing || new Date(r['lodgement-date']) > new Date(existing.date)) {
        latestByAddress[key] = {
          address: addressParts,
          band: r['current-energy-rating'],
          date: r['lodgement-date'],
        };
      }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: Object.values(latestByAddress) }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Unexpected server error', detail: String(err) }),
    };
  }
};

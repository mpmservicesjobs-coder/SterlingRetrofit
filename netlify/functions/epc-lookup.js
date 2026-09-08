// Netlify Function: EPC register lookup by postcode
// Uses the new "Get energy performance of buildings data" API
// (get-energy-performance-data.communities.gov.uk), which replaced the old
// epc.opendatacommunities.org service in 2026.
//
// Set this value in Netlify: Site settings > Environment variables
//   EPC_API_KEY  = your Bearer token, shown on your account page at
//                  get-energy-performance-data.communities.gov.uk/api/my-account

exports.handler = async function (event) {
  const postcode = (event.queryStringParameters && event.queryStringParameters.postcode || '').trim();

  if (!postcode) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing postcode' }),
    };
  }

  const token = process.env.EPC_API_KEY;

  if (!token) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'EPC credentials not configured on the server' }),
    };
  }

  const url = `https://api.get-energy-performance-data.communities.gov.uk/api/domestic/search?postcode=${encodeURIComponent(postcode)}`;

  try {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        'User-Agent': 'SterlingRetrofitEPCChecker/1.0 (hello@epc-check2030.com)',
      },
    });

    const rawText = await res.text();

    if (!res.ok) {
      // 404 from this API means "no certificates match this postcode"
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

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (parseErr) {
      return {
        statusCode: 502,
        body: JSON.stringify({
          error: 'EPC register returned an unexpected response',
          detail: rawText.slice(0, 500),
        }),
      };
    }

    // New API shape: { data: [ { addressLine1, addressLine2, ..., postcode,
    //                             currentEnergyEfficiencyBand, registrationDate }, ... ],
    //                   pagination: {...} }
    const raw = parsed.data || [];

    // Keep only the most recent certificate per address
    const latestByAddress = {};
    raw.forEach((r) => {
      const addressParts = [r.addressLine1, r.addressLine2, r.addressLine3, r.addressLine4, r.postcode]
        .filter(Boolean)
        .join(', ');
      const key = addressParts.toLowerCase();
      const existing = latestByAddress[key];
      if (!existing || new Date(r.registrationDate) > new Date(existing.date)) {
        latestByAddress[key] = {
          address: addressParts,
          band: r.currentEnergyEfficiencyBand,
          date: r.registrationDate,
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

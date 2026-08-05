const https = require('https');

const PIXEL_ID = '1537451257788021';
const ACCESS_TOKEN = process.env.META_CAPI_TOKEN;

function postToMeta(payload) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const options = {
      hostname: 'graph.facebook.com',
      path: `/v19.0/${PIXEL_ID}/events?access_token=${ACCESS_TOKEN}`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode, body: JSON.parse(body) });
        } catch (e) {
          resolve({ statusCode: res.statusCode, body });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  if (!ACCESS_TOKEN) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: 'META_CAPI_TOKEN not configured' }),
    };
  }

  try {
    const body = JSON.parse(event.body);
    const {
      event_name,
      event_id,
      event_source_url,
      client_ip_address,
      client_user_agent,
      fbc,
      fbp,
      content_name,
    } = body;

    const eventTime = Math.floor(Date.now() / 1000);

    // Usamos el event_id que manda el cliente (compartido con el pixel del navegador)
    // para que Meta pueda deduplicar. Si por algún motivo no llega, generamos uno de
    // respaldo para no perder el evento, aunque en ese caso no habrá deduplicación.
    const eventId =
      event_id ||
      `${event_name}_${eventTime}_${Math.random().toString(36).slice(2, 9)}`;

    const payload = {
      data: [
        {
          event_name,
          event_time: eventTime,
          event_id: eventId,
          event_source_url,
          action_source: 'website',
          user_data: {
            client_ip_address: client_ip_address || '',
            client_user_agent: client_user_agent || '',
            ...(fbc && { fbc }),
            ...(fbp && { fbp }),
          },
          ...(content_name && {
            custom_data: { content_name },
          }),
        },
      ],
    };

    const result = await postToMeta(payload);

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: true, result, event_id: eventId }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ ok: false, error: err.message }),
    };
  }
};

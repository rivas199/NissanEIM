
// netlify/functions/proxy.js
// If your Netlify environment is Node 18+, you can remove "node-fetch" and use the global fetch.
// For broad compatibility, we'll import node-fetch here:
const fetch = require('node-fetch');

exports.handler = async (event, context) => {
  try {
    // Parse the incoming JSON body from the front-end
    const body = JSON.parse(event.body);
    console.log("Received body from front-end:", body);

    // This is your final endpoint
    const externalApiUrl = "https://gpas-ws-eu-prod.autodatadirect.com/gpas-ws/api/v1/eim2spec";

    // Forward the request to the external API
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
        // If the endpoint requires authentication or other headers, add them here.
        // e.g. "Authorization": "Bearer <token>"
      },
      body: JSON.stringify(body)
    });

    // Read the response as JSON
    const data = await response.json();

    // Return the external API's response back to the front-end
    return {
      statusCode: response.status, 
      body: JSON.stringify(data)
    };

  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};

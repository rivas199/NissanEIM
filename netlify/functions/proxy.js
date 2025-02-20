exports.handler = async (event, context) => {
  // Dynamically import node-fetch
  let fetchModule;
  try {
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" }),
    };
  }
  const fetch = fetchModule.default;

  try {
    // Parse the incoming JSON payload
    const body = JSON.parse(event.body);
    console.log("Received body:", body);

    // Use your real endpoint:
    const externalApiUrl = "https://gpas-ws-eu-prod.autodatadirect.com/gpas-ws/api/v1/eim2spec";

    // Make a POST request to the external API
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const data = await response.json();

    // Return the API response to the client
    return {
      statusCode: response.status,
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

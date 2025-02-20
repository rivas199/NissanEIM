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

    // Your real external API endpoint
    const externalApiUrl = "https://gpas-ws-eu-prod.autodatadirect.com/gpas-ws/api/v1/eim2spec";

    // Make the POST request to the external API
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log("Response status from external API:", response.status);

    // Read the response as text first (in case JSON parsing fails)
    const text = await response.text();
    console.log("Raw response text:", text);

    // Try to parse the response as JSON
    try {
      const data = JSON.parse(text);
      console.log("Parsed JSON response:", data);
      return {
        statusCode: response.status,
        body: JSON.stringify(data),
      };
    } catch (jsonError) {
      console.error("Error parsing JSON. Response text:", text);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: "Invalid JSON response", raw: text }),
      };
    }
  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' }),
    };
  }
};

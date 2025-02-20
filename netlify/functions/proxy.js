const https = require('https');

exports.handler = async (event, context) => {
  // Importar dinámicamente node-fetch
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

  // Crear un agente HTTPS que no verifique el certificado
  const agent = new https.Agent({
    rejectUnauthorized: false,
  });

  try {
    // Parsear el body recibido
    const body = JSON.parse(event.body);
    console.log("Received body:", body);

    // Tu endpoint real
    const externalApiUrl = "https://gpas-ws-eu-prod.autodatadirect.com/gpas-ws/api/v1/eim2spec";

    // Realizar la solicitud POST a la API externa usando el agente
    const response = await fetch(externalApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      agent: agent
    });
    console.log("Response status from external API:", response.status);

    // Leer la respuesta como texto (para manejo de errores o respuestas no JSON)
    const text = await response.text();
    console.log("Raw response text:", text);

    // Intentar parsear la respuesta como JSON
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

// ticketsByDay.js
const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("JIRA_TOKEN no está definido");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "JIRA_TOKEN no está definido" })
    };
  }

  let fetchModule;
  try {
    // node-fetch v3 usa import ESM:
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }

  const fetch = fetchModule.default;

  // Agente HTTPS (por si necesitas ignorar certificados no válidos)
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL que filtra por "Start Date" entre dos fechas específicas:
  const jql = `
    project = PNCR
    AND resolution = Unresolved
    AND "Start Date" >= 2025-02-21
    AND "Start Date" <= 2025-02-24
    ORDER BY priority DESC, updated DESC
  `;

  // Codifica el JQL
  const encodedJql = encodeURIComponent(jql.trim());

  // Construye la URL de Jira. Pedimos solo los campos que realmente necesitamos.
  // Atención: en "fields=" no siempre basta con poner "Start Date"; a veces hace falta
  // poner el ID del custom field (p. ej. customfield_12345). Pero si con esto te funciona,
  // adelante.
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=1000&fields=priority,"Start Date"`;

  console.log("Encoded Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("Jira API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log("Data received from Jira, total issues:", data.total);

    // Estructura para agrupar por fecha: { "YYYY-MM-DD": { p1, p2, p3, total } }
    const grouped = {};

    // Recorremos cada ticket devuelto
    (data.issues || []).forEach(issue => {
      // Nombre de prioridad (P1, P2, P3, etc.)
      const priorityName = issue.fields.priority?.name || "";

      // El valor de "Start Date" (string de fecha).
      // Ojo: a veces hay que usar customfield_XXXX en vez de ["Start Date"].
      const startStr = issue.fields["Start Date"];
      if (!startStr) return; // Si no existe, saltamos

      // Convertimos a Date
      const dateObj = new Date(startStr);

      // Obtenemos YYYY-MM-DD
      const dateKey = dateObj.toISOString().split('T')[0];

      // Inicializamos si no existe
      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Incrementamos contadores según la prioridad
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    });

    console.log("Tickets grouped by 'Start Date':", grouped);

    // Devolvemos el objeto agrupado
    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("Error querying Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

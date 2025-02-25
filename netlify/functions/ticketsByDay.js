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

  // JQL: tickets de PNCR asignados a Robert Wasilewski (C), Start Date [hoy .. +30d]
  const jql = `
    project = PNCR
    AND assignee = "Robert Wasilewski (C)"
    AND "Start Date" >= startOfDay()
    AND "Start Date" <= endOfDay("+30d")
    ORDER BY priority DESC
  `;

  // Codificamos el JQL
  const encodedJql = encodeURIComponent(jql.trim());

  // En fields= pasamos "priority" y "Start Date". Ajusta si necesitas más campos.
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=1000&fields=priority,"Start Date"`;

  console.log("Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

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

    // Estructura para agrupar: { "YYYY-MM-DD": { p1, p2, p3, total } }
    const grouped = {};

    for (const issue of data.issues || []) {
      const priorityName = issue.fields.priority?.name || "";
      const startStr = issue.fields["Start Date"];

      // Si no hay "Start Date", saltamos
      if (!startStr) continue;

      // Convertimos a Date y formateamos a YYYY-MM-DD
      const dateObj = new Date(startStr);
      const dateKey = dateObj.toISOString().split('T')[0];

      // Inicializa la estructura
      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Chequeo básico de prioridad
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    }

    console.log("Tickets grouped by 'Start Date':", grouped);

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

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
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }
  const fetch = fetchModule.default;

  // Ignoramos errores de certificado si hace falta
  const agent = new https.Agent({ rejectUnauthorized: false });

  // OJO: Ajusta el JQL para limitar la búsqueda a un rango de fechas razonable.
  // Ejemplo: solo tickets cuya 'finalDate' está en los próximos 30 días:
  // Asegúrate de que la sintaxis se adapte a tus campos y flujos de trabajo.
  const jql = `
    project = PNCR
    AND issuetype in (subTaskIssueTypes())
    AND status in (Open, "In Testing", Scheduled, Blocked)
    AND finalDate <= endOfDay("+30d") 
    AND startDate >= startOfDay()
    ORDER BY startDate ASC
  `;

  // Codificamos el JQL
  const encodedJql = encodeURIComponent(jql.trim());

  // Aquí pedimos sólo los campos que necesitamos y limitamos la cantidad:
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=1000&fields=priority,startDate,finalDate`;

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

    // Estructura donde agruparemos resultados por día: { 'YYYY-MM-DD': { p1, p2, p3, total } }
    const grouped = {};

    (data.issues || []).forEach(issue => {
      const fields = issue.fields || {};
      const priorityName = fields.priority?.name || "";
      const startStr = fields.startDate;
      const endStr = fields.finalDate;

      // Validamos que existan startDate y finalDate
      if (!startStr || !endStr) return;

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      // Evitar rangos invertidos
      if (startDate > endDate) return;

      // Iterar por cada día desde startDate a endDate
      // Si el rango puede ser muy grande, conviene limitarlo (por ejemplo, máx 60 días).
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dateKey = currentDate.toISOString().split('T')[0];

        if (!grouped[dateKey]) {
          grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
        }
        if (priorityName.includes("P1")) {
          grouped[dateKey].p1++;
        } else if (priorityName.includes("P2")) {
          grouped[dateKey].p2++;
        } else if (priorityName.includes("P3")) {
          grouped[dateKey].p3++;
        }
        grouped[dateKey].total++;

        // Avanzar un día
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    console.log("Tickets grouped by day:", grouped);

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

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
    fetchModule = await import('node-fetch'); // node-fetch v3 ESM
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }
  const fetch = fetchModule.default;

  // Si necesitas ignorar certificado:
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL que sí te funcionaba en jiraTickets.js.
  // Hemos mantenido la parte que dice "ORDER BY cf[13001] ASC" para suponer que cf[13001] es fecha.
  const jql = `
    project in (PNCR)
    AND issuetype in (subTaskIssueTypes())
    AND status in (Open, "In Testing", Scheduled, Blocked)
    AND (cf[13001] is EMPTY OR cf[13001] <= 2w)
    AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb)
    AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
    ORDER BY cf[13001] ASC, key ASC
  `;

  const encodedJql = encodeURIComponent(jql.trim());
  // No limitamos maxResults aquí, pero podrías agregar &maxResults=1000 si lo deseas
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}`;

  console.log("ticketsByDay - Encoded Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("ticketsByDay - Jira API response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("ticketsByDay - Error response from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log("ticketsByDay - Data received from Jira, total issues:", data.total);

    // Agrupar por día (usando el campo "cf[13001]" como fecha).
    // { "YYYY-MM-DD": { p1, p2, p3, total } }
    const grouped = {};

    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";

      // Tomamos la fecha de cf[13001].
      // Si NO es realmente una fecha, habrá que ajustarlo o no contará.
      const rawDate = issue.fields["cf[13001]"];
      if (!rawDate) {
        // Si está vacío, no podemos agrupar por día
        return;
      }

      // Convertimos a Date. Si no es un string de fecha, producirá 'Invalid Date'.
      const dateObj = new Date(rawDate);
      if (isNaN(dateObj.getTime())) {
        // No es una fecha válida, saltamos
        return;
      }

      // Formato YYYY-MM-DD para agrupar
      const dateKey = dateObj.toISOString().split('T')[0];

      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Contamos prioridades
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    });

    console.log("ticketsByDay - Tickets grouped by cf[13001] date:", grouped);

    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("ticketsByDay - Error querying Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

// ticketsByDay.js
// En producción no se utiliza dotenv, ya que las variables de entorno se configuran en Netlify.
// Para desarrollo local, asegúrate de definir JIRA_TOKEN en tu entorno (por ejemplo, exportándolo en la terminal).

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

  // Crea un agente HTTPS que ignora errores de certificado (ajústalo si es necesario)
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Define el JQL para consultar los tickets.
  // Este JQL es el mismo que usas en jiraTickets.js; ajústalo según tus necesidades.
  const jql = `project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC`;

  const encodedJql = encodeURIComponent(jql);
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}`;

  console.log("Encoded Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent: agent
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
    console.log("Data received from Jira:", data);

    // Agrupar tickets por fecha (usando el campo 'created')
    const grouped = {}; // Estructura: { "YYYY-MM-DD": { p1: X, p2: Y, p3: Z, total: N } }
    data.issues.forEach(issue => {
      // Se asume que issue.fields.created está en formato ISO
      const dateStr = new Date(issue.fields.created).toISOString().split('T')[0];
      if (!grouped[dateStr]) {
        grouped[dateStr] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      const priorityName = issue.fields.priority?.name || "";
      if (priorityName.includes("P1")) {
        grouped[dateStr].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateStr].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateStr].p3++;
      }
      grouped[dateStr].total++;
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


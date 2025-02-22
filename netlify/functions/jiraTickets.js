const https = require('https');

// Jira token (no recomendado hardcodear)
const JIRA_TOKEN = "TU_TOKEN_AQUI"; // Reemplaza con tu token real

exports.handler = async (event, context) => {
  // Importar node-fetch dinámicamente (similar a tu proxy.js)
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

  // Crea un agente para la conexión HTTPS
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Tu JQL original (sin URL-encode). Se encodea más abajo.
  const jql = `project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC`;

  const encodedJql = encodeURIComponent(jql);
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}`;

  try {
    // Llamada a Jira con el Bearer token
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent: agent
    });

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Jira returned status ${response.status}` })
      };
    }

    const data = await response.json();

    // Contadores de prioridades
    let p1Count = 0;
    let p2Count = 0;
    let p3Count = 0;

    // Recorre los tickets y cuenta según su prioridad
    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      if (priorityName.includes("P1")) p1Count++;
      else if (priorityName.includes("P2")) p2Count++;
      else if (priorityName.includes("P3")) p3Count++;
    });

    // Devuelve el resultado
    return {
      statusCode: 200,
      body: JSON.stringify({
        p1: p1Count,
        p2: p2Count,
        p3: p3Count,
        total: data.total
      })
    };
  } catch (error) {
    console.error("Error querying Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

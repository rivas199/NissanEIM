// jiraTickets.js

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
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL filtrando a 14 días, ejemplo:
  const jql = `
    project = PNCR
    AND issuetype in (subTaskIssueTypes())
    AND status in (Open, "In Testing", Scheduled, Blocked)
    AND "Start Date" >= startOfDay()
    AND "Start Date" <= endOfDay("+14d")
    ORDER BY priority DESC
  `;

  // Agregamos &maxResults=500
  const encodedJql = encodeURIComponent(jql.trim());
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=500&fields=priority`;

  console.log("jiraTickets - Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("jiraTickets - Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("jiraTickets - Error:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log("jiraTickets - total issues returned:", data.total);

    // Contar cuántos P1, P2, P3 en esos 500 (o menos)
    let p1Count = 0, p2Count = 0, p3Count = 0;
    (data.issues || []).forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      if (priorityName.includes("P1")) p1Count++;
      else if (priorityName.includes("P2")) p2Count++;
      else if (priorityName.includes("P3")) p3Count++;
    });

    // Recuerda: data.total puede ser mayor que la cantidad real devuelta
    // si hay más de 500, Jira recorta la lista. p1Count+p2Count+p3Count
    // se refiere a los tickets de la "página" actual.
    // Para un resumen rápido, esto suele bastar.

    return {
      statusCode: 200,
      body: JSON.stringify({
        p1: p1Count,
        p2: p2Count,
        p3: p3Count,
        // Devolvemos la cantidad devuelta, NO la "total" en JIRA
        total: p1Count + p2Count + p3Count
      })
    };
  } catch (error) {
    console.error("jiraTickets - Error querying Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

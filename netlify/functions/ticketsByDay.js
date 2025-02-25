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
    fetchModule = await import('node-fetch'); // node-fetch v3 en ESM
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }
  const fetch = fetchModule.default;

  // Ignorar certificados si hace falta
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL: traer solamente tickets cuyo "created" esté entre 2025-02-26 y 2025-02-27 (inclusive).
  // Formato: created >= "YYYY-MM-DD HH:mm" AND created <= "YYYY-MM-DD HH:mm"
  // Ajusta el proyecto y las condiciones (status, etc.) a tu gusto.
  const jql = `
    project = PNCR
    AND created >= "2025-02-26 00:00"
    AND created <= "2025-02-27 23:59"
    ORDER BY created ASC
  `;

  // Codificamos la JQL
  const encodedJql = encodeURIComponent(jql.trim());

  // maxResults=50 para limitar la respuesta (evitar timeouts).
  // Pedimos los campos 'priority' y 'created'.
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50&fields=priority,created`;

  console.log("ticketsByDay - URL:", jiraUrl);

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
      console.error("ticketsByDay - Error from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log("ticketsByDay - total issues returned:", data.issues?.length || 0);

    // Agrupamos por día de creación (YYYY-MM-DD)
    const grouped = {}; // { "2025-02-26": { p1, p2, p3, total }, ... }

    for (const issue of data.issues || []) {
      const priorityName = issue.fields.priority?.name || "";
      const createdStr = issue.fields.created;
      if (!createdStr) continue;

      const dateObj = new Date(createdStr);
      if (isNaN(dateObj.getTime())) continue;

      const dateKey = dateObj.toISOString().split('T')[0]; 
      // Ej: "2025-02-26"

      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Checamos prioridad: P1, P2, P3
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    }

    console.log("ticketsByDay - grouped result:", grouped);

    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("ticketsByDay - Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

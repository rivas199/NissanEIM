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
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL: similar, para 14 días
  const jql = `
    project = PNCR
    AND issuetype in (subTaskIssueTypes())
    AND status in (Open, "In Testing", Scheduled, Blocked)
    AND "Start Date" >= startOfDay()
    AND "Start Date" <= endOfDay("+14d")
    ORDER BY priority DESC
  `;

  // Pedimos sólo fields=priority,"Start Date" y limitamos a 500
  const encodedJql = encodeURIComponent(jql.trim());
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=500&fields=priority,"Start Date"`;

  console.log("ticketsByDay - Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("ticketsByDay - response status:", response.status);

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

    // Agrupar por "Start Date":
    // { "YYYY-MM-DD": { p1: X, p2: Y, p3: Z, total: N } }
    const grouped = {};

    (data.issues || []).forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const startDateStr = issue.fields["Start Date"];

      if (!startDateStr) return; // no date => no grouping

      const dateObj = new Date(startDateStr);
      if (isNaN(dateObj.getTime())) return; // invalid date

      const dateKey = dateObj.toISOString().split('T')[0];

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
    });

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

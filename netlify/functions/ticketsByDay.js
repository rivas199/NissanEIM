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

  // Mapeo de prioridad → días
  const durationMap = {
    'P1': 2,
    'P2': 5,
    'P3': 10
  };

  // JQL para recuperar los tickets (con su prioridad y fecha de inicio)
  // Ajusta según tus campos y tus necesidades
  const jql = `project in (PNCR) AND issuetype in (subTaskIssueTypes()) 
               AND status in (Open, "In Testing", Scheduled, Blocked) 
               AND (cf[13001] is EMPTY OR cf[13001] <= 2w) 
               AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 
                                888024c2-03a4-402e-b2a8-71a57b8e900d, 
                                f7637a0a-ceb3-4ecf-babc-7674824a8b3d, 
                                c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 
                                4e95e2b2-53b1-4940-931e-019d149e85eb) 
               AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
               ORDER BY cf[13001] ASC, key ASC`;
  
  const encodedJql = encodeURIComponent(jql);
  // Limitar a 50 o 100 issues para reducir la carga
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50`;

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent: agent
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("Error response from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Jira returned status ${response.status}`, details: errorText })
      };
    }

    const data = await response.json();
    const grouped = {}; // { "YYYY-MM-DD": { p1, p2, p3, total } }
    const oneDayMs = 86400000;

    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const startStr = issue.fields.startDate; // Ajusta según tu campo real
      if (!startStr) return;

      // Determina el rango de días según la prioridad
      let daysToCount = 0;
      if (priorityName.includes("P1")) {
        daysToCount = 2;
      } else if (priorityName.includes("P2")) {
        daysToCount = 5;
      } else if (priorityName.includes("P3")) {
        daysToCount = 10;
      } else {
        return; // No es P1, P2 ni P3, no procesamos
      }

      const startDate = new Date(startStr);
      // Iteramos desde day 0 hasta daysToCount-1
      for (let i = 0; i < daysToCount; i++) {
        const currentDate = new Date(startDate.getTime() + i * oneDayMs);
        const dateKey = currentDate.toISOString().split('T')[0];
        if (!grouped[dateKey]) {
          grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
        }
        // Incrementa según la prioridad
        if (priorityName.includes("P1")) {
          grouped[dateKey].p1++;
        } else if (priorityName.includes("P2")) {
          grouped[dateKey].p2++;
        } else if (priorityName.includes("P3")) {
          grouped[dateKey].p3++;
        }
        grouped[dateKey].total++;
      }
    });

    // Retornamos el objeto agrupado
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

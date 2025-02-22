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
  
  const jql = `project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC`;
  
  const encodedJql = encodeURIComponent(jql);
  // Limitar a 100 issues para reducir la carga
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=100`;
  
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
        body: JSON.stringify({ error: `Jira returned status ${response.status}`, details: errorText })
      };
    }
    
    const data = await response.json();
    console.log("Data received from Jira:", data);
    
    const grouped = {}; // { "YYYY-MM-DD": { p1, p2, p3, total } }
    
    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const startStr = issue.fields.startDate;
      const endStr = issue.fields.finalDate;
      
      if (startStr && endStr) {
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);
        if (startDate > endDate) return;
        
        // Limitar a 60 días por ticket para evitar bucles excesivos
        const maxDaysPerTicket = 60;
        let dayCounter = 0;
        let currentDate = new Date(startDate);
        while (currentDate <= endDate && dayCounter < maxDaysPerTicket) {
          const dateKey = currentDate.toISOString().split('T')[0];
          if (!grouped[dateKey]) {
            grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
          }
          if (priorityName.includes("P1")) grouped[dateKey].p1++;
          else if (priorityName.includes("P2")) grouped[dateKey].p2++;
          else if (priorityName.includes("P3")) grouped[dateKey].p3++;
          grouped[dateKey].total++;
          
          currentDate.setDate(currentDate.getDate() + 1);
          dayCounter++;
        }
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

const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("JIRA_TOKEN is not defined");
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "JIRA_TOKEN not defined",
        debug: "No JIRA_TOKEN in environment variables"
      })
    };
  }

  let fetchModule;
  try {
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Error importing node-fetch",
        debug: importError.message
      })
    };
  }
  const fetch = fetchModule.default;

  // Optionally ignore self-signed certificates, etc.
  const agent = new https.Agent({ rejectUnauthorized: false });

  // Simple JQL for demonstration. Adjust as needed:
  const jql = `
   project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC
  `;

  // Log the JQL we’re using
  console.log("[ticketsByDay] Using JQL:", jql);

  const encodedJql = encodeURIComponent(jql.trim());
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50&fields=priority,created`;

  // Log the actual Jira URL
  console.log("[ticketsByDay] Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("[ticketsByDay] Jira response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ticketsByDay] Error text from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText,
          debug: "Failed on the response fetch"
        })
      };
    }

    // We do a quick debug log about the headers:
    console.log("[ticketsByDay] Response headers:", response.headers.raw());

    const data = await response.json();
    console.log("[ticketsByDay] Data received, total issues:", data.issues?.length || 0);

    // Group by date
    const grouped = {}; // e.g. { "2025-02-26": { p1: X, p2: Y, p3: Z, total: N }, ... }

    (data.issues || []).forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const createdStr = issue.fields.created || "";
      if (!createdStr) return;

      // Log a little debug if you want:
      console.log(`[ticketsByDay] Issue key: ${issue.key}, created: ${createdStr}, priority: ${priorityName}`);

      const dateObj = new Date(createdStr);
      if (isNaN(dateObj.getTime())) {
        console.warn(`[ticketsByDay] Invalid date: ${createdStr} for issue ${issue.key}`);
        return;
      }

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

    console.log("[ticketsByDay] Final grouped:", grouped);

    // We can return some debug info in the body if you want to see it in the browser
    return {
      statusCode: 200,
      body: JSON.stringify({
        result: grouped,
        debug: {
          totalIssuesReturned: data.issues?.length || 0,
          note: "Check Netlify logs for more details"
        }
      })
    };

  } catch (error) {
    console.error("[ticketsByDay] Exception:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        debug: "Exception occurred in the try-catch block"
      })
    };
  }
};

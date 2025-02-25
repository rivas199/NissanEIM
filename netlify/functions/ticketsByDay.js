const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("JIRA_TOKEN not defined");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "JIRA_TOKEN not defined" })
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

  // If you need to ignore certificate issues:
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL: only tickets created on 25-Feb-2025 (00:00 - 23:59).
  // Adjust the project/filters as needed (e.g. status, resolution, etc.).
  const jql = `
   project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC
  `;

  const encodedJql = encodeURIComponent(jql.trim());

  // Limit results (e.g. 50) so you won't get too many (avoid timeout).
  // Ask only for the fields we need: priority + created.
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50&fields=priority,created`;

  console.log("[ticketsByDay] JIRA URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("[ticketsByDay] Response status:", response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ticketsByDay] Error from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText
        })
      };
    }

    const data = await response.json();
    console.log("[ticketsByDay] Number of issues returned:", data.issues?.length || 0);

    // Group by date (YYYY-MM-DD), just in case you want a calendar display
    const grouped = {};

    for (const issue of data.issues || []) {
      const priorityName = issue.fields.priority?.name || "";
      const createdStr = issue.fields.created;
      if (!createdStr) continue;

      const dateObj = new Date(createdStr);
      if (isNaN(dateObj.getTime())) continue;

      const dateKey = dateObj.toISOString().split('T')[0]; // e.g. "2025-02-25"
      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Check priority to increment counters
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    }

    console.log("[ticketsByDay] Final grouped:", grouped);

    return {
      statusCode: 200,
      body: JSON.stringify({ result: grouped })
    };

  } catch (error) {
    console.error("[ticketsByDay] Exception:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

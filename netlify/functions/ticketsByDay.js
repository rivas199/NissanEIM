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
    fetchModule = await import('node-fetch'); // using node-fetch v3
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch", debug: importError.message })
    };
  }
  const fetch = fetchModule.default;
  const agent = new https.Agent({ rejectUnauthorized: false });

  // JQL: get unresolved tickets from project PNCR created from today until two months ahead.
  const jql = `
    project in (PNCR) AND issuetype in (subTaskIssueTypes()) AND status in (Open, "In Testing", Scheduled, Blocked) AND (cf[13001] is EMPTY OR cf[13001] <= 2w) AND assignee in (c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0, 888024c2-03a4-402e-b2a8-71a57b8e900d, f7637a0a-ceb3-4ecf-babc-7674824a8b3d, c530c7d6-3d70-4095-a64e-3cd4d9c4d746, 4e95e2b2-53b1-4940-931e-019d149e85eb) AND summary !~ "EIM2SPECS OR Test_Data OR GPAS" ORDER BY cf[13001] ASC, key ASC
  `;
  console.log("[ticketsByDay] Using JQL:", jql);

  const encodedJql = encodeURIComponent(jql.trim());
  // Limit to 500 results and request only the fields we need (priority and created)
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=500&fields=priority,created`;
  console.log("[ticketsByDay] Jira URL:", jiraUrl);

  try {
    const response = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    console.log("[ticketsByDay] Jira response status:", response.status);
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[ticketsByDay] Error from Jira:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: `Jira returned status ${response.status}`, details: errorText })
      };
    }

    const data = await response.json();
    console.log("[ticketsByDay] Total issues returned:", data.issues?.length || 0);

    // Group issues by their local created date (YYYY-MM-DD)
    const grouped = {};
    for (const issue of data.issues || []) {
      const priorityName = issue.fields.priority?.name || "";
      const createdStr = issue.fields.created;
      if (!createdStr) continue;

      // Parse the created date and use local values to avoid timezone shifts
      const dateObj = new Date(createdStr);
      if (isNaN(dateObj.getTime())) continue;
      const localYear = dateObj.getFullYear();
      const localMonth = dateObj.getMonth() + 1; // zero-based month, so add 1
      const localDay = dateObj.getDate();
      const dateKey = `${localYear}-${String(localMonth).padStart(2, '0')}-${String(localDay).padStart(2, '0')}`;

      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }
      if (priorityName.includes("P1")) grouped[dateKey].p1++;
      else if (priorityName.includes("P2")) grouped[dateKey].p2++;
      else if (priorityName.includes("P3")) grouped[dateKey].p3++;
      grouped[dateKey].total++;
    }

    console.log("[ticketsByDay] Grouped result:", grouped);
    return {
      statusCode: 200,
      body: JSON.stringify({ result: grouped, debug: { totalIssues: data.issues?.length || 0 } })
    };

  } catch (error) {
    console.error("[ticketsByDay] Exception:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

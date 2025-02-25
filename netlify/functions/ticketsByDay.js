const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("JIRA_TOKEN is not defined");
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "JIRA_TOKEN is not defined" })
    };
  }

  let fetchModule;
  try {
    // node-fetch v3 is ESM only
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" })
    };
  }
  const fetch = fetchModule.default;

  // If needed, ignore self-signed certs
  const agent = new https.Agent({ rejectUnauthorized: false });

  // --- 1) JQL from your example ---
  // This query fetches tasks from PNCR with specific conditions, 
  // including the custom field cf[13001], summary filters, and assignee.
  // We also ORDER BY "Start Date" (assuming that's the field name).
  const jql = `
    project = PNCR
    AND issuetype = Task
    AND status in (Open, "In Progress", Scheduled, Blocked)
    AND (cf[13001] is EMPTY OR (cf[13001] <= 8w AND cf[13001] >= 1w))
    AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
    AND assignee = c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0
    ORDER BY "Start Date" ASC
  `;

  // --- 2) Encode JQL for URL ---
  const encodedJql = encodeURIComponent(jql.trim());

  // --- 3) We request the fields we need: "Start Date" and "End Date"
  // (adjust if your actual field names differ). Also limit to 500 results 
  // to reduce risk of timeouts.
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=500&fields="Start Date","End Date"`;

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

    // --- 4) Parse JSON from Jira ---
    const data = await response.json();
    const issues = data.issues || [];
    console.log("[ticketsByDay] Total issues returned:", issues.length);

    // We'll build an object: { "YYYY-MM-DD": { count: N } }
    const grouped = {};

    for (const issue of issues) {
      // Get the "Start Date" and "End Date" fields
      // If your real fields are named differently, adjust here:
      const startStr = issue.fields["Start Date"];
      const endStr = issue.fields["End Date"];

      if (!startStr || !endStr) {
        // If either is missing, skip this issue
        continue;
      }

      const startDate = new Date(startStr);
      const endDate = new Date(endStr);

      // If the start is after the end, skip
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        continue;
      }

      // --- 5) Iterate day by day from startDate to endDate ---
      // So that each day in that range gets +1 in "count".
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        // Format local date as YYYY-MM-DD
        const year = currentDate.getFullYear();
        const month = String(currentDate.getMonth() + 1).padStart(2, '0');
        const day = String(currentDate.getDate()).padStart(2, '0');
        const dateKey = `${year}-${month}-${day}`;

        // Initialize if needed
        if (!grouped[dateKey]) {
          grouped[dateKey] = { count: 0 };
        }
        grouped[dateKey].count++;

        // Move to the next day
        currentDate.setDate(currentDate.getDate() + 1);
      }
    }

    console.log("[ticketsByDay] Grouped result:", grouped);

    // --- 6) Return the grouped object as JSON ---
    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("[ticketsByDay] Exception:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

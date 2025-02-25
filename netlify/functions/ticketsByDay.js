const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    console.error("[ticketsByDay] JIRA_TOKEN is not defined.");
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
    fetchModule = await import('node-fetch'); // node-fetch v3 in ESM
  } catch (importError) {
    console.error("[ticketsByDay] Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "Error importing node-fetch",
        debug: importError.message
      })
    };
  }
  const fetch = fetchModule.default;

  // If you need to ignore self-signed SSL certs, etc.
  const agent = new https.Agent({ rejectUnauthorized: false });

  // *** MODIFY THIS JQL TO MATCH YOUR OLD ONE, if you like ***
  // Example: getting unresolved PNCR tickets from Jan 1 to Feb 28, 2025
  // Just an illustration. Adjust to your real desired JQL.
  const jql = `
    project = PNCR
    AND resolution = Unresolved
    AND created >= "2025-01-01 00:00"
    AND created <= "2025-02-28 23:59"
    ORDER BY created DESC
  `;

  console.log("[ticketsByDay] Using JQL:", jql);

  const encodedJql = encodeURIComponent(jql.trim());
  // Request only fields we need (priority, created),
  // limit to 50 results to avoid timeouts
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50&fields=priority,created`;

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
      console.error("[ticketsByDay] Jira error text:", errorText);
      return {
        statusCode: response.status,
        body: JSON.stringify({
          error: `Jira returned status ${response.status}`,
          details: errorText,
          debug: "Failed on the fetch response"
        })
      };
    }

    const data = await response.json();
    const issuesArray = data.issues || [];
    console.log("[ticketsByDay] Total issues returned:", issuesArray.length);

    // ============ GROUPING BY LOCAL DATE ==================
    // We use local year, month, day (instead of toISOString()) to avoid time-zone shifts.
    //
    // We'll store them in an object:
    //    { "YYYY-MM-DD": { p1: number, p2: number, p3: number, total: number }, ... }
    const grouped = {};

    for (const issue of issuesArray) {
      const priorityName = issue.fields.priority?.name || "";
      const createdStr = issue.fields.created;
      if (!createdStr) {
        console.warn(`[ticketsByDay] Issue ${issue.key} has no 'created' field? Skipping...`);
        continue;
      }

      // Parse the date in local time
      const dateObj = new Date(createdStr);
      if (isNaN(dateObj.getTime())) {
        console.warn(`[ticketsByDay] Invalid date: ${createdStr} for issue ${issue.key}`);
        continue;
      }

      // Build a date key using local year, month, day
      const localYear = dateObj.getFullYear();
      const localMonth = dateObj.getMonth() + 1; // getMonth() is 0-based
      const localDay = dateObj.getDate();

      // e.g. "2025-01-23"
      const dateKey = `${localYear}-${String(localMonth).padStart(2,'0')}-${String(localDay).padStart(2,'0')}`;

      // Initialize if not present
      if (!grouped[dateKey]) {
        grouped[dateKey] = { p1: 0, p2: 0, p3: 0, total: 0 };
      }

      // Count priority
      if (priorityName.includes("P1")) {
        grouped[dateKey].p1++;
      } else if (priorityName.includes("P2")) {
        grouped[dateKey].p2++;
      } else if (priorityName.includes("P3")) {
        grouped[dateKey].p3++;
      }
      grouped[dateKey].total++;
    }

    console.log("[ticketsByDay] Final grouped result:", grouped);

    // Return final JSON
    return {
      statusCode: 200,
      body: JSON.stringify({
        result: grouped,
        debug: {
          totalIssues: issuesArray.length,
          note: "Using local date grouping to avoid timezone shifts"
        }
      })
    };

  } catch (error) {
    console.error("[ticketsByDay] Exception:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error.message,
        debug: "Exception in try-catch"
      })
    };
  }
};

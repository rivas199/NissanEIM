const https = require('https');
const JIRA_TOKEN = process.env.JIRA_TOKEN;

exports.handler = async (event, context) => {
  if (!JIRA_TOKEN) {
    return { statusCode: 500, body: JSON.stringify({ error: "JIRA_TOKEN not defined" }) };
  }

  let fetchModule;
  try {
    fetchModule = await import('node-fetch'); 
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: "Error importing node-fetch" }) };
  }
  const fetch = fetchModule.default;

  // Example JQL referencing cf[13001] in your filters:
  const jql = `
    project = PNCR
    AND issuetype = Task
    AND status in (Open, "In Progress", Scheduled, Blocked)
    AND (cf[13001] is EMPTY OR (cf[13001] <= 8w AND cf[13001] >= 1w))
    AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
    AND assignee = c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0
    ORDER BY cf[13001] ASC
  `;

  // We request cf[13001] and cf[13002] plus anything else you need
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodeURIComponent(jql)}&maxResults=500&fields=cf[13001],cf[13002],priority`;

  const agent = new https.Agent({ rejectUnauthorized: false });
  
  try {
    const resp = await fetch(jiraUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${JIRA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      agent
    });

    if (!resp.ok) {
      const text = await resp.text();
      return {
        statusCode: resp.status,
        body: JSON.stringify({ error: `Jira error ${resp.status}`, details: text })
      };
    }

    const data = await resp.json();
    const issues = data.issues || [];

    // We'll build { "YYYY-MM-DD": { count: N } }
    const grouped = {};

    issues.forEach(issue => {
      const startStr = issue.fields["cf[13001]"]; // Start
      const endStr   = issue.fields["cf[13002]"]; // End
      if (!startStr || !endStr) return;

      const startDate = new Date(startStr);
      const endDate   = new Date(endStr);
      if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || startDate > endDate) {
        return;
      }

      // day-by-day iteration
      let current = new Date(startDate);
      while (current <= endDate) {
        const y = current.getFullYear();
        const m = String(current.getMonth()+1).padStart(2, '0');
        const d = String(current.getDate()).padStart(2, '0');
        const dateKey = `${y}-${m}-${d}`;

        if (!grouped[dateKey]) {
          grouped[dateKey] = { count: 0 };
        }
        grouped[dateKey].count++;

        current.setDate(current.getDate() + 1);
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // 1) Leer parámetros de la query string: ?start=YYYY-MM-DD&end=YYYY-MM-DD
    const { start, end } = event.queryStringParameters || {};
    if (!start || !end) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Faltan parámetros "start" y "end"' })
      };
    }

    const startDate = new Date(start);
    const endDate = new Date(end);
    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Fechas inválidas' })
      };
    }

    // 2) Variables de entorno en Netlify para Jira
    const baseUrl  = process.env.JIRA_BASE_URL;   // e.g. "https://xxx.atlassian.net"
    const username = process.env.JIRA_USERNAME;
    const apiToken = process.env.JIRA_API_TOKEN;

    if (!baseUrl || !username || !apiToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: 'Faltan variables de entorno: JIRA_BASE_URL, JIRA_USERNAME, JIRA_API_TOKEN'
        })
      };
    }

    // 3) Autenticación (Basic Auth)
    const auth = Buffer.from(`${username}:${apiToken}`).toString('base64');

    // Contador por día
    const dailyCounts = {};

    // 4) Bucle día a día
    for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
      const dayStr = new Date(d).toISOString().split('T')[0];
      // nextDay = día + 1
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      const nextDayStr = next.toISOString().split('T')[0];

      // JQL: Priorities P1,P2,P3 + created >= dayStr AND < nextDayStr
      // Ajusta el nombre de las prioridades si en tu Jira se llaman distinto (High, Low, etc.)
      const jql = `priority in (P1, P2, P3) AND created >= "${dayStr}" AND created < "${nextDayStr}"`;

      const url = `${baseUrl}/rest/api/3/search?jql=${encodeURIComponent(jql)}&maxResults=1000`;
      const resp = await fetch(url, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (!resp.ok) {
        throw new Error(`Error Jira (día ${dayStr}): ${resp.status} ${resp.statusText}`);
      }

      const data = await resp.json();
      const issues = data.issues || [];

      let p1 = 0, p2 = 0, p3 = 0;
      issues.forEach(issue => {
        const priorityName = issue.fields?.priority?.name;
        if (priorityName === 'P1') p1++;
        else if (priorityName === 'P2') p2++;
        else if (priorityName === 'P3') p3++;
      });

      dailyCounts[dayStr] = { p1, p2, p3 };
    }

    // 5) Devolver respuesta
    return {
      statusCode: 200,
      body: JSON.stringify({ dailyCounts })
    };

  } catch (error) {
    console.error('Error en jiraTicketsByDay:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

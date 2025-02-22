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

  // Mapeo de prioridad a duración fija en días:
  // P1: 2 días, P2: 5 días, P3: 10 días.
  const durationMap = {
    P1: 2,
    P2: 5,
    P3: 10
  };

  // JQL para recuperar tickets (ajusta según tus necesidades y nombres de campos)
  const jql = `project = PNCR
               AND issuetype in (subTaskIssueTypes())
               AND status in (Open, "In Testing", Scheduled, Blocked)
               AND assignee in (
                  c2d37c51-9fc7-4dd3-8bf1-92c674ee6bb0,
                  888024c2-03a4-402e-b2a8-71a57b8e900d,
                  f7637a0a-ceb3-4ecf-babc-7674824a8b3d,
                  c530c7d6-3d70-4095-a64e-3cd4d9c4d746,
                  4e95e2b2-53b1-4940-931e-019d149e85eb
               )
               AND summary !~ "EIM2SPECS OR Test_Data OR GPAS"
               ORDER BY created DESC`;
  
  const encodedJql = encodeURIComponent(jql);
  // Limitar a 50 issues para reducir carga
  const jiraUrl = `https://tools.publicis.sapient.com/jira/rest/api/2/search?jql=${encodedJql}&maxResults=50`;

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
    console.log("Total issues recibidos:", data.issues.length);

    // 1. Recopilar eventos de inicio y fin para cada ticket.
    // Para cada ticket, registramos:
    //   - Un evento +1 en el día de inicio.
    //   - Un evento -1 en el día siguiente al final (calculado según la prioridad).
    const events = {}; // Estructura: { "YYYY-MM-DD": { p1Delta, p2Delta, p3Delta } }
    
    data.issues.forEach(issue => {
      const priorityName = issue.fields.priority?.name || "";
      const startStr = issue.fields.startDate; // Asegúrate de que este sea el campo correcto
      if (!startStr) return; // Si no hay fecha de inicio, ignoramos el ticket
      
      let p = "";
      if (priorityName.includes("P1")) p = "P1";
      else if (priorityName.includes("P2")) p = "P2";
      else if (priorityName.includes("P3")) p = "P3";
      if (!p) return;
      
      const daysToCount = durationMap[p];
      const startDate = new Date(startStr);
      // El último día que se cuenta es (startDate + daysToCount - 1)
      const endDate = new Date(startDate.getTime() + (daysToCount - 1) * 86400000);
      // Día siguiente al final para el decremento:
      const dayAfterEnd = new Date(endDate.getTime() + 86400000);
      
      const startKey = startDate.toISOString().split("T")[0];
      const dayAfterEndKey = dayAfterEnd.toISOString().split("T")[0];
      
      // Incremento en el día de inicio:
      if (!events[startKey]) {
        events[startKey] = { p1Delta: 0, p2Delta: 0, p3Delta: 0 };
      }
      if (p === "P1") events[startKey].p1Delta++;
      if (p === "P2") events[startKey].p2Delta++;
      if (p === "P3") events[startKey].p3Delta++;
      
      // Decremento en el día siguiente al final:
      if (!events[dayAfterEndKey]) {
        events[dayAfterEndKey] = { p1Delta: 0, p2Delta: 0, p3Delta: 0 };
      }
      if (p === "P1") events[dayAfterEndKey].p1Delta--;
      if (p === "P2") events[dayAfterEndKey].p2Delta--;
      if (p === "P3") events[dayAfterEndKey].p3Delta--;
    });
    
    // 2. Ordenar las fechas y acumular para obtener el total de tickets en cada día.
    const allDates = Object.keys(events).sort();
    let currentP1 = 0, currentP2 = 0, currentP3 = 0;
    const grouped = {}; // Resultado final: { "YYYY-MM-DD": { p1, p2, p3, total } }
    
    for (const dateKey of allDates) {
      const { p1Delta, p2Delta, p3Delta } = events[dateKey];
      currentP1 += p1Delta;
      currentP2 += p2Delta;
      currentP3 += p3Delta;
      
      grouped[dateKey] = {
        p1: currentP1,
        p2: currentP2,
        p3: currentP3,
        total: currentP1 + currentP2 + currentP3
      };
    }
    
    console.log("Resultado line sweep:", grouped);
    
    // 3. Revisar si en algún día hay más de 14 tickets corriendo
    for (const dateKey in grouped) {
      if (grouped[dateKey].total > 14) {
        console.log(`ALERTA: El día ${dateKey} tiene ${grouped[dateKey].total} tickets corriendo.`);
      }
    }
    
    return {
      statusCode: 200,
      body: JSON.stringify(grouped)
    };

  } catch (error) {
    console.error("Error en la consulta a Jira:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};

const https = require('https');

exports.handler = async (event, context) => {
  // Dynamically import node-fetch
  let fetchModule;
  try {
    fetchModule = await import('node-fetch');
  } catch (importError) {
    console.error("Error importing node-fetch:", importError);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Error importing node-fetch" }),
    };
  }
  const fetch = fetchModule.default;

  // Create an HTTPS agent (ignores certificate errors if needed)
  const agent = new https.Agent({ rejectUnauthorized: false });

  try {
    // Parse the payload sent from the frontend
    const payload = JSON.parse(event.body);
    const apiEndpoint = payload.apiEndpoint; // The selected API endpoint from the frontend
    console.log("Forwarding request to API endpoint:", apiEndpoint);

    // Forward the request to the external API
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      agent: agent
    });
    console.log("Response status from external API:", response.status);

    // Get the raw response text and parse as JSON
    const text = await response.text();
    let apiData;
    try {
      apiData = JSON.parse(text);
    } catch (jsonError) {
      console.error("Error parsing API response as JSON:", jsonError, "Raw response:", text);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Invalid JSON response from external API", raw: text })
      };
    }

    console.log("Full API response:", apiData);

    // Initialize simplified result with default values
    let simplified = {
      eim: "N/A",
      modelYear: "N/A",
      price: "N/A",
      color: "N/A",
      grade: "N/A",
      gradeName: "N/A",
      publishedDate: "N/A"
    };

    // Assume the response structure is similar to:
    // {
    //   "eims": [
    //     {
    //       "publishedDate": "2025-02-04 20:38:11+00",
    //       "year": "2025",
    //       "versions": [
    //         {
    //           "retailPrice": 599900,
    //           "gradeCode": "30042-ADVANCE_2_ROW",
    //           "name": [{"languageCode":"es","text":"Advance 2 Row"}],
    //           "equipment": [ { "typeList": ["EXTERIOR_COLOR"], "name": [{"languageCode":"es","text":"Rojo Burdeos"}] } ]
    //         }
    //       ],
    //       "eims": [
    //         { "eim": "TCJALBWT33EJAB---A" }
    //       ]
    //     }
    //   ]
    // }
    if (apiData && apiData.eims && Array.isArray(apiData.eims) && apiData.eims.length > 0) {
      const outerObj = apiData.eims[0];
      simplified.modelYear = outerObj.year || "N/A";
      simplified.publishedDate = outerObj.publishedDate || "N/A";

      if (outerObj.versions && Array.isArray(outerObj.versions) && outerObj.versions.length > 0) {
        const version = outerObj.versions[0];
        simplified.price = version.retailPrice || "N/A";
        simplified.grade = version.gradeCode || "N/A";

        // Extract Grade Name from version.name array
        if (version.name && Array.isArray(version.name) && version.name.length > 0) {
          const gradeObj = version.name.find(n => n.languageCode === "es") || version.name[0];
          simplified.gradeName = gradeObj.text || "N/A";
        }

        // Extract color by looking for equipment with type "EXTERIOR_COLOR"
        if (version.equipment && Array.isArray(version.equipment)) {
          for (let eq of version.equipment) {
            if (eq.typeList && Array.isArray(eq.typeList) && eq.typeList.includes("EXTERIOR_COLOR")) {
              if (eq.name && Array.isArray(eq.name) && eq.name.length > 0) {
                const nameObj = eq.name.find(n => n.languageCode === "es") || eq.name[0];
                simplified.color = nameObj.text || "N/A";
                break;
              }
            }
          }
        }
      }
      // Extract the EIM from a nested "eims" array if it exists
      if (outerObj.eims && Array.isArray(outerObj.eims) && outerObj.eims.length > 0) {
        simplified.eim = outerObj.eims[0].eim || "N/A";
      }
    }

    // Prepare final result object with separate fields
    const result = {
      eim: simplified.eim,
      modelYear: simplified.modelYear,
      price: simplified.price,
      color: simplified.color,
      grade: simplified.grade,
      gradeName: simplified.gradeName,
      publishedDate: simplified.publishedDate,
      message: `I found your EIM: ${simplified.eim}`
    };

    return {
      statusCode: response.status,
      body: JSON.stringify(result)
    };

  } catch (error) {
    console.error("Proxy error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal Server Error' })
    };
  }
};

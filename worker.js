export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Define CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400',
    };

    // Route non-API requests to static assets
    if (!path.startsWith('/api/')) {
      return env.ASSETS.fetch(request);
    }

    // Handle OPTIONS request for CORS preflight (for APIs)
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: corsHeaders,
      });
    }

    try {
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const body = await request.json();

      if (path === '/api/suggest-plan') {
        const result = await handleSuggestPlan(body, env);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } else if (path === '/api/fetch-tips') {
        const result = await handleFetchTips(body, env);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } else if (path === '/api/fetch-visa') {
        const result = await handleFetchVisa(body, env);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      } else {
        return new Response(JSON.stringify({ error: 'Route Not Found' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }
  }
};

// Helper to call Gemini API
async function callGemini(prompt, env, useSearch = true) {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY environment variable is not set.');
  }

  const model = env.GEMINI_MODEL || 'gemini-2.5-flash';
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [
      {
        parts: [
          {
            text: prompt
          }
        ]
      }
    ]
  };

  if (useSearch) {
    payload.tools = [
      {
        googleSearch: {}
      }
    ];
  }

  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
  }

  const responseData = await response.json();
  
  if (!responseData.candidates || responseData.candidates.length === 0) {
    throw new Error('No completion candidates returned from Gemini API.');
  }

  let rawText = responseData.candidates[0].content.parts[0].text.trim();

  // Clean markdown JSON wrappers if present
  if (rawText.startsWith('```')) {
    rawText = rawText.replace(/^```(?:json)?\n/, '').replace(/\n```$/, '').trim();
  }

  // Regex fallback to find JSON block if there's surrounding text
  if (! (rawText.startsWith('{') && rawText.endsWith('}'))) {
    const match = rawText.match(/(\{.*\})/s);
    if (match) {
      rawText = match[1];
    }
  }

  try {
    return JSON.parse(rawText);
  } catch (err) {
    // Try to clean trailing commas before closing braces/brackets
    try {
      const fixedText = rawText.replace(/,\s*([\]}])/g, '$1');
      return JSON.parse(fixedText);
    } catch (_) {
      throw new Error(`Failed to parse Gemini response as JSON: ${rawText}`);
    }
  }
}

async function handleSuggestPlan(payload, env) {
  const route = payload.route || {};
  const dates = payload.dates || {};
  const travelers = payload.travelers || {};
  const vibes = payload.vibes || {};

  const startingPoint = route.startingPoint || 'Unknown';
  const primaryDest = route.primaryDestination || 'Unknown';
  const additionalDests = route.additionalDestinations || [];
  
  const startDate = dates.startDate || '';
  const endDate = dates.endDate || '';
  
  const adults = travelers.adults || 1;
  const children = travelers.children || 0;
  const seniors = travelers.seniorCitizens || 0;
  const totalCount = travelers.totalCount || 1;
  
  const tripType = vibes.tripType || 'couple';
  const budgetTier = vibes.budgetTier || 'mid_range';

  let seniorInstructions = '';
  if (seniors > 0) {
    seniorInstructions = `
  * CRITICAL HEALTH & ACCESSIBILITY DIRECTIVE FOR SENIORS (${seniors} senior travelers):
    - You MUST perform a dynamic environmental risk assessment for '${primaryDest}'.
    - If the destination has hot/humid climate (e.g. Rome in summer, Goa, deserts), suggest daily rest during peak UV hours, outline hydration protocols, and advise air-conditioned private transfers.
    - If the destination is historic/urban with cobblestones or steep steps (e.g. Athens, old town centers), explicitly warn about uneven terrain, recommend sturdy orthopedic shoes, and highlight wheelchair/handrail availability.
    - If the location is at high altitude (e.g. Leh, Cusco), emphasize oxygen saturation levels, acclimatization periods (24-48 hours), and medical clinics.
    - Incorporate a general leisurely pace, regular hydration stops, and comfortable seating notes directly inside the activities' 'accessibilityNote' fields.
  `;
  }

  const vibeTailoringInstructions = `
  * CRITICAL COMPANION VIBE DIRECTIVE (Vibe Style: '${tripType}'):
    - If 'couple': Structure a highly romantic, intimate, and scenic schedule. Start mornings later (after 9:30 AM) to allow relaxed wake-ups. Prioritize private sunset views, candlelit dinners, boutique/couples-oriented dining, and scenic private transport.
    - If 'friends': Structure an active, highly social, and energetic itinerary. Start mornings earlier with fun group activities. Include local street-food crawls, adventure options (biking, hiking, water sports), and lively evening hotspots (izakayas, night markets, social lounges).
    - If 'family': Structure a highly family-friendly, well-spaced itinerary. Include kid-friendly interactive spots (museums, parks, zoos), stroller-friendly flat paths, frequent snack breaks, and early evening dinners completed by 7:30 PM.
  `;

  const prompt = `
  Create a personalized, day-by-day travel itinerary from ${startingPoint} to ${primaryDest}.
  Additional stops requested: ${additionalDests.length > 0 ? additionalDests.join(', ') : 'None'}.
  
  Dates: ${startDate} to ${endDate}.
  Travelers: ${totalCount} total (${adults} adults, ${children} children, ${seniors} seniors).
  Vibe / Trip Type: ${tripType}
  Budget Tier: ${budgetTier}
  
  ${seniorInstructions}
  ${vibeTailoringInstructions}
  
  Instructions:
  1. Enable real-time Google Search grounding to find active, highly rated travel spots, landmarks, local delicacies, and restaurants.
  2. Make each activity description highly engaging, tailored, and premium.
  3. If there are children or seniors, customize the 'accessibilityNote' inside the activities and provide relevant general 'accessibilityWarnings' (e.g. altitude, stairs, pacing, climate).
  4. Provide the 'summary' as a highly structured, premium HTML block. It MUST be extremely concise:
     - A single introductory sentence of under 25 words summarizing the trip's spirit.
     - Followed immediately by a clean, elegant HTML bulleted list (<ul> and <li>) highlighting:
       * **Accommodation**: Bold recommended hotels/stays matching the '${budgetTier}' budget.
       * **Style & Vibe**: The pace, companion dynamics, and theme.
       * **Transport**: Best local transport recommendations.
     - Keep it extremely light, spacious, and brief. No dense paragraphs.
  5. Suggest 2 real-world hotel options matching the '${budgetTier}' budget at the end of each day. For each hotel, generate a Google Maps search link in the exact format: https://www.google.com/maps/search/?api=1&query=Hotel+Name
  6. Search for lesser known, niche, or specific interesting facts or tips about the day's location and populate the 'hiddenGem' field.
  7. Return the response strictly as a JSON object matching the following structure:
  {
      "tripTitle": "Catchy and premium title for the trip",
      "startingPoint": "${startingPoint}",
      "primaryDestination": "${primaryDest}",
      "additionalDestinations": ${JSON.stringify(additionalDests)},
      "startDate": "${startDate}",
      "endDate": "${endDate}",
      "summary": "Brief HTML-formatted premium narrative summary introducing the trip highlights, hotels, and style.",
      "days": [
          {
              "dayNumber": 1,
              "theme": "Theme/focus of this specific day, e.g. Historical & Cultural Treasures",
              "hiddenGem": "A fascinating, lesser-known local secret, niche shop, historic legend, or hidden viewpoint about this location.",
              "activities": {
                  "morning": {
                      "title": "Title of the activity",
                      "description": "Description of the activity.",
                      "accessibilityNote": "Accessibility warning or note, or null if none"
                  },
                  "afternoon": {
                      "title": "Title",
                      "description": "Description.",
                      "accessibilityNote": "Accessibility note or null"
                  },
                  "evening": {
                      "title": "Title",
                      "description": "Description.",
                      "accessibilityNote": "Accessibility note or null"
                  }
              },
              "hotelOptions": [
                  {
                      "name": "Exact Name of Hotel 1",
                      "whyChoose": "1-sentence compelling reason to stay here matching the ${budgetTier} tier.",
                      "mapsLink": "https://www.google.com/maps/search/?api=1&query=Hotel+Name+City"
                  },
                  {
                      "name": "Exact Name of Hotel 2",
                      "whyChoose": "1-sentence compelling reason to stay here matching the ${budgetTier} tier.",
                      "mapsLink": "https://www.google.com/maps/search/?api=1&query=Hotel+Name+City"
                  }
              ]
          }
      ],
      "accessibilityWarnings": [
          "Key alert 1",
          "Key alert 2"
      ]
  }
  
  IMPORTANT: Your response must be only valid JSON. Do not include markdown code block syntax (like \`\`\`json). Just the raw JSON content itself. Do not include any trailing commas.
  `;

  return callGemini(prompt, env, true);
}

async function handleFetchTips(payload, env) {
  const city = payload.city || 'Unknown';
  const prompt = `
  Provide a concise travel lingo and cultural etiquette tips guide for the city: '${city}'.
  
  Instructions:
  1. Find exactly 3 highly useful local lingo/phrases (with their English translations/pronunciations).
  2. Find exactly 3 practical cultural etiquette Do's and Don'ts tips (Dos: behavior to adopt, Don'ts: behavior to avoid).
  3. Make the tips highly specific and actionable for a tourist in ${city}.
  4. Return the response strictly as a JSON object matching this structure:
  {
      "phrases": [
          {"local": "Local Phrase", "meaning": "English Meaning / Pronunciation"}
      ],
      "etiquette": [
          {"type": "Do", "tip": "Actionable Do behavior details"},
          {"type": "Don't", "tip": "Actionable Don't behavior details"}
      ]
  }
  
  IMPORTANT: Your response must be only valid JSON. Do not include markdown wraps.
  `;

  return callGemini(prompt, env, true);
}

async function handleFetchVisa(payload, env) {
  const source = payload.source || 'Unknown';
  const destination = payload.destination || 'Unknown';
  const prompt = `
  Provide a concise summary of visa and entry requirements for a citizen of country '${source}' traveling to country '${destination}' as a tourist.
  
  Instructions:
  1. Use Google Search grounding to find the latest visa regulations (e.g. Visa-free entry, Visa on Arrival, eVisa, or paper visa requirements).
  2. Detail passport validity requirements (e.g. 6 months validity needed).
  3. Provide 1-2 primary official government or embassy reference source links where they can apply or verify the regulations.
  4. Return the response strictly as a JSON object matching this structure:
  {
      "visaRequired": true or false,
      "type": "Visa on Arrival / eVisa / Visa-free limit X days / Paper Visa",
      "summary": "Concise 2-3 sentence overview of the entry rules and eVisa links if applicable.",
      "passportValidity": "Passport must be valid for at least 6 months from date of entry.",
      "sources": [
          {"name": "Official eVisa Portal / Ministry of Foreign Affairs", "url": "https://..."}
      ]
  }
  
  IMPORTANT: Your response must be only valid JSON. Do not include markdown wraps.
  `;

  return callGemini(prompt, env, true);
}

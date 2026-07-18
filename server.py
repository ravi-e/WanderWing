import os
import json
import re
import mimetypes
import traceback
from http.server import HTTPServer, BaseHTTPRequestHandler
from google import genai
from google.genai import types

# Load environment variables from .env if present
if os.path.exists(".env"):
    with open(".env", "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                parts = line.split("=", 1)
                if len(parts) == 2:
                    key = parts[0].strip()
                    val = parts[1].strip().strip("'\"")
                    os.environ[key] = val

# ----------------------------------------------------------------------
# HTTP Request Handler
# ----------------------------------------------------------------------
class TravelPlannerHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        path = self.path
        if path == "/":
            path = "/index.html"
            
        clean_path = path.lstrip("/")
        file_path = os.path.join(os.getcwd(), clean_path)
        
        if os.path.exists(file_path) and os.path.isfile(file_path):
            self.send_response(200)
            mime_type, _ = mimetypes.guess_type(file_path)
            self.send_header("Content-Type", mime_type or "application/octet-stream")
            self.end_headers()
            with open(file_path, "rb") as f:
                self.wfile.write(f.read())
        else:
            self.send_error(404, "File Not Found")

    def do_POST(self):
        if self.path == "/api/suggest-plan":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode("utf-8"))
                itinerary_data = self.generate_gemini_itinerary(payload)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(itinerary_data).encode("utf-8"))
            except Exception as e:
                err_trace = traceback.format_exc()
                print(f"[ERROR] API Suggest Plan failed:\n{err_trace}")
                
                with open("error_log.txt", "a", encoding="utf-8") as err_f:
                    err_f.write(f"\n--- ERROR AT {self.date_time_string()} ---\n{err_trace}\n")
                
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e), "trace": err_trace}).encode("utf-8"))
                
        elif self.path == "/api/fetch-tips":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode("utf-8"))
                tips_data = self.generate_gemini_tips(payload)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(tips_data).encode("utf-8"))
            except Exception as e:
                print(f"[ERROR] API Fetch Tips failed: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
                
        elif self.path == "/api/fetch-visa":
            content_length = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_length)
            
            try:
                payload = json.loads(post_data.decode("utf-8"))
                visa_data = self.generate_gemini_visa(payload)
                
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps(visa_data).encode("utf-8"))
            except Exception as e:
                print(f"[ERROR] API Fetch Visa failed: {e}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode("utf-8"))
        else:
            self.send_error(404, "API Route Not Found")

    def generate_gemini_itinerary(self, payload):
        route = payload.get("route", {})
        dates = payload.get("dates", {})
        travelers = payload.get("travelers", {})
        vibes = payload.get("vibes", {})

        starting_point = route.get("startingPoint", "Unknown")
        primary_dest = route.get("primaryDestination", "Unknown")
        additional_dests = route.get("additionalDestinations", [])
        
        start_date = dates.get("startDate", "")
        end_date = dates.get("endDate", "")
        
        adults = travelers.get("adults", 1)
        children = travelers.get("children", 0)
        seniors = travelers.get("seniorCitizens", 0)
        total_count = travelers.get("totalCount", 1)
        
        trip_type = vibes.get("tripType", "couple")
        budget_tier = vibes.get("budgetTier", "mid_range")

        # 👥 Intelligent Senior Citizen Pacing Directive
        senior_instructions = ""
        if seniors > 0:
            senior_instructions = f"""
        * CRITICAL HEALTH & ACCESSIBILITY DIRECTIVE FOR SENIORS ({seniors} senior travelers):
          - You MUST perform a dynamic environmental risk assessment for '{primary_dest}'.
          - If the destination has hot/humid climate (e.g. Rome in summer, Goa, deserts), suggest daily rest during peak UV hours, outline hydration protocols, and advise air-conditioned private transfers.
          - If the destination is historic/urban with cobblestones or steep steps (e.g. Athens, old town centers), explicitly warn about uneven terrain, recommend sturdy orthopedic shoes, and highlight wheelchair/handrail availability.
          - If the location is at high altitude (e.g. Leh, Cusco), emphasize oxygen saturation levels, acclimatization periods (24-48 hours), and medical clinics.
          - Incorporate a general leisurely pace, regular hydration stops, and comfortable seating notes directly inside the activities' 'accessibilityNote' fields.
        """

        # 🎒 Dynamic Trip Vibe Tailoring Directive
        vibe_tailoring_instructions = f"""
        * CRITICAL COMPANION VIBE DIRECTIVE (Vibe Style: '{trip_type}'):
          - If 'couple': Structure a highly romantic, intimate, and scenic schedule. Start mornings later (after 9:30 AM) to allow relaxed wake-ups. Prioritize private sunset views, candlelit dinners, boutique/couples-oriented dining, and scenic private transport.
          - If 'friends': Structure an active, highly social, and energetic itinerary. Start mornings earlier with fun group activities. Include local street-food crawls, adventure options (biking, hiking, water sports), and lively evening hotspots (izakayas, night markets, social lounges).
          - If 'family': Structure a highly family-friendly, well-spaced itinerary. Include kid-friendly interactive spots (museums, parks, zoos), stroller-friendly flat paths, frequent snack breaks, and early evening dinners completed by 7:30 PM.
        """

        prompt = f"""
        Create a personalized, day-by-day travel itinerary from {starting_point} to {primary_dest}.
        Additional stops requested: {', '.join(additional_dests) if additional_dests else 'None'}.
        
        Dates: {start_date} to {end_date}.
        Travelers: {total_count} total ({adults} adults, {children} children, {seniors} seniors).
        Vibe / Trip Type: {trip_type}
        Budget Tier: {budget_tier}
        
        {senior_instructions}
        {vibe_tailoring_instructions}
        
        Instructions:
        1. Enable real-time Google Search grounding to find active, highly rated travel spots, landmarks, local delicacies, and restaurants.
        2. Make each activity description highly engaging, tailored, and premium.
        3. If there are children or seniors, customize the 'accessibilityNote' inside the activities and provide relevant general 'accessibilityWarnings' (e.g. altitude, stairs, pacing, climate).
        4. Provide the 'summary' as a highly structured, premium HTML block. It MUST be extremely concise:
           - A single introductory sentence of under 25 words summarizing the trip's spirit.
           - Followed immediately by a clean, elegant HTML bulleted list (<ul> and <li>) highlighting:
             * **Accommodation**: Bold recommended hotels/stays matching the '{budget_tier}' budget.
             * **Style & Vibe**: The pace, companion dynamics, and theme.
             * **Transport**: Best local transport recommendations.
           - Keep it extremely light, spacious, and brief. No dense paragraphs.
        5. Suggest 2 real-world hotel options matching the '{budget_tier}' budget at the end of each day. For each hotel, generate a Google Maps search link in the exact format: https://www.google.com/maps/search/?api=1&query=Hotel+Name
        6. Search for lesser known, niche, or specific interesting facts or tips about the day's location and populate the 'hiddenGem' field.
        7. Return the response strictly as a JSON object matching the following structure:
        {{
            "tripTitle": "Catchy and premium title for the trip",
            "startingPoint": "{starting_point}",
            "primaryDestination": "{primary_dest}",
            "additionalDestinations": {json.dumps(additional_dests)},
            "startDate": "{start_date}",
            "endDate": "{end_date}",
            "summary": "Brief HTML-formatted premium narrative summary introducing the trip highlights, hotels, and style.",
            "days": [
                {{
                    "dayNumber": 1,
                    "theme": "Theme/focus of this specific day, e.g. Historical & Cultural Treasures",
                    "hiddenGem": "A fascinating, lesser-known local secret, niche shop, historic legend, or hidden viewpoint about this location.",
                    "activities": {{
                        "morning": {{
                            "title": "Title of the activity",
                            "description": "Description of the activity.",
                            "accessibilityNote": "Accessibility warning or note, or null if none"
                        }},
                        "afternoon": {{
                            "title": "Title",
                            "description": "Description.",
                            "accessibilityNote": "Accessibility note or null"
                        }},
                        "evening": {{
                            "title": "Title",
                            "description": "Description.",
                            "accessibilityNote": "Accessibility note or null"
                        }}
                    }},
                    "hotelOptions": [
                        {{
                            "name": "Exact Name of Hotel 1",
                            "whyChoose": "1-sentence compelling reason to stay here matching the {budget_tier} tier.",
                            "mapsLink": "https://www.google.com/maps/search/?api=1&query=Hotel+Name+City"
                        }},
                        {{
                            "name": "Exact Name of Hotel 2",
                            "whyChoose": "1-sentence compelling reason to stay here matching the {budget_tier} tier.",
                            "mapsLink": "https://www.google.com/maps/search/?api=1&query=Hotel+Name+City"
                        }}
                    ]
                }}
            ],
            "accessibilityWarnings": [
                "Key alert 1",
                "Key alert 2"
            ]
        }}
        
        IMPORTANT: Your response must be only valid JSON. Do not include markdown code block syntax (like ```json). Just the raw JSON content itself. Do not include any trailing commas.
        """

        print(f"[INFO] Invoking Gemini API for trip to {primary_dest}...")
        api_key = os.environ.get("GEMINI_API_KEY")
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        client = genai.Client(api_key=api_key)
        
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        )
        
        raw_text = response.text.strip()
        
        # Save raw output for debugging
        with open("last_gemini_response.txt", "w", encoding="utf-8") as dbg_f:
            dbg_f.write(raw_text)
            
        # Clean markdown wrappers if any exist
        cleaned_text = raw_text
        if cleaned_text.startswith("```"):
            cleaned_text = re.sub(r"^```(?:json)?\n", "", cleaned_text)
            cleaned_text = re.sub(r"\n```$", "", cleaned_text)
            cleaned_text = cleaned_text.strip()
        
        # Try to find a JSON block if there's any surrounding text
        if not (cleaned_text.startswith("{") and cleaned_text.endswith("}")):
            match = re.search(r"(\{.*\})", cleaned_text, re.DOTALL)
            if match:
                cleaned_text = match.group(1)

        try:
            return json.loads(cleaned_text)
        except Exception as json_err:
            print(f"[ERROR] JSON Parsing failed: {json_err}")
            # Try a secondary attempt: replace trailing commas before closing braces/brackets
            try:
                # Basic cleanup of trailing commas
                fixed_text = re.sub(r",\s*([\]}])", r"\1", cleaned_text)
                return json.loads(fixed_text)
            except Exception:
                # If all fails, raise the original json parsing exception
                raise json_err

    def generate_gemini_tips(self, payload):
        city = payload.get("city", "Unknown")
        prompt = f"""
        Provide a concise travel lingo and cultural etiquette tips guide for the city: '{city}'.
        
        Instructions:
        1. Find exactly 3 highly useful local lingo/phrases (with their English translations/pronunciations).
        2. Find exactly 3 practical cultural etiquette Do's and Don'ts tips (Dos: behavior to adopt, Don'ts: behavior to avoid).
        3. Make the tips highly specific and actionable for a tourist in {city}.
        4. Return the response strictly as a JSON object matching this structure:
        {{
            "phrases": [
                {{"local": "Local Phrase", "meaning": "English Meaning / Pronunciation"}}
            ],
            "etiquette": [
                {{"type": "Do", "tip": "Actionable Do behavior details"}},
                {{"type": "Don't", "tip": "Actionable Don't behavior details"}}
            ]
        }}
        
        IMPORTANT: Your response must be only valid JSON. Do not include markdown wraps.
        """
        print(f"[INFO] Fetching travel tips for city: {city}...")
        api_key = os.environ.get("GEMINI_API_KEY")
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\n", "", raw_text)
            raw_text = re.sub(r"\n```$", "", raw_text)
            raw_text = raw_text.strip()
        
        if not (raw_text.startswith("{") and raw_text.endswith("}")):
            match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
            if match:
                raw_text = match.group(1)
        return json.loads(raw_text)

    def generate_gemini_visa(self, payload):
        source = payload.get("source", "Unknown")
        destination = payload.get("destination", "Unknown")
        prompt = f"""
        Provide a concise summary of visa and entry requirements for a citizen of country '{source}' traveling to country '{destination}' as a tourist.
        
        Instructions:
        1. Use Google Search grounding to find the latest visa regulations (e.g. Visa-free entry, Visa on Arrival, eVisa, or paper visa requirements).
        2. Detail passport validity requirements (e.g. 6 months validity needed).
        3. Provide 1-2 primary official government or embassy reference source links where they can apply or verify the regulations.
        4. Return the response strictly as a JSON object matching this structure:
        {{
            "visaRequired": true or false,
            "type": "Visa on Arrival / eVisa / Visa-free limit X days / Paper Visa",
            "summary": "Concise 2-3 sentence overview of the entry rules and eVisa links if applicable.",
            "passportValidity": "Passport must be valid for at least 6 months from date of entry.",
            "sources": [
                {{"name": "Official eVisa Portal / Ministry of Foreign Affairs", "url": "https://..."}}
            ]
        }}
        
        IMPORTANT: Your response must be only valid JSON. Do not include markdown wraps.
        """
        print(f"[INFO] Fetching visa guidelines from {source} to {destination}...")
        api_key = os.environ.get("GEMINI_API_KEY")
        model_name = os.environ.get("GEMINI_MODEL", "gemini-2.5-flash")
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                tools=[types.Tool(google_search=types.GoogleSearch())]
            )
        )
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = re.sub(r"^```(?:json)?\n", "", raw_text)
            raw_text = re.sub(r"\n```$", "", raw_text)
            raw_text = raw_text.strip()
            
        if not (raw_text.startswith("{") and raw_text.endswith("}")):
            match = re.search(r"(\{.*\})", raw_text, re.DOTALL)
            if match:
                raw_text = match.group(1)
        return json.loads(raw_text)

# ----------------------------------------------------------------------
# Server Execution
# ----------------------------------------------------------------------
def run(port=8000):
    server_address = ("", port)
    httpd = HTTPServer(server_address, TravelPlannerHandler)
    print(f"[SUCCESS] WanderWing Gemini Web Server running on http://localhost:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[INFO] Stopping server...")
        httpd.server_close()

if __name__ == "__main__":
    run()

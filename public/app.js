/**
 * WanderWing - Personalized Travel Planner Core Frontend Logic
 * Integrated with 100% Free OpenStreetMap (Nominatim API) for location search
 */

// Upbeat travel-themed messages for the loading screen carousel (15 unique variations)
const loadingMessages = [
  "🎒 Packing the essentials...",
  "🛂 Checking passport expiration...",
  "✈️ Verifying flight status and gate connections...",
  "🌮 Sniffing out the absolute best local street food treasures...",
  "🗺️ Mapping scenic, off-the-beaten-path routes...",
  "📸 Finding the most picturesque sunset lookouts...",
  "☕ Scouring the town for hidden specialty coffee shops...",
  "🛏️ Handpicking charming boutique stays...",
  "🗣️ Translating key phrases into the local slang...",
  "🚂 Double-checking high-speed rail timetables...",
  "🎵 Curating the ultimate road trip music playlist...",
  "🧘 Ensuring a perfect balance of adventure and relaxation...",
  "👟 Polishing walking shoes for maximum comfort...",
  "🌦️ Querying regional weather patterns for packing tips...",
  "✨ Sprinkling a dash of local magic onto your itinerary..."
];

// API base URL for Cloudflare Worker backend (empty for relative calls on same origin)
const API_BASE = '';

// Global caches for background pre-fetching
let cachedTips = {};
let cachedVisa = null;

document.addEventListener('DOMContentLoaded', () => {
  initDarkMode();
  initDateValidations();
  initTravelerLimits();
  initDynamicDestinations(); // Enable dynamic row adding
  initFormSubmission();
  initOSMAutocomplete();      // Bind OpenStreetMap autocomplete dropdowns to initial inputs
  initModalHandlers();        // Initialize concierge overlay escape flows
});


/**
 * Premium Dark Mode state persistence manager
 */
function initDarkMode() {
  const darkBtn = document.getElementById('dark-mode-btn');
  if (!darkBtn) return;
  
  // Initialize dark mode from localStorage or system theme settings
  const isDark = localStorage.getItem('darkMode') === 'true' || 
                 (!localStorage.getItem('darkMode') && window.matchMedia('(prefers-color-scheme: dark)').matches);
  
  if (isDark) {
    document.body.classList.add('dark-mode');
    darkBtn.querySelector('.toggle-icon').textContent = '☀️';
  } else {
    document.body.classList.remove('dark-mode');
    darkBtn.querySelector('.toggle-icon').textContent = '🌙';
  }
  
  darkBtn.addEventListener('click', () => {
    const isNowDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', isNowDark);
    darkBtn.querySelector('.toggle-icon').textContent = isNowDark ? '☀️' : '🌙';
  });
}

/**
 * Initializes escape, close button, and outside backdrop click triggers for all modals
 */
function initModalHandlers() {
  const tipsModal = document.getElementById('tips-modal');
  const visaModal = document.getElementById('visa-modal');

  if (tipsModal) {
    const tipsClose = document.getElementById('tips-modal-close');
    if (tipsClose) {
      tipsClose.addEventListener('click', () => closeModal('tips-modal'));
    }
    tipsModal.addEventListener('click', (e) => {
      if (e.target === tipsModal) closeModal('tips-modal');
    });
  }

  if (visaModal) {
    const visaClose = document.getElementById('visa-modal-close');
    if (visaClose) {
      visaClose.addEventListener('click', () => closeModal('visa-modal'));
    }
    visaModal.addEventListener('click', (e) => {
      if (e.target === visaModal) closeModal('visa-modal');
    });
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal('tips-modal');
      closeModal('visa-modal');
    }
  });
}

/**
 * Generic Modal Activation Manager
 */
function openModal(modalId, renderFn) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  if (renderFn) renderFn();
  modal.style.display = 'flex';
  setTimeout(() => {
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
  }, 10);
}

/**
 * Generic Modal Dismissal Manager
 */
function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;
  modal.classList.remove('active');
  modal.setAttribute('aria-hidden', 'true');
  setTimeout(() => {
    modal.style.display = 'none';
  }, 300);
}

/**
 * Initiates parallel background fetching loops for local tips and visa guidelines
 */
function preFetchTipsAndVisa(data) {
  const primaryCity = data.primaryDestination.split(',')[0].trim();
  const getCountry = (fullString) => {
    if (!fullString) return 'USA';
    const parts = fullString.split(',');
    return parts[parts.length - 1].trim();
  };
  const sourceCountry = getCountry(data.startingPoint);
  const destCountry = getCountry(data.primaryDestination);

  // Tips background pre-fetch
  fetch(`${API_BASE}/api/fetch-tips`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: primaryCity })
  })
  .then(res => res.json())
  .then(tips => {
    cachedTips[primaryCity] = tips;
    const tipsBtn = document.getElementById('btn-show-tips');
    if (tipsBtn) {
      tipsBtn.disabled = false;
      tipsBtn.innerHTML = `<span>✨</span> Tips & Lingo for ${primaryCity}`;
    }
  })
  .catch(err => {
    console.warn("Failed to fetch tips:", err);
    const tipsBtn = document.getElementById('btn-show-tips');
    if (tipsBtn) {
      tipsBtn.innerHTML = `<span>✨</span> Tips Unavailable`;
    }
  });

  // Visa background pre-fetch
  fetch(`${API_BASE}/api/fetch-visa`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: sourceCountry, destination: destCountry })
  })
  .then(res => res.json())
  .then(visa => {
    cachedVisa = visa;
    const visaBtn = document.getElementById('btn-show-visa');
    if (visaBtn) {
      visaBtn.disabled = false;
      visaBtn.innerHTML = `<span>🛂</span> Visa Guidelines`;
    }
  })
  .catch(err => {
    console.warn("Failed to fetch visa:", err);
    const visaBtn = document.getElementById('btn-show-visa');
    if (visaBtn) {
      visaBtn.innerHTML = `<span>🛂</span> Visa Info Unavailable`;
    }
  });
}

/**
 * Standard selectable, coordinate-based A4 PDF generator stripping out emojis
 */
function exportItineraryPDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const margin = 20;
  const pageHeight = 297;
  const pageWidth = 210;
  const maxContentHeight = pageHeight - margin - 15; // Room for footer
  let y = margin;

  function stripEmojis(text) {
    if (!text) return '';
    return text.replace(/[\u2700-\u27BF]|[\uE000-\uF8FF]|\uD83C[\uDC00-\uDFFF]|\uD83D[\uDC00-\uDFFF]|[\u2011-\u26FF]|\uD83E[\uDD00-\uDFFF]/g, '');
  }

  function cleanMarkdown(text) {
    if (!text) return '';
    return stripEmojis(text).replace(/\*\*/g, '').replace(/\*/g, '');
  }

  function checkNewPage(neededHeight) {
    if (y + neededHeight > maxContentHeight) {
      doc.addPage();
      y = margin;
      drawHeaderFooter();
    }
  }

  const isSingleLocation = !data.additionalDestinations || data.additionalDestinations.length === 0;

  function drawHeaderFooter() {
    const currentFont = doc.getFont();
    const currentSize = doc.getFontSize();
    
    // Header
    doc.setFont('Helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("WanderWing Personal Travel Itinerary", margin, 12);
    doc.line(margin, 14, pageWidth - margin, 14);
    
    // Footer
    doc.text("Generated by WanderWing Travel Planner", margin, pageHeight - 10);
    doc.text(`Page ${doc.internal.getNumberOfPages()}`, pageWidth - margin - 10, pageHeight - 10);
    
    doc.setFont(currentFont.fontName, currentFont.fontStyle);
    doc.setFontSize(currentSize);
  }

  function printText(text, options = {}) {
    const style = options.style || 'normal';
    const size = options.size || 10;
    const color = options.color || [60, 60, 60];
    const lineSpacing = options.lineSpacing || 5;
    
    doc.setFont('Helvetica', style);
    doc.setFontSize(size);
    doc.setTextColor(color[0], color[1], color[2]);
    
    const cleanStr = cleanMarkdown(text);
    const lines = doc.splitTextToSize(cleanStr, pageWidth - (margin * 2));
    
    lines.forEach(line => {
      checkNewPage(lineSpacing);
      doc.text(line, margin, y);
      y += lineSpacing;
    });
  }

  // Draw initial header on page 1
  drawHeaderFooter();
  y = 22; // Offset from header line

  // 1. Title
  printText(data.tripTitle, { style: 'bold', size: 18, color: [61, 64, 91], lineSpacing: 8 });
  y += 2;

  // 2. Metadata details
  printText(`Starting Point: ${data.startingPoint}`, { style: 'normal', size: 10, color: [100, 100, 100], lineSpacing: 5 });
  printText(`Primary Destination: ${data.primaryDestination}`, { style: 'normal', size: 10, color: [100, 100, 100], lineSpacing: 5 });
  if (data.additionalDestinations && data.additionalDestinations.length > 0) {
    printText(`Stops: ${data.additionalDestinations.join(', ')}`, { style: 'normal', size: 10, color: [100, 100, 100], lineSpacing: 5 });
  }
  printText(`Dates: ${data.startDate} to ${data.endDate}`, { style: 'normal', size: 10, color: [100, 100, 100], lineSpacing: 5 });
  y += 4;

  // Horizontal divider
  checkNewPage(4);
  doc.setDrawColor(220, 220, 220);
  doc.line(margin, y, pageWidth - margin, y);
  y += 8;

  // 3. Summary
  printText("Itinerary Overview", { style: 'bold', size: 12, color: [61, 64, 91], lineSpacing: 6 });
  const summaryText = data.summary.replace(/<[^>]*>/g, '');
  printText(summaryText, { style: 'normal', size: 10, color: [80, 80, 80], lineSpacing: 5 });
  y += 6;

  // 4. Day-by-Day rendering
  data.days.forEach(day => {
    y += 4;
    checkNewPage(15);
    
    // Calculate sequential date
    let dateText = '';
    try {
      const dateObj = new Date(data.startDate + 'T00:00:00');
      dateObj.setDate(dateObj.getDate() + (day.dayNumber - 1));
      dateText = ` (${dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })})`;
    } catch (e) {}

    // Day header
    printText(`Day ${day.dayNumber}${dateText}: ${day.theme}`, { style: 'bold', size: 13, color: [224, 122, 95], lineSpacing: 7 });
    y += 2;

    // Morning Activity
    printText("Morning Activity:", { style: 'bold', size: 10, color: [61, 64, 91], lineSpacing: 5 });
    printText(`${day.activities.morning.title} - ${day.activities.morning.description}`, { style: 'normal', size: 10, color: [80, 80, 80], lineSpacing: 5 });
    if (day.activities.morning.accessibilityNote) {
      printText(`Accessibility Note: ${day.activities.morning.accessibilityNote}`, { style: 'italic', size: 9, color: [224, 122, 95], lineSpacing: 4 });
    }
    y += 2;

    // Afternoon Activity
    printText("Afternoon Activity:", { style: 'bold', size: 10, color: [61, 64, 91], lineSpacing: 5 });
    printText(`${day.activities.afternoon.title} - ${day.activities.afternoon.description}`, { style: 'normal', size: 10, color: [80, 80, 80], lineSpacing: 5 });
    if (day.activities.afternoon.accessibilityNote) {
      printText(`Accessibility Note: ${day.activities.afternoon.accessibilityNote}`, { style: 'italic', size: 9, color: [224, 122, 95], lineSpacing: 4 });
    }
    y += 2;

    // Evening Activity
    printText("Evening Activity:", { style: 'bold', size: 10, color: [61, 64, 91], lineSpacing: 5 });
    printText(`${day.activities.evening.title} - ${day.activities.evening.description}`, { style: 'normal', size: 10, color: [80, 80, 80], lineSpacing: 5 });
    if (day.activities.evening.accessibilityNote) {
      printText(`Accessibility Note: ${day.activities.evening.accessibilityNote}`, { style: 'italic', size: 9, color: [224, 122, 95], lineSpacing: 4 });
    }
    y += 2;

    // 💎 Hidden Gem
    if (day.hiddenGem) {
      printText("Insider Secret / Hidden Gem:", { style: 'bold', size: 10, color: [129, 178, 154], lineSpacing: 5 });
      printText(day.hiddenGem, { style: 'normal', size: 9.5, color: [80, 80, 80], lineSpacing: 4.5 });
      y += 2;
    }

    // Hotel options (Only if NOT single location)
    if (!isSingleLocation && day.hotelOptions && day.hotelOptions.length > 0) {
      printText("Recommended Hotel Stays:", { style: 'bold', size: 10, color: [61, 64, 91], lineSpacing: 5 });
      day.hotelOptions.forEach(hotel => {
        printText(`- ${hotel.name}: ${hotel.whyChoose}`, { style: 'normal', size: 9.5, color: [80, 80, 80], lineSpacing: 4.5 });
      });
      y += 2;
    }
  });

  // Grouped Stays for Single Location Trips
  if (isSingleLocation) {
    const uniqueHotels = [];
    const seenNames = new Set();
    data.days.forEach(day => {
      if (day.hotelOptions) {
        day.hotelOptions.forEach(h => {
          if (!seenNames.has(h.name)) {
            seenNames.add(h.name);
            uniqueHotels.push(h);
          }
        });
      }
    });

    if (uniqueHotels.length > 0) {
      y += 4;
      checkNewPage(15);
      printText("Recommended Accommodations for Your Stay:", { style: 'bold', size: 12, color: [61, 64, 91], lineSpacing: 6 });
      uniqueHotels.forEach(hotel => {
        printText(`- ${hotel.name}: ${hotel.whyChoose}`, { style: 'normal', size: 9.5, color: [80, 80, 80], lineSpacing: 4.5 });
      });
      y += 2;
    }
  }

  // 5. Advisories
  if (data.accessibilityWarnings && data.accessibilityWarnings.length > 0) {
    y += 6;
    checkNewPage(15);
    printText("Important Accessibility Warnings & Advisories", { style: 'bold', size: 12, color: [224, 122, 95], lineSpacing: 6 });
    data.accessibilityWarnings.forEach(warning => {
      printText(`* ${warning}`, { style: 'normal', size: 9.5, color: [60, 60, 60], lineSpacing: 5 });
    });
  }

  const filename = `${data.tripTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_itinerary.pdf`;
  doc.save(filename);
}

/**
 * OpenStreetMap Nominatim Autocomplete Engine
 */
function initOSMAutocomplete() {
  const sourceInput = document.getElementById('source-input');
  const destinationInput = document.getElementById('destination-input');
  
  if (sourceInput) bindOSMAutocomplete(sourceInput);
  if (destinationInput) bindOSMAutocomplete(destinationInput);
}

/**
 * Binds Nominatim search + custom dropdown behaviors to a text input field
 */
function bindOSMAutocomplete(inputElement) {
  let debounceTimeout = null;
  let dropdown = null;

  // Keyup listener with debouncing (300ms delay) to avoid spamming the public OSM server
  inputElement.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    
    clearTimeout(debounceTimeout);
    removeDropdown();

    if (query.length < 3) return; // Only search for queries with 3+ characters

    debounceTimeout = setTimeout(() => {
      fetchOSMSuggestions(query, (suggestions) => {
        if (suggestions && suggestions.length > 0) {
          renderDropdown(suggestions);
        }
      });
    }, 300);
  });

  // Closes dropdown when clicking anywhere outside of the input field
  document.addEventListener('click', (e) => {
    if (dropdown && !inputElement.contains(e.target) && !dropdown.contains(e.target)) {
      removeDropdown();
    }
  });

  // Closes dropdown when pressing Escape
  inputElement.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      removeDropdown();
    }
  });

  /**
   * Fetches suggestion results from OpenStreetMap Nominatim API
   */
  async function fetchOSMSuggestions(query, callback) {
    try {
      // Limit to 5 results, search specifically for cities/settlements using Nominatim query params
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
      
      const response = await fetch(url, {
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'WanderWingTravelPlanner/1.0' // OpenStreetMap Nominatim Usage Policy recommends identifying user agent
        }
      });

      if (!response.ok) throw new Error("OSM search request failed");

      const data = await response.json();
      
      // Clean and format suggestions into simple city/country strings
      const suggestions = data.map(item => {
        const address = item.address;
        const city = address.city || address.town || address.village || address.municipality || address.county || item.name;
        const country = address.country || '';
        const displayName = country ? `${city}, ${country}` : city;
        return {
          label: displayName,
          raw: item.display_name
        };
      });

      // Filter out duplicate suggestion labels
      const uniqueSuggestions = suggestions.filter((v, i, a) => a.findIndex(t => t.label === v.label) === i);

      callback(uniqueSuggestions);
    } catch (err) {
      console.warn("OpenStreetMap suggestions fetch error:", err);
      callback([]);
    }
  }

  /**
   * Renders a custom styled dropdown menu directly under the input wrapper
   */
  function renderDropdown(suggestions) {
    removeDropdown();

    const parentWrapper = inputElement.closest('.input-wrapper');
    if (!parentWrapper) return;

    dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    
    suggestions.forEach(item => {
      const option = document.createElement('div');
      option.className = 'autocomplete-item';
      option.textContent = item.label;
      
      option.addEventListener('click', () => {
        inputElement.value = item.label;
        removeDropdown();
        
        // Trigger synthetic input/change events in case any validation needs it
        inputElement.dispatchEvent(new Event('change'));
      });

      dropdown.appendChild(option);
    });

    parentWrapper.appendChild(dropdown);
  }

  function removeDropdown() {
    if (dropdown) {
      dropdown.remove();
      dropdown = null;
    }
  }
}

/**
 * Requirement 1 & 2: Dynamic Destinations Management
 * Appends new destination inputs and automatically binds them to OpenStreetMap autocomplete.
 */
function initDynamicDestinations() {
  const addDestinationBtn = document.getElementById('add-destination-btn');
  const destinationGroup = document.querySelector('.destination-group');
  
  if (!addDestinationBtn || !destinationGroup) return;
  
  let destinationIndex = 1;

  addDestinationBtn.addEventListener('click', () => {
    destinationIndex++;
    
    // Create container wrapper for the new destination input row
    const newRow = document.createElement('div');
    newRow.className = 'input-wrapper dynamic-destination-row';
    newRow.style.marginTop = '12px';
    newRow.style.display = 'flex';
    newRow.style.gap = '12px';
    newRow.style.width = '100%';
    newRow.id = `destination-row-${destinationIndex}`;

    // Create the text input element
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'form-input dynamic-destination-input';
    input.name = `destination_${destinationIndex}`;
    input.placeholder = 'e.g. Kyoto, Japan';
    input.required = true;
    input.style.paddingLeft = '44px'; // Maintain styling alignment

    // Icon for the new input
    const icon = document.createElement('span');
    icon.className = 'input-icon';
    icon.textContent = '🌴';

    // Create the Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-add-destination';
    removeBtn.style.borderColor = '#E07A5F';
    removeBtn.style.color = '#E07A5F';
    removeBtn.style.backgroundColor = '#FDF1ED';
    removeBtn.style.borderStyle = 'solid';
    removeBtn.innerHTML = '<span>×</span> Remove';
    removeBtn.ariaLabel = 'Remove destination';
    
    removeBtn.addEventListener('click', () => {
      newRow.remove();
    });

    // Assemble and append the row below the current destination fields
    newRow.appendChild(icon);
    newRow.appendChild(input);
    newRow.appendChild(removeBtn);
    
    // Insert the new row directly after the initial destination group parent container
    destinationGroup.parentNode.appendChild(newRow);

    // Bind OpenStreetMap autocomplete dynamically to the new dynamic input field
    bindOSMAutocomplete(input);
  });
}

/**
 * Requirement 3: Date Validations
 * Enforces start date <= end date constraints with graceful, accessible error display.
 */
function initDateValidations() {
  const startDateInput = document.getElementById('start-date');
  const endDateInput = document.getElementById('end-date');
  
  if (!startDateInput || !endDateInput) return;

  // Create clean error container lazily near the end date field
  const errorContainer = document.createElement('span');
  errorContainer.className = 'date-error-msg';
  errorContainer.style.color = 'var(--primary)';
  errorContainer.style.fontSize = '0.8rem';
  errorContainer.style.fontWeight = '600';
  errorContainer.style.marginTop = '4px';
  errorContainer.style.display = 'none';
  endDateInput.parentNode.appendChild(errorContainer);

  const showError = (message) => {
    errorContainer.textContent = message;
    errorContainer.style.display = 'block';
    endDateInput.style.borderColor = 'var(--primary)';
  };

  const clearError = () => {
    errorContainer.style.display = 'none';
    endDateInput.style.borderColor = '';
  };

  // Restrict End Date min attribute based on Start Date selection
  startDateInput.addEventListener('change', (e) => {
    const selectedStartDate = e.target.value;
    endDateInput.min = selectedStartDate;

    // Validate current end date if it was already selected
    if (endDateInput.value && endDateInput.value < selectedStartDate) {
      endDateInput.value = '';
      showError('⚠️ End date cleared: must be on or after the start date.');
    } else {
      clearError();
    }
  });

  // Handle manual input modification or entry
  endDateInput.addEventListener('change', () => {
    if (startDateInput.value && endDateInput.value < startDateInput.value) {
      endDateInput.value = '';
      showError('⚠️ End date must be on or after the start date.');
    } else {
      clearError();
    }
  });
}

/**
 * Requirement 4: Traveler Limits Enforcements
 * Prevents traveler counts from falling below 0.
 */
function initTravelerLimits() {
  const travelerInputs = [
    document.getElementById('travelers-adults'),
    document.getElementById('travelers-children'),
    document.getElementById('travelers-seniors')
  ];

  travelerInputs.forEach(input => {
    if (!input) return;

    // Direct input change listener
    input.addEventListener('change', (e) => {
      const minVal = parseInt(e.target.min) || 0;
      if (parseInt(e.target.value) < minVal) {
        e.target.value = minVal;
      }
    });

    // Handle keypress events to prevent negative symbol input manually
    input.addEventListener('keypress', (e) => {
      if (e.key === '-' || e.key === 'e') {
        e.preventDefault();
      }
    });
  });

  // Bind custom increment/decrement button clicks
  const decrements = document.querySelectorAll('.btn-counter-decrement');
  const increments = document.querySelectorAll('.btn-counter-increment');

  decrements.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const minVal = parseInt(input.min) || 0;
        const currentVal = parseInt(input.value) || 0;
        if (currentVal > minVal) {
          input.value = currentVal - 1;
          input.dispatchEvent(new Event('change'));
        }
      }
    });
  });

  increments.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input) {
        const maxVal = parseInt(input.max) || 99;
        const currentVal = parseInt(input.value) || 0;
        if (currentVal < maxVal) {
          input.value = currentVal + 1;
          input.dispatchEvent(new Event('change'));
        }
      }
    });
  });
}

/**
 * Requirement 5: Form Submission, State Management & Carousel Loop
 * Intercepts form submissions, bundles the structured JSON payload, and manages the loading experience.
 */
function initFormSubmission() {
  const form = document.querySelector('.form-grid');
  const overlay = document.getElementById('loading-overlay');
  const messageElement = document.getElementById('loading-message');
  
  if (!form || !overlay || !messageElement) return;
  
  let carouselIntervalId = null;
  let progressIntervalId = null;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    // 1. Gather all form field values into a structured JSON payload
    const payload = gatherFormPayload();
    console.log("✈️ WanderWing Form Submission Payload Compiled:", payload);
    
    // 2. Trigger loading screen experience
    activateLoadingScreen(overlay, messageElement);
    
    // 3. Make fetch call to backend API (falls back elegantly to premium mock generator for immediate offline testing)
    fetchItineraryFromAPI(payload)
      .then(itineraryData => {
        // Hide loading screen and display final result timeline beautifully
        deactivateLoadingScreen(overlay);
        renderItinerary(itineraryData);
      })
      .catch(err => {
        console.error("Fetch API error, running local fallback dynamic renderer:", err);
        deactivateLoadingScreen(overlay);
        const fallbackData = generateMockItinerary(payload);
        renderItinerary(fallbackData);
      });
  });

  /**
   * Helper: Traverses DOM and packages input parameters into structured JSON
   */
  function gatherFormPayload() {
    const sourceVal = document.getElementById('source-input').value;
    const destVal = document.getElementById('destination-input').value;
    
    // Capture dynamic destinations
    const dynamicDestinations = [];
    const dynamicInputs = document.querySelectorAll('.dynamic-destination-input');
    dynamicInputs.forEach(input => {
      if (input.value.trim() !== '') {
        dynamicDestinations.push(input.value.trim());
      }
    });

    // Collect dates
    const startDate = document.getElementById('start-date').value;
    const endDate = document.getElementById('end-date').value;

    // Collect travelers
    const adults = parseInt(document.getElementById('travelers-adults').value) || 0;
    const children = parseInt(document.getElementById('travelers-children').value) || 0;
    const seniors = parseInt(document.getElementById('travelers-seniors').value) || 0;

    // Collect radio selections
    const tripType = document.querySelector('input[name="trip_type"]:checked')?.value || '';
    const budgetTier = document.querySelector('input[name="budget_tier"]:checked')?.value || '';

    return {
      route: {
        startingPoint: sourceVal,
        primaryDestination: destVal,
        additionalDestinations: dynamicDestinations
      },
      dates: {
        startDate: startDate,
        endDate: endDate
      },
      travelers: {
        adults: adults,
        children: children,
        seniorCitizens: seniors,
        totalCount: adults + children + seniors
      },
      vibes: {
        tripType: tripType,
        budgetTier: budgetTier
      }
    };
  }

  /**
   * Helper: Activates the full-screen loading backdrop and cycles messages
   */
  function activateLoadingScreen(overlay, messageElement) {
    overlay.classList.add('active');
    overlay.setAttribute('aria-hidden', 'false');
    
    const progressBar = document.getElementById('loading-progress');
    if (progressBar) progressBar.style.width = '0%';
    
    let progress = 0;
    if (progressIntervalId) clearInterval(progressIntervalId);
    
    progressIntervalId = setInterval(() => {
      if (progress < 98) {
        const remaining = 98 - progress;
        // Asymptotically approach 98% (increment between 3% and 8% of remaining distance)
        const increment = remaining * (Math.random() * 0.05 + 0.03);
        progress += increment;
        
        // Ensure a tiny, steady minimum visual increment so the user knows it's alive
        if (increment < 0.15) {
          progress += 0.15;
        }
        
        if (progress > 98) progress = 98;
        if (progressBar) progressBar.style.width = `${progress}%`;
      }
    }, 450);

    let messageIndex = 0;
    messageElement.textContent = loadingMessages[messageIndex];

    // Carousel loops every 2.5 seconds with a smooth fade
    carouselIntervalId = setInterval(() => {
      // Fade out
      messageElement.classList.add('fade-out');
      
      setTimeout(() => {
        // Switch text & fade back in
        messageIndex = (messageIndex + 1) % loadingMessages.length;
        messageElement.textContent = loadingMessages[messageIndex];
        messageElement.classList.remove('fade-out');
      }, 250); // Matches CSS transition duration
      
    }, 2500);
  }

  /**
   * Helper: Closes loading overlay and clears active intervals
   */
  function deactivateLoadingScreen(overlay) {
    const progressBar = document.getElementById('loading-progress');
    if (progressBar) progressBar.style.width = '100%';
    
    if (progressIntervalId) {
      clearInterval(progressIntervalId);
      progressIntervalId = null;
    }
    
    setTimeout(() => {
      overlay.classList.remove('active');
      overlay.setAttribute('aria-hidden', 'true');
      if (progressBar) progressBar.style.width = '0%';
    }, 500); // Give user a moment to feel the 100% completion success
    
    if (carouselIntervalId) {
      clearInterval(carouselIntervalId);
      carouselIntervalId = null;
    }
  }

  /**
   * API CALL IMPLEMENTATION
   * Sends the structured form JSON payload to the backend route
   */
  async function fetchItineraryFromAPI(payload) {
    // Replace with your actual backend endpoint (e.g. '/api/generate-itinerary' or serverless function)
    const response = await fetch(`${API_BASE}/api/suggest-plan`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Server returned error status ${response.status}`);
    }

    return await response.json();
  }

  /**
   * Helper: Parses basic markdown bold (**text**) and italics (*text*) into HTML
   */
  function parseMarkdown(text) {
    if (!text) return '';
    return text
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>');
  }

  /**
   * Helper: Asynchronously queries Wikipedia's PageImages API for dynamic,
   * high-quality Public Domain & Creative Commons landmarks images.
   */
  /**
   * Helper: Asynchronously queries Wikipedia's PageImages API for dynamic,
   * high-quality landmarks images, displaying them only if they are available.
   */
  async function fetchWikipediaImage(keyword, imgElementId, slideElementId, carouselElementId) {
    try {
      // 1. Try querying Wikipedia for the specific landmark
      let imageUrl = await queryWikipediaPageImage(keyword);
      
      // 2. If it fails, try a parsed shorter version (first 2 words)
      if (!imageUrl && keyword.includes(' ')) {
        const parts = keyword.split(' ');
        imageUrl = await queryWikipediaPageImage(parts.slice(0, 2).join(' '));
      }
      
      const imgEl = document.getElementById(imgElementId);
      const slideEl = document.getElementById(slideElementId);
      
      if (imageUrl && imgEl && slideEl) {
        imgEl.src = imageUrl;
        slideEl.style.display = 'block'; // Make the slide visible!
      } else {
        // Image not available, completely remove the slide from DOM
        if (slideEl) {
          slideEl.remove();
        }
        checkAndHideEmptyCarousel(carouselElementId);
      }
    } catch (err) {
      console.warn(`Wikipedia image not available for keyword "${keyword}":`, err);
      const slideEl = document.getElementById(slideElementId);
      if (slideEl) {
        slideEl.remove();
      }
      checkAndHideEmptyCarousel(carouselElementId);
    }
  }

  async function queryWikipediaPageImage(title) {
    const url = `https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&piprop=original&titles=${encodeURIComponent(title)}&origin=*`;
    const response = await fetch(url);
    if (!response.ok) return null;
    const data = await response.json();
    
    const pages = data?.query?.pages;
    if (pages) {
      for (const key in pages) {
        const page = pages[key];
        if (page?.original?.source) {
          return page.original.source; // Wikimedia original source url
        }
      }
    }
    return null;
  }

  function checkAndHideEmptyCarousel(carouselId) {
    const carouselEl = document.getElementById(carouselId);
    if (carouselEl) {
      const slides = carouselEl.querySelectorAll('.carousel-slide');
      if (slides.length === 0) {
        carouselEl.style.display = 'none'; // Hide the whole carousel container
      }
    }
  }

  /**
   * RENDER TIMELINE COMPONENT
   * Builds and inserts the final visual day-by-day timeline into the DOM.
   */
  function renderItinerary(data) {
    const resultContainer = document.getElementById('itinerary-result');
    const formCard = document.getElementById('planner-form-card');
    
    if (!resultContainer || !formCard) return;

    // Reset caches on each new itinerary render
    cachedTips = {};
    cachedVisa = null;

    let daysHtml = '';
    const startStr = data.startDate || "2026-06-01";
    
    // Intelligently calculate if the trip is at a single location
    const isSingleLocation = !data.additionalDestinations || data.additionalDestinations.length === 0;
    const primaryCity = data.primaryDestination.split(',')[0].trim();

    /**
     * Helper to validate Google Maps links and prevent localhost/127.0.0.1 URLs.
     */
    function getValidMapsLink(mapsLink, queryName) {
      if (mapsLink && typeof mapsLink === 'string' && mapsLink.trim() !== '' && mapsLink !== 'undefined') {
        const trimmed = mapsLink.trim();
        // Check if the link contains localhost or 127.0.0.1, or doesn't start with http
        if (!trimmed.includes('localhost') && !trimmed.includes('127.0.0.1') && (trimmed.startsWith('http://') || trimmed.startsWith('https://'))) {
          return trimmed;
        }
      }
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(queryName)}`;
    }

    data.days.forEach(day => {
      // Calculate sequential dates for timeline headings
      let dateText = '';
      try {
        const dateObj = new Date(startStr + 'T00:00:00');
        dateObj.setDate(dateObj.getDate() + (day.dayNumber - 1));
        dateText = dateObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
      } catch (e) {
        console.error("Error parsing sequential date:", e);
      }
      const dateDisplay = dateText ? ` — ${dateText}` : '';

      // Build daily hotel suggestions (ONLY if it is a multi-stop trip)
      let hotelsHtml = '';
      if (!isSingleLocation && day.hotelOptions && day.hotelOptions.length > 0) {
        hotelsHtml = `
          <div class="day-hotels">
            <h4 class="hotels-title">🏨 Recommended Stays for Tonight</h4>
            <div class="hotels-grid">
              ${day.hotelOptions.map(hotel => {
                const mapsUrl = getValidMapsLink(hotel.mapsLink, hotel.name + ' ' + primaryCity);
                return `
                <div class="hotel-card">
                  <div class="hotel-card-body">
                    <span class="hotel-bed">🛏️</span>
                    <div class="hotel-info">
                      <h5 class="hotel-name">${parseMarkdown(hotel.name)}</h5>
                      <p class="hotel-desc">${parseMarkdown(hotel.whyChoose)}</p>
                    </div>
                  </div>
                  <footer class="hotel-footer">
                    <a href="${mapsUrl}" target="_blank" class="btn-maps" rel="noopener">
                      <span>📍</span> View on Google Maps
                    </a>
                  </footer>
                </div>
              `}).join('')}
            </div>
          </div>
        `;
      }

      daysHtml += `
        <div class="timeline-day">
          <div class="day-title-container">
            <div class="day-badge">${day.dayNumber}</div>
            <div class="day-title-text">
              <h3>Day ${day.dayNumber}${dateDisplay}: ${parseMarkdown(day.theme)}</h3>
              <p>Planned Activities</p>
            </div>
          </div>
          
          <div class="day-slots-container">
            <div class="day-slots">
              <!-- Morning Slot -->
              <div class="slot-card">
                <div class="slot-header">
                  <span class="slot-label morning">🌅 Morning</span>
                </div>
                <h4 class="slot-time-title">${parseMarkdown(day.activities.morning.title)}</h4>
                <p class="slot-description">${parseMarkdown(day.activities.morning.description)}</p>
                ${day.activities.morning.accessibilityNote ? `
                  <div class="slot-accessibility-alert">
                    <span>⚠️</span> ${parseMarkdown(day.activities.morning.accessibilityNote)}
                  </div>
                ` : ''}
              </div>

              <!-- Afternoon Slot -->
              <div class="slot-card">
                <div class="slot-header">
                  <span class="slot-label afternoon">☀️ Afternoon</span>
                </div>
                <h4 class="slot-time-title">${parseMarkdown(day.activities.afternoon.title)}</h4>
                <p class="slot-description">${parseMarkdown(day.activities.afternoon.description)}</p>
                ${day.activities.afternoon.accessibilityNote ? `
                  <div class="slot-accessibility-alert">
                    <span>⚠️</span> ${parseMarkdown(day.activities.afternoon.accessibilityNote)}
                  </div>
                ` : ''}
              </div>

              <!-- Evening Slot -->
              <div class="slot-card">
                <div class="slot-header">
                  <span class="slot-label evening">🌙 Evening</span>
                </div>
                <h4 class="slot-time-title">${parseMarkdown(day.activities.evening.title)}</h4>
                <p class="slot-description">${parseMarkdown(day.activities.evening.description)}</p>
                ${day.activities.evening.accessibilityNote ? `
                  <div class="slot-accessibility-alert">
                    <span>⚠️</span> ${parseMarkdown(day.activities.evening.accessibilityNote)}
                  </div>
                ` : ''}
              </div>
            </div>

            <!-- 💎 Premium Hidden Gem Section -->
            ${day.hiddenGem ? `
              <div class="day-hidden-gem">
                <div class="hidden-gem-title">💎 Insider Secret & Interesting Facts</div>
                <div class="hidden-gem-text">${parseMarkdown(day.hiddenGem)}</div>
              </div>
            ` : ''}

            <!-- Hotel Suggestions Section (Multi-stops only) -->
            ${hotelsHtml}
          </div>
        </div>
      `;
    });

    // Grouped Stays Section (Only if single location trip)
    let singleLocationHotelsHtml = '';
    if (isSingleLocation) {
      const uniqueHotels = [];
      const seenNames = new Set();
      data.days.forEach(day => {
        if (day.hotelOptions) {
          day.hotelOptions.forEach(h => {
            if (!seenNames.has(h.name)) {
              seenNames.add(h.name);
              uniqueHotels.push(h);
            }
          });
        }
      });

      if (uniqueHotels.length > 0) {
        singleLocationHotelsHtml = `
          <div class="itinerary-advisories" style="margin-top: 32px; background-color: var(--card-bg); border: 1px solid var(--border-color);">
            <div class="advisories-title" style="color: var(--secondary); font-family: var(--font-display); display: flex; align-items: center; gap: 8px;">
              <span>🏨</span> Recommended Accommodations for Your Stay in ${primaryCity}
            </div>
            <div class="hotels-grid" style="margin-top: 16px;">
              ${uniqueHotels.map(hotel => {
                const mapsUrl = getValidMapsLink(hotel.mapsLink, hotel.name + ' ' + primaryCity);
                return `
                <div class="hotel-card">
                  <div class="hotel-card-body">
                    <span class="hotel-bed">🛏️</span>
                    <div class="hotel-info">
                      <h5 class="hotel-name">${parseMarkdown(hotel.name)}</h5>
                      <p class="hotel-desc">${parseMarkdown(hotel.whyChoose)}</p>
                    </div>
                  </div>
                  <footer class="hotel-footer">
                    <a href="${mapsUrl}" target="_blank" class="btn-maps" rel="noopener">
                      <span>📍</span> View on Google Maps
                    </a>
                  </footer>
                </div>
              `}).join('')}
            </div>
          </div>
        `;
      }
    }

    let warningsHtml = '';
    if (data.accessibilityWarnings && data.accessibilityWarnings.length > 0) {
      warningsHtml = `
        <div class="itinerary-advisories">
          <div class="advisories-title">
            <span>⚠️</span> Important Accessibility Warnings & Advisories
          </div>
          <ul class="advisories-list">
            ${data.accessibilityWarnings.map(warning => `<li>${parseMarkdown(warning)}</li>`).join('')}
          </ul>
        </div>
      `;
    }

    resultContainer.innerHTML = `
      <!-- Header Banner -->
      <header class="itinerary-header">
        <h2>${data.tripTitle}</h2>
        <div class="itinerary-meta">
          <div class="meta-tag">📍 Start: ${data.startingPoint}</div>
          <div class="meta-tag">🗺️ Primary: ${data.primaryDestination}</div>
          ${data.additionalDestinations && data.additionalDestinations.length > 0 ? `
            <div class="meta-tag">🌴 Added Stops: ${data.additionalDestinations.join(', ')}</div>
          ` : ''}
          <div class="meta-tag">📅 Dates: ${data.startDate} to ${data.endDate}</div>
        </div>
        
        <!-- Companion Utility Buttons -->
        <div class="itinerary-meta-utilities">
          <button class="btn-utility-modal" id="btn-show-tips" disabled>
            <span>✨</span> Tips & Lingo (Loading...)
          </button>
          <button class="btn-utility-modal" id="btn-show-visa" disabled>
            <span>🛂</span> Visa Guidelines (Loading...)
          </button>
          <button class="btn-pdf-export" id="btn-export-pdf">
            <span>📄</span> Export Searchable PDF
          </button>
        </div>
      </header>

      <!-- Summary Box -->
      <div class="itinerary-summary">
        ${data.summary}
      </div>

      <!-- Timeline Body -->
      <div class="itinerary-timeline">
        ${daysHtml}
      </div>

      <!-- Grouped Accommodation (For single location stays only) -->
      ${singleLocationHotelsHtml}

      <!-- Accessibility Advisories -->
      ${warningsHtml}

      <!-- Action Section -->
      <div class="itinerary-actions">
        <button class="btn-edit-preferences" id="btn-edit-preferences">
          <span>🔄</span> Edit Preferences & Replan
        </button>
      </div>
    `;

    // Hide form and show itinerary result
    formCard.style.display = 'none';
    resultContainer.style.display = 'block';

    // Scroll smoothly to the top of the itinerary results
    window.scrollTo({ top: 0, behavior: 'smooth' });

    // ⚡ Trigger async parallel background pre-fetching loops
    preFetchTipsAndVisa(data);

    // ⚡ Bind Modal utility buttons
    const tipsBtn = document.getElementById('btn-show-tips');
    if (tipsBtn) {
      tipsBtn.addEventListener('click', () => {
        const tipsData = cachedTips[primaryCity];
        if (!tipsData) return;
        
        openModal('tips-modal', () => {
          const modalTitle = document.getElementById('tips-modal-title');
          if (modalTitle) {
            modalTitle.textContent = `✨ Local Lingo & Etiquette for ${primaryCity}`;
          }
          const modalBody = document.getElementById('tips-modal-body');
          if (modalBody) {
            modalBody.innerHTML = `
              <h4 class="modal-subheading">🗣️ Essential Local Phrases</h4>
              <div class="lingo-list">
                ${tipsData.phrases.map(item => `
                  <div class="lingo-item">
                    <div class="lingo-phrase">${item.local}</div>
                    <div class="lingo-meaning">${item.meaning}</div>
                  </div>
                `).join('')}
              </div>

              <h4 class="modal-subheading">🤝 Cultural Etiquette (Dos & Don'ts)</h4>
              <div class="etiquette-list">
                ${tipsData.etiquette.map(item => `
                  <div class="etiquette-item ${item.type.toLowerCase() === 'do' ? 'do' : 'dont'}">
                    <span class="etiquette-badge ${item.type.toLowerCase() === 'do' ? 'do' : 'dont'}">${item.type}</span>
                    <div class="etiquette-text">${item.tip}</div>
                  </div>
                `).join('')}
              </div>
            `;
          }
        });
      });
    }

    const visaBtn = document.getElementById('btn-show-visa');
    if (visaBtn) {
      visaBtn.addEventListener('click', () => {
        if (!cachedVisa) return;
        
        openModal('visa-modal', () => {
          const modalBody = document.getElementById('visa-modal-body');
          if (modalBody) {
            modalBody.innerHTML = `
              <div class="visa-result-box">
                <div class="visa-header-row">
                  <span class="visa-badge ${cachedVisa.visaRequired ? 'required' : 'free'}">
                    ${cachedVisa.visaRequired ? 'Visa Required' : 'Visa Free / Not Required'}
                  </span>
                  <span class="visa-detail-val"><strong>Type:</strong> ${cachedVisa.type}</span>
                </div>
                
                <div class="visa-detail-item">
                  <div class="visa-detail-label">📋 Requirement Overview</div>
                  <div class="visa-detail-val">${cachedVisa.summary}</div>
                </div>

                <div class="visa-detail-item">
                  <div class="visa-detail-label">🛂 Passport Validity</div>
                  <div class="visa-detail-val">${cachedVisa.passportValidity}</div>
                </div>

                ${cachedVisa.sources && cachedVisa.sources.length > 0 ? `
                  <div class="visa-sources-title">🔗 Official Embassy & Application Sources:</div>
                  <div class="visa-links-list">
                    ${cachedVisa.sources.map(src => `
                      <a href="${src.url}" target="_blank" class="visa-link-item" rel="noopener">
                        <span>🌐</span> ${src.name}
                      </a>
                    `).join('')}
                  </div>
                ` : ''}
              </div>
            `;
          }
        });
      });
    }

    // ⚡ Bind PDF print utility
    const pdfBtn = document.getElementById('btn-export-pdf');
    if (pdfBtn) {
      pdfBtn.addEventListener('click', () => {
        exportItineraryPDF(data);
      });
    }

    // Add click listener to Edit button to go back to preferences
    const editBtn = document.getElementById('btn-edit-preferences');
    if (editBtn) {
      editBtn.addEventListener('click', () => {
        resultContainer.style.display = 'none';
        formCard.style.display = 'block';
        window.scrollTo({ top: 0, behavior: 'smooth' });
      });
    }
  }


  /**
   * dynamic mock fallback generator
   * Generates highly tailored mock responses for immediate client-side offline testing!
   */
  function generateMockItinerary(payload) {
    const isBudget = payload.vibes.budgetTier === 'budget_friendly';
    const isPremium = payload.vibes.budgetTier === 'premium';
    const isFriends = payload.vibes.tripType === 'friends';
    const isCouple = payload.vibes.tripType === 'couple';
    const isFamily = payload.vibes.tripType === 'family';
    const hasKids = payload.travelers.children > 0;
    const hasSeniors = payload.travelers.seniorCitizens > 0;

    // Tailor accommodations & style by budget
    const hotelStyle = isPremium ? "ultra-luxury 5-star boutique resort" : isBudget ? "modern, cozy hostel with shared social lounges" : "charming, central 4-star boutique hotel";
    const budgetDescription = isPremium ? "lavish, all-inclusive private transport and VIP queue access" : isBudget ? "budget-optimized public transport passes and free scenic walks" : "balanced standard comfort tickets and walking tours";

    // Tailor day themes by trip vibe
    const day1Theme = isCouple ? "Romantic Exploration & Sunsets" : isFriends ? "High-Energy Adventures & Street Culture" : "Scenic Sightseeing & Traditional Wonders";
    
    // Tailor activities by traveler composition
    const morningTitle = hasKids ? "Magical Local Amusement Theme Park" : isCouple ? "Quiet Botanical Gardens & Scenic Lake Cruise" : "Epic Walking Tour of Ancient Castles";
    const morningDesc = hasKids ? "A thrilling morning designed with interactive rides, magical live performances, and zero waiting queues." : "Stroll through manicured, blossom-scented walking paths followed by a private, relaxing boat tour around the lake.";
    const morningAccessibility = hasSeniors ? "Warning: High altitude stairs at the viewpoint. Rest benches are located every 50 meters." : null;

    const afternoonTitle = isFriends ? "Secret Neighborhood Street Food Safari" : hasKids ? "Fascinating Interactive Science and Space Museum" : "Private Artisanal Cooking Masterclass";
    const afternoonDesc = isFriends ? "Bite into savory local dumplings, grilled skewers, and local sweets guided by a native food expert." : "A hands-on, fascinating learning center filled with kid-friendly exhibits, rocket models, and virtual reality planetarium spheres.";
    const afternoonAccessibility = hasSeniors ? "Note: Strolling across uneven rocky alleyways. Sturdy, comfortable walking shoes are strongly advised." : null;

    const eveningTitle = isCouple ? "Exquisite Candlelit Rooftop Skyline Dinner" : isBudget ? "Chively Local Night Market Crawl" : "Classic Traditional Arts & Performance Theater";
    const eveningDesc = isCouple ? "A breathtaking culinary experience featuring a personalized chef tasting menu overlooking the city's sparkling towers." : "Mingle with locals under vibrant lanterns, sample cheap bites, and shop for unique handcrafted souvenirs.";
    const eveningAccessibility = hasSeniors ? "Note: High sound decibels at this local venue. Ear protection or seating near the back is available." : null;

    // Warnings list
    const warnings = [];
    if (hasSeniors) {
      warnings.push("High heat indexes predicted during afternoon excursions; ensure regular hydration intervals are planned.");
      warnings.push("Cobblestone walkways are prevalent in historic districts; watch out for steep steps without handrail assistance.");
      warnings.push("High altitude warnings for sidetrips; take gradual breaks and avoid abrupt physical workloads.");
    }
    if (hasKids) {
      warnings.push("Ensure sunscreen is applied frequently at open-air parks.");
      warnings.push("Amusement park queues get long after 1 PM; heading there early morning is highly recommended.");
    }
    if (warnings.length === 0) {
      warnings.push("We recommend purchasing transit tickets 24 hours in advance to secure peak-hour seating slots.");
    }

    return {
      tripTitle: `The Ultimate ${payload.vibes.tripType.toUpperCase()} Escape to ${payload.route.primaryDestination}`,
      startingPoint: payload.route.startingPoint,
      primaryDestination: payload.route.primaryDestination,
      additionalDestinations: payload.route.additionalDestinations,
      startDate: payload.dates.startDate || "2026-06-01",
      endDate: payload.dates.endDate || "2026-06-03",
      summary: `A personalized, highly curated journey tailored specifically for a <strong>${payload.vibes.tripType}</strong> setup seeking a <strong>${payload.vibes.budgetTier.replace('_', '-')}</strong> experience. You'll enjoy accommodations at a highly rated ${hotelStyle}, travelling with ${budgetDescription}.`,
      days: [
        {
          dayNumber: 1,
          theme: day1Theme,
          activities: {
            morning: {
              title: morningTitle,
              description: morningDesc,
              accessibilityNote: morningAccessibility
            },
            afternoon: {
              title: afternoonTitle,
              description: afternoonDesc,
              accessibilityNote: afternoonAccessibility
            },
            evening: {
              title: eveningTitle,
              description: eveningDesc,
              accessibilityNote: eveningAccessibility
            }
          }
        }
      ],
      accessibilityWarnings: warnings
    };
  }
}
